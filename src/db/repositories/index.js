// Saari repositories ek jagah. `createRepositories(models)` connection ke models se repositories banata hai.

import { createAuditRepository } from './audit.repository.js';
import { createCategoryRepository } from './categories.repository.js';
import { createOutboxRepository } from './outbox.repository.js';
import { createProductRepository } from './products.repository.js';
import { createSequenceRepository } from './sequences.repository.js';
import { createUserRepository } from './users.repository.js';

export function createRepositories(models) {
  return {
    users: createUserRepository(models),
    categories: createCategoryRepository(models),
    products: createProductRepository(models),
    audit: createAuditRepository(models),
    outbox: createOutboxRepository(models),
    sequences: createSequenceRepository(models),
  };
}
