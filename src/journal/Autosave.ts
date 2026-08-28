import { ApiError } from "../api";
import type { JournalEntry } from "../shared/types";
import { localDateKey } from "../shared/journal";

export type SaveState = "saved" | "unsaved" | "saving" | "error" | "conflict";
export type JournalDraft = Pick<JournalEntry,"title"|"content"|"tags"|"plantIds"|"terrariumIds"|"createdAt">;
export type SaveSnapshot = {entry: JournalEntry; state: SaveState; error: string; recovered: boolean; storageWarning: string};
type DraftStorage = Pick<Storage,"getItem"|"setItem"|"removeItem">;
export const draftKey = (id: string) => `greenhouse-diary-draft:${id}`;
export const draftOf = (entry: JournalEntry): JournalDraft => ({title:entry.title,content:entry.content,tags:[...entry.tags],plantIds:[...entry.plantIds],terrariumIds:[...entry.terrariumIds],createdAt:entry.createdAt});
function validDraft(draft:JournalDraft|undefined):draft is JournalDraft {
  return !!draft && typeof draft.content === "string" && typeof draft.title === "string" && typeof draft.createdAt === "string" && Number.isFinite(Date.parse(draft.createdAt)) && [draft.tags,draft.plantIds,draft.terrariumIds].every(a=>Array.isArray(a)&&a.every(x=>typeof x==="string"));
}
/** A deleted server record must not make a browser recovery draft unreachable after a reload. */
export function deletedEntryRecovery(id:string,storage:DraftStorage):JournalEntry|null {
  try {
    const raw=storage.getItem(draftKey(id));if(!raw)return null;
    const recovery=JSON.parse(raw);if(!validDraft(recovery.draft))return null;
    const draft=recovery.draft as JournalDraft;
    const timestamp=(value:unknown)=>typeof value==="string"&&Number.isFinite(Date.parse(value))?value:draft.createdAt;
    return {id,...draft,entryDate:localDateKey(draft.createdAt),recordedAt:timestamp(recovery.recordedAt),updatedAt:timestamp(recovery.updatedAt),revision:0};
  } catch {return null;}
}

/** Owns one entry's ordered writes. UI updates never replace a newer draft with a stale response. */
export class Autosave {
  snapshot: SaveSnapshot;
  private generation = 0;
  private committed = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private flight?: Promise<boolean>;
  private stopped = false;
  private subscribers = new Set<() => void>();
  constructor(entry: JournalEntry, private save: (entry: JournalDraft & {expectedRevision:number;timezoneOffset:number}) => Promise<JournalEntry>, private storage?: DraftStorage, private onSaved?: (entry:JournalEntry)=>void) {
    this.snapshot = {entry, state:"saved", error:"", recovered:false, storageWarning:storage?"":"Browser recovery storage is unavailable. Keep this page open until your changes are saved."};
    try {
      const raw = storage?.getItem(draftKey(entry.id));
      if (raw) {
        const recovery = JSON.parse(raw);
        const draft = recovery.draft as JournalDraft;
        if (validDraft(draft)) {
          this.generation = 1;
          const matches=entry.revision>0&&recovery.revision===entry.revision;
          this.snapshot = {...this.snapshot,entry:{...entry,...draft},recovered:true,state:matches?"unsaved":"conflict",error:matches?"":entry.revision===0?"This entry was deleted elsewhere. Your recovery draft is safe; save it as a new entry.":"The saved entry changed while this recovery draft was pending."};
        }
      }
    } catch { this.snapshot.storageWarning = "Browser recovery storage is unavailable. Keep this page open until your changes are saved."; }
  }
  get dirty() { return this.generation !== this.committed; }
  subscribe = (listener:()=>void) => { this.subscribers.add(listener); return ()=>{this.subscribers.delete(listener)}; };
  getSnapshot = () => this.snapshot;
  private emit(patch: Partial<SaveSnapshot> = {}) {
    this.snapshot = {...this.snapshot,...patch};
    for (const listener of this.subscribers) listener();
  }
  private preserve() {
    try { const entry=this.snapshot.entry;this.storage?.setItem(draftKey(entry.id),JSON.stringify({revision:entry.revision,recordedAt:entry.recordedAt,updatedAt:entry.updatedAt,draft:draftOf(entry)})); }
    catch { this.snapshot = {...this.snapshot,storageWarning:"Browser recovery storage is full or unavailable. Keep this page open until your changes are saved."}; }
  }
  change(patch: Partial<JournalDraft>) {
    if (this.stopped) return;
    if (Object.entries(patch).every(([key,value])=>JSON.stringify(value)===JSON.stringify(this.snapshot.entry[key as keyof JournalDraft]))) return;
    this.generation++;
    this.snapshot = {...this.snapshot,entry:{...this.snapshot.entry,...patch}};
    this.preserve();
    this.emit({state:this.snapshot.state==="conflict"?"conflict":"unsaved",error:this.snapshot.state==="conflict"?this.snapshot.error:""});
    clearTimeout(this.timer);
    this.timer = setTimeout(()=>void this.flush(),700);
  }
  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.flight) { const ok=await this.flight; return ok ? this.flush() : false; }
    if (this.stopped || !this.dirty) return true;
    if (this.snapshot.state === "conflict") return false;
    this.flight = this.write();
    const result = await this.flight;
    this.flight = undefined;
    return result;
  }
  private async write(): Promise<boolean> {
    while (this.dirty && !this.stopped) {
      const generation = this.generation;
      const entry = this.snapshot.entry;
      this.emit({state:"saving",error:""});
      try {
        const saved = await this.save({...draftOf(entry),expectedRevision:entry.revision,timezoneOffset:new Date(entry.createdAt).getTimezoneOffset()});
        this.committed = generation;
        const current = this.snapshot.entry;
        this.snapshot = {...this.snapshot,entry:this.dirty?{...current,revision:saved.revision,updatedAt:saved.updatedAt,recordedAt:saved.recordedAt}:saved};
        if (!this.dirty) { try { this.storage?.removeItem(draftKey(entry.id)); } catch { /* Saved on server. */ } }
        else this.preserve();
        this.emit({state:this.dirty?"unsaved":"saved",recovered:false});
        this.onSaved?.(saved);
      } catch (error) {
        this.preserve();
        this.emit({state:error instanceof ApiError && [404,409].includes(error.status)?"conflict":"error",error:error instanceof Error?error.message:"Could not save. Your draft is kept here."});
        return false;
      }
    }
    return true;
  }
  async stop() { this.stopped=true; clearTimeout(this.timer); await this.flight; }
  discard() {
    clearTimeout(this.timer); this.committed=this.generation;
    try { this.storage?.removeItem(draftKey(this.snapshot.entry.id)); } catch { /* Browser storage may be disabled. */ }
    this.emit({state:"saved",error:"",recovered:false});
  }
  activate() { this.stopped=false; }
  dispose() { clearTimeout(this.timer); this.subscribers.clear(); this.stopped=true; }
}
