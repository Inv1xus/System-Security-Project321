# SOEN 321 security evaluation

The tables count individual checks. A failed expectation is classified by its evidence. Skipped checks are counted separately. Runtime findings are based on disposable local instances. Source findings describe the checked-in application.

## Methodology

The automated checks retain the manual evidence families. T01 covers access control, including authentication and owner workflows. T02 covers SQL injection controls. T03 covers XSS and output handling. T04 covers hardcoded secrets and session security. T05 covers password storage. T06 covers sensitive information exposure. Suffixes identify individual automated checks.

- **Source inspection** examines the checked-in implementation for controls and observable defects. A confirmed source finding has direct code evidence, such as a literal signing fallback.
- **Runtime checks** use disposable local instances with temporary accounts and databases. They compare observed responses or state changes with the expected behavior. A confirmed runtime vulnerability requires an observed security impact, such as unauthorized disclosure or mutation.
- **Suspected vulnerabilities** have a source or runtime signal with incomplete evidence of security impact. Functional failures record a behavior mismatch without established security impact. Kiro Booking Plain logout is a functional failure because the response omitted the cookie-clearing header.
- **Untested conditions** are checks that were skipped or outside the exercised scope, with reasons recorded. They are excluded from pass counts.

Manual evidence — [Google AI Studio Notes Plain](../google-ai-studio/notes-plain/security-evidence) and [Kiro Notes Plain](../kiro/notes-plain/evidence).

## Results summary

| Application | Pass | Fail | Skip | Confirmed in source | Confirmed at runtime | Suspected | Functional failures | Runtime coverage |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| google-ai-studio/notes-plain | 14 | 2 | 3 | 1 | 0 | 1 | 0 | Local fixture run completed |
| google-ai-studio/notes-secure | 16 | 0 | 2 | 0 | 0 | 0 | 0 | Local fixture run completed |
| google-ai-studio/booking-plain | 13 | 1 | 5 | 1 | 0 | 0 | 0 | Local fixture run completed |
| google-ai-studio/booking-secure | 15 | 0 | 3 | 0 | 0 | 0 | 0 | Local fixture run completed |
| kiro/notes-plain | 14 | 2 | 3 | 1 | 0 | 1 | 0 | Local fixture run completed |
| kiro/notes-secure | 15 | 0 | 4 | 0 | 0 | 0 | 0 | Local fixture run completed |
| kiro/booking-plain | 10 | 5 | 6 | 2 | 0 | 2 | 1 | Local fixture run completed |
| kiro/booking-secure | 12 | 0 | 6 | 0 | 0 | 0 | 0 | Local fixture run completed |

## google-ai-studio/notes-plain

Node v24.9.0 on darwin/arm64.
Installer version Bun 1.4.5. Dependency lock mode was reconciled in staging.
Runtime packages — better-sqlite3 13.0.3, bcryptjs 3.0.3, express 4.22.3, tsx 4.23.15, jsonwebtoken 9.0.3, esbuild 0.28.2, react 19.3.1, react-dom 19.3.1.

[Machine-readable results](google-notes-plain.json)

