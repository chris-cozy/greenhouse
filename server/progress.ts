import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { HistoryEventType, Photo, ProgressSession } from "../src/shared/types.js";

type Row = Record<string, any>;
export type UploadedPhoto = { relativePath:string; originalName:string; mimeType:string; sizeBytes:number };
const text = (value:unknown) => typeof value === "string" ? value.trim() : "";
const eventTypes = new Set(["health_issue", "recovery", "flowering", "new_growth", "repotted", "pruned", "moved", "note"]);

export function migrateProgress(db:Database.Database, dbPath:string) {
  if (db.prepare("SELECT 1 FROM schema_migrations WHERE version=7").get()) return;
  db.prepare("VACUUM INTO ?").run(`${dbPath}.before-progress-${randomUUID()}.sqlite`);
  db.transaction(() => {
    db.exec(`
      CREATE TABLE progress_sessions(
        id TEXT PRIMARY KEY, terrarium_id TEXT REFERENCES terrariums(id) ON DELETE CASCADE,
        title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', event_type TEXT NOT NULL,
        event_date TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE progress_session_plants(
        session_id TEXT NOT NULL REFERENCES progress_sessions(id) ON DELETE CASCADE,
        plant_id TEXT NOT NULL REFERENCES plants(id) ON DELETE CASCADE, PRIMARY KEY(session_id,plant_id)
      );
      CREATE INDEX idx_progress_plant ON progress_session_plants(plant_id,session_id);
      CREATE TABLE progress_session_photos(
        session_id TEXT NOT NULL REFERENCES progress_sessions(id) ON DELETE CASCADE,
        photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE, sort_order INTEGER NOT NULL,
        PRIMARY KEY(session_id,photo_id)
      );
      CREATE INDEX idx_progress_photo ON progress_session_photos(photo_id,session_id);
    `);
    db.prepare("INSERT INTO schema_migrations VALUES(7,?)").run(new Date().toISOString());
  })();
}

export class ProgressRepository {
  constructor(private db:Database.Database, private photo:(row:Row)=>Photo,
    private createPhoto:(input:Row)=>Photo,
    private validateLinks:(input:Row)=>{plantIds:string[];terrariumId:string|null}) {}

  get(id:string):ProgressSession|null {
    const row=this.db.prepare("SELECT * FROM progress_sessions WHERE id=?").get(id) as Row|undefined;
    if (!row) return null;
    return {id:row.id,title:row.title,detail:row.detail,eventType:row.event_type,eventDate:row.event_date,
      terrariumId:row.terrarium_id,plantIds:(this.db.prepare("SELECT plant_id FROM progress_session_plants WHERE session_id=? ORDER BY plant_id").all(id) as Row[]).map(r=>r.plant_id),
      photos:(this.db.prepare("SELECT p.* FROM photos p JOIN progress_session_photos x ON x.photo_id=p.id WHERE x.session_id=? ORDER BY x.sort_order").all(id) as Row[]).map(this.photo),
      createdAt:row.created_at,updatedAt:row.updated_at};
  }
  list(kind:"plant"|"terrarium",id:string):ProgressSession[] {
    const condition=kind==="plant"?"EXISTS(SELECT 1 FROM progress_session_plants x WHERE x.session_id=s.id AND x.plant_id=?)":"s.terrarium_id=?";
    return (this.db.prepare(`SELECT s.id FROM progress_sessions s WHERE ${condition} ORDER BY s.event_date DESC,s.created_at DESC`).all(id) as Row[]).map(row=>this.get(row.id)!);
  }
  save(input:Row, uploads:UploadedPhoto[]=[], id?:string):ProgressSession {
    return this.db.transaction(()=>{
      const old=id?this.get(id):null;
      if(id&&!old) throw new Error("Progress session not found.");
      const owners=old?{plantIds:old.plantIds,terrariumId:old.terrariumId}:this.validateLinks(input);
      const entries=input.photos;
      if(!Array.isArray(entries)||entries.length>20) throw new Error("Choose up to 20 photos per session.");
      const date=text(input.eventDate),type=text(input.eventType)||"note";
      const parsedDate=new Date(`${date}T12:00:00Z`);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==date) throw new Error("Choose a valid session date.");
      if(!eventTypes.has(type)) throw new Error("Choose a valid update kind.");
      if(!text(input.title)&&!entries.length) throw new Error("Add an update title or a photo.");
      const usedIds=new Set<string>(),usedUploads=new Set<number>();
      // Validate every existing link and upload index before making any database changes.
      for(const entry of entries) {
        if(!entry||typeof entry!=="object"||Array.isArray(entry)) throw new Error("Choose valid photo attachments.");
        if(entry.id!==undefined) {
          if(typeof entry.id!=="string"||usedIds.has(entry.id)||entry.uploadIndex!==undefined) throw new Error("Choose each photo only once.");
          usedIds.add(entry.id);
          const row=this.db.prepare("SELECT * FROM photos WHERE id=?").get(entry.id) as Row|undefined;
          if(!row) throw new Error("Photo not found.");
          const photo=this.photo(row);
          if(owners.terrariumId?photo.terrariumId!==owners.terrariumId:photo.terrariumId!==null||owners.plantIds.some(plant=>!photo.plantIds?.includes(plant))) throw new Error("Attachments must already belong to every plant or the terrarium in this session.");
        } else {
          if(!Number.isInteger(entry.uploadIndex)||!uploads[entry.uploadIndex]||usedUploads.has(entry.uploadIndex)) throw new Error("Choose valid uploaded photos.");
          usedUploads.add(entry.uploadIndex);
        }
        if(entry.caption!==undefined&&typeof entry.caption!=="string") throw new Error("Photo captions must be text.");
      }
      if(usedUploads.size!==uploads.length) throw new Error("Every uploaded photo must be included in the session.");
      const sessionId=id||randomUUID(),now=new Date().toISOString();
      this.db.prepare(`INSERT INTO progress_sessions(id,terrarium_id,title,detail,event_type,event_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title,detail=excluded.detail,event_type=excluded.event_type,event_date=excluded.event_date,updated_at=excluded.updated_at`)
        .run(sessionId,owners.terrariumId,text(input.title)||"Progress photos",text(input.detail),type,date,old?.createdAt||now,now);
      if(!old) for(const plantId of owners.plantIds) this.db.prepare("INSERT INTO progress_session_plants VALUES(?,?)").run(sessionId,plantId);
      this.db.prepare("DELETE FROM progress_session_photos WHERE session_id=?").run(sessionId);
      entries.forEach((entry:Row,index:number)=>{
        const photoId=entry.id||this.createPhoto({...uploads[entry.uploadIndex],...owners,dateTaken:date,caption:text(entry.caption),tags:input.tags}).id;
        if(entry.id&&entry.caption!==undefined) this.db.prepare("UPDATE photos SET caption=? WHERE id=?").run(text(entry.caption),photoId);
        this.db.prepare("INSERT INTO progress_session_photos VALUES(?,?,?)").run(sessionId,photoId,index);
      });
      return this.get(sessionId)!;
    })();
  }
  delete(id:string) { this.db.prepare("DELETE FROM progress_sessions WHERE id=?").run(id); }
  prune() { this.db.exec("DELETE FROM progress_sessions WHERE terrarium_id IS NULL AND NOT EXISTS(SELECT 1 FROM progress_session_plants WHERE session_id=progress_sessions.id)"); }
}
