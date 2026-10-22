// Orders ka business logic: checkout (idempotent), payment, state machine transitions, reads, reconcile.
//
// BADA PICTURE (checkout):
//   1. Idempotency claim  : Idempotency-Key ko database ke unique index se claim karo. Pehle se hai to replay / conflict.
//   2. Phase 1 (ek SHORT transaction, sirf database): cart padho -> server-side price/validation -> stock RESERVE (atomic conditional
//      update) -> seller+currency ke hisaab se orders (PENDING_PAYMENT) + payment attempts (PENDING) -> cart CHECKED_OUT -> audit +
//      outbox. Kuch bhi fail ho to poora rollback (stock bhi nahi rukta, cart waisa hi).
//   3. Phase 2 (transaction ke BAHAR): mock payment provider ko charge. Network call kabhi database transaction ke andar nahi: wo
//      lambi chal sakti hai aur tab tak transaction locks/snapshot pakde rehta, sab kuch atak jaata.
//   4. Phase 3 (har order ke liye chhota transaction): natija likho. SUCCEEDED -> PAID + stock commit; DECLINED -> PAYMENT_FAILED +
//      stock release; provider tak pahunch nahi paye (natija unknown) -> order PENDING_PAYMENT hi rehta hai (reconcile baad mein).
//   5. Final response idempotency record mein save; retry par wahi response.
//
// Transaction ka rule: transaction callback transient error par dobara chal sakta hai, isliye uske andar sirf database kaam
// (koi network call, email, random id jo bahar leak ho nahi).
import { createHash } from 'node:crypto';
import { AppError, ConflictError, NotFoundError } from '../../errors/app-errors.js';
import { buildPagination } from '../../http/query/pagination.js';
import { PaymentProviderUnavailableError } from '../../payments/mock-payment-provider.js';
import { requireApprovedSeller } from '../authz/ownership.js';
import { buyerSellerIdOf } from '../cart/cart.service.js';
import { LINE_PROBLEMS, priceCart } from '../cart/cart-pricing.js';
import {
  commitItems,
  releaseItems,
  reserveItems,
  restockItems,
} from '../inventory/inventory.service.js';
import { REFUND_ON_ENTER, SELLER_VISIBLE_STATUSES, assertTransition } from './order-state.js';
import { toAdminOrder, toOrder, toSellerOrder } from './orders.presenter.js';

const IDEMPOTENCY_SCOPE = 'orders.create';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
// Provider ke jawab ke liye intezaar. Isse zyada lage to natija "unknown" maante hain (order PENDING_PAYMENT). Reconcile ki default
// umar (15 min) isse bahut badi hai, taaki chalte hue payment ko reconcile expire na kar de.
const PROVIDER_TIMEOUT_MS = 10_000;
const DEFAULT_PENDING_MINUTES = 15;

// Har (from>to) edge par stock ka kya hota hai (transaction ke andar).
const STOCK_EFFECTS = Object.freeze({
  'PENDING_PAYMENT>PAID': commitItems, // bik gaya: onHand aur reserved dono ghatte hain
  'PENDING_PAYMENT>PAYMENT_FAILED': releaseItems, // roka hua wapas
  'PENDING_PAYMENT>CANCELLED': releaseItems, // expire: roka hua wapas
  'PAID>CANCELLED': restockItems, // ship nahi hua, maal shelf par wapas
  'PROCESSING>CANCELLED': restockItems,
});

const itemsOf = (order) =>
  order.items.map((item) => ({ productId: String(item.productId), quantity: item.quantity }));

// Same request ko same hash: object keys ke order se farak na pade (client {a,b} ya {b,a} bheje to bhi same).
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}
const hashRequest = (input) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(input)))
    .digest('hex');

// Provider call par timeout: jawab na aaye to PaymentProviderUnavailableError (natija unknown).
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new PaymentProviderUnavailableError()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Checkout ka overall payment status + HTTP code (PAID 201, PENDING 202, baaki 402 Payment Required).
function summarizePayment(orders) {
  const statuses = orders.map((o) => o.status);
  if (statuses.every((s) => s === 'PAID')) return { paymentStatus: 'PAID', httpStatus: 201 };
  if (statuses.some((s) => s === 'PENDING_PAYMENT'))
    return { paymentStatus: 'PENDING', httpStatus: 202 };
  if (statuses.every((s) => s === 'PAYMENT_FAILED'))
    return { paymentStatus: 'FAILED', httpStatus: 402 };
  return { paymentStatus: 'PARTIAL', httpStatus: 402 };
}

