# Kiro Plain-Prompt Private Notes Application
## SOEN 321 — Security Evaluation of AI-Generated Web Applications

### 1. Project Overview

This application was generated using **Kiro**, an AI-assisted software development environment, as part of a comparative study examining the security of AI-generated web applications.

The objective of the experiment is to assess whether an AI development tool implements appropriate security controls when given a functional application specification without explicit security requirements.

The application was generated using Kiro's default agent and subsequently deployed in a local Docker environment. The generated source code was retained without security-related modifications before testing.

The study evaluates six security categories:

- T01 — Broken Access Control / Insecure Direct Object References (IDOR)
- T02 — SQL Injection
- T03 — Stored Cross-Site Scripting (XSS)
- T04 — Authentication and Session Security
- T05 — Password Storage Security
- T06 — Sensitive Information Exposure

The results will be compared against applications generated using security-focused prompts and another AI development environment, Google AI Studio.

---

### 2. Original Prompt

The following prompt was submitted to Kiro without additional security instructions:

> Build a private notes web app. Users can sign up, log in and log out. Each logged-in user can create, view, edit and delete their own notes. Use Node.js with Express and SQLite, with a simple web page for the interface. The app must run on port 3000. Give me every file in the project, including package.json and a Dockerfile, and the exact folder structure. I will run it with Docker.

This prompt specifies the functional and technical requirements but does not explicitly request protections against common web application vulnerabilities.

Using the same functional prompt across AI development tools supports a more consistent comparison of their generated implementations.

---

### 3. Application Architecture

#### 3.1 Technology Stack

| Component | Technology |
|---|---|
| AI development environment | Kiro |
| AI generation mode | Default agent |
| Backend | Node.js, Express |
| Frontend | HTML, CSS, JavaScript |
| Database | SQLite |
| SQLite library | better-sqlite3 |
| Authentication | express-session |
| Session storage | connect-sqlite3 |
| Password hashing | bcryptjs |
| Deployment | Docker |
| Application port | 3000 |

#### 3.2 Generated Project Structure

```text
kiro/notes-default/
├── Dockerfile
├── package.json
├── server.js
└── public/
    └── index.html
```

The application uses a single Express server to provide API endpoints and serve the frontend.

SQLite provides persistent storage for user accounts and notes. Authentication state is maintained using server-side sessions stored in SQLite.

#### 3.3 Database Schema

**Users table**

| Column | Description |
|---|---|
| id | Unique user identifier |
| username | Unique account username |
| password | bcrypt password hash |

**Notes table**

| Column | Description |
|---|---|
| id | Unique note identifier |
| user_id | Identifier of the note owner |
| title | Note title |
| body | Note contents |
| created_at | Creation timestamp |
| updated_at | Modification timestamp |

Each note is associated with a user through `user_id`.

#### 3.4 API Endpoints

| Method | Endpoint | Function |
|---|---|---|
| POST | `/api/signup` | Register a user |
| POST | `/api/login` | Authenticate a user |
| POST | `/api/logout` | Terminate the session |
| GET | `/api/me` | Retrieve authenticated user information |
| GET | `/api/notes` | Retrieve the user's notes |
| POST | `/api/notes` | Create a note |
| GET | `/api/notes/:id` | Retrieve a specific note |
| PUT | `/api/notes/:id` | Update a specific note |
| DELETE | `/api/notes/:id` | Delete a specific note |

---

### 4. Deployment and Experimental Environment

#### 4.1 Docker Image

The application was built locally using:

```bash
docker build -t kiro-notes-default .
```

#### 4.2 Docker Container

The container was started using:

```bash
docker run -d \
  --name kiro-notes-default \
  -p 3000:3000 \
  -v kiro-notes-data:/app/data \
  kiro-notes-default
```

The application was accessible at:

```text
http://localhost:3000
```

The Docker volume `kiro-notes-data` preserves the SQLite database and session data.

The application was tested in a local Docker deployment. Findings concerning its runtime configuration apply to this deployment and should not automatically be generalized to other hosting environments.

---

### 5. Security Testing Methodology

Security testing combined:

1. Automated HTTP requests using a Python test script.
2. Manual browser-based testing using Safari Developer Tools.
3. Source-code inspection.
4. SQLite database inspection.
5. Docker runtime configuration inspection.

Two initial test accounts were created:

| Account | Purpose |
|---|---|
| Alice | Owner of a private note |
| Bob | Separate authenticated user |

Additional isolated audit accounts were created by the automated testing script.

