import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { GreenhouseStore } from "../server/store";

let dir:string,store:GreenhouseStore;
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"greenhouse-progress-"));store=new GreenhouseStore(path.join(dir,"test.sqlite"))});
afterEach(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true})});
const file=(name:string)=>({relativePath:name,originalName:name,mimeType:"image/png",sizeBytes:12});
const note={title:"New growth",detail:"Two leaves",eventDate:"2026-11-15",eventType:"new_growth"};
describe("progress sessions",()=>{
  it("keeps one story entry with ordered gallery photos, per-photo captions and covers",()=>{
    const plant=store.savePlant({name:"Fern"});
    const session=store.progress.save({...note,plantIds:[plant.id],photos:[{uploadIndex:1,caption:"Close up"},{uploadIndex:0,caption:"Whole plant"}]},[file("one.png"),file("two.png")]);
    expect(session.photos.map(p=>p.originalName)).toEqual(["two.png","one.png"]);
    expect(store.listPhotos("plant",plant.id)).toHaveLength(2);
    expect(store.timeline("plant",plant.id).filter(item=>item.kind==="photo")).toEqual([]);
    expect(store.timeline("plant",plant.id).find(item=>item.kind==="session")).toMatchObject({detail:"Two leaves",photos:[{caption:"Close up"},{caption:"Whole plant"}]});
    store.setProfilePhoto(plant.id,session.photos[0].id);
    const edited=store.progress.save({...note,title:"Edited",eventDate:"2026-11-16",photos:[{id:session.photos[0].id,caption:"Updated"}]},[],session.id);
    expect(edited.photos[0].dateTaken).toBe("2026-11-15");
    expect(store.getPlant(plant.id)?.profilePhotoId).toBe(session.photos[0].id);
    expect(store.timeline("plant",plant.id).filter(item=>item.kind==="photo")).toHaveLength(1);
    store.progress.delete(session.id);
    expect(store.listPhotos("plant",plant.id)).toHaveLength(2);
    expect(store.getPlant(plant.id)?.profilePhotoId).toBe(session.photos[0].id);
  });
  it("reuses existing photos across notes and synchronizes captions without copying files",()=>{
    const one=store.savePlant({name:"One"}),two=store.savePlant({name:"Two"});
    const photo=store.createPhoto({...file("shared.png"),plantIds:[one.id,two.id],dateTaken:"2026-01-01"});
    const first=store.progress.save({...note,plantIds:[one.id,two.id],photos:[{id:photo.id,caption:"Shared"}]});
    const second=store.progress.save({...note,plantIds:[one.id],photos:[{id:photo.id,caption:"New caption"}]});
    expect(store.progress.get(first.id)?.photos[0].caption).toBe("New caption");
    expect(store.listPhotos("plant",one.id)).toHaveLength(1);
    expect(store.listPhotos("plant",one.id)[0].sessions).toHaveLength(2);
    expect(()=>store.updatePhoto(photo.id,{plantIds:[two.id]})).toThrow(/Detach/);
    store.deletePlant(one.id);
    expect(store.progress.get(first.id)?.plantIds).toEqual([two.id]);
    expect(store.progress.get(second.id)).toBeNull();
    expect(store.listPhotos("plant",two.id)[0].id).toBe(photo.id);
    store.deletePhoto(photo.id);
    expect(store.progress.get(first.id)?.photos).toEqual([]);
  });
  it("supports note-only sessions and terrarium photos without touching old history",()=>{
    const habitat=store.saveTerrarium({name:"Glass"});
    const legacy=store.saveEvent({terrariumId:habitat.id,title:"Old note"});
    const noteOnly=store.progress.save({...note,terrariumId:habitat.id,photos:[]});
    const session=store.progress.save({...note,terrariumId:habitat.id,photos:[{uploadIndex:0}]},[file("jar.png")]);
    expect(store.timeline("terrarium",habitat.id).map(item=>item.id)).toEqual(expect.arrayContaining([legacy.id,noteOnly.id,session.id]));
    expect(store.listPhotos("terrarium",habitat.id)[0].terrariumId).toBe(habitat.id);
    store.deleteTerrarium(habitat.id);expect(store.progress.get(session.id)).toBeNull();
  });
  it("rejects foreign attachments, duplicate photos, invalid dates and excessive batches atomically",()=>{
    const one=store.savePlant({name:"One"}),two=store.savePlant({name:"Two"});
    const photo=store.createPhoto({...file("one.png"),plantIds:[one.id]});
    expect(()=>store.progress.save({...note,plantIds:[two.id],photos:[{id:photo.id}]})).toThrow(/belong/);
    expect(()=>store.progress.save({...note,plantIds:[one.id],photos:[{id:photo.id},{id:photo.id}]})).toThrow(/once/);
    expect(()=>store.progress.save({...note,eventDate:"2026-02-30",plantIds:[one.id],photos:[]})).toThrow(/date/);
    expect(()=>store.progress.save({...note,plantIds:[one.id],photos:Array(21).fill({id:photo.id})})).toThrow(/20/);
    expect(()=>store.progress.save({...note,plantIds:[one.id],photos:[{uploadIndex:0},{id:"missing"}]},[file("pending.png")])).toThrow(/not found/);
    expect(store.listPhotos("plant",one.id)).toHaveLength(1);expect(store.progress.list("plant",one.id)).toEqual([]);
  });
  it("migrates legacy records once and includes sessions in database snapshots",async()=>{
    const plant=store.savePlant({name:"Preserved"});const photo=store.createPhoto({...file("old.png"),plantIds:[plant.id],caption:"Original"});store.setProfilePhoto(plant.id,photo.id);
    store.close();const db=new Database(path.join(dir,"test.sqlite"));db.exec("DROP TABLE progress_session_photos;DROP TABLE progress_session_plants;DROP TABLE progress_sessions;DELETE FROM schema_migrations WHERE version=7");db.close();
    const before=fs.readdirSync(dir).filter(name=>name.includes("before-progress")).length;
    store=new GreenhouseStore(path.join(dir,"test.sqlite"));
    expect(fs.readdirSync(dir).filter(name=>name.includes("before-progress"))).toHaveLength(before+1);
    expect(store.getPlant(plant.id)?.profilePhotoId).toBe(photo.id);expect(store.listPhotos("plant",plant.id)[0].caption).toBe("Original");
    const session=store.progress.save({...note,plantIds:[plant.id],photos:[{id:photo.id}]});const snapshot=path.join(dir,"backup.sqlite");await store.backupTo(snapshot);
    store.progress.delete(session.id);store.replaceDatabase(snapshot);expect(store.progress.get(session.id)?.photos[0].id).toBe(photo.id);
    expect(fs.readdirSync(dir).filter(name=>name.includes("before-progress"))).toHaveLength(before+1);
  });
  it("rolls back new photos and captions if a later photo write fails",()=>{
    const plant=store.savePlant({name:"Atomic"}),existing=store.createPhoto({...file("existing.png"),plantIds:[plant.id],caption:"Before"});
    const create=store.createPhoto.bind(store);
    const spy=vi.spyOn(store,"createPhoto").mockImplementationOnce(input=>create(input)).mockImplementationOnce(()=>{throw new Error("Write failed")});
    try{expect(()=>store.progress.save({...note,plantIds:[plant.id],photos:[{id:existing.id,caption:"After"},{uploadIndex:0},{uploadIndex:1}]},[file("a.png"),file("b.png")])).toThrow("Write failed")}finally{spy.mockRestore()}
    expect(store.listPhotos("plant",plant.id).map(photo=>photo.caption)).toEqual(["Before"]);expect(store.progress.list("plant",plant.id)).toEqual([]);
  });
  it("reads current species water requirements independently of plant care",()=>{
    const species=store.saveSpecies({commonName:"Fern",waterRequirements:"Keep evenly moist"});
    const plant=store.savePlant({name:"Little fern",speciesId:species.id});expect(plant.speciesWaterRequirements).toBe("Keep evenly moist");
    const care=store.saveCare(plant.id,{guidance:"My own instructions"});
    store.saveSpecies({...species,waterRequirements:"Water from below"},species.id);expect(store.getPlant(plant.id)?.speciesWaterRequirements).toBe("Water from below");
    expect(store.listCare(plant.id)[0].id).toBe(care.id);
    store.saveSpecies({...species,waterRequirements:""},species.id);expect(store.getPlant(plant.id)?.speciesWaterRequirements).toBe("");
    store.savePlant({...store.getPlant(plant.id),speciesId:null},plant.id);expect(store.getPlant(plant.id)?.speciesWaterRequirements).toBe("");
  });
});
