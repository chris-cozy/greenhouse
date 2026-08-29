import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { GreenhouseStore } from "../server/store";
import { localDateKey } from "../src/shared/journal";
import { getPlantIcon, getTerrariumIcon, PLANT_ICON_IMAGES, TERRARIUM_ICON_IMAGES } from "../src/shared/plantIcons";

const cleanup:string[]=[];
afterEach(()=>{for(const dir of cleanup.splice(0))fs.rmSync(dir,{recursive:true,force:true})});
function makeStore(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),"greenhouse-test-"));cleanup.push(dir);return {store:new GreenhouseStore(path.join(dir,"greenhouse.sqlite")),dir}}

describe("Greenhouse local store",()=>{
  it("keeps reusable species separate from individual plants",()=>{const {store}=makeStore();const species=store.saveSpecies({commonName:"Button fern",scientificName:"Pellaea rotundifolia",humidityRequirements:"Moderate"});const first=store.savePlant({name:"Mosslight",speciesId:species.id,status:"healthy",tags:["fern"]});const second=store.savePlant({name:"Orbit",speciesId:species.id,status:"healthy"});store.setSpeciesImage(species.id,"species/button-fern.jpg");expect(store.getSpecies(species.id)?.plantCount).toBe(2);expect(store.getSpecies(species.id)?.imageUrl).toBe("/media/species/button-fern.jpg");expect(store.getPlant(first.id)?.speciesScientificName).toBe("Pellaea rotundifolia");expect(store.getPlant(second.id)?.name).toBe("Orbit");store.close()});

  it("moves plants without losing history or care guidance",()=>{const {store}=makeStore();const terrarium=store.saveTerrarium({name:"Cloud Forest",type:"Closed tropical"});const plant=store.savePlant({name:"Mosslight",location:"Studio",status:"recovering"});store.saveCare(plant.id,{activityType:"watering",guidance:"Water when the surface begins to dry",cadenceDays:7,reminderEnabled:true,nextReminderDate:"2026-08-29"});store.savePlant({...plant,terrariumId:terrarium.id,location:"",tags:[]},plant.id as any);const moved=store.getPlant(plant.id)!;expect(moved.terrariumName).toBe("Cloud Forest");expect(moved.careItems).toHaveLength(1);expect(moved.history?.some(item=>item.title.includes("Cloud Forest"))).toBe(true);store.close()});

  it("assigns sprites on creation and persists valid user selections",()=>{const {store}=makeStore();const randomPlant=store.savePlant({name:"Surprise fern"});const randomTerrarium=store.saveTerrarium({name:"Surprise jar"});expect(PLANT_ICON_IMAGES).toContain(randomPlant.spriteImage);expect(TERRARIUM_ICON_IMAGES).toContain(randomTerrarium.spriteImage);const selectedPlant=store.savePlant({name:"Mosslight",spriteImage:"/images/plant-spirit-moss-seated.png"});const selectedTerrarium=store.saveTerrarium({name:"Moss world",spriteImage:"/images/plant-spirit-moss-terrarium.png"});expect(store.getPlant(selectedPlant.id)?.spriteImage).toBe("/images/plant-spirit-moss-seated.png");expect(store.getTerrarium(selectedTerrarium.id)?.spriteImage).toBe("/images/plant-spirit-moss-terrarium.png");expect(()=>store.savePlant({name:"Invalid",spriteImage:"/images/not-a-sprite.png"})).toThrow("valid plant sprite");expect(()=>store.saveTerrarium({name:"Invalid",spriteImage:"/images/not-a-sprite.png"})).toThrow("valid terrarium sprite");store.close()});

  it("shows one linked journal entry in every relevant timeline",()=>{const {store}=makeStore();const one=store.savePlant({name:"One",status:"healthy"});const two=store.savePlant({name:"Two",status:"healthy"});const journal=store.saveJournal({title:"Rehabilitation notes",entryDate:"2026-08-22",content:"Both plants are showing new growth.",plantIds:[one.id,two.id],terrariumIds:[],tags:["recovery"]});expect(store.getPlant(one.id)?.journalEntries?.[0].id).toBe(journal.id);expect(store.getPlant(two.id)?.history?.filter(item=>item.journalId===journal.id)).toHaveLength(1);store.close()});

  it("retains deceased profiles while excluding them from living totals",()=>{const {store}=makeStore();const plant=store.savePlant({name:"Remembered fern",status:"healthy"});store.savePlant({...plant,status:"deceased",dateOfDeath:"2026-08-20",causeOfDeath:"Heat stress",tags:[]},plant.id as any);expect(store.dashboard().livingPlants).toBe(0);expect(store.listPlants({scope:"deceased"})).toHaveLength(1);expect(store.getPlant(plant.id)?.causeOfDeath).toBe("Heat stress");store.close()});

  it("builds an ordered garden from living plants and every terrarium",()=>{const {store}=makeStore();const firstTerrarium=store.saveTerrarium({name:"Cloud Garden"});const resident=store.savePlant({name:"Moss",status:"healthy",terrariumId:firstTerrarium.id});const standalone=store.savePlant({name:"Fern",status:"dormant"});store.savePlant({name:"Memorial",status:"deceased"});const archived=store.savePlant({name:"Archived cutting",status:"healthy"});store.archivePlant(archived.id,true);const secondTerrarium=store.saveTerrarium({name:"Desert Bowl"});const dashboard=store.dashboard();expect(dashboard.gardenPlants).toEqual([{id:resident.id,name:"Moss",spriteImage:resident.spriteImage},{id:standalone.id,name:"Fern",spriteImage:standalone.spriteImage}]);expect(dashboard.gardenTerrariums).toEqual([{id:firstTerrarium.id,name:"Cloud Garden",spriteImage:firstTerrarium.spriteImage},{id:secondTerrarium.id,name:"Desert Bowl",spriteImage:secondTerrarium.spriteImage}]);expect(dashboard.livingPlants).toBe(2);expect(dashboard.terrariums).toBe(2);store.close()});

  it("returns direct plant and affected terrarium notifications",()=>{const {store}=makeStore();const terrarium=store.saveTerrarium({name:"Cloud Garden"});store.savePlant({name:"Healthy",status:"healthy"});const concern=store.savePlant({name:"Concern",status:"needs_attention",terrariumId:terrarium.id});const recovering=store.savePlant({name:"Recovering",status:"recovering"});const archived=store.savePlant({name:"Hidden concern",status:"needs_attention",terrariumId:terrarium.id});store.archivePlant(archived.id,true);expect(store.notifications()).toEqual({attentionCount:3,attentionPlants:[{id:concern.id,name:"Concern",status:"needs_attention",spriteImage:concern.spriteImage},{id:recovering.id,name:"Recovering",status:"recovering",spriteImage:recovering.spriteImage}],attentionTerrariums:[{id:terrarium.id,name:"Cloud Garden",residentAttentionCount:1,spriteImage:terrarium.spriteImage}]});store.close()});

  it("creates a valid portable SQLite snapshot",async()=>{const {store,dir}=makeStore();store.savePlant({name:"Sol",status:"healthy"});const snapshot=path.join(dir,"backup.sqlite");await store.backupTo(snapshot);const backup=new Database(snapshot,{readonly:true});expect((backup.prepare("SELECT COUNT(*) count FROM plants").get() as {count:number}).count).toBe(1);expect((backup.pragma("integrity_check") as Array<{integrity_check:string}>)[0].integrity_check).toBe("ok");backup.close();store.close()});

  it("migrates legacy records to their existing stable sprite assignments",()=>{const {store}=makeStore();const plant=store.savePlant({name:"Legacy fern"},"legacy-plant" as any);const terrarium=store.saveTerrarium({name:"Legacy jar"},"legacy-terrarium" as any);const dbPath=store.dbPath;store.close();const db=new Database(dbPath);db.exec("ALTER TABLE plants DROP COLUMN sprite_image; ALTER TABLE terrariums DROP COLUMN sprite_image; DELETE FROM schema_migrations WHERE version=4");db.close();const migrated=new GreenhouseStore(dbPath);expect(migrated.getPlant(plant.id)?.spriteImage).toBe(getPlantIcon(plant.id));expect(migrated.getTerrarium(terrarium.id)?.spriteImage).toBe(getTerrariumIcon(terrarium.id));migrated.close()});

  it("preserves Markdown, creation metadata, and revisions without rewriting a no-op save",()=>{
    const {store}=makeStore();
    const content="    indented code\n\n| A | B |\n| - | - |\n| x | y |\n\n";
    const entry=store.saveJournal({content,createdAt:"2020-04-03T15:00:00.000Z",timezoneOffset:240,tags:["Fern","fern"]});
    expect(entry.title).toBe("Untitled entry");expect(entry.content).toBe(content);expect(entry.entryDate).toBe("2020-04-03");expect(entry.tags).toEqual(["Fern"]);
    const same=store.saveJournal({...entry,expectedRevision:entry.revision},entry.id);
    expect(same.revision).toBe(entry.revision);expect(same.updatedAt).toBe(entry.updatedAt);
    const edited=store.saveJournal({...entry,title:"New title",expectedRevision:entry.revision},entry.id);
    expect(edited.revision).toBe(2);expect(edited.createdAt).toBe(entry.createdAt);expect(edited.recordedAt).toBe(entry.recordedAt);
    expect(()=>store.saveJournal({...entry,expectedRevision:1},entry.id)).toThrow("changed elsewhere");
    store.deleteJournal(entry.id);expect(()=>store.saveJournal({...entry,expectedRevision:2},entry.id)).toThrow("not found");store.close();
  });

  it("keeps diary tag creation, rename, deletion, and search separate from plant/photo tags",()=>{
    const {store}=makeStore();const plant=store.savePlant({name:"Fern",tags:["growth"]});
    const photo=store.createPhoto({relativePath:"plant.jpg",originalName:"p.jpg",mimeType:"image/jpeg",sizeBytes:20,plantId:plant.id,tags:["growth"]});
    const entry=store.saveJournal({title:"Observation",content:"A new frond",tags:["growth"]});
    const tag=store.journal.tags()[0];expect(tag.entryCount).toBe(1);
    expect(()=>store.journal.createTag("GROWTH")).toThrow("already exists");
    store.journal.changeTag(tag.id,"Progress");expect(store.getJournal(entry.id)?.tags).toEqual(["Progress"]);
    expect(store.listJournal({q:"Progress"})).toHaveLength(1);expect(store.listJournal({tag:"PROGRESS"})).toHaveLength(1);
    expect(store.getPlant(plant.id)?.tags).toEqual(["growth"]);expect(store.getPlant(plant.id)?.photos?.find(p=>p.id===photo.id)?.tags).toEqual(["growth"]);
    store.journal.changeTag(tag.id);expect(store.getJournal(entry.id)?.tags).toEqual([]);expect(store.getJournal(entry.id)?.revision).toBe(3);store.close();
  });

  it("keeps diary chronology at timezone boundaries and changes only the editable creation timestamp",()=>{
    const {store}=makeStore();
    const entry=store.saveJournal({createdAt:"2026-08-27T01:00:00.000Z",timezoneOffset:240});expect(entry.entryDate).toBe("2026-08-26");
    const textEdit=store.saveJournal({content:"Later observation"},entry.id);expect(textEdit.entryDate).toBe(entry.entryDate);
    const creationEdit=store.saveJournal({createdAt:"2020-01-01T23:30:00.000Z",timezoneOffset:-600},entry.id);expect(creationEdit.entryDate).toBe("2020-01-02");expect(creationEdit.recordedAt).toBe(entry.recordedAt);expect(creationEdit.revision).toBe(3);
    expect(()=>store.saveJournal({createdAt:"2026-02-30T12:00:00Z"},entry.id)).toThrow("valid creation date");
    expect(store.getJournal(entry.id)).toEqual(creationEdit);store.close();
  });

  it("only permits owned cover photos and clears a deleted cover without replacing it on upload",()=>{
    const {store}=makeStore();const plant=store.savePlant({name:"Fern"}),other=store.savePlant({name:"Moss"}),terrarium=store.saveTerrarium({name:"Jar"});
    const photo=store.createPhoto({relativePath:"one.jpg",originalName:"1.jpg",mimeType:"image/jpeg",sizeBytes:20,plantId:plant.id});
    const habitat=store.createPhoto({relativePath:"jar.jpg",originalName:"2.jpg",mimeType:"image/jpeg",sizeBytes:20,terrariumId:terrarium.id});
    expect(()=>store.setProfilePhoto(other.id,photo.id)).toThrow("does not belong");expect(()=>store.setCoverPhoto(terrarium.id,photo.id)).toThrow("does not belong");
    expect(()=>store.setProfilePhoto("missing",null)).toThrow("not found");expect(()=>store.setCoverPhoto("missing",null)).toThrow("not found");
    store.setProfilePhoto(plant.id,photo.id);store.setCoverPhoto(terrarium.id,habitat.id);
    store.createPhoto({relativePath:"new.jpg",originalName:"new.jpg",mimeType:"image/jpeg",sizeBytes:20,plantId:plant.id});
    expect(store.getPlant(plant.id)?.profilePhotoUrl).toBe("/media/one.jpg");expect(store.getTerrarium(terrarium.id)?.coverPhotoUrl).toBe("/media/jar.jpg");
    store.deletePhoto(photo.id);store.deletePhoto(habitat.id);expect(store.getPlant(plant.id)?.profilePhotoId).toBeNull();expect(store.getTerrarium(terrarium.id)?.coverPhotoId).toBeNull();store.close();
  });

  it("retains images needed by undo or another entry and deletes only unshared attachments",()=>{
    const {store}=makeStore();const one=store.saveJournal({title:"One"}),two=store.saveJournal({title:"Two"});
    const image=store.journal.addImage(one.id,{relativePath:`journal/${one.id}/image.png`,originalName:"image.png",mimeType:"image/png",sizeBytes:20});
    store.saveJournal({...two,content:`![Fern](${image.url})`},two.id);
    expect(store.deleteJournal(one.id)).toEqual([]);expect(store.deleteJournal(two.id)).toEqual([`journal/${one.id}/image.png`]);store.close();
  });

  it("migrates old diary dates and shared tags once, with a pre-migration snapshot",async()=>{
    const {store,dir}=makeStore();const plant=store.savePlant({name:"Legacy plant",tags:["growth"]});const dbPath=store.dbPath;store.close();
    const db=new Database(dbPath);db.pragma("foreign_keys = OFF");
    db.exec("DROP TABLE journal_tags; DROP TABLE journal_tag_definitions; DROP TABLE journal_images; ALTER TABLE journal_entries DROP COLUMN recorded_at; ALTER TABLE journal_entries DROP COLUMN revision; DELETE FROM schema_migrations WHERE version=3; CREATE TABLE journal_tags(journal_id TEXT,tag_id TEXT)");
    db.prepare("INSERT INTO journal_entries(id,title,entry_date,content,created_at,updated_at) VALUES(?,?,?,?,?,?)").run("legacy","Old diary","2020-01-03","  legacy content  ","2026-08-20T14:00:00.000Z","2026-08-21T10:00:00.000Z");
    const original="2026-08-21T02:30:00.000Z";
    db.prepare("INSERT INTO journal_entries(id,title,entry_date,content,created_at,updated_at) VALUES(?,?,?,?,?,?)").run("same-day","Keep original",localDateKey(original),"Existing chronology",original,original);
    db.prepare("INSERT INTO journal_plants VALUES(?,?)").run("legacy",plant.id);
    const tag=db.prepare("SELECT id FROM tags WHERE name='growth'").get() as {id:string};db.prepare("INSERT INTO journal_tags VALUES(?,?)").run("legacy",tag.id);db.close();
    const migrated=new GreenhouseStore(dbPath),entry=migrated.getJournal("legacy")!;
    expect(entry.entryDate).toBe("2020-01-03");expect(new Date(entry.createdAt).getFullYear()).toBe(2020);expect(new Date(entry.createdAt).getHours()).toBe(12);
    expect(entry.recordedAt).toBe("2026-08-20T14:00:00.000Z");expect(entry.updatedAt).toBe("2026-08-21T10:00:00.000Z");expect(entry.content).toBe("  legacy content  ");expect(entry.tags).toEqual(["growth"]);
    expect(migrated.getPlant(plant.id)?.tags).toEqual(["growth"]);
    expect(migrated.getJournal("same-day")?.createdAt).toBe(original);expect(entry.plantIds).toEqual([plant.id]);
    const backups=fs.readdirSync(dir).filter(file=>file.includes("before-diary"));expect(backups).toHaveLength(1);
    const backup=new Database(path.join(dir,backups[0]),{readonly:true});expect(backup.prepare("SELECT content FROM journal_entries WHERE id='legacy'").get()).toEqual({content:"  legacy content  "});backup.close();
    migrated.replaceDatabase(path.join(dir,backups[0]));expect(migrated.getJournal("legacy")).toEqual(entry);
    const snapshot=path.join(dir,"new-backup.sqlite");await migrated.backupTo(snapshot);migrated.replaceDatabase(snapshot);expect(migrated.getJournal("legacy")).toEqual(entry);migrated.close();
    const reopened=new GreenhouseStore(dbPath);expect(reopened.getJournal("legacy")).toEqual(entry);expect(fs.readdirSync(dir).filter(file=>file.includes("before-diary"))).toHaveLength(2);reopened.close();
  });
});
