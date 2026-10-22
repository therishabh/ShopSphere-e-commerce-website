// Orders ke request schemas. Sab strict: body mein items/prices/totals/userId jaisi koi bhi key 400 deti hai. Checkout ka body sirf
// "kahan bhejna hai" aur "kaise pay karna hai" batata hai; kya kharida (cart) aur kitne ka (price) server khud nikalta hai.
import { z } from 'zod';
import { buildListQuerySchema } from '../../http/query/list-query.js';
import { objectId } from '../../http/query/fields.js';
import { ORDER_STATUSES } from '../../db/models/enums.js';
import { MOCK_TOKENS } from '../../payments/mock-payment-provider.js';

export const orderIdParams = z.strictObject({ orderId: objectId() });

// Shipping address: order mein snapshot ban kar jaata hai. Fields commerce.models.js ke addressSchema jaise.
const shippingAddress = z.strictObject({
  name: z.string().trim().min(1).max(100),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().min(1).max(20),
  // ISO 3166-1 alpha-2 (IN, US...): do capital letters.
  country: z.string().regex(/^[A-Z]{2}$/, 'must be a 2-letter uppercase country code'),
});

export const checkoutBody = z.strictObject({
  shippingAddress,
  // Mock provider ka opaque test token (real card data NAHI). Default: safal payment.
  paymentToken: z.enum(MOCK_TOKENS).default('tok_mock_success'),
});

// Customer/admin/seller list queries: Phase 5 ka shared builder (strict allowlists).
const orderListOptions = {
  sortable: { createdAt: 'createdAt', total: 'totalCents' },
  defaultSort: '-createdAt',
  filters: { status: z.enum(ORDER_STATUSES) },
};
export const orderListQuery = buildListQuerySchema(orderListOptions);

// Seller kuch statuses par hi kaam karta hai (PAID ke baad ka fulfilment); baaki edges services/order-state.js se.
export const sellerStatusBody = z.strictObject({
  status: z.enum(['PROCESSING', 'SHIPPED', 'DELIVERED']),
});

// Admin ke paas zyada: cancel/refund bhi. PAID / PAYMENT_FAILED / PENDING_PAYMENT API se set nahi ho sakte (sirf payment natija).
export const adminStatusBody = z.strictObject({
  status: z.enum(['PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
  reason: z.string().trim().min(3).max(500).optional(),
});

// Reconcile: "itne minute se zyada PENDING_PAYMENT" wale orders expire karo (default 15).
export const reconcileBody = z.strictObject({
  olderThanMinutes: z.number().int().min(1).max(1440).optional(),
});
