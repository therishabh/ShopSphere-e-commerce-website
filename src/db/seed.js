// Local development ke liye sample data. `npm run db:seed` se chalta hai (scripts/db.js).
//
// - Idempotent: baar-baar chalane par duplicate nahi banta (upsert, natural keys: email, slug, sku).
// - Users ke passwordHash nahi hain: asli password hashing Phase 7 (authentication) mein aayegi, tab dev passwords set honge.
//   Yahan koi password/secret nahi hai. Emails `.test` domain ke hain (reserved, kabhi asli nahi).

import { createPasswordHasher } from '../modules/auth/password-hasher.js';

const now = () => new Date();

// Natural key se document dhundo, na mile to banao (idempotent seed ke liye).
async function ensure(model, filter, doc) {
  return model.findOneAndUpdate(
    filter,
    { $setOnInsert: doc },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
}

/**
 * @param {{ models: object }} database createDatabase() ka result (connected)
 * @param {{ password?: string }} [options]  password diya ho to seed users ke liye argon2 hash set hota hai (sirf jinke paas abhi hash nahi).
 *        Password source mein nahi hai: SEED_PASSWORD env se aata hai (scripts/db.js). Na ho to users bina password ke bante hain
 *        (login ke liye forgot-password flow se password set karo).
 */
export async function seedDatabase({ models }, { password } = {}) {
  const { User, SellerProfile, Category, Product, Review, WishlistItem, Cart } = models;

  // --- users
  const user = (email, name, role) =>
    ensure(User, { email }, { email, name, role, status: 'ACTIVE', emailVerifiedAt: now() });
  const admin = await user('admin@shopsphere.test', 'Asha Admin', 'ADMIN');
  const customer = await user('customer@shopsphere.test', 'Chirag Customer', 'CUSTOMER');
  const sellerUsers = [
    await user('seller1@shopsphere.test', 'Sunita Seller', 'SELLER'),
    await user('seller2@shopsphere.test', 'Sameer Seller', 'SELLER'),
    await user('seller3@shopsphere.test', 'Sonal Seller', 'SELLER'),
  ];

  if (password) {
    const passwordHash = await createPasswordHasher().hash(password);
    await User.updateMany(
      { email: /@shopsphere\.test$/, passwordHash: { $exists: false } },
      { $set: { passwordHash } },
    );
  }

  // --- seller profiles: do approved, ek pending (approval flow dikhane ke liye)
  const profiles = [
    ['Sunita Footwear', 'sunita-footwear', 'APPROVED'],
    ['Sameer Accessories', 'sameer-accessories', 'APPROVED'],
    ['Sonal Watches', 'sonal-watches', 'PENDING'],
  ];
  const sellers = [];
  for (const [i, [storeName, slug, status]] of profiles.entries()) {
    sellers.push(
      await ensure(
        SellerProfile,
        { userId: sellerUsers[i]._id },
        {
          userId: sellerUsers[i]._id,
          storeName,
          slug,
          status,
          ...(status === 'APPROVED' ? { approvedAt: now(), approvedBy: admin._id } : {}),
        },
      ),
    );
  }

  // --- categories
  const categories = {};
  for (const [slug, name] of [
    ['shoes', 'Shoes'],
    ['bags', 'Bags'],
    ['watches', 'Watches'],
  ]) {
    categories[slug] = await ensure(Category, { slug }, { slug, name });
  }

  // --- products: 12 ACTIVE (do approved sellers mein baanta hua), 1 DRAFT, 1 PENDING_REVIEW. Stock product ke andar embedded.
  const slugs = ['shoes', 'bags', 'watches'];
  const products = [];
  const product = (seller, slug, sku, fields) =>
    ensure(
      Product,
      { sellerId: seller._id, sku },
      {
        sellerId: seller._id,
        categoryId: categories[slug]._id,
        categorySlug: slug,
        sku,
        currency: 'INR',
        ...fields,
      },
    );
  for (let i = 1; i <= 12; i += 1) {
    const slug = slugs[(i - 1) % 3];
    products.push(
      await product(sellers[(i - 1) % 2], slug, `SEED-${String(i).padStart(3, '0')}`, {
        name: `Sample ${slug} ${i}`,
        description: `Seed product ${i} for local development`,
        priceCents: i * 25_000,
        status: 'ACTIVE',
        stock: { onHand: i % 4 === 0 ? 0 : i * 3, reserved: 0 },
      }),
    );
  }
  for (const [sku, status] of [
    ['SEED-DRAFT', 'DRAFT'],
    ['SEED-REVIEW', 'PENDING_REVIEW'],
  ]) {
    await product(sellers[0], 'shoes', sku, {
      name: `Hidden ${status.toLowerCase()} product`,
      priceCents: 99_900,
      status,
      stock: { onHand: 5, reserved: 0 },
    });
  }

  // --- customer ka sample activity: reviews, wishlist, ek active cart
  for (const [p, rating, body] of [
    [products[0], 5, 'Great quality'],
    [products[1], 4, 'Good value'],
  ]) {
    await ensure(
      Review,
      { productId: p._id, userId: customer._id },
      { productId: p._id, userId: customer._id, rating, body },
    );
  }
  for (const p of [products[2], products[3]]) {
    await ensure(
      WishlistItem,
      { userId: customer._id, productId: p._id },
      { userId: customer._id, productId: p._id },
    );
  }
  await ensure(
    Cart,
    { userId: customer._id, status: 'ACTIVE' },
    {
      userId: customer._id,
      status: 'ACTIVE',
      items: [
        { productId: products[4]._id, quantity: 1 },
        { productId: products[5]._id, quantity: 2 },
      ],
    },
  );

  return {
    users: await User.countDocuments(),
    sellerProfiles: await SellerProfile.countDocuments(),
    categories: await Category.countDocuments(),
    products: await Product.countDocuments(),
    reviews: await Review.countDocuments(),
    wishlistItems: await WishlistItem.countDocuments(),
    carts: await Cart.countDocuments(),
  };
}
