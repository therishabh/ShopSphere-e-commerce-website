// HTTP concepts ka teaching/demo router (`/api/v1/examples/...`). Real feature nahi hai.
// Yahan har endpoint ek Express/HTTP concept dikhata hai (params, query, body parsing, status codes, redirect,
// route ordering, nested routers...). Production mein mount nahi hota (src/routes/api.routes.js dekho).
// Isse seekhne ke liye tests/integration/routing.test.js saath mein padho.

import { Router } from 'express';
import { z } from 'zod';
import { NotFoundError } from '../errors/app-errors.js';
import {
  methodNotAllowed,
  requireJson,
  requireNumericParam,
  requireUrlEncoded,
} from '../http/route-guards.js';

/**
 * HTTP teaching examples, mounted at /api/v1/examples (never in production).
 * Everything here really works, but it is demo data in memory, not a business
 * module. Each handler is annotated with the concept it shows.
 */

// Zod schema: note ki body ka shape. `strictObject` = sirf `text` field allowed; koi extra field aaya to error
// (mass assignment se bachne ke liye). `.trim()` aage-peeche ke spaces hata deta hai, phir 1 se 200 chars.
const noteBody = z.strictObject({ text: z.string().trim().min(1).max(200) });

export function createHttpExamplesRouter() {
  // Har router instance ka apna fresh store hai, isliye har app (aur har test) khaali se shuru hota hai.
  // Ye in-memory demo data hai; real data Phase 6 se MongoDB mein jayega.
  const notes = new Map();
  const comments = new Map(); // noteId -> [{ id, text }]
  let nextNoteId = 1;

  const router = Router();

  // res.send: plain text response, content type explicitly set.
  router.get('/ping', (_req, res) => {
    res.type('text/plain').send('pong');
  });

  // Route params + query params. Express 5 "simple" query parser use karta hai:
  // repeated keys array ban jaati hain (?x=1&x=2 -> ['1','2']); bracket syntax (a[b]=1) object mein expand NAHI hota.
  // Dono ki values hamesha string hoti hain.
  router.get('/echo/:value', (req, res) => {
    res.json({ params: req.params, query: req.query });
  });

  // JSON body parsing. `requireJson` route-specific middleware hai: Content-Type JSON na ho to 415 ke saath
  // pipeline yahin ruk jaati hai aur handler chalta hi nahi.
  // `req.body ?? {}`: body parser ne parse na kiya ho to req.body undefined hota hai, isliye fallback.
  router.post('/echo/json', requireJson, (req, res) => {
    res.json({ body: req.body ?? {} });
  });

  // URL-encoded (HTML form) body parsing.
  router.post('/echo/form', requireUrlEncoded, (req, res) => {
    res.json({ body: req.body ?? {} });
  });

  // res.redirect: fixed, same-origin target (kabhi user input se nahi banta, warna open-redirect vulnerability).
  // 301 = Moved Permanently. `req.baseUrl` = jis prefix par ye router mount hua hai (/api/v1/examples).
  router.get('/old-notes', (req, res) => {
    res.redirect(301, `${req.baseUrl}/notes`);
  });

  // Route ordering: ye literal path '/notes/:id' se PEHLE register hona zaruri hai.
  // Warna "latest" ko :id samajh liya jata (aur numeric check par 400 milta).
  router.get('/notes/latest', (_req, res) => {
    const last = [...notes.values()].at(-1);
    // Express 5 mein sync handler ka throw automatically error handler tak jaata hai.
    if (!last) throw new NotFoundError('Note not found');
    res.json(last);
  });

  // router.route(path): ek hi path ke saare methods ek jagah group karta hai. End mein `.all()` = 405 fallback
  // (jab upar ke methods mein se koi match na ho).
  router
    .route('/notes')
    .get((req, res) => {
      // ?limit=5 -> 5; invalid/missing -> 20; hamesha max 100 (user ko bahut bada number maangne se rokta hai).
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      res.json({ items: [...notes.values()].slice(0, limit) });
    })
    .post(requireJson, (req, res) => {
      // `.parse` galat input par ZodError throw karta hai; central error handler use 400 VALIDATION_ERROR bana deta hai.
      const data = noteBody.parse(req.body ?? {}); // invalid -> ZodError -> central handler -> 400
      const note = { id: nextNoteId++, text: data.text };
      notes.set(note.id, note);
      comments.set(note.id, []);
      // 201 Created + `Location` header (naye resource ka URL), REST convention.
      res.status(201).location(`${req.baseUrl}/notes/${note.id}`).json(note);
    })
    .all(methodNotAllowed(['GET', 'POST']));

  router
    .route('/notes/:id')
    // `.all(middleware)` pehle chalta hai aur neeche ke saare methods (get/put/delete) par lagta hai:
    // yahan id numeric check.
    .all(requireNumericParam('id'))
    .get((req, res) => {
      const note = notes.get(Number(req.params.id));
      if (!note) throw new NotFoundError('Note not found');
      res.json(note);
    })
    .put(requireJson, (req, res) => {
      const id = Number(req.params.id);
      if (!notes.has(id)) throw new NotFoundError('Note not found');
      const data = noteBody.parse(req.body ?? {}); // invalid -> ZodError -> central handler -> 400
      const note = { id, text: data.text };
      notes.set(id, note);
      res.json(note);
    })
    .delete((req, res) => {
      const id = Number(req.params.id);
      if (!notes.delete(id)) throw new NotFoundError('Note not found');
      comments.delete(id);
      // 204 No Content: delete safal, body khaali (`.end()` body ke bina response band karta hai).
      res.status(204).end();
    })
    .all(methodNotAllowed(['GET', 'PUT', 'DELETE']));

  // Nested router: `mergeParams: true` se parent path ka :noteId is router ke andar `req.params` mein milta hai.
  // Iske bina nested router ko parent ke params dikhte hi nahi.
  const commentsRouter = Router({ mergeParams: true });
  // Router-level middleware: is router ki har request par pehle ye do checks chalte hain.
  commentsRouter.use(requireNumericParam('noteId'));
  commentsRouter.use((req, res, next) => {
    if (!notes.has(Number(req.params.noteId))) throw new NotFoundError('Note not found');
    next();
  });
  commentsRouter
    .route('/')
    .get((req, res) => {
      res.json({ items: comments.get(Number(req.params.noteId)) });
    })
    .post(requireJson, (req, res) => {
      const data = noteBody.parse(req.body ?? {}); // invalid -> ZodError -> central handler -> 400
      const list = comments.get(Number(req.params.noteId));
      const comment = { id: list.length + 1, text: data.text };
      list.push(comment);
      res.status(201).location(`${req.baseUrl}/${comment.id}`).json(comment);
    })
    .all(methodNotAllowed(['GET', 'POST']));
  // Nested router ko parent path par mount karna. ':noteId' placeholder yahin define hota hai.
  router.use('/notes/:noteId/comments', commentsRouter);

  return router;
}
