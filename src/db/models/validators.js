// MongoDB ke SERVER-SIDE collection validators: SQL ke CHECK constraints ka MongoDB roop.
//
// Kyun zaruri hain: Mongoose ke validators sirf Mongoose se likhe data par chalte hain. Direct write, script, doosri
// service ya `$inc` jaisa atomic update unhe bypass karta hai (verify kiya: update validators `$inc` par chalte hi nahi).
// Ye validators database khud har write par check karta hai, isliye "negative stock" ya "total ka galat hisaab" kisi
// bhi raaste se andar nahi ja sakta. Fail hone par MongoDB error code 121 deta hai (map-database-error.js use 409 banata hai).
//
// Cross-field rules ($expr) bhi likh sakte hain, jaise "reserved <= onHand".
// Migration 0001 inhe collections par lagata hai; badalna ho to naya migration `collMod` se.

export const COLLECTION_VALIDATORS = Object.freeze({
  users: {
    // Email lowercase hi hona chahiye (case-insensitive duplicates rokta hai).
    $expr: { $eq: ['$email', { $toLower: '$email' }] },
  },
  products: {
    $and: [
      { priceCents: { $gte: 0 } },
      { 'stock.onHand': { $gte: 0 } },
      { 'stock.reserved': { $gte: 0 } },
      // Reserved kabhi onHand se zyada nahi: oversell database level par band.
      { $expr: { $lte: ['$stock.reserved', '$stock.onHand'] } },
      // Rating summary kabhi galat nahi: count >= 0 aur har review 1..5 hai to count <= sum <= 5 * count (Phase 9).
      { ratingCount: { $gte: 0 } },
      {
        $expr: {
          $and: [
            { $gte: ['$ratingSum', '$ratingCount'] },
            { $lte: ['$ratingSum', { $multiply: ['$ratingCount', 5] }] },
          ],
        },
      },
    ],
  },
  reviews: { rating: { $gte: 1, $lte: 5 } },
  carts: {
    // Koi cart item quantity 1..100 ke bahar nahi.
    items: {
      $not: { $elemMatch: { $or: [{ quantity: { $lt: 1 } }, { quantity: { $gt: 100 } }] } },
    },
  },
  orders: {
    $expr: {
      $and: [
        { $gte: ['$subtotalCents', 0] },
        { $gte: ['$shippingCents', 0] },
        { $gte: ['$taxCents', 0] },
        { $eq: ['$totalCents', { $add: ['$subtotalCents', '$shippingCents', '$taxCents'] }] },
      ],
    },
  },
  payment_attempts: { amountCents: { $gt: 0 } },
});
