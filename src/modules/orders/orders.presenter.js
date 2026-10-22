// Order ke response shapes (allowlist): database document mein jo cheezein customer/seller ko nahi dikhni chahiye wo yahin se bahar
// nahi jaatin (providerReference, internal ids, __v ...). Naya internal field jud jaye to apne aap response mein nahi aata.
import { REFUND_ON_ENTER } from './order-state.js';

const toItem = (item) => ({
  productId: String(item.productId),
  name: item.productName,
  sku: item.sku,
  unitPriceCents: item.unitPriceCents,
  quantity: item.quantity,
  lineTotalCents: item.lineTotalCents,
});

function toBase(order) {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    currency: order.currency,
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    taxCents: order.taxCents,
    totalCents: order.totalCents,
    shippingAddress: order.shippingAddress,
    items: order.items.map(toItem),
    createdAt: order.createdAt,
    statusChangedAt: order.statusChangedAt,
  };
}

// Payment ka summary: attempt ka status (PENDING/SUCCEEDED/FAILED/REFUNDED). `refundPending` = order cancel/refund ho chuka par
// provider se paisa abhi wapas nahi hua (reconcile use dobara try karta hai).
function toPayment(order, attempt) {
  if (!attempt) return null;
  return {
    status: attempt.status,
    ...(attempt.failureCode ? { failureCode: attempt.failureCode } : {}),
    refundPending: REFUND_ON_ENTER.includes(order.status) && attempt.status === 'SUCCEEDED',
  };
}

// Audit events se timeline: sirf kya hua, kab, kaun sa status. Actor ki id/metadata ke baaki hisse bahar nahi jaate.
const toHistory = (events) =>
  events.map((event) => ({
    action: event.action,
    at: event.createdAt,
    ...(event.metadata?.from ? { from: event.metadata.from } : {}),
    ...(event.metadata?.to ? { to: event.metadata.to } : {}),
  }));

/** Customer ka apna order. */
export function toOrder(order, attempt, history) {
  return {
    ...toBase(order),
    checkoutId: order.checkoutId,
    payment: toPayment(order, attempt),
    ...(history ? { history: toHistory(history) } : {}),
  };
}

/** Admin ko customer/seller ki ids bhi dikhti hain. */
export function toAdminOrder(order, attempt, history) {
  return {
    ...toOrder(order, attempt, history),
    userId: String(order.userId),
    sellerId: String(order.sellerId),
  };
}

/**
 * Seller ka view: items + shipping address (bhejne ke liye zaruri) + totals. Customer ki id/email, checkout aur payment ki jaankari
 * nahi: seller ko sirf fulfilment ke liye jo chahiye.
 */
export function toSellerOrder(order) {
  return toBase(order);
}
