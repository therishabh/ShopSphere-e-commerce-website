// Migration 0003 (Phase 10): orders ab seller-wise alag hain (`sellerId`, `checkoutId`, `statusChangedAt`) aur naye indexes.
//
// Order zaruri hai:
//   1. Backfill: Phase 10 se pehle ke orders (agar kisi ne seed/script se banaye hon) mein ye fields nahi hain. Schema ab inhe required
//      maanta hai, isliye purane documents ko bharte hain. Ek order mein kai sellers ho to chupchaap galat seller likhne ke bajay
//      migration fail karti hai: use pehle haath se seller-wise todna padega.
//   2. Indexes sync: naye (sellerId, checkoutId, status+statusChangedAt) ban jaate hain aur purana multikey `items.sellerId` index hat jaata hai.
// Idempotent: dobara chalane par kuch nahi badalta.
export const name = '0003_orders_seller_split_and_indexes';

export async function up({ database }) {
  const { Order, PaymentAttempt } = database.models;

  const legacy = await Order.collection
    .find({ $or: [{ sellerId: { $exists: false } }, { checkoutId: { $exists: false } }] })
    .toArray();
  for (const order of legacy) {
    const sellerIds = new Set(order.items.map((item) => String(item.sellerId)));
    if (sellerIds.size !== 1) {
      throw new Error(
        `Order ${order._id} has items from ${sellerIds.size} sellers; split it by seller before running this migration`,
      );
    }
    await Order.collection.updateOne(
      { _id: order._id },
      {
        $set: {
          sellerId: order.items[0].sellerId,
          checkoutId: String(order._id),
          statusChangedAt: order.updatedAt ?? order.createdAt ?? new Date(),
        },
      },
    );
  }

  for (const model of [Order, PaymentAttempt]) await model.syncIndexes();
}
