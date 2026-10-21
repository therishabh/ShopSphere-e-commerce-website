// Database ke document ko API/service ke liye plain object mein badalta hai.
//
// Mongo ka `_id` (ObjectId) hamare code mein `id` (string) ban jaata hai, `__v` hat jaata hai, aur nested ObjectIds
// JSON mein jaate waqt apne aap string ban jaate hain. `omit` se sensitive fields (jaise passwordHash) hata sakte hain.

/**
 * @param {object|null} doc  lean() object ya Mongoose document
 * @param {string[]} [omit]  jo top-level fields nikalni hain
 */
export function serialize(doc, omit = []) {
  if (!doc) return null;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const { _id, ...rest } = plain;
  delete rest.__v;
  for (const key of omit) delete rest[key];
  return { id: String(_id), ...rest };
}