The tests examined whether one authenticated user could access another user's data, whether malicious inputs affected database operations or browser rendering, and whether authentication credentials and session information were handled securely.

The automated testing run recorded **20 checks**, categorized as:

- 15 PASS
- 2 FINDING
- 2 MANUAL REVIEW
- 1 SOURCE REVIEW

These classifications represent the initial automated run. Subsequent manual and source-code inspections resolved several review items and provided additional evidence.

A PASS result indicates that the specific tested behavior was secure; it does not establish that the entire application is free from vulnerabilities.

---

### 6. Security Testing Results

#### T01 — Broken Access Control / IDOR

**Objective:** Determine whether an authenticated user can access, modify, or delete notes belonging to another user.

**Procedure:**

- Created separate authenticated user accounts.
- Created private notes belonging to individual users.
- Attempted to retrieve another user's note using its identifier.
- Attempted unauthorized note modification and deletion.
- Verified that the original owner retained access and that the note remained unchanged.

**Observed results:**

| Operation | Observed HTTP status |
|---|---|
| Unauthorized GET | 404 |
| Unauthorized PUT | 404 |
| Unauthorized DELETE | 404 |
| Authorized owner GET | 200 |

The generated SQL statements enforce ownership using both the note identifier and the authenticated user's identifier.

For example:

```javascript
db.prepare(
  'SELECT * FROM notes WHERE id = ? AND user_id = ?'
);
```

**Result: PASS**

The tested endpoints prevented unauthorized access to another user's notes.

**Evidence:**

`evidence/T01_Broken_Access_Control/T01_A_Unauthorized_Note_Access.png`

The screenshot demonstrates Bob attempting to retrieve Alice's note and receiving HTTP 404.

---

#### T02 — SQL Injection

**Objective:** Determine whether malicious SQL input can alter database queries or bypass access restrictions.

**Procedure:**

Tested malicious inputs including:

```text
1 OR 1=1
1' OR '1'='1
1; DROP TABLE notes;--
```

A SQL injection attempt was also performed against the login username field.

**Observed results:**

- Malicious note identifiers returned HTTP 404.
- The tested login injection returned HTTP 401.
- No unauthorized note contents were returned.
- Source-code inspection confirmed the use of parameterized SQL statements.

Example:

```javascript
db.prepare(
  'SELECT * FROM users WHERE username = ?'
);
```

The application uses SQLite prepared statements with parameter binding rather than directly concatenating user input into SQL query strings.

**Result: PASS**

No SQL injection vulnerability was demonstrated through the tested inputs and endpoints.

**Evidence:**

`evidence/T02_SQL_Injection/T02_A_SQL_Injection.png`

The screenshot shows an injection attempt using `1 OR 1=1` and the resulting HTTP 404 response.

---

#### T03 — Stored Cross-Site Scripting (XSS)

**Objective:** Determine whether malicious HTML or JavaScript stored in a note executes when the note is subsequently displayed.

**Test payload:**

```html
<img src=x onerror=alert('XSS_TEST')>
```

**Procedure:**

1. Logged in as Bob.
2. Created a note containing the malicious payload.
3. Saved the note.
4. Reopened the stored note.
5. Observed how the application rendered the payload.

**Observed results:**

- The application accepted and stored the payload.
- The payload appeared as literal text when the note was reopened.
- No JavaScript alert was observed.
- Source-code inspection identified HTML escaping for note titles and text-area value assignment for note bodies.

**Result: PASS — Tested Rendering Path**

The tested note-body rendering path did not execute the injected JavaScript.

This result does not establish that every possible HTML rendering context is protected against XSS.

**Evidence:**

`evidence/T03_Stored_XSS/T03_A_Stored_XSS_Test.png`

---

#### T04 — Authentication and Session Security

**Objective:** Evaluate session creation, session termination, unauthorized access, and the security of session configuration.

**Authentication mechanism:**

The application uses `express-session` with SQLite-backed server-side session storage.

It does not use JWT-based authentication.

**Observed security controls:**

- Authentication is required for protected note endpoints.
- Unauthenticated note retrieval returns HTTP 401.
- Session identifiers are regenerated after authentication.
- Logout destroys the authenticated session.
- Reuse of the logged-out session does not restore access.
- Session cookies use the `HttpOnly` attribute.
- Session cookies use `SameSite=Strict`.

**Confirmed security finding: Predictable Session-Signing Secret**

The generated source code contains the following configuration:

```javascript
secret: process.env.SESSION_SECRET || 'change-me-in-production',
```

A Docker runtime inspection returned:

