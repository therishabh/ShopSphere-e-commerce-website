// Tokens: (1) access token = signed JWT, (2) refresh/verification/reset token = random opaque string.
//
// Do alag tarah ke tokens kyun:
//   - Access token JWT hai (`jsonwebtoken` library): server database dekhe bina signature se verify kar leta hai (fast,
//     stateless). Chhoti umar (15 min), kyunki ise revoke nahi kar sakte.
//   - Baaki tokens (refresh, email verify, password reset) random bytes hain jo database mein sirf SHA-256 hash ke roop mein
//     rakhe jaate hain. Database leak hone par hash se token wapas nahi banta, to attacker unhe use nahi kar sakta.
//     (Ye tokens 256-bit random hain, isliye tez SHA-256 kaafi hai; slow hash sirf kam-entropy passwords ke liye chahiye.)

import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

const ISSUER = 'shopsphere';
const AUDIENCE = 'shopsphere-api';
// Sirf HS256 allowed. Verify mein algorithm fix karna zaruri hai: warna attacker header mein `alg: none` ya doosra algorithm
// likhkar signature bypass kar sakta hai ("algorithm confusion"). Verified: HS384/HS512 aur alg=none tokens reject hote hain.
const ALGORITHM = 'HS256';

/** Random opaque token ke saath uski SHA-256 hash. Token client ko jata hai, sirf hash database mein. */
export function generateOpaqueToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

/** Client se aaye token ko database ki hash se match karne ke liye hash karta hai. */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * @param {object} options
 * @param {string} options.secret  AUTH_JWT_SECRET (>= 32 chars)
 * @param {number} options.accessTtlSeconds
 */
export function createTokenService({ secret, accessTtlSeconds }) {
  return {
    accessTtlSeconds,

    /**
     * Access token banata hai (sync, string return). Payload mein sirf zaruri cheezein: user id (sub), role. Email/naam/hash
     * kabhi nahi. `iat` library khud lagati hai; `expiresIn` number ho to seconds hota hai.
     */
    signAccessToken({ userId, role }) {
      return jwt.sign({ role }, secret, {
        algorithm: ALGORITHM,
        subject: userId,
        issuer: ISSUER,
        audience: AUDIENCE,
        expiresIn: accessTtlSeconds,
        jwtid: randomBytes(12).toString('hex'),
      });
    },

    /**
     * Access token verify karta hai: signature, expiry, issuer, audience, algorithm. Galat/expired token par jsonwebtoken ka
     * error throw hota hai (TokenExpiredError, JsonWebTokenError...).
     * @returns {{ userId: string, role: string }}
     */
    verifyAccessToken(token) {
      const payload = jwt.verify(token, secret, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      // jsonwebtoken bina `exp` wale token ko bhi accept kar leta hai (verify kiya: wo kabhi expire nahi hota). Hum sirf apne
      // signed tokens maante hain, jinme exp/sub/role hamesha hote hain; kuch bhi kam ho to reject.
      if (
        typeof payload.exp !== 'number' ||
        typeof payload.sub !== 'string' ||
        typeof payload.role !== 'string'
      ) {
        throw new jwt.JsonWebTokenError('access token is missing required claims');
      }
      return { userId: payload.sub, role: payload.role };
    },
  };
}
