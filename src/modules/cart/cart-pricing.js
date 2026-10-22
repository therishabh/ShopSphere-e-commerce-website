// Cart ki server-side pricing: cart mein sirf (productId, quantity) hai, price NAHI. Yahan current products se har line ka price,
// status aur total nikalte hain. Cart view (GET /cart) aur checkout DONO yahi function use karte hain, isliye customer ko jo dikhta
// hai aur jo asal mein charge hota hai wo ek hi hisaab se nikalta hai. Client ka bheja hua koi price kabhi yahan nahi aata.
//
// Line ka status:
//   OK                 : kharida ja sakta hai
//   UNAVAILABLE        : product ab public (ACTIVE) nahi hai (archive/hold/reject) ya delete ho gaya
//   INSUFFICIENT_STOCK : quantity available (onHand - reserved) se zyada hai
//   OWN_PRODUCT        : seller apna hi product khareed raha hai
//   NOT_PURCHASABLE    : price 0 hai (payment 0 amount par nahi chalta)
// Ye check "advisory" hain (snapshot): asli guard checkout ka atomic reserve hai, jo race mein bhi oversell nahi hone deta.

/** Status ka client-safe, insaan ke padhne layak message (checkout error ke details mein jaata hai). */
export const LINE_PROBLEMS = Object.freeze({
  UNAVAILABLE: 'is no longer available',
  INSUFFICIENT_STOCK: 'does not have enough stock',
  OWN_PRODUCT: 'is your own product and cannot be bought',
  NOT_PURCHASABLE: 'cannot be purchased',
});

/**
 * @param {{ productId: string, quantity: number }[]} items  cart ki lines (database se)
 * @param {Map<string, object>} productsById  repos.products.findManyByIds ka result
 * @param {string|undefined} buyerSellerId  khareedne wale ka seller profile id (agar wo seller bhi hai)
 */
export function priceCart({ items, productsById, buyerSellerId }) {
  const lines = items.map(({ productId, quantity }) => {
    const id = String(productId);
    const product = productsById.get(id);
    if (!product || product.status !== 'ACTIVE') {
      return { productId: id, quantity, status: 'UNAVAILABLE', product: product ?? null };
    }
    const available = Math.max(product.stock.onHand - product.stock.reserved, 0);
    let status = 'OK';
    if (buyerSellerId && String(product.sellerId) === buyerSellerId) status = 'OWN_PRODUCT';
    else if (product.priceCents <= 0) status = 'NOT_PURCHASABLE';
    else if (quantity > available) status = 'INSUFFICIENT_STOCK';
    return {
      productId: id,
      quantity,
      status,
      product,
      available,
      unitPriceCents: product.priceCents,
      currency: product.currency,
      lineTotalCents: product.priceCents * quantity,
    };
  });

  // Subtotal currency ke hisaab se (INR aur USD ko jodna galat hoga); sirf OK lines gini jaati hain.
  const totals = new Map();
  for (const line of lines) {
    if (line.status === 'OK') {
      totals.set(line.currency, (totals.get(line.currency) ?? 0) + line.lineTotalCents);
    }
  }
  return {
    lines,
    totals: [...totals].map(([currency, subtotalCents]) => ({ currency, subtotalCents })),
    checkoutReady: lines.length > 0 && lines.every((line) => line.status === 'OK'),
  };
}
