import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import archiver from "archiver";
import type { Express } from "express";
import type { GreenhouseStore } from "../server/store";

const dir=fs.mkdtempSync(path.join(os.tmpdir(),"greenhouse-sharing-api-")),previousDataDir=process.env.DATA_DIR;
let app:Express,store:GreenhouseStore;
const image=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6R7sAAAAASUVORK5CYII=","base64");
beforeAll(async()=>{process.env.DATA_DIR=dir;({app,store}=await import("../server/index"))});
afterAll(()=>{store?.close();fs.rmSync(dir,{recursive:true,force:true});if(previousDataDir===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previousDataDir});

describe("sharing HTTP contracts",()=>{
  it("uploads once for multiple plants, updates links, and keeps the file after one plant is deleted",async()=>{
    const one=store.savePlant({name:"One"}),two=store.savePlant({name:"Two"});
    const photo=(await request(app).post("/api/photos").field("plantIds",JSON.stringify([one.id,two.id])).field("tags","growth,GROWTH").attach("photo",image,{filename:"group.png",contentType:"image/png"}).expect(201)).body;
    expect(photo.plantIds.sort()).toEqual([one.id,two.id].sort());expect(photo.linkedPlants).toHaveLength(2);expect(photo.tags).toEqual(["growth"]);
    await request(app).post(`/api/plants/${two.id}/profile-photo`).send({photoId:photo.id}).expect(200);
    await request(app).delete(`/api/plants/${one.id}`).expect(204);await request(app).get(photo.url).expect(200);
    await request(app).put(`/api/photos/${photo.id}`).send({plantIds:[]}).expect(400);
    await request(app).put(`/api/photos/${photo.id}`).send({plantIds:["missing"]}).expect(404);
    await request(app).put(`/api/photos/${photo.id}`).send({plantIds:[two.id],caption:"Updated"}).expect(200);
    await request(app).delete(`/api/photos/${photo.id}`).expect(204);expect(store.getPlant(two.id)?.profilePhotoId).toBeNull();
    expect(fs.existsSync(path.join(dir,"media",photo.url.replace("/media/","")))).toBe(false);
  });
  it("accepts legacy plant uploads and keeps terrarium ownership separate",async()=>{
    const plant=store.savePlant({name:"Legacy"}),terrarium=store.saveTerrarium({name:"Jar"});
    const old=(await request(app).post("/api/photos").field("plantId",plant.id).attach("photo",image,{filename:"old.png",contentType:"image/png"}).expect(201)).body;expect(old.plantIds).toEqual([plant.id]);expect(old.plantId).toBe(plant.id);
    const habitat=(await request(app).post("/api/photos").field("terrariumId",terrarium.id).attach("photo",image,{filename:"jar.png",contentType:"image/png"}).expect(201)).body;
    expect(habitat.plantIds).toEqual([]);await request(app).put(`/api/photos/${habitat.id}`).send({plantIds:[plant.id]}).expect(400);
    await request(app).post("/api/photos").field("terrariumId",terrarium.id).field("plantIds",JSON.stringify([plant.id])).attach("photo",image,{filename:"mixed.png",contentType:"image/png"}).expect(400);
  });
  it("validates links and image bytes and cleans up after database failure",async()=>{
    const plant=store.savePlant({name:"Upload checks"});
    await request(app).post("/api/photos").field("plantIds","invalid json").attach("photo",image,{filename:"bad.png",contentType:"image/png"}).expect(400);
    await request(app).post("/api/photos").field("plantIds",'["missing"]').attach("photo",image,{filename:"bad.png",contentType:"image/png"}).expect(404);
    await request(app).post("/api/photos").field("plantId",plant.id).attach("photo",Buffer.from("not an image"),{filename:"fake.png",contentType:"image/png"}).expect(400);
    const before=fs.readdirSync(path.join(dir,"media"),{recursive:true});
    const failed=vi.spyOn(store,"createPhoto").mockImplementationOnce(()=>{throw new Error("Simulated database failure")});
    try{await request(app).post("/api/photos").field("plantId",plant.id).attach("photo",image,{filename:"failed.png",contentType:"image/png"}).expect(400)}finally{failed.mockRestore()}
    expect(fs.readdirSync(path.join(dir,"media"),{recursive:true})).toEqual(before);expect(fs.readdirSync(path.join(dir,"tmp"))).toEqual([]);
  });
  it("links existing care and rejects duplicate and cross-plant updates",async()=>{
    const one=store.savePlant({name:"Care one"}),two=store.savePlant({name:"Care two"});
    const care=(await request(app).post(`/api/plants/${one.id}/care`).send({activityType:"watering",guidance:"Water when dry"}).expect(201)).body;
    const linked=(await request(app).post(`/api/plants/${two.id}/care`).send({guidanceId:care.guidanceId}).expect(201)).body;expect(linked.guidanceId).toBe(care.guidanceId);
    await request(app).post(`/api/plants/${two.id}/care`).send({guidanceId:care.guidanceId}).expect(409);
    await request(app).put(`/api/plants/${two.id}/care/${care.id}`).send({guidance:"Wrong"}).expect(400);
    const catalog=(await request(app).get("/api/care-guidance?q=Care%20one").expect(200)).body;expect(catalog[0].linkedPlants).toHaveLength(2);
    await request(app).put(`/api/plants/${one.id}/care/${care.id}`).send({guidance:"Check first"}).expect(200);expect(store.listCare(two.id)[0].guidance).toBe("Check first");
  });
  it("restores shared photo media, covers, guidance, and reminder schedules from a ZIP",async()=>{
    const one=store.savePlant({name:"Backup one"}),two=store.savePlant({name:"Backup two"});
    const photo=(await request(app).post("/api/photos").field("plantIds",JSON.stringify([one.id,two.id])).attach("photo",image,{filename:"backup.png",contentType:"image/png"}).expect(201)).body;
    store.setProfilePhoto(two.id,photo.id);const care=store.saveCare(one.id,{guidance:"Shared backup",reminderEnabled:true,reminderRepeat:true,reminderCadenceDays:4,nextReminderDate:"2026-10-01"});store.saveCare(two.id,{guidanceId:care.guidanceId});
    const backup=await request(app).get("/api/backup").buffer(true).parse((response,done)=>{const chunks:Buffer[]=[];response.on("data",chunk=>chunks.push(chunk));response.on("end",()=>done(null,Buffer.concat(chunks)))}).expect(200);
    await request(app).delete(`/api/plants/${one.id}`).expect(204);await request(app).delete(`/api/plants/${two.id}`).expect(204);
    await request(app).post("/api/restore").attach("backup",backup.body,{filename:"shared.zip",contentType:"application/zip"}).expect(200);
    await request(app).get(photo.url).expect(200);expect(store.listPhotos("plant",one.id)[0].plantIds).toEqual(expect.arrayContaining([one.id,two.id]));expect(store.getPlant(two.id)?.profilePhotoId).toBe(photo.id);
    expect(store.listCare(one.id)[0]).toEqual(expect.objectContaining({id:care.id,reminderCadenceDays:4,nextReminderDate:"2026-10-01"}));expect(store.listCare(two.id)[0].guidanceId).toBe(care.guidanceId);
  });
  it("migrates a legacy ZIP during restore and preserves its media and care IDs",async()=>{
    const snapshot=fs.readdirSync(dir).find(name=>name.includes("before-sharing"))!,legacy=path.join(dir,"legacy.sqlite");fs.copyFileSync(path.join(dir,snapshot),legacy);
    const db=new Database(legacy);db.exec("INSERT INTO plants(id,name,created_at,updated_at,profile_photo_id) VALUES('legacy','Legacy','2026-09-01','2026-09-01','legacy-photo'); INSERT INTO photos(id,plant_id,relative_path,original_name,mime_type,size_bytes,created_at) VALUES('legacy-photo','legacy','plants/legacy/old.png','old.png','image/png',42,'2026-09-01'); INSERT INTO care_items(id,plant_id,activity_type,guidance,reminder_enabled,reminder_repeat,reminder_cadence_days,next_reminder_date) VALUES('legacy-care','legacy','watering','Legacy care',1,1,5,'2026-10-02')");db.close();
    const archive=archiver("zip"),chunks:Buffer[]=[];const complete=new Promise<Buffer>((resolve,reject)=>{archive.on("data",chunk=>chunks.push(chunk));archive.on("end",()=>resolve(Buffer.concat(chunks)));archive.on("error",reject)});
    archive.append(JSON.stringify({format:"greenhouse-backup",version:1}),{name:"manifest.json"});archive.file(legacy,{name:"greenhouse.sqlite"});archive.append(image,{name:"media/plants/legacy/old.png"});await archive.finalize();
    await request(app).post("/api/restore").attach("backup",await complete,{filename:"legacy.zip",contentType:"application/zip"}).expect(200);
    expect(store.getPlant("legacy")?.profilePhotoId).toBe("legacy-photo");expect(store.listPhotos("plant","legacy")[0].plantIds).toEqual(["legacy"]);expect(store.listCare("legacy")[0]).toEqual(expect.objectContaining({id:"legacy-care",reminderCadenceDays:5,nextReminderDate:"2026-10-02"}));await request(app).get("/media/plants/legacy/old.png").expect(200);
  });
});
