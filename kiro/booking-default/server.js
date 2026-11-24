const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = 3000;

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'booking-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000  // 8 hours
  }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth',  require('./routes/authRoutes'));
app.use('/api',       require('./routes/bookingRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// Catch-all: serve index for client-side navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Booking app listening on http://localhost:${PORT}`);
});
