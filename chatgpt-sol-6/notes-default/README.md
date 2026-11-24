# Private Notes

A small private notes app using Node.js 24, Express, and SQLite. Users can create accounts, log in and out, and manage only their own notes. The SQLite database and login sessions persist in the Docker volume.

## For someone receiving this app

Choose **one** of these packages. Run each command on its own line.

### Source ZIP (`private-notes-source.zip`)

Unzip the archive into a folder, open a terminal in that folder, and run:

```sh
docker build -t private-notes .
docker run --rm --name private-notes -p 3000:3000 -v private_notes_data:/app/data private-notes
```

This needs internet access for the Node base image and npm packages during the build.

### Ready-built image TAR (`private-notes-image.tar`)

This does not require a build. In a terminal in the folder containing the TAR file, run:

```sh
docker load -i private-notes-image.tar
docker run --rm --name private-notes -p 3000:3000 -v private_notes_data:/app/data private-notes:latest
```

The TAR contains both Linux ARM64 and AMD64 variants. Docker selects the matching variant on Apple Silicon or Intel/AMD computers.

Open [http://localhost:3000](http://localhost:3000). Stop the container with `Ctrl+C`. The named volume keeps accounts and notes for the next run. If port 3000 is already allocated, stop the other container using that port before starting another one (`docker ps` shows running containers).

The source ZIP and image TAR do **not** include the sender's notes or accounts. Each recipient gets a separate empty database in their own `private_notes_data` volume.

## Run locally

Requires Node.js 24 or newer.

```sh
npm ci
npm start
```

Open [http://localhost:3000](http://localhost:3000). The default local database is `data/notes.sqlite`.

## Tests

```sh
npm test
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listening port |
| `DATABASE_PATH` | `./data/notes.sqlite` locally; `/app/data/notes.sqlite` in Docker | SQLite database file |
| `COOKIE_SECURE` | `false` | Set to `true` when serving through HTTPS |

The app uses a seven-day HTTP-only, same-site session cookie. Passwords are hashed with scrypt. Run it behind HTTPS if exposing it beyond your computer.
