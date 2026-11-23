Deployment issues documented
For your SOEN 321 report, Kiro Secure Private Notes required three corrections:
1. Missing EJS dependency: Added ejs to the production dependencies.
2. Local HTTPS incompatibility: Disabled automatic HTTPS upgrading in the CSP for local testing.
3. Secure session cookies over HTTP: Introduced an explicit local-testing override so session cookies work without HTTPS.