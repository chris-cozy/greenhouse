# Greenhouse

Greenhouse is a calm, local-first home for plant profiles, terrariums, species references, progress photos, care guidance, and a Markdown journal. It emphasizes meaningful updates rather than mandatory care logging.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The local API runs on `http://localhost:4000`; Vite proxies API and media requests during development.

Production-style local run:

```bash
npm run build
npm start
```

Then open `http://localhost:4000`.

## Docker

```bash
docker compose up --build
```

Open `http://localhost:4000`. The `greenhouse-data` volume preserves SQLite data and uploaded media. Set `GREENHOUSE_PORT` to expose another host port.

## Local data

By default, Greenhouse keeps data in `./data`:

- `greenhouse.sqlite` contains structured records and media metadata.
- `media/` contains original uploaded images.

Override the locations with `DATA_DIR`, `DATABASE_PATH`, and `MEDIA_DIR`; see `.env.example`.

## Greenhouse Diary

The diary is one editable workspace at `/journal`; direct `/journal/:id` links still work. Search and diary tags filter the entry list without closing your document. On narrow screens, **Entries** opens the list.

- Write Markdown naturally, or type `/` for headings, lists, checklists, quotes, code, tables, links, images, dates, and videos. Use `@tomorrow` or another date to insert a semantic date mention.
- Changes save locally after 700 ms of inactivity. Pending writes finish before you switch entries. Recovery drafts are also kept in this browser until saved; avoid clearing browser storage while a save is failing.
- Conflicting edits never overwrite another saved version. Retry failed saves, reload the saved version, or save a conflicted/deleted entry's recovery draft as a new entry.
- **Created** is editable and controls diary chronology. **Last edited** is automatic; the API retains the original creation timestamp as read-only `recordedAt`. No-op saves leave timestamps and revisions unchanged.
- Diary tags have their own catalog, counts, and management controls. Renaming or deleting them never changes plant/photo tags or deletes entries.
- Images support selection, paste, and drop, with a 20 MB per-file limit and JPEG/PNG/GIF/WebP signature checks. Local images are backed up with other media. Images remain available for undo while the entry exists; entry deletion removes only unshared attachments.
- Stored content remains Markdown. Unknown HTML stays visible as inert text; remote images are not loaded. YouTube URLs remain portable links, and a player loads only when requested.

Plant and terrarium headers include **Choose cover photo**. A later upload never replaces your chosen cover. Deleting that photo restores the placeholder.

## Backup and restore

Open **Settings** inside Greenhouse:

- **Download backup** creates a versioned ZIP containing a consistent SQLite snapshot, all media, and a manifest.
- **Restore** validates the ZIP and database integrity before swapping data, with rollback protection if the operation fails.

The diary schema upgrade runs transactionally and saves a `greenhouse.sqlite.before-diary-*.sqlite` snapshot before changing an existing database. Older backups are migrated on restore, preserving links, tags, media, and legacy diary dates. When an old diary date differs from its original creation date, that diary date is retained at local noon. Browser recovery drafts are not part of server backups: resolve pending saves before restoring a backup.

## Quality checks

```bash
npm run typecheck
npm test
npm run build
```

Greenhouse uses no authentication, telemetry, cloud database, or external plant service.
