// Mock payment provider: payment gateway (Razorpay/Stripe jaisa) ki jagah sirf development/tests ke liye. CLAUDE.md ka rule: real card
// data ya live transaction kabhi nahi.
//
// Adapter shape: orders service sirf `charge()` aur `refund()` jaanta hai. Asli provider ka adapter (Phase 15 ke webhooks ke saath)
// isi shape par aayega aur service nahi badlegi.
//
// Deterministic hai: natija `paymentToken` se tay hota hai (card number nahi; provider ke JS SDK jaisa opaque test token):
//   tok_mock_success -> payment safal
//   tok_mock_decline -> card decline (provider ne saaf jawab diya: FAILED)
//   tok_mock_error   -> provider tak pahunch nahi paye / timeout (natija PATA NAHI: order PENDING_PAYMENT hi rehta hai)
// `reference` (hamari taraf ki unique id) se hi providerReference banta hai, isliye same reference par dobara charge() wahi natija deta
// hai: asli providers ki idempotency jaisa (retry par double charge nahi).

import { createHash } from 'node:crypto';

export const MOCK_TOKENS = Object.freeze([
  'tok_mock_success',
  'tok_mock_decline',
  'tok_mock_error',
]);

/** Provider ko chhoone mein network jaisi dikkat (timeout, 5xx). Natija unknown hai, isliye service ise "decline" nahi maanti. */
export class PaymentProviderUnavailableError extends Error {
  constructor() {
    super('Payment provider is unavailable');
    this.name = 'PaymentProviderUnavailableError';
  }
}

const referenceFor = (prefix, reference) =>
  `${prefix}_${createHash('sha256').update(reference).digest('hex').slice(0, 24)}`;

export function createMockPaymentProvider({ logger } = {}) {
  return {
    name: 'mock',

    /**
     * @param {{ amountCents: number, currency: string, paymentToken: string, reference: string }} request
     * @returns {Promise<{ status: 'SUCCEEDED', providerReference: string } | { status: 'DECLINED', failureCode: string }>}
     * @throws PaymentProviderUnavailableError natija unknown ho tab
     */
    async charge({ amountCents, currency, paymentToken, reference }) {
      // Token/amount log nahi karte (token provider ka secret-jaisa hai); sirf natija.
      logger?.debug({ currency }, 'mock payment charge requested');
      if (paymentToken === 'tok_mock_error') throw new PaymentProviderUnavailableError();
      if (paymentToken === 'tok_mock_decline' || amountCents <= 0) {
        return { status: 'DECLINED', failureCode: 'card_declined' };
      }
      return { status: 'SUCCEEDED', providerReference: referenceFor('mock_ch', reference) };
    },

    /** Refund bhi providerReference par deterministic (dobara call par wahi). */
    async refund({ providerReference }) {
      logger?.debug('mock payment refund requested');
      return { status: 'REFUNDED', refundReference: referenceFor('mock_re', providerReference) };
    },
  };
}
