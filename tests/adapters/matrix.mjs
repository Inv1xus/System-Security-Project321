export const applications = [
  {
    id: 'google-ai-studio/notes-secure', entry: 'server.ts', files: ['server', 'src', 'vite.config.ts', 'index.html', 'tsconfig.json'], build: true,
    account: 'username', signup: 'signup', notes: 'secure-json', proxyCookie: 'server/auth.ts:159', hash: 'password_hash',
    logoutEvidence: 'server/routes/auth.ts:141',
    evidence: ['server/routes/auth.ts:99', 'server/routes/notes.ts:49', 'server/auth.ts:47'],
  },
  {
    id: 'google-ai-studio/booking-default', entry: 'server.ts', files: ['src/server'],
    account: 'email', signup: 'signup', booking: 'google-plain', proxyCookie: 'src/server/auth.ts:78', hash: 'password_hash',
    logoutEvidence: 'server.ts:107',
    evidence: ['server.ts:76', 'server.ts:264', 'server.ts:57'],
    sourceFindings: [['T04.default', 'Source seeds accounts with literal passwords.', 'src/server/db.ts:93']],
  },
  {
    id: 'google-ai-studio/booking-secure', entry: 'server.ts', files: ['server'],
    account: 'email', signup: 'signup', booking: 'google-secure', proxyCookie: 'server/auth.ts:80', hash: 'password_hash',
    logoutEvidence: 'server/routes/auth.ts:123',
    evidence: ['server/routes/auth.ts:76', 'server/routes/bookings.ts:16', 'server/auth.ts:12'],
  },
  {
    id: 'kiro/notes-default', entry: 'server.js', files: ['public'],
    account: 'username', signup: 'signup', prefix: '/api', notes: 'plain-json', hash: 'password',
    logoutEvidence: 'server.js:136',
    evidence: ['server.js:117', 'server.js:153', 'server.js:107'],
    sourceFindings: [['T04.secret', 'Source defines a literal fallback session signing secret.', 'server.js:66']],
  },
  {
    id: 'kiro/notes-secure', entry: 'src/app.js', files: ['src', 'public'],
    account: 'username', signup: 'signup', prefix: '', notes: 'forms', hash: 'password',
    logoutEvidence: 'src/routes/auth.js:140',
    evidence: ['src/routes/auth.js:86', 'src/routes/notes.js:37', 'src/routes/auth.js:60'],
  },
  {
    id: 'kiro/booking-default', entry: 'server.js', files: ['auth.js', 'db.js', 'routes', 'public'],
    account: 'username', signup: 'register', booking: 'kiro-plain', hash: 'password',
    logoutEvidence: 'routes/authRoutes.js:61',
    evidence: ['routes/authRoutes.js:37', 'routes/bookingRoutes.js:58', 'routes/authRoutes.js:19'],
    sourceFindings: [
      ['T04.secret', 'Source defines a literal fallback session signing secret.', 'server.js:14'],
      ['T04.default', 'Source seeds an admin account with a literal password.', 'db.js:54'],
    ],
    suspicion: ['Admin booking HTML interpolates account fields into innerHTML.', 'public/admin.html:138'],
  },
  {
    id: 'kiro/booking-secure', entry: 'server.js', files: ['db.js', 'middleware', 'routes', 'public'],
    account: 'username', signup: 'register', booking: 'kiro-secure', hash: 'password',
    logoutEvidence: 'routes/authRoutes.js:101',
    evidence: ['routes/authRoutes.js:79', 'routes/bookingRoutes.js:10', 'routes/authRoutes.js:68'],
  },
];
