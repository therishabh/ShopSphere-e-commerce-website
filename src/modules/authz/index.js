// Authorization module ka composition root.
import { createAuthorize } from './authorize.js';

/** @param {{ database: object, logger: import('pino').Logger }} deps */
export function createAuthz({ database, logger }) {
  return { requirePermission: createAuthorize({ users: database.repositories.users, logger }) };
}
