# Security evaluation

## Implementation comparison

Source size counts the physical lines of tracked application JavaScript, TypeScript, HTML, EJS, and CSS files, including comments and blank lines. Build configuration, dependencies, generated output, databases, tests, and evidence are excluded. The test column identifies the repository-level Node test suite for each build. The [application index](../README.md#applications) lists the SQLite drivers and Compose services.

| Build | Source-code size | Tests | Security defences present |
|---|---:|---|---|
| Private Notes · Google AI Studio · Plain | 15 files, 2,082 lines | [Notes Plain suite](../tests/notes-default.test.mjs) | bcrypt password hashing, owner-scoped prepared note queries, JWT verification, `HttpOnly` and `SameSite=Lax` cookies |
| Private Notes · Google AI Studio · Security-focused | 16 files, 2,361 lines | [Shared matrix](../tests/matrix.test.mjs) | scrypt password hashing, owner-scoped queries, hashed session tokens in SQLite, CSRF tokens on mutations, Helmet headers and rate limiting |
| Private Notes · Kiro · Plain | 2 files, 722 lines | [Shared matrix](../tests/matrix.test.mjs) | bcrypt password hashing, owner-scoped prepared note queries, session regeneration on sign-in, `HttpOnly` and `SameSite=Strict` cookies |
| Private Notes · Kiro · Security-focused | 18 files, 1,114 lines | [Shared matrix](../tests/matrix.test.mjs) | bcrypt password hashing, owner-scoped queries, SQLite-backed sessions regenerated on sign-in, rotating CSRF form tokens, Helmet headers, escaped EJS note output |
| Appointment Booking · Google AI Studio · Plain | 16 files, 2,668 lines | [Shared matrix](../tests/matrix.test.mjs) | bcrypt password hashing, HMAC-signed session cookies, role and ownership checks, transactional booking creation |
| Appointment Booking · Google AI Studio · Security-focused | 21 files, 3,346 lines | [Shared matrix](../tests/matrix.test.mjs) | bcrypt password hashing, signed SQLite-backed sessions revoked at logout, role and ownership checks, validation of supplied origins on state-changing API requests, Helmet headers and rate limiting |
| Appointment Booking · Kiro · Plain | 11 files, 955 lines | [Shared matrix](../tests/matrix.test.mjs) | bcrypt password hashing, `HttpOnly` session cookies, admin route guards, owner-scoped booking queries and deletion |
| Appointment Booking · Kiro · Security-focused | 8 files, 1,118 lines | [Shared matrix](../tests/matrix.test.mjs) | bcrypt password hashing, JWT verification restricted to HS256, `HttpOnly` and `SameSite=Strict` cookies, role and ownership checks, transactional booking changes, Helmet headers and rate limiting |

Kiro Notes Plain uses `better-sqlite3` for notes and `connect-sqlite3` for sessions.

## Methodology and findings

The automated T01–T06 evaluation uses disposable local instances, temporary accounts, and isolated SQLite databases. It covers access control and authentication, SQL query binding, output handling, session security, password storage, and sensitive information exposure. Follow the [test reproduction instructions](../tests/README.md) for exact commands. The [consolidated report](../results/comparison.md) contains the per-app findings and individual check outcomes.

- **Confirmed source vulnerabilities** have direct code evidence. The consolidated report identifies embedded signing fallbacks or seed passwords in the plain builds.
- **Manually reproduced vulnerabilities** have separate runtime evidence. Manual V-001 documents an authentication bypass with private-note disclosure in the tested local Docker deployment of Google AI Studio Notes Plain. This reproduction is separate from the automated run. [Manual V-001 report](../google-ai-studio/notes-default/security-evidence/testing-results.md)
- **Suspected findings** have a signal that requires further validation. These include a JWT returned in the login JSON, cookie attribute gaps, and a potential XSS sink in Kiro Booking Plain. [Consolidated findings](../results/comparison.md)
- **Functional failures** are mismatches with an expected behavior without confirmed security impact. Kiro Booking Plain logout omitted the cookie-clearing header. [Kiro Booking Plain results](../results/comparison.md#kirobooking-plain)
- **Skipped checks** were outside scope or inapplicable to a particular app. Runtime SQL injection, browser script execution, and deployment TLS were outside the automated run. Other skips covered specific booking rendering, CSRF or session cases, and HTTPS or JSON-login checks for the EJS app. [Coverage limits and per-check results](../results/comparison.md#coverage-limits)

## Comparative analysis

Google AI Studio consistently generated React and TypeScript clients with Express servers using `better-sqlite3`. Kiro used JavaScript with static browser clients in three builds and server-rendered EJS forms in Security-focused Private Notes, which uses `node:sqlite`. The two builders used different session designs, including JWTs, signed cookies, and SQLite-backed sessions. Password hashing and ownership checks appear in the plain builds from both builders.

In this sample, each security-focused build implemented additional controls and recorded zero failed automated expectations, while each plain build had at least one. All five confirmed source findings occurred in plain builds. This supports an improvement associated with explicitly requesting security controls for these eight outputs. The comparison is limited by unequal skip counts, the routes and configurations exercised, and the separate manual reproduction in one local Docker deployment.
