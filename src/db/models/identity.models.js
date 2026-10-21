// Identity se jude collections: users, seller profiles, refresh tokens, one-time tokens.

import { Schema, ref, schemaOptions, SLUG_PATTERN } from './shared.js';
import { ONE_TIME_TOKEN_PURPOSES, ROLES, SELLER_STATUSES, USER_STATUSES } from './enums.js';

export const userSchema = new Schema(
  {
    // Hamesha lowercase + trimmed (setter se). Unique index isi lowercase value par hai, to "A@x.com" aur "a@x.com"
    // do users nahi ban sakte. (Server-side collection validator bhi lowercase maangta hai: direct writes ke liye.)
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    // Sirf password ka hash (argon2/bcrypt). `select: false`: queries mein by default aata hi nahi; login ke liye
    // `.select('+passwordHash')` se explicitly maangna padta hai. OAuth-only users ke liye absent. Plain password kabhi nahi.
    passwordHash: { type: String, select: false },
    role: { type: String, enum: ROLES, default: 'CUSTOMER', required: true },
    status: { type: String, enum: USER_STATUSES, default: 'PENDING_VERIFICATION', required: true },
    emailVerifiedAt: Date,
  },
  schemaOptions({ collection: 'users' }),
);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, status: 1 });

export const sellerProfileSchema = new Schema(
  {
    // Ek user ka ek hi seller profile (unique index).
    userId: ref('User'),
    storeName: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, match: SLUG_PATTERN, maxlength: 60 },
    description: { type: String, maxlength: 2000 },
    status: { type: String, enum: SELLER_STATUSES, default: 'PENDING', required: true },
    approvedAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  schemaOptions({ collection: 'seller_profiles' }),
);
sellerProfileSchema.index({ userId: 1 }, { unique: true });
sellerProfileSchema.index({ storeName: 1 }, { unique: true });
sellerProfileSchema.index({ slug: 1 }, { unique: true });
sellerProfileSchema.index({ status: 1 });

// Refresh-token rotation: har token ek "family" ka hissa hai. Purana token dobara use hua (reuse) to poori family
// revoke hoti hai. Token ki sirf SHA-256 hash store hoti hai. `expiresAt` par TTL index: Mongo expire hone par
// document khud delete kar deta hai (alag cleanup job nahi chahiye).
export const refreshTokenSchema = new Schema(
  {
    userId: ref('User'),
    // Ek login ke saare rotated tokens ka common id (kisi doosre collection ka reference nahi).
    familyId: { type: Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    replacedById: { type: Schema.Types.ObjectId, ref: 'RefreshToken' },
    userAgent: { type: String, maxlength: 255 },
  },
  schemaOptions({
    collection: 'refresh_tokens',
    timestamps: { createdAt: true, updatedAt: false },
  }),
);
refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ userId: 1 });
refreshTokenSchema.index({ familyId: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Email verification / password reset: expiring, single-use. Sirf token ki hash. Expire hone par TTL se auto-delete.
export const oneTimeTokenSchema = new Schema(
  {
    userId: ref('User'),
    purpose: { type: String, enum: ONE_TIME_TOKEN_PURPOSES, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  schemaOptions({
    collection: 'one_time_tokens',
    timestamps: { createdAt: true, updatedAt: false },
  }),
);
oneTimeTokenSchema.index({ tokenHash: 1 }, { unique: true });
oneTimeTokenSchema.index({ userId: 1, purpose: 1 });
oneTimeTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
