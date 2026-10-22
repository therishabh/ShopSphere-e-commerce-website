// Cart ke request schemas. Sab strict: body mein price/total/userId jaisi koi bhi extra key 400 deti hai, isliye client server ko
// "ye price lagao" keh hi nahi sakta. Cart mein sirf kaun sa product aur kitni quantity (price server nikalta hai).
import { z } from 'zod';
import { objectId } from '../../http/query/fields.js';
import { MAX_LINE_QUANTITY } from '../../db/repositories/carts.repository.js';

const quantity = z.number().int().min(1).max(MAX_LINE_QUANTITY);

export const cartProductParams = z.strictObject({ productId: objectId() });
export const addCartItemBody = z.strictObject({ productId: objectId(), quantity });
export const setCartItemBody = z.strictObject({ quantity });
