// Audit trail ka data access (append-only: sirf likhna, kabhi update/delete nahi).

import { serialize } from '../serialize.js';

// metadata mein ye keys aayi to likhne se pehle hi reject: audit log mein secrets nahi jaane chahiye.
const FORBIDDEN_KEYS = [
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'authorization',
  'cookie',
];

// Nested objects/arrays mein bhi dhundta hai.
function findForbiddenKey(value) {
  if (!value || typeof value !== 'object') return null;
  for (const [key, inner] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(key.toLowerCase())) return key;
    const nested = findForbiddenKey(inner);
    if (nested) return nested;
  }
  return null;
}

export function createAuditRepository({ AuditEvent }) {
  return {
    /** Admin ke liye audit trail: filters (entityType, entityId, action, actorId), sort, pagination. */
    async list(query) {
      const filter = {};
      for (const key of ['entityType', 'entityId', 'action', 'actorId']) {
        if (query.filters[key] !== undefined) filter[key] = query.filters[key];
      }
      const sort = Object.fromEntries([
        ...query.sort.map((s) => [s.column, s.direction === 'asc' ? 1 : -1]),
        ['_id', 1],
      ]);
      const [rows, total] = await Promise.all([
        AuditEvent.find(filter).sort(sort).skip(query.offset).limit(query.limit).lean(),
        AuditEvent.countDocuments(filter),
      ]);
      return { items: rows.map((row) => serialize(row)), total };
    },

    /**
     * @param {object} event
     * @param {string|null} event.actorId  kisne kiya (system action ho to null)
     * @param {string} event.action  e.g. 'seller.approved'
     * @param {string} event.entityType  e.g. 'SellerProfile'
     * @param {string} [event.entityId]
     * @param {object} [event.metadata]  extra context; secrets nahi
     * @param {string} [event.requestId]  res.locals.requestId se, taaki logs se jod sake
     */
    async record({ actorId, action, entityType, entityId, metadata, requestId }) {
      const forbidden = findForbiddenKey(metadata);
      if (forbidden) {
        // Programming error: developer ne secret-jaisi key daal di. Throw karte hain (500) taaki development mein hi pakda jaye.
        throw new Error(`audit metadata must not contain secret-like key "${forbidden}"`);
      }
      const [event] = await AuditEvent.create([
        { actorId, action, entityType, entityId, metadata, requestId },
      ]);
      return serialize(event);
    },
  };
}
