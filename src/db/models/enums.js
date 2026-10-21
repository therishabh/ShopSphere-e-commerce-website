// Saare status/role enums ek jagah (Mongoose schemas aur baaki app dono yahi use karte hain).
// Kyun enums: galat spelling ('actve') schema validation par hi reject ho jaati hai, aur transitions ke rules
// (Phase 10) in naamon par likhe jaate hain.

export const ROLES = Object.freeze(['CUSTOMER', 'SELLER', 'ADMIN']);
export const USER_STATUSES = Object.freeze(['PENDING_VERIFICATION', 'ACTIVE', 'DISABLED']);
export const SELLER_STATUSES = Object.freeze(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']);
// ON_HOLD (Phase 9): seller suspend hone par uske ACTIVE products yahan jaate hain (public catalog se hat jaate hain) aur seller
// reinstate hone par wapas ACTIVE. Alag status isliye ki public query sirf `status: 'ACTIVE'` dekhe (index-friendly), seller ki
// state se join na karni pade.
export const PRODUCT_STATUSES = Object.freeze([
  'DRAFT',
  'PENDING_REVIEW',
  'ACTIVE',
  'REJECTED',
  'ARCHIVED',
  'ON_HOLD',
]);
export const CURRENCIES = Object.freeze(['INR', 'USD', 'EUR']);
export const CART_STATUSES = Object.freeze(['ACTIVE', 'CHECKED_OUT', 'ABANDONED']);
export const ORDER_STATUSES = Object.freeze([
  'PENDING_PAYMENT',
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'PAYMENT_FAILED',
  'REFUNDED',
]);
export const PAYMENT_ATTEMPT_STATUSES = Object.freeze(['PENDING', 'SUCCEEDED', 'FAILED']);
export const ONE_TIME_TOKEN_PURPOSES = Object.freeze(['EMAIL_VERIFICATION', 'PASSWORD_RESET']);
export const IDEMPOTENCY_STATUSES = Object.freeze(['IN_PROGRESS', 'COMPLETED']);
export const OUTBOX_STATUSES = Object.freeze(['PENDING', 'PROCESSING', 'SENT', 'FAILED']);
