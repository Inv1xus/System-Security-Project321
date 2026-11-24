'use strict';

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// All notes routes require authentication
router.use(requireAuth);

const titleRules = body('title')
  .trim()
  .isLength({ min: 1, max: 200 })
  .withMessage('Title must be 1–200 characters.')
  .escape();

const bodyRules = body('body')
  .trim()
  .isLength({ max: 50000 })
  .withMessage('Note body cannot exceed 50 000 characters.');

const noteIdParam = param('id')
  .isInt({ min: 1 })
  .withMessage('Invalid note ID.')
  .toInt();

// Helper: fetch a note that belongs to the current user, or 404
function ownNote(noteId, userId) {
  return db
    .prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?')
    .get(noteId, userId);
}

// ── GET /notes ────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const notes = db
    .prepare(
      'SELECT id, title, created_at, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC'
    )
    .all(req.session.userId);
  res.render('notes/index', { notes });
});

// ── GET /notes/new ────────────────────────────────────────────────────────────
router.get('/new', (req, res) => {
  res.render('notes/form', { note: null, errors: [], values: {} });
});

// ── POST /notes ───────────────────────────────────────────────────────────────
router.post('/', titleRules, bodyRules, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('notes/form', {
      note: null,
      errors: errors.array(),
      values: { title: req.body.title, body: req.body.body },
    });
  }

  const { title, body: noteBody } = req.body;
  const result = db
    .prepare(
      'INSERT INTO notes (user_id, title, body) VALUES (?, ?, ?)'
    )
    .run(req.session.userId, title, noteBody);

  res.redirect(`/notes/${result.lastInsertRowid}`);
});

// ── GET /notes/:id ────────────────────────────────────────────────────────────
router.get('/:id', noteIdParam, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).render('error', { message: 'Invalid note ID.' });

  const note = ownNote(req.params.id, req.session.userId);
  if (!note) return res.status(404).render('error', { message: 'Note not found.' });

  res.render('notes/show', { note });
});

// ── GET /notes/:id/edit ───────────────────────────────────────────────────────
router.get('/:id/edit', noteIdParam, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).render('error', { message: 'Invalid note ID.' });

  const note = ownNote(req.params.id, req.session.userId);
  if (!note) return res.status(404).render('error', { message: 'Note not found.' });

  res.render('notes/form', { note, errors: [], values: { title: note.title, body: note.body } });
});

// ── POST /notes/:id/edit ──────────────────────────────────────────────────────
router.post('/:id/edit', noteIdParam, titleRules, bodyRules, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const note = ownNote(req.params.id, req.session.userId);
    return res.status(400).render('notes/form', {
      note,
      errors: errors.array(),
      values: { title: req.body.title, body: req.body.body },
    });
  }

  const note = ownNote(req.params.id, req.session.userId);
  if (!note) return res.status(404).render('error', { message: 'Note not found.' });

  const { title, body: noteBody } = req.body;
  db.prepare(
    "UPDATE notes SET title = ?, body = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(title, noteBody, note.id, req.session.userId);

  res.redirect(`/notes/${note.id}`);
});

// ── POST /notes/:id/delete ────────────────────────────────────────────────────
router.post('/:id/delete', noteIdParam, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).render('error', { message: 'Invalid note ID.' });

  const note = ownNote(req.params.id, req.session.userId);
  if (!note) return res.status(404).render('error', { message: 'Note not found.' });

  db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
    .run(note.id, req.session.userId);

  res.redirect('/notes');
});

module.exports = router;