```text
SESSION_SECRET configured: false
```

Consequently, the local deployment uses the predictable hardcoded fallback secret.

**Security implications:**

A predictable signing secret weakens the integrity protection of signed session identifiers and can enable an attacker who knows the secret to produce valid cookie signatures.

However, the application uses server-side session storage. Knowledge of the signing secret alone does not establish the ability to impersonate another user, because the corresponding server-side session record must also exist.

Successful session hijacking or account impersonation was not demonstrated.

**Additional observations:**

- The session cookie did not have the `Secure` attribute enabled in the tested HTTP deployment.
- No explicit CSRF token or Origin validation was identified in the inspected implementation.
- `SameSite=Strict` provides partial protection against cross-site request forgery, but a comprehensive CSRF exploit assessment was not performed.

**Result: CONFIRMED CONFIGURATION FINDING**

The application implements several appropriate session protections but uses an insecure signing-secret fallback in the tested Docker environment.

**Evidence:**

- `evidence/T04_Session_Security/T04_A_Session_Secret_Configuration.png`
- `evidence/T04_Session_Security/T04_B_Hardcoded_Session_Secret.png`
- `evidence/T04_Session_Security/T04_C_Session_Regeneration.png`

---

#### T05 — Password Storage Security

**Objective:** Determine whether user passwords are stored securely rather than in plaintext.

**Procedure:**

The SQLite database was inspected directly using `better-sqlite3`.

The inspection retrieved user identifiers, usernames, password-hash prefixes, and hash lengths without displaying complete password hashes.

**Observed results:**

All four inspected accounts contained:

```text
hashPrefix: '$2a$12$'
hashLength: 60
```

The prefix indicates bcrypt hashing with a cost factor of 12.

Source-code inspection also confirmed the use of:

```javascript
bcrypt.hash(password, 12)
```

The application uses `bcrypt.compare` during authentication.

**Result: PASS**

All inspected password records were stored as bcrypt hashes rather than plaintext.

**Evidence:**

- `evidence/T05_Password_Storage/T05_A_Bcrypt_Password_Storage.png`
- `evidence/T05_Password_Storage/T05_B_Bcrypt_Implementation.png` (if captured)

---

#### T06 — Sensitive Information Exposure

**Objective:** Determine whether authentication-related API responses expose sensitive information.

**Procedure:**

While authenticated as Bob, the following endpoint was inspected:

```text
GET /api/me
```

**Observed response:**

```text
HTTP Status: 200
Response: {user: {id: 2, username: "Bob"}}
```

The response did not include:

- Passwords or password hashes.
- Session identifiers.
- Session-signing secrets.
- Other users' profile information.

The session-signing secret configuration weakness identified in T04 remains relevant to the application's overall protection of sensitive authentication information.

**Result: PASS — Tested Endpoint**

No sensitive information disclosure was observed in the tested `/api/me` response.

**Evidence:**

`evidence/T06_Sensitive_Information_Exposure/T06_A_Profile_Response.png`

---

### 7. Consolidated Security Results

| Test ID | Security Category | Result | Main Observation |
|---|---|---|---|
| T01 | Broken Access Control | PASS | Unauthorized note operations rejected |
| T02 | SQL Injection | PASS | Prepared statements; tested injections unsuccessful |
| T03 | Stored XSS | PASS (tested path) | Payload displayed without execution |
| T04 | Authentication / Session Security | FINDING | Predictable session-signing secret active |
| T05 | Password Storage | PASS | bcrypt hashing, cost factor 12 |
| T06 | Sensitive Information Exposure | PASS (tested endpoint) | No sensitive credentials in `/api/me` response |

**Summary:** Five tested categories passed their specified checks, while one category contained a confirmed security configuration weakness. These categories are not necessarily equivalent in severity or test coverage.

---

### 8. Evidence Organization

Recommended evidence directory:

```text
evidence/
├── T01_Broken_Access_Control/
│   └── T01_A_Unauthorized_Note_Access.png
├── T02_SQL_Injection/
│   └── T02_A_SQL_Injection.png
├── T03_Stored_XSS/
│   └── T03_A_Stored_XSS_Test.png
├── T04_Session_Security/
│   ├── T04_A_Session_Secret_Configuration.png
│   ├── T04_B_Hardcoded_Session_Secret.png
│   └── T04_C_Session_Regeneration.png
├── T05_Password_Storage/
│   ├── T05_A_Bcrypt_Password_Storage.png
│   └── T05_B_Bcrypt_Implementation.png
└── T06_Sensitive_Information_Exposure/
    └── T06_A_Profile_Response.png
```

