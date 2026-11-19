import express from 'express';
import { config } from '../config.js';
import { statements } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validateId, validateNote, ValidationError } from '../middleware/validate.js';

export const notesRouter = express.Router();

// Every route below is scoped to req.user.id, and each SQL statement filters on
// user_id, so one user can never read or modify another user's notes.
notesRouter.use(requireAuth);

notesRouter.get('/', (req, res, next) => {
  try {
    res.json({ notes: statements.listNotes.all(req.user.id) });
  } catch (err) {
    next(err);
  }
});

notesRouter.post('/', (req, res, next) => {
  try {
    const { title, content } = validateNote(req.body ?? {});

    const { count } = statements.countNotes.get(req.user.id);
    if (count >= config.limits.notesPerUser) {
      throw new ValidationError(
        `You have reached the limit of ${config.limits.notesPerUser} notes.`,
        'notes'
      );
    }

    const note = statements.createNote.get(req.user.id, title, content);
    res.status(201).json({ note });
  } catch (err) {
    next(err);
  }
});

notesRouter.get('/:id', (req, res, next) => {
  try {
    const note = statements.getNote.get(validateId(req.params.id), req.user.id);
    if (!note) return res.status(404).json({ error: 'Note not found.' });
    res.json({ note });
  } catch (err) {
    next(err);
  }
});

notesRouter.put('/:id', (req, res, next) => {
  try {
    const id = validateId(req.params.id);
    const { title, content } = validateNote(req.body ?? {});
    const note = statements.updateNote.get(title, content, id, req.user.id);
    if (!note) return res.status(404).json({ error: 'Note not found.' });
    res.json({ note });
  } catch (err) {
    next(err);
  }
});

notesRouter.delete('/:id', (req, res, next) => {
  try {
    const result = statements.deleteNote.run(validateId(req.params.id), req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Note not found.' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
