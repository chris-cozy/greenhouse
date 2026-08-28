// @vitest-environment jsdom
import { act, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/api";
import { useLoad } from "../src/components/useLoad";
import { Modal } from "../src/components/Common";

vi.mock("../src/api",()=>({api:{get:vi.fn()}}));
let host:HTMLDivElement,root:Root,reader:ReturnType<typeof useLoad<{name:string}>>;
const deferred=<T,>()=>{let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
beforeEach(()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals()});
function Reader({path}:{path:string|null}){reader=useLoad<{name:string}>(path);return <div data-testid="content">{reader.data?.name||"Loading"}</div>}
async function read(path:string|null="/one"){await act(async()=>root.render(<StrictMode><Reader path={path}/></StrictMode>))}

describe("resource refresh lifecycle",()=>{
  it("skips disabled resources and ignores an in-flight read when disabled",async()=>{
    await read(null);expect(api.get).not.toHaveBeenCalled();expect(reader.loading).toBe(false);
    const pending=deferred<{name:string}>();vi.mocked(api.get).mockReturnValue(pending.promise);await read("/one");expect(reader.loading).toBe(true);
    await read(null);await act(async()=>pending.resolve({name:"Late"}));expect(reader.data).toBeNull();expect(reader.loading).toBe(false);
    const count=vi.mocked(api.get).mock.calls.length;await act(async()=>{await reader.reload()});expect(api.get).toHaveBeenCalledTimes(count);
  });
  it("preserves mounted content during a background refresh",async()=>{
    vi.mocked(api.get).mockResolvedValueOnce({name:"Original"}).mockResolvedValueOnce({name:"Original"});await read();
    const content=host.firstElementChild,pending=deferred<{name:string}>();vi.mocked(api.get).mockReturnValueOnce(pending.promise);
    await act(async()=>{void reader.reload({background:true})});
    expect(reader.loading).toBe(false);expect(reader.refreshing).toBe(true);expect(host.textContent).toBe("Original");
    await act(async()=>pending.resolve({name:"Updated"}));expect(reader.refreshing).toBe(false);expect(host.firstElementChild).toBe(content);expect(host.textContent).toBe("Updated");
  });
  it("keeps a refresh failure separate and retries only the read",async()=>{
    vi.mocked(api.get).mockResolvedValue({name:"Saved plant"});await read();
    vi.mocked(api.get).mockRejectedValueOnce(new Error("Temporary read failure"));
    await act(async()=>{await reader.reload({background:true})});
    expect(reader.error).toBe("");expect(reader.refreshError).toBe("Temporary read failure");expect(host.textContent).toBe("Saved plant");
    await act(async()=>{await reader.reload({background:true})});expect(reader.refreshError).toBe("");
  });
  it("does not expose a previous resource or accept late responses after navigation",async()=>{
    vi.mocked(api.get).mockResolvedValue({name:"One"});await read();
    const old=deferred<{name:string}>(),next=deferred<{name:string}>();vi.mocked(api.get).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    await act(async()=>{void reader.reload({background:true})});await read("/two");
    expect(reader.data).toBeNull();expect(reader.loading).toBe(true);expect(host.textContent).toBe("Loading");
    await act(async()=>old.resolve({name:"Stale one"}));expect(reader.data).toBeNull();
    await act(async()=>next.resolve({name:"Two"}));expect(host.textContent).toBe("Two");
  });
  it("ignores superseded refresh successes and failures",async()=>{
    vi.mocked(api.get).mockResolvedValue({name:"Original"});await read();
    const first=deferred<{name:string}>(),last=deferred<{name:string}>();vi.mocked(api.get).mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
    await act(async()=>{void reader.reload({background:true});void reader.reload({background:true})});
    await act(async()=>last.resolve({name:"Latest"}));await act(async()=>first.reject(new Error("Old failure")));
    expect(host.textContent).toBe("Latest");expect(reader.refreshError).toBe("");
  });
  it("uses the initial error state without cached data and clears it on retry",async()=>{
    vi.mocked(api.get).mockRejectedValue(new Error("Offline"));await read();expect(reader.error).toBe("Offline");expect(reader.loading).toBe(false);
    vi.mocked(api.get).mockResolvedValue({name:"Recovered"});await act(async()=>{await reader.reload({background:true})});
    expect(reader.error).toBe("");expect(reader.refreshError).toBe("");expect(host.textContent).toBe("Recovered");
  });
});

function DialogHarness({busy=false}:{busy?:boolean}){
  const [open,setOpen]=useState(false);
  return <><button onClick={()=>setOpen(true)}>Open</button><Modal open={open} busy={busy} title="Test dialog" onClose={()=>setOpen(false)}><input aria-label="Name"/><button onClick={()=>setOpen(false)}>Done</button></Modal></>;
}
async function openDialog(busy=false){
  await act(async()=>root.render(<DialogHarness busy={busy}/>));
  const trigger=host.querySelector<HTMLButtonElement>('button')!;trigger.focus();await act(async()=>trigger.click());return trigger;
}
describe("controlled dialog presence",()=>{
  it("keeps the replacement dialog focused and scroll locked while the first exits",async()=>{
    vi.useFakeTimers();
    function Replace(){const [first,setFirst]=useState(false),[second,setSecond]=useState(false);return <><button onClick={()=>setFirst(true)}>Open first</button><Modal open={first} title="First" onClose={()=>setFirst(false)}><button onClick={()=>{setFirst(false);setSecond(true)}}>Next dialog</button></Modal><Modal open={second} title="Second" onClose={()=>setSecond(false)}><input aria-label="Second input"/></Modal></>}
    await act(async()=>root.render(<Replace/>));await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Next dialog')!.click());
    await act(async()=>vi.advanceTimersByTime(120));expect(document.activeElement).toBe(host.querySelector('input'));expect(document.body.style.overflow).toBe('hidden');
    await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await act(async()=>vi.advanceTimersByTime(120));expect(document.body.style.overflow).not.toBe('hidden');
  });
  it("keeps contents during exit then restores focus and scroll",async()=>{
    vi.useFakeTimers();const trigger=await openDialog();const input=host.querySelector<HTMLInputElement>('input')!;
    input.value="Still here";expect(document.body.style.overflow).toBe("hidden");
    await act(async()=>window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
    expect(host.querySelector('input')).toBe(input);expect(input.value).toBe("Still here");expect(host.querySelector('.is-exiting')).not.toBeNull();
    await act(async()=>vi.advanceTimersByTime(120));expect(host.querySelector('[role="dialog"]')).toBeNull();expect(document.activeElement).toBe(trigger);expect(document.body.style.overflow).not.toBe("hidden");
  });
  it("honors reduced motion with immediate removal",async()=>{
    vi.stubGlobal("matchMedia",vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
    const trigger=await openDialog();await act(async()=>window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
    expect(host.querySelector('[role="dialog"]')).toBeNull();expect(document.activeElement).toBe(trigger);
  });
  it("cannot submit retained form content again during exit",async()=>{
    vi.useFakeTimers();const submit=vi.fn();
    const render=(open:boolean)=>root.render(<Modal open={open} title="Save" onClose={()=>{}}><form onSubmit={submit}><input/><button>Save</button></form></Modal>);
    await act(async()=>render(true));await act(async()=>render(false));
    const event=new Event("submit",{bubbles:true,cancelable:true});
    await act(async()=>host.querySelector('form')!.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);expect(submit).not.toHaveBeenCalled();
  });
  it("restores the opener even when a legacy child uses autoFocus",async()=>{
    vi.useFakeTimers();
    function Form(){const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Open</button><Modal open={open} title="Autofocus" onClose={()=>setOpen(false)}><input autoFocus/></Modal></>}
    await act(async()=>root.render(<Form/>));const trigger=host.querySelector('button')!;trigger.focus();
    await act(async()=>trigger.click());expect(document.activeElement).toBe(host.querySelector('input'));
    await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    await act(async()=>vi.advanceTimersByTime(120));expect(document.activeElement).toBe(trigger);
  });
  it("blocks Escape and backdrop dismissal while a write is pending",async()=>{
    await openDialog(true);
    await act(async()=>{window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));host.querySelector('.modal-backdrop')!.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))});
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();expect(host.querySelector('.is-exiting')).toBeNull();expect(host.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.disabled).toBe(true);
  });
  it("traps Tab in both directions",async()=>{
    vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{width:10,height:10}] as any);
    await openDialog();const close=host.querySelector<HTMLButtonElement>('[aria-label="Close"]')!,done=Array.from(host.querySelectorAll('button')).find(button=>button.textContent==="Done")!;
    done.focus();await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));expect(document.activeElement).toBe(close);
    close.focus();await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true})));expect(document.activeElement).toBe(done);
  });
  it("skips fields in collapsed details even if the browser retains their geometry",async()=>{
    vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{width:10,height:10}] as any);
    await act(async()=>root.render(<Modal title="Details" onClose={()=>{}}><input aria-label="Name"/><details><summary tabIndex={0}>More details</summary><input aria-label="Hidden field"/></details><button>Save</button></Modal>));
    const tab=()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
    await act(async()=>tab());expect(document.activeElement).toBe(host.querySelector('summary'));
    await act(async()=>tab());expect(document.activeElement?.textContent).toBe('Save');
    await act(async()=>tab());expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');
  });
});
