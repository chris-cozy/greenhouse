import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import archiver from "archiver";
import unzipper from "unzipper";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { GreenhouseStore } from "./store.js";
import { HttpError } from "./journal.js";
import { imageMime } from "./imageValidation.js";

const here=path.dirname(fileURLToPath(import.meta.url));
const projectRoot=process.cwd();
const dataDir=path.resolve(process.env.DATA_DIR||path.join(projectRoot,"data"));
const dbPath=path.resolve(process.env.DATABASE_PATH||path.join(dataDir,"greenhouse.sqlite"));
const mediaDir=path.resolve(process.env.MEDIA_DIR||path.join(dataDir,"media"));
const tempDir=path.join(dataDir,"tmp");
const port=Number(process.env.PORT||4000);
for(const dir of [dataDir,mediaDir,tempDir])fs.mkdirSync(dir,{recursive:true});

export const store=new GreenhouseStore(dbPath);
export const app=express();
app.use(express.json({limit:"2mb"}));
app.use("/media",express.static(mediaDir,{fallthrough:false,maxAge:"7d"}));

const allowedMime=new Set(["image/jpeg","image/png","image/webp","image/gif"]);
const extension:Record<string,string>={"image/jpeg":".jpg","image/png":".png","image/webp":".webp","image/gif":".gif"};
const upload=multer({dest:tempDir,limits:{fileSize:20*1024*1024},fileFilter:(_req,file,cb)=>cb(null,allowedMime.has(file.mimetype))});
const archiveUpload=multer({dest:tempDir,limits:{fileSize:2*1024*1024*1024}});
const asyncRoute=(handler:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>void handler(req,res).catch(next);
const removeMedia=(relative:string|null)=>{if(!relative)return;const target=path.resolve(mediaDir,relative);if(target.startsWith(mediaDir+path.sep))fs.rmSync(target,{force:true})};

app.get("/api/health",(_req,res)=>res.json({ok:true,app:"Greenhouse",mode:"local"}));
app.get("/api/dashboard",(_req,res)=>res.json(store.dashboard()));
app.get("/api/notifications",(_req,res)=>res.json(store.notifications()));
app.get("/api/options",(_req,res)=>res.json(store.options()));
app.get("/api/search",(req,res)=>res.json(store.search(String(req.query.q||""))));

app.get("/api/species",(req,res)=>res.json(store.listSpecies(String(req.query.q||""))));
app.post("/api/species",(req,res)=>res.status(201).json(store.saveSpecies(req.body)));
app.get("/api/species/:id",(req,res)=>{const result=store.getSpecies(req.params.id);result?res.json(result):res.status(404).json({error:"Species not found."})});
app.put("/api/species/:id",(req,res)=>res.json(store.saveSpecies(req.body,req.params.id as any)));
app.post("/api/species/:id/image",upload.single("image"),(req,res,next)=>{
  try{
    if(!req.file)throw new Error("Choose a JPEG, PNG, WebP, or GIF image under 20 MB.");
    const speciesId=String(req.params.id);if(!store.getSpecies(speciesId))throw new Error("Species not found.");const folder=path.join("species",speciesId,new Date().getFullYear().toString());fs.mkdirSync(path.join(mediaDir,folder),{recursive:true});
    const relative=path.join(folder,`${randomUUID()}${extension[req.file.mimetype]}`);fs.renameSync(req.file.path,path.join(mediaDir,relative));
    const result=store.setSpeciesImage(speciesId,relative);removeMedia(result.previousPath);res.json(result.species);
  }catch(error){if(req.file)fs.rmSync(req.file.path,{force:true});next(error)}
});
app.delete("/api/species/:id",(req,res)=>{removeMedia(store.deleteSpecies(req.params.id));res.status(204).end()});

app.get("/api/plants",(req,res)=>res.json(store.listPlants(req.query)));
app.post("/api/plants",(req,res)=>res.status(201).json(store.savePlant(req.body)));
app.get("/api/plants/:id",(req,res)=>{const result=store.getPlant(req.params.id);result?res.json(result):res.status(404).json({error:"Plant not found."})});
app.put("/api/plants/:id",(req,res)=>res.json(store.savePlant(req.body,req.params.id as any)));
app.post("/api/plants/:id/archive",(req,res)=>res.json(store.archivePlant(req.params.id,req.body.archived!==false)));
app.post("/api/plants/:id/profile-photo",(req,res)=>res.json(store.setProfilePhoto(req.params.id,req.body.photoId||null)));
app.delete("/api/plants/:id",(req,res)=>{for(const file of store.deletePlant(req.params.id))removeMedia(file);res.status(204).end()});

app.get("/api/terrariums",(req,res)=>res.json(store.listTerrariums(String(req.query.q||""))));
app.post("/api/terrariums",(req,res)=>res.status(201).json(store.saveTerrarium(req.body)));
app.get("/api/terrariums/:id",(req,res)=>{const result=store.getTerrarium(req.params.id);result?res.json(result):res.status(404).json({error:"Terrarium not found."})});
app.put("/api/terrariums/:id",(req,res)=>res.json(store.saveTerrarium(req.body,req.params.id as any)));
app.post("/api/terrariums/:id/cover-photo",(req,res)=>res.json(store.setCoverPhoto(req.params.id,req.body.photoId||null)));
app.delete("/api/terrariums/:id",(req,res)=>{const files=store.getTerrarium(req.params.id)?.photos?.map(photo=>decodeURIComponent(photo.url.replace(/^\/media\//,"")))||[];store.deleteTerrarium(req.params.id);for(const file of files)removeMedia(file);res.status(204).end()});

app.post("/api/plants/:plantId/care",(req,res)=>res.status(201).json(store.saveCare(req.params.plantId,req.body)));
app.put("/api/plants/:plantId/care/:id",(req,res)=>res.json(store.saveCare(req.params.plantId,req.body,req.params.id as any)));
app.delete("/api/care/:id",(req,res)=>{store.deleteCare(req.params.id);res.status(204).end()});
app.post("/api/care/:id/dismiss",(req,res)=>{store.dismissReminder(req.params.id);res.status(204).end()});
app.post("/api/history",(req,res)=>res.status(201).json(store.saveEvent(req.body)));

app.get("/api/journal",(req,res)=>res.json(store.listJournal(req.query)));
app.post("/api/journal",(req,res)=>res.status(201).json(store.saveJournal(req.body)));
app.get("/api/journal/:id",(req,res)=>{const result=store.getJournal(req.params.id);result?res.json(result):res.status(404).json({error:"Journal entry not found."})});
app.put("/api/journal/:id",(req,res)=>res.json(store.saveJournal(req.body,req.params.id as any)));
app.delete("/api/journal/:id",(req,res)=>{for(const file of store.deleteJournal(req.params.id))removeMedia(file);res.status(204).end()});

app.get("/api/journal-tags",(_req,res)=>res.json(store.journal.tags()));
app.post("/api/journal-tags",(req,res)=>res.status(201).json(store.journal.createTag(req.body.name)));
app.put("/api/journal-tags/:id",(req,res)=>{if(typeof req.body.name!=="string")throw new HttpError("A tag name is required.");store.journal.changeTag(req.params.id,req.body.name);res.json(store.journal.tags().find(t=>t.id===req.params.id))});
app.delete("/api/journal-tags/:id",(req,res)=>{store.journal.changeTag(req.params.id);res.status(204).end()});
app.post("/api/journal/:id/images",upload.single("image"),(req,res,next)=>{
  let moved:string|undefined;
  try{
    if(!store.getJournal(String(req.params.id)))throw new HttpError("Journal entry not found.",404);
    if(!req.file)throw new HttpError("Choose a JPEG, PNG, WebP, or GIF image under 20 MB.");
    const mime=imageMime(fs.readFileSync(req.file.path));
    if(!mime||mime!==req.file.mimetype)throw new HttpError("This file is not a valid JPEG, PNG, WebP, or GIF image.");
    const folder="journal";fs.mkdirSync(path.join(mediaDir,folder),{recursive:true});
    const relative=path.join(folder,`${randomUUID()}${extension[mime]}`);
    moved=path.join(mediaDir,relative);fs.renameSync(req.file.path,moved);
    res.status(201).json(store.journal.addImage(String(req.params.id),{relativePath:relative,originalName:req.file.originalname,mimeType:mime,sizeBytes:req.file.size}));
  }catch(error){if(req.file)fs.rmSync(req.file.path,{force:true});if(moved)fs.rmSync(moved,{force:true});next(error)}
});

app.post("/api/photos",upload.single("photo"),(req,res,next)=>{
  try{
    if(!req.file)throw new Error("Choose a JPEG, PNG, WebP, or GIF image under 20 MB.");
    const plantId=String(req.body.plantId||"")||undefined;const terrariumId=String(req.body.terrariumId||"")||undefined;
    if(Boolean(plantId)===Boolean(terrariumId))throw new Error("Associate the photo with one plant or terrarium.");
    const folder=path.join(plantId?"plants":"terrariums",plantId||terrariumId!,new Date().getFullYear().toString());fs.mkdirSync(path.join(mediaDir,folder),{recursive:true});
    const relative=path.join(folder,`${randomUUID()}${extension[req.file.mimetype]}`);fs.renameSync(req.file.path,path.join(mediaDir,relative));
    const photo=store.createPhoto({relativePath:relative,originalName:req.file.originalname,mimeType:req.file.mimetype,sizeBytes:req.file.size,plantId,terrariumId,dateTaken:String(req.body.dateTaken||""),caption:String(req.body.caption||""),tags:String(req.body.tags||"").split(",").map(x=>x.trim()).filter(Boolean)});
    res.status(201).json(photo);
  }catch(error){if(req.file)fs.rmSync(req.file.path,{force:true});next(error)}
});
app.put("/api/photos/:id",(req,res)=>res.json(store.updatePhoto(req.params.id,req.body)));
app.delete("/api/photos/:id",(req,res)=>{removeMedia(store.deletePhoto(req.params.id));res.status(204).end()});

app.get("/api/backup",asyncRoute(async(_req,res)=>{
  const stamp=new Date().toISOString().slice(0,10);const snapshot=path.join(tempDir,`greenhouse-${randomUUID()}.sqlite`);await store.backupTo(snapshot);
  res.attachment(`greenhouse-backup-${stamp}.zip`);res.type("application/zip");
  const archive=archiver("zip",{zlib:{level:9}});archive.on("error",error=>res.destroy(error));archive.pipe(res);
  archive.append(JSON.stringify({format:"greenhouse-backup",version:1,createdAt:new Date().toISOString()},null,2),{name:"manifest.json"});archive.file(snapshot,{name:"greenhouse.sqlite"});archive.directory(mediaDir,"media");
  res.on("close",()=>fs.rmSync(snapshot,{force:true}));await archive.finalize();
}));

app.post("/api/restore",archiveUpload.single("backup"),asyncRoute(async(req,res)=>{
  if(!req.file)throw new Error("Choose a Greenhouse backup ZIP.");const root=path.join(tempDir,`restore-${randomUUID()}`);fs.mkdirSync(root,{recursive:true});
  try{
    const zip=await unzipper.Open.file(req.file.path);for(const entry of zip.files){if(entry.type!=="File")continue;const target=path.resolve(root,entry.path);if(!target.startsWith(root+path.sep))throw new Error("Backup contains an unsafe path.");fs.mkdirSync(path.dirname(target),{recursive:true});await pipeline(entry.stream(),fs.createWriteStream(target))}
    const manifestPath=path.join(root,"manifest.json"),incomingDb=path.join(root,"greenhouse.sqlite");if(!fs.existsSync(manifestPath)||!fs.existsSync(incomingDb))throw new Error("This is not a complete Greenhouse backup.");
    const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));if(manifest.format!=="greenhouse-backup"||manifest.version!==1)throw new Error("This backup version is not supported.");
    const check=new Database(incomingDb,{readonly:true});const integrity=(check.pragma("integrity_check") as Row[])[0]?.integrity_check;const hasPlants=check.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='plants'").get();check.close();if(integrity!=="ok"||!hasPlants)throw new Error("The backup database did not pass validation.");
    const rollback=path.join(root,"rollback.sqlite");await store.backupTo(rollback);const incomingMedia=path.join(root,"media"),oldMedia=path.join(root,"previous-media");
    try{if(fs.existsSync(mediaDir))fs.renameSync(mediaDir,oldMedia);fs.mkdirSync(path.dirname(mediaDir),{recursive:true});if(fs.existsSync(incomingMedia))fs.renameSync(incomingMedia,mediaDir);else fs.mkdirSync(mediaDir,{recursive:true});store.replaceDatabase(incomingDb)}catch(error){if(fs.existsSync(mediaDir))fs.rmSync(mediaDir,{recursive:true,force:true});if(fs.existsSync(oldMedia))fs.renameSync(oldMedia,mediaDir);store.replaceDatabase(rollback);throw error}
    res.json({ok:true,message:"Backup restored."});
  }finally{fs.rmSync(req.file.path,{force:true});fs.rmSync(root,{recursive:true,force:true})}
}));

const dist=path.join(projectRoot,"dist");if(process.env.NODE_ENV==="production"&&fs.existsSync(dist)){app.use(express.static(dist));app.get("/*splat",(_req,res)=>res.sendFile(path.join(dist,"index.html")))}
app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
  const message=error instanceof Error?error.message:"Something went wrong.";
  const httpStatus=(error as {status?:number})?.status;
  const status=error instanceof multer.MulterError&&error.code==="LIMIT_FILE_SIZE"?413:error instanceof HttpError?error.status:typeof httpStatus==="number"&&httpStatus>=400&&httpStatus<=599?httpStatus:message.toLowerCase().includes("not found")?404:400;
  if(status>=500)console.error(error);
  res.status(status).json({error:status===413?"The uploaded file exceeds the allowed size limit.":message});
});

if(process.env.NODE_ENV!=="test")app.listen(port,()=>console.log(`Greenhouse is growing at http://localhost:${port}`));

type Row=Record<string,any>;
