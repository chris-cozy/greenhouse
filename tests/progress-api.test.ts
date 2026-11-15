import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Express } from "express";
import type { GreenhouseStore } from "../server/store";
import { ProgressRepository } from "../server/progress";

const dir=fs.mkdtempSync(path.join(os.tmpdir(),"greenhouse-progress-api-")),previous=process.env.DATA_DIR;
const image=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6R7sAAAAASUVORK5CYII=","base64");
let app:Express,store:GreenhouseStore;
beforeAll(async()=>{process.env.DATA_DIR=dir;({app,store}=await import("../server/index"))});
afterAll(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});if(previous===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previous});
const note={title:"New growth",eventDate:"2026-11-15",eventType:"note",detail:"Two leaves"};
describe("progress session HTTP contracts",()=>{
  it("creates, edits and deletes multi-photo sessions while keeping reusable photos",async()=>{
    const plant=store.savePlant({name:"Fern"});
    const created=(await request(app).post("/api/progress-sessions").field("metadata",JSON.stringify({...note,plantIds:[plant.id],photos:[{uploadIndex:0,caption:"One"},{uploadIndex:1,caption:"Two"}]})).attach("photos",image,"one.png").attach("photos",image,"two.png").expect(201)).body;
    expect(created.photos).toHaveLength(2);for(const photo of created.photos)await request(app).get(photo.url).expect(200);
    const updated=(await request(app).put(`/api/progress-sessions/${created.id}`).field("metadata",JSON.stringify({...note,title:"Edited",photos:[{id:created.photos[1].id,caption:"Changed"}]})).expect(200)).body;
    expect(updated.photos[0].caption).toBe("Changed");expect(store.listPhotos("plant",plant.id)).toHaveLength(2);
    await request(app).get(`/api/progress-sessions/${created.id}`).expect(200);
    await request(app).delete(`/api/progress-sessions/${created.id}`).expect(204);
    await request(app).get(`/api/progress-sessions/${created.id}`).expect(404);
    for(const photo of created.photos)await request(app).get(photo.url).expect(200);
  });
  it("cleans all files after invalid metadata, invalid signatures, limits and database failure",async()=>{
    const plant=store.savePlant({name:"Checks"});
    const metadata=JSON.stringify({...note,plantIds:[plant.id],photos:[{uploadIndex:0},{uploadIndex:1}]});
    const before=fs.readdirSync(path.join(dir,"media"),{recursive:true}).filter(name=>String(name).endsWith(".png"));
    await request(app).post("/api/progress-sessions").field("metadata","{").attach("photos",image,"one.png").expect(400);
    await request(app).post("/api/progress-sessions").field("metadata",metadata).attach("photos",image,"one.png").attach("photos",Buffer.from("fake"),"fake.png").expect(400);
    await request(app).post("/api/progress-sessions").field("metadata",metadata).attach("photos",image,"one.png").attach("photos",Buffer.from("bad"),{filename:"no.txt",contentType:"text/plain"}).expect(400);
    const tooMany=request(app).post("/api/progress-sessions").field("metadata",metadata);for(let i=0;i<21;i++)tooMany.attach("photos",image,`${i}.png`);await tooMany.expect(400);
    const failed=vi.spyOn(ProgressRepository.prototype,"save").mockImplementationOnce(()=>{throw new Error("Database failure")});
    try{await request(app).post("/api/progress-sessions").field("metadata",metadata).attach("photos",image,"one.png").attach("photos",image,"two.png").expect(400)}finally{failed.mockRestore()}
    expect(fs.readdirSync(path.join(dir,"tmp"))).toEqual([]);
    expect(fs.readdirSync(path.join(dir,"media"),{recursive:true}).filter(name=>String(name).endsWith(".png"))).toEqual(before);
  });
  it("round-trips captions, attachments, covers and shared ownership through ZIP backup",async()=>{
    const one=store.savePlant({name:"One"}),two=store.savePlant({name:"Two"});
    const session=(await request(app).post("/api/progress-sessions").field("metadata",JSON.stringify({...note,plantIds:[one.id,two.id],photos:[{uploadIndex:0,caption:"Shared"}]})).attach("photos",image,"shared.png").expect(201)).body;
    store.setProfilePhoto(two.id,session.photos[0].id);
    const backup=await request(app).get("/api/backup").buffer(true).parse((response,done)=>{const chunks:Buffer[]=[];response.on("data",chunk=>chunks.push(chunk));response.on("end",()=>done(null,Buffer.concat(chunks)))}).expect(200);
    store.deletePlant(one.id);store.deletePlant(two.id);
    await request(app).post("/api/restore").attach("backup",backup.body,{filename:"sessions.zip",contentType:"application/zip"}).expect(200);
    const restored=(await request(app).get(`/api/progress-sessions/${session.id}`).expect(200)).body;
    expect(restored.plantIds.sort()).toEqual([one.id,two.id].sort());expect(restored.photos[0].caption).toBe("Shared");expect(store.getPlant(two.id)?.profilePhotoId).toBe(session.photos[0].id);
    await request(app).get(restored.photos[0].url).expect(200);
  });
});
