import { Router } from 'express';
import { z } from 'zod';
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

const noteBody = z.strictObject({ text: z.string().trim().min(1).max(200) });

function validationError(res, error) {
  res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    },
  });
}

function notFound(res, what) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `${what} not found` } });
}

export function createHttpExamplesRouter() {
  // Fresh store per router instance, so every app (and every test) starts empty.
  const notes = new Map();
  const comments = new Map(); // noteId -> [{ id, text }]
  let nextNoteId = 1;

  const router = Router();

  // res.send with an explicit type
  router.get('/ping', (_req, res) => {
    res.type('text/plain').send('pong');
  });

  // Route params + query params. Express 5 uses the "simple" query parser:
  // repeated keys become arrays, bracket syntax is NOT expanded into objects.
  router.get('/echo/:value', (req, res) => {
    res.json({ params: req.params, query: req.query });
  });

  // JSON body parsing; requireJson is route-specific middleware that stops the pipeline with 415.
  router.post('/echo/json', requireJson, (req, res) => {
    res.json({ body: req.body ?? {} });
  });

  // URL-encoded (HTML form) body parsing.
  router.post('/echo/form', requireUrlEncoded, (req, res) => {
    res.json({ body: req.body ?? {} });
  });

  // res.redirect: fixed, same-origin target (never built from user input).
  router.get('/old-notes', (req, res) => {
    res.redirect(301, `${req.baseUrl}/notes`);
  });

  // Route ordering: this literal path must be registered BEFORE '/notes/:id',
  // otherwise "latest" would be captured as an :id.
  router.get('/notes/latest', (_req, res) => {
    const last = [...notes.values()].at(-1);
    if (!last) return notFound(res, 'Note');
    res.json(last);
  });

  // router.route() groups methods for one path; .all() is the 405 fallback.
  router
    .route('/notes')
    .get((req, res) => {
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      res.json({ items: [...notes.values()].slice(0, limit) });
    })
    .post(requireJson, (req, res) => {
      const parsed = noteBody.safeParse(req.body ?? {});
      if (!parsed.success) return validationError(res, parsed.error);
      const note = { id: nextNoteId++, text: parsed.data.text };
      notes.set(note.id, note);
      comments.set(note.id, []);
      res.status(201).location(`${req.baseUrl}/notes/${note.id}`).json(note);
    })
    .all(methodNotAllowed(['GET', 'POST']));

  router
    .route('/notes/:id')
    .all(requireNumericParam('id'))
    .get((req, res) => {
      const note = notes.get(Number(req.params.id));
      if (!note) return notFound(res, 'Note');
      res.json(note);
    })
    .put(requireJson, (req, res) => {
      const id = Number(req.params.id);
      if (!notes.has(id)) return notFound(res, 'Note');
      const parsed = noteBody.safeParse(req.body ?? {});
      if (!parsed.success) return validationError(res, parsed.error);
      const note = { id, text: parsed.data.text };
      notes.set(id, note);
      res.json(note);
    })
    .delete((req, res) => {
      const id = Number(req.params.id);
      if (!notes.delete(id)) return notFound(res, 'Note');
      comments.delete(id);
      res.status(204).end();
    })
    .all(methodNotAllowed(['GET', 'PUT', 'DELETE']));

  // Nested router: mergeParams exposes :noteId from the parent mount path.
  const commentsRouter = Router({ mergeParams: true });
  commentsRouter.use(requireNumericParam('noteId'));
  commentsRouter.use((req, res, next) => {
    if (!notes.has(Number(req.params.noteId))) return notFound(res, 'Note');
    next();
  });
  commentsRouter
    .route('/')
    .get((req, res) => {
      res.json({ items: comments.get(Number(req.params.noteId)) });
    })
    .post(requireJson, (req, res) => {
      const parsed = noteBody.safeParse(req.body ?? {});
      if (!parsed.success) return validationError(res, parsed.error);
      const list = comments.get(Number(req.params.noteId));
      const comment = { id: list.length + 1, text: parsed.data.text };
      list.push(comment);
      res.status(201).location(`${req.baseUrl}/${comment.id}`).json(comment);
    })
    .all(methodNotAllowed(['GET', 'POST']));
  router.use('/notes/:noteId/comments', commentsRouter);

  return router;
}
