// Auth ka business logic: signup, login, refresh, logout, email verification, password reset.
//
// Boundaries: yahan HTTP (req/res) nahi hai (wo controller mein), aur database ki details nahi hain (wo repositories mein).
// Sab dependencies argument se aati hain (database, passwords, tokens, mailer, limiters, config, logger), isliye har cheez
// badli ja sakti hai (jaise mailer -> asli email provider, limiters -> Redis).
//
// Security ke principles jo yahan lagte hain:
//   * Account enumeration nahi: signup/forgot/resend hamesha ek jaisa generic jawab dete hain; login galat email aur galat
//     password par ek hi 401 deta hai (aur unknown email par bhi asli hash jitna time lagta hai).
//   * Tokens (verify/reset/refresh) sirf hash ke roop mein store hote hain, expiring aur single-use (ya rotating).
//   * Emails transaction COMMIT hone ke baad bhejte hain (transaction ke andar external call nahi); mail fail ho to user dobara maang sakta hai.
//   * Logs/audit mein password, hash ya token kabhi nahi: sirf userId aur event ke naam.

import {
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  ValidationError,
} from '../../errors/app-errors.js';
import {
  alreadyRegisteredEmail,
  passwordChangedEmail,
  passwordResetEmail,
  verificationEmail,
} from '../../email/templates.js';
import { generateOpaqueToken, hashToken } from './token-service.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const VERIFICATION_TTL_MS = 24 * HOUR_MS;
const PASSWORD_RESET_TTL_MS = HOUR_MS;

// Ye messages jaan-boojh kar ek jaise hain: response se pata nahi chalta ki email registered tha ya nahi.
const MAIL_ACCEPTED_MESSAGE = 'If the address can receive mail, we have sent instructions to it.';

// Token galat/expired/pehle use hua: sab ek hi jawab (kaaran nahi batate).
const invalidToken = () =>
  new ValidationError('Invalid or expired token', { code: 'INVALID_TOKEN' });
const invalidRefreshToken = () => new AuthenticationError('Invalid or expired refresh token');

// passwordHash ko response/return se hamesha hata do.
function toPublicUser(user) {
  const { passwordHash, ...publicUser } = user; // eslint-disable-line no-unused-vars
  return publicUser;
}

/**
 * @param {object} deps
 * @param {object} deps.database  createDatabase() ka result
 * @param {object} deps.passwords  createPasswordHasher()
 * @param {object} deps.tokens  createTokenService()
 * @param {object} deps.mailer  { send(message) }
 * @param {object} deps.limiters  { loginPair, loginIp, loginEmail, mailEmail, mailIp } (attempt limiters)
 * @param {{ revokeAll: (userId: string) => Promise<number> }} [deps.sessions]  browser sessions ka registry (Redis ho tab); password reset aur
 *        logout-all par user ke saare sessions band karta hai. Redis nahi hai to no-op.
 * @param {object} deps.config  loadConfig() ka result
 * @param {import('pino').Logger} deps.logger
 */
