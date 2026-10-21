// Test helper: asli Pino logger ko memory mein capture karta hai, taaki tests dekh sakein ki kya log hua.
// Kyun: logs ka format aur "ye secret log mein nahi aaya" jaise claims tabhi prove ho sakte hain jab hum
// actual output inspect karein. Console par print hone ki jagah yahan array mein jama hota hai.

import { Writable } from 'node:stream';
import { createLogger } from '../../src/logging/logger.js';

/** A real pino logger writing into memory, so tests can inspect exactly what would be logged. */
export function createLogCapture(level = 'info') {
  // Logger ka har output (ek JSON line) yahan string ke roop mein jama hota hai.
  const chunks = [];
  // Writable stream = logger ka 'destination'. Pino isme likhta hai; hum `write` mein chunk ko array mein rakhte hain.
  // `cb()` batata hai ki chunk process ho gaya (stream agle chunk ke liye ready).
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return {
    // Production wala hi createLogger, bas destination hamara in-memory stream.
    logger: createLogger({ level, stream }),
    /** Raw text of everything logged (for "this secret never appears" assertions). */
    /** Poora log text ek string mein; 'ye secret kabhi log mein nahi aaya' jaise assertions ke liye. */
    text: () => chunks.join(''),
    // Har log line ko JSON.parse karke objects ki list; fields par assertions ke liye (e.g. entry.status).
    entries: () =>
      chunks
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
  };
}
