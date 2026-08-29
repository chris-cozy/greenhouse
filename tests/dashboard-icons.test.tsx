// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as FileURL } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Modal } from "../src/components/Common";
import type { GardenViewState } from "../src/components/Garden";
import { Dashboard, Garden } from "../src/components/Dashboard";
import { Spirit } from "../src/components/Spirit";
import { getPlantIcon, getTerrariumIcon, PLANT_ICON_IMAGES, TERRARIUM_ICON_IMAGES } from "../src/shared/plantIcons";
import type { DashboardData, Plant } from "../src/shared/types";
import { initializeAppearance, setForestAesthetic } from "../src/appearance";

const dashboard: DashboardData = {
  livingPlants: 32,
  terrariums: 3,
  gardenPlants: Array.from({ length: 32 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    name: `Plant ${index}`,
    spriteImage: PLANT_ICON_IMAGES[index % PLANT_ICON_IMAGES.length],
  })),
  gardenTerrariums: [
    { id: "terrarium-1", name: "Cloud Garden", spriteImage: TERRARIUM_ICON_IMAGES[0] },
    { id: "terrarium-3", name: "Moss Bowl", spriteImage: TERRARIUM_ICON_IMAGES[1] },
    { id: "terrarium-0", name: "Fern Bottle", spriteImage: TERRARIUM_ICON_IMAGES[2] },
  ],
  attentionPlants: [],
  recentlyUpdated: [],
  recentJournals: [],
  recentPhotos: [],
  upcomingReminders: [],
};

vi.mock("../src/components/Common", async importOriginal => ({
  ...await importOriginal<typeof import("../src/components/Common")>(),
  useLoad: () => ({ data: dashboard, loading: false, error: "", reload: vi.fn() }),
}));

