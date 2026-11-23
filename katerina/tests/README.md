# SOEN 321 automated security evaluation

The shared Node test harness covers all eight application variants. Each test records an expected result, a sanitized observation, a status, a security assessment, and a source reference. The report distinguishes source findings from runtime evidence. T01–T06 refer to the existing manual evidence families.

## Reproduce the run

Run these commands from the project root (`katerina/` in the team repository). The recorded run used Node 24.9.0, npm 11.6.0, Bun 1.4.5, and a Node 20.19.5 child runtime for the three apps with older native modules. This example provisions the two tools outside the repository on macOS. Use the equivalent absolute executable paths on other systems.

```sh
tools_dir=$(mktemp -d)
npm install --prefix "$tools_dir/bun" bun@1.4.5 --no-audit --no-fund
npm install --prefix "$tools_dir/node20" node@20.19.5 --no-audit --no-fund
export BUN_BIN="$tools_dir/bun/node_modules/.bin/bun"
export LEGACY_NODE="$tools_dir/node20/node_modules/.bin/node"

node --test tests/notes-plain.test.mjs tests/matrix.test.mjs
node tests/report.mjs
```

Run the report command independently of the suite exit status. Node returns a nonzero status for failed security expectations, functional failures, or blocked app startup. Node may also count a failing parent suite in its summary. The report counts individual security and functional checks.

The test runner writes eight JSON files under `results/` and the report command generates `results/comparison.md`. Registry access is required for dependency installation. Native packages may require a C/C++ toolchain and Python if a compatible prebuilt binary is unavailable. Set `LEGACY_NODE_HEADERS` to a local Node 20 headers directory if npm needs it for a native build. The harness itself uses Node 24 for `node:sqlite`, including read-only inspection of databases served by Node 20 apps.

### Isolation and dependency resolution

- The harness copies only required application and build files into a fresh staging directory. It omits existing environment files, data, evidence, and installed modules. The child runs against disposable SQLite files with generated signing secrets and temporary credentials. Source defaults are identified through inspection.
- A test-only preload changes each child's listener to an OS-assigned port on `127.0.0.1`. Application output and installation diagnostics are suppressed in test output. The runner stops child servers and removes isolated data and dependency directories after each application run.
- Google AI Studio apps first attempt a frozen Bun install. On manifest/lock mismatch the installer reconciles the copy of the lockfile in staging. These runs are reproducible as a procedure, with resolved runtime versions recorded in JSON. Floating resolution can change subsequent runs. The original Notes Plain manifest, for example, requests esbuild `^0.28.0` while its lockfile records `^0.25.0`.
- Kiro Notes Secure uses `npm ci` with the repository lockfile. The other Kiro apps have no checked-in npm lockfile, so npm resolves manifest ranges. Results record the actual installer and selected runtime dependencies. No application manifests or lockfiles are edited in the repository.

## Coverage by architecture

| Family | Coverage and differences |
|---|---|
| T01 | Anonymous access and wrong password, note CRUD and non-owner read/update/delete, plus booking create/list/cancel, duplicate rejection, and ordinary-user denial at an admin slot route. Booking apps implement cancellation and do not expose a common update operation. |
| T02 | Source checks for a bound login lookup and ordinary punctuation round-trips where there is a comparable free-text field. The Kiro slot probes use structured fields. Runtime SQL injection remains untested. |
| T03 | Notes JSON storage, React static rendering for Google Notes Plain, and EJS response escaping for Kiro Notes Secure. Kiro Booking Plain's admin HTML sink is a source finding. Browser DOM and script execution remain untested. |
| T04 | Cookie attributes, logout response, SQLite session-row removal where inspectable, and missing CSRF tokens or mismatched origins on apps with exercised anti-CSRF middleware. Embedded defaults are reported separately. |
| T05 | Password format, absence of plaintext in the tested storage column, and distinct salts for two temporary accounts with the same generated password. The harness does not report hashes or salts. |
| T06 | Password and session fields in profile or login JSON, where the app has those endpoints. Kiro Notes Secure uses authenticated HTML, with a narrower fixture-password check. |

Google Notes Secure requires a Vite build before the production server starts. Kiro Notes Secure submits URL-encoded forms and rotates its CSRF token after form submissions, so the adapter refreshes tokens before each authenticated write. The form app uses its existing `LOCAL_HTTP_TEST=true` option. The Google apps that derive cookie settings from transport receive a loopback request with a proxy HTTPS header for the cookie assertion. Neither path exercises actual TLS or browser cross-site behavior.

The suite does not measure rate-limit effectiveness, timing-based enumeration, concurrent booking races, session fixation, expiry, credential replay, or production proxy trust. It checks specific routes and fixtures and does not establish the absence of other vulnerabilities. Existing manual evidence stays separate from the generated results.
