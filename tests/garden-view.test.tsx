// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Garden, GARDEN_VIEW_KEY, type GardenViewState } from "../src/components/Garden";

vi.mock("../src/components/GardenScene", () => ({ default: (props: any) => <div data-testid="scene" data-running={String(props.running)} data-count={props.items.length} data-selected={props.selected}><button onClick={props.onError}>Lose context</button><button onClick={() => props.onCamera({x:2,z:1,zoom:1.4})}>Move camera</button></div>, clearGardenAssets: vi.fn() }));
let root: Root, host: HTMLDivElement, desktop: boolean, reduced: boolean, mediaChange: () => void, saved: GardenViewState | undefined;
const plants = Array.from({length:100}, (_, i) => ({id:`p${i}`, name:i===99?"A treasured plant with a particularly long name":"Plant " + i, spriteImage:""}));
const mount = (count=25, initialState?:GardenViewState) => act(async () => root.render(<MemoryRouter><Garden plants={plants.slice(0,count)} terrariums={[]} initialState={initialState} onViewStateChange={next=>{saved=next}}/></MemoryRouter>));
const button = (name:string) => Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(item=>item.textContent?.trim()===name||item.getAttribute("aria-label")===name)!;
const click = (name:string) => act(async()=>button(name).click());
beforeEach(()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true; desktop=true; reduced=false; saved=undefined; localStorage.clear();
  vi.stubGlobal("matchMedia", (query:string)=>({get matches(){return query.includes("min-width")?desktop:reduced}, addEventListener:(_name:string, callback:()=>void)=>{if(query.includes("min-width"))mediaChange=callback},removeEventListener:vi.fn()}));
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();vi.restoreAllMocks();localStorage.clear()});
describe("garden view",()=>{
  it("limits the scene to a plot and exposes every companion once through profile links",async()=>{
    await mount(100);expect(host.querySelector('[data-testid=scene]')?.getAttribute('data-count')).toBe('24');
    expect(host.querySelectorAll('.garden-finder li')).toHaveLength(100);
    expect(new Set(Array.from(host.querySelectorAll('.garden-finder li a')).map(item=>item.getAttribute('href'))).size).toBe(100);
    await click('Next garden plot');expect(host.textContent).toContain('Plot 2 of 5');await click('Previous garden plot');expect(host.textContent).toContain('Plot 1 of 5');
    await act(async()=>host.querySelectorAll<HTMLButtonElement>('.garden-finder li button')[99].click());
    expect(host.textContent).toContain('Plot 5 of 5');expect(host.querySelector('.garden-selected strong')?.textContent).toBe(plants[99].name);
    expect(host.querySelector('.garden-selected a')?.getAttribute('href')).toBe('/plants/p99');
    await act(async()=>host.querySelector('.garden-home')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(host.querySelector('.garden-selected')).toBeNull();
  });
  it("pauses motion, saves camera state and restores the view on navigation",async()=>{
    await mount();await click('Pause');await click('Move camera');expect(saved?.paused).toBe(true);expect(saved?.camera).toEqual({x:2,z:1,zoom:1.4});
    const snapshot=saved;await act(async()=>root.render(<div/>));await mount(25,snapshot);
    expect(button('Play')).toBeDefined();expect(saved?.camera).toEqual(snapshot?.camera);await click('Reset view');expect(saved?.camera).toEqual({x:0,z:0,zoom:1});
  });
  it("keeps all companions reachable after a renderer failure",async()=>{
    await mount();await click('Lose context');expect(host.textContent).toContain('couldn’t load');expect(host.querySelectorAll('li[data-copy="0"] a')).toHaveLength(25);
    await click('Retry garden');expect(host.querySelector('[data-testid=scene]')).not.toBeNull();
  });
  it("persists list preference without requiring browser storage",async()=>{
    await mount();await click('List');expect(localStorage.getItem(GARDEN_VIEW_KEY)).toBe('list');expect(host.querySelector('[data-testid=scene]')).toBeNull();
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked')});await click('Garden');expect(host.querySelector('[data-testid=scene]')).not.toBeNull();
  });
  it("does not mount 3D on mobile or with an empty collection",async()=>{
    desktop=false;await mount();expect(host.querySelector('[data-testid=scene]')).toBeNull();
    desktop=true;await act(async()=>mediaChange());expect(host.querySelector('[data-testid=scene]')).not.toBeNull();
    await mount(0);expect(host.querySelector('[data-testid=scene]')).toBeNull();expect(host.textContent).toContain('Add a plant or terrarium');
  });
  it("disables motion under reduced motion and keeps manual camera controls",async()=>{
    reduced=true;await mount();expect(button('Motion off').disabled).toBe(true);expect(host.querySelector('[data-testid=scene]')?.getAttribute('data-running')).toBe('false');await click('Zoom in');expect(saved?.camera.zoom).toBe(1.2);
  });
});
