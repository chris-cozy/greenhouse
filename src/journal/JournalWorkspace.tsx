import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BookOpenText, CalendarDays, Check, ChevronLeft, Leaf, List, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Link, useBlocker, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import type { AppOptions, JournalEntry, JournalTag } from "../shared/types";
import { journalExcerpt, timestampLabel, toLocalInput } from "../shared/journal";
import { ChipsInput, Confirm, EmptyState, ErrorNote, Loading, Modal } from "../components/Common";
import { useContentWidth, useOverlay, usePresence } from "../components/Interaction";
import { Autosave, deletedEntryRecovery, draftOf } from "./Autosave";
import { DiaryTagManager, DiaryTagPicker } from "./DiaryTags";
import { RichEditor, type RichEditorHandle } from "./RichEditor";
import "./journal.css";

type PaneProps={entry:JournalEntry;tags:JournalTag[];options:AppOptions;opening:boolean;onSaved:(entry:JournalEntry)=>void;onReload:()=>Promise<void>;onDeleted:(id:string)=>void;onManage:()=>void;flushRef:{current:(()=>Promise<boolean>)|null}};
function EntryPane({entry,tags,options,opening,onSaved,onReload,onDeleted,onManage,flushRef}:PaneProps){
  const navigate=useNavigate(),savedRef=useRef(onSaved);savedRef.current=onSaved;
  const [session]=useState(()=>{let storage:Storage|undefined;try{storage=localStorage}catch{/* Saving to the API still works. */}return new Autosave(entry,payload=>api.put<JournalEntry>(`/api/journal/${entry.id}`,payload),storage,saved=>savedRef.current(saved))});
  const snapshot=useSyncExternalStore(session.subscribe,session.getSnapshot);
  const current=snapshot.entry;
  const countContent=useDeferredValue(current.content);
  const wordCount=useMemo(()=>journalExcerpt(countContent,Number.MAX_SAFE_INTEGER).split(/\s+/).filter(Boolean).length,[countContent]);
  const editor=useRef<RichEditorHandle>(null);
  const [uploading,setUploading]=useState(false),[confirmDelete,setConfirmDelete]=useState(false),[confirmReload,setConfirmReload]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [dateOpen,setDateOpen]=useState(false),[dateValue,setDateValue]=useState(toLocalInput(current.createdAt)),[dateError,setDateError]=useState("");
  const [plants,setPlants]=useState<Array<{id:string;name:string}>>([]);
  const blocker=useBlocker(({currentLocation,nextLocation})=>(session.dirty||uploading||busy)&&currentLocation.pathname!==nextLocation.pathname);
  const flush=async()=>{await editor.current?.settle();return session.flush()};
  flushRef.current=flush;
  useEffect(()=>{let live=true;void api.get<Array<{id:string;name:string}>>("/api/plants?scope=all").then(data=>{if(live)setPlants(data)}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[]);
  useEffect(()=>{if(snapshot.recovered&&snapshot.state==="unsaved")void session.flush()},[]);
  useEffect(()=>{session.activate();flushRef.current=flush;return()=>{session.dispose();flushRef.current=null}},[session]);
  useEffect(()=>{const unload=(e:BeforeUnloadEvent)=>{if(session.dirty||uploading){e.preventDefault();e.returnValue=""}};window.addEventListener("beforeunload",unload);return()=>window.removeEventListener("beforeunload",unload)},[session,uploading]);
  useEffect(()=>{if(blocker.state!=="blocked"||busy)return;let live=true;void flush().then(ok=>{if(live&&ok)blocker.proceed()});return()=>{live=false}},[blocker.state,busy]);
  const saveCopy=async()=>{setBusy(true);setError("");try{await editor.current?.settle();const copy=await api.post<JournalEntry>("/api/journal",{...draftOf(session.snapshot.entry),timezoneOffset:new Date(session.snapshot.entry.createdAt).getTimezoneOffset()});session.discard();onSaved(copy);navigate(`/journal/${copy.id}`)}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
  return <section className="diary-document" aria-label="Active diary entry" inert={opening} aria-busy={opening}>
    <div className="diary-document-top"><div className="diary-dates"><button disabled={busy} className="created-date" onClick={()=>{setDateValue(toLocalInput(current.createdAt));setDateError("");setDateOpen(true)}}><span>Created</span><time dateTime={current.createdAt}>{timestampLabel(current.createdAt)}</time><CalendarDays size={13}/></button><div><span>Last edited</span><time dateTime={current.updatedAt}>{timestampLabel(current.updatedAt)}</time></div></div>
      <div className="diary-document-actions"><span className={`save-status ${snapshot.state}`} role="status" aria-live="polite">{busy?"Saving a copy…":snapshot.state==="saved"?<><Check size={12}/> Saved locally</>:snapshot.state==="saving"?"Saving…":snapshot.state==="unsaved"?"Unsaved changes":snapshot.state==="conflict"?"Needs attention":"Save failed"}</span><button className="icon-button" disabled={busy} aria-label="Delete diary entry" onClick={()=>setConfirmDelete(true)}><Trash2 size={17}/></button></div>
    </div>
    {snapshot.recovered&&<p className="diary-notice">Recovered your writing from this browser.</p>}
    {snapshot.storageWarning&&<p className="diary-notice" role="alert">{snapshot.storageWarning}</p>}
    {(snapshot.state==="error"||snapshot.state==="conflict")&&<div className="diary-save-error" role="alert"><p>{snapshot.error}</p><div>{snapshot.state==="error"&&<button className="button ghost" disabled={busy} onClick={()=>void flush()}>Retry save</button>}<button className="button ghost" disabled={busy} onClick={()=>void saveCopy()}>Save draft as new entry</button><button className="text-button" disabled={busy} onClick={()=>setConfirmReload(true)}>Reload saved version</button></div></div>}
    {blocker.state==="blocked"&&!busy&&snapshot.state!=="saving"&&<div className="diary-notice"><p>Your writing has not been saved yet.</p><button className="text-button" onClick={()=>blocker.reset()}>Keep writing</button><button className="text-button" onClick={()=>{session.discard();blocker.proceed()}}>Discard changes and leave</button></div>}
    {error&&<ErrorNote message={error}/>}
    <div className="diary-writing-column" inert={busy}>
      <input autoFocus={current.title==="Untitled entry"} onFocus={e=>{if(e.target.value==="Untitled entry")e.target.select()}} className="diary-title" aria-label="Entry title" value={current.title} placeholder="Untitled entry" onChange={e=>session.change({title:e.target.value})}/>
      <div className="diary-tag-line"><DiaryTagPicker tags={tags} value={current.tags} onChange={tags=>session.change({tags})}/><button className="icon-button" aria-label="Manage diary tags" onClick={async()=>{if(await flush())onManage()}}><SlidersHorizontal size={14}/></button></div>
      <details className="diary-connections"><summary><Leaf size={13}/> {current.plantIds.length+current.terrariumIds.length?`${current.plantIds.length+current.terrariumIds.length} linked plants and terrariums`:"Link plants or terrariums"}</summary><div><strong>Plants</strong><ChipsInput options={plants} value={current.plantIds} onChange={plantIds=>session.change({plantIds})}/><strong>Terrariums</strong><ChipsInput options={options.terrariums} value={current.terrariumIds} onChange={terrariumIds=>session.change({terrariumIds})}/></div></details>
      <RichEditor ref={editor} id={current.id} content={current.content} onChange={content=>session.change({content})} onBusy={setUploading}/>
      <footer className="diary-writing-footer"><span>{wordCount} {wordCount===1?"word":"words"}</span><span>{uploading?"Uploading image…":"/ for formatting · @ for dates"}</span></footer>
    </div>
    {dateOpen&&<Modal title="Edit creation date" subtitle="This changes where the entry appears in your diary and linked timelines. Last edited stays automatic." onClose={()=>setDateOpen(false)}><form className="form-grid" onSubmit={e=>{e.preventDefault();const value=String(new FormData(e.currentTarget).get("createdAt")||"");if(value===toLocalInput(current.createdAt)){setDateOpen(false);return}const date=new Date(value);if(!Number.isFinite(date.getTime())||toLocalInput(date.toISOString())!==value){setDateError("Choose a valid local date and time.");return}session.change({createdAt:date.toISOString()});setDateOpen(false)}}><label className="field field-wide"><span>Created</span><input name="createdAt" type="datetime-local" required autoFocus value={dateValue} onChange={e=>setDateValue(e.target.value)}/></label>{dateError&&<ErrorNote message={dateError}/>}<button className="button primary field-wide">Save creation date</button></form></Modal>}
    {confirmReload&&<Modal title="Reload saved version?" subtitle="Your unsaved local changes will be discarded." onClose={()=>setConfirmReload(false)}><div className="confirm"><button className="button ghost" onClick={()=>setConfirmReload(false)}>Keep writing</button><button className="button danger" onClick={async()=>{await editor.current?.settle();await session.stop();session.discard();await onReload()}}>Discard draft and reload</button></div></Modal>}
    {confirmDelete&&<Confirm title="Delete this diary entry?" copy="The entry disappears from your diary and linked timelines. Its unshared images are also removed." onClose={()=>setConfirmDelete(false)} onConfirm={async()=>{try{await flush();await api.delete(`/api/journal/${current.id}`);await session.stop();session.discard();onDeleted(current.id);navigate("/journal")}catch(e){setError((e as Error).message);setConfirmDelete(false)}}}/>}
  </section>;
}

export function JournalWorkspace({options,refreshOptions}:{options:AppOptions;refreshOptions:()=>void}){
  const {id}=useParams(),navigate=useNavigate();
  const location=useLocation(),currentPath=useRef(location.pathname),alive=useRef(true);currentPath.current=location.pathname;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  const [entries,setEntries]=useState<JournalEntry[]>([]),[tags,setTags]=useState<JournalTag[]>([]),[active,setActive]=useState<JournalEntry|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[entryError,setEntryError]=useState(""),[q,setQ]=useState(""),[tag,setTag]=useState("");
  const [drawer,setDrawer]=useState(false),[manager,setManager]=useState(false),[epoch,setEpoch]=useState(0),[creating,setCreating]=useState(false);
  const layout=useContentWidth();
  const drawerPresence=usePresence(drawer&&!layout.wide);
  useOverlay(drawerPresence.present);
  useEffect(()=>{if(layout.wide)setDrawer(false)},[layout.wide]);
  const loadGeneration=useRef(0),paneFlush=useRef<(()=>Promise<boolean>)|null>(null);
  const excerptCache=useRef(new WeakMap<JournalEntry,string>());
  const excerpt=(entry:JournalEntry)=>{let value=excerptCache.current.get(entry);if(value===undefined){value=journalExcerpt(entry.content,Number.MAX_SAFE_INTEGER);excerptCache.current.set(entry,value)}return value};
  const indexElement=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(!drawerPresence.present)return;
    const previous=document.activeElement as HTMLElement|null;
    indexElement.current?.querySelector<HTMLInputElement>('input')?.focus();
    const key=(event:KeyboardEvent)=>{
      if(Array.from(document.querySelectorAll('[role="dialog"]')).at(-1)!==indexElement.current)return;
      if(event.key==="Escape"){event.preventDefault();setDrawer(false)}
      if(event.key==="Tab"){
        const targets=Array.from(indexElement.current?.querySelectorAll<HTMLElement>('button,input,a[href]')||[]).filter(element=>element.getClientRects().length>0);
        if(event.shiftKey&&document.activeElement===targets[0]){event.preventDefault();targets.at(-1)?.focus()}
        else if(!event.shiftKey&&document.activeElement===targets.at(-1)){event.preventDefault();targets[0]?.focus()}
      }
    };
    window.addEventListener("keydown",key);return()=>{window.removeEventListener("keydown",key);const remaining=Array.from(document.querySelectorAll('[role="dialog"]')).at(-1);if(previous?.isConnected&&(!remaining||remaining.contains(previous)))previous.focus()};
  },[drawerPresence.present]);
  const loadLibrary=useCallback(async()=>{const generation=++loadGeneration.current;try{const [list,catalog]=await Promise.all([api.get<JournalEntry[]>("/api/journal"),api.get<JournalTag[]>("/api/journal-tags")]);if(generation!==loadGeneration.current)return;setEntries(list);setTags(catalog);setError("")}catch(e){if(generation===loadGeneration.current)setError((e as Error).message)}finally{if(generation===loadGeneration.current)setLoading(false)}},[]);
  useEffect(()=>{void loadLibrary()},[loadLibrary]);
  useEffect(()=>{if(id||loading||!entries.length)return;let last:string|null=null;try{last=localStorage.getItem("greenhouse-last-diary-entry")}catch{}navigate(`/journal/${entries.some(e=>e.id===last)?last:entries[0].id}`,{replace:true})},[id,loading,entries,navigate]);
  useEffect(()=>{let live=true;setActive(null);setEntryError("");if(!id)return;setDrawer(false);void api.get<JournalEntry>(`/api/journal/${id}`).then(entry=>{if(live){setActive(entry);try{localStorage.setItem("greenhouse-last-diary-entry",entry.id)}catch{}}}).catch(e=>{if(!live)return;if(e instanceof ApiError&&e.status===404){try{const recovery=deletedEntryRecovery(id,localStorage);if(recovery){setActive(recovery);return}}catch{}}setEntryError(e.message)});return()=>{live=false}},[id,epoch]);
  const onSaved=(saved:JournalEntry)=>{setEntries(list=>[saved,...list.filter(e=>e.id!==saved.id)].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));void api.get<JournalTag[]>("/api/journal-tags").then(setTags).catch(e=>setError(e.message));refreshOptions()};
  const create=async()=>{const from=currentPath.current;setCreating(true);try{if(paneFlush.current&&!await paneFlush.current())return;const entry=await api.post<JournalEntry>("/api/journal",{title:"Untitled entry",content:"",createdAt:new Date().toISOString(),timezoneOffset:new Date().getTimezoneOffset()});if(!alive.current)return;setEntries(list=>[entry,...list]);if(currentPath.current!==from)return;setQ("");setTag("");navigate(`/journal/${entry.id}`)}catch(e){if(alive.current)setError((e as Error).message)}finally{if(alive.current)setCreating(false)}};
  const filtered=entries.filter(entry=>(!tag||entry.tags.some(t=>t.toLocaleLowerCase()===tag.toLocaleLowerCase()))&&(!q||`${entry.title} ${excerpt(entry)} ${entry.tags.join(" ")}`.toLocaleLowerCase().includes(q.toLocaleLowerCase())));
  const pageError=entryError||error;
  return <div ref={layout.ref} className={`diary-page ${layout.wide?"is-wide":""}`}>
    <header className="diary-heading"><div><span className="eyebrow">A little room to reflect</span><h1>Greenhouse Diary</h1></div><div><button className="button ghost diary-list-toggle" onClick={()=>setDrawer(true)}><List size={16}/> Entries</button><button className="button primary" disabled={creating} onClick={()=>void create()}><Plus size={16}/> New entry</button></div></header>
    {pageError&&<div className="diary-page-error"><ErrorNote message={pageError}/><button className="text-button" onClick={async()=>{if(paneFlush.current&&!await paneFlush.current())return;await loadLibrary();setEpoch(n=>n+1)}}>Refresh diary</button></div>}
    <div className="diary-workspace">
      {drawerPresence.present&&<div className={`diary-drawer-backdrop ${drawerPresence.exiting?"is-exiting":""}`} onClick={()=>setDrawer(false)}/>}
      <aside ref={indexElement} className={`diary-index ${drawerPresence.present?"is-open":""} ${drawerPresence.exiting?"is-exiting":""}`} role={drawerPresence.present?"dialog":undefined} aria-modal={drawerPresence.present?true:undefined} aria-label="Diary entries">
        <button className="diary-drawer-close icon-button" aria-label="Close entry list" onClick={()=>setDrawer(false)}><X/></button>
        <label className="diary-search"><Search size={15}/><input aria-label="Search diary" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search your diary…"/></label>
        <div className="diary-index-heading"><span>{tag?`#${tag}`:"Recent entries"}</span><small>{filtered.length}</small></div>
        {tag&&<button className="text-button clear-tag" onClick={()=>setTag("")}>Clear tag filter ×</button>}
        <nav className="diary-entry-list" aria-label="Entries">{filtered.map(entry=><Link className={entry.id===id?"active":""} to={`/journal/${entry.id}`} key={entry.id}><time dateTime={entry.createdAt}><strong>{new Date(entry.createdAt).getDate()}</strong><span>{new Date(entry.createdAt).toLocaleDateString(undefined,{month:"short"})}</span></time><span><strong>{entry.title}</strong><p>{excerpt(entry).slice(0,85)||"A fresh page, ready when you are."}</p></span></Link>)}</nav>
        {!filtered.length&&!loading&&<p className="diary-index-empty">{entries.length?"No entries match. Try another search or tag.":"Your stories will gather here."}</p>}
        <div className="diary-index-tags"><span className="eyebrow">Your diary tags</span><div>{tags.map(t=><button key={t.id} className={tag===t.name?"active":""} onClick={()=>setTag(tag===t.name?"":t.name)}>#{t.name} <small>{t.entryCount}</small></button>)}</div>{!tags.length&&<p>Tags grow with your writing.</p>}{!active&&<button className="text-button" onClick={()=>setManager(true)}>Manage tags</button>}</div>
      </aside>
      {loading?<Loading/>:active&&active.id===id?<EntryPane key={`${active.id}:${epoch}`} entry={active} opening={creating} flushRef={paneFlush} tags={tags} options={options} onSaved={onSaved} onReload={async()=>{setEpoch(n=>n+1);await loadLibrary()}} onDeleted={deleted=>{setEntries(list=>list.filter(e=>e.id!==deleted));setActive(null);void loadLibrary();refreshOptions()}} onManage={()=>setManager(true)}/>:id&&!pageError?<Loading/>:<div className="diary-welcome"><EmptyState icon={<BookOpenText/>} title="A place for your growing stories" copy="Observations, experiments, setbacks, and small victories. Write whenever something feels worth remembering." action={<button className="button primary" disabled={creating} onClick={()=>void create()}>Write your first entry</button>}/>{id&&<Link className="back-link" to="/journal"><ChevronLeft/> Back to diary</Link>}</div>}
    </div>
    {manager&&<DiaryTagManager tags={tags} onClose={()=>setManager(false)} onChanged={async()=>{setTag("");await loadLibrary();setEpoch(n=>n+1)}}/>}
  </div>;
}