describe("dashboard collection icons", () => {
  it("shows the requested home copy and puts reminders immediately after the collection",()=>{
    dashboard.upcomingReminders=[{id:"care",plantId:"plant",plantName:"Fern",plantSpriteImage:PLANT_ICON_IMAGES[0],activityType:"watering",customLabel:"",guidance:"",cadenceDays:null,reminderEnabled:true,reminderRepeat:true,reminderCadenceDays:7,nextReminderDate:"2026-08-30",notes:"",sortOrder:0}];
    try {
      const html=renderToStaticMarkup(<MemoryRouter><Dashboard onAddPlant={()=>{}}/></MemoryRouter>);
      const document=new DOMParser().parseFromString(html,"text/html");
      expect(document.querySelector("h1")?.textContent).toBe("Your Greenhouse ♡");
      expect(document.querySelector(".welcome p")?.textContent).toBe("All of the plants under your care");
      expect(document.querySelector(".garden-card h2")?.textContent).toBe("All of the sprites in your garden");
      expect(document.querySelector(".summary-grid")?.nextElementSibling?.className).toBe("reminder-strip");
      expect(document.querySelector(".reminder-strip h2")?.textContent).toBe("A few things to check");
      expect(document.querySelector(".reminder-done")?.textContent).toContain("Done for now");
      expect(document.querySelector(".reminder-repeat")?.textContent).toBe("Repeats every 7 days");
      expect(document.querySelector<HTMLAnchorElement>(".reminder-identity")?.href).toContain("/plants/plant?tab=care");
    } finally {dashboard.upcomingReminders=[];}
  });
  it("offers the complete reminder list when more than four are active",()=>{
    dashboard.upcomingReminders=Array.from({length:5},(_,index)=>({id:`care-${index}`,plantId:`plant-${index}`,plantName:`Fern ${index}`,plantSpriteImage:PLANT_ICON_IMAGES[index%PLANT_ICON_IMAGES.length],activityType:"watering" as const,customLabel:"",guidance:"",cadenceDays:7,reminderEnabled:true,reminderRepeat:false,reminderCadenceDays:null,nextReminderDate:"2026-08-30",notes:"",sortOrder:index}));
    try {const html=renderToStaticMarkup(<MemoryRouter><Dashboard onAddPlant={()=>{}}/></MemoryRouter>);const document=new DOMParser().parseFromString(html,"text/html");expect(document.querySelectorAll(".reminder-items .reminder-card")).toHaveLength(4);expect(document.querySelector(".reminder-view-all")?.textContent).toBe("View all 5")}
    finally {dashboard.upcomingReminders=[]}
  });
  it("retains the same heading and separate onboarding for an empty greenhouse",()=>{
    const plants=dashboard.gardenPlants,terrariums=dashboard.gardenTerrariums;
    dashboard.gardenPlants=[];dashboard.gardenTerrariums=[];
    try {const html=renderToStaticMarkup(<MemoryRouter><Dashboard onAddPlant={()=>{}}/></MemoryRouter>);expect(html).toContain("Your Greenhouse ♡");expect(html).toContain("Add your first plant");expect(html).not.toContain("reminder-strip");}
    finally {dashboard.gardenPlants=plants;dashboard.gardenTerrariums=terrariums;}
  });
  it("keeps plant assignments and renders the new jar for every terrarium with its own link", () => {
    const html = renderToStaticMarkup(<MemoryRouter><Garden plants={dashboard.gardenPlants} terrariums={dashboard.gardenTerrariums}/></MemoryRouter>);
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(Array.from(document.querySelectorAll('.garden-item')).map(link=>link.getAttribute('href'))).toEqual([
      ...dashboard.gardenPlants.map(item=>`/plants/${item.id}`),
      ...dashboard.gardenTerrariums.map(item=>`/terrariums/${item.id}`),
    ]);
    const plants = Array.from(document.querySelectorAll(".garden-item.plant"));
    expect(plants).toHaveLength(dashboard.gardenPlants.length);
    plants.forEach((link, index) => {
      const plant = dashboard.gardenPlants[index];
      expect(link.getAttribute("href")).toBe(`/plants/${plant.id}`);
      expect(link.getAttribute("aria-label")).toBe(`Open plant ${plant.name}`);
      expect(link.querySelector("img")?.getAttribute("src")).toBe(getPlantIcon(plant.id, plant.spriteImage));
      expect(link.querySelector("img")?.className).toBe("garden-plant-icon");
    });
    expect(new Set(plants.map(link => link.querySelector("img")?.getAttribute("src"))))
      .toEqual(new Set(PLANT_ICON_IMAGES));
    const terrariums = Array.from(document.querySelectorAll(".garden-item.terrarium"));
    expect(terrariums).toHaveLength(dashboard.gardenTerrariums.length);
    terrariums.forEach((link, index) => {
      const terrarium = dashboard.gardenTerrariums[index];
      expect(link.getAttribute("href")).toBe(`/terrariums/${terrarium.id}`);
      expect(link.getAttribute("aria-label")).toBe(`Open terrarium ${terrarium.name}`);
      expect(link.querySelector("img")?.getAttribute("src")).toBe(getTerrariumIcon(terrarium.id, terrarium.spriteImage));
    });
    expect(new Set(terrariums.map(link => link.querySelector("img")?.getAttribute("src"))))
      .toEqual(new Set(TERRARIUM_ICON_IMAGES));
  });

  it("ships the replacement terrarium as a transparent PNG", () => {
    const image = readFileSync(new FileURL("../public/images/plant-spirit-terrarium.png", import.meta.url));
    expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(image.readUInt32BE(16)).toBeGreaterThan(0);
    expect(image.readUInt32BE(20)).toBeGreaterThan(0);
    expect(image[25]).toBe(6);
  });
  it("gives companion motion a stable pose and timing profile without changing its artwork",()=>{
    const html=renderToStaticMarkup(<><Spirit id="fern" motion="idle"/><Spirit id="fern" motion="idle"/><Spirit id="cloud" kind="terrarium" motion="idle"/></>);
    const document=new DOMParser().parseFromString(html,"text/html"),spirits=Array.from(document.querySelectorAll<HTMLElement>('.spirit'));
    expect(spirits[0].dataset.pose).toMatch(/standing|seated|resting/);expect(spirits[0].dataset.motionProfile).toBe(spirits[1].dataset.motionProfile);
    expect(spirits[0].dataset.motionProfile).toBe(({standing:'sway',seated:'nod',resting:'breathe'} as const)[spirits[0].dataset.pose as 'standing'|'seated'|'resting']);
    expect(spirits[0].getAttribute('style')).toBe(spirits[1].getAttribute('style'));expect(spirits[0].querySelector('img')?.getAttribute('src')).toBe(getPlantIcon('fern'));
    expect(spirits[2].dataset.pose).toBe('terrarium');expect(spirits[2].dataset.motionProfile).toBe('terrarium');expect(spirits[2].classList).toContain('spirit-motion-idle');
  });
  it("adds each plant companion to its growing story card",()=>{
    const recent=dashboard.recentlyUpdated;
    const plant=(id:string,profilePhotoUrl:string|null):Plant=>({id,name:`Story ${id}`,spriteImage:"/images/plant-spirit-moss-seated.png",speciesId:null,speciesCommonName:"Fern",speciesScientificName:"",description:"",dateAcquired:"",source:"",location:"Window",terrariumId:null,terrariumName:null,status:"healthy",profilePhotoId:null,profilePhotoUrl,archivedAt:null,dateOfDeath:"",causeOfDeath:"",finalNotes:"",tags:[],updatedAt:"2026-08-29",createdAt:"2026-08-29"});
    dashboard.recentlyUpdated=[plant("fern",null),plant("moss","/media/moss.jpg")];
    try {
      const html=renderToStaticMarkup(<MemoryRouter><Dashboard onAddPlant={()=>{}}/></MemoryRouter>),document=new DOMParser().parseFromString(html,"text/html");
      const cards=Array.from(document.querySelectorAll('.plant-card'));
      expect(cards).toHaveLength(2);cards.forEach((card,index)=>{const item=dashboard.recentlyUpdated[index],name=card.querySelector('.story-card-name'),spirit=name?.querySelector('.story-card-spirit .spirit');expect(name?.querySelector('h3')?.textContent).toBe(item.name);expect(spirit).not.toBeNull();expect(spirit?.classList).toContain('spirit-small');expect(spirit?.classList).toContain('spirit-motion-still');expect(spirit?.querySelector('img')?.getAttribute('src')).toBe(getPlantIcon(item.id,item.spriteImage));});
      expect(document.querySelector('.placeholder-leaf')).toBeNull();
    } finally {dashboard.recentlyUpdated=recent;}
  });
});

