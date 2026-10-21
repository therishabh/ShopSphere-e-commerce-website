// Query string ke chhote reusable field schemas (building blocks).
//
// Zaruri background: URL query ki saari values *strings* hoti hain ("?page=2" mein page = "2").
// Isliye yahan har field pehle string ke roop mein strictly check hota hai (regex), phir sahi type mein convert.
// Hum `z.coerce.number()` jaan-boojh kar use nahi karte: wo "", " 5 ", "1e3", null jaisi values ko bhi chupchaap
// number bana deta hai. Ye helpers sirf saaf, expected format accept karte hain.
// Ek aur fayda: input side ek asli string schema hai, isliye OpenAPI docs mein sahi dikhta hai.

import { z } from 'zod';

/** Non-negative integer string ("0", "25") -> number, [min, max] ke andar. Leading zeros/signs/decimals reject. */
export function intString({ min, max, description }) {
  return z
    .string()
    .regex(/^\d{1,15}$/, 'must be a whole number')
    .transform(Number)
    .pipe(z.number().int().min(min).max(max))
    .meta({ description: description ?? `Integer between ${min} and ${max}` });
}

/**
 * "true" / "false" string -> boolean. `z.coerce.boolean()` use nahi karte kyunki wo "false" ko bhi true bana deta hai
 * (non-empty string truthy hota hai).
 */
export function booleanString() {
  return z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .meta({ description: 'true or false' });
}

/** Free-text search term: trim, 1..max chars, control characters (newline, null...) allowed nahi. */
export function searchTerm({ max = 100 } = {}) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\p{Cc}]+$/u, 'must not contain control characters')
    .meta({ description: `Search text, 1 to ${max} characters` });
}

/** URL-safe slug (lowercase letters, digits, single hyphens), e.g. "home-decor". */
export function slug({ max = 60 } = {}) {
  return z
    .string()
    .max(max)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase slug like "home-decor"')
    .meta({ description: 'Lowercase slug, e.g. home-decor' });
}
