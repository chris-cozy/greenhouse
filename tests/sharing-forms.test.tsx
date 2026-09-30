// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/api";
import type { AppOptions, Photo } from "../src/shared/types";
import { Modal, PhotoUpload } from "../src/components/Common";
import { CareForm, PlantForm } from "../src/components/PlantForms";
import { TerrariumForm } from "../src/components/TerrariumForm";
import { ChoiceInput, TagInput } from "../src/components/RecordChoices";

vi.mock("../src/api",()=>({api:{get:vi.fn(),post:vi.fn(),put:vi.fn(),upload:vi.fn()}}));
const options:AppOptions={species:[],terrariums:[],tags:["growth","spring"],sources:["Plant swap","Nursery"],locations:["North shelf"],plants:[{id:"one",name:"One",status:"healthy",archivedAt:null},{id:"two",name:"Two",status:"deceased",archivedAt:null}]};
const photo:Photo={id:"group",plantId:"one",plantIds:["one","two"],linkedPlants:[{id:"one",name:"One"},{id:"two",name:"Two"}],terrariumId:null,url:"/media/group.png",originalName:"group.png",mimeType:"image/png",sizeBytes:12,dateTaken:"2026-09-29",caption:"Group",tags:["growth"],createdAt:"2026-09-29"};
let host:HTMLDivElement,root:Root;
const urlDescriptor=Object.getOwnPropertyDescriptor(URL,"createObjectURL"),revokeDescriptor=Object.getOwnPropertyDescriptor(URL,"revokeObjectURL");
beforeEach(()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.resetAllMocks();host=document.createElement("div");document.body.append(host);root=createRoot(host);
  vi.mocked(api.get).mockResolvedValue(options);Object.defineProperty(URL,"createObjectURL",{configurable:true,value:vi.fn(file=>`blob:${file.name}`)});Object.defineProperty(URL,"revokeObjectURL",{configurable:true,value:vi.fn()});
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks();if(urlDescriptor)Object.defineProperty(URL,"createObjectURL",urlDescriptor);else delete (URL as any).createObjectURL;if(revokeDescriptor)Object.defineProperty(URL,"revokeObjectURL",revokeDescriptor);else delete (URL as any).revokeObjectURL});
const mount=(node:React.ReactNode)=>act(async()=>root.render(node));
const input=(name:string)=>document.body.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!;
const field=(name:string)=>Array.from(document.body.querySelectorAll('label.field')).find(label=>label.firstElementChild?.textContent===name)!;
async function fill(name:string,value:string){await act(async()=>{const element=input(name);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(element,value);element.dispatchEvent(new Event("input",{bubbles:true}))})}
async function select(name:string,value:string){await act(async()=>{const element=field(name).querySelector('select')!;element.value=value;element.dispatchEvent(new Event("change",{bubbles:true}))})}
const submit=()=>act(async()=>document.body.querySelector('form')!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
async function chooseFile(name="group.png",type="image/png",size=12){await act(async()=>{const element=input("Photo image"),file=new File([new Uint8Array(size)],name,{type});Object.defineProperty(element,"files",{configurable:true,value:[file]});element.dispatchEvent(new Event("change",{bubbles:true}))})}

describe("record choices",()=>{
  it("opens all choices, filters while typing, supports keyboard selection, and accepts new values",async()=>{
    function Harness(){const [value,setValue]=useState("");return <ChoiceInput label="Source" value={value} onChange={setValue} options={options.sources!}/>}
    await mount(<Harness/>);await act(async()=>input("Source").focus());expect(document.body.querySelectorAll('[role=option]')).toHaveLength(2);
    await fill("Source","swap");expect(document.body.querySelector('[role=listbox]')?.textContent).toContain("Plant swap");
    await act(async()=>input("Source").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true})));expect(input("Source").value).toBe("Plant swap");
    await fill("Source","Friend");expect(document.body.querySelector('[role=listbox]')?.textContent).toContain('Use new value “Friend”');
  });
  it("commits tags with Enter, commas, and paste, removes chips, and ignores case duplicates",async()=>{
    function Harness(){const [tags,setTags]=useState<string[]>([]),[draft,setDraft]=useState("");return <TagInput value={tags} draft={draft} onChange={setTags} onDraftChange={setDraft} options={options.tags}/>}
    await mount(<Harness/>);await fill("Tags","growth");await act(async()=>input("Tags").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true})));
    await fill("Tags","GROWTH,spring,");expect(document.body.querySelectorAll('.record-tag-chips>span')).toHaveLength(2);
    await act(async()=>{const event=new Event("paste",{bubbles:true,cancelable:true});Object.defineProperty(event,"clipboardData",{value:{getData:()=>"spring, new"}});input("Tags").dispatchEvent(event)});
    expect(document.body.querySelectorAll('.record-tag-chips>span')).toHaveLength(3);
    await act(async()=>document.body.querySelector<HTMLButtonElement>('[aria-label="Remove growth tag"]')!.click());expect(document.body.querySelector('.record-tag-chips')?.textContent).not.toContain("growth");
  });
  it("submits pending tags, preserves failed drafts, and shows the new plant defaults",async()=>{
    vi.mocked(api.post).mockRejectedValue(new Error("Save failed"));
    await mount(<PlantForm options={options} onClose={()=>{}} onSaved={()=>{}}/>);
    const name=field("Personal name").querySelector('input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(name,"Fern");name.dispatchEvent(new Event("input",{bubbles:true}))});
    await fill("Tags","growth");await submit();expect(api.post).toHaveBeenCalledWith("/api/plants",expect.objectContaining({tags:["growth"]}));expect(input("Tags").value).toBe("growth");expect(document.body.querySelector('[role=alert]')?.textContent).toContain("Save failed");
    expect(document.body.querySelector<HTMLDetailsElement>('.form-more')?.open).toBe(true);expect(document.body.querySelector<HTMLDetailsElement>('.sprite-alternatives')?.open).toBe(false);
  });
  it("wires source and location suggestions into plant and terrarium forms",async()=>{
    await mount(<PlantForm options={options} onClose={()=>{}} onSaved={()=>{}}/>);
    await act(async()=>input("Source").focus());expect(document.body.querySelector('[role=listbox]')?.textContent).toContain("Plant swap");
    await fill("Source","swap");await act(async()=>input("Source").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true})));expect(input("Source").value).toBe("Plant swap");
    await act(async()=>input("Standalone location").focus());expect(document.body.querySelector('[role=listbox]')?.textContent).toContain("North shelf");
    await mount(<TerrariumForm options={options} item={{name:"Jar",location:"North shelf"} as any} onClose={()=>{}} onSaved={()=>{}}/>);
    await act(async()=>input("Location").focus());expect(document.body.querySelector('[role=listbox]')?.textContent).toContain("North shelf");
  });
  it("resets plant disclosures after closing and reopening",async()=>{
    vi.useFakeTimers();function Harness(){const [open,setOpen]=useState(true);return <><button onClick={()=>setOpen(true)}>Reopen</button><PlantForm options={options} open={open} onClose={()=>setOpen(false)} onSaved={()=>{}}/></>}
    await mount(<Harness/>);await act(async()=>{document.body.querySelector<HTMLDetailsElement>('.form-more')!.querySelector('summary')!.click();document.body.querySelector<HTMLDetailsElement>('.sprite-alternatives')!.querySelector('summary')!.click()});
    await act(async()=>document.body.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click());await act(async()=>vi.advanceTimersByTime(120));await act(async()=>host.querySelector('button')!.click());
    expect(document.body.querySelector<HTMLDetailsElement>('.form-more')?.open).toBe(true);expect(document.body.querySelector<HTMLDetailsElement>('.sprite-alternatives')?.open).toBe(false);
  });
  it("closes a choice list with Escape without closing its dialog",async()=>{
    const close=vi.fn();await mount(<Modal title="Choice dialog" onClose={close}><ChoiceInput label="Source" value="" onChange={()=>{}} options={options.sources!}/></Modal>);
    await act(async()=>input("Source").focus());await act(async()=>input("Source").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
    expect(close).not.toHaveBeenCalled();expect(document.body.querySelector('[role=listbox]')).toBeNull();expect(host.querySelector('[role=dialog]')).toBeNull();expect(document.body.querySelector('[role=dialog]')?.parentElement?.parentElement).toBe(document.body);
  });
});

