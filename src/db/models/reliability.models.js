// Reliability/audit collections: audit events, idempotency records, transactional outbox.

import { Schema, ref, schemaOptions } from './shared.js';
import { IDEMPOTENCY_STATUSES, OUTBOX_STATUSES } from './enums.js';

// Append-only audit trail. metadata mein secrets/passwords/tokens kabhi nahi (audit repository isse rokta hai).
export const auditEventSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true, maxlength: 100 },
    entityType: { type: String, required: true, maxlength: 50 },
    entityId: String,
    metadata: Schema.Types.Mixed,
    requestId: String,
  },
  schemaOptions({ collection: 'audit_events', timestamps: { createdAt: true, updatedAt: false } }),
);
auditEventSchema.index({ entityType: 1, entityId: 1 });
auditEventSchema.index({ actorId: 1, createdAt: -1 });
auditEventSchema.index({ createdAt: -1 });

// Client retry par duplicate kaam rokne ke liye (e.g. order create). (user, scope, key) unique hai.
// requestHash: same key ke saath alag body aaye to pata chal jaye (misuse). `expiresAt` par TTL: purane records khud delete.
export const idempotencyRecordSchema = new Schema(
  {
    userId: ref('User'),
    scope: { type: String, required: true, maxlength: 100 },
    key: { type: String, required: true, maxlength: 255 },
    requestHash: { type: String, required: true },
    status: { type: String, enum: IDEMPOTENCY_STATUSES, default: 'IN_PROGRESS', required: true },
    responseStatus: Number,
    responseBody: Schema.Types.Mixed,
    expiresAt: { type: Date, required: true },
  },
  schemaOptions({
    collection: 'idempotency_records',
    timestamps: { createdAt: true, updatedAt: false },
  }),
);
idempotencyRecordSchema.index({ userId: 1, scope: 1, key: 1 }, { unique: true });
idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Transactional outbox: business change aur "baad mein ye kaam karna hai" ek hi transaction mein likhe jate hain; worker
// (Phase 14) inhe uthakar bhejta hai. Isse "DB commit hua par email/event kho gaya" nahi hota.
export const outboxEventSchema = new Schema(
  {
    type: { type: String, required: true, maxlength: 100 },
    aggregateType: { type: String, required: true, maxlength: 50 },
    aggregateId: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: OUTBOX_STATUSES, default: 'PENDING', required: true },
    attempts: { type: Number, default: 0, min: 0 },
    availableAt: { type: Date, default: () => new Date(), required: true },
    lastError: String,
    processedAt: Date,
  },
  schemaOptions({ collection: 'outbox_events', timestamps: { createdAt: true, updatedAt: false } }),
);
// Worker sirf PENDING/FAILED rows dekhta hai: partial index SENT rows ko index mein rakhta hi nahi (chhota aur tez).
outboxEventSchema.index(
  { availableAt: 1 },
  { partialFilterExpression: { status: { $in: ['PENDING', 'FAILED'] } } },
);
outboxEventSchema.index({ aggregateType: 1, aggregateId: 1 });
