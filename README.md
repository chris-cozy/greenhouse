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

## Backup and restore

Open **Settings** inside Greenhouse:

- **Download backup** creates a versioned ZIP containing a consistent SQLite snapshot, all media, and a manifest.
- **Restore** validates the ZIP and database integrity before swapping data, with rollback protection if the operation fails.

## Quality checks

```bash
npm run typecheck
npm test
npm run build
```

Greenhouse uses no authentication, telemetry, cloud database, or external plant service.
