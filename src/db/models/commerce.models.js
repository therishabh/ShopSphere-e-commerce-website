// Commerce se jude collections: carts, orders, payment attempts, counters.
//
// Design choice (embedding vs referencing):
//  - Cart items cart ke andar embedded (cart ke bina unka matlab nahi, aur hamesha saath padhe jaate hain).
//  - Order items order ke andar embedded SNAPSHOT: naam, sku, price copy hote hain, taaki product baad mein badle ya
//    archive ho to bhi purana order sahi dikhe. Seller ke orders `items.sellerId` multikey index se milte hain.
//  - Payment attempts alag collection: ek order ki kai attempts ho sakti hain aur webhooks unhe alag se update karte hain.

import { Schema, integer, ref, schemaOptions } from './shared.js';
import { CART_STATUSES, CURRENCIES, ORDER_STATUSES, PAYMENT_ATTEMPT_STATUSES } from './enums.js';

const cartItemSchema = new Schema(
  {
    productId: ref('Product'),
    quantity: integer({ min: 1, max: 100 }),
  },
  { _id: false, strict: 'throw' },
);

export const cartSchema = new Schema(
  {
    userId: ref('User'),
    status: { type: String, enum: CART_STATUSES, default: 'ACTIVE', required: true },
    // Price yahan store nahi hota: checkout par server hamesha current price se recalculate karta hai.
    items: { type: [cartItemSchema], default: [] },
  },
  schemaOptions({ collection: 'carts' }),
);
// Cart mein ek product ek hi item: embedded array par database-level unique nahi ban sakta, isliye save par check
// (aur Phase 10 mein add-to-cart conditional update se hoga).
cartSchema.pre('validate', function checkUniqueProducts() {
  const ids = this.items.map((item) => String(item.productId));
  if (new Set(ids).size !== ids.length)
    this.invalidate('items', 'a product may appear only once in a cart');
});
// "Ek user ka sirf ek ACTIVE cart": partial unique index (sirf ACTIVE documents par lagta hai).
cartSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' } });
cartSchema.index({ userId: 1, status: 1 });

const orderItemSchema = new Schema(
  {
    productId: ref('Product'),
    sellerId: ref('SellerProfile'),
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    unitPriceCents: integer({ min: 0 }),
    quantity: integer({ min: 1 }),
    lineTotalCents: integer({ min: 0 }),
  },
  { _id: false, strict: 'throw' },
);

const addressSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 100 },
    line1: { type: String, required: true, maxlength: 200 },
    line2: { type: String, maxlength: 200 },
    city: { type: String, required: true, maxlength: 100 },
    state: { type: String, maxlength: 100 },
    postalCode: { type: String, required: true, maxlength: 20 },
    country: { type: String, required: true, minlength: 2, maxlength: 2 },
  },
  { _id: false, strict: 'throw' },
);

export const orderSchema = new Schema(
  {
    // Insaan ke padhne layak order number (support/invoice ke liye); `_id` internal rehta hai. `counters` se aata hai.
    number: integer({ min: 1 }),
    userId: ref('User'),
    status: { type: String, enum: ORDER_STATUSES, default: 'PENDING_PAYMENT', required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    subtotalCents: integer({ min: 0 }),
    shippingCents: integer({ min: 0, default: 0 }),
    taxCents: integer({ min: 0, default: 0 }),
    totalCents: integer({ min: 0 }),
    // Order ke waqt ka address snapshot (user baad mein address badle to purane orders na badlein).
    shippingAddress: { type: addressSchema, required: true },
    items: {
      type: [orderItemSchema],
      validate: {
        validator: (items) => items.length > 0,
        message: 'an order needs at least one item',
      },
    },
  },
  schemaOptions({ collection: 'orders' }),
);
// Amounts ka hisaab mel khana chahiye. (Server-side collection validator bhi totals ko enforce karta hai.)
orderSchema.pre('validate', function checkTotals() {
  const lines = this.items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  if (this.items.some((item) => item.lineTotalCents !== item.unitPriceCents * item.quantity)) {
    this.invalidate('items', 'lineTotalCents must equal unitPriceCents * quantity');
  }
  if (this.subtotalCents !== lines)
    this.invalidate('subtotalCents', 'subtotalCents must equal the sum of line totals');
  if (this.totalCents !== this.subtotalCents + this.shippingCents + this.taxCents) {
    this.invalidate('totalCents', 'totalCents must equal subtotal + shipping + tax');
  }
});
orderSchema.index({ number: 1 }, { unique: true });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
// Seller ke orders: multikey index (array ke har element ka sellerId index hota hai).
orderSchema.index({ 'items.sellerId': 1, createdAt: -1 });

// Payment ki koshish ka record. Mock provider ke saath bhi wahi shape. Card number/CVV KABHI nahi; sirf provider ka
// reference aur status.
export const paymentAttemptSchema = new Schema(
  {
    orderId: ref('Order'),
    provider: { type: String, required: true, default: 'mock' },
    providerReference: String,
    status: { type: String, enum: PAYMENT_ATTEMPT_STATUSES, default: 'PENDING', required: true },
    amountCents: integer({ min: 1 }),
    currency: { type: String, enum: CURRENCIES, required: true },
    failureCode: String,
  },
  schemaOptions({ collection: 'payment_attempts' }),
);
// Provider ka same reference do attempts mein nahi aa sakta (webhook dedupe). Partial index: jin attempts ka reference abhi
// nahi mila (pending) unko ignore karta hai, warna do pending attempts "null" par takrate.
paymentAttemptSchema.index(
  { provider: 1, providerReference: 1 },
  { unique: true, partialFilterExpression: { providerReference: { $type: 'string' } } },
);
paymentAttemptSchema.index({ orderId: 1, createdAt: -1 });

// Sequence generator (order numbers jaise): { _id: 'order', seq: 41 }. `findOneAndUpdate({ $inc })` atomic hai.
export const counterSchema = new Schema(
  { _id: { type: String, required: true }, seq: { type: Number, required: true, default: 0 } },
  { collection: 'counters', versionKey: false, strict: 'throw' },
);
