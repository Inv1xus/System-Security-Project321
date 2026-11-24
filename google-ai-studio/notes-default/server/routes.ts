import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { requireAuth, generateToken, TOKEN_COOKIE_NAME, AuthenticatedRequest } from './auth.js';

export const apiRouter = Router();

// ==================== AUTHENTICATION ROUTES ====================

// Register new user
apiRouter.post('/auth/register', (req, res): void => {
  try {
    const { username, password, email } = req.body;

    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      res.status(400).json({ error: 'Username must be at least 3 characters long.' });
      return;
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const trimmedUsername = username.trim();
    const cleanEmail = email && typeof email === 'string' ? email.trim() : null;

    // Check if username already exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(trimmedUsername);
    if (existing) {
      res.status(409).json({ error: 'Username is already taken. Please choose another.' });
      return;
    }

    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    // Insert user into SQLite
    const insertStmt = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    );
    const result = insertStmt.run(trimmedUsername, cleanEmail, passwordHash);
    const userId = Number(result.lastInsertRowid);

    // Create a friendly onboarding note for the new user
    const insertNoteStmt = db.prepare(`
      INSERT INTO notes (user_id, title, content, category, is_pinned)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertNoteStmt.run(
      userId,
      '👋 Welcome to VaultNotes!',
      `# Welcome to your Private Notes Vault\n\nYour notes are stored securely in a local **SQLite database**.\n\n### Quick Features:\n- 🔒 **Private & Isolated**: Only you can view, edit, or delete your notes.\n- 📌 **Pin Important Notes**: Keep critical thoughts at the top.\n- 🏷️ **Categories**: Organize notes by Work, Ideas, Personal, or custom tags.\n- 🔍 **Instant Search**: Search through titles and contents in real-time.\n- 📝 **Markdown Support**: Headers, bullets, checkboxes, and formatting.\n\nEnjoy writing! Feel free to edit or delete this note at any time.`,
      'Welcome',
      1
    );

    const user = { id: userId, username: trimmedUsername, email: cleanEmail };
    const token = generateToken(user);

    // Set HTTP-only cookie
    res.cookie(TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.status(201).json({ user, token });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

// Login
apiRouter.post('/auth/login', (req, res): void => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    const trimmedUsername = (username as string).trim();
    const userRow = db.prepare(
      'SELECT id, username, email, password_hash FROM users WHERE username = ?'
    ).get(trimmedUsername) as { id: number; username: string; email: string | null; password_hash: string } | undefined;

    if (!userRow) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    const isMatch = bcrypt.compareSync(password, userRow.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    const user = { id: userRow.id, username: userRow.username, email: userRow.email };
    const token = generateToken(user);

    res.cookie(TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({ user, token });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to log in. Please try again.' });
  }
});

// Logout
apiRouter.post('/auth/logout', (_req, res): void => {
  res.clearCookie(TOKEN_COOKIE_NAME);
  res.json({ message: 'Logged out successfully' });
});

// Get current session user
apiRouter.get('/auth/me', (req: AuthenticatedRequest, res: Response): void => {
  requireAuth(req, res, () => {
    res.json({ user: req.user });
  });
});

// ==================== NOTES CRUD ROUTES ====================

// List all notes for the authenticated user
apiRouter.get('/notes', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const { search, category, pinned } = req.query;

    let query = 'SELECT id, user_id, title, content, category, is_pinned, created_at, updated_at FROM notes WHERE user_id = ?';
    const params: any[] = [userId];

    if (category && typeof category === 'string' && category.trim() !== '' && category !== 'All') {
      query += ' AND category = ?';
      params.push(category.trim());
    }

    if (pinned === 'true') {
      query += ' AND is_pinned = 1';
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      query += ' AND (title LIKE ? OR content LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    query += ' ORDER BY is_pinned DESC, updated_at DESC';

    const notes = db.prepare(query).all(...params);
    res.json({ notes });
  } catch (error: any) {
    console.error('Fetch notes error:', error);
    res.status(500).json({ error: 'Failed to retrieve notes.' });
  }
});

// Get single note by ID
apiRouter.get('/notes/:id', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const noteId = Number(req.params.id);

    if (isNaN(noteId)) {
      res.status(400).json({ error: 'Invalid note ID.' });
      return;
    }

    const note = db.prepare(
      'SELECT id, user_id, title, content, category, is_pinned, created_at, updated_at FROM notes WHERE id = ? AND user_id = ?'
    ).get(noteId, userId);

    if (!note) {
      res.status(404).json({ error: 'Note not found or does not belong to you.' });
      return;
    }

    res.json({ note });
  } catch (error: any) {
    console.error('Get note error:', error);
    res.status(500).json({ error: 'Failed to retrieve note.' });
  }
});

