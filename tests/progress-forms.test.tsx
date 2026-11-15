// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/api";
import { ProgressSessionEditor } from "../src/components/ProgressSessionEditor";
import { ProfilePhotos } from "../src/components/ProfilePhotos";
import { PlantDetailPage } from "../src/components/Plants";
import type { Photo, Plant, ProgressSession } from "../src/shared/types";

vi.mock("../src/api",()=>({api:{get:vi.fn(),post:vi.fn(),put:vi.fn(),upload:vi.fn(),delete:vi.fn()}}));
const photo:Photo={id:"old",plantId:"fern",plantIds:["fern"],terrariumId:null,url:"/media/old.png",originalName:"old.png",mimeType:"image/png",sizeBytes:12,dateTaken:"2026-01-01",caption:"Old caption",tags:[],createdAt:"2026-01-01"};
const options={species:[],terrariums:[],tags:[],plants:[{id:"fern",name:"Fern",status:"healthy" as const,archivedAt:null}]};
const session:ProgressSession={id:"session",plantIds:["fern"],terrariumId:null,title:"New growth",detail:"Two leaves",eventDate:"2026-11-15",eventType:"note",photos:[photo],createdAt:"2026-11-15",updatedAt:"2026-11-15"};
let root:Root,host:HTMLDivElement;
beforeEach(()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.resetAllMocks();
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  vi.stubGlobal("URL",class extends URL {static createObjectURL=vi.fn((file:File)=>`blob:${file.name}`);static revokeObjectURL=vi.fn()});
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals()});
const mount=(node:React.ReactNode)=>act(async()=>root.render(<StrictMode><MemoryRouter>{node}</MemoryRouter></StrictMode>));
const button=(name:string)=>Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent?.trim()===name)!;
const field=(label:string)=>Array.from(document.body.querySelectorAll("label")).find(l=>l.querySelector("span")?.textContent===label)!.querySelector<HTMLInputElement|HTMLTextAreaElement>("input,textarea")!;
async function fill(label:string,value:string){await act(async()=>{const element=field(label);Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,"value")!.set!.call(element,value);element.dispatchEvent(new Event("input",{bubbles:true}))})}
async function files(...names:string[]){await act(async()=>{const input=document.body.querySelector<HTMLInputElement>('[aria-label="Session photos"]')!;Object.defineProperty(input,"files",{value:names.map(name=>new File([name],name,{type:"image/png"})),configurable:true});input.dispatchEvent(new Event("change",{bubbles:true}))})}
const submit=()=>act(async()=>{document.body.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))});
const metadata=()=>JSON.parse(String(vi.mocked(api.upload).mock.calls.at(-1)![1].get("metadata")));

