import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { GreenhouseStore } from "../server/store";

const cleanup:string[]=[];
afterEach(()=>{for(const dir of cleanup.splice(0))fs.rmSync(dir,{recursive:true,force:true})});
function makeStore(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),"greenhouse-test-"));cleanup.push(dir);return {store:new GreenhouseStore(path.join(dir,"greenhouse.sqlite")),dir}}

describe("Greenhouse local store",()=>{
  it("keeps reusable species separate from individual plants",()=>{const {store}=makeStore();const species=store.saveSpecies({commonName:"Button fern",scientificName:"Pellaea rotundifolia",humidityRequirements:"Moderate"});const first=store.savePlant({name:"Mosslight",speciesId:species.id,status:"healthy",tags:["fern"]});const second=store.savePlant({name:"Orbit",speciesId:species.id,status:"healthy"});store.setSpeciesImage(species.id,"species/button-fern.jpg");expect(store.getSpecies(species.id)?.plantCount).toBe(2);expect(store.getSpecies(species.id)?.imageUrl).toBe("/media/species/button-fern.jpg");expect(store.getPlant(first.id)?.speciesScientificName).toBe("Pellaea rotundifolia");expect(store.getPlant(second.id)?.name).toBe("Orbit");store.close()});

  it("moves plants without losing history or care guidance",()=>{const {store}=makeStore();const terrarium=store.saveTerrarium({name:"Cloud Forest",type:"Closed tropical"});const plant=store.savePlant({name:"Mosslight",location:"Studio",status:"recovering"});store.saveCare(plant.id,{activityType:"watering",guidance:"Water when the surface begins to dry",cadenceDays:7,reminderEnabled:true,nextReminderDate:"2026-08-29"});store.savePlant({...plant,terrariumId:terrarium.id,location:"",tags:[]},plant.id as any);const moved=store.getPlant(plant.id)!;expect(moved.terrariumName).toBe("Cloud Forest");expect(moved.careItems).toHaveLength(1);expect(moved.history?.some(item=>item.title.includes("Cloud Forest"))).toBe(true);store.close()});

  it("shows one linked journal entry in every relevant timeline",()=>{const {store}=makeStore();const one=store.savePlant({name:"One",status:"healthy"});const two=store.savePlant({name:"Two",status:"healthy"});const journal=store.saveJournal({title:"Rehabilitation notes",entryDate:"2026-08-22",content:"Both plants are showing new growth.",plantIds:[one.id,two.id],terrariumIds:[],tags:["recovery"]});expect(store.getPlant(one.id)?.journalEntries?.[0].id).toBe(journal.id);expect(store.getPlant(two.id)?.history?.filter(item=>item.journalId===journal.id)).toHaveLength(1);store.close()});

  it("retains deceased profiles while excluding them from living totals",()=>{const {store}=makeStore();const plant=store.savePlant({name:"Remembered fern",status:"healthy"});store.savePlant({...plant,status:"deceased",dateOfDeath:"2026-08-20",causeOfDeath:"Heat stress",tags:[]},plant.id as any);expect(store.dashboard().livingPlants).toBe(0);expect(store.listPlants({scope:"deceased"})).toHaveLength(1);expect(store.getPlant(plant.id)?.causeOfDeath).toBe("Heat stress");store.close()});

  it("creates a valid portable SQLite snapshot",async()=>{const {store,dir}=makeStore();store.savePlant({name:"Sol",status:"healthy"});const snapshot=path.join(dir,"backup.sqlite");await store.backupTo(snapshot);const backup=new Database(snapshot,{readonly:true});expect((backup.prepare("SELECT COUNT(*) count FROM plants").get() as {count:number}).count).toBe(1);expect((backup.pragma("integrity_check") as Array<{integrity_check:string}>)[0].integrity_check).toBe("ok");backup.close();store.close()});
});
