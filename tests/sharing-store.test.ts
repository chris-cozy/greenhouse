import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GreenhouseStore } from "../server/store";

const dirs:string[]=[],stores:GreenhouseStore[]=[];
function create(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),"greenhouse-sharing-"));dirs.push(dir);const store=new GreenhouseStore(path.join(dir,"greenhouse.sqlite"));stores.push(store);return {store,dir}}
afterEach(()=>{for(const store of stores.splice(0))try{store.close()}catch{}for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true})});
const image={relativePath:"progress/group.png",originalName:"group.png",mimeType:"image/png",sizeBytes:42};

describe("shared records",()=>{
  it("reuses trimmed sources and locations across all plant states and terrariums",()=>{
    const {store}=create();store.saveTerrarium({name:"Jar",location:"North shelf"});
    const one=store.savePlant({name:"One",source:"  Plant swap  ",location:" north SHELF ",tags:["growth","GROWTH"]});
    const two=store.savePlant({name:"Two",source:"plant SWAP",location:"South window",status:"deceased"});store.archivePlant(one.id,true);
    expect(two.source).toBe("Plant swap");expect(one.location).toBe("North shelf");expect(one.tags).toEqual(["growth"]);
    expect(store.options()).toEqual(expect.objectContaining({sources:["Plant swap"],locations:["North shelf","South window"],plants:expect.arrayContaining([expect.objectContaining({id:one.id,archivedAt:expect.any(String)}),expect.objectContaining({id:two.id,status:"deceased"})])}));
  });
  it("shares a single photo, edits links, and keeps covers independent",()=>{
    const {store}=create(),one=store.savePlant({name:"One"}),two=store.savePlant({name:"Two"});
    const photo=store.createPhoto({...image,plantIds:[one.id,two.id,one.id],tags:["growth","Growth"]});
    expect(photo.plantIds).toHaveLength(2);expect(photo.tags).toEqual(["growth"]);
    for(const plant of [one,two]){expect(store.getPlant(plant.id)?.photos?.map(p=>p.id)).toEqual([photo.id]);expect(store.timeline("plant",plant.id).filter(item=>item.id===photo.id)).toHaveLength(1);store.setProfilePhoto(plant.id,photo.id)}
    expect(store.dashboard().recentPhotos).toHaveLength(1);
    expect(()=>store.updatePhoto(photo.id,{plantIds:[],caption:"Lost"})).toThrow();
    expect(()=>store.updatePhoto(photo.id,{plantIds:["missing"],tags:["lost"]})).toThrow();
    expect(store.listPhotos("plant",one.id)[0].tags).toEqual(["growth"]);
    store.updatePhoto(photo.id,{plantIds:[two.id],caption:"Group growth",tags:["spring"]});
    expect(store.getPlant(one.id)?.profilePhotoId).toBeNull();expect(store.listPhotos("plant",one.id)).toEqual([]);
    expect(store.getPlant(two.id)?.profilePhotoId).toBe(photo.id);expect(store.listPhotos("plant",two.id)[0].caption).toBe("Group growth");
    expect(()=>store.setProfilePhoto(one.id,photo.id)).toThrow("does not belong");
    store.deletePhoto(photo.id);expect(store.getPlant(two.id)?.profilePhotoId).toBeNull();expect(store.dashboard().recentPhotos).toEqual([]);
  });
  it("deletes files only after the last linked plant is deleted",()=>{
    const {store}=create(),one=store.savePlant({name:"One"}),two=store.savePlant({name:"Two"});
    const photo=store.createPhoto({...image,plantIds:[one.id,two.id]});store.setProfilePhoto(two.id,photo.id);
    expect(store.deletePlant(one.id)).toEqual([]);expect(store.getPlant(two.id)?.photos?.[0].id).toBe(photo.id);expect(store.getPlant(two.id)?.profilePhotoId).toBe(photo.id);
    expect(store.deletePlant(two.id)).toEqual([image.relativePath]);expect(store.dashboard().recentPhotos).toEqual([]);
  });
  it("shares care instructions while reminder actions remain independent",()=>{
    const {store}=create(),one=store.savePlant({name:"One"}),two=store.savePlant({name:"Two"});
    const first=store.saveCare(one.id,{activityType:"watering",guidance:"Wait until dry",cadenceDays:10,notes:"Less in winter",reminderEnabled:true,reminderRepeat:true,reminderCadenceDays:3,nextReminderDate:"2026-09-29"});
    const second=store.saveCare(two.id,{guidanceId:first.guidanceId,reminderEnabled:true,reminderRepeat:false,nextReminderDate:"2026-10-03"});
    expect(second.guidance).toBe(first.guidance);expect(store.listGuidance("One")).toHaveLength(1);expect(store.listGuidance()[0].linkedPlants).toHaveLength(2);
    expect(()=>store.saveCare(two.id,{guidanceId:first.guidanceId})).toThrow("already linked");
    expect(()=>store.saveCare(two.id,{guidance:"Wrong plant"},first.id as any)).toThrow("does not belong");
    store.saveCare(one.id,{...first,guidance:"Check the soil first",cadenceDays:12},first.id as any);
    expect(store.listCare(two.id)[0]).toEqual(expect.objectContaining({id:second.id,guidance:"Check the soil first",cadenceDays:12,nextReminderDate:"2026-10-03",reminderRepeat:false}));
    const completed=store.completeReminder(first.id,"2026-09-29");expect(completed.reminder.nextReminderDate).toBe("2026-10-02");
    store.restoreReminder(first.id,completed.previous);store.snoozeReminder(first.id,4,"2026-09-29");store.disableReminder(first.id);
    expect(store.listCare(two.id)[0]).toEqual(expect.objectContaining({reminderEnabled:true,nextReminderDate:"2026-10-03"}));
    store.deletePlant(one.id);expect(store.listCare(two.id)[0].guidance).toBe("Check the soil first");expect(store.listGuidance()).toHaveLength(1);
    store.deleteCare(second.id);expect(store.listGuidance()).toEqual([]);
  });
  it("preserves shared associations and media paths through backup and replacement",async()=>{
    const {store,dir}=create(),one=store.savePlant({name:"One"}),two=store.savePlant({name:"Two"});
    const photo=store.createPhoto({...image,plantIds:[one.id,two.id]});const care=store.saveCare(one.id,{guidance:"Shared instructions"});store.saveCare(two.id,{guidanceId:care.guidanceId});
    const backup=path.join(dir,"backup.sqlite");await store.backupTo(backup);store.deletePlant(one.id);store.replaceDatabase(backup);
    expect(store.listPhotos("plant",one.id)[0]).toEqual(expect.objectContaining({id:photo.id,url:"/media/progress/group.png",plantIds:expect.arrayContaining([one.id,two.id])}));
    expect(store.listCare(one.id)[0].guidanceId).toBe(store.listCare(two.id)[0].guidanceId);
  });
  it("migrates legacy records once without merging duplicates or losing tags and covers",()=>{
    const {store,dir}=create();store.close();
    const snapshot=fs.readdirSync(dir).find(name=>name.includes("before-sharing"))!;
    const legacy=path.join(dir,"legacy.sqlite");fs.copyFileSync(path.join(dir,snapshot),legacy);
    const db=new Database(legacy);db.pragma("foreign_keys = ON");
    db.prepare("INSERT INTO plants(id,name,created_at,updated_at,profile_photo_id) VALUES('one','One','2026-09-01','2026-09-01','photo')").run();
    db.exec("INSERT INTO photos(id,plant_id,relative_path,original_name,mime_type,size_bytes,created_at) VALUES('photo','one','plants/one/old.png','old.png','image/png',42,'2026-09-01'); INSERT INTO tags VALUES('tag','growth'); INSERT INTO photo_tags VALUES('photo','tag'); INSERT INTO care_items(id,plant_id,activity_type,guidance,cadence_days,reminder_enabled,reminder_repeat,reminder_cadence_days,next_reminder_date) VALUES('care1','one','watering','Identical',10,1,1,3,'2026-09-29'),('care2','one','watering','Identical',10,0,0,NULL,'')");db.close();
    const migrated=new GreenhouseStore(legacy);stores.push(migrated);
    expect(migrated.getPlant("one")).toEqual(expect.objectContaining({profilePhotoId:"photo",photos:[expect.objectContaining({id:"photo",plantIds:["one"],tags:["growth"],url:"/media/plants/one/old.png"})]}));
    expect(migrated.listCare("one").find(c=>c.id==="care1")).toEqual(expect.objectContaining({nextReminderDate:"2026-09-29",reminderCadenceDays:3}));expect(migrated.listGuidance()).toHaveLength(2);
    const count=fs.readdirSync(dir).filter(name=>name.startsWith("legacy.sqlite.before-sharing")).length;migrated.close();
    const reopened=new GreenhouseStore(legacy);stores.push(reopened);expect(reopened.listPhotos("plant","one")).toHaveLength(1);expect(reopened.listGuidance()).toHaveLength(2);
    expect(fs.readdirSync(dir).filter(name=>name.startsWith("legacy.sqlite.before-sharing"))).toHaveLength(count);
  });
});