export function createOrderService({ database, payments, logger }) {
  const repos = database.repositories;

  // ---------------------------------------------------------------------------------------------------------------------
  // State transition: ek hi jagah jahan order ka status badalta hai (checkout ka payment natija, seller/customer/admin actions,
  // expire). Rule check -> transaction mein conditional status update + stock + payment attempt + audit + outbox -> (zaroorat ho to)
  // refund.
  // ---------------------------------------------------------------------------------------------------------------------
  async function applyTransition({
    order,
    to,
    kind,
    actorId = null,
    scope,
    reason,
    paymentUpdate,
  }) {
    assertTransition({ from: order.status, to, kind });
    const from = order.status;

    const updated = await database.transaction(
      async ({ orders, products, paymentAttempts, audit, outbox }) => {
        // `status: from` filter: kisi aur request ne beech mein status badal diya to null (ek hi transition jeetta hai).
        const changed = await orders.transition({ id: order.id, from, to, scope });
        if (!changed) {
          throw new AppError('The order status changed meanwhile; reload and try again', {
            statusCode: 409,
            code: 'ORDER_STATE_CHANGED',
          });
        }
        const stockEffect = STOCK_EFFECTS[`${from}>${to}`];
        if (stockEffect) await stockEffect(products, itemsOf(order));

        // Payment attempt sirf PENDING_PAYMENT se nikalte waqt settle hoti hai (paid ho gaya / fail / expire).
        if (from === 'PENDING_PAYMENT') {
          const settled = await paymentAttempts.settle({
            orderId: order.id,
            from: 'PENDING',
            to: to === 'PAID' ? 'SUCCEEDED' : 'FAILED',
            set:
              to === 'PAID'
                ? { providerReference: paymentUpdate.providerReference }
                : { failureCode: paymentUpdate?.failureCode ?? 'EXPIRED' },
          });
          if (!settled) {
            throw new AppError('The payment attempt is not pending any more', {
              statusCode: 409,
              code: 'ORDER_STATE_CHANGED',
            });
          }
        }

        await audit.record({
          actorId,
          action: `order.${to.toLowerCase()}`,
          entityType: 'Order',
          entityId: order.id,
          metadata: { from, to, kind, number: order.number, ...(reason ? { reason } : {}) },
        });
        await outbox.enqueue({
          type: `order.${to.toLowerCase()}`,
          aggregateType: 'Order',
          aggregateId: order.id,
          payload: { orderId: order.id, from, to },
        });
        return changed;
      },
    );

    // Paid order cancel/refund hua: paisa wapas dena (provider call, transaction ke bahar).
    if (REFUND_ON_ENTER.includes(to) && from !== 'PENDING_PAYMENT') {
      await refundPayment(order.id);
    }
    return updated;
  }

  // Provider se refund. Order ka status pehle hi badal chuka hota hai; refund fail ho to order cancelled hi rehta hai, attempt
  // SUCCEEDED rehti hai (= "refund baaki") aur reconcile dobara try karta hai. @returns 'REFUNDED' | 'PENDING' | 'NOT_REQUIRED'
  async function refundPayment(orderId) {
    const attempt = (await repos.paymentAttempts.findByOrderIds([orderId])).get(String(orderId));
    if (!attempt || attempt.status !== 'SUCCEEDED') return 'NOT_REQUIRED';
    try {
      await withTimeout(
        payments.refund({
          providerReference: attempt.providerReference,
          amountCents: attempt.amountCents,
          currency: attempt.currency,
        }),
        PROVIDER_TIMEOUT_MS,
      );
    } catch (err) {
      logger?.error({ orderId, errName: err.name }, 'payment refund failed; reconcile will retry');
      await repos.audit.record({
        actorId: null,
        action: 'payment.refund_failed',
        entityType: 'Order',
        entityId: String(orderId),
        metadata: { amountCents: attempt.amountCents },
      });
      return 'PENDING';
    }
    await database.transaction(async ({ paymentAttempts, audit }) => {
      const settled = await paymentAttempts.settle({ orderId, from: 'SUCCEEDED', to: 'REFUNDED' });
      if (settled) {
        await audit.record({
          actorId: null,
          action: 'payment.refunded',
          entityType: 'Order',
          entityId: String(orderId),
          metadata: { amountCents: attempt.amountCents },
        });
      }
    });
    return 'REFUNDED';
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // Checkout
  // ---------------------------------------------------------------------------------------------------------------------

  // Phase 1: ek transaction, sirf database. Return: banaye hue orders.
  function placeOrders({ actor, checkoutId, input }) {
    return database.transaction(
      async ({
        carts,
        products,
        orders,
        paymentAttempts,
        sequences,
        sellerProfiles,
        audit,
        outbox,
      }) => {
        const cart = await carts.findActive(actor.id);
        if (!cart || cart.items.length === 0) {
          throw new AppError('Your cart is empty', { statusCode: 409, code: 'CART_EMPTY' });
        }

        // Server-side pricing: cart mein sirf productId+quantity hai; price/naam/status abhi ke product se (transaction snapshot).
        const productsById = await products.findManyByIds(
          cart.items.map((i) => String(i.productId)),
        );
        const buyerSellerId = await buyerSellerIdOf({ sellerProfiles }, actor);
        const priced = priceCart({ items: cart.items, productsById, buyerSellerId });
        const problems = priced.lines.filter((line) => line.status !== 'OK');
        if (problems.length > 0) {
          throw new AppError('Some items in your cart cannot be checked out', {
            statusCode: 409,
            code: 'CHECKOUT_INVALID',
            details: problems.map((line) => ({
              path: `items.${line.productId}`,
              message: LINE_PROBLEMS[line.status],
            })),
          });
        }

        // Stock rokna: aakhri item par do checkouts ki race yahin tay hoti hai (atomic conditional update). Fail = 409 + rollback.
        await reserveItems(
          products,
          priced.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        );

        // Seller + currency ke hisaab se group: ek order = ek seller = ek currency (status machine seller se seedha jud jaye).
        const groups = new Map();
        for (const line of priced.lines) {
          const key = `${line.product.sellerId}|${line.currency}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(line);
        }

        const created = [];
        for (const key of [...groups.keys()].sort()) {
          const lines = groups.get(key);
          const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
          const order = await orders.create({
            number: await sequences.next('order'),
            userId: actor.id,
            sellerId: lines[0].product.sellerId,
            checkoutId,
            status: 'PENDING_PAYMENT',
            currency: lines[0].currency,
            subtotalCents,
            // Shipping/tax abhi 0 (fields rakhe hain: totals ka formula validator mein pehle se hai). README ke limitations dekho.
            shippingCents: 0,
            taxCents: 0,
            totalCents: subtotalCents,
            shippingAddress: input.shippingAddress,
            items: lines.map((line) => ({
              productId: line.productId,
              sellerId: line.product.sellerId,
              productName: line.product.name,
              sku: line.product.sku,
              unitPriceCents: line.unitPriceCents,
              quantity: line.quantity,
              lineTotalCents: line.lineTotalCents,
            })),
          });
          await paymentAttempts.create({
            orderId: order.id,
            provider: payments.name,
            amountCents: order.totalCents,
            currency: order.currency,
          });
          await audit.record({
            actorId: actor.id,
            action: 'order.created',
            entityType: 'Order',
            entityId: order.id,
            metadata: {
              to: 'PENDING_PAYMENT',
              number: order.number,
              totalCents: order.totalCents,
              itemCount: lines.length,
              checkoutId,
            },
          });
          await outbox.enqueue({
            type: 'order.created',
            aggregateType: 'Order',
            aggregateId: order.id,
            payload: { orderId: order.id, checkoutId },
          });
          created.push(order);
        }

        // Cart band: conditional (ACTIVE hi). Beech mein badla ho to false: poora transaction rollback.
        if (!(await carts.markCheckedOut({ id: cart.id, userId: actor.id }))) {
          throw new AppError('Your cart changed during checkout; please try again', {
            statusCode: 409,
            code: 'CART_CHANGED',
          });
        }
        return created;
      },
    );
  }

  // Phase 2+3 ek order ke liye: provider charge (transaction ke bahar) phir natija database mein.
  async function settlePayment({ order, paymentToken }) {
    let outcome;
    try {
      outcome = await withTimeout(
        payments.charge({
          amountCents: order.totalCents,
          currency: order.currency,
          paymentToken,
          // Hamari taraf ki stable reference: provider isi se idempotent rehta hai (retry par double charge nahi).
          reference: `order_${order.id}`,
        }),
        PROVIDER_TIMEOUT_MS,
      );
    } catch (err) {
      // Natija unknown (provider down/timeout): decline NAHI maante, paisa kat gaya ho sakta hai. Order PENDING_PAYMENT, stock reserved.
      logger?.warn(
        { orderId: order.id, errName: err.name },
        'payment outcome unknown; order stays PENDING_PAYMENT until reconcile',
      );
      return order;
    }
    if (outcome.status === 'SUCCEEDED') {
      return applyTransition({
        order,
        to: 'PAID',
        kind: 'SYSTEM',
        actorId: order.userId,
        paymentUpdate: { providerReference: outcome.providerReference },
      });
    }
    return applyTransition({
      order,
      to: 'PAYMENT_FAILED',
      kind: 'SYSTEM',
      actorId: order.userId,
      paymentUpdate: { failureCode: outcome.failureCode },
    });
  }

  // Idempotency: pehle se maujood record par kya karna hai.
  function replayOrReject(record, requestHash) {
    if (record.requestHash !== requestHash) {
      throw new AppError('This Idempotency-Key was already used with a different request', {
        statusCode: 422,
        code: 'IDEMPOTENCY_KEY_REUSED',
      });
    }
    if (record.status === 'COMPLETED') {
      return { replayed: true, status: record.responseStatus, body: record.responseBody };
    }
    // Pehli request abhi chal rahi hai (ya beech mein crash hui). Duplicate order kabhi nahi: client thodi der baad retry kare.
    throw new AppError('A request with this Idempotency-Key is still being processed', {
      statusCode: 409,
      code: 'IDEMPOTENCY_IN_PROGRESS',
      headers: { 'Retry-After': '1' },
    });
  }

  async function presentOrders(orders) {
    const attempts = await repos.paymentAttempts.findByOrderIds(orders.map((o) => o.id));
    return orders.map((order) => toOrder(order, attempts.get(order.id)));
  }

  const page = ({ items, total }, query) => ({
    items,
    pagination: buildPagination({ page: query.page, limit: query.limit, total }),
  });

  return {
    /**
     * Checkout. @returns {{ replayed: boolean, status: number, body: object }}
     * Client ka bheja hua input sirf address + payment token hai; items/prices cart + products se server nikalta hai.
     */
    async createCheckout({ actor, idempotencyKey, input }) {
      const requestHash = hashRequest(input);

      let claim;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        claim = await repos.idempotency.claim({
          userId: actor.id,
          scope: IDEMPOTENCY_SCOPE,
          key: idempotencyKey,
          requestHash,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
        });
        if (claim.claimed || claim.record) break;
      }
      if (!claim.claimed) {
        if (!claim.record) throw new ConflictError('Concurrent update, please retry');
        return replayOrReject(claim.record, requestHash);
      }

      const checkoutId = claim.record.id;
      let created;
      try {
        created = await placeOrders({ actor, checkoutId, input });
      } catch (err) {
        // Order bana hi nahi (validation/stock/rollback): key chhod do, taaki cart theek karke wahi key se dobara try ho sake.
        await repos.idempotency
          .release(checkoutId)
          .catch((releaseErr) =>
            logger?.error({ errName: releaseErr.name }, 'could not release idempotency record'),
          );
        throw err;
      }

      // Ab orders maujood hain: yahan se fail hone par key release NAHI hoti (duplicate order ka khatra), reconcile sambhalta hai.
      const settled = [];
      for (const order of created) {
        settled.push(await settlePayment({ order, paymentToken: input.paymentToken }));
      }
      const { paymentStatus, httpStatus } = summarizePayment(settled);
      const body = JSON.parse(
        JSON.stringify({ checkoutId, paymentStatus, orders: await presentOrders(settled) }),
      );
      await repos.idempotency.complete({
        id: checkoutId,
        responseStatus: httpStatus,
        responseBody: body,
      });
      return { replayed: false, status: httpStatus, body };
    },

    // --- Customer ---------------------------------------------------------------------------------------------------------

    async listMine({ actor, query }) {
      const result = await repos.orders.listForUser(actor.id, query);
      return page({ items: await presentOrders(result.items), total: result.total }, query);
    },

    /** Apna order + payment + timeline. Doosre ka order id dene par 404 (existence nahi khulti: order ids private hain). */
    async getMine({ actor, orderId }) {
      const order = await repos.orders.findForUser(orderId, actor.id);
      if (!order) throw new NotFoundError('Order not found');
      const attempt = (await repos.paymentAttempts.findByOrderIds([order.id])).get(order.id);
      const history = await repos.audit.listForEntity({ entityType: 'Order', entityId: order.id });
      return toOrder(order, attempt, history);
    },

    /** Customer ka cancel: sirf PAID order (state machine). Stock wapas, refund provider se. */
    async cancelMine({ actor, orderId }) {
      const order = await repos.orders.findForUser(orderId, actor.id);
      if (!order) throw new NotFoundError('Order not found');
      await applyTransition({
        order,
        to: 'CANCELLED',
        kind: 'CUSTOMER',
        actorId: actor.id,
        scope: { userId: actor.id },
      });
      return this.getMine({ actor, orderId });
    },

    // --- Seller -----------------------------------------------------------------------------------------------------------

    async listForSeller({ actor, query }) {
      const profile = await requireApprovedSeller(repos, actor);
      const { items, total } = await repos.orders.listForSeller(
        profile.id,
        query,
        SELLER_VISIBLE_STATUSES,
      );
      return page({ items: items.map(toSellerOrder), total }, query);
    },

    async getForSeller({ actor, orderId }) {
      const profile = await requireApprovedSeller(repos, actor);
      const order = await repos.orders.findForSeller(orderId, profile.id, SELLER_VISIBLE_STATUSES);
      if (!order) throw new NotFoundError('Order not found');
      return toSellerOrder(order);
    },

    /** Seller ka fulfilment: PAID -> PROCESSING -> SHIPPED -> DELIVERED (sirf apne order par; state machine baaki rokta hai). */
    async sellerTransition({ actor, orderId, to }) {
      const profile = await requireApprovedSeller(repos, actor);
      const order = await repos.orders.findForSeller(orderId, profile.id, SELLER_VISIBLE_STATUSES);
      if (!order) throw new NotFoundError('Order not found');
      const updated = await applyTransition({
        order,
        to,
        kind: 'SELLER',
        actorId: actor.id,
        scope: { sellerId: profile.id },
      });
      return toSellerOrder(updated);
    },

    // --- Admin ------------------------------------------------------------------------------------------------------------

    async listForAdmin({ query }) {
      const result = await repos.orders.listForAdmin(query);
      const attempts = await repos.paymentAttempts.findByOrderIds(result.items.map((o) => o.id));
      return page(
        {
          items: result.items.map((order) => toAdminOrder(order, attempts.get(order.id))),
          total: result.total,
        },
        query,
      );
    },

    async getForAdmin({ orderId }) {
      const order = await repos.orders.findById(orderId);
      if (!order) throw new NotFoundError('Order not found');
      const attempt = (await repos.paymentAttempts.findByOrderIds([order.id])).get(order.id);
      const history = await repos.audit.listForEntity({ entityType: 'Order', entityId: order.id });
      return toAdminOrder(order, attempt, history);
    },

    async adminTransition({ actor, orderId, to, reason }) {
      const order = await repos.orders.findById(orderId);
      if (!order) throw new NotFoundError('Order not found');
      await applyTransition({ order, to, kind: 'ADMIN', actorId: actor.id, reason });
      return this.getForAdmin({ orderId });
    },

    /**
     * Atke hue kaam sambhalna (abhi admin ke haath se; Phase 14 ka scheduled job isi ko bulayega):
     *   1. Jo orders `olderThanMinutes` se PENDING_PAYMENT hain (payment ka natija kabhi nahi aaya): CANCELLED + stock wapas.
     *   2. Jin cancelled/refunded orders ka refund baaki hai: dobara try.
     * Limitation: agar provider ne asal mein charge kar diya tha par jawab hum tak nahi aaya, to expire hone par paisa kat chuka ho
     * sakta hai; asli provider ke saath webhooks (Phase 15) is gap ko band karte hain.
     */
    async reconcile({ actor, olderThanMinutes = DEFAULT_PENDING_MINUTES }) {
      const olderThan = new Date(Date.now() - olderThanMinutes * 60 * 1000);
      let expiredOrders = 0;
      let skippedOrders = 0;
      for (const order of await repos.orders.findStalePending({ olderThan })) {
        try {
          await applyTransition({
            order,
            to: 'CANCELLED',
            kind: 'SYSTEM',
            actorId: actor.id,
            reason: 'payment outcome never arrived',
          });
          expiredOrders += 1;
        } catch (err) {
          // Beech mein koi aur request status badal chuki (ORDER_STATE_CHANGED): skip. Baaki errors upar jaate hain.
          if (!(err instanceof AppError)) throw err;
          skippedOrders += 1;
        }
      }
      let refundsCompleted = 0;
      let refundsStillPending = 0;
      for (const attempt of await repos.paymentAttempts.findRefundsOwed()) {
        const result = await refundPayment(String(attempt.orderId));
        if (result === 'REFUNDED') refundsCompleted += 1;
        else refundsStillPending += 1;
      }
      return { expiredOrders, skippedOrders, refundsCompleted, refundsStillPending };
    },
  };
}
