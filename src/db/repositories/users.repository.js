// Users ka data access. Repository ka kaam: Mongoose ki queries ek jagah rakhna, taaki controllers/services mein ODM ki
// details na aayein. Ismein business rules nahi hote (wo services mein hote hain).
//
// Transaction ke andar bhi yahi repository chalta hai: `database.transaction()` ke andar Mongoose operations ko session
// apne aap mil jaata hai (transactionAsyncLocalStorage), alag se session pass nahi karna padta.

import { serialize } from '../serialize.js';

// Email hamesha lowercase + trimmed search hoti hai (schema bhi save par yahi karta hai).
const normalizeEmail = (email) => email.trim().toLowerCase();

export function createUserRepository({ User }) {
  return {
    /** Naya user. Duplicate email par E11000 throw hota hai -> central handler isse 409 bana deta hai. */
    async create({ email, name, passwordHash, role = 'CUSTOMER' }) {
      const [user] = await User.create([{ email, name, passwordHash, role }]);
      return serialize(user, ['passwordHash']);
    },

    async findById(id) {
      return serialize(await User.findById(id).lean());
    },

    async findByEmail(email) {
      return serialize(await User.findOne({ email: normalizeEmail(email) }).lean());
    },

    /** Sirf login/authentication ke liye: passwordHash ke saath (default query mein hash aata hi nahi). Response mein kabhi mat bhejna. */
    async findAuthByEmail(email) {
      return serialize(
        await User.findOne({ email: normalizeEmail(email) })
          .select('+passwordHash')
          .lean(),
      );
    },

    /** Document nahi mila to DocumentNotFoundError throw hota hai -> 404. */
    async updateStatus(id, status) {
      const user = await User.findByIdAndUpdate(
        id,
        { status },
        { returnDocument: 'after', runValidators: true },
      )
        .orFail()
        .lean();
      return serialize(user);
    },
  };
}
