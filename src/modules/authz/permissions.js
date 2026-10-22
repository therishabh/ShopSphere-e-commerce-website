// Authorization ka data: kaunsa role kaunsi permission rakhta hai.
//
// Authentication aur authorization alag hain:
//   - Authentication (Phase 7): "aap kaun ho?"  -> access token / session se user pehchana.
//   - Authorization (yahan): "aap ye kar sakte ho?" -> role ki permission + (kuch cases mein) resource ki ownership.
//
// RBAC vs permission checks: role sirf permissions ka group hai. Code kabhi `if (role === 'ADMIN')` nahi likhta; wo
// `requirePermission('admin:seller:review')` likhta hai. Naya role/permission yahan ek jagah jodte hain, routes nahi badalte.
//
// Dhyaan: ek permission "kya ye role ye KAAM kar sakta hai" batati hai, "kis resource par" nahi. `:own` wali permissions
// ke saath ownership check (kya ye product is seller ka hai?) service mein alag se hota hai (ownership.js). Permission
// hone ka matlab ye nahi ki doosre seller ka product chhoo sakte ho.

export const PERMISSIONS = Object.freeze({
  SELLER_APPLY: 'seller:apply',
  SELLER_READ_OWN: 'seller:read:own',
  PRODUCT_CREATE: 'product:create',
  PRODUCT_UPDATE_OWN: 'product:update:own',
  PRODUCT_SUBMIT_OWN: 'product:submit:own',
  INVENTORY_UPDATE_OWN: 'inventory:update:own',
  // Phase 9
  PRODUCT_READ_OWN: 'product:read:own',
  PRODUCT_ARCHIVE_OWN: 'product:archive:own',
  REVIEW_CREATE: 'review:create',
  REVIEW_UPDATE_OWN: 'review:update:own',
  REVIEW_DELETE_OWN: 'review:delete:own',
  WISHLIST_MANAGE_OWN: 'wishlist:manage:own',
  ADMIN_CATEGORY_MANAGE: 'admin:category:manage',
  ADMIN_REVIEW_MODERATE: 'admin:review:moderate',
  ADMIN_SELLER_REVIEW: 'admin:seller:review',
  ADMIN_PRODUCT_MODERATE: 'admin:product:moderate',
  ADMIN_AUDIT_READ: 'admin:audit:read',
  // Phase 10: cart, orders, seller fulfilment, admin order desk
  CART_MANAGE_OWN: 'cart:manage:own',
  ORDER_CREATE: 'order:create',
  ORDER_READ_OWN: 'order:read:own',
  ORDER_CANCEL_OWN: 'order:cancel:own',
  SELLER_ORDER_READ_OWN: 'seller:order:read:own',
  SELLER_ORDER_FULFIL: 'seller:order:fulfil',
  ADMIN_ORDER_READ: 'admin:order:read',
  ADMIN_ORDER_MANAGE: 'admin:order:manage',
});

// Explicit allow-list: jo yahan nahi likha wo allowed nahi (default deny).
// CUSTOMER seller banne ke liye apply kar sakta hai; approval ke baad role SELLER ho jaata hai (apply wali permission chali jaati hai).
// ADMIN ke paas customer/seller ki permissions nahi: admin kaam alag hain, aur "admin seller ke product badal sake" galti se na ho.
const ROLE_PERMISSIONS = Object.freeze({
  CUSTOMER: [
    PERMISSIONS.SELLER_APPLY,
    PERMISSIONS.SELLER_READ_OWN,
    PERMISSIONS.REVIEW_CREATE,
    PERMISSIONS.REVIEW_UPDATE_OWN,
    PERMISSIONS.REVIEW_DELETE_OWN,
    PERMISSIONS.WISHLIST_MANAGE_OWN,
    // Khareedari (Phase 10): seller bhi khareed sakta hai (apna product nahi: cart/checkout mein rok hai).
    PERMISSIONS.CART_MANAGE_OWN,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_READ_OWN,
    PERMISSIONS.ORDER_CANCEL_OWN,
  ],
  SELLER: [
    PERMISSIONS.SELLER_READ_OWN,
    PERMISSIONS.PRODUCT_CREATE,
    PERMISSIONS.PRODUCT_UPDATE_OWN,
    PERMISSIONS.PRODUCT_SUBMIT_OWN,
    PERMISSIONS.INVENTORY_UPDATE_OWN,
    PERMISSIONS.PRODUCT_READ_OWN,
    PERMISSIONS.PRODUCT_ARCHIVE_OWN,
    // Seller bhi doosre sellers ke products par review likh aur wishlist bana sakta hai (apne product par nahi: reviews.service).
    PERMISSIONS.REVIEW_CREATE,
    PERMISSIONS.REVIEW_UPDATE_OWN,
    PERMISSIONS.REVIEW_DELETE_OWN,
    PERMISSIONS.WISHLIST_MANAGE_OWN,
    // Khareedari (Phase 10): seller bhi khareed sakta hai (apna product nahi: cart/checkout mein rok hai).
    PERMISSIONS.CART_MANAGE_OWN,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_READ_OWN,
    PERMISSIONS.ORDER_CANCEL_OWN,
    // Seller ke orders dekhna aur ship karna (sirf apne orders: ownership service mein, query mein sellerId filter).
    PERMISSIONS.SELLER_ORDER_READ_OWN,
    PERMISSIONS.SELLER_ORDER_FULFIL,
  ],
  ADMIN: [
    PERMISSIONS.ADMIN_SELLER_REVIEW,
    PERMISSIONS.ADMIN_PRODUCT_MODERATE,
    PERMISSIONS.ADMIN_AUDIT_READ,
    PERMISSIONS.ADMIN_CATEGORY_MANAGE,
    PERMISSIONS.ADMIN_REVIEW_MODERATE,
    PERMISSIONS.ADMIN_ORDER_READ,
    PERMISSIONS.ADMIN_ORDER_MANAGE,
  ],
});

/** Kya is role ke paas ye permission hai? Unknown role/permission par false (default deny). */
export function can(role, permission) {
  return Object.hasOwn(ROLE_PERMISSIONS, role) && ROLE_PERMISSIONS[role].includes(permission);
}
