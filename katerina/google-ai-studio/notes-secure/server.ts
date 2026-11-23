import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { checkDatabaseHealth, db, purgeExpiredSessions } from './server/db.ts';
import { authRouter } from './server/routes/auth.ts';
import { notesRouter } from './server/routes/notes.ts';

const PORT = Number(process.env.PORT) || 3000;
const isDev = process.env.NODE_ENV === 'development';
const disallowIframe = process.env.ALLOW_IFRAME === 'false';

async function startServer(): Promise<void> {
  purgeExpiredSessions();
  const cleanupTimer = setInterval(() => {
    try {
      purgeExpiredSessions();
    } catch (err) {
      console.error('Failed to purge expired sessions:', err);
    }
  }, 60 * 60 * 1000);
  cleanupTimer.unref();

  const app = express();

  // Trust single reverse proxy hop (Cloud Run, Nginx, Caddy) for accurate req.secure & rate-limit IP
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      xFrameOptions: disallowIframe ? { action: 'deny' } : false,
      contentSecurityPolicy: isDev
        ? false
        : {
            directives: {
              upgradeInsecureRequests: null,
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              fontSrc: ["'self'", 'https://fonts.gstatic.com'],
              imgSrc: ["'self'", 'data:'],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              frameAncestors: disallowIframe ? ["'none'"] : ['*'],
            },
          },
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 200,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
  });
  app.use('/api', apiLimiter);

  app.get('/api/health', (_req: Request, res: Response) => {
    try {
      const ok = checkDatabaseHealth();
      if (!ok) {
        res.status(503).json({ ok: false });
        return;
      }
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/notes', notesRouter);

  // Return JSON 404 for unknown API endpoints instead of falling through to SPA HTML
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Global error handler (handles malformed JSON bodies without leaking stack traces)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
      res.status(400).json({ error: 'Invalid JSON request body.' });
      return;
    }
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexHtml = path.join(distDir, 'index.html');

    if (!fs.existsSync(indexHtml)) {
      console.error('Production build not found at dist/index.html. Run "npm run build" first.');
      process.exit(1);
    }

    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );

    app.use(
      express.static(distDir, {
        index: false,
        maxAge: '1h',
      })
    );

    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Folio server listening on http://0.0.0.0:${PORT}`);
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    clearInterval(cleanupTimer);
    server.close(() => {
      try {
        db.close();
      } catch (err) {
        console.error('Error closing SQLite database:', err);
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
