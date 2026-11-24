'use strict';

const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Validate required env vars before anything else
const REQUIRED_ENV = ['JWT_SECRET', 'ADMIN_PASSWORD'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: Environment variable ${key} is not set.`);
    process.exit(1);
  }
}

// db.js seeds the admin and exits on error — import after env check
require('./db');

const authRoutes    = require('./routes/authRoutes');
const slotRoutes    = require('./routes/slotRoutes');
const bookingRoutes = require('./routes/bookingRoutes');

const app = express();

// --- Security headers via Helmet ---
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"], // needed for inline style in single-file UI
        imgSrc:     ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc:    ["'self'"],
        objectSrc:  ["'none'"],
        frameSrc:   ["'none'"],
        upgradeInsecureRequests:
          process.env.LOCAL_HTTP_TEST === 'true' ? null : [],
      },
    },
    crossOriginEmbedderPolicy: false, // relaxed for single-origin SPA
  })
);

// Trust proxy only if explicitly configured (e.g. behind Nginx/load balancer)
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// --- Global rate limit ---
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  })
);

// --- Body parsing (limit to prevent large-payload attacks) ---
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(cookieParser());

// --- Static files ---
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// --- API routes ---
app.use('/api/auth',     authRoutes);
app.use('/api/slots',    slotRoutes);
app.use('/api/bookings', bookingRoutes);

// Serve SPA for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Centralised error handler ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Booking app running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;
