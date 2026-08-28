import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { JournalEntry, JournalTag, JournalImage } from "../src/shared/types.js";
import { dateAtNoon, localDateKey, normalizeTags } from "../src/shared/journal.js";

type Row = Record<string, any>;
export class HttpError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const names = (value: unknown) => normalizeTags(value).sort((a, b) => a.localeCompare(b));
const ids = (value: unknown) => [...new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && !!id) : [])].sort();

export function migrateJournal(db: Database.Database) {
  if (db.prepare("SELECT 1 FROM schema_migrations WHERE version=3").get()) return;
  db.transaction(() => {
    db.exec(`
      ALTER TABLE journal_entries ADD COLUMN recorded_at TEXT NOT NULL DEFAULT '';
      ALTER TABLE journal_entries ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
      CREATE TABLE journal_tag_definitions(id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE);
      ALTER TABLE journal_tags RENAME TO legacy_journal_tags;
      CREATE TABLE journal_tags(journal_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES journal_tag_definitions(id) ON DELETE CASCADE, PRIMARY KEY(journal_id,tag_id));
      CREATE TABLE journal_images(id TEXT PRIMARY KEY, journal_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
        relative_path TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL);
    `);
    for (const row of db.prepare("SELECT j.journal_id,t.id,t.name FROM legacy_journal_tags j JOIN tags t ON t.id=j.tag_id").all() as Row[]) {
      const key = row.name.toLocaleLowerCase();
      db.prepare("INSERT OR IGNORE INTO journal_tag_definitions(id,name,name_key) VALUES(?,?,?)").run(row.id, row.name, key);
      const tag = db.prepare("SELECT id FROM journal_tag_definitions WHERE name_key=?").get(key) as Row;
      db.prepare("INSERT OR IGNORE INTO journal_tags(journal_id,tag_id) VALUES(?,?)").run(row.journal_id, tag.id);
    }
    db.exec("DROP TABLE legacy_journal_tags");
    for (const row of db.prepare("SELECT id,entry_date,created_at FROM journal_entries").all() as Row[]) {
      let createdAt = row.created_at;
      if (row.entry_date && localDateKey(createdAt) !== row.entry_date) {
        try { createdAt = dateAtNoon(row.entry_date); } catch { /* Keep original metadata for malformed legacy dates. */ }
      }
      db.prepare("UPDATE journal_entries SET recorded_at=created_at,created_at=? WHERE id=?").run(createdAt, row.id);
    }
    db.prepare("INSERT INTO schema_migrations(version,applied_at) VALUES(3,?)").run(new Date().toISOString());
  })();
}