export function createAuthService({
  database,
  passwords,
  tokens,
  mailer,
  limiters,
  config,
  logger,
  sessions = { revokeAll: async () => 0 },
}) {
  const { appBaseUrl, refreshTokenTtlDays } = config.auth;
  const refreshExpiry = () => new Date(Date.now() + refreshTokenTtlDays * DAY_MS);
  const linkTo = (path, token) => `${appBaseUrl}/${path}?token=${encodeURIComponent(token)}`;

  // --- rate limiting hooks: har check [limiter, key] ki jodi hai.
  function assertWithinLimits(checks) {
    for (const [limiter, key] of checks) {
      const result = limiter.check(key);
      if (!result.allowed)
        throw new RateLimitError({ retryAfterSeconds: result.retryAfterSeconds });
    }
  }
  const recordAll = (checks) => checks.forEach(([limiter, key]) => limiter.record(key));
  // Login: (email, ip) jodi 5/15min, ip 30/15min, email (sab ips mila ke) 20/15min. Jodi isliye ki koi doosra kisi ka email
  // bhej-bhej kar usse lock na kar sake; email-global limit distributed guessing ko bhi rokti hai.
  const loginChecks = (email, ip) => [
    [limiters.loginPair, `${email}|${ip}`],
    [limiters.loginIp, ip],
    [limiters.loginEmail, email],
  ];
  // Mail bhejne wale endpoints (signup/forgot/resend): har request gini jaati hai (email spam aur bombing rokne ke liye).
  const mailChecks = (email, ip) => [
    [limiters.mailEmail, email],
    [limiters.mailIp, ip],
  ];

  // Email bhejna fail ho (provider down) to request fail nahi hoti: sirf log. User dobara maang sakta hai.
  async function sendSafely(message) {
    try {
      await mailer.send(message);
    } catch (err) {
      logger.error(
        { template: message.template, errName: err.name, errMessage: err.message },
        'email send failed',
      );
    }
  }

  // Refresh token reuse: purana (rotate ho chuka) token dobara aaya = chori ka sanket. Poori session family band.
  async function handleRefreshReuse(record) {
    const { refreshTokens, audit } = database.repositories;
    await refreshTokens.revokeFamily(record.familyId);
    await audit.record({
      actorId: record.userId,
      action: 'auth.refresh_reuse_detected',
      entityType: 'User',
      entityId: record.userId,
      metadata: { familyId: record.familyId },
    });
    logger.warn({ userId: record.userId }, 'refresh token reuse detected; session family revoked');
  }

  /**
   * Email + password ki jaanch (bina koi token/session banaye). Order: throttle -> credentials -> account status.
   * Status checks credentials SAHI hone ke BAAD hote hain: galat password wale ko "disabled/unverified" ka hint nahi milta.
   * Bearer login (neeche) aur browser session login (src/modules/session) dono yahi use karte hain, isliye rules ek jaise hain.
   * @returns user (passwordHash ke saath: sirf andar ke use ke liye)
   */
  async function checkCredentials({ email, password, ip }) {
    const checks = loginChecks(email, ip);
    assertWithinLimits(checks);

    const user = await database.repositories.users.findAuthByEmail(email);
    // Unknown email par bhi asli verify jitna kaam (timing barabar).
    const valid = user?.passwordHash
      ? await passwords.verify(user.passwordHash, password)
      : await passwords.verifyDummy(password);
    if (!valid) {
      recordAll(checks);
      throw new AuthenticationError('Invalid email or password');
    }

    if (user.status === 'DISABLED') {
      throw new AuthorizationError('Account is disabled', { code: 'ACCOUNT_DISABLED' });
    }
    if (user.status === 'PENDING_VERIFICATION') {
      throw new AuthorizationError('Verify your email before logging in', {
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    // Safal login: is (email, ip) jodi ka counter saaf.
    limiters.loginPair.reset(`${email}|${ip}`);

    // Hash purane/kamzor parameters par bana ho to ab naye par update (best effort: fail ho to login nahi rukta).
    if (passwords.needsRehash(user.passwordHash)) {
      passwords
        .hash(password)
        .then((hash) => database.repositories.users.setPasswordHash(user.id, hash))
        .catch((err) =>
          logger.error({ errName: err.name, errMessage: err.message }, 'password rehash failed'),
        );
    }
    return user;
  }

  return {
    /**
     * Browser session login ke liye: sirf credentials verify karke public user deta hai (koi token nahi banta).
     */
    async verifyCredentials(args) {
      return toPublicUser(await checkCredentials(args));
    },

    /**
     * Signup. Hamesha generic jawab: email naya ho ya pehle se registered. Password hash PEHLE hota hai taaki dono raaston mein
     * (naya/existing) lagbhag same time lage.
     */
    async signup({ email, name, password, ip }) {
      const checks = mailChecks(email, ip);
      assertWithinLimits(checks);
      recordAll(checks);

      const passwordHash = await passwords.hash(password);
      const verification = generateOpaqueToken();

      let created = null;
      try {
        created = await database.transaction(async ({ users, oneTimeTokens, audit }) => {
          const user = await users.create({ email, name, passwordHash });
          await oneTimeTokens.create({
            userId: user.id,
            purpose: 'EMAIL_VERIFICATION',
            tokenHash: verification.hash,
            expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
          });
          await audit.record({
            actorId: user.id,
            action: 'auth.signup',
            entityType: 'User',
            entityId: user.id,
          });
          return user;
        });
      } catch (err) {
        // 11000 = unique index (email) toota: email pehle se registered hai. Chhupate hain, baaki errors upar jaate hain.
        if (err?.code !== 11000) throw err;
      }

      if (created) {
        await sendSafely({
          to: created.email,
          template: 'verification',
          ...verificationEmail({
            name: created.name,
            link: linkTo('verify-email', verification.token),
          }),
        });
      } else {
        const existing = await database.repositories.users.findByEmail(email);
        if (existing && existing.status !== 'DISABLED') {
          await sendSafely({
            to: existing.email,
            template: 'already-registered',
            ...alreadyRegisteredEmail({ name: existing.name }),
          });
        }
      }
      return { message: MAIL_ACCEPTED_MESSAGE };
    },

    /** Email verification token se account ACTIVE banata hai. Token ek hi baar chalta hai. */
    async verifyEmail({ token }) {
      const verified = await database.transaction(async ({ oneTimeTokens, users, audit }) => {
        const record = await oneTimeTokens.consume({
          tokenHash: hashToken(token),
          purpose: 'EMAIL_VERIFICATION',
        });
        if (!record) return false;
        const user = await users.markEmailVerified(record.userId);
        if (!user) return false;
        await audit.record({
          actorId: user.id,
          action: 'auth.email_verified',
          entityType: 'User',
          entityId: user.id,
        });
        return true;
      });
      if (!verified) throw invalidToken();
      return { message: 'Email verified. You can log in now.' };
    },

    /** Verification email dobara. Hamesha generic jawab. */
    async resendVerification({ email, ip }) {
      const checks = mailChecks(email, ip);
      assertWithinLimits(checks);
      recordAll(checks);

      const user = await database.repositories.users.findByEmail(email);
      if (user && user.status === 'PENDING_VERIFICATION') {
        const verification = generateOpaqueToken();
        await database.transaction(async ({ oneTimeTokens }) => {
          await oneTimeTokens.invalidateOutstanding(user.id, 'EMAIL_VERIFICATION');
          await oneTimeTokens.create({
            userId: user.id,
            purpose: 'EMAIL_VERIFICATION',
            tokenHash: verification.hash,
            expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
          });
        });
        await sendSafely({
          to: user.email,
          template: 'verification',
          ...verificationEmail({
            name: user.name,
            link: linkTo('verify-email', verification.token),
          }),
        });
      }
      return { message: MAIL_ACCEPTED_MESSAGE };
    },

    /**
     * Login. Order: throttle -> credentials -> account status -> tokens.
     * Status checks credentials SAHI hone ke BAAD hote hain: galat password wale ko "disabled/unverified" ka hint nahi milta.
     */
    async login({ email, password, ip, userAgent }) {
      const user = await checkCredentials({ email, password, ip });

      const refresh = generateOpaqueToken();
      await database.transaction(async ({ refreshTokens, audit }) => {
        // familyId nahi diya: naya login = nayi session family.
        await refreshTokens.create({
          userId: user.id,
          tokenHash: refresh.hash,
          expiresAt: refreshExpiry(),
          userAgent,
        });
        await audit.record({
          actorId: user.id,
          action: 'auth.login',
          entityType: 'User',
          entityId: user.id,
        });
      });

      return {
        user: toPublicUser(user),
        accessToken: await tokens.signAccessToken({ userId: user.id, role: user.role }),
        refreshToken: refresh.token,
        tokenType: 'Bearer',
        expiresIn: tokens.accessTtlSeconds,
      };
    },

    /**
     * Refresh token rotation: purana token ek baar chalta hai, badle mein naya milta hai (same family).
     * Purana dobara aaya to reuse maana jaata hai aur poori family revoke ho jaati hai.
     */
    async refresh({ refreshToken, userAgent }) {
      const { refreshTokens, users } = database.repositories;
      const record = await refreshTokens.findByHash(hashToken(refreshToken));
      if (!record) throw invalidRefreshToken();

      if (record.revokedAt) {
        // replacedById set = ye token rotate ho chuka tha aur ab dobara use hua: reuse. Sirf logout se revoke hua ho to bas 401.
        if (record.replacedById) await handleRefreshReuse(record);
        throw invalidRefreshToken();
      }
      if (new Date(record.expiresAt) <= new Date()) throw invalidRefreshToken();

      const user = await users.findById(record.userId);
      if (!user || user.status !== 'ACTIVE') {
        await refreshTokens.revokeFamily(record.familyId);
        throw invalidRefreshToken();
      }

      const next = generateOpaqueToken();
      const outcome = await database.transaction(async ({ refreshTokens: repo }) => {
        // Atomic claim: do requests ek hi token ke saath aayein to sirf ek jeetta hai, doosra reuse mana jaata hai.
        const claimed = await repo.claim(record.id);
        if (!claimed) return { reuse: true };
        const created = await repo.create({
          userId: user.id,
          familyId: record.familyId,
          tokenHash: next.hash,
          expiresAt: refreshExpiry(),
          userAgent,
        });
        await repo.linkReplacement(record.id, created.id);
        return { reuse: false };
      });
      if (outcome.reuse) {
        await handleRefreshReuse(record);
        throw invalidRefreshToken();
      }

      return {
        accessToken: await tokens.signAccessToken({ userId: user.id, role: user.role }),
        refreshToken: next.token,
        tokenType: 'Bearer',
        expiresIn: tokens.accessTtlSeconds,
      };
    },

    /** Logout: us refresh token ki poori family revoke. Token galat ho to bhi chupchaap theek (kuch pata nahi chalta). */
    async logout({ refreshToken }) {
      const { refreshTokens, audit } = database.repositories;
      const record = await refreshTokens.findByHash(hashToken(refreshToken));
      if (!record) return;
      await refreshTokens.revokeFamily(record.familyId);
      await audit.record({
        actorId: record.userId,
        action: 'auth.logout',
        entityType: 'User',
        entityId: record.userId,
      });
    },

    /** Sab devices se logout: user ke saare refresh tokens revoke. (Access tokens apni 15 min ki umar tak chalenge.) */
    async logoutAll({ userId }) {
      const { refreshTokens, audit } = database.repositories;
      await refreshTokens.revokeAllForUser(userId);
      await sessions.revokeAll(userId);
      await audit.record({
        actorId: userId,
        action: 'auth.logout_all',
        entityType: 'User',
        entityId: userId,
      });
    },

    /** Access token valid hai, par user ab bhi ACTIVE hai? (database se dekhta hai; stateless token ye nahi jaanta.) */
    async getCurrentUser({ userId }) {
      const user = await database.repositories.users.findById(userId);
      if (!user || user.status !== 'ACTIVE')
        throw new AuthenticationError('Invalid or expired access token');
      return user;
    },

    /** Password reset email. Hamesha generic jawab. DISABLED users ko email nahi jaati. */
    async forgotPassword({ email, ip }) {
      const checks = mailChecks(email, ip);
      assertWithinLimits(checks);
      recordAll(checks);

      const user = await database.repositories.users.findByEmail(email);
      if (user && user.status !== 'DISABLED') {
        const reset = generateOpaqueToken();
        await database.transaction(async ({ oneTimeTokens }) => {
          await oneTimeTokens.invalidateOutstanding(user.id, 'PASSWORD_RESET');
          await oneTimeTokens.create({
            userId: user.id,
            purpose: 'PASSWORD_RESET',
            tokenHash: reset.hash,
            expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
          });
        });
        await sendSafely({
          to: user.email,
          template: 'password-reset',
          ...passwordResetEmail({ name: user.name, link: linkTo('reset-password', reset.token) }),
        });
      }
      return { message: MAIL_ACCEPTED_MESSAGE };
    },

    /**
     * Naya password set (reset token se). Ek transaction mein: token consume, naya hash, saare sessions revoke, baaki reset
     * tokens bekaar. Reset email se aaya hai to mailbox ka control saabit hua: pending user verified bhi ho jaata hai.
     */
    async resetPassword({ token, newPassword }) {
      const passwordHash = await passwords.hash(newPassword);
      const user = await database.transaction(
        async ({ oneTimeTokens, users, refreshTokens, audit }) => {
          const record = await oneTimeTokens.consume({
            tokenHash: hashToken(token),
            purpose: 'PASSWORD_RESET',
          });
          if (!record) return null;
          const target = await users.findById(record.userId);
          if (!target || target.status === 'DISABLED') return null;

          await users.setPasswordHash(target.id, passwordHash);
          if (target.status === 'PENDING_VERIFICATION') await users.markEmailVerified(target.id);
          await refreshTokens.revokeAllForUser(target.id);
          await oneTimeTokens.invalidateOutstanding(target.id, 'PASSWORD_RESET');
          await audit.record({
            actorId: target.id,
            action: 'auth.password_reset',
            entityType: 'User',
            entityId: target.id,
          });
          return target;
        },
      );
      if (!user) throw invalidToken();

      // Password badla: browser sessions bhi band (refresh tokens transaction ke andar hi revoke ho chuke).
      await sessions.revokeAll(user.id);
      await sendSafely({
        to: user.email,
        template: 'password-changed',
        ...passwordChangedEmail({ name: user.name }),
      });
      return { message: 'Password updated. Please log in again.' };
    },
  };
}