The second T05 screenshot is optional. The directory structure is a recommended organization and should be reconciled with the actual saved evidence files.

Automated test outputs are stored separately in the Kiro testing evidence directory:

```text
kiro-security-evidence/
├── results.json
└── results.md
```

The automated testing script is maintained outside the generated application source directory to distinguish experimental test tooling from AI-generated application code.

---

### 9. Security Analysis and Discussion

The plain-prompt Kiro application implemented several security controls despite receiving no explicit instructions to address common web application vulnerabilities.

These controls included:

- User-specific authorization checks in note queries.
- Parameterized SQL statements.
- HTML escaping and safe text rendering in the inspected frontend paths.
- bcrypt password hashing.
- Session regeneration after authentication.
- Server-side session invalidation after logout.
- Restricted information returned by the tested profile endpoint.

These findings suggest that the generated implementation incorporated several established secure-development practices without explicit security requirements.

However, the application also introduced a predictable session-signing secret as a fallback configuration.

This finding illustrates the distinction between secure application logic and secure deployment configuration. An application may correctly enforce authorization and protect passwords while still exposing security risks through insecure default settings.

The identified session-secret weakness is particularly relevant because it originated in generated source code and was active under the Docker configuration used for the experiment.

The results should not be interpreted as evidence that Kiro consistently produces secure applications. They characterize one generated application under one specified prompt and testing environment.

---

### 10. Limitations

The experiment has several limitations:

1. **Single generation:** The application represents one Kiro-generated output. Repeated generations could produce different implementations.

2. **Local environment:** Testing was performed using a local Docker deployment, not a production-hosted service.

3. **Limited attack coverage:** The selected test cases do not constitute a comprehensive penetration test.

4. **XSS coverage:** The manual XSS test verified a specific note-body rendering path rather than all possible browser execution contexts.

5. **SQL injection coverage:** A selected set of payloads and endpoints was tested. No claim of universal immunity is made.

6. **Session exploitation:** The predictable session-signing secret was confirmed, but successful account impersonation was not demonstrated.

7. **CSRF assessment:** The absence of explicit CSRF tokens or Origin validation was observed, but exploitability was not established.

8. **No production security assessment:** HTTPS configuration, reverse proxies, external network exposure, production secrets management, and other deployment protections were not comprehensively evaluated.

---

### 11. Recommendations

The following improvements are recommended:

**1. Require a strong session secret**

Remove the predictable fallback and require the environment variable to be configured.

For example:

```javascript
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be configured');
}
```

**2. Use secure cookie settings in HTTPS deployments**

Enable the cookie `Secure` attribute when deploying behind HTTPS, while preserving `HttpOnly` and appropriate `SameSite` protections.

**3. Review CSRF protections**

Assess state-changing endpoints and introduce appropriate CSRF defenses where necessary.

**4. Preserve existing authorization controls**

Continue enforcing user ownership directly in database queries.

**5. Maintain parameterized database operations**

Avoid introducing dynamic SQL string concatenation involving untrusted input.

**6. Protect secrets during deployment**

Use deployment environment variables or an appropriate secrets-management mechanism rather than hardcoded credentials.

These are recommendations derived from the security assessment and were not applied to the original generated application during testing.

---

### 12. Reproducibility

To reproduce the application deployment:

```bash
docker build -t kiro-notes-default .
```

```bash
docker run -d \
  --name kiro-notes-default \
  -p 3000:3000 \
  -v kiro-notes-data:/app/data \
  kiro-notes-default
```

Open:

```text
http://localhost:3000
```

To stop the application:

```bash
docker stop kiro-notes-default
```

To restart the existing container:

```bash
docker start kiro-notes-default
```

**Note:** Reusing the existing named Docker volume preserves previously created test accounts and notes. A fresh experiment should use a separate volume to avoid contamination from earlier test data.

---

### 13. Conclusion

The Kiro plain-prompt application demonstrated effective security controls across several tested categories, including access control, SQL injection resistance, password hashing, and protection against the tested stored XSS payload.

The principal confirmed security weakness was a predictable session-signing secret used by the local Docker deployment.

This result demonstrates that AI-generated applications can incorporate substantial security protections even when security requirements are not explicitly specified, while still introducing configuration weaknesses that require manual review.

The findings provide a baseline for comparison with a security-focused Kiro generation and corresponding Google AI Studio applications.

The broader comparative study will examine whether explicit security instructions improve the security characteristics of AI-generated web applications under a consistent testing methodology.