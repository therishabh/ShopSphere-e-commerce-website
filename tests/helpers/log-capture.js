import { Writable } from 'node:stream';
import { createLogger } from '../../src/logging/logger.js';

/** A real pino logger writing into memory, so tests can inspect exactly what would be logged. */
export function createLogCapture(level = 'info') {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return {
    logger: createLogger({ level, stream }),
    /** Raw text of everything logged (for "this secret never appears" assertions). */
    text: () => chunks.join(''),
    entries: () =>
      chunks
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
  };
}
