// @vitest-environment jsdom
import { act, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/api";
import { GlobalSearch } from "../src/components/GlobalSearch";
import { SpeciesForm, SpeciesPage } from "../src/components/Library";
import { SettingsPage } from "../src/components/JournalSettings";
import type { Species } from "../src/shared/types";

vi.mock("../src/api",()=>({api:{get:vi.fn(),post:vi.fn(),put:vi.fn(),upload:vi.fn()}}));
let root:Root,host:HTMLDivElement;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.resetAllMocks();host=document.createElement('div');document.body.append(host);root=createRoot(host)});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks()});
const mount=(element:React.ReactNode)=>act(async()=>root.render(<StrictMode>{element}</StrictMode>));
const button=(name:string)=>Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(item=>item.textContent?.trim()===name)!;
const field=(name:string)=>host.querySelector<HTMLInputElement>(`[aria-label="${name}"]`)||Array.from(host.querySelectorAll('label')).find(label=>label.querySelector('span')?.textContent===name)?.querySelector<HTMLInputElement|HTMLTextAreaElement>('input,textarea')!;
async function fill(name:string,value:string){await act(async()=>{const input=field(name);Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})}
async function file(name:string,type:string){const input=host.querySelector<HTMLInputElement>('input[type=file]')!;Object.defineProperty(input,'files',{configurable:true,value:[new File(['test'],name,{type})]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})))}
const submit=()=>act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
const deferred=<T,>()=>{let resolve!:(value:T)=>void,reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
const species={id:'fern',commonName:'Boston fern',scientificName:'Nephrolepis exaltata',family:'Nephrolepidaceae',imageUrl:'/fern.jpg',notes:'Keep this reference',description:'Arching fronds',nativeHabitat:'Humid forest',growthCharacteristics:'Dense crowns',matureSize:'60 cm',lightRequirements:'Indirect',waterRequirements:'Even moisture',humidityRequirements:'Humid',temperatureRange:'Warm',substratePreferences:'Airy',fertilizationRecommendations:'Gentle',propagationMethods:'Division',commonProblems:'Dry air',commonPests:'Mites',toxicity:'Recorded safety note',terrariumSuitability:'Large',plantCount:1} as Species;

describe('species references',()=>{
  it('starts with identity/photo and collapsed optional details; validates the existing requirements',async()=>{
    await mount(<SpeciesForm onClose={()=>{}} onSaved={()=>{}}/>);expect(host.querySelector('details')?.open).toBe(false);expect(host.querySelector<HTMLInputElement>('input[type=file]')?.required).toBe(true);
    await submit();expect(api.post).not.toHaveBeenCalled();expect(host.textContent).toContain('Enter a common name or a scientific name');
    await fill('Common name','Fern');await submit();expect(api.post).not.toHaveBeenCalled();expect(host.textContent).toContain('Choose a reference image');
  });
  it('retains a successful record and retries only the failed photo, including duplicate submission protection',async()=>{
    const saved=vi.fn(),pending=deferred<Species>();vi.mocked(api.post).mockResolvedValue(species);vi.mocked(api.upload).mockReturnValueOnce(pending.promise);
    await mount(<SpeciesForm onClose={()=>{}} onSaved={saved}/>);await fill('Common name','Boston fern');await file('fern.png','image/png');
    await act(async()=>{const form=host.querySelector('form')!;form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
    expect(api.post).toHaveBeenCalledOnce();expect(api.upload).toHaveBeenCalledOnce();expect(host.querySelector('fieldset')?.disabled).toBe(true);
    await act(async()=>pending.reject(new Error('Photo service unavailable')));expect(field('Common name').value).toBe('Boston fern');expect(button('Retry image upload').disabled).toBe(false);expect(saved).not.toHaveBeenCalled();
    vi.mocked(api.upload).mockResolvedValueOnce(species);await submit();expect(api.post).toHaveBeenCalledOnce();expect(api.put).not.toHaveBeenCalled();expect(api.upload).toHaveBeenCalledTimes(2);expect(saved).toHaveBeenCalledExactlyOnceWith(species);
  });
  it('preserves every reference field when editing without requiring a replacement image',async()=>{
    const saved=vi.fn();vi.mocked(api.put).mockResolvedValue(species);await mount(<SpeciesForm item={species} onClose={()=>{}} onSaved={saved}/>);
    expect(host.querySelector('details')).toBeNull();expect(field('Personal reference notes').value).toBe(species.notes);
    await fill('Common name','A familiar fern');await submit();expect(api.put).toHaveBeenCalledWith('/api/species/fern',expect.objectContaining({...Object.fromEntries(Object.entries(species).filter(([key])=>!['id','imageUrl','plantCount'].includes(key))),commonName:'A familiar fern'}));expect(api.upload).not.toHaveBeenCalled();expect(saved).toHaveBeenCalledOnce();
  });
  it('does not request a placeholder resource and separates a successful edit from refresh failure',async()=>{
    vi.mocked(api.get).mockImplementation(async path=>path.startsWith('/api/species?')?[species]:species);
    await mount(<MemoryRouter initialEntries={['/species']}><Routes><Route path='/species' element={<SpeciesPage refreshOptions={()=>{}}/>}/><Route path='/species/:id' element={<SpeciesPage refreshOptions={()=>{}}/>}/></Routes></MemoryRouter>);
    expect(vi.mocked(api.get).mock.calls.every(([path])=>path.startsWith('/api/species?'))).toBe(true);
    await act(async()=>host.querySelector<HTMLButtonElement>('.species-list button')!.click());await act(async()=>button('Edit reference').click());
    vi.mocked(api.put).mockResolvedValue(species);vi.mocked(api.get).mockRejectedValue(new Error('Read failed'));await submit();
    expect(api.put).toHaveBeenCalledOnce();expect(host.textContent).toContain('Botanical reference saved');expect(host.textContent).toContain('Retry refresh');
    vi.mocked(api.get).mockImplementation(async path=>path.startsWith('/api/species?')?[species]:species);await act(async()=>button('Retry refresh').click());expect(api.put).toHaveBeenCalledOnce();expect(host.textContent).not.toContain('Read failed');
  });
});

function SearchHarness(){const [open,setOpen]=useState(false);const location=useLocation();return <><button onClick={()=>setOpen(true)}>Search</button><span data-path>{location.pathname}</span><GlobalSearch open={open} onClose={()=>setOpen(false)} options={null}/></>}
async function openSearch(){await mount(<MemoryRouter><SearchHarness/></MemoryRouter>);const trigger=button('Search');trigger.focus();await act(async()=>trigger.click());return trigger}
const searchLabel='Search plants, species, terrariums, and journal';
const results=[{id:'fern',type:'plant' as const,title:'Fern',subtitle:'Window',url:'/plants/fern'},{id:'jar',type:'terrarium' as const,title:'Moss jar',subtitle:'Closed',url:'/terrariums/jar'}];
describe('global search',()=>{
  it('labels and focuses its input, supports keyboard selection, then restores focus after exit',async()=>{
    vi.useFakeTimers();vi.mocked(api.get).mockResolvedValue(results);const trigger=await openSearch();expect(document.activeElement).toBe(field(searchLabel));
    await fill(searchLabel,'fern');expect(host.textContent).toContain('Searching');await act(async()=>vi.advanceTimersByTime(180));expect(host.querySelectorAll('[role=option]')).toHaveLength(2);expect(host.querySelectorAll('.spirit')).toHaveLength(2);
    await act(async()=>field(searchLabel).dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));await act(async()=>field(searchLabel).dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));await act(async()=>field(searchLabel).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));expect(host.querySelector('[data-path]')?.textContent).toBe('/terrariums/jar');
    await act(async()=>vi.advanceTimersByTime(120));expect(host.querySelector('[role=dialog]')).toBeNull();expect(document.activeElement).toBe(trigger);
  });
  it('ignores out-of-order and closed requests; offers a retry for the current query',async()=>{
    vi.useFakeTimers();const old=deferred<typeof results>(),latest=deferred<typeof results>();vi.mocked(api.get).mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);await openSearch();
    await fill(searchLabel,'old');await act(async()=>vi.advanceTimersByTime(180));await fill(searchLabel,'new');await act(async()=>vi.advanceTimersByTime(180));await act(async()=>latest.resolve(results));await act(async()=>old.resolve([{...results[0],title:'Stale result'}]));expect(host.textContent).not.toContain('Stale result');
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Search offline'));await fill(searchLabel,'retry');await act(async()=>vi.advanceTimersByTime(180));expect(host.textContent).toContain('Search offline');vi.mocked(api.get).mockResolvedValueOnce([]);await act(async()=>button('Retry search').click());await act(async()=>vi.advanceTimersByTime(180));expect(host.textContent).toContain('No matches yet');
    const late=deferred<typeof results>();vi.mocked(api.get).mockReturnValueOnce(late.promise);await fill(searchLabel,'closing');await act(async()=>vi.advanceTimersByTime(180));await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await act(async()=>late.resolve(results));expect(host.querySelectorAll('[role=option]')).toHaveLength(0);
  });
});

