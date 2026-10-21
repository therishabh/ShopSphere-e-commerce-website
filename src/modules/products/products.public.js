// Public (customer ko dikhne wala) product ka shape. Database document ke andar kai internal cheezein hain (sellerId,
// moderationNote, moderatedBy, stock.reserved, sku...) jo customer ko nahi dikhni chahiye. Isliye response "allowlist" se banta
// hai: hum chunke wahi fields copy karte hain jo dikhane hain. Naya internal field document mein jud bhi jaye to wo apne aap
// public response mein nahi aata (deny by default; spread `...product` jaan-boojh kar nahi kiya).

/**
 * @param {object} product  serialize() ke baad ka product (repository se)
 * @param {{ storeName: string, slug: string } | undefined} store  seller ki public info (naam/slug), na mile to null
 */
export function toPublicProduct(product, store) {
  // Available = jo abhi kharidne ke liye bacha hai (onHand - reserved). Reserved wala hissa checkout mein ruka hua hai.
  const available = Math.max(product.stock.onHand - product.stock.reserved, 0);
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.categorySlug,
    priceCents: product.priceCents,
    currency: product.currency,
    inStock: available > 0,
    available,
    rating: { average: product.ratingAverage, count: product.ratingCount },
    seller: store ?? null,
    createdAt: product.createdAt,
  };
}

/** List ke liye: ek hi query mein saare sellers ki store info laate hain (N+1 queries nahi), phir har product ko map karte hain. */
export async function toPublicProducts(products, sellerProfiles) {
  const ids = [...new Set(products.map((p) => p.sellerId))];
  const stores = ids.length > 0 ? await sellerProfiles.findPublicByIds(ids) : new Map();
  return products.map((p) => toPublicProduct(p, stores.get(String(p.sellerId))));
}
