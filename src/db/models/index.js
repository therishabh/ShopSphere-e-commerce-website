// Saare models ek connection par register karta hai.
//
// Models per-connection bante hain (global `mongoose.model()` nahi): isse ek process mein alag connections (app, scripts,
// future labs) apne models rakh sakte hain aur app ko dependency injection se connection mil jaata hai.

import {
  categorySchema,
  productSchema,
  reviewSchema,
  wishlistItemSchema,
} from './catalog.models.js';
import { cartSchema, counterSchema, orderSchema, paymentAttemptSchema } from './commerce.models.js';
import {
  oneTimeTokenSchema,
  refreshTokenSchema,
  sellerProfileSchema,
  userSchema,
} from './identity.models.js';
import {
  auditEventSchema,
  idempotencyRecordSchema,
  outboxEventSchema,
} from './reliability.models.js';

export function registerModels(connection) {
  return {
    User: connection.model('User', userSchema),
    SellerProfile: connection.model('SellerProfile', sellerProfileSchema),
    RefreshToken: connection.model('RefreshToken', refreshTokenSchema),
    OneTimeToken: connection.model('OneTimeToken', oneTimeTokenSchema),
    Category: connection.model('Category', categorySchema),
    Product: connection.model('Product', productSchema),
    Review: connection.model('Review', reviewSchema),
    WishlistItem: connection.model('WishlistItem', wishlistItemSchema),
    Cart: connection.model('Cart', cartSchema),
    Order: connection.model('Order', orderSchema),
    PaymentAttempt: connection.model('PaymentAttempt', paymentAttemptSchema),
    Counter: connection.model('Counter', counterSchema),
    AuditEvent: connection.model('AuditEvent', auditEventSchema),
    IdempotencyRecord: connection.model('IdempotencyRecord', idempotencyRecordSchema),
    OutboxEvent: connection.model('OutboxEvent', outboxEventSchema),
  };
}
