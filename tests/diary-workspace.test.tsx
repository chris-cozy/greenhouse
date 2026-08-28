// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JournalWorkspace } from "../src/journal/JournalWorkspace";
import { ApiError, api } from "../src/api";
import { draftKey, draftOf } from "../src/journal/Autosave";
import type { JournalEntry } from "../src/shared/types";

vi.mock("../src/api",async original=>({...await original<typeof import("../src/api")>(),api:{get:vi.fn(),put:vi.fn(),post:vi.fn(),delete:vi.fn()}}));
// Keep these tests about navigation/lifecycle; the real editor has separate round-trip and browser checks.
vi.mock("../src/journal/RichEditor",async()=>{
  const {forwardRef,useImperativeHandle}=await import("react");
  return {RichEditor:forwardRef(function TestEditor({content,onChange}:{content:string;onChange:(text:string)=>void},ref){useImperativeHandle(ref,()=>({settle:async()=>{}}));return <textarea aria-label="Test document" defaultValue={content} onChange={event=>onChange(event.target.value)}/>})};
});
const base:JournalEntry={id:"one",title:"First entry",content:"Original",tags:[],plantIds:[],terrariumIds:[],createdAt:"2026-08-27T10:00:00.000Z",updatedAt:"2026-08-27T10:00:00.000Z",recordedAt:"2026-08-27T10:00:00.000Z",entryDate:"2026-08-27",revision:1};
let root:Root,host:HTMLDivElement,router:ReturnType<typeof createMemoryRouter>,records:JournalEntry[];
beforeEach(()=>{
  // Node's Request rejects jsdom's AbortSignal; these routes have no network loaders to cancel.
  vi.stubGlobal("Request",class extends Request{constructor(input:RequestInfo|URL,init?:RequestInit){super(input,{...init,signal:undefined})}});
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();vi.clearAllMocks();records=[{...base},{...base,id:"two",title:"Second entry"}];
  vi.mocked(api.get).mockImplementation(async path=>{if(path==="/api/journal")return records as any;if(path.startsWith("/api/journal/")){const entry=records.find(e=>path.endsWith(`/${e.id}`));if(!entry)throw new ApiError("Journal entry not found.",404);return entry as any}return [] as any});
  vi.mocked(api.put).mockImplementation(async(path,payload:any)=>{const index=records.findIndex(e=>path.endsWith(`/${e.id}`));records[index]={...records[index],...payload,revision:records[index].revision+1};return records[index] as any});
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());router?.dispose();host.remove();localStorage.clear();vi.unstubAllGlobals()});
async function open(path="/journal/one"){
  router=createMemoryRouter([{path:"/journal/:id?",element:<JournalWorkspace options={{species:[],terrariums:[],tags:[]}} refreshOptions={()=>{}}/>},{path:"/plants",element:<p>Plant collection</p>}],{initialEntries:[path]});
  await act(async()=>root.render(<StrictMode><RouterProvider router={router}/></StrictMode>));
}
async function title(value:string){await act(async()=>{const input=host.querySelector<HTMLInputElement>('[aria-label="Entry title"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}))})}
async function click(label:string){await act(async()=>{Array.from(host.querySelectorAll("button")).find(button=>button.textContent===label)!.click()})}

describe("diary workspace navigation",()=>{
  it("keeps the same editor and selection while the index becomes a drawer",async()=>{
    let width=1200;const size=vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockImplementation(()=>width);
    try {
      await open();const editor=host.querySelector<HTMLTextAreaElement>('[aria-label="Test document"]')!;editor.focus();editor.setSelectionRange(2,5);
      await act(async()=>{width=390;window.dispatchEvent(new Event('resize'))});await act(async()=>host.querySelector<HTMLButtonElement>('.diary-list-toggle')!.click());
      expect(host.querySelector('[aria-label="Test document"]')).toBe(editor);expect(editor.selectionStart).toBe(2);expect(editor.selectionEnd).toBe(5);
      await act(async()=>{width=1200;window.dispatchEvent(new Event('resize'))});expect(host.querySelector('[aria-label="Test document"]')).toBe(editor);expect(api.put).not.toHaveBeenCalled();
    } finally {size.mockRestore()}
  });
  it("opens unchanged under Strict Mode and flushes before switching entries",async()=>{
    await open();expect(api.put).not.toHaveBeenCalled();await title("Just typed");
    await act(async()=>{await router.navigate("/journal/two")});
    expect(api.put).toHaveBeenCalledTimes(1);expect(records[0].title).toBe("Just typed");expect(router.state.location.pathname).toBe("/journal/two");expect(host.querySelector<HTMLInputElement>('[aria-label="Entry title"]')?.value).toBe("Second entry");
  });
  it("keeps failed navigation in place, retains recovery, and retries without losing edits",async()=>{
    await open();vi.mocked(api.put).mockRejectedValueOnce(new Error("Offline"));await title("Keep my writing");
    await act(async()=>{await router.navigate("/plants")});expect(router.state.location.pathname).toBe("/journal/one");expect(localStorage.getItem(draftKey("one"))).toContain("Keep my writing");
    expect(host.textContent).toContain("Offline");await click("Keep writing");await click("Retry save");expect(records[0].title).toBe("Keep my writing");expect(localStorage.getItem(draftKey("one"))).toBeNull();
    await act(async()=>{await router.navigate("/plants")});expect(host.textContent).toBe("Plant collection");
  });
  it("opens a deleted entry's local recovery and offers saving a new copy",async()=>{
    records=records.filter(e=>e.id!=="one");localStorage.setItem(draftKey("one"),JSON.stringify({revision:1,draft:{...draftOf(base),content:"Recovered observation"}}));await open();
    expect(host.textContent).toContain("deleted elsewhere");expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Test document"]')?.value).toBe("Recovered observation");expect(host.textContent).toContain("Save draft as new entry");expect(api.put).not.toHaveBeenCalled();
    let finish!:(entry:JournalEntry)=>void;vi.mocked(api.post).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve as typeof finish}));
    await click("Save draft as new entry");expect(host.querySelector(".diary-writing-column")?.hasAttribute("inert")).toBe(true);
    const copy={...base,id:"copy",content:"Recovered observation"};records.push(copy);await act(async()=>finish(copy));expect(router.state.location.pathname).toBe("/journal/copy");expect(localStorage.getItem(draftKey("one"))).toBeNull();
  });
  it("retries a failed entry load without getting stuck on the loading screen",async()=>{
    const original=vi.mocked(api.get).getMockImplementation()!;let fail=true;
    vi.mocked(api.get).mockImplementation(async path=>{if(path==="/api/journal/one"&&fail)throw new Error("Temporary read failure");return original(path)});
    await open();expect(host.textContent).toContain("Temporary read failure");fail=false;await click("Refresh diary");expect(host.querySelector<HTMLInputElement>('[aria-label="Entry title"]')?.value).toBe("First entry");
  });
  it("preserves timestamp precision on unchanged date submissions and saves creation edits",async()=>{
    records[0]={...base,createdAt:"2026-08-27T10:00:42.123Z"};await open();
    await act(async()=>host.querySelector<HTMLButtonElement>(".created-date")!.click());await click("Save creation date");expect(api.put).not.toHaveBeenCalled();
    await act(async()=>host.querySelector<HTMLButtonElement>(".created-date")!.click());
    await act(async()=>{const input=host.querySelector<HTMLInputElement>('input[type="datetime-local"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"2020-04-03T14:30");input.dispatchEvent(new Event("input",{bubbles:true}))});
    await click("Save creation date");await act(async()=>{await router.navigate("/plants")});
    expect(records[0].createdAt).toBe(new Date("2020-04-03T14:30").toISOString());expect(records[0].recordedAt).toBe(base.recordedAt);
  });
  it("locks the previous document while creating and does not redirect after leaving",async()=>{
    await open();let finish!:(entry:JournalEntry)=>void;vi.mocked(api.post).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve as typeof finish}));
    await act(async()=>host.querySelector<HTMLButtonElement>(".diary-heading .primary")!.click());expect(host.querySelector(".diary-document")?.hasAttribute("inert")).toBe(true);
    expect(api.post).toHaveBeenCalledWith("/api/journal",expect.objectContaining({title:"Untitled entry",content:""}));
    await act(async()=>{await router.navigate("/plants")});await act(async()=>finish({...base,id:"new"}));expect(router.state.location.pathname).toBe("/plants");
  });
});
