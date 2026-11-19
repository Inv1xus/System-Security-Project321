# Private Notes

A single-instance private notes web app using Node.js 24, Express 5, and SQLite. Accounts have salted scrypt password hashes. Sessions and login limits are stored in SQLite. Note queries always include the authenticated user ID.

## Folder structure

```text
private-notes-app-secure/
├── .dockerignore
├── .gitignore
├── Dockerfile
├── README.md
├── package-lock.json
├── package.json
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── src/
│   ├── db.js
│   ├── security.js
│   └── server.js
└── test/
    └── server.test.js
```

## Run locally with Docker

Install Docker first. To use the source ZIP, extract `private-notes-source.zip`, open a terminal in the extracted `private-notes-app-secure` folder, then run:

```sh
docker build -t private-notes:1.0.0 .
docker run --name private-notes -p 3000:3000 -v private_notes_data:/data -e COOKIE_SECURE=false private-notes:1.0.0
```

Open <http://localhost:3000>. The named volume keeps accounts, sessions, and notes across container restarts. `COOKIE_SECURE=false` is for local HTTP only.

## Run the shared Docker image

If you received `private-notes-image-multiarch.tar.gz`, you can run it without building from source. The archive contains Linux ARM64 and AMD64 variants; Docker selects the right one for Apple Silicon or Intel/AMD machines:

```sh
docker load -i private-notes-image-multiarch.tar.gz
docker run --name private-notes -p 3000:3000 -v private_notes_data:/data -e COOKIE_SECURE=false private-notes:1.0.0
```

The image archive contains the app, not anyone's accounts or notes. Stop the container with `docker stop private-notes`; remove it with `docker rm private-notes` before reusing the same container name. Keep the named volume to retain your data.

## Production deployment

Terminate HTTPS at a trusted reverse proxy, forward the original `Host` and `X-Forwarded-Proto` headers, and keep port 3000 reachable only from that proxy. Run with `TRUST_PROXY=true` and leave `COOKIE_SECURE` unset (its production default is `true`). Mount a persistent volume at `/data` and back it up. Run one app instance against each SQLite database. The container runs as the non-root `node` user. Set resource limits and restart policy in your container platform.

## Development and verification

```sh
npm ci
npm test
npm start
```

The default development database is `data/notes.db`. `DATA_DIR` changes its location. `PORT` defaults to 3000. API mutations require a same-origin `Origin` header, JSON content type, and for authenticated actions the CSRF token returned by login, signup, or `/api/me`.
