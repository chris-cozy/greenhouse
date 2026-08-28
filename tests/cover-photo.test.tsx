// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoverPhotoControl, MakeCoverButton } from "../src/components/CoverPhoto";
import { api } from "../src/api";
import type { Photo } from "../src/shared/types";

vi.mock("../src/api",()=>({api:{post:vi.fn()}}));
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.useFakeTimers();(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement("div");document.body.append(host);root=createRoot(host);vi.mocked(api.post).mockReset()});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers()});
const photo=(id:string):Photo=>({id,plantId:"fern",terrariumId:null,url:`/media/${id}.jpg`,originalName:`${id}.jpg`,mimeType:"image/jpeg",sizeBytes:100,dateTaken:"2026-08-27",caption:id,tags:[],createdAt:"2026-08-27T12:00:00Z"});
const button=(label:string)=>host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

describe("cover photo controls",()=>{
  it("identifies the current cover, prevents concurrent choices, and retries failed saves",async()=>{
    const onSaved=vi.fn();let reject!:(error:Error)=>void;
    vi.mocked(api.post).mockImplementationOnce(()=>new Promise((_resolve,no)=>{reject=no}));
    await act(async()=>root.render(<CoverPhotoControl kind="plant" id="fern" photos={[photo("First"),photo("Second")]} currentId="First" onSaved={onSaved}/>));
    await act(async()=>host.querySelector<HTMLButtonElement>("button")!.click());expect(button("Current cover: First").disabled).toBe(true);
    await act(async()=>button("Choose cover: Second").click());expect(button("Choose cover: Second").disabled).toBe(true);expect(host.textContent).toContain("Saving…");
    await act(async()=>reject(new Error("Could not save. Try again.")));expect(host.textContent).toContain("Could not save. Try again.");expect(onSaved).not.toHaveBeenCalled();
    vi.mocked(api.post).mockResolvedValueOnce({});await act(async()=>button("Choose cover: Second").click());
    expect(api.post).toHaveBeenLastCalledWith("/api/plants/fern/profile-photo",{photoId:"Second"});expect(onSaved).toHaveBeenCalledOnce();
    expect(host.querySelector('.modal-backdrop')?.classList.contains('is-exiting')).toBe(true);
    await act(async()=>vi.advanceTimersByTime(120));expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it("keeps the terrarium gallery action connected to the existing cover endpoint",async()=>{
    const onSaved=vi.fn();vi.mocked(api.post).mockResolvedValueOnce({});
    await act(async()=>root.render(<MakeCoverButton kind="terrarium" id="jar" photoId="photo" onSaved={onSaved}/>));
    await act(async()=>host.querySelector<HTMLButtonElement>("button")!.click());
    expect(api.post).toHaveBeenCalledWith("/api/terrariums/jar/cover-photo",{photoId:"photo"});expect(onSaved).toHaveBeenCalledOnce();
  });
});
