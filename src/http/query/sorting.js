// Sorting: user ko sirf pehle se tay kiye hue (allowlisted) fields par sort karne dena.
//
// Security idea: user ka string kabhi seedha database column ban kar nahi jaata. Hum ek allowlist map rakhte hain:
//   { price: 'priceCents', createdAt: 'createdAt' }   // API naam -> database column
// User "price" bhej sakta hai; validation ke baad hamare haath mein 'priceCents' aata hai (map se), user ka string nahi.
// Allowlist mein na ho to request 400 se reject; isliye `sort=password` ya `sort=price;DROP TABLE` kabhi query tak nahi pahunchta.

import { z } from 'zod';

const MAX_SORT_FIELDS = 3;
// API field naam sirf simple identifiers ho sakte hain (allowlist developers likhte hain, par regex mein daalne
// se pehle sanity check, taaki galti se special characters regex ko na tod dein).
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * @param {Record<string, string>} allowed  API field naam -> database column naam (sirf yahi sort ho sakte hain)
 * @returns {import('zod').ZodType} query string `sort=-price,name` ko parse karne wala schema
 *   Output: [{ field: 'price', column: 'priceCents', direction: 'desc' }, ...]
 *
 * Format: comma-separated fields; `-` prefix = descending, bina prefix = ascending. Max 3 fields, duplicates nahi.
 */
export function sortFieldSchema(allowed) {
  const names = Object.keys(allowed);
  if (names.length === 0 || !names.every((name) => IDENTIFIER.test(name))) {
    throw new Error('sort allowlist must be a non-empty map of simple field names');
  }
  const token = `-?(?:${names.join('|')})`;
  // Regex hi allowlist ka check hai: pattern mein sirf allowed naam hain, isliye OpenAPI docs mein bhi
  // wahi pattern dikhta hai (validation aur documentation ek hi jagah se).
  const pattern = new RegExp(`^${token}(?:,${token}){0,${MAX_SORT_FIELDS - 1}}$`);

  return z
    .string()
    .regex(
      pattern,
      `must be a comma-separated list (max ${MAX_SORT_FIELDS}) of: ${names.join(', ')} (prefix - for descending)`,
    )
    .transform((value, ctx) => {
      const parsed = value.split(',').map((part) => {
        const descending = part.startsWith('-');
        const field = descending ? part.slice(1) : part;
        // Regex ne pehle hi pakka kar diya hai ki `field` allowlist ka hi naam hai ('constructor', '__proto__' jaise
        // naam regex mein hain hi nahi), isliye `allowed[field]` hamesha developer ka tay kiya hua column deta hai.
        return { field, column: allowed[field], direction: descending ? 'desc' : 'asc' };
      });
      if (new Set(parsed.map((p) => p.field)).size !== parsed.length) {
        ctx.addIssue({ code: 'custom', message: 'each sort field may appear only once' });
        return z.NEVER;
      }
      return parsed;
    })
    .meta({
      description: `Comma-separated sort fields, prefix - for descending. Allowed: ${names.join(', ')}`,
      example: `-${names[0]}`,
    });
}

/** Default sort string (e.g. '-createdAt') ko wahi parse logic se list mein badalta hai. */
export function parseSort(allowed, value) {
  return sortFieldSchema(allowed).parse(value);
}