describe("photo and care forms",()=>{
  it("previews and replaces uploads, revokes URLs, and submits one file for several plants",async()=>{
    const saved=vi.fn();vi.mocked(api.upload).mockRejectedValueOnce(new Error("Upload failed"));
    await mount(<PhotoUpload plantId="one" options={options} onDone={saved}/>);await chooseFile();expect(document.body.querySelector<HTMLImageElement>('[alt="Selected photo preview"]')?.getAttribute("src")).toBe("blob:group.png");
    await chooseFile("new.png");expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:group.png");
    await act(async()=>Array.from(document.body.querySelectorAll<HTMLInputElement>('.plant-link-options input')).at(1)!.click());await fill("Tags","spring");await submit();
    const payload=vi.mocked(api.upload).mock.calls[0][1] as FormData;expect(JSON.parse(String(payload.get("plantIds")))).toEqual(["one","two"]);expect(payload.get("tags")).toBe("spring");expect(document.body.querySelector('[alt="Selected photo preview"]')).not.toBeNull();
    vi.mocked(api.upload).mockResolvedValue(photo);await submit();expect(saved).toHaveBeenCalledOnce();
    await act(async()=>root.render(<></>));expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:new.png");
  });
  it("rejects unsupported images and uses a local default date",async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date(2026,8,29,23,30));await mount(<PhotoUpload plantId="one" options={options} onDone={()=>{}}/>);
    expect(field("Date taken").querySelector('input')?.value).toBe("2026-09-29");await chooseFile("fake.txt","text/plain");await submit();expect(api.upload).not.toHaveBeenCalled();expect(document.body.querySelector('[role=alert]')?.textContent).toContain("20 MB");
    await chooseFile("oversized.png","image/png",20*1024*1024+1);await submit();expect(api.upload).not.toHaveBeenCalled();
  });
  it("edits existing photo links and metadata without uploading another file",async()=>{
    vi.mocked(api.put).mockResolvedValue(photo);await mount(<PhotoUpload photo={photo} options={options} onDone={()=>{}}/>);
    expect(document.body.querySelector('input[type=file]')).toBeNull();await act(async()=>document.body.querySelector<HTMLInputElement>('.plant-link-options input')!.click());await fill("Tags","spring");await submit();
    expect(api.put).toHaveBeenCalledWith("/api/photos/group",expect.objectContaining({plantIds:["two"],tags:["growth","spring"]}));expect(api.upload).not.toHaveBeenCalled();
  });
  it("previews and links existing guidance with separate reminder defaults",async()=>{
    const guidance={id:"guide",activityType:"watering",customLabel:"",guidance:"Water when dry",cadenceDays:7,notes:"Winter adjustment",linkedPlants:[{id:"two",name:"Two"}]};vi.mocked(api.get).mockResolvedValue([guidance]);vi.mocked(api.post).mockResolvedValue({});
    await mount(<CareForm plantId="one" open onClose={()=>{}} onSaved={()=>{}}/>);await select("Guidance source","existing");await select("Existing guidance","guide");
    expect(document.body.querySelector('.guidance-preview')?.textContent).toContain("Winter adjustment");await submit();
    expect(api.post).toHaveBeenCalledWith("/api/plants/one/care",expect.objectContaining({guidanceId:"guide",reminderEnabled:false}));expect(vi.mocked(api.post).mock.calls[0][1]).not.toHaveProperty("guidance");
  });
});
