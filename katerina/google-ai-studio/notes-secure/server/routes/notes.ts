import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import { requireAuth, requireCsrf, type AuthenticatedRequest } from '../middleware.ts';

export const notesRouter = Router();

interface NoteRow {
  id: string;
  user_id: string;
  title: string;
  content: string;
  is_pinned: number;
  created_at: number;
  updated_at: number;
}

function serializeNote(row: NoteRow) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    isPinned: row.is_pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const noteIdSchema = z.string().uuid('Invalid note ID.');

const notePayloadSchema = z
  .object({
    title: z.string().max(200, 'Title must be 200 characters or fewer.'),
    content: z.string().max(100000, 'Note content exceeds the 100,000 character limit.'),
    isPinned: z.boolean().optional(),
  })
  .refine(
    (data) => data.title.trim().length > 0 || data.content.trim().length > 0,
    'Please add a title or write some content before saving.'
  );

const pinSchema = z.object({
  isPinned: z.boolean(),
});

notesRouter.use(requireAuth);

notesRouter.get('/', (req: AuthenticatedRequest, res) => {
  const userId = req.auth!.user.id;
  const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const pinnedOnly = req.query.pinned === 'true';

  const clauses: string[] = ['user_id = ?'];
  const params: Array<string | number> = [userId];

  if (pinnedOnly) {
    clauses.push('is_pinned = 1');
  }

  if (rawQuery.length > 0) {
    const escaped = rawQuery.replace(/[\\%_]/g, '\\$&');
    const pattern = `%${escaped}%`;
    clauses.push("(title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')");
    params.push(pattern, pattern);
  }

  const sql = `
    SELECT id, user_id, title, content, is_pinned, created_at, updated_at
    FROM notes
    WHERE ${clauses.join(' AND ')}
    ORDER BY is_pinned DESC, updated_at DESC
  `;

  const rows = db.prepare(sql).all(...params) as NoteRow[];
  res.json({ notes: rows.map(serializeNote) });
});

notesRouter.get('/:id', (req: AuthenticatedRequest, res) => {
  const idParsed = noteIdSchema.safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ error: 'Invalid note ID.' });
    return;
  }

  const row = db
    .prepare(
      `SELECT id, user_id, title, content, is_pinned, created_at, updated_at
       FROM notes
       WHERE id = ? AND user_id = ?`
    )
    .get(idParsed.data, req.auth!.user.id) as NoteRow | undefined;

  if (!row) {
    res.status(404).json({ error: 'Note not found.' });
    return;
  }

  res.json({ note: serializeNote(row) });
});

notesRouter.post('/', requireCsrf, (req: AuthenticatedRequest, res) => {
  const parsed = notePayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid note payload.';
    res.status(400).json({ error: msg });
    return;
  }

  const id = crypto.randomUUID();
  const userId = req.auth!.user.id;
  const title = parsed.data.title.trim() || 'Untitled note';
  const content = parsed.data.content;
  const isPinned = parsed.data.isPinned ? 1 : 0;
  const now = Date.now();

  db.prepare(
    `INSERT INTO notes (id, user_id, title, content, is_pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, title, content, isPinned, now, now);

  res.status(201).json({
    note: {
      id,
      title,
      content,
      isPinned: isPinned === 1,
      createdAt: now,
      updatedAt: now,
    },
  });
});

notesRouter.put('/:id', requireCsrf, (req: AuthenticatedRequest, res) => {
  const idParsed = noteIdSchema.safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ error: 'Invalid note ID.' });
    return;
  }

  const parsed = notePayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid note payload.';
    res.status(400).json({ error: msg });
    return;
  }

  const userId = req.auth!.user.id;
  const existing = db
    .prepare('SELECT id, is_pinned, created_at FROM notes WHERE id = ? AND user_id = ?')
    .get(idParsed.data, userId) as
    | { id: string; is_pinned: number; created_at: number }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Note not found.' });
    return;
  }

  const title = parsed.data.title.trim() || 'Untitled note';
  const content = parsed.data.content;
  const isPinned =
    typeof parsed.data.isPinned === 'boolean'
      ? parsed.data.isPinned
        ? 1
        : 0
      : existing.is_pinned;
  const updatedAt = Date.now();

  db.prepare(
    `UPDATE notes
     SET title = ?, content = ?, is_pinned = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(title, content, isPinned, updatedAt, idParsed.data, userId);

  res.json({
    note: {
      id: idParsed.data,
      title,
      content,
      isPinned: isPinned === 1,
      createdAt: existing.created_at,
      updatedAt,
    },
  });
});

notesRouter.patch('/:id/pin', requireCsrf, (req: AuthenticatedRequest, res) => {
  const idParsed = noteIdSchema.safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ error: 'Invalid note ID.' });
    return;
  }

  const parsed = pinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid pin value.' });
    return;
  }

  const userId = req.auth!.user.id;
  const isPinned = parsed.data.isPinned ? 1 : 0;
  const result = db
    .prepare('UPDATE notes SET is_pinned = ? WHERE id = ? AND user_id = ?')
    .run(isPinned, idParsed.data, userId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Note not found.' });
    return;
  }

  const updated = db
    .prepare(
      `SELECT id, user_id, title, content, is_pinned, created_at, updated_at
       FROM notes
       WHERE id = ? AND user_id = ?`
    )
    .get(idParsed.data, userId) as NoteRow;

  res.json({ note: serializeNote(updated) });
});

notesRouter.delete('/:id', requireCsrf, (req: AuthenticatedRequest, res) => {
  const idParsed = noteIdSchema.safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ error: 'Invalid note ID.' });
    return;
  }

  const result = db
    .prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
    .run(idParsed.data, req.auth!.user.id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Note not found.' });
    return;
  }

  res.json({ deleted: true, id: idParsed.data });
});