let interactiveRoot:Root|undefined,interactiveHost:HTMLDivElement|undefined;
const gardenPlants=Array.from({length:37},(_,index)=>({id:`garden-${index}`,name:index===0?"A very long and treasured maidenhair fern by the kitchen window":`Plant ${index}`}));
function GardenHarness({count,overlay=false}:{count:number;overlay?:boolean}){
  const position=useRef<GardenViewState|undefined>(undefined),[visible,setVisible]=useState(true);
  return <MemoryRouter><button onClick={()=>setVisible(!visible)}>Toggle garden</button>{visible&&<Garden plants={gardenPlants.slice(0,count)} terrariums={[]} initialState={position.current} onViewStateChange={next=>{position.current=next}}/>}<Modal open={overlay} title="Overlay" onClose={()=>{}}><input/></Modal></MemoryRouter>;
}
async function showGarden(count:number,overlay=false){
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  if(!interactiveRoot){interactiveHost=document.createElement("div");document.body.append(interactiveHost);interactiveRoot=createRoot(interactiveHost)}
  await act(async()=>interactiveRoot!.render(<GardenHarness count={count} overlay={overlay}/>));
}
const gardenButton=(label:string)=>Array.from(interactiveHost!.querySelectorAll<HTMLButtonElement>("button")).find(button=>button.textContent?.trim()===label||button.getAttribute('aria-label')===label)!;
const track=()=>interactiveHost!.querySelector<HTMLUListElement>('.garden-track')!;
const links=()=>Array.from(interactiveHost!.querySelectorAll<HTMLAnchorElement>('li[data-copy="0"] .garden-item'));
const pointer=(type:string,x:number,buttons=1)=>{const event=new MouseEvent(type,{clientX:x,button:0,buttons,bubbles:true,cancelable:true});Object.defineProperties(event,{pointerType:{value:'mouse'},pointerId:{value:1}});return event};
let clock=0,frameId=0,width=400;
let frames=new Map<number,FrameRequestCallback>(),resize:()=>void,intersect:(entries:{isIntersecting:boolean}[])=>void;
async function advance(ms:number,step=16){await act(async()=>{for(let elapsed=0;elapsed<ms;){const delta=Math.min(step,ms-elapsed);clock+=delta;elapsed+=delta;const pending=Array.from(frames.values());frames.clear();pending.forEach(callback=>callback(clock))}})}
async function click(label:string){await act(async()=>gardenButton(label).click())}
async function scroll(left:number){await act(async()=>{track().scrollLeft=left;track().dispatchEvent(new Event('scroll'))})}

