// @vitest-environment jsdom
import { act, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/api";
import { TerrariumForm } from "../src/components/TerrariumForm";
import { TerrariumDetailPage, TerrariumsPage } from "../src/components/Terrariums";
import { HistoryForm } from "../src/components/PlantForms";
import { getPlantIcon } from "../src/shared/plantIcons";
import type { Plant, Terrarium } from "../src/shared/types";

vi.mock("../src/api",()=>({api:{get:vi.fn(),post:vi.fn(),put:vi.fn(),upload:vi.fn(),delete:vi.fn()}}));
const resident:Plant={id:"fern",name:"A tiny fern",speciesId:null,speciesCommonName:"Maidenhair fern",speciesScientificName:"",description:"",dateAcquired:"",source:"",location:"",terrariumId:"cloud",terrariumName:"Cloud Forest",status:"healthy",profilePhotoId:"leaf",profilePhotoUrl:"/media/leaf.jpg",archivedAt:null,dateOfDeath:"",causeOfDeath:"",finalNotes:"",tags:[],updatedAt:"2026-08-28",createdAt:"2026-08-28"};
const terrarium:Terrarium={id:"cloud",name:"Cloud Forest",description:"A quiet little world",dateCreated:"2024-02-03",type:"Closed tropical",location:"North shelf",lightingSetup:"Grow light, 10 hours",humidityRequirements:"70–90%",wateringNotes:"Mist as needed",substrateInformation:"Gravel, charcoal, soil",notes:"Rotate weekly",otherInhabitants:"Springtails",coverPhotoId:"first",coverPhotoUrl:"/media/first.jpg",plantCount:1,plants:[resident],photos:["first","second"].map(id=>({id,plantId:null,terrariumId:"cloud",url:`/media/${id}.jpg`,originalName:`${id}.jpg`,mimeType:"image/jpeg",sizeBytes:100,dateTaken:"2026-08-28",caption:id,tags:[],createdAt:"2026-08-28"})),history:[{id:"journal-one",kind:"journal",date:"2026-08-28",title:"A quiet morning",detail:"The moss is growing",journalId:"journal-one"}],createdAt:"2024-02-03",updatedAt:"2026-08-28"};
let root:Root,host:HTMLDivElement;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();host=document.createElement("div");document.body.append(host);root=createRoot(host)});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers()});
const button=(label:string)=>Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(node=>node.textContent?.trim()===label)!;
const input=(label:string)=>Array.from(host.querySelectorAll('label')).find(node=>node.querySelector('span')?.textContent===label)!.querySelector<HTMLInputElement|HTMLTextAreaElement>('input,textarea')!;
async function fill(label:string,value:string){await act(async()=>{const field=input(label),proto=field instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}))})}
async function submit(){await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))}
const mount=(element:React.ReactNode)=>act(async()=>root.render(<StrictMode>{element}</StrictMode>));
async function profile(welcome?:string,onWelcomeShown=vi.fn()){
  vi.mocked(api.get).mockResolvedValue(terrarium);
  await mount(<MemoryRouter initialEntries={['/terrariums/cloud']}><Routes><Route path='/terrariums/:id' element={<TerrariumDetailPage refreshOptions={()=>{}} welcomeTerrariumId={welcome} onWelcomeShown={onWelcomeShown}/>}/></Routes></MemoryRouter>);
}

