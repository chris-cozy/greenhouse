import { JournalRepository, migrateJournal } from "./journal.js";
import { journalExcerpt } from "../src/shared/journal.js";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AppNotifications, CareActivityType, DashboardData, HistoryEventType, JournalEntry, Photo, Plant, PlantStatus, Species, Terrarium, TimelineItem } from "../src/shared/types.js";

type Row=Record<string,any>;
const iso=()=>new Date().toISOString();
const text=(value:unknown)=>typeof value==="string"?value.trim():"";
const nullable=(value:unknown)=>text(value)||null;
const bool=(value:unknown)=>value?1:0;

export class GreenhouseStore {
  private db:Database.Database;
  constructor(public readonly dbPath:string){
    fs.mkdirSync(path.dirname(dbPath),{recursive:true});
    this.db=this.open();
  }
  private open(){
    const db=new Database(this.dbPath);
    db.pragma("journal_mode = WAL"); db.pragma("foreign_keys = ON"); db.pragma("busy_timeout = 5000");
    try { this.migrate(db); return db; } catch (error) { db.close(); throw error; }
  }
  private migrate(db:Database.Database){
    const existing=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='journal_entries'").get();
    if(existing&&!db.prepare("SELECT 1 FROM schema_migrations WHERE version=3").get())db.prepare("VACUUM INTO ?").run(`${this.dbPath}.before-diary-${randomUUID()}.sqlite`);
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS species(
        id TEXT PRIMARY KEY, common_name TEXT NOT NULL DEFAULT '', scientific_name TEXT NOT NULL DEFAULT '', family TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '', native_habitat TEXT NOT NULL DEFAULT '', growth_characteristics TEXT NOT NULL DEFAULT '', mature_size TEXT NOT NULL DEFAULT '',
        light_requirements TEXT NOT NULL DEFAULT '', water_requirements TEXT NOT NULL DEFAULT '', humidity_requirements TEXT NOT NULL DEFAULT '', temperature_range TEXT NOT NULL DEFAULT '',
        substrate_preferences TEXT NOT NULL DEFAULT '', fertilization_recommendations TEXT NOT NULL DEFAULT '', propagation_methods TEXT NOT NULL DEFAULT '', common_problems TEXT NOT NULL DEFAULT '',
        common_pests TEXT NOT NULL DEFAULT '', toxicity TEXT NOT NULL DEFAULT '', terrarium_suitability TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', image_path TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS terrariums(
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', date_created TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
        lighting_setup TEXT NOT NULL DEFAULT '', humidity_requirements TEXT NOT NULL DEFAULT '', watering_notes TEXT NOT NULL DEFAULT '', substrate_information TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
        other_inhabitants TEXT NOT NULL DEFAULT '', cover_photo_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS plants(
        id TEXT PRIMARY KEY, name TEXT NOT NULL, species_id TEXT REFERENCES species(id) ON DELETE SET NULL, description TEXT NOT NULL DEFAULT '', date_acquired TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '', terrarium_id TEXT REFERENCES terrariums(id) ON DELETE SET NULL, status TEXT NOT NULL DEFAULT 'healthy' CHECK(status IN('healthy','needs_attention','recovering','dormant','deceased')),
        profile_photo_id TEXT, archived_at TEXT, date_of_death TEXT NOT NULL DEFAULT '', cause_of_death TEXT NOT NULL DEFAULT '', final_notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS care_items(
        id TEXT PRIMARY KEY, plant_id TEXT NOT NULL REFERENCES plants(id) ON DELETE CASCADE, activity_type TEXT NOT NULL, custom_label TEXT NOT NULL DEFAULT '', guidance TEXT NOT NULL DEFAULT '',
        cadence_days INTEGER, reminder_enabled INTEGER NOT NULL DEFAULT 0, next_reminder_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS species_care_items(id TEXT PRIMARY KEY, species_id TEXT NOT NULL REFERENCES species(id) ON DELETE CASCADE, activity_type TEXT NOT NULL, guidance TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS photos(
        id TEXT PRIMARY KEY, plant_id TEXT REFERENCES plants(id) ON DELETE CASCADE, terrarium_id TEXT REFERENCES terrariums(id) ON DELETE CASCADE, relative_path TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, date_taken TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
        CHECK((plant_id IS NOT NULL AND terrarium_id IS NULL) OR (plant_id IS NULL AND terrarium_id IS NOT NULL))
      );
      CREATE TABLE IF NOT EXISTS journal_entries(id TEXT PRIMARY KEY, title TEXT NOT NULL, entry_date TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS journal_plants(journal_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE, plant_id TEXT NOT NULL REFERENCES plants(id) ON DELETE CASCADE, PRIMARY KEY(journal_id,plant_id));
      CREATE TABLE IF NOT EXISTS journal_terrariums(journal_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE, terrarium_id TEXT NOT NULL REFERENCES terrariums(id) ON DELETE CASCADE, PRIMARY KEY(journal_id,terrarium_id));
      CREATE TABLE IF NOT EXISTS history_events(id TEXT PRIMARY KEY, plant_id TEXT REFERENCES plants(id) ON DELETE CASCADE, terrarium_id TEXT REFERENCES terrariums(id) ON DELETE CASCADE, event_type TEXT NOT NULL, event_date TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tags(id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE);
      CREATE TABLE IF NOT EXISTS plant_tags(plant_id TEXT NOT NULL REFERENCES plants(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(plant_id,tag_id));
      CREATE TABLE IF NOT EXISTS photo_tags(photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(photo_id,tag_id));
      CREATE TABLE IF NOT EXISTS journal_tags(journal_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(journal_id,tag_id));
      CREATE INDEX IF NOT EXISTS idx_plants_status_archive ON plants(status,archived_at);
      CREATE INDEX IF NOT EXISTS idx_plants_species ON plants(species_id);
      CREATE INDEX IF NOT EXISTS idx_plants_terrarium ON plants(terrarium_id);
      CREATE INDEX IF NOT EXISTS idx_photos_plant_date ON photos(plant_id,date_taken);
      CREATE INDEX IF NOT EXISTS idx_photos_terrarium_date ON photos(terrarium_id,date_taken);
      CREATE INDEX IF NOT EXISTS idx_history_plant_date ON history_events(plant_id,event_date);
      CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(entry_date);
      CREATE INDEX IF NOT EXISTS idx_care_reminder ON care_items(reminder_enabled,next_reminder_date);
    `);
    db.prepare("INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(1,?)").run(iso());
    const speciesColumns=(db.prepare("PRAGMA table_info(species)").all() as Row[]).map(column=>column.name);
    if(!speciesColumns.includes("image_path"))db.exec("ALTER TABLE species ADD COLUMN image_path TEXT NOT NULL DEFAULT ''");
    db.prepare("INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(2,?)").run(iso());
    migrateJournal(db);
    db.pragma("optimize");
  }
  close(){this.db.close()}
  backupTo(destination:string){return this.db.backup(destination)}
  replaceDatabase(source:string){if(this.db.open)this.db.close();fs.copyFileSync(source,this.dbPath);this.db=this.open()}

  private tagsFor(kind:"plant"|"photo",id:string):string[]{
    return (this.db.prepare(`SELECT t.name FROM tags t JOIN ${kind}_tags x ON x.tag_id=t.id WHERE x.${kind}_id=? ORDER BY t.name COLLATE NOCASE`).all(id) as Row[]).map(r=>r.name);
  }
  private syncTags(kind:"plant"|"photo",id:string,tags:unknown){
    const values=Array.isArray(tags)?[...new Set(tags.map(text).filter(Boolean))]:[];
    const tx=this.db.transaction(()=>{this.db.prepare(`DELETE FROM ${kind}_tags WHERE ${kind}_id=?`).run(id);for(const name of values){const existing=this.db.prepare("SELECT id FROM tags WHERE name=? COLLATE NOCASE").get(name) as Row|undefined;const tagId=existing?.id||randomUUID();if(!existing)this.db.prepare("INSERT INTO tags(id,name) VALUES(?,?)").run(tagId,name);this.db.prepare(`INSERT INTO ${kind}_tags(${kind}_id,tag_id) VALUES(?,?)`).run(id,tagId)}});tx();
  }
  private rowSpecies(r:Row):Species{return {id:r.id,commonName:r.common_name,scientificName:r.scientific_name,family:r.family,description:r.description,nativeHabitat:r.native_habitat,growthCharacteristics:r.growth_characteristics,matureSize:r.mature_size,lightRequirements:r.light_requirements,waterRequirements:r.water_requirements,humidityRequirements:r.humidity_requirements,temperatureRange:r.temperature_range,substratePreferences:r.substrate_preferences,fertilizationRecommendations:r.fertilization_recommendations,propagationMethods:r.propagation_methods,commonProblems:r.common_problems,commonPests:r.common_pests,toxicity:r.toxicity,terrariumSuitability:r.terrarium_suitability,notes:r.notes,imageUrl:r.image_path?`/media/${r.image_path.replaceAll("\\","/")}`:"",plantCount:Number(r.plant_count||0),createdAt:r.created_at,updatedAt:r.updated_at}}
  private rowPlant(r:Row):Plant{return {id:r.id,name:r.name,speciesId:r.species_id,speciesCommonName:r.species_common_name||"",speciesScientificName:r.species_scientific_name||"",description:r.description,dateAcquired:r.date_acquired,source:r.source,location:r.location,terrariumId:r.terrarium_id,terrariumName:r.terrarium_name||"",status:r.status,profilePhotoId:r.profile_photo_id,profilePhotoUrl:r.profile_path?`/media/${r.profile_path.replaceAll("\\","/")}`:"",archivedAt:r.archived_at,dateOfDeath:r.date_of_death,causeOfDeath:r.cause_of_death,finalNotes:r.final_notes,tags:this.tagsFor("plant",r.id),updatedAt:r.updated_at,createdAt:r.created_at}}
  private plantSelect=`SELECT p.*,s.common_name species_common_name,s.scientific_name species_scientific_name,t.name terrarium_name,pp.relative_path profile_path FROM plants p LEFT JOIN species s ON s.id=p.species_id LEFT JOIN terrariums t ON t.id=p.terrarium_id LEFT JOIN photos pp ON pp.id=p.profile_photo_id`;

  listSpecies(q=""){const rows=this.db.prepare(`SELECT s.*,(SELECT COUNT(*) FROM plants p WHERE p.species_id=s.id) plant_count FROM species s WHERE (?='' OR s.common_name LIKE ? OR s.scientific_name LIKE ? OR s.family LIKE ?) ORDER BY COALESCE(NULLIF(s.common_name,''),s.scientific_name) COLLATE NOCASE`).all(q,`%${q}%`,`%${q}%`,`%${q}%`) as Row[];return rows.map(r=>this.rowSpecies(r))}
  getSpecies(id:string){const r=this.db.prepare(`SELECT s.*,(SELECT COUNT(*) FROM plants p WHERE p.species_id=s.id) plant_count FROM species s WHERE s.id=?`).get(id) as Row|undefined;return r?this.rowSpecies(r):null}
  saveSpecies(input:Row,id=randomUUID()){
    if(!text(input.commonName)&&!text(input.scientificName))throw new Error("Add a common or scientific name.");const now=iso();const existing=this.getSpecies(id);
    const values=[id,text(input.commonName),text(input.scientificName),text(input.family),text(input.description),text(input.nativeHabitat),text(input.growthCharacteristics),text(input.matureSize),text(input.lightRequirements),text(input.waterRequirements),text(input.humidityRequirements),text(input.temperatureRange),text(input.substratePreferences),text(input.fertilizationRecommendations),text(input.propagationMethods),text(input.commonProblems),text(input.commonPests),text(input.toxicity),text(input.terrariumSuitability),text(input.notes),existing?.createdAt||now,now];
    this.db.prepare(`INSERT INTO species(id,common_name,scientific_name,family,description,native_habitat,growth_characteristics,mature_size,light_requirements,water_requirements,humidity_requirements,temperature_range,substrate_preferences,fertilization_recommendations,propagation_methods,common_problems,common_pests,toxicity,terrarium_suitability,notes,created_at,updated_at) VALUES(${values.map(()=>"?").join(",")}) ON CONFLICT(id) DO UPDATE SET common_name=excluded.common_name,scientific_name=excluded.scientific_name,family=excluded.family,description=excluded.description,native_habitat=excluded.native_habitat,growth_characteristics=excluded.growth_characteristics,mature_size=excluded.mature_size,light_requirements=excluded.light_requirements,water_requirements=excluded.water_requirements,humidity_requirements=excluded.humidity_requirements,temperature_range=excluded.temperature_range,substrate_preferences=excluded.substrate_preferences,fertilization_recommendations=excluded.fertilization_recommendations,propagation_methods=excluded.propagation_methods,common_problems=excluded.common_problems,common_pests=excluded.common_pests,toxicity=excluded.toxicity,terrarium_suitability=excluded.terrarium_suitability,notes=excluded.notes,updated_at=excluded.updated_at`).run(...values);return this.getSpecies(id)!;
  }
  setSpeciesImage(id:string,relativePath:string){const current=this.db.prepare("SELECT image_path FROM species WHERE id=?").get(id) as Row|undefined;if(!current)throw new Error("Species not found.");this.db.prepare("UPDATE species SET image_path=?,updated_at=? WHERE id=?").run(relativePath,iso(),id);return {previousPath:String(current.image_path||"")||null,species:this.getSpecies(id)!}}
  deleteSpecies(id:string){const current=this.db.prepare("SELECT image_path FROM species WHERE id=?").get(id) as Row|undefined;this.db.prepare("DELETE FROM species WHERE id=?").run(id);return String(current?.image_path||"")||null}

  listPlants(filters:Row={}){
    const clauses:string[]=[];const args:unknown[]=[];const scope=text(filters.scope)||"living";
    if(scope==="living")clauses.push("p.archived_at IS NULL AND p.status!='deceased'");else if(scope==="deceased")clauses.push("p.archived_at IS NULL AND p.status='deceased'");else if(scope==="archived")clauses.push("p.archived_at IS NOT NULL");
    if(text(filters.q)){clauses.push("(p.name LIKE ? OR s.common_name LIKE ? OR s.scientific_name LIKE ? OR p.location LIKE ? OR p.description LIKE ?)");for(let i=0;i<5;i++)args.push(`%${text(filters.q)}%`)}
    for(const [key,col] of [["status","p.status"],["speciesId","p.species_id"],["terrariumId","p.terrarium_id"]])if(text(filters[key])){clauses.push(`${col}=?`);args.push(text(filters[key]))}
    if(text(filters.tag)){clauses.push("EXISTS(SELECT 1 FROM plant_tags pt JOIN tags tg ON tg.id=pt.tag_id WHERE pt.plant_id=p.id AND tg.name=? COLLATE NOCASE)");args.push(text(filters.tag))}
    const rows=this.db.prepare(`${this.plantSelect} ${clauses.length?`WHERE ${clauses.join(" AND ")}`:""} ORDER BY CASE p.status WHEN 'needs_attention' THEN 0 WHEN 'recovering' THEN 1 ELSE 2 END,p.updated_at DESC`).all(...args) as Row[];return rows.map(r=>this.rowPlant(r));
  }
  getPlant(id:string){const r=this.db.prepare(`${this.plantSelect} WHERE p.id=?`).get(id) as Row|undefined;if(!r)return null;const plant=this.rowPlant(r);plant.careItems=this.listCare(id);plant.photos=this.listPhotos("plant",id);plant.journalEntries=this.listJournal({plantId:id});plant.history=this.timeline("plant",id);return plant}
  savePlant(input:Row,id=randomUUID()){
    if(!text(input.name))throw new Error("Plant name is required.");const now=iso();const old=this.getPlant(id);const status=text(input.status)||"healthy";const values=[id,text(input.name),nullable(input.speciesId),text(input.description),text(input.dateAcquired),text(input.source),text(input.location),nullable(input.terrariumId),status,old?.profilePhotoId||null,old?.archivedAt||null,text(input.dateOfDeath),text(input.causeOfDeath),text(input.finalNotes),old?.createdAt||now,now];
    const tx=this.db.transaction(()=>{this.db.prepare(`INSERT INTO plants(id,name,species_id,description,date_acquired,source,location,terrarium_id,status,profile_photo_id,archived_at,date_of_death,cause_of_death,final_notes,created_at,updated_at) VALUES(${values.map(()=>"?").join(",")}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,species_id=excluded.species_id,description=excluded.description,date_acquired=excluded.date_acquired,source=excluded.source,location=excluded.location,terrarium_id=excluded.terrarium_id,status=excluded.status,date_of_death=excluded.date_of_death,cause_of_death=excluded.cause_of_death,final_notes=excluded.final_notes,updated_at=excluded.updated_at`).run(...values);this.syncTags("plant",id,input.tags);if(!old)this.addEvent(id,null,"acquired",text(input.dateAcquired)||now.slice(0,10),"Joined the greenhouse",text(input.source)?`Acquired from ${text(input.source)}`:"");else{if(old.terrariumId!==nullable(input.terrariumId)||old.location!==text(input.location)){const target=text(input.terrariumId)?(this.db.prepare("SELECT name FROM terrariums WHERE id=?").get(text(input.terrariumId)) as Row|undefined)?.name:text(input.location);this.addEvent(id,null,"moved",now.slice(0,10),target?`Moved to ${target}`:"Location updated","")}if(old.status!==status){const title=status==="deceased"?"Marked as deceased":status==="recovering"?"Recovery underway":status==="needs_attention"?"Needs attention":"Health status updated";this.addEvent(id,null,status==="deceased"?"death":status==="recovering"?"recovery":"note",text(input.dateOfDeath)||now.slice(0,10),title,text(input.causeOfDeath)||"")}}});tx();return this.getPlant(id)!;
  }
  archivePlant(id:string,archived:boolean){this.db.prepare("UPDATE plants SET archived_at=?,updated_at=? WHERE id=?").run(archived?iso():null,iso(),id);return this.getPlant(id)}
  deletePlant(id:string){const files=(this.db.prepare("SELECT relative_path FROM photos WHERE plant_id=?").all(id) as Row[]).map(r=>r.relative_path);this.db.prepare("DELETE FROM plants WHERE id=?").run(id);return files}
  setProfilePhoto(plantId:string,photoId:string|null){if(!this.getPlant(plantId))throw new Error("Plant not found.");if(photoId){const photo=this.db.prepare("SELECT id FROM photos WHERE id=? AND plant_id=?").get(photoId,plantId);if(!photo)throw new Error("Photo does not belong to this plant.")}this.db.prepare("UPDATE plants SET profile_photo_id=?,updated_at=? WHERE id=?").run(photoId,iso(),plantId);return this.getPlant(plantId)}

  listTerrariums(q=""){const rows=this.db.prepare(`SELECT t.*,cp.relative_path cover_path,(SELECT COUNT(*) FROM plants p WHERE p.terrarium_id=t.id AND p.archived_at IS NULL AND p.status!='deceased') plant_count FROM terrariums t LEFT JOIN photos cp ON cp.id=t.cover_photo_id WHERE (?='' OR t.name LIKE ? OR t.type LIKE ? OR t.description LIKE ?) ORDER BY t.updated_at DESC`).all(q,`%${q}%`,`%${q}%`,`%${q}%`) as Row[];return rows.map(r=>this.rowTerrarium(r))}
  private rowTerrarium(r:Row):Terrarium{return {id:r.id,name:r.name,description:r.description,dateCreated:r.date_created,type:r.type,location:r.location,lightingSetup:r.lighting_setup,humidityRequirements:r.humidity_requirements,wateringNotes:r.watering_notes,substrateInformation:r.substrate_information,notes:r.notes,otherInhabitants:r.other_inhabitants,coverPhotoId:r.cover_photo_id,coverPhotoUrl:r.cover_path?`/media/${r.cover_path.replaceAll("\\","/")}`:"",plantCount:Number(r.plant_count||0),createdAt:r.created_at,updatedAt:r.updated_at}}
  getTerrarium(id:string){const r=this.db.prepare(`SELECT t.*,cp.relative_path cover_path,(SELECT COUNT(*) FROM plants p WHERE p.terrarium_id=t.id AND p.archived_at IS NULL AND p.status!='deceased') plant_count FROM terrariums t LEFT JOIN photos cp ON cp.id=t.cover_photo_id WHERE t.id=?`).get(id) as Row|undefined;if(!r)return null;const terrarium=this.rowTerrarium(r);terrarium.plants=this.listPlants({scope:"all",terrariumId:id});terrarium.photos=this.listPhotos("terrarium",id);terrarium.journalEntries=this.listJournal({terrariumId:id});terrarium.history=this.timeline("terrarium",id);return terrarium}
  saveTerrarium(input:Row,id=randomUUID()){if(!text(input.name))throw new Error("Terrarium name is required.");const now=iso();const old=this.getTerrarium(id);const values=[id,text(input.name),text(input.description),text(input.dateCreated),text(input.type),text(input.location),text(input.lightingSetup),text(input.humidityRequirements),text(input.wateringNotes),text(input.substrateInformation),text(input.notes),text(input.otherInhabitants),old?.coverPhotoId||null,old?.createdAt||now,now];this.db.prepare(`INSERT INTO terrariums(id,name,description,date_created,type,location,lighting_setup,humidity_requirements,watering_notes,substrate_information,notes,other_inhabitants,cover_photo_id,created_at,updated_at) VALUES(${values.map(()=>"?").join(",")}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,date_created=excluded.date_created,type=excluded.type,location=excluded.location,lighting_setup=excluded.lighting_setup,humidity_requirements=excluded.humidity_requirements,watering_notes=excluded.watering_notes,substrate_information=excluded.substrate_information,notes=excluded.notes,other_inhabitants=excluded.other_inhabitants,updated_at=excluded.updated_at`).run(...values);return this.getTerrarium(id)!}
  deleteTerrarium(id:string){const plants=this.db.prepare("SELECT id FROM plants WHERE terrarium_id=?").all(id) as Row[];const tx=this.db.transaction(()=>{for(const plant of plants)this.addEvent(plant.id,null,"terrarium_removed",iso().slice(0,10),"Removed from terrarium","The terrarium was deleted.");this.db.prepare("UPDATE plants SET terrarium_id=NULL,updated_at=? WHERE terrarium_id=?").run(iso(),id);this.db.prepare("DELETE FROM terrariums WHERE id=?").run(id)});tx()}
  setCoverPhoto(terrariumId:string,photoId:string|null){if(!this.getTerrarium(terrariumId))throw new Error("Terrarium not found.");if(photoId){const photo=this.db.prepare("SELECT id FROM photos WHERE id=? AND terrarium_id=?").get(photoId,terrariumId);if(!photo)throw new Error("Photo does not belong to this terrarium.")}this.db.prepare("UPDATE terrariums SET cover_photo_id=?,updated_at=? WHERE id=?").run(photoId,iso(),terrariumId);return this.getTerrarium(terrariumId)}

  listCare(plantId:string){return (this.db.prepare("SELECT * FROM care_items WHERE plant_id=? ORDER BY sort_order,id").all(plantId) as Row[]).map(r=>({id:r.id,plantId:r.plant_id,activityType:r.activity_type as CareActivityType,customLabel:r.custom_label,guidance:r.guidance,cadenceDays:r.cadence_days,reminderEnabled:Boolean(r.reminder_enabled),nextReminderDate:r.next_reminder_date,notes:r.notes,sortOrder:r.sort_order}))}
  saveCare(plantId:string,input:Row,id=randomUUID()){const exists=this.db.prepare("SELECT id FROM plants WHERE id=?").get(plantId);if(!exists)throw new Error("Plant not found.");this.db.prepare(`INSERT INTO care_items(id,plant_id,activity_type,custom_label,guidance,cadence_days,reminder_enabled,next_reminder_date,notes,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET activity_type=excluded.activity_type,custom_label=excluded.custom_label,guidance=excluded.guidance,cadence_days=excluded.cadence_days,reminder_enabled=excluded.reminder_enabled,next_reminder_date=excluded.next_reminder_date,notes=excluded.notes,sort_order=excluded.sort_order`).run(id,plantId,text(input.activityType)||"custom",text(input.customLabel),text(input.guidance),Number(input.cadenceDays)>0?Number(input.cadenceDays):null,bool(input.reminderEnabled),text(input.nextReminderDate),text(input.notes),Number(input.sortOrder)||0);return this.listCare(plantId).find(x=>x.id===id)!}
  deleteCare(id:string){this.db.prepare("DELETE FROM care_items WHERE id=?").run(id)}
  dismissReminder(id:string){const item=this.db.prepare("SELECT cadence_days FROM care_items WHERE id=?").get(id) as Row|undefined;if(!item)throw new Error("Reminder not found.");let next="";if(item.cadence_days){const d=new Date();d.setDate(d.getDate()+Number(item.cadence_days));next=d.toISOString().slice(0,10)}this.db.prepare("UPDATE care_items SET next_reminder_date=? WHERE id=?").run(next,id)}

  addEvent(plantId:string|null,terrariumId:string|null,eventType:HistoryEventType,eventDate:string,title:string,detail:string){const id=randomUUID();this.db.prepare("INSERT INTO history_events(id,plant_id,terrarium_id,event_type,event_date,title,detail,created_at) VALUES(?,?,?,?,?,?,?,?)").run(id,plantId,terrariumId,eventType,eventDate||iso().slice(0,10),title,detail,iso());return id}
  saveEvent(input:Row){if(!text(input.title))throw new Error("Update title is required.");const id=this.addEvent(nullable(input.plantId),nullable(input.terrariumId),(text(input.eventType)||"note") as HistoryEventType,text(input.eventDate)||iso().slice(0,10),text(input.title),text(input.detail));return {id}}

  listPhotos(kind:"plant"|"terrarium",id:string):Photo[]{const rows=this.db.prepare(`SELECT * FROM photos WHERE ${kind}_id=? ORDER BY COALESCE(NULLIF(date_taken,''),created_at) DESC`).all(id) as Row[];return rows.map(r=>this.rowPhoto(r))}
  private rowPhoto(r:Row):Photo{return {id:r.id,plantId:r.plant_id,terrariumId:r.terrarium_id,url:`/media/${r.relative_path.replaceAll("\\","/")}`,originalName:r.original_name,mimeType:r.mime_type,sizeBytes:r.size_bytes,dateTaken:r.date_taken,caption:r.caption,tags:this.tagsFor("photo",r.id),createdAt:r.created_at}}
  createPhoto(input:{relativePath:string;originalName:string;mimeType:string;sizeBytes:number;plantId?:string;terrariumId?:string;dateTaken?:string;caption?:string;tags?:string[]}){const id=randomUUID();this.db.prepare("INSERT INTO photos(id,plant_id,terrarium_id,relative_path,original_name,mime_type,size_bytes,date_taken,caption,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id,input.plantId||null,input.terrariumId||null,input.relativePath,input.originalName,input.mimeType,input.sizeBytes,text(input.dateTaken),text(input.caption),iso());this.syncTags("photo",id,input.tags);return this.rowPhoto(this.db.prepare("SELECT * FROM photos WHERE id=?").get(id) as Row)}
  updatePhoto(id:string,input:Row){this.db.prepare("UPDATE photos SET date_taken=?,caption=? WHERE id=?").run(text(input.dateTaken),text(input.caption),id);this.syncTags("photo",id,input.tags);const r=this.db.prepare("SELECT * FROM photos WHERE id=?").get(id) as Row|undefined;return r?this.rowPhoto(r):null}
  deletePhoto(id:string){const r=this.db.prepare("SELECT relative_path,plant_id,terrarium_id FROM photos WHERE id=?").get(id) as Row|undefined;if(!r)return null;this.db.prepare("UPDATE plants SET profile_photo_id=NULL WHERE profile_photo_id=?").run(id);this.db.prepare("UPDATE terrariums SET cover_photo_id=NULL WHERE cover_photo_id=?").run(id);this.db.prepare("DELETE FROM photos WHERE id=?").run(id);return r.relative_path as string}

  get journal(){return new JournalRepository(this.db)}
  listJournal(filters:Row={}){return this.journal.list(filters)}
  getJournal(id:string){return this.journal.get(id)}
  saveJournal(input:Row,id?:string){return this.journal.save(input,id)}
  deleteJournal(id:string){return this.journal.delete(id)}

  timeline(kind:"plant"|"terrarium",id:string):TimelineItem[]{
    const events=(this.db.prepare(`SELECT * FROM history_events WHERE ${kind}_id=?`).all(id) as Row[]).map(r=>({id:r.id,kind:"event" as const,eventType:r.event_type,date:r.event_date,title:r.title,detail:r.detail}));
    const photos=this.listPhotos(kind,id).map(p=>({id:p.id,kind:"photo" as const,date:p.dateTaken||p.createdAt,title:"Progress photo",detail:p.caption,photoUrl:p.url}));
    const journals=this.listJournal(kind==="plant"?{plantId:id}:{terrariumId:id}).map(j=>({id:j.id,kind:"journal" as const,date:j.entryDate,title:j.title,detail:journalExcerpt(j.content,180),journalId:j.id}));
    return [...events,...photos,...journals].sort((a,b)=>b.date.localeCompare(a.date));
  }
  dashboard():DashboardData{
    const gardenPlants=(this.db.prepare("SELECT id,name FROM plants WHERE archived_at IS NULL AND status!='deceased' ORDER BY created_at,rowid").all() as Row[]).map(r=>({id:String(r.id),name:String(r.name)}));
    const gardenTerrariums=(this.db.prepare("SELECT id,name FROM terrariums ORDER BY created_at,rowid").all() as Row[]).map(r=>({id:String(r.id),name:String(r.name)}));
    const livingPlants=gardenPlants.length;
    const terrariums=gardenTerrariums.length;
    const photos=(this.db.prepare("SELECT * FROM photos ORDER BY COALESCE(NULLIF(date_taken,''),created_at) DESC LIMIT 8").all() as Row[]).map(r=>this.rowPhoto(r));
    const reminders=(this.db.prepare(`SELECT c.*,p.name plant_name FROM care_items c JOIN plants p ON p.id=c.plant_id WHERE c.reminder_enabled=1 AND c.next_reminder_date!='' AND p.archived_at IS NULL AND p.status!='deceased' ORDER BY c.next_reminder_date LIMIT 8`).all() as Row[]).map(r=>({...this.listCare(r.plant_id).find(x=>x.id===r.id)!,plantName:r.plant_name}));
    return {livingPlants,terrariums,gardenPlants,gardenTerrariums,attentionPlants:this.listPlants({scope:"all"}).filter(p=>!p.archivedAt&&(p.status==="needs_attention"||p.status==="recovering")).slice(0,6),recentlyUpdated:this.listPlants({scope:"living"}).slice(0,6),recentJournals:this.listJournal().slice(0,5),recentPhotos:photos,upcomingReminders:reminders};
  }
  notifications():AppNotifications{
    const attentionPlants=(this.db.prepare("SELECT id,name,status FROM plants WHERE archived_at IS NULL AND status IN('needs_attention','recovering') ORDER BY CASE status WHEN 'needs_attention' THEN 0 ELSE 1 END,created_at,rowid").all() as Row[]).map(r=>({id:String(r.id),name:String(r.name),status:r.status as PlantStatus}));
    const attentionTerrariums=(this.db.prepare("SELECT t.id,t.name,COUNT(*) resident_attention_count FROM terrariums t JOIN plants p ON p.terrarium_id=t.id WHERE p.archived_at IS NULL AND p.status IN('needs_attention','recovering') GROUP BY t.id,t.name ORDER BY t.created_at,t.rowid").all() as Row[]).map(r=>({id:String(r.id),name:String(r.name),residentAttentionCount:Number(r.resident_attention_count)}));
    return {attentionCount:attentionPlants.length+attentionTerrariums.length,attentionPlants,attentionTerrariums};
  }
  options(){return {species:this.listSpecies(),terrariums:this.listTerrariums(),tags:(this.db.prepare("SELECT name FROM tags ORDER BY name COLLATE NOCASE").all() as Row[]).map(r=>r.name)}}
  search(q:string){if(!text(q))return [];const like=`%${text(q)}%`;const results:any[]=[];for(const r of this.db.prepare(`${this.plantSelect} WHERE p.name LIKE ? OR s.common_name LIKE ? OR s.scientific_name LIKE ? LIMIT 8`).all(like,like,like) as Row[])results.push({id:r.id,type:"plant",title:r.name,subtitle:r.species_common_name||r.species_scientific_name||r.location,url:`/plants/${r.id}`});for(const r of this.db.prepare("SELECT * FROM species WHERE common_name LIKE ? OR scientific_name LIKE ? OR family LIKE ? LIMIT 6").all(like,like,like) as Row[])results.push({id:r.id,type:"species",title:r.common_name||r.scientific_name,subtitle:r.scientific_name||r.family,url:`/species/${r.id}`});for(const r of this.db.prepare("SELECT * FROM terrariums WHERE name LIKE ? OR description LIKE ? OR type LIKE ? LIMIT 6").all(like,like,like) as Row[])results.push({id:r.id,type:"terrarium",title:r.name,subtitle:r.type||r.location,url:`/terrariums/${r.id}`});for(const r of this.db.prepare("SELECT * FROM journal_entries WHERE title LIKE ? OR content LIKE ? LIMIT 6").all(like,like) as Row[])results.push({id:r.id,type:"journal",title:r.title,subtitle:r.entry_date,url:`/journal/${r.id}`});return results}
}
