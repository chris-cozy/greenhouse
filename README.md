# Greenhouse

> A calm, local-first plant companion for organizing plants and terrariums, setting care reminders, tracking progress photos, and keeping a rich journal.

Greenhouse is a self-hosted home for the plants in your care and the stories that grow around them. It brings plant profiles, terrariums, botanical references, care guidance, photos, and journal entries into one private collection—without turning plant care into paperwork.

## Features

- **Living plant archive** — Keep profiles for living, dormant, recovering, deceased, and archived plants, with locations, tags, care notes, and a meaningful history.
- **Terrarium records** — Document habitats, residents, environmental details, cover photos, and changes over time.
- **Gentle care reminders** — Schedule one-time or repeating reminders, then complete, snooze, disable, or undo them. Greenhouse never assumes a task was done or logs it automatically.
- **Progress photos** — Build a visual history for each plant or terrarium and choose dedicated profile and cover images.
- **Botanical reference library** — Save reusable species information once and link it to every relevant plant.
- **Rich Markdown journal** — Write with slash commands, checklists, tables, links, images, date mentions, tags, and autosave while keeping the underlying content portable.
- **Fast global search** — Find plants, terrariums, species, and journal entries from anywhere in the app.
- **Portable backups** — Download and restore a versioned ZIP containing both the SQLite database and uploaded media.
- **Local by default** — No accounts, telemetry, cloud database, or external plant service.

## Quick start

### Requirements

- Node.js 20 or newer
- npm

Install the dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The local API runs on port `4000`, and Vite proxies API and media requests during development.

To populate a running instance with an example collection:

```bash
npm run seed:demo
```

The demo seed adds sample plants, species, terrariums, journal entries, reminders, and photos to the current database.

### Production-style local run

```bash
npm run build
npm start
```

Open [http://localhost:4000](http://localhost:4000).

## Run with Docker

```bash
docker compose up --build
```

Open [http://localhost:4000](http://localhost:4000). The `greenhouse-data` volume preserves the database and uploaded media between container restarts.

To expose a different host port:

```bash
GREENHOUSE_PORT=8080 docker compose up --build
```

## Data and configuration

Greenhouse stores all application data locally in `./data` by default:

```text
data/
├── greenhouse.sqlite   # Structured application data
└── media/              # Original uploaded images
```

Set any of the environment variables documented in `.env.example` to customize the local server:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port used by the Express server |
| `DATA_DIR` | `./data` | Base directory for persistent data |
| `DATABASE_PATH` | `./data/greenhouse.sqlite` | SQLite database location |
| `MEDIA_DIR` | `./data/media` | Uploaded image location |

> [!IMPORTANT]
> Greenhouse has no authentication. Keep it on a trusted device or network, or place it behind an authenticated reverse proxy before making it accessible from the public internet.

## Journal behavior

The journal is a single editable workspace at `/journal`; direct `/journal/:id` links also open the requested entry. Search and journal tags filter the entry list without closing the current document. On narrow screens, **Entries** opens the list.

- Type Markdown naturally, or enter `/` for headings, lists, checklists, quotes, code, tables, links, images, dates, and videos. Date mentions such as `@tomorrow` are stored semantically.
- Changes save after 700 ms of inactivity, and pending writes finish before switching entries. The browser also keeps recovery drafts until the server confirms a save.
- Revision checks prevent conflicting edits from silently overwriting a saved version. Failed and conflicted saves can be retried, reloaded, or preserved as a new entry.
- **Created** controls journal chronology and remains editable. **Last edited** is automatic, while the original record timestamp remains unchanged.
- Journal tags have their own catalog and counts. Renaming or deleting one does not affect plant or photo tags, and never deletes entries.
- Pasted, dropped, and selected images support JPEG, PNG, GIF, and WebP files up to 20 MB. Image signatures are validated rather than trusted from file extensions alone.
- Stored content remains Markdown. Unknown HTML is shown as inert text, remote images do not load automatically, and YouTube URLs stay portable links until the player is requested.

Avoid clearing browser storage while a save is failing, because unsynced recovery drafts live in the current browser.

## Photos and covers

Plant and terrarium profiles include **Choose cover photo**. Uploading a newer image does not replace an explicitly selected cover; deleting the selected image restores the placeholder. Original uploads are stored with the rest of the local media and included in backups.

## Backup and restore

Open **Settings** in Greenhouse to manage portable backups:

- **Download backup** creates a versioned ZIP with a consistent SQLite snapshot, every uploaded media file, and a manifest.
- **Restore** validates the archive and database integrity before replacing current data, with rollback protection if the operation fails.

Diary schema upgrades run transactionally and create a `greenhouse.sqlite.before-diary-*.sqlite` snapshot before changing an existing database. Older backups are migrated during restore while preserving links, tags, media, and legacy journal dates.

Browser recovery drafts are not part of server backups. Resolve pending saves before restoring a backup.

## Technology

- React 19 and TypeScript
- Vite
- Express
- SQLite via `better-sqlite3`
- Milkdown for rich Markdown editing
- Vitest and jsdom

## Development

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the Vite client and Express API in watch mode |
| `npm run seed:demo` | Add the example collection to a running instance |
| `npm run typecheck` | Type-check the client and server |
| `npm test` | Run the test suite once |
| `npm run build` | Type-check and create production client/server builds |
| `npm start` | Serve the production build |

Run the full set of checks before submitting a change:

```bash
npm run typecheck
npm test
npm run build
```
