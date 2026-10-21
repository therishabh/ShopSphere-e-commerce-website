// Models ke beech shared helpers: common schema options aur chhote field builders.

import mongoose from 'mongoose';

const { Schema } = mongoose;

// JSON mein jaate waqt: `_id` ko `id` (string) bana do aur `__v` (internal version key) chhupa do.
// Is se API/logs mein kabhi Mongo ke internal field naam nahi jaate.
function toJsonTransform(_doc, ret) {
  ret.id = String(ret._id);
  delete ret._id;
  delete ret.__v;
  return ret;
}

/**
 * Har schema ke common options.
 *  - strict: 'throw'  -> schema mein na likha hua field save karne par error (silently drop nahi). Typos pakde jaate hain.
 *  - timestamps       -> createdAt/updatedAt apne aap.
 *  - toJSON           -> upar wala transform.
 * `extra` se collection ka naam wagairah.
 */
export function schemaOptions(extra = {}) {
  return { strict: 'throw', timestamps: true, toJSON: { transform: toJsonTransform }, ...extra };
}

/** Doosre collection ke document ka ObjectId reference. Mongo mein foreign key nahi hota: ye sirf ek id hai. */
export function ref(model, extra = {}) {
  return { type: Schema.Types.ObjectId, ref: model, required: true, ...extra };
}

/** Integer field (decimal nahi chalega). Paisa hamesha integer minor units mein (float se rounding galtiyan hoti hain). */
export function integer({ min, max, required = true, default: defaultValue } = {}) {
  return {
    type: Number,
    required,
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(defaultValue !== undefined ? { default: defaultValue } : {}),
    validate: { validator: Number.isInteger, message: '{PATH} must be an integer' },
  };
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_PRICE_CENTS = 100_000_000;

export { Schema };
