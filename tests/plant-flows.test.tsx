// @vitest-environment jsdom
import { act, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/api";
import { CareForm, PlantForm, HistoryForm } from "../src/components/PlantForms";
import { PlantDetailPage } from "../src/components/Plants";
import { PhotoUpload } from "../src/components/Common";
import { getPlantIcon } from "../src/shared/plantIcons";
import type { Plant } from "../src/shared/types";
import { initializeAppearance, setForestAesthetic } from "../src/appearance";

vi.mock("../src/api",()=>({api:{get:vi.fn(),post:vi.fn(),put:vi.fn(),upload:vi.fn(),delete:vi.fn()}}));
const options={species:[],terrariums:[],tags:[]};
const plant:Plant={id:"fern",name:"Fern",spriteImage:"/images/plant-spirit-moss-seated.png",speciesId:null,speciesCommonName:"",speciesScientificName:"",description:"An old friend",dateAcquired:"2024-02-03",source:"Plant swap",location:"Window",terrariumId:null,terrariumName:"",status:"healthy",profilePhotoId:"first",profilePhotoUrl:"/media/first.jpg",archivedAt:null,dateOfDeath:"",causeOfDeath:"",finalNotes:"",tags:["favorite"],updatedAt:"2026-08-28T12:00:00Z",createdAt:"2024-02-03T12:00:00Z",history:[],photos:["first","second"].map(id=>({id,plantId:"fern",terrariumId:null,url:`/media/${id}.jpg`,originalName:`${id}.jpg`,mimeType:"image/jpeg",sizeBytes:100,dateTaken:"2026-08-28",caption:id,tags:[],createdAt:"2026-08-28T12:00:00Z"})),careItems:[]};
let root:Root,host:HTMLDivElement;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();host=document.createElement("div");document.body.append(host);root=createRoot(host)});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers()});
const button=(label:string)=>Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(button=>button.textContent?.trim()===label)!;
const input=(label:string)=>Array.from(document.body.querySelectorAll('label')).find(node=>node.querySelector('span')?.textContent===label)!.querySelector<HTMLInputElement|HTMLTextAreaElement>('input,textarea')!;
async function fill(label:string,value:string){await act(async()=>{const field=input(label),proto=field instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}))})}
async function submit(){await act(async()=>document.body.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))}
const mount=(element:React.ReactNode)=>act(async()=>root.render(<StrictMode>{element}</StrictMode>));
async function chooseSprite(label:string){const disclosure=document.body.querySelector<HTMLDetailsElement>('.sprite-alternatives');if(disclosure&&!disclosure.open)await act(async()=>disclosure.querySelector('summary')!.click());const choice=Array.from(document.body.querySelectorAll<HTMLLabelElement>('.sprite-choice')).find(node=>node.querySelector('strong')?.textContent===label)!;await act(async()=>choice.querySelector<HTMLInputElement>('input')!.click())}