| ID | Expected | Actual | Status | Assessment | Evidence type | Source reference |
|---|---|---|---|---|---|---|
| T01.auth | Anonymous notes request returns 401. | HTTP 401 | Pass | Successful security control | runtime | [server/routes.ts:137](../google-ai-studio/notes-plain/server/routes.ts#L137) |
| T01.credentials | Incorrect password returns 401. | HTTP 401 | Pass | Successful security control | runtime | [server/routes.ts:79](../google-ai-studio/notes-plain/server/routes.ts#L79) |
| T01.crud | Owner can create, read, update and delete a note. | Create HTTP 201. Read, update, reread, delete, final read HTTP 200, 200, 200, 200, 404 | Pass | Functional baseline passed | runtime | [server/routes.ts:171](../google-ai-studio/notes-plain/server/routes.ts#L171) |
| T01.read | Non-owner request is denied and the owner note remains intact. | Non-owner HTTP 404. Owner note intact true | Pass | Successful security control | runtime | [server/routes.ts:171](../google-ai-studio/notes-plain/server/routes.ts#L171) |
| T01.update | Non-owner request is denied and the owner note remains intact. | Non-owner HTTP 404. Owner note intact true | Pass | Successful security control | runtime | [server/routes.ts:228](../google-ai-studio/notes-plain/server/routes.ts#L228) |
| T01.delete | Non-owner request is denied and the owner note remains intact. | Non-owner HTTP 404. Owner note intact true | Pass | Successful security control | runtime | [server/routes.ts:287](../google-ai-studio/notes-plain/server/routes.ts#L287) |
| T02.literal | Ordinary punctuation remains literal in note storage and search. | Search HTTP 200. Exact fixture selected true | Pass | Literal handling verified | runtime | [server/routes.ts:137](../google-ai-studio/notes-plain/server/routes.ts#L137), [server/routes.ts:198](../google-ai-studio/notes-plain/server/routes.ts#L198) |
| T02.binding | The login lookup uses a SQL placeholder for the supplied account identifier. | Reviewed source contains a bound account lookup. | Pass | Successful security control | source | [server/routes.ts:89](../google-ai-studio/notes-plain/server/routes.ts#L89) |
| T02.injection | SQL statements keep user values separate from SQL syntax. | Source review found bound inputs in login, search, create and update. Runtime injection coverage was outside scope. | Skip | Untested | untested | [server/routes.ts:89](../google-ai-studio/notes-plain/server/routes.ts#L89), [server/routes.ts:137](../google-ai-studio/notes-plain/server/routes.ts#L137), [server/routes.ts:198](../google-ai-studio/notes-plain/server/routes.ts#L198), [server/routes.ts:244](../google-ai-studio/notes-plain/server/routes.ts#L244) |
| T03.storage | Inert markup is preserved as note text over JSON. | JSON content matched input true | Pass | API baseline passed | runtime | [server/routes.ts:198](../google-ai-studio/notes-plain/server/routes.ts#L198) |
| T03.render | The Markdown component escapes inert HTML markup during React rendering. | Inert markup escaped in React static output true | Pass | Successful security control | runtime | [src/components/MarkdownView.tsx:97](../google-ai-studio/notes-plain/src/components/MarkdownView.tsx#L97) |
| T03.browser | Browser rendering treats note markup as text. | Browser DOM behavior and script execution were not tested. | Skip | Untested | untested | [src/components/MarkdownView.tsx:97](../google-ai-studio/notes-plain/src/components/MarkdownView.tsx#L97) |
| T04.secret | Authentication has no literal fallback signing secret. | Source defines a literal JWT signing fallback. | Fail | Confirmed security vulnerability | source | [server/auth.ts:5](../google-ai-studio/notes-plain/server/auth.ts#L5) |
| T04.cookie | Production login cookie declares HttpOnly, Secure and SameSite=Lax. | HttpOnly true, Secure true, SameSite=Lax true | Pass | Successful security control | runtime | [server/routes.ts:107](../google-ai-studio/notes-plain/server/routes.ts#L107) |
| T04.logout | Logout clears the browser cookie. | HTTP 200. Clearing header present true | Pass | Successful security control | runtime | [server/routes.ts:122](../google-ai-studio/notes-plain/server/routes.ts#L122) |
| T04.revocation | Logout invalidates the server-side credential. | Source logout clears the cookie and does not revoke issued JWTs. Credential replay was not exercised. | Skip | Untested | untested | [server/routes.ts:122](../google-ai-studio/notes-plain/server/routes.ts#L122), [server/auth.ts:42](../google-ai-studio/notes-plain/server/auth.ts#L42) |
| T05.hash | Two accounts with the same fixture password have distinct bcrypt salts and no plaintext password field. | Rows 2, bcrypt true, distinct salts true, plaintext in password hash field false | Pass | Successful security control | runtime | [server/routes.ts:36](../google-ai-studio/notes-plain/server/routes.ts#L36), [server/db.ts:21](../google-ai-studio/notes-plain/server/db.ts#L21) |
| T06.profile | Current-user response exposes only the account field allowlist. | HTTP 200. Exact field allowlist matched true | Pass | Successful security control | runtime | [server/routes.ts:128](../google-ai-studio/notes-plain/server/routes.ts#L128), [server/auth.ts:45](../google-ai-studio/notes-plain/server/auth.ts#L45) |
| T06.token | Cookie-auth login does not also return a token in its JSON body. | Login JSON contains a token field true | Fail | Suspected vulnerability | runtime | [server/routes.ts:107](../google-ai-studio/notes-plain/server/routes.ts#L107) |

## google-ai-studio/notes-secure

Node v24.9.0 on darwin/arm64.
Installer version 1.4.5. Dependency lock mode was reconciled in staging.
Runtime packages — express 4.22.3, better-sqlite3 13.2.0.

[Machine-readable results](google-ai-studio-notes-secure.json)

| ID | Expected | Actual | Status | Assessment | Evidence type | Source reference |
|---|---|---|---|---|---|---|
| T01.auth | Anonymous clients are denied access to the protected resource. | HTTP 401 | Pass | Successful security control | runtime | [server/routes/notes.ts:49](../google-ai-studio/notes-secure/server/routes/notes.ts#L49) |
| T01.credentials | An incorrect password is denied. | HTTP 401 | Pass | Successful security control | runtime | [server/routes/auth.ts:99](../google-ai-studio/notes-secure/server/routes/auth.ts#L99) |
| T01.crud | Owner can create, read, update and delete a note. | Read, update, reread, delete, final read HTTP 200, 200, 200, 200, 404 | Pass | Functional baseline passed | runtime | [server/routes/notes.ts:49](../google-ai-studio/notes-secure/server/routes/notes.ts#L49) |
| T01.read | Non-owner action is denied and owner state remains intact. | Non-owner HTTP 404. Owner state intact true | Pass | Successful security control | runtime | [server/routes/notes.ts:49](../google-ai-studio/notes-secure/server/routes/notes.ts#L49) |
| T01.update | Non-owner action is denied and owner state remains intact. | Non-owner HTTP 404. Owner state intact true | Pass | Successful security control | runtime | [server/routes/notes.ts:49](../google-ai-studio/notes-secure/server/routes/notes.ts#L49) |
| T01.delete | Non-owner action is denied and owner state remains intact. | Non-owner HTTP 404. Owner state intact true | Pass | Successful security control | runtime | [server/routes/notes.ts:49](../google-ai-studio/notes-secure/server/routes/notes.ts#L49) |
| T02.literal | Input with ordinary punctuation remains literal across storage and retrieval. | Stored fixture matched literal input true | Pass | Functional baseline passed | runtime | [server/routes/notes.ts:49](../google-ai-studio/notes-secure/server/routes/notes.ts#L49) |
| T02.binding | The login lookup uses a SQL placeholder for the supplied account identifier. | Reviewed source contains a bound account lookup. | Pass | Successful security control | source | [server/routes/auth.ts:99](../google-ai-studio/notes-secure/server/routes/auth.ts#L99) |
| T02.injection | SQL inputs are evaluated for parameter binding. | Runtime SQL injection was outside scope. See T02.binding for the source check. | Skip | Untested | untested | [server/routes/notes.ts:49](../google-ai-studio/notes-secure/server/routes/notes.ts#L49) |
| T03.storage | Inert markup is handled as text on the tested output path. | JSON content equals fixture text true | Pass | Functional baseline passed | runtime | [server/routes/notes.ts:49](../google-ai-studio/notes-secure/server/routes/notes.ts#L49) |
| T03.browser | Browser DOM behavior is evaluated. | Browser DOM behavior and script execution were not exercised. | Skip | Untested | untested | [server/routes/notes.ts:49](../google-ai-studio/notes-secure/server/routes/notes.ts#L49) |
| T04.cookie | Login cookie declares HttpOnly, SameSite and Secure under production or proxy-indicated HTTPS as applicable. | HttpOnly true, SameSite true, Secure true with proxy HTTPS header. | Pass | Successful security control | runtime | [server/auth.ts:159](../google-ai-studio/notes-secure/server/auth.ts#L159) |
| T04.csrf | Documented anti-CSRF controls reject an invalid authenticated write. | HTTP 403 | Pass | Successful security control | runtime | [server/routes/notes.ts:49](../google-ai-studio/notes-secure/server/routes/notes.ts#L49) |
| T04.logout | Logout succeeds and returns a cookie-clearing header. | HTTP 200. Clearing header present true | Pass | Successful security control | runtime | [server/routes/auth.ts:141](../google-ai-studio/notes-secure/server/routes/auth.ts#L141) |
| T04.revocation | Logout removes one session record from the isolated store. | Session row count decreased by 1 | Pass | Successful security control | runtime | [server/routes/auth.ts:141](../google-ai-studio/notes-secure/server/routes/auth.ts#L141) |
| T05.hash | Temporary passwords are salted bcrypt or scrypt values with distinct salts. | Rows 2, expected format true, distinct salts true, plaintext false | Pass | Successful security control | runtime | [server/auth.ts:47](../google-ai-studio/notes-secure/server/auth.ts#L47) |
| T06.profile | The second account profile exposes no password or session fields. | Sensitive field present false | Pass | Successful security control | runtime | [server/routes/auth.ts:99](../google-ai-studio/notes-secure/server/routes/auth.ts#L99) |
| T06.token | Login does not return a session token in the JSON body. | Login JSON token field present false | Pass | Successful security control | runtime | [server/routes/auth.ts:99](../google-ai-studio/notes-secure/server/routes/auth.ts#L99) |

## google-ai-studio/booking-plain

Node v24.9.0 on darwin/arm64.
Installer version 1.4.5. Dependency lock mode was reconciled in staging.
Runtime packages — express 4.22.3, better-sqlite3 13.2.0, bcryptjs 3.0.3.

[Machine-readable results](google-ai-studio-booking-plain.json)

| ID | Expected | Actual | Status | Assessment | Evidence type | Source reference |
|---|---|---|---|---|---|---|
| T01.auth | Anonymous clients are denied access to the protected resource. | HTTP 401 | Pass | Successful security control | runtime | [server.ts:264](../google-ai-studio/booking-plain/server.ts#L264) |
| T01.credentials | An incorrect password is denied. | HTTP 401 | Pass | Successful security control | runtime | [server.ts:76](../google-ai-studio/booking-plain/server.ts#L76) |
| T01.admin | Ordinary user cannot create a slot through the admin operation. | Non-admin HTTP 403. Created slot identifier present false | Pass | Successful security control | runtime | [server.ts:264](../google-ai-studio/booking-plain/server.ts#L264) |
| T01.crud | Admin creates a slot and owner creates and lists a booking. | Owner listing contains the booking true | Pass | Functional baseline passed | runtime | [server.ts:264](../google-ai-studio/booking-plain/server.ts#L264) |
| T01.read | Second user cannot see the owner booking. | Owner booking visible to second user false | Pass | Successful security control | runtime | [server.ts:264](../google-ai-studio/booking-plain/server.ts#L264) |
| T01.cancel | Second user cannot cancel the booking and the owner can. | Non-owner HTTP 403, duplicate HTTP 409, owner HTTP 200 | Pass | Successful security control | runtime | [server.ts:264](../google-ai-studio/booking-plain/server.ts#L264) |
| T02.literal | Input with ordinary punctuation remains literal across storage and retrieval. | Created slot title matched literal input true | Pass | Functional baseline passed | runtime | [server.ts:264](../google-ai-studio/booking-plain/server.ts#L264) |
| T02.binding | The login lookup uses a SQL placeholder for the supplied account identifier. | Reviewed source contains a bound account lookup. | Pass | Successful security control | source | [server.ts:76](../google-ai-studio/booking-plain/server.ts#L76) |
| T02.injection | SQL inputs are evaluated for parameter binding. | Runtime SQL injection was outside scope. See T02.binding for the source check. | Skip | Untested | untested | [server.ts:264](../google-ai-studio/booking-plain/server.ts#L264) |
| T03.storage | Inert markup is handled as text on the tested output path. | Browser rendering of booking fields was not exercised. | Skip | Untested | untested | [server.ts:264](../google-ai-studio/booking-plain/server.ts#L264) |
| T03.browser | Browser DOM behavior is evaluated. | Browser DOM behavior and script execution were not exercised. | Skip | Untested | untested | [server.ts:264](../google-ai-studio/booking-plain/server.ts#L264) |
| T04.default | Authentication has no embedded default secret or password. | Source seeds accounts with literal passwords. | Fail | Confirmed security vulnerability | source | [src/server/db.ts:93](../google-ai-studio/booking-plain/src/server/db.ts#L93) |
| T04.cookie | Login cookie declares HttpOnly, SameSite and Secure under production or proxy-indicated HTTPS as applicable. | HttpOnly true, SameSite true, Secure true with proxy HTTPS header. | Pass | Successful security control | runtime | [src/server/auth.ts:78](../google-ai-studio/booking-plain/src/server/auth.ts#L78) |
| T04.csrf | Documented anti-CSRF controls reject an invalid authenticated write. | No adapter-specific CSRF control was exercised. | Skip | Untested | untested | [server.ts:264](../google-ai-studio/booking-plain/server.ts#L264) |
| T04.logout | Logout succeeds and returns a cookie-clearing header. | HTTP 200. Clearing header present true | Pass | Successful security control | runtime | [server.ts:107](../google-ai-studio/booking-plain/server.ts#L107) |
| T04.revocation | Logout removes one session record from the isolated store. | No SQLite session row to inspect. Credential replay, fixation and expiry were outside scope. | Skip | Untested | untested | [server.ts:107](../google-ai-studio/booking-plain/server.ts#L107) |
| T05.hash | Temporary passwords are salted bcrypt or scrypt values with distinct salts. | Rows 2, expected format true, distinct salts true, plaintext false | Pass | Successful security control | runtime | [server.ts:57](../google-ai-studio/booking-plain/server.ts#L57) |
| T06.profile | The second account profile exposes no password or session fields. | Sensitive field present false | Pass | Successful security control | runtime | [server.ts:76](../google-ai-studio/booking-plain/server.ts#L76) |
| T06.token | Login does not return a session token in the JSON body. | Login JSON token field present false | Pass | Successful security control | runtime | [server.ts:76](../google-ai-studio/booking-plain/server.ts#L76) |

## google-ai-studio/booking-secure

Node v24.9.0 on darwin/arm64.
Installer version 1.4.5. Dependency lock mode was reconciled in staging.
Runtime packages — express 4.22.3, better-sqlite3 13.2.0, bcryptjs 3.0.3.

[Machine-readable results](google-ai-studio-booking-secure.json)

| ID | Expected | Actual | Status | Assessment | Evidence type | Source reference |
|---|---|---|---|---|---|---|
| T01.auth | Anonymous clients are denied access to the protected resource. | HTTP 401 | Pass | Successful security control | runtime | [server/routes/bookings.ts:16](../google-ai-studio/booking-secure/server/routes/bookings.ts#L16) |
| T01.credentials | An incorrect password is denied. | HTTP 401 | Pass | Successful security control | runtime | [server/routes/auth.ts:76](../google-ai-studio/booking-secure/server/routes/auth.ts#L76) |
| T01.admin | Ordinary user cannot create a slot through the admin operation. | Non-admin HTTP 403. Created slot identifier present false | Pass | Successful security control | runtime | [server/routes/bookings.ts:16](../google-ai-studio/booking-secure/server/routes/bookings.ts#L16) |
| T01.crud | Admin creates a slot and owner creates and lists a booking. | Owner listing contains the booking true | Pass | Functional baseline passed | runtime | [server/routes/bookings.ts:16](../google-ai-studio/booking-secure/server/routes/bookings.ts#L16) |
| T01.read | Second user cannot see the owner booking. | Owner booking visible to second user false | Pass | Successful security control | runtime | [server/routes/bookings.ts:16](../google-ai-studio/booking-secure/server/routes/bookings.ts#L16) |
| T01.cancel | Second user cannot cancel the booking and the owner can. | Non-owner HTTP 403, duplicate HTTP 409, owner HTTP 200 | Pass | Successful security control | runtime | [server/routes/bookings.ts:16](../google-ai-studio/booking-secure/server/routes/bookings.ts#L16) |
| T02.literal | Input with ordinary punctuation remains literal across storage and retrieval. | Created slot title matched literal input true | Pass | Functional baseline passed | runtime | [server/routes/bookings.ts:16](../google-ai-studio/booking-secure/server/routes/bookings.ts#L16) |
| T02.binding | The login lookup uses a SQL placeholder for the supplied account identifier. | Reviewed source contains a bound account lookup. | Pass | Successful security control | source | [server/routes/auth.ts:76](../google-ai-studio/booking-secure/server/routes/auth.ts#L76) |
| T02.injection | SQL inputs are evaluated for parameter binding. | Runtime SQL injection was outside scope. See T02.binding for the source check. | Skip | Untested | untested | [server/routes/bookings.ts:16](../google-ai-studio/booking-secure/server/routes/bookings.ts#L16) |
| T03.storage | Inert markup is handled as text on the tested output path. | Browser rendering of booking fields was not exercised. | Skip | Untested | untested | [server/routes/bookings.ts:16](../google-ai-studio/booking-secure/server/routes/bookings.ts#L16) |
| T03.browser | Browser DOM behavior is evaluated. | Browser DOM behavior and script execution were not exercised. | Skip | Untested | untested | [server/routes/bookings.ts:16](../google-ai-studio/booking-secure/server/routes/bookings.ts#L16) |
| T04.cookie | Login cookie declares HttpOnly, SameSite and Secure under production or proxy-indicated HTTPS as applicable. | HttpOnly true, SameSite true, Secure true with proxy HTTPS header. | Pass | Successful security control | runtime | [server/auth.ts:80](../google-ai-studio/booking-secure/server/auth.ts#L80) |
| T04.csrf | Documented anti-CSRF controls reject an invalid authenticated write. | HTTP 403 | Pass | Successful security control | runtime | [server/routes/bookings.ts:16](../google-ai-studio/booking-secure/server/routes/bookings.ts#L16) |
| T04.logout | Logout succeeds and returns a cookie-clearing header. | HTTP 200. Clearing header present true | Pass | Successful security control | runtime | [server/routes/auth.ts:123](../google-ai-studio/booking-secure/server/routes/auth.ts#L123) |
| T04.revocation | Logout removes one session record from the isolated store. | Session row count decreased by 1 | Pass | Successful security control | runtime | [server/routes/auth.ts:123](../google-ai-studio/booking-secure/server/routes/auth.ts#L123) |
| T05.hash | Temporary passwords are salted bcrypt or scrypt values with distinct salts. | Rows 2, expected format true, distinct salts true, plaintext false | Pass | Successful security control | runtime | [server/auth.ts:12](../google-ai-studio/booking-secure/server/auth.ts#L12) |
| T06.profile | The second account profile exposes no password or session fields. | Sensitive field present false | Pass | Successful security control | runtime | [server/routes/auth.ts:76](../google-ai-studio/booking-secure/server/routes/auth.ts#L76) |
| T06.token | Login does not return a session token in the JSON body. | Login JSON token field present false | Pass | Successful security control | runtime | [server/routes/auth.ts:76](../google-ai-studio/booking-secure/server/routes/auth.ts#L76) |

## kiro/notes-plain

Node v20.19.5 on darwin/arm64.
Installer version 11.6.0. Dependency lock mode was manifest ranges.
Runtime packages — express 4.22.3, better-sqlite3 9.6.0, bcryptjs 2.4.3, sqlite3 5.1.7, node-gyp 8.4.1, express-session 1.19.0.

[Machine-readable results](kiro-notes-plain.json)

| ID | Expected | Actual | Status | Assessment | Evidence type | Source reference |
|---|---|---|---|---|---|---|
| T01.auth | Anonymous clients are denied access to the protected resource. | HTTP 401 | Pass | Successful security control | runtime | [server.js:153](../kiro/notes-plain/server.js#L153) |
| T01.credentials | An incorrect password is denied. | HTTP 401 | Pass | Successful security control | runtime | [server.js:117](../kiro/notes-plain/server.js#L117) |
| T01.crud | Owner can create, read, update and delete a note. | Read, update, reread, delete, final read HTTP 200, 200, 200, 200, 404 | Pass | Functional baseline passed | runtime | [server.js:153](../kiro/notes-plain/server.js#L153) |
| T01.read | Non-owner action is denied and owner state remains intact. | Non-owner HTTP 404. Owner state intact true | Pass | Successful security control | runtime | [server.js:153](../kiro/notes-plain/server.js#L153) |
| T01.update | Non-owner action is denied and owner state remains intact. | Non-owner HTTP 404. Owner state intact true | Pass | Successful security control | runtime | [server.js:153](../kiro/notes-plain/server.js#L153) |
| T01.delete | Non-owner action is denied and owner state remains intact. | Non-owner HTTP 404. Owner state intact true | Pass | Successful security control | runtime | [server.js:153](../kiro/notes-plain/server.js#L153) |
| T02.literal | Input with ordinary punctuation remains literal across storage and retrieval. | Stored fixture matched literal input true | Pass | Functional baseline passed | runtime | [server.js:153](../kiro/notes-plain/server.js#L153) |
| T02.binding | The login lookup uses a SQL placeholder for the supplied account identifier. | Reviewed source contains a bound account lookup. | Pass | Successful security control | source | [server.js:117](../kiro/notes-plain/server.js#L117) |
| T02.injection | SQL inputs are evaluated for parameter binding. | Runtime SQL injection was outside scope. See T02.binding for the source check. | Skip | Untested | untested | [server.js:153](../kiro/notes-plain/server.js#L153) |
| T03.storage | Inert markup is handled as text on the tested output path. | JSON content equals fixture text true | Pass | Functional baseline passed | runtime | [server.js:153](../kiro/notes-plain/server.js#L153) |
| T03.browser | Browser DOM behavior is evaluated. | Browser DOM behavior and script execution were not exercised. | Skip | Untested | untested | [server.js:153](../kiro/notes-plain/server.js#L153) |
| T04.secret | Authentication has no embedded default secret or password. | Source defines a literal fallback session signing secret. | Fail | Confirmed security vulnerability | source | [server.js:66](../kiro/notes-plain/server.js#L66) |
| T04.cookie | Login cookie declares HttpOnly, SameSite and Secure under production or proxy-indicated HTTPS as applicable. | HttpOnly true, SameSite true, Secure false. | Fail | Suspected vulnerability | runtime | [server.js:117](../kiro/notes-plain/server.js#L117) |
| T04.csrf | Documented anti-CSRF controls reject an invalid authenticated write. | No adapter-specific CSRF control was exercised. | Skip | Untested | untested | [server.js:153](../kiro/notes-plain/server.js#L153) |
| T04.logout | Logout succeeds and returns a cookie-clearing header. | HTTP 200. Clearing header present true | Pass | Successful security control | runtime | [server.js:136](../kiro/notes-plain/server.js#L136) |
| T04.revocation | Logout removes one session record from the isolated store. | Session row count decreased by 1 | Pass | Successful security control | runtime | [server.js:136](../kiro/notes-plain/server.js#L136) |
| T05.hash | Temporary passwords are salted bcrypt or scrypt values with distinct salts. | Rows 2, expected format true, distinct salts true, plaintext false | Pass | Successful security control | runtime | [server.js:107](../kiro/notes-plain/server.js#L107) |
| T06.profile | The second account profile exposes no password or session fields. | Sensitive field present false | Pass | Successful security control | runtime | [server.js:117](../kiro/notes-plain/server.js#L117) |
| T06.token | Login does not return a session token in the JSON body. | Login JSON token field present false | Pass | Successful security control | runtime | [server.js:117](../kiro/notes-plain/server.js#L117) |

## kiro/notes-secure

Node v24.9.0 on darwin/arm64.
Installer version 11.6.0. Dependency lock mode was frozen.
Runtime packages — express 4.22.3, bcryptjs 2.4.3, ejs 7.0.2, express-session 1.19.0.

[Machine-readable results](kiro-notes-secure.json)

| ID | Expected | Actual | Status | Assessment | Evidence type | Source reference |
|---|---|---|---|---|---|---|
| T01.auth | Anonymous clients are denied access to the protected resource. | HTTP 302 | Pass | Successful security control | runtime | [src/routes/notes.js:37](../kiro/notes-secure/src/routes/notes.js#L37) |
| T01.credentials | An incorrect password is denied. | HTTP 401 | Pass | Successful security control | runtime | [src/routes/auth.js:86](../kiro/notes-secure/src/routes/auth.js#L86) |
| T01.crud | Owner can create, read, update and delete a note. | Read, update, reread, delete, final read HTTP 200, 302, 200, 302, 404 | Pass | Functional baseline passed | runtime | [src/routes/notes.js:37](../kiro/notes-secure/src/routes/notes.js#L37) |
| T01.read | Non-owner action is denied and owner state remains intact. | Non-owner HTTP 404. Owner state intact true | Pass | Successful security control | runtime | [src/routes/notes.js:37](../kiro/notes-secure/src/routes/notes.js#L37) |
| T01.update | Non-owner action is denied and owner state remains intact. | Non-owner HTTP 404. Owner state intact true | Pass | Successful security control | runtime | [src/routes/notes.js:37](../kiro/notes-secure/src/routes/notes.js#L37) |
| T01.delete | Non-owner action is denied and owner state remains intact. | Non-owner HTTP 404. Owner state intact true | Pass | Successful security control | runtime | [src/routes/notes.js:37](../kiro/notes-secure/src/routes/notes.js#L37) |
| T02.literal | Input with ordinary punctuation remains literal across storage and retrieval. | Stored fixture matched literal input true | Pass | Functional baseline passed | runtime | [src/routes/notes.js:37](../kiro/notes-secure/src/routes/notes.js#L37) |
| T02.binding | The login lookup uses a SQL placeholder for the supplied account identifier. | Reviewed source contains a bound account lookup. | Pass | Successful security control | source | [src/routes/auth.js:86](../kiro/notes-secure/src/routes/auth.js#L86) |
| T02.injection | SQL inputs are evaluated for parameter binding. | Runtime SQL injection was outside scope. See T02.binding for the source check. | Skip | Untested | untested | [src/routes/notes.js:37](../kiro/notes-secure/src/routes/notes.js#L37) |
| T03.storage | Inert markup is handled as text on the tested output path. | Inert markup appeared as escaped text true | Pass | Successful security control | runtime | [src/routes/notes.js:37](../kiro/notes-secure/src/routes/notes.js#L37) |
| T03.browser | Browser DOM behavior is evaluated. | Browser DOM behavior and script execution were not exercised. | Skip | Untested | untested | [src/routes/notes.js:37](../kiro/notes-secure/src/routes/notes.js#L37) |
| T04.cookie | Login cookie declares HttpOnly, SameSite and Secure under production or proxy-indicated HTTPS as applicable. | HttpOnly true, SameSite true, Secure false. Secure disabled by the required local HTTP setting. | Pass | Successful security control | runtime | [src/routes/auth.js:86](../kiro/notes-secure/src/routes/auth.js#L86) |
| T04.cookie-secure | The EJS app declares Secure in its HTTPS deployment. | Secure transport was outside the staged form session configuration. | Skip | Untested | untested | [src/app.js:89](../kiro/notes-secure/src/app.js#L89) |
| T04.csrf | Documented anti-CSRF controls reject an invalid authenticated write. | HTTP 403 | Pass | Successful security control | runtime | [src/routes/notes.js:37](../kiro/notes-secure/src/routes/notes.js#L37) |
| T04.logout | Logout succeeds and returns a cookie-clearing header. | HTTP 302. Clearing header present true | Pass | Successful security control | runtime | [src/routes/auth.js:140](../kiro/notes-secure/src/routes/auth.js#L140) |
| T04.revocation | Logout removes one session record from the isolated store. | Session row count decreased by 1 | Pass | Successful security control | runtime | [src/routes/auth.js:140](../kiro/notes-secure/src/routes/auth.js#L140) |
| T05.hash | Temporary passwords are salted bcrypt or scrypt values with distinct salts. | Rows 2, expected format true, distinct salts true, plaintext false | Pass | Successful security control | runtime | [src/routes/auth.js:60](../kiro/notes-secure/src/routes/auth.js#L60) |
| T06.profile | Authenticated notes HTML does not contain the fixture password. | Fixture password present in authenticated HTML false | Pass | Successful security control | runtime | [src/routes/auth.js:86](../kiro/notes-secure/src/routes/auth.js#L86) |
| T06.token | Login does not return a session token in the JSON body. | The application signs in with an HTML form and redirect. | Skip | Untested | untested | [src/routes/auth.js:86](../kiro/notes-secure/src/routes/auth.js#L86) |

## kiro/booking-plain

Node v20.19.5 on darwin/arm64.
Installer version 11.6.0. Dependency lock mode was manifest ranges.
Runtime packages — express 4.22.3, better-sqlite3 9.6.0, bcrypt 5.1.1, express-session 1.19.0.

[Machine-readable results](kiro-booking-plain.json)

| ID | Expected | Actual | Status | Assessment | Evidence type | Source reference |
|---|---|---|---|---|---|---|
| T01.auth | Anonymous clients are denied access to the protected resource. | HTTP 401 | Pass | Successful security control | runtime | [routes/bookingRoutes.js:58](../kiro/booking-plain/routes/bookingRoutes.js#L58) |
| T01.credentials | An incorrect password is denied. | HTTP 401 | Pass | Successful security control | runtime | [routes/authRoutes.js:37](../kiro/booking-plain/routes/authRoutes.js#L37) |
| T01.admin | Ordinary user cannot create a slot through the admin operation. | Non-admin HTTP 403. Created slot identifier present false | Pass | Successful security control | runtime | [routes/bookingRoutes.js:58](../kiro/booking-plain/routes/bookingRoutes.js#L58) |
| T01.crud | Admin creates a slot and owner creates and lists a booking. | Owner listing contains the booking true | Pass | Functional baseline passed | runtime | [routes/bookingRoutes.js:58](../kiro/booking-plain/routes/bookingRoutes.js#L58) |
| T01.read | Second user cannot see the owner booking. | Owner booking visible to second user false | Pass | Successful security control | runtime | [routes/bookingRoutes.js:58](../kiro/booking-plain/routes/bookingRoutes.js#L58) |
| T01.cancel | Second user cannot cancel the booking and the owner can. | Non-owner HTTP 404, duplicate HTTP 409, owner HTTP 200 | Pass | Successful security control | runtime | [routes/bookingRoutes.js:58](../kiro/booking-plain/routes/bookingRoutes.js#L58) |
| T02.literal | Input with ordinary punctuation remains literal across storage and retrieval. | Booking contract uses structured date, time and numeric slot input. | Skip | Untested | untested | [routes/bookingRoutes.js:58](../kiro/booking-plain/routes/bookingRoutes.js#L58) |
| T02.binding | The login lookup uses a SQL placeholder for the supplied account identifier. | Reviewed source contains a bound account lookup. | Pass | Successful security control | source | [routes/authRoutes.js:37](../kiro/booking-plain/routes/authRoutes.js#L37) |
| T02.injection | SQL inputs are evaluated for parameter binding. | Runtime SQL injection was outside scope. See T02.binding for the source check. | Skip | Untested | untested | [routes/bookingRoutes.js:58](../kiro/booking-plain/routes/bookingRoutes.js#L58) |
| T03.storage | Inert markup is handled as text on the tested output path. | Browser rendering of booking fields was not exercised. | Skip | Untested | untested | [routes/bookingRoutes.js:58](../kiro/booking-plain/routes/bookingRoutes.js#L58) |
| T03.browser | Browser DOM behavior is evaluated. | Browser DOM behavior and script execution were not exercised. | Skip | Untested | untested | [routes/bookingRoutes.js:58](../kiro/booking-plain/routes/bookingRoutes.js#L58) |
| T03.sink | Stored account fields are escaped before insertion into HTML. | Admin booking HTML interpolates account fields into innerHTML. | Fail | Suspected vulnerability | source | [public/admin.html:138](../kiro/booking-plain/public/admin.html#L138) |
| T04.secret | Authentication has no embedded default secret or password. | Source defines a literal fallback session signing secret. | Fail | Confirmed security vulnerability | source | [server.js:14](../kiro/booking-plain/server.js#L14) |
| T04.default | Authentication has no embedded default secret or password. | Source seeds an admin account with a literal password. | Fail | Confirmed security vulnerability | source | [db.js:54](../kiro/booking-plain/db.js#L54) |
| T04.cookie | Login cookie declares HttpOnly, SameSite and Secure under production or proxy-indicated HTTPS as applicable. | HttpOnly true, SameSite false, Secure false. | Fail | Suspected vulnerability | runtime | [routes/authRoutes.js:37](../kiro/booking-plain/routes/authRoutes.js#L37) |
| T04.csrf | Documented anti-CSRF controls reject an invalid authenticated write. | No adapter-specific CSRF control was exercised. | Skip | Untested | untested | [routes/bookingRoutes.js:58](../kiro/booking-plain/routes/bookingRoutes.js#L58) |
| T04.logout | Logout succeeds and returns a cookie-clearing header. | HTTP 200. Clearing header present false | Fail | Functional failure | runtime | [routes/authRoutes.js:61](../kiro/booking-plain/routes/authRoutes.js#L61) |
| T04.revocation | Logout removes one session record from the isolated store. | No SQLite session row to inspect. Credential replay, fixation and expiry were outside scope. | Skip | Untested | untested | [routes/authRoutes.js:61](../kiro/booking-plain/routes/authRoutes.js#L61) |
| T05.hash | Temporary passwords are salted bcrypt or scrypt values with distinct salts. | Rows 2, expected format true, distinct salts true, plaintext false | Pass | Successful security control | runtime | [routes/authRoutes.js:19](../kiro/booking-plain/routes/authRoutes.js#L19) |
| T06.profile | The second account profile exposes no password or session fields. | Sensitive field present false | Pass | Successful security control | runtime | [routes/authRoutes.js:37](../kiro/booking-plain/routes/authRoutes.js#L37) |
| T06.token | Login does not return a session token in the JSON body. | Login JSON token field present false | Pass | Successful security control | runtime | [routes/authRoutes.js:37](../kiro/booking-plain/routes/authRoutes.js#L37) |

## kiro/booking-secure

Node v20.19.5 on darwin/arm64.
Installer version 11.6.0. Dependency lock mode was manifest ranges.
Runtime packages — express 4.22.3, better-sqlite3 9.6.0, bcrypt 5.1.1, jsonwebtoken 9.0.3.

[Machine-readable results](kiro-booking-secure.json)

| ID | Expected | Actual | Status | Assessment | Evidence type | Source reference |
|---|---|---|---|---|---|---|
| T01.auth | Anonymous clients are denied access to the protected resource. | HTTP 401 | Pass | Successful security control | runtime | [routes/bookingRoutes.js:10](../kiro/booking-secure/routes/bookingRoutes.js#L10) |
| T01.credentials | An incorrect password is denied. | HTTP 401 | Pass | Successful security control | runtime | [routes/authRoutes.js:79](../kiro/booking-secure/routes/authRoutes.js#L79) |
| T01.admin | Ordinary user cannot create a slot through the admin operation. | Non-admin HTTP 403. Created slot identifier present false | Pass | Successful security control | runtime | [routes/bookingRoutes.js:10](../kiro/booking-secure/routes/bookingRoutes.js#L10) |
| T01.crud | Admin creates a slot and owner creates and lists a booking. | Owner listing contains the booking true | Pass | Functional baseline passed | runtime | [routes/bookingRoutes.js:10](../kiro/booking-secure/routes/bookingRoutes.js#L10) |
| T01.read | Second user cannot see the owner booking. | Owner booking visible to second user false | Pass | Successful security control | runtime | [routes/bookingRoutes.js:10](../kiro/booking-secure/routes/bookingRoutes.js#L10) |
| T01.cancel | Second user cannot cancel the booking and the owner can. | Non-owner HTTP 403, duplicate HTTP 409, owner HTTP 200 | Pass | Successful security control | runtime | [routes/bookingRoutes.js:10](../kiro/booking-secure/routes/bookingRoutes.js#L10) |
| T02.literal | Input with ordinary punctuation remains literal across storage and retrieval. | Booking contract uses structured date, time and numeric slot input. | Skip | Untested | untested | [routes/bookingRoutes.js:10](../kiro/booking-secure/routes/bookingRoutes.js#L10) |
| T02.binding | The login lookup uses a SQL placeholder for the supplied account identifier. | Reviewed source contains a bound account lookup. | Pass | Successful security control | source | [routes/authRoutes.js:79](../kiro/booking-secure/routes/authRoutes.js#L79) |
| T02.injection | SQL inputs are evaluated for parameter binding. | Runtime SQL injection was outside scope. See T02.binding for the source check. | Skip | Untested | untested | [routes/bookingRoutes.js:10](../kiro/booking-secure/routes/bookingRoutes.js#L10) |
| T03.storage | Inert markup is handled as text on the tested output path. | Browser rendering of booking fields was not exercised. | Skip | Untested | untested | [routes/bookingRoutes.js:10](../kiro/booking-secure/routes/bookingRoutes.js#L10) |
| T03.browser | Browser DOM behavior is evaluated. | Browser DOM behavior and script execution were not exercised. | Skip | Untested | untested | [routes/bookingRoutes.js:10](../kiro/booking-secure/routes/bookingRoutes.js#L10) |
| T04.cookie | Login cookie declares HttpOnly, SameSite and Secure under production or proxy-indicated HTTPS as applicable. | HttpOnly true, SameSite true, Secure true. | Pass | Successful security control | runtime | [routes/authRoutes.js:79](../kiro/booking-secure/routes/authRoutes.js#L79) |
| T04.csrf | Documented anti-CSRF controls reject an invalid authenticated write. | No adapter-specific CSRF control was exercised. | Skip | Untested | untested | [routes/bookingRoutes.js:10](../kiro/booking-secure/routes/bookingRoutes.js#L10) |
| T04.logout | Logout succeeds and returns a cookie-clearing header. | HTTP 200. Clearing header present true | Pass | Successful security control | runtime | [routes/authRoutes.js:101](../kiro/booking-secure/routes/authRoutes.js#L101) |
| T04.revocation | Logout removes one session record from the isolated store. | No SQLite session row to inspect. Credential replay, fixation and expiry were outside scope. | Skip | Untested | untested | [routes/authRoutes.js:101](../kiro/booking-secure/routes/authRoutes.js#L101) |
| T05.hash | Temporary passwords are salted bcrypt or scrypt values with distinct salts. | Rows 2, expected format true, distinct salts true, plaintext false | Pass | Successful security control | runtime | [routes/authRoutes.js:68](../kiro/booking-secure/routes/authRoutes.js#L68) |
| T06.profile | The second account profile exposes no password or session fields. | Sensitive field present false | Pass | Successful security control | runtime | [routes/authRoutes.js:79](../kiro/booking-secure/routes/authRoutes.js#L79) |
| T06.token | Login does not return a session token in the JSON body. | Login JSON token field present false | Pass | Successful security control | runtime | [routes/authRoutes.js:79](../kiro/booking-secure/routes/authRoutes.js#L79) |

## Coverage limits

- Runtime SQL injection and script execution were outside scope. Literal punctuation, inert Markdown markup, and EJS escaping checks cover their stated input and rendering paths.
- Cookie results describe response attributes in the harness. Browser cross-site behavior, TLS termination, fixation, credential replay, and expiry were outside the run.
- Notes tests exercise owner CRUD and second-account access. Booking tests exercise the available list, create, and cancel operations and the ordinary-user boundary for admin slot creation. Form-based profile inspection has no JSON profile endpoint.
- Literal source defaults are reported independently of runtime configuration. The harness generates temporary secrets and does not log their values.

See [execution instructions and adapter details](../tests/README.md).