// Create note
apiRouter.post('/notes', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const { title, content, category, is_pinned } = req.body;

    const cleanTitle = (title && typeof title === 'string') ? title.trim() : 'Untitled Note';
    const cleanContent = typeof content === 'string' ? content : '';
    const cleanCategory = (category && typeof category === 'string' && category.trim()) ? category.trim() : 'General';
    const pinnedVal = is_pinned ? 1 : 0;

    const stmt = db.prepare(`
      INSERT INTO notes (user_id, title, content, category, is_pinned, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const result = stmt.run(userId, cleanTitle, cleanContent, cleanCategory, pinnedVal);
    const newNoteId = Number(result.lastInsertRowid);

    const createdNote = db.prepare(
      'SELECT id, user_id, title, content, category, is_pinned, created_at, updated_at FROM notes WHERE id = ?'
    ).get(newNoteId);

    res.status(201).json({ note: createdNote });
  } catch (error: any) {
    console.error('Create note error:', error);
    res.status(500).json({ error: 'Failed to create note.' });
  }
});

// Update note
apiRouter.put('/notes/:id', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const noteId = Number(req.params.id);

    if (isNaN(noteId)) {
      res.status(400).json({ error: 'Invalid note ID.' });
      return;
    }

    // Check ownership
    const existing = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(noteId, userId);
    if (!existing) {
      res.status(404).json({ error: 'Note not found or access denied.' });
      return;
    }

    const { title, content, category, is_pinned } = req.body;

    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(typeof title === 'string' ? title.trim() || 'Untitled Note' : 'Untitled Note');
    }

    if (content !== undefined) {
      updates.push('content = ?');
      params.push(typeof content === 'string' ? content : '');
    }

    if (category !== undefined) {
      updates.push('category = ?');
      params.push(typeof category === 'string' && category.trim() ? category.trim() : 'General');
    }

    if (is_pinned !== undefined) {
      updates.push('is_pinned = ?');
      params.push(is_pinned ? 1 : 0);
    }

    params.push(noteId, userId);

    const updateSql = `UPDATE notes SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`;
    db.prepare(updateSql).run(...params);

    const updatedNote = db.prepare(
      'SELECT id, user_id, title, content, category, is_pinned, created_at, updated_at FROM notes WHERE id = ?'
    ).get(noteId);

    res.json({ note: updatedNote });
  } catch (error: any) {
    console.error('Update note error:', error);
    res.status(500).json({ error: 'Failed to update note.' });
  }
});

// Delete note
apiRouter.delete('/notes/:id', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const noteId = Number(req.params.id);

    if (isNaN(noteId)) {
      res.status(400).json({ error: 'Invalid note ID.' });
      return;
    }

    const result = db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(noteId, userId);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Note not found or already deleted.' });
      return;
    }

    res.json({ success: true, message: 'Note deleted successfully.' });
  } catch (error: any) {
    console.error('Delete note error:', error);
    res.status(500).json({ error: 'Failed to delete note.' });
  }
});

// Get user categories
apiRouter.get('/categories', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const rows = db.prepare(`
      SELECT category, count(*) as count 
      FROM notes 
      WHERE user_id = ? 
      GROUP BY category 
      ORDER BY count DESC
    `).all(userId);

    res.json({ categories: rows });
  } catch (error: any) {
    console.error('Categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories.' });
  }
});

// User overview stats
apiRouter.get('/stats', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const total = db.prepare('SELECT count(*) as total FROM notes WHERE user_id = ?').get(userId) as { total: number };
    const pinned = db.prepare('SELECT count(*) as pinned FROM notes WHERE user_id = ? AND is_pinned = 1').get(userId) as { pinned: number };
    
    res.json({
      totalNotes: total.total,
      pinnedNotes: pinned.pinned,
    });
  } catch (error: any) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats.' });
  }
});
