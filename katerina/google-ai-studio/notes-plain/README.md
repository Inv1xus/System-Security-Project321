# VaultNotes - Private Notes Web App

A personal, private notes web application built with **Node.js**, **Express**, **SQLite** (`better-sqlite3`), and a responsive **React + Tailwind CSS** interface.

---

## 🌟 Features

- 🔐 **User Authentication**: Secure sign-up, login, and logout with `bcryptjs` password hashing and HTTP-only JWT sessions.
- 🗄️ **SQLite Database**: Fast, ACID-compliant local database running in WAL mode with per-user data isolation.
- 📝 **Full Notes Management**: Create, view, edit, search, pin, categorize, and delete notes.
- ⚡ **Auto-Save & Markdown**: Debounced auto-save directly to SQLite, word & character counts, and markdown preview mode.
- 📁 **Categorization & Filtering**: Filter by custom categories (Work, Personal, Projects, Ideas) or pinned status.
- 🐳 **Docker-Ready**: Complete multi-stage `Dockerfile` and `docker-compose.yml` with persistent data volume support on port 3000.

---

## 📁 Exact Project Folder Structure

```text
vaultnotes/
├── Dockerfile                  # Multi-stage production container definition
├── docker-compose.yml          # Docker Compose orchestration with SQLite volume
├── .dockerignore               # Ignores build artifacts and database files
├── .env.example                # Environment variables template (PORT, JWT_SECRET)
├── .gitignore                  # Git ignore rules for node_modules, dist, and data/
├── index.html                  # HTML5 entry point with viewport & title
├── metadata.json               # Application metadata configuration
├── package.json                # Project dependencies, devDependencies, and scripts
├── tsconfig.json               # TypeScript compiler configuration
├── vite.config.ts              # Vite configuration with Tailwind CSS & React plugins
├── server.ts                   # Main server entry point (Express + Vite/static + SQLite)
│
├── server/                     # Backend API & Database
│   ├── db.ts                   # SQLite connection, WAL mode, schema initialization
│   ├── auth.ts                 # JWT token generation and authentication middleware
│   └── routes.ts               # REST API endpoints for auth, notes CRUD, and categories
│
└── src/                        # Frontend React Interface
    ├── main.tsx                # React DOM root render
    ├── App.tsx                 # Root component orchestrating auth, state, & layout
    ├── index.css               # Global Tailwind CSS imports and utility styles
    ├── types.ts                # Shared TypeScript definitions (User, Note, Stats)
    ├── services/
    │   └── api.ts              # Client API service handling HTTP requests
    └── components/
        ├── AuthModal.tsx       # Login, Sign Up, and 1-Click Demo Guest modal
        ├── Sidebar.tsx         # Notes sidebar with search, categories, and pin badge
        ├── NoteEditor.tsx      # Note editor with autosave, markdown preview, export
        ├── MarkdownView.tsx    # Styled renderer for headings, checklists, code blocks
        └── EmptyState.tsx      # Starter templates for notes, meeting logs, checklists
```

---

## 🚀 Running with Docker

### Option 1: Using Docker Compose (Recommended)

1. Clone or extract the project.
2. Set `JWT_SECRET` to a randomly generated signing secret in your shell or local `.env` file, then run the application:
   ```bash
   docker compose up --build
   ```
3. Open your browser at **http://localhost:3000**.
4. The SQLite database is automatically persisted to `./data/notes.db` on your host machine.

### Option 2: Using the Docker CLI

1. Build the Docker image:
   ```bash
   docker build -t vaultnotes:latest .
   ```
2. Run the container on port 3000 with a persistent data volume:
   ```bash
   docker run -d \
     -p 3000:3000 \
     -v "$(pwd)/data:/app/data" \
     -e JWT_SECRET="your-custom-production-secret" \
     --name vaultnotes \
     vaultnotes:latest
   ```
3. Open **http://localhost:3000**.

---

## 💻 Running Locally (Without Docker)

### Prerequisites
- Node.js 20+ and npm

### Installation & Launch
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server (Express + Vite dev mode on port 3000):
   ```bash
   npm run dev
   ```
3. Visit **http://localhost:3000** in your web browser.

For production mode:
```bash
npm run build
npm start
```

---

## 📡 API Endpoints Summary

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Create a new user account | No |
| `POST` | `/api/auth/login` | Log in with username & password | No |
| `POST` | `/api/auth/logout` | Clear session cookie | No |
| `GET` | `/api/auth/me` | Fetch currently logged-in user | Yes |
| `GET` | `/api/notes` | Get all notes for user (supports `?search=`, `?category=`, `?pinned=true`) | Yes |
| `GET` | `/api/notes/:id` | Get note by ID (user isolation enforced) | Yes |
| `POST` | `/api/notes` | Create a new note | Yes |
| `PUT` | `/api/notes/:id` | Update note title, content, category, or pin status | Yes |
| `DELETE` | `/api/notes/:id` | Delete note | Yes |
| `GET` | `/api/categories` | Get category list with note counts | Yes |
| `GET` | `/api/stats` | Get overview stats (total notes, pinned count) | Yes |
| `GET` | `/api/health` | Service health check | No |
