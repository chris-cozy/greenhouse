import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Express } from "express";
import type { GreenhouseStore } from "../server/store";

const dir=fs.mkdtempSync(path.join(os.tmpdir(),"greenhouse-diary-api-"));
const previousDataDir=process.env.DATA_DIR;
let app:Express,store:GreenhouseStore;
beforeAll(async()=>{process.env.DATA_DIR=dir;({app,store}=await import("../server/index"))});
afterAll(()=>{store?.close();fs.rmSync(dir,{recursive:true,force:true});if(previousDataDir===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previousDataDir});
const image=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6R7sAAAAASUVORK5CYII=","base64");
describe("diary HTTP contracts",()=>{
  it("returns revisions, conflicts, validation errors, and missing-record status codes",async()=>{
    const created=(await request(app).post("/api/journal").send({content:"\n\n  preserved  \n"}).expect(201)).body;
    expect(created.content).toBe("\n\n  preserved  \n");expect(created.recordedAt).toBeTruthy();
    await request(app).put(`/api/journal/${created.id}`).send({title:"Changed",expectedRevision:1}).expect(200);
    await request(app).put(`/api/journal/${created.id}`).send({title:"Stale",expectedRevision:1}).expect(409);
    await request(app).put(`/api/journal/${created.id}`).send({createdAt:"invalid"}).expect(400);
    await request(app).delete(`/api/journal/${created.id}`).expect(204);
    await request(app).put(`/api/journal/${created.id}`).send({title:"Resurrected"}).expect(404);
    await request(app).post("/api/plants/missing/profile-photo").send({photoId:null}).expect(404);
    await request(app).post("/api/terrariums/missing/cover-photo").send({photoId:null}).expect(404);
  });
  it("validates uploaded signatures, preserves media in backups, and restores diary links",async()=>{
    const entry=(await request(app).post("/api/journal").send({title:"Photo diary",tags:["photo day"]}).expect(201)).body;
    await request(app).post(`/api/journal/${entry.id}/images`).attach("image",Buffer.from("not an image"),{filename:"bad.png",contentType:"image/png"}).expect(400);
    await request(app).post(`/api/journal/${entry.id}/images`).attach("image",Buffer.alloc(20*1024*1024+1),{filename:"too-large.png",contentType:"image/png"}).expect(413);
    await request(app).post("/api/journal/missing/images").attach("image",image,{filename:"leaf.png",contentType:"image/png"}).expect(404);
    const uploaded=(await request(app).post(`/api/journal/${entry.id}/images`).attach("image",image,{filename:"leaf.png",contentType:"image/png"}).expect(201)).body;
    await request(app).put(`/api/journal/${entry.id}`).send({...entry,content:`![leaf](${uploaded.url})`,expectedRevision:1}).expect(200);
    await request(app).get(uploaded.url).expect(200);
    const backup=await request(app).get("/api/backup").buffer(true).parse((response,done)=>{const chunks:Buffer[]=[];response.on("data",chunk=>chunks.push(chunk));response.on("end",()=>done(null,Buffer.concat(chunks)))}).expect(200);
    await request(app).delete(`/api/journal/${entry.id}`).expect(204);await request(app).get(uploaded.url).expect(404);
    await request(app).post("/api/restore").attach("backup",backup.body,{filename:"backup.zip",contentType:"application/zip"}).expect(200);
    const restored=(await request(app).get(`/api/journal/${entry.id}`).expect(200)).body;expect(restored.tags).toEqual(["photo day"]);expect(restored.content).toContain(uploaded.url);await request(app).get(uploaded.url).expect(200);
  });
  it("manages a diary-only tag catalog and rejects duplicate renames",async()=>{
    const first=(await request(app).post("/api/journal-tags").send({name:"bloom"}).expect(201)).body;
    await request(app).post("/api/journal-tags").send({name:"BLOOM"}).expect(409);
    const second=(await request(app).post("/api/journal-tags").send({name:"roots"}).expect(201)).body;
    await request(app).put(`/api/journal-tags/${second.id}`).send({name:"Bloom"}).expect(409);
    await request(app).put(`/api/journal-tags/${first.id}`).send({name:"flowering"}).expect(200);
    await request(app).delete(`/api/journal-tags/${first.id}`).expect(204);
  });
});