describe("session editor",()=>{
  it("mixes existing photos and repeated file selections, reorders and sends individual captions",async()=>{
    const saved=vi.fn();vi.mocked(api.upload).mockResolvedValue(session);
    await mount(<ProgressSessionEditor open plantId="fern" photos={[photo]} options={options} onClose={()=>{}} onSaved={saved}/>);
    await fill("Title","A new frond");await fill("What happened?","Unfurled overnight");
    await act(async()=>document.body.querySelector<HTMLDetailsElement>(".session-existing")!.open=true);
    await act(async()=>document.body.querySelector<HTMLInputElement>('.session-existing input')!.click());
    await files("one.png","two.png");await files("three.png");
    expect(document.body.querySelectorAll(".session-attachments article")).toHaveLength(4);
    await fill("Caption 2","Close up");await act(async()=>document.body.querySelector<HTMLButtonElement>('[aria-label="Move photo 2 earlier"]')!.click());
    await act(async()=>document.body.querySelector<HTMLButtonElement>('[aria-label="Remove photo 4"]')!.click());
    await submit();expect(saved).toHaveBeenCalledWith(session);expect(metadata()).toMatchObject({title:"A new frond",detail:"Unfurled overnight",plantIds:["fern"],photos:[{uploadIndex:0,caption:"Close up"},{id:"old",caption:"Old caption"},{uploadIndex:1}]});
    expect(vi.mocked(api.upload).mock.calls[0][1].getAll("photos")).toHaveLength(2);
  });
  it("retains drafts and previews after failure and blocks same-render duplicate submission",async()=>{
    const saved=vi.fn();let reject!:(error:Error)=>void;
    vi.mocked(api.upload).mockImplementationOnce(()=>new Promise((_yes,no)=>{reject=no}));
    await mount(<ProgressSessionEditor open requirePhotos plantId="fern" photos={[]} options={options} onClose={()=>{}} onSaved={saved}/>);
    await files("one.png","two.png");await fill("What happened?","Growing");await fill("Caption 1","Leaf");
    await act(async()=>{const form=document.body.querySelector("form")!;form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))});
    expect(api.upload).toHaveBeenCalledOnce();expect(document.body.querySelector<HTMLFieldSetElement>("fieldset")!.disabled).toBe(true);
    await act(async()=>reject(new Error("Offline")));expect(field("What happened?").value).toBe("Growing");expect(field("Caption 1").value).toBe("Leaf");expect(document.body.querySelectorAll(".session-attachments img")).toHaveLength(2);
    vi.mocked(api.upload).mockResolvedValueOnce(session);await submit();expect(api.upload).toHaveBeenCalledTimes(2);expect(saved).toHaveBeenCalledOnce();
  });
  it("rejects excessive files and requires a photo from the photo workspace",async()=>{
    await mount(<ProgressSessionEditor open requirePhotos plantId="fern" photos={[]} options={options} onClose={()=>{}} onSaved={()=>{}}/>);
    await submit();expect(document.body.textContent).toContain("Choose at least one photo");expect(api.upload).not.toHaveBeenCalled();
    await files(...Array.from({length:21},(_,i)=>`${i}.png`));expect(document.body.textContent).toContain("up to 20 photos");expect(document.body.querySelectorAll(".session-attachments article")).toHaveLength(0);
  });
  it("loads an existing session, detaches photos and updates through PUT",async()=>{
    vi.mocked(api.get).mockResolvedValue(session);vi.mocked(api.upload).mockResolvedValue({...session,photos:[]});
    await mount(<ProgressSessionEditor open sessionId="session" plantId="fern" photos={[photo]} options={options} onClose={()=>{}} onSaved={()=>{}}/>);
    expect(field("Title").value).toBe("New growth");await fill("Date","2026-11-16");await act(async()=>button("Remove from session").click());await submit();
    expect(api.upload).toHaveBeenCalledWith("/api/progress-sessions/session",expect.any(FormData),"PUT");expect(metadata()).toMatchObject({eventDate:"2026-11-16",photos:[]});expect(api.delete).not.toHaveBeenCalled();
  });
  it("requires confirmation to delete a session and communicates that gallery photos remain",async()=>{
    const deleted=vi.fn();vi.mocked(api.get).mockResolvedValue(session);vi.mocked(api.delete).mockResolvedValue(undefined);
    await mount(<ProgressSessionEditor open sessionId="session" photos={[photo]} options={options} onClose={()=>{}} onSaved={()=>{}} onDeleted={deleted}/>);
    await act(async()=>button("Delete session").click());expect(api.delete).not.toHaveBeenCalled();expect(document.body.textContent).toContain("Its photos stay in Progress photos");
    await act(async()=>button("Delete permanently").click());expect(api.delete).toHaveBeenCalledWith("/api/progress-sessions/session");expect(deleted).toHaveBeenCalledOnce();
  });
  it("opens the same session editor from an individual gallery photo",async()=>{
    vi.mocked(api.get).mockResolvedValue(session);
    await mount(<ProfilePhotos kind="plant" id="fern" photos={[{...photo,sessions:[{id:session.id,title:session.title}]}]} options={options} coverPhotoId={null} onSaved={()=>{}} newMoment={null} onMomentShown={()=>{}}/>);
    await act(async()=>Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent?.startsWith("Edit session"))!.click());
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Edit photo session");expect(field("What happened?").value).toBe("Two leaves");
  });
});

describe("species watering guidance",()=>{
  it("shows species text and reference alongside personal guidance and hides missing values",async()=>{
    const plant={id:"fern",name:"Fern",speciesId:"species",speciesCommonName:"Boston fern",speciesWaterRequirements:"Water from below",tags:[],photos:[],history:[],careItems:[],status:"healthy"} as unknown as Plant;
    vi.mocked(api.get).mockResolvedValue(plant);
    await mount(<Routes><Route path="*" element={<PlantDetailPage options={options} refreshOptions={()=>{}}/>}/></Routes>);
    await act(async()=>Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent==="Care guidance")!.click());
    expect(document.body.querySelector(".species-watering")?.textContent).toContain("Water from below");expect(document.body.querySelector('.species-watering a')?.getAttribute("href")).toBe("/species/species");
    vi.mocked(api.get).mockResolvedValue({...plant,speciesWaterRequirements:""});
    await act(async()=>root.render(<MemoryRouter><PlantDetailPage key="changed" options={options} refreshOptions={()=>{}}/></MemoryRouter>));expect(document.body.querySelector(".species-watering")).toBeNull();
  });
});
