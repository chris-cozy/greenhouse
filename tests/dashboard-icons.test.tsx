// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as FileURL } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard, Garden } from "../src/components/Dashboard";
import { getPlantIcon, PLANT_ICON_IMAGES } from "../src/shared/plantIcons";
import type { DashboardData } from "../src/shared/types";

const dashboard: DashboardData = {
  livingPlants: 32,
  terrariums: 2,
  gardenPlants: Array.from({ length: 32 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    name: `Plant ${index}`,
  })),
  gardenTerrariums: [
    { id: "terrarium-1", name: "Cloud Garden" },
    { id: "terrarium-2", name: "Moss Bowl" },
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
    dashboard.upcomingReminders=[{id:"care",plantId:"plant",plantName:"Fern",activityType:"watering",customLabel:"",guidance:"",cadenceDays:null,reminderEnabled:true,nextReminderDate:"2026-08-30",notes:"",sortOrder:0}];
    try {
      const html=renderToStaticMarkup(<MemoryRouter><Dashboard onAddPlant={()=>{}}/></MemoryRouter>);
      const document=new DOMParser().parseFromString(html,"text/html");
      expect(document.querySelector("h1")?.textContent).toBe("Your greenhouse ♡");
      expect(document.querySelector(".welcome p")?.textContent).toBe("All of the plants under your care");
      expect(document.querySelector(".garden-card h2")?.textContent).toBe("All of the sprites in your garden");
      expect(document.querySelector(".summary-grid")?.nextElementSibling?.className).toBe("reminder-strip");
    } finally {dashboard.upcomingReminders=[];}
  });
  it("retains the same heading and separate onboarding for an empty greenhouse",()=>{
    const plants=dashboard.gardenPlants,terrariums=dashboard.gardenTerrariums;
    dashboard.gardenPlants=[];dashboard.gardenTerrariums=[];
    try {const html=renderToStaticMarkup(<MemoryRouter><Dashboard onAddPlant={()=>{}}/></MemoryRouter>);expect(html).toContain("Your greenhouse ♡");expect(html).toContain("Add your first plant");expect(html).not.toContain("reminder-strip");}
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
      expect(link.querySelector("img")?.getAttribute("src")).toBe(getPlantIcon(plant.id));
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
      expect(link.querySelector("img")?.getAttribute("src")).toBe("/images/plant-spirit-terrarium.png");
    });
  });

  it("ships the replacement terrarium as a transparent PNG", () => {
    const image = readFileSync(new FileURL("../public/images/plant-spirit-terrarium.png", import.meta.url));
    expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(image.readUInt32BE(16)).toBeGreaterThan(0);
    expect(image.readUInt32BE(20)).toBeGreaterThan(0);
    expect(image[25]).toBe(6);
  });
});

let interactiveRoot:Root|undefined,interactiveHost:HTMLDivElement|undefined;
afterEach(async()=>{if(interactiveRoot)await act(async()=>interactiveRoot?.unmount());interactiveHost?.remove();interactiveRoot=undefined;interactiveHost=undefined;vi.restoreAllMocks();vi.unstubAllGlobals()});
const gardenPlants=Array.from({length:37},(_,index)=>({id:`garden-${index}`,name:index===0?"A very long and treasured maidenhair fern by the kitchen window":`Plant ${index}`}));
function GardenHarness({count}:{count:number}){
  const position=useRef(0),[visible,setVisible]=useState(true);
  return <MemoryRouter><button onClick={()=>setVisible(!visible)}>Toggle garden</button>{visible&&<Garden plants={gardenPlants.slice(0,count)} terrariums={[]} initialScroll={position.current} onScrollPositionChange={next=>{position.current=next}}/>}</MemoryRouter>;
}
async function showGarden(count:number){
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  if(!interactiveRoot){interactiveHost=document.createElement("div");document.body.append(interactiveHost);interactiveRoot=createRoot(interactiveHost)}
  await act(async()=>interactiveRoot!.render(<GardenHarness count={count}/>));
}
const gardenButton=(label:string)=>Array.from(interactiveHost!.querySelectorAll<HTMLButtonElement>("button")).find(button=>button.textContent?.trim()===label||button.getAttribute('aria-label')===label)!;
const track=()=>interactiveHost!.querySelector<HTMLUListElement>('.garden-track')!;
const links=()=>Array.from(interactiveHost!.querySelectorAll<HTMLAnchorElement>('.garden-item'));

