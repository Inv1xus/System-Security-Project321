# Private Notes

A small private notes web app. Users sign up, log in and log out; each signed-in
user can create, view, edit and delete only their own notes.

- **Backend:** Node.js + Express 5
- **Database:** SQLite via the built-in `node:sqlite` module (no native driver to compile)
- **Frontend:** one static page with plain JavaScript
- **Port:** 3000

## Folder structure

```
private-notes-app-claudeOpus5High/
├── Dockerfile
├── .dockerignore
├── .gitignore
├── README.md
├── package.json
├── package-lock.json
├── public/
│   ├── index.html        # the interface (login/signup + notes)
│   ├── app.js            # frontend logic, talks to the JSON API
│   └── styles.css
└── src/
    ├── server.js         # Express app, static files, listens on port 3000
    ├── db.js             # SQLite connection + schema (users, notes, sessions)
    ├── auth.js           # scrypt password hashing, cookie sessions, middleware
    └── routes/
        ├── auth.js       # /api/auth/signup, /login, /logout, /me
        └── notes.js      # /api/notes CRUD, scoped to the signed-in user
```

## Run with Docker

```bash
docker build -t private-notes .
docker run --rm -p 3000:3000 -v private-notes-data:/data private-notes
```

Then open http://localhost:3000.

The named volume `private-notes-data` keeps the SQLite file (`/data/notes.db`)
between runs. Drop `-v private-notes-data:/data` if you want a throwaway database.

## Prebuilt image (no source code needed)

`dist/` holds the finished app as a multi-architecture image (linux/amd64 and
linux/arm64), so anyone can run it with Docker alone:

```bash
docker load -i dist/private-notes-claude-multiarch.tar.gz
```

```bash
docker run --name private-notes -p 3000:3000 -v private_notes_data:/data private-notes-claude:1.0.0
```

`dist/README.txt` is the standalone instructions to ship alongside the archive,
and `dist/SHA256SUMS.txt` is its checksum (`shasum -a 256 -c SHA256SUMS.txt`).

To rebuild the archive from source:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t private-notes-claude:1.0.0 --output type=oci,dest=dist/private-notes-claude-multiarch.tar . && gzip -9 -f dist/private-notes-claude-multiarch.tar
```

## Run without Docker

```bash
npm install
npm start
```

The database is written to `./data/notes.db` unless `DATA_DIR` is set.

## Environment variables

| Variable        | Default      | Purpose                                            |
| --------------- | ------------ | -------------------------------------------------- |
| `PORT`          | `3000`       | Port the server listens on                          |
| `HOST`          | `0.0.0.0`    | Bind address                                        |
| `DATA_DIR`      | `./data`     | Where `notes.db` is stored (`/data` in the image)   |
| `COOKIE_SECURE` | `false`      | Set to `true` when serving over HTTPS               |

## API

| Method   | Path                 | Description                        |
| -------- | -------------------- | ---------------------------------- |
| `POST`   | `/api/auth/signup`   | Create an account and sign in      |
| `POST`   | `/api/auth/login`    | Sign in                            |
| `POST`   | `/api/auth/logout`   | Sign out                           |
| `GET`    | `/api/auth/me`       | Current user, or `null`            |
| `GET`    | `/api/notes`         | List the current user's notes      |
| `GET`    | `/api/notes/:id`     | Read one of the user's notes       |
| `POST`   | `/api/notes`         | Create a note                      |
| `PUT`    | `/api/notes/:id`     | Update a note                      |
| `DELETE` | `/api/notes/:id`     | Delete a note                      |
| `GET`    | `/health`            | Health check used by Docker        |

## How privacy is enforced

- Passwords are stored as salted scrypt hashes, never in plain text.
- Sessions are random 256-bit ids kept in the `sessions` table; the browser only
  holds an `httpOnly`, `SameSite=Lax` cookie, and sessions expire after 7 days.
- Every note query carries `WHERE ... user_id = ?` with the session's user id, so
  a note id belonging to someone else returns `404`, not their content.
- All SQL uses prepared statements with bound parameters.
- Note text is rendered with `textContent`, so a note can never inject HTML.
