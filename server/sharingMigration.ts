import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

/** Rebuild ownership tables without changing IDs or paths referenced by existing records. */
export function migrateSharing(db: Database.Database, dbPath: string) {
  if (db.prepare("SELECT 1 FROM schema_migrations WHERE version=6").get()) return;
  db.prepare("VACUUM INTO ?").run(`${dbPath}.before-sharing-${randomUUID()}.sqlite`);
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE photos_shared(
          id TEXT PRIMARY KEY, terrarium_id TEXT REFERENCES terrariums(id) ON DELETE CASCADE,
          relative_path TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL, mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL, date_taken TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
        );
        INSERT INTO photos_shared SELECT id,terrarium_id,relative_path,original_name,mime_type,size_bytes,date_taken,caption,created_at FROM photos;
        CREATE TABLE photo_plants(
          photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
          plant_id TEXT NOT NULL REFERENCES plants(id) ON DELETE CASCADE, PRIMARY KEY(photo_id,plant_id)
        );
        INSERT INTO photo_plants SELECT id,plant_id FROM photos WHERE plant_id IS NOT NULL;
        DROP TABLE photos;
        ALTER TABLE photos_shared RENAME TO photos;
        CREATE INDEX idx_photos_terrarium_date ON photos(terrarium_id,date_taken);
        CREATE INDEX idx_photo_plants_plant ON photo_plants(plant_id,photo_id);
        CREATE TABLE care_guidance(
          id TEXT PRIMARY KEY, activity_type TEXT NOT NULL, custom_label TEXT NOT NULL DEFAULT '',
          guidance TEXT NOT NULL, cadence_days INTEGER, notes TEXT NOT NULL DEFAULT ''
        );
        INSERT INTO care_guidance SELECT id,activity_type,custom_label,guidance,cadence_days,notes FROM care_items;
        CREATE TABLE care_assignments(
          id TEXT PRIMARY KEY, plant_id TEXT NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
          guidance_id TEXT NOT NULL REFERENCES care_guidance(id),
          reminder_enabled INTEGER NOT NULL DEFAULT 0, reminder_repeat INTEGER NOT NULL DEFAULT 0,
          reminder_cadence_days INTEGER, next_reminder_date TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
          UNIQUE(plant_id,guidance_id)
        );
        INSERT INTO care_assignments SELECT id,plant_id,id,reminder_enabled,reminder_repeat,reminder_cadence_days,next_reminder_date,sort_order FROM care_items;
        DROP TABLE care_items;
        ALTER TABLE care_assignments RENAME TO care_items;
        CREATE INDEX idx_care_reminder ON care_items(reminder_enabled,next_reminder_date);
      `);
      if ((db.pragma("foreign_key_check") as unknown[]).length) throw new Error("Shared-record migration failed its relationship checks.");
      db.prepare("INSERT INTO schema_migrations VALUES(6,?)").run(new Date().toISOString());
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}