describe("rolling garden carousel",()=>{
  const scrollTo=vi.fn(function(this:HTMLElement,options:ScrollToOptions){this.scrollLeft=options.left||0;this.dispatchEvent(new Event('scroll'))});
  const originals=new Map<string,PropertyDescriptor|undefined>();
  beforeEach(()=>{
    vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype,'scrollWidth','get').mockImplementation(function(this:HTMLElement){return Math.max(400,this.children.length*136-12+48)});
    vi.spyOn(HTMLElement.prototype,'offsetLeft','get').mockImplementation(function(this:HTMLElement){return 24+Array.from(this.parentElement?.children||[]).indexOf(this)*136});
    vi.spyOn(HTMLElement.prototype,'offsetWidth','get').mockReturnValue(124);
    for(const [name,value] of Object.entries({scrollTo,setPointerCapture:vi.fn(),hasPointerCapture:()=>true,releasePointerCapture:vi.fn()})){
      originals.set(name,Object.getOwnPropertyDescriptor(HTMLElement.prototype,name));Object.defineProperty(HTMLElement.prototype,name,{configurable:true,value});
    }
    scrollTo.mockClear();
  });
  afterEach(()=>{for(const [name,descriptor] of originals){if(descriptor)Object.defineProperty(HTMLElement.prototype,name,descriptor);else delete (HTMLElement.prototype as any)[name]}originals.clear()});
  it.each([0,1,6,7,37])("keeps all %i entries in one row without cloned companions or page replacements",async count=>{
    await showGarden(count);
    const original=links(),seen=original.map(link=>link.getAttribute('href'));
    expect(seen).toEqual(gardenPlants.slice(0,count).map(plant=>`/plants/${plant.id}`));
    expect(new Set(seen).size).toBe(count);
    expect(interactiveHost!.querySelector('.garden-pagination')).toBeNull();
    if(count<=1){expect(gardenButton('Scroll garden right')).toBeUndefined();return}
    expect(gardenButton('Scroll garden left').disabled).toBe(true);
    while(!gardenButton('Scroll garden right').disabled)await act(async()=>gardenButton('Scroll garden right').click());
    expect(track().scrollLeft).toBe(track().scrollWidth-track().clientWidth);
    expect(links()).toEqual(original);
    expect(interactiveHost!.textContent).toContain(`of ${count} companions`);
    while(!gardenButton('Scroll garden left').disabled)await act(async()=>gardenButton('Scroll garden left').click());
    expect(track().scrollLeft).toBe(0);
  });
  it("rolls one companion at a time and retains its position across navigation, then clamps after removal",async()=>{
    await showGarden(37);
    expect(interactiveHost!.textContent).toContain('1–3 of 37 companions');
    await act(async()=>gardenButton('Scroll garden right').click());
    expect(track().scrollLeft).toBe(136);
    expect(interactiveHost!.textContent).toContain('2–4 of 37 companions');
    await act(async()=>gardenButton("Toggle garden").click());
    await act(async()=>gardenButton("Toggle garden").click());
    expect(track().scrollLeft).toBe(136);
    await showGarden(1);
    expect(interactiveHost!.querySelector('.garden-item-label')?.textContent).toBe(gardenPlants[0].name);
    expect(track().scrollLeft).toBe(0);expect(gardenButton('Scroll garden right')).toBeUndefined();
    await showGarden(37);
    expect(track().scrollLeft).toBe(0);
  });
  it("keeps long names visible and lets the keyboard reach both ends",async()=>{
    await showGarden(37);
    expect(links()[0].querySelector('.garden-item-label')?.textContent).toBe(gardenPlants[0].name);
    expect(links()[0].hasAttribute('title')).toBe(false);
    expect(track().tabIndex).toBe(0);
    await act(async()=>{track().focus();track().dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))});
    expect(document.activeElement).toBe(links()[36]);expect(track().scrollLeft).toBeGreaterThan(4400);
    await act(async()=>links()[36].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));
    expect(document.activeElement).toBe(links()[35]);
    await act(async()=>links()[35].dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true})));
    expect(document.activeElement).toBe(links()[0]);
  });
  it("uses immediate scrolling when reduced motion is requested",async()=>{
    vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
    await showGarden(7);await act(async()=>gardenButton('Scroll garden right').click());
    expect(scrollTo).toHaveBeenLastCalledWith({left:136,behavior:'auto'});
  });
  it("supports mouse dragging without accidentally opening the dragged companion",async()=>{
    await showGarden(7);
    const pointer=(type:string,x:number,buttons=1)=>{const event=new MouseEvent(type,{clientX:x,button:0,buttons,bubbles:true,cancelable:true});Object.defineProperties(event,{pointerType:{value:'mouse'},pointerId:{value:1}});return event};
    await act(async()=>{track().dispatchEvent(pointer('pointerdown',220));track().dispatchEvent(pointer('pointermove',120));track().dispatchEvent(pointer('pointerup',120))});
    expect(track().scrollLeft).toBe(100);expect(track().classList.contains('is-dragging')).toBe(false);
    const click=new MouseEvent('click',{bubbles:true,cancelable:true});await act(async()=>{links()[0].dispatchEvent(click)});expect(click.defaultPrevented).toBe(true);
    await act(async()=>{track().dispatchEvent(pointer('pointerdown',220));track().dispatchEvent(pointer('pointermove',120,0))});
    expect(track().scrollLeft).toBe(100);expect(track().classList.contains('is-dragging')).toBe(false);
  });
});