describe("terrarium creation and editing",()=>{
  it("creates from a name alone, preserving empty defaults and leaving photo upload separate",async()=>{
    const saved=vi.fn();vi.mocked(api.post).mockResolvedValue(terrarium);
    await mount(<TerrariumForm onClose={()=>{}} onSaved={saved}/>);
    expect(host.querySelector('details')!.open).toBe(false);expect(document.activeElement).toBe(input('Personal name'));
    await fill('Personal name','  Cloud Forest  ');await submit();
    expect(api.post).toHaveBeenCalledWith('/api/terrariums',{name:'Cloud Forest',description:'',dateCreated:'',type:'',location:'',lightingSetup:'',humidityRequirements:'',wateringNotes:'',substrateInformation:'',notes:'',otherInhabitants:''});
    expect(saved).toHaveBeenCalledOnce();expect(api.upload).not.toHaveBeenCalled();
  });
  it("includes optional habitat details when expanded",async()=>{
    vi.mocked(api.post).mockResolvedValue(terrarium);await mount(<TerrariumForm onClose={()=>{}} onSaved={()=>{}}/>);
    await act(async()=>host.querySelector('summary')!.click());expect(host.querySelector('details')!.open).toBe(true);
    await fill('Personal name','Cloud Forest');await fill('Lighting setup','Gentle daylight');await fill('Other inhabitants','Springtails');await submit();
    expect(api.post).toHaveBeenCalledWith('/api/terrariums',expect.objectContaining({lightingSetup:'Gentle daylight',otherInhabitants:'Springtails'}));
  });
  it("preserves the failed draft and prevents duplicate submissions before retry",async()=>{
    const saved=vi.fn();let reject!:(error:Error)=>void;vi.mocked(api.post).mockImplementationOnce(()=>new Promise((_resolve,no)=>{reject=no}));
    await mount(<TerrariumForm onClose={()=>{}} onSaved={saved}/>);await fill('Personal name','Moss Bowl');
    await act(async()=>{const form=host.querySelector('form')!;form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
    expect(api.post).toHaveBeenCalledOnce();expect(host.querySelector('fieldset')!.disabled).toBe(true);
    await act(async()=>reject(new Error('Please try again')));
    expect(input('Personal name').value).toBe('Moss Bowl');expect(host.querySelector('fieldset')!.disabled).toBe(false);expect(host.querySelector('[role="alert"]')?.textContent).toContain('Please try again');expect(saved).not.toHaveBeenCalled();
    vi.mocked(api.post).mockResolvedValueOnce(terrarium);await submit();expect(api.post).toHaveBeenCalledTimes(2);expect(saved).toHaveBeenCalledOnce();
  });
  it("fully expands editing and preserves every habitat field and selected cover",async()=>{
    vi.mocked(api.put).mockResolvedValue(terrarium);await mount(<TerrariumForm item={terrarium} onClose={()=>{}} onSaved={()=>{}}/>);
    expect(host.querySelector('details')).toBeNull();expect(input('Other notes').value).toBe('Rotate weekly');expect(input('Watering / misting').value).toBe('Mist as needed');
    await fill('Personal name','Little Cloud');await submit();
    expect(api.put).toHaveBeenCalledWith('/api/terrariums/cloud',{...terrarium,name:'Little Cloud'});
  });
  it("restores focus and resets the draft only after the closing presence completes",async()=>{
    vi.useFakeTimers();function Harness(){const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Add terrarium</button><TerrariumForm open={open} onClose={()=>setOpen(false)} onSaved={()=>{}}/></>}
    await mount(<Harness/>);await act(async()=>{button('Add terrarium').focus();button('Add terrarium').click()});await fill('Personal name','Draft');
    await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    expect(input('Personal name').value).toBe('Draft');await act(async()=>vi.advanceTimersByTime(120));expect(host.querySelector('form')).toBeNull();expect(document.activeElement).toBe(button('Add terrarium'));
    await act(async()=>button('Add terrarium').click());expect(input('Personal name').value).toBe('');
  });
});

describe("terrarium updates and profiles",()=>{
  it("shares the title-first update form and writes the terrarium owner without a plant ID",async()=>{
    const saved=vi.fn();vi.mocked(api.post).mockResolvedValue({id:'new-moment'});
    await mount(<HistoryForm open terrariumId='cloud' onClose={()=>{}} onSaved={saved}/>);
    expect(host.querySelector('form label span')?.textContent).toBe('Title');await fill('Title','New moss');await fill('What happened?','Fresh shoots by the glass');await submit();
    const payload=vi.mocked(api.post).mock.calls[0][1];expect(payload).toEqual(expect.objectContaining({terrariumId:'cloud',eventType:'note',title:'New moss',detail:'Fresh shoots by the glass'}));expect(payload).not.toHaveProperty('plantId');expect(saved).toHaveBeenCalledWith('new-moment');
  });
  it("preserves photography, journal links, resident identities, and all habitat notes",async()=>{
    await profile();const metadata=host.querySelector('.hero-meta')?.textContent;
    expect(host.querySelector('.terrarium-summary-shell > .terrarium-summary-card.detail-hero')?.getAttribute('style')).toContain('/media/first.jpg');expect(host.querySelector('.spirit-profile img')?.getAttribute('src')).toBe('/images/plant-spirit-terrarium.png');
    expect(host.querySelector('.profile-identity .spirit-motion-idle.spirit-profile-terrarium')).not.toBeNull();expect(metadata).toContain('North shelf');expect(metadata).toContain('Created Feb 3, 2024');expect(metadata).toContain('1 living plant');expect(metadata).toContain('2 photos');
    expect(host.querySelector('.profile-summary-toolbar .profile-summary-edit')?.textContent).toContain('Edit');expect(host.querySelector('.profile-action-bar')).toBeNull();
    expect(host.querySelector('#terrarium-panel-story .section-heading .button.primary')?.textContent).toContain('Add update');expect(host.querySelector('.detail-hero')?.textContent).not.toContain('Add update');
    expect(host.querySelector('.terrarium-record [role="tablist"]')).not.toBeNull();expect(host.querySelector('.story-aside .fact-card')).toBeNull();expect(host.textContent).not.toContain('At a glance');
    expect(host.querySelector('.timeline a')?.getAttribute('href')).toBe('/journal/journal-one');expect(host.querySelector('.resident-list .spirit img')?.getAttribute('src')).toBe(getPlantIcon('fern'));
    expect(host.querySelector('.resident-thumb')?.getAttribute('style')).toContain('/media/leaf.jpg');
    await act(async()=>button('Environment').click());expect(host.querySelector('#terrarium-panel-environment')?.textContent).toContain('Gravel, charcoal, soil');expect(host.querySelector('#terrarium-panel-environment')?.textContent).toContain('Springtails');
    expect(host.querySelector('.spirit-motion-settle')).toBeNull();expect(host.querySelector('.save-feedback')?.textContent).toBe('');
  });
  it("welcomes a new terrarium exactly once under Strict Mode",async()=>{
    vi.useFakeTimers();const consumed=vi.fn();await profile('cloud',consumed);
    expect(consumed).toHaveBeenCalledOnce();expect(host.querySelector('.save-feedback')?.textContent).toContain('Welcome to the greenhouse, Cloud Forest.');expect(host.querySelector('.spirit-motion-settle')).not.toBeNull();
    await act(async()=>vi.advanceTimersByTime(360));expect(host.querySelector('.spirit-motion-settle')).toBeNull();expect(host.querySelector('.profile-identity .spirit-motion-idle')).not.toBeNull();await act(async()=>button('Residents').click());expect(consumed).toHaveBeenCalledOnce();
  });
  it("keeps the active photo tab and comparison mounted when refresh fails after a successful write",async()=>{
    vi.useFakeTimers();await profile();await act(async()=>button('Habitat photos').click());await act(async()=>button('Compare photos').click());const comparison=host.querySelector('.compare-panel');
    expect(button('Choose cover photo')).toBeUndefined();await act(async()=>button('Edit').click());expect(host.querySelector('.edit-cover-field')?.textContent).toContain('Cover photo');
    vi.mocked(api.post).mockResolvedValueOnce({...terrarium,coverPhotoId:'second'});vi.mocked(api.get).mockRejectedValueOnce(new Error('Refresh unavailable'));
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Choose cover: second"]')!.click());
    expect(api.post).toHaveBeenCalledWith('/api/terrariums/cloud/cover-photo',{photoId:'second'});expect(api.put).not.toHaveBeenCalled();expect(host.querySelector('.save-feedback')?.textContent).toContain('Cover photo updated');expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Habitat photos');expect(host.querySelector('.compare-panel')).toBe(comparison);expect(host.querySelector('.refresh-note')?.textContent).toContain('Refresh unavailable');
    await act(async()=>vi.advanceTimersByTime(120));vi.mocked(api.get).mockResolvedValueOnce({...terrarium,coverPhotoId:'second',coverPhotoUrl:'/media/second.jpg'});await act(async()=>button('Retry refresh').click());
    expect(api.post).toHaveBeenCalledOnce();expect(host.querySelector('.refresh-note')).toBeNull();expect(host.querySelector('.compare-panel')).toBe(comparison);
  });
  it("announces and animates a new update only after success, then refreshes without losing the active tab",async()=>{
    vi.useFakeTimers();await profile();await act(async()=>button('Add update').click());await fill('Title','New shoots');vi.mocked(api.post).mockRejectedValueOnce(new Error('Offline'));await submit();
    expect(host.querySelector('.spirit-motion-settle')).toBeNull();expect(host.querySelector('.save-feedback')?.textContent).toBe('');expect(input('Title').value).toBe('New shoots');
    vi.mocked(api.post).mockResolvedValueOnce({id:'new-event'});vi.mocked(api.get).mockResolvedValueOnce({...terrarium,history:[{id:'new-event',kind:'event',title:'New shoots',detail:'',date:'2026-08-28'},...terrarium.history!]});await submit();
    expect(host.querySelector('.save-feedback')?.textContent).toContain('A new moment added');expect(host.querySelectorAll('.timeline .new-moment')).toHaveLength(1);expect(host.querySelectorAll('.spirit-motion-settle')).toHaveLength(1);expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Story');
    await act(async()=>vi.advanceTimersByTime(360));expect(host.querySelector('.spirit-motion-settle')).toBeNull();expect(api.post).toHaveBeenCalledTimes(2);
  });
  it("opens photo upload from the photo workspace and preserves the terrarium owner",async()=>{
    await profile();await act(async()=>button('Habitat photos').click());await act(async()=>button('Add photo').click());expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Add a habitat photo');expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Habitat photos');
    const field=host.querySelector<HTMLInputElement>('input[type="file"]')!;Object.defineProperty(field,'files',{value:[new File(['demo'],'moss.png',{type:'image/png'})]});await act(async()=>field.dispatchEvent(new Event('change',{bubbles:true})));await fill('Caption','Moss by the glass');
    vi.mocked(api.upload).mockResolvedValueOnce(terrarium.photos![0]);await submit();const form=vi.mocked(api.upload).mock.calls[0][1] as FormData;expect(form.get('terrariumId')).toBe('cloud');expect(form.get('plantId')).toBeNull();expect(form.get('caption')).toBe('Moss by the glass');expect(host.querySelector('.save-feedback')?.textContent).toContain('Photo added');
  });
  it("uses the same shared creation trigger in the collection and retains photo covers",async()=>{
    const add=vi.fn();vi.mocked(api.get).mockResolvedValue([terrarium]);await mount(<MemoryRouter><TerrariumsPage onAddTerrarium={add}/></MemoryRouter>);
    expect(host.querySelector('.terrarium-photo')?.getAttribute('style')).toContain('/media/first.jpg');expect(host.querySelector('.card-body .spirit img')?.getAttribute('src')).toBe('/images/plant-spirit-terrarium.png');await act(async()=>button('Add terrarium').click());expect(add).toHaveBeenCalledOnce();
  });
});