describe('backup restore safety',()=>{
  it('requires confirmation and preserves the chosen backup after failure without duplicate writes',async()=>{
    vi.useFakeTimers();await mount(<SettingsPage/>);expect(host.querySelector('a')?.getAttribute('href')).toBe('/api/backup');await file('my-greenhouse.zip','application/zip');await act(async()=>button('Restore this backup').click());expect(api.upload).not.toHaveBeenCalled();expect(host.querySelector('[role=dialog]')?.textContent).toContain('my-greenhouse.zip');
    await act(async()=>button('Cancel').click());await act(async()=>vi.advanceTimersByTime(120));expect(api.upload).not.toHaveBeenCalled();
    await act(async()=>button('Restore this backup').click());const pending=deferred<unknown>();vi.mocked(api.upload).mockReturnValueOnce(pending.promise);await act(async()=>{button('Replace and restore').click();button('Replace and restore').click()});expect(api.upload).toHaveBeenCalledOnce();expect(button('Choose another backup').disabled).toBe(true);
    await act(async()=>pending.reject(new Error('Invalid backup')));expect(host.textContent).toContain('Invalid backup');expect(host.textContent).toContain('my-greenhouse.zip');expect(button('Replace and restore').disabled).toBe(false);
    vi.mocked(api.upload).mockResolvedValueOnce({ok:true});await act(async()=>button('Replace and restore').click());expect(api.upload).toHaveBeenCalledTimes(2);expect(host.textContent).toContain('restored successfully');expect(button('Choose another backup').disabled).toBe(true);
  });
});