describe("plant creation and editing",()=>{
  it("creates from a name alone with details expanded and sprite alternatives collapsed",async()=>{
    const saved=vi.fn();vi.mocked(api.post).mockResolvedValue(plant);
    await mount(<PlantForm options={options} onClose={()=>{}} onSaved={saved}/>);
    expect(document.body.querySelector<HTMLDetailsElement>('.form-more')!.open).toBe(true);expect(document.body.querySelector<HTMLDetailsElement>('.sprite-alternatives')!.open).toBe(false);expect(input('Personal name')).toBe(document.activeElement);
    await fill('Personal name','  Fern  ');await submit();
    expect(document.body.querySelector<HTMLInputElement>('.sprite-surprise input')?.checked).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/api/plants',expect.objectContaining({name:'Fern',spriteImage:'',status:'healthy',speciesId:null,terrariumId:null,tags:[]}));
    expect(saved).toHaveBeenCalledOnce();expect(api.upload).not.toHaveBeenCalled();
  });
  it("lets a sprite be selected while creating a plant",async()=>{
    vi.mocked(api.post).mockResolvedValue(plant);await mount(<PlantForm options={options} onClose={()=>{}} onSaved={()=>{}}/>);
    await chooseSprite('Moss · seated');await fill('Personal name','Fern');await submit();
    expect(api.post).toHaveBeenCalledWith('/api/plants',expect.objectContaining({spriteImage:'/images/plant-spirit-moss-seated.png'}));
  });
  it("preserves values after failure and prevents duplicate writes before retry",async()=>{
    const saved=vi.fn();let reject!:(error:Error)=>void;vi.mocked(api.post).mockImplementationOnce(()=>new Promise((_resolve,no)=>{reject=no}));
    await mount(<PlantForm options={options} onClose={()=>{}} onSaved={saved}/>);await fill('Personal name','Mosslight');
    await act(async()=>{const form=document.body.querySelector('form')!;form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
    expect(api.post).toHaveBeenCalledOnce();expect(document.body.querySelector('fieldset')!.disabled).toBe(true);
    await act(async()=>reject(new Error('Could not save this plant')));
    expect(input('Personal name').value).toBe('Mosslight');expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('Could not save');expect(saved).not.toHaveBeenCalled();
    vi.mocked(api.post).mockResolvedValueOnce({...plant,name:'Mosslight'});await submit();expect(api.post).toHaveBeenCalledTimes(2);expect(saved).toHaveBeenCalledOnce();
  });
  it("saves optional details when they are expanded",async()=>{
    vi.mocked(api.post).mockResolvedValue(plant);await mount(<PlantForm options={options} onClose={()=>{}} onSaved={()=>{}}/>);
    expect(document.body.querySelector<HTMLDetailsElement>('.form-more')!.open).toBe(true);
    await fill('Personal name','Fern');await fill('Source','A friend');await fill('Tags','favorite, gifted');await submit();
    expect(api.post).toHaveBeenCalledWith('/api/plants',expect.objectContaining({source:'A friend',tags:['favorite','gifted']}));
  });
  it("keeps every existing field, cover, and memorial detail when editing",async()=>{
    const memorial={...plant,status:'deceased' as const,dateOfDeath:'2025-01-03',causeOfDeath:'Cold',finalNotes:'Remembered'};
    vi.mocked(api.put).mockResolvedValue(memorial);await mount(<PlantForm plant={memorial} options={options} onClose={()=>{}} onSaved={()=>{}}/>);
    expect(document.body.querySelector('details')).toBeNull();expect(input('Final notes').value).toBe('Remembered');expect(document.body.querySelector<HTMLInputElement>(`input[value="${plant.spriteImage}"]`)?.checked).toBe(true);
    await chooseSprite('Succulent · resting');await fill('Personal name','Remembered fern');await submit();
    expect(api.put).toHaveBeenCalledWith('/api/plants/fern',expect.objectContaining({name:'Remembered fern',spriteImage:'/images/plant-spirit-succulent-resting.png',source:'Plant swap',description:'An old friend',dateAcquired:'2024-02-03',profilePhotoId:'first',tags:['favorite'],status:'deceased',dateOfDeath:'2025-01-03',causeOfDeath:'Cold',finalNotes:'Remembered'}));
  });
  it("retains the draft through exit and resets after closing",async()=>{
    vi.useFakeTimers();function Harness(){const [open,setOpen]=useState(true);return <><button onClick={()=>setOpen(true)}>Reopen</button><PlantForm open={open} options={options} onClose={()=>setOpen(false)} onSaved={()=>{}}/></>}
    await mount(<Harness/>);await fill('Personal name','Draft');await act(async()=>button('Cancel').click());expect(input('Personal name').value).toBe('Draft');
    await act(async()=>vi.advanceTimersByTime(120));expect(document.body.querySelector('form')).toBeNull();await act(async()=>button('Reopen').click());expect(input('Personal name').value).toBe('');
  });
});

describe("meaningful update saves",()=>{
  it("prioritizes the title, preserves the failed draft, and returns the saved event ID",async()=>{
    const saved=vi.fn();vi.mocked(api.post).mockRejectedValueOnce(new Error('Try again'));
    await mount(<HistoryForm open plantId='fern' onClose={()=>{}} onSaved={saved}/>);
    expect(document.body.querySelector('form label span')?.textContent).toBe('Title');await fill('Title','A new frond');await fill('What happened?','Unfurled overnight');await submit();
    expect(input('Title').value).toBe('A new frond');expect(input('What happened?').value).toBe('Unfurled overnight');expect(saved).not.toHaveBeenCalled();
    vi.mocked(api.post).mockResolvedValueOnce({id:'event-new'});await submit();expect(saved).toHaveBeenCalledOnce();expect(saved).toHaveBeenCalledWith('event-new');
    expect(api.post).toHaveBeenLastCalledWith('/api/history',expect.objectContaining({plantId:'fern',eventType:'note',title:'A new frond',detail:'Unfurled overnight'}));
  });
});

describe("care reminder scheduling",()=>{
  it("separates general cadence from an explicit repeating reminder",async()=>{
    vi.mocked(api.post).mockResolvedValue({});await mount(<CareForm open plantId="fern" onClose={()=>{}} onSaved={()=>{}}/>);
    await fill("General guidance","Check the soil first");await fill("Typical cadence (days)","6");
    await act(async()=>document.body.querySelector<HTMLInputElement>('.toggle input')!.click());
    const schedule=Array.from(document.body.querySelectorAll('label')).find(label=>label.querySelector('span')?.textContent==="Reminder schedule")!.querySelector<HTMLSelectElement>('select')!;
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(schedule,'repeating');schedule.dispatchEvent(new Event('change',{bubbles:true}))});
    expect(input("Repeat every (days)").value).toBe("6");expect(input("First reminder").value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await submit();expect(api.post).toHaveBeenCalledWith('/api/plants/fern/care',expect.objectContaining({cadenceDays:6,reminderEnabled:true,reminderRepeat:true,reminderCadenceDays:6}));
  });
});

describe("progress photo saves",()=>{
  it("retains the selected file and caption on failure and allows one retry",async()=>{
    const saved=vi.fn();let reject!:(error:Error)=>void;vi.mocked(api.upload).mockImplementationOnce(()=>new Promise((_resolve,no)=>{reject=no}));
    await mount(<PhotoUpload plantId="fern" onDone={saved}/>);
    const file=new File(['demo'],'leaf.png',{type:'image/png'}),field=document.body.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(field,'files',{value:[file]});await act(async()=>field.dispatchEvent(new Event('change',{bubbles:true})));
    await fill('Caption','A quiet morning');
    await act(async()=>{document.body.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));document.body.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
    expect(api.upload).toHaveBeenCalledOnce();await act(async()=>reject(new Error('Upload unavailable')));
    expect(field.files?.[0]).toBe(file);expect(input('Caption').value).toBe('A quiet morning');expect(saved).not.toHaveBeenCalled();
    vi.mocked(api.upload).mockResolvedValueOnce(plant.photos![0]);await submit();expect(api.upload).toHaveBeenCalledTimes(2);expect(saved).toHaveBeenCalledOnce();
  });
});

async function profile(welcome?:string,onWelcomeShown=vi.fn()){
  vi.mocked(api.get).mockResolvedValue(plant);
  await mount(<MemoryRouter initialEntries={['/plants/fern']}><Routes><Route path='/plants/:id' element={<PlantDetailPage options={options} refreshOptions={()=>{}} welcomePlantId={welcome} onWelcomeShown={onWelcomeShown}/>}/></Routes></MemoryRouter>);
}
describe("profile feedback and refresh",()=>{
  it("keeps the active tab, comparison and update draft when appearance changes",async()=>{
    const stop=initializeAppearance();
    try {
      await profile();await act(async()=>button('Progress photos').click());await act(async()=>button('Compare photos').click());
      const comparison=document.body.querySelector('.compare-panel');
      await act(async()=>button('Add update').click());await fill('Title','A quiet new frond');await fill('What happened?','Still writing this note');
      const form=document.body.querySelector('form'),focus=document.activeElement,reads=vi.mocked(api.get).mock.calls.length;
      await act(async()=>{setForestAesthetic(false);setForestAesthetic(true)});
      expect(document.body.querySelector('form')).toBe(form);expect(document.activeElement).toBe(focus);
      expect(input('Title').value).toBe('A quiet new frond');expect(input('What happened?').value).toBe('Still writing this note');
      expect(document.body.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Progress photos');expect(document.body.querySelector('.compare-panel')).toBe(comparison);
      expect(api.get).toHaveBeenCalledTimes(reads);expect(api.post).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
    } finally {stop();localStorage.removeItem('greenhouse-forest-aesthetic');document.documentElement.removeAttribute('data-forest-aesthetic')}
  });
  it("does not celebrate routine visits and uses the same plant spirit",async()=>{
    await profile();expect(document.body.querySelector('.spirit-profile img')?.getAttribute('src')).toBe(getPlantIcon('fern',plant.spriteImage));expect(document.body.querySelector('.spirit-motion-idle')).not.toBeNull();expect(document.body.querySelector('.spirit-motion-settle')).toBeNull();expect(document.body.querySelector('.save-feedback')?.textContent).toBe('');
  });
  it("consolidates metadata and places profile actions at their point of use",async()=>{
    await profile();const metadata=document.body.querySelector('.hero-meta')?.textContent;
    expect(document.body.querySelector('.plant-summary-shell > .plant-summary-card.detail-hero')).not.toBeNull();
    expect(metadata).toContain('Window');expect(metadata).toContain('Acquired Feb 3, 2024');expect(metadata).toContain('Plant swap');expect(metadata).toContain('2 photos');
    expect(document.body.querySelector('.profile-summary-toolbar .profile-summary-edit')?.textContent).toContain('Edit');expect(document.body.querySelector('.profile-action-bar')).toBeNull();
    expect(document.body.querySelector('#plant-panel-story .section-heading .button.primary')?.textContent).toContain('Add update');expect(document.body.querySelector('.detail-hero')?.textContent).not.toContain('Add update');
    expect(document.body.querySelector('.plant-record [role="tablist"]')).not.toBeNull();expect(document.body.querySelector('.story-aside .fact-card')).toBeNull();
  });
  it("shows the welcome only once, even under Strict Mode",async()=>{
    vi.useFakeTimers();const consumed=vi.fn();await profile('fern',consumed);
    expect(consumed).toHaveBeenCalledOnce();expect(document.body.querySelector('.save-feedback')?.textContent).toContain('Welcome');expect(document.body.querySelector('.spirit-motion-settle')).not.toBeNull();
    await act(async()=>vi.advanceTimersByTime(360));expect(document.body.querySelector('.spirit-motion-settle')).toBeNull();expect(document.body.querySelector('.spirit-motion-idle')).not.toBeNull();
    await act(async()=>button('Care guidance').click());expect(consumed).toHaveBeenCalledOnce();expect(document.body.querySelector('.spirit-motion-settle')).toBeNull();
  });
  it("keeps the photo tab and comparison mounted if a successful cover write cannot refresh",async()=>{
    vi.useFakeTimers();await profile();await act(async()=>button('Progress photos').click());await act(async()=>button('Compare photos').click());
    const comparison=document.body.querySelector('.compare-panel');
    await act(async()=>button('Edit').click());expect(document.body.querySelector('.edit-cover-field')).not.toBeNull();vi.mocked(api.post).mockResolvedValueOnce({...plant,profilePhotoId:'second'});vi.mocked(api.get).mockRejectedValueOnce(new Error('Refresh unavailable'));
    await act(async()=>document.body.querySelector<HTMLButtonElement>('[aria-label="Choose cover: second"]')!.click());
    expect(api.post).toHaveBeenCalledOnce();expect(api.put).not.toHaveBeenCalled();expect(document.body.querySelector('.save-feedback')?.textContent).toContain('Cover photo updated');expect(document.body.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Progress photos');
    expect(document.body.querySelector('.compare-panel')).toBe(comparison);expect(document.body.querySelector('.refresh-note')?.textContent).toContain('Refresh unavailable');
    await act(async()=>vi.advanceTimersByTime(120));vi.mocked(api.get).mockResolvedValueOnce({...plant,profilePhotoId:'second',profilePhotoUrl:'/media/second.jpg'});
    await act(async()=>button('Retry refresh').click());expect(api.post).toHaveBeenCalledOnce();expect(document.body.querySelector('.refresh-note')).toBeNull();expect(document.body.querySelector('.compare-panel')).toBe(comparison);
  });
});
