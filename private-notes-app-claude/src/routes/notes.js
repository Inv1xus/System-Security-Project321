// CRUD for notes. Every statement is scoped to the signed-in user's id,
// so one account can never read or change another account's notes.
import express from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';

export const router = express.Router();

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 100_000;

router.use(requireAuth);

function parseNote(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const noteBody = typeof body?.body === 'string' ? body.body : '';

  if (!title) return { error: 'A title is required.' };
  if (title.length > MAX_TITLE_LENGTH) {
    return { error: `Title must be at most ${MAX_TITLE_LENGTH} characters.` };
  }
  if (noteBody.length > MAX_BODY_LENGTH) {
    return { error: `Note body must be at most ${MAX_BODY_LENGTH} characters.` };
  }
  return { title, body: noteBody };
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// List the current user's notes, newest change first.
router.get('/', (req, res) => {
  const notes = db
    .prepare(
      `SELECT id, title, body, created_at, updated_at
         FROM notes
        WHERE user_id = ?
        ORDER BY updated_at DESC, id DESC`
    )
    .all(req.user.id);
  res.json({ notes });
});

// Read one note.
router.get('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid note id.' });

  const note = db
    .prepare(
      `SELECT id, title, body, created_at, updated_at
         FROM notes WHERE id = ? AND user_id = ?`
    )
    .get(id, req.user.id);

  if (!note) return res.status(404).json({ error: 'Note not found.' });
  res.json({ note });
});

// Create a note.
router.post('/', (req, res) => {
  const parsed = parseNote(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const info = db
    .prepare('INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?)')
    .run(req.user.id, parsed.title, parsed.body);

  const note = db
    .prepare(
      `SELECT id, title, body, created_at, updated_at
         FROM notes WHERE id = ?`
    )
    .get(Number(info.lastInsertRowid));

  res.status(201).json({ note });
});

// Update a note.
router.put('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid note id.' });

  const parsed = parseNote(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const info = db
    .prepare(
      `UPDATE notes
          SET title = ?, body = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?`
    )
    .run(parsed.title, parsed.body, id, req.user.id);

  if (info.changes === 0) return res.status(404).json({ error: 'Note not found.' });

  const note = db
    .prepare(
      `SELECT id, title, body, created_at, updated_at
         FROM notes WHERE id = ?`
    )
    .get(id);

  res.json({ note });
});

// Delete a note.
router.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid note id.' });

  const info = db
    .prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
    .run(id, req.user.id);

  if (info.changes === 0) return res.status(404).json({ error: 'Note not found.' });
  res.json({ ok: true, id });
});