describe("endless garden carousel",()=>{
  const originals=new Map<string,PropertyDescriptor|undefined>();
  beforeEach(()=>{
    clock=0;frameId=0;width=400;frames=new Map();
    vi.spyOn(performance,'now').mockImplementation(()=>clock);
    vi.spyOn(document,'hidden','get').mockReturnValue(false);
    vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++frameId,callback);return frameId});
    vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
    vi.stubGlobal('ResizeObserver',class {constructor(callback:()=>void){resize=callback}observe(){}disconnect(){}});
    vi.stubGlobal('IntersectionObserver',class {constructor(callback:typeof intersect){intersect=callback}observe(){}disconnect(){}});
    vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockImplementation(()=>width);
    vi.spyOn(HTMLElement.prototype,'offsetLeft','get').mockImplementation(function(this:HTMLElement){return 24+Array.from(this.parentElement?.children||[]).indexOf(this)*136});
    vi.spyOn(HTMLElement.prototype,'offsetWidth','get').mockReturnValue(124);
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){const left=this.offsetLeft-(this.parentElement?.scrollLeft||0);return {left,right:left+124,width:124,top:0,bottom:100,height:100,x:left,y:0,toJSON(){}}});
    const computed=window.getComputedStyle.bind(window);
    vi.spyOn(window,'getComputedStyle').mockImplementation(element=>element.classList.contains('garden-track')?{paddingLeft:'24px',paddingRight:'24px',columnGap:'12px'} as CSSStyleDeclaration:computed(element));
    for(const [name,value] of Object.entries({scrollTo:function(this:HTMLElement,options:ScrollToOptions){this.scrollLeft=options.left||0},setPointerCapture:vi.fn(),hasPointerCapture:()=>true,releasePointerCapture:vi.fn()})){
      originals.set(name,Object.getOwnPropertyDescriptor(HTMLElement.prototype,name));Object.defineProperty(HTMLElement.prototype,name,{configurable:true,value});
    }
  });
  afterEach(async()=>{
    if(interactiveRoot)await act(async()=>interactiveRoot?.unmount());interactiveHost?.remove();interactiveRoot=undefined;interactiveHost=undefined;
    for(const [name,descriptor] of originals){if(descriptor)Object.defineProperty(HTMLElement.prototype,name,descriptor);else delete (HTMLElement.prototype as any)[name]}originals.clear();
    expect(frames.size).toBe(0);vi.restoreAllMocks();vi.unstubAllGlobals();
  });
  it.each([0,1,6,7,37])("keeps all %i entries reachable once in the accessible sequence",async count=>{
    await showGarden(count);
    const original=links();
    expect(original.map(link=>link.getAttribute('href'))).toEqual(gardenPlants.slice(0,count).map(plant=>`/plants/${plant.id}`));
    expect(new Set(original).size).toBe(count);
    expect(interactiveHost!.querySelector('.garden-pagination')).toBeNull();
    if(count<=1){expect(gardenButton('Pause')).toBeUndefined();return}
    expect(interactiveHost!.querySelectorAll('li[aria-hidden=true]')).toHaveLength(count*2);
    expect(interactiveHost!.querySelectorAll('li[aria-hidden=true] a,li[aria-hidden=true] [tabindex]')).toHaveLength(0);
    const start=track().scrollLeft;
    for(let i=0;i<count;i++){await click('Scroll garden right');await advance(160)}
    expect(track().scrollLeft).toBeCloseTo(start,5);expect(links()).toEqual(original);
    for(let i=0;i<count;i++){await click('Scroll garden left');await advance(160)}
    expect(track().scrollLeft).toBeCloseTo(start,5);
  });
  it("glides at 18px/second after 1.2 seconds without announcements",async()=>{
    await showGarden(7);const start=track().scrollLeft;
    await advance(1200);expect(track().scrollLeft).toBe(start);
    await advance(1000);expect(track().scrollLeft-start).toBeCloseTo(18,5);
    await advance(1000,32);expect(track().scrollLeft-start).toBeCloseTo(36,5);
    expect(interactiveHost!.querySelector('.garden-card [role=status]')?.textContent).toBe('');
  });
  it("keeps the same carousel, logical position, focus and playback preference when appearance changes",async()=>{
    const stop=initializeAppearance();
    try {
      await showGarden(7);await click('Pause');await scroll(7*136+63);
      const original=track(),offset=original.scrollLeft,entries=links(),play=gardenButton('Play');
      await act(async()=>play.focus());
      await act(async()=>{setForestAesthetic(false);setForestAesthetic(true)});await advance(5000);
      expect(track()).toBe(original);expect(track().scrollLeft).toBe(offset);expect(links()).toEqual(entries);
      expect(gardenButton('Play')).toBe(play);expect(document.activeElement).toBe(play);
    } finally {stop();localStorage.removeItem('greenhouse-forest-aesthetic');document.documentElement.removeAttribute('data-forest-aesthetic')}
  });
  it("rebases both seams and restores logical position and pause preference",async()=>{
    await showGarden(7);const period=7*136;
    await scroll(period*2+37);expect(track().scrollLeft).toBe(period+37);
    await scroll(period-17);expect(track().scrollLeft).toBe(period*2-17);
    await click('Pause');await click('Toggle garden');await click('Toggle garden');
    expect(track().scrollLeft).toBeCloseTo(period*2-17);expect(gardenButton('Play')).toBeDefined();
    await showGarden(1);expect(track().scrollLeft).toBe(0);expect(links()[0].textContent).toContain(gardenPlants[0].name);
    await showGarden(7);expect(track().scrollLeft).toBe(period);
  });
  it("rests when all entries fit and recalculates on resize",async()=>{
    width=1200;await showGarden(6);expect(gardenButton('Pause')).toBeUndefined();expect(links()).toHaveLength(6);expect(track().children).toHaveLength(6);
    await act(async()=>{width=400;resize()});expect(gardenButton('Pause')).toBeDefined();
    await click('Scroll garden right');await advance(160);const offset=track().scrollLeft;
    await act(async()=>{width=500;resize()});expect(track().scrollLeft).toBeCloseTo(offset);
    await act(async()=>{width=1200;resize()});expect(track().scrollLeft).toBe(0);expect(track().children).toHaveLength(6);
  });
  it("keeps only the carousel controls beside the collection heading",async()=>{
    await showGarden(7);
    const header=interactiveHost!.querySelector('.garden-card-header')!;
    expect(header.querySelector('.garden-heading-row > .garden-playback')).not.toBeNull();
    expect(header.querySelector('.garden-playback')?.previousElementSibling?.textContent).toBe('All of the sprites in your garden');
    expect(interactiveHost!.querySelector('.garden-controls,.garden-links')).toBeNull();
  });
  it("keeps long names and wraps keyboard focus without remounting entries",async()=>{
    await showGarden(7);expect(links()[0].hasAttribute('title')).toBe(false);
    await act(async()=>{track().focus();track().dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))});expect(document.activeElement).toBe(links()[6]);
    await act(async()=>links()[6].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));expect(document.activeElement).toBe(links()[0]);
    await act(async()=>links()[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));expect(document.activeElement).toBe(links()[6]);
    await act(async()=>links()[6].dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true})));expect(document.activeElement).toBe(links()[0]);
    expect(gardenButton('Play')).toBeDefined();const left=track().scrollLeft;await advance(5000);expect(track().scrollLeft).toBe(left);
  });
  it("pauses on hover, hidden documents, offscreen regions, and overlays without catching up",async()=>{
    await showGarden(7);await advance(2200);const left=track().scrollLeft;
    await act(async()=>interactiveHost!.querySelector('.garden-card')!.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})));await advance(5000);expect(track().scrollLeft).toBe(left);
    await act(async()=>interactiveHost!.querySelector('.garden-card')!.dispatchEvent(new MouseEvent('mouseout',{bubbles:true})));await advance(1000);expect(track().scrollLeft).toBeCloseTo(left+18);
    await act(async()=>intersect([{isIntersecting:false}]));const offscreen=track().scrollLeft;await advance(3000);expect(track().scrollLeft).toBe(offscreen);
    await act(async()=>intersect([{isIntersecting:true}]));
    await act(async()=>{vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'))});await advance(3000);expect(track().scrollLeft).toBe(offscreen);
    await act(async()=>{vi.spyOn(document,'hidden','get').mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'))});
    await showGarden(7,true);await advance(3000);expect(track().scrollLeft).toBe(offscreen);
  });
  it("drags across a seam, suppresses the click, and resumes after the cooldown",async()=>{
    await showGarden(7);const period=7*136;
    await act(async()=>{track().dispatchEvent(pointer('pointerdown',100));track().dispatchEvent(pointer('pointermove',200))});expect(track().scrollLeft).toBe(period*2-100);
    await act(async()=>track().dispatchEvent(pointer('pointermove',220)));expect(track().scrollLeft).toBe(period*2-120);
    await act(async()=>track().dispatchEvent(pointer('pointerup',220)));
    const click=new MouseEvent('click',{bubbles:true,cancelable:true});await act(async()=>links()[0].dispatchEvent(click));expect(click.defaultPrevented).toBe(true);
    const left=track().scrollLeft;await advance(4000);expect(track().scrollLeft).toBe(left);await advance(1000);expect(track().scrollLeft).toBeCloseTo(left+18);
  });
  it("has a stable play control when pointer focus precedes a click",async()=>{
    await showGarden(7);const pause=gardenButton('Pause');
    await act(async()=>{pause.dispatchEvent(pointer('pointerdown',0));pause.focus();pause.dispatchEvent(pointer('pointerup',0));pause.click()});expect(gardenButton('Play')).toBe(pause);
    await act(async()=>{pause.dispatchEvent(pointer('pointerdown',0));pause.click()});expect(gardenButton('Pause')).toBe(pause);expect(document.activeElement).toBe(pause);
  });
  it("runs only canonical sprite idles and pauses them with the garden control",async()=>{
    await showGarden(7);const card=interactiveHost!.querySelector('.garden-card')!;
    expect(card.getAttribute('data-motion')).toBe('running');
    expect(interactiveHost!.querySelectorAll('li[data-copy="0"] .spirit-motion-idle')).toHaveLength(7);
    expect(interactiveHost!.querySelectorAll('li:not([data-copy="0"]) .spirit-motion-idle')).toHaveLength(0);
    await click('Pause');expect(card.getAttribute('data-motion')).toBe('paused');
    await click('Play');expect(card.getAttribute('data-motion')).toBe('running');
  });
  it("disables autoplay under reduced motion but retains immediate manual wrapping",async()=>{
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
    await showGarden(7);const start=track().scrollLeft;await advance(5000);expect(track().scrollLeft).toBe(start);expect(gardenButton('Motion off').disabled).toBe(true);expect(interactiveHost!.querySelector('.garden-card')?.getAttribute('data-motion')).toBe('paused');
    await click('Scroll garden left');expect(track().scrollLeft).toBe(7*136+6*136);
  });
});
