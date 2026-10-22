// Order ki state machine: kaunsa status kahan jaa sakta hai, aur kaun (kis "kind" ka actor) use kar sakta hai.
//
// Ye file PURE hai (database/HTTP kuch nahi): sirf rules ka data aur do chhote functions. Isliye rules ek hi jagah padhe/badle jaate
// hain, aur services unhe `assertTransition` se enforce karti hain. (Database-level guard alag hai: orders.repository.js ka `transition`
// `status: from` filter ke saath chalta hai, to race mein bhi sirf ek valid transition jeetta hai.)
//
// Actor "kind" role se nahi, ENDPOINT se tay hota hai (ek seller user bhi customer ban kar apna order cancel karta hai):
//   CUSTOMER : order ka khareedne wala (apne order par)
//   SELLER   : order ka seller (apne order par)
//   ADMIN    : admin endpoint
//   SYSTEM   : server khud (payment ka natija, expire/reconcile). Koi HTTP endpoint SYSTEM kind nahi deta.
//
//   PENDING_PAYMENT --payment ok--> PAID --seller--> PROCESSING --seller--> SHIPPED --seller/admin--> DELIVERED --admin--> REFUNDED
//        |  \--decline--> PAYMENT_FAILED (terminal)       |  \--customer/admin--> CANCELLED      \--admin--> CANCELLED
//        \--system expiry--> CANCELLED (terminal)
//   CANCELLED, PAYMENT_FAILED, REFUNDED terminal hain (yahan se koi transition nahi).

import { AppError } from '../../errors/app-errors.js';

/** from -> to -> jin kinds ko ye edge chalane ki ijazat hai. Jo yahan nahi likha wo allowed nahi (default deny). */
export const ORDER_TRANSITIONS = Object.freeze({
  PENDING_PAYMENT: {
    PAID: ['SYSTEM'],
    PAYMENT_FAILED: ['SYSTEM'],
    CANCELLED: ['SYSTEM'],
  },
  PAID: {
    PROCESSING: ['SELLER', 'ADMIN'],
    CANCELLED: ['CUSTOMER', 'ADMIN'],
  },
  PROCESSING: {
    SHIPPED: ['SELLER', 'ADMIN'],
    CANCELLED: ['ADMIN'],
  },
  SHIPPED: {
    DELIVERED: ['SELLER', 'ADMIN'],
  },
  DELIVERED: {
    REFUNDED: ['ADMIN'],
  },
});

/** Seller ko order sirf paid hone ke baad dikhta hai (PENDING_PAYMENT / PAYMENT_FAILED mein paisa aaya hi nahi). */
export const SELLER_VISIBLE_STATUSES = Object.freeze([
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
]);

/** Ye statuses se customer ka paisa wapas dena baaki rehta hai (attempt SUCCEEDED rehti hai jab tak refund na ho). */
export const REFUND_ON_ENTER = Object.freeze(['CANCELLED', 'REFUNDED']);

/** Kya `from` se `to` ka edge exist karta hai (kind ki parwah kiye bina)? */
export function isKnownTransition(from, to) {
  return Boolean(ORDER_TRANSITIONS[from]?.[to]);
}

/**
 * Transition rule enforce karta hai.
 *   - Edge hi nahi hai (e.g. DELIVERED -> PAID, CANCELLED -> kuch bhi) -> 409 INVALID_ORDER_TRANSITION
 *   - Edge hai par is kind ko ijazat nahi (e.g. seller PAID order cancel kare) -> 403 TRANSITION_NOT_ALLOWED
 * Pehle edge, phir kind: client ko pehle "ye state change hota hi nahi" pata chale, "tum nahi kar sakte" baad mein.
 */
export function assertTransition({ from, to, kind }) {
  const allowedKinds = ORDER_TRANSITIONS[from]?.[to];
  if (!allowedKinds) {
    throw new AppError(`Order cannot move from ${from} to ${to}`, {
      statusCode: 409,
      code: 'INVALID_ORDER_TRANSITION',
      details: [{ path: 'status', message: `${from} -> ${to} is not allowed` }],
    });
  }
  if (!allowedKinds.includes(kind)) {
    throw new AppError(`You are not allowed to move an order from ${from} to ${to}`, {
      statusCode: 403,
      code: 'TRANSITION_NOT_ALLOWED',
    });
  }
}