export class JournalRepository {
  constructor(private db: Database.Database) {}
  tags(): JournalTag[] {
    return (this.db.prepare(`SELECT t.id,t.name,COUNT(j.journal_id) entryCount FROM journal_tag_definitions t
      LEFT JOIN journal_tags j ON j.tag_id=t.id GROUP BY t.id ORDER BY t.name_key`).all() as JournalTag[]);
  }
  createTag(value: unknown): JournalTag {
    const name = typeof value === "string" ? value.trim() : "";
    if (!name) throw new HttpError("A tag name is required.");
    if (this.db.prepare("SELECT id FROM journal_tag_definitions WHERE name_key=?").get(name.toLocaleLowerCase())) throw new HttpError("A diary tag with that name already exists.", 409);
    const id = randomUUID();
    this.db.prepare("INSERT INTO journal_tag_definitions(id,name,name_key) VALUES(?,?,?)").run(id, name, name.toLocaleLowerCase());
    return {id, name, entryCount: 0};
  }
  changeTag(id: string, name?: unknown) {
    return this.db.transaction(() => {
      const current = this.db.prepare("SELECT * FROM journal_tag_definitions WHERE id=?").get(id) as Row | undefined;
      if (!current) throw new HttpError("Diary tag not found.", 404);
      if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) throw new HttpError("A tag name is required.");
        name = name.trim();
        if (name === current.name) return;
        if (this.db.prepare("SELECT id FROM journal_tag_definitions WHERE name_key=? AND id!=?").get((name as string).toLocaleLowerCase(), id)) throw new HttpError("A diary tag with that name already exists.", 409);
      }
      this.db.prepare(`UPDATE journal_entries SET revision=revision+1,updated_at=? WHERE id IN
        (SELECT journal_id FROM journal_tags WHERE tag_id=?)`).run(new Date().toISOString(), id);
      if (name === undefined) this.db.prepare("DELETE FROM journal_tag_definitions WHERE id=?").run(id);
      else this.db.prepare("UPDATE journal_tag_definitions SET name=?,name_key=? WHERE id=?").run(name, (name as string).toLocaleLowerCase(), id);
    })();
  }
  private row(row: Row): JournalEntry {
    const id = row.id;
    const linkedPlants = this.db.prepare("SELECT p.id,p.name FROM plants p JOIN journal_plants jp ON jp.plant_id=p.id WHERE jp.journal_id=? ORDER BY p.name").all(id) as {id:string;name:string}[];
    const linkedTerrariums = this.db.prepare("SELECT t.id,t.name FROM terrariums t JOIN journal_terrariums jt ON jt.terrarium_id=t.id WHERE jt.journal_id=? ORDER BY t.name").all(id) as {id:string;name:string}[];
    return {id,title:row.title,entryDate:row.entry_date,content:row.content,createdAt:row.created_at,recordedAt:row.recorded_at,updatedAt:row.updated_at,revision:row.revision,
      tags:(this.db.prepare("SELECT t.name FROM journal_tags j JOIN journal_tag_definitions t ON t.id=j.tag_id WHERE j.journal_id=? ORDER BY t.name_key").all(id) as Row[]).map(t=>t.name),
      plantIds:linkedPlants.map(p=>p.id),terrariumIds:linkedTerrariums.map(t=>t.id),linkedPlants,linkedTerrariums};
  }
  get(id: string): JournalEntry | null {
    const row = this.db.prepare("SELECT * FROM journal_entries WHERE id=?").get(id) as Row | undefined;
    return row ? this.row(row) : null;
  }
  list(filters: Row = {}): JournalEntry[] {
    const clauses: string[] = [], args: string[] = [];
    for (const [key, table, column] of [["plantId","journal_plants","plant_id"],["terrariumId","journal_terrariums","terrarium_id"]]) {
      if (filters[key]) { clauses.push(`EXISTS(SELECT 1 FROM ${table} x WHERE x.journal_id=j.id AND x.${column}=?)`); args.push(String(filters[key])); }
    }
    if (filters.tag) { clauses.push("EXISTS(SELECT 1 FROM journal_tags x JOIN journal_tag_definitions t ON t.id=x.tag_id WHERE x.journal_id=j.id AND t.name_key=?)"); args.push(String(filters.tag).toLocaleLowerCase()); }
    if (filters.q) { clauses.push("(j.title LIKE ? OR j.content LIKE ? OR EXISTS(SELECT 1 FROM journal_tags x JOIN journal_tag_definitions t ON t.id=x.tag_id WHERE x.journal_id=j.id AND t.name LIKE ?))"); args.push(...Array(3).fill(`%${String(filters.q).trim()}%`)); }
    return (this.db.prepare(`SELECT j.* FROM journal_entries j ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY j.created_at DESC,j.id`).all(...args) as Row[]).map(row=>this.row(row));
  }
  save(input: Row, requestedId?: string): JournalEntry {
    return this.db.transaction(() => {
      const id = requestedId || randomUUID(), old = this.get(id), now = new Date().toISOString();
      if (requestedId && !old) throw new HttpError("Journal entry not found. Save your draft as a new entry.", 404);
      if (old && input.expectedRevision !== undefined && input.expectedRevision !== old.revision) throw new HttpError("This entry changed elsewhere. Your draft is safe.", 409);
      let createdAt = old?.createdAt || now;
      if (input.createdAt !== undefined) {
        if (typeof input.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.createdAt) || !Number.isFinite(Date.parse(input.createdAt))) throw new HttpError("Choose a valid creation date and time.");
        dateAtNoon(input.createdAt.slice(0,10));
        createdAt = new Date(input.createdAt).toISOString();
      } else if (input.entryDate && input.entryDate !== old?.entryDate) createdAt = dateAtNoon(input.entryDate);
      const title = typeof input.title === "string" ? input.title.trim() || "Untitled entry" : old?.title || "Untitled entry";
      const content = typeof input.content === "string" ? input.content : old?.content || "";
      const tags = names(input.tags ?? old?.tags ?? []);
      const plantIds = ids(input.plantIds ?? old?.plantIds), terrariumIds = ids(input.terrariumIds ?? old?.terrariumIds);
      const entryDate = old && createdAt === old.createdAt ? old.entryDate
        : input.createdAt && typeof input.timezoneOffset === "number" && Number.isInteger(input.timezoneOffset) && Math.abs(input.timezoneOffset) <= 840
          ? new Date(Date.parse(createdAt) - input.timezoneOffset * 60000).toISOString().slice(0, 10) : localDateKey(createdAt);
      if (old && title === old.title && content === old.content && createdAt === old.createdAt &&
        JSON.stringify(tags.map(t=>t.toLocaleLowerCase())) === JSON.stringify(names(old.tags).map(t=>t.toLocaleLowerCase())) &&
        JSON.stringify(plantIds) === JSON.stringify(ids(old.plantIds)) && JSON.stringify(terrariumIds) === JSON.stringify(ids(old.terrariumIds))) return old;
      this.db.prepare(`INSERT INTO journal_entries(id,title,entry_date,content,created_at,recorded_at,updated_at,revision) VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title,entry_date=excluded.entry_date,content=excluded.content,created_at=excluded.created_at,updated_at=excluded.updated_at,revision=excluded.revision`)
        .run(id,title,entryDate,content,createdAt,old?.recordedAt || now,now,(old?.revision || 0)+1);
      for (const [table, column, values] of [["journal_plants","plant_id",plantIds],["journal_terrariums","terrarium_id",terrariumIds]] as const) {
        this.db.prepare(`DELETE FROM ${table} WHERE journal_id=?`).run(id);
        for (const value of values) this.db.prepare(`INSERT INTO ${table}(journal_id,${column}) VALUES(?,?)`).run(id,value);
      }
      this.db.prepare("DELETE FROM journal_tags WHERE journal_id=?").run(id);
      for (const name of tags) {
        const tag = this.db.prepare("SELECT id FROM journal_tag_definitions WHERE name_key=?").get(name.toLocaleLowerCase()) as Row | undefined;
        const tagId = tag?.id || this.createTag(name).id;
        this.db.prepare("INSERT INTO journal_tags(journal_id,tag_id) VALUES(?,?)").run(id,tagId);
      }
      return this.get(id)!;
    })();
  }
  addImage(journalId: string, image: Omit<JournalImage,"id"|"url"|"journalId"> & {relativePath:string}): JournalImage {
    if (!this.get(journalId)) throw new HttpError("Journal entry not found.", 404);
    const id = randomUUID();
    this.db.prepare("INSERT INTO journal_images(id,journal_id,relative_path,original_name,mime_type,size_bytes,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(id,journalId,image.relativePath,image.originalName,image.mimeType,image.sizeBytes,new Date().toISOString());
    return {id,journalId,url:`/media/${image.relativePath.replaceAll("\\","/")}`,originalName:image.originalName,mimeType:image.mimeType,sizeBytes:image.sizeBytes};
  }
  delete(id: string): string[] {
    return this.db.transaction(() => {
      const files: string[] = [];
      for (const image of this.db.prepare("SELECT id,relative_path FROM journal_images WHERE journal_id=?").all(id) as Row[]) {
        // A copied Markdown image may be shared by another entry. Transfer ownership before the cascade.
        const other = (this.db.prepare("SELECT id,content FROM journal_entries WHERE id!=?").all(id) as Row[]).find(row=>row.content.includes(`/media/${image.relative_path.replaceAll("\\","/")}`));
        if (other) this.db.prepare("UPDATE journal_images SET journal_id=? WHERE id=?").run(other.id,image.id);
        else files.push(image.relative_path);
      }
      this.db.prepare("DELETE FROM journal_entries WHERE id=?").run(id);
      return files;
    })();
  }
}
