import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ImagePlus, LoaderCircle, Plus, Search, Trash2, X } from "lucide-react";
import { api } from "../api";
import type { AppOptions, GlobalSearchResult } from "../shared/types";
import { useNavigate } from "react-router-dom";

export function useLoad<T>(path:string,deps:unknown[]=[]){const [data,setData]=useState<T|null>(null);const [error,setError]=useState("");const [loading,setLoading]=useState(true);const load=()=>{setLoading(true);return api.get<T>(path).then(setData).catch(e=>setError(e.message)).finally(()=>setLoading(false))};useEffect(()=>{void load()},[path,...deps]);return {data,setData,error,loading,reload:load}}
export const prettyStatus=(value:string)=>value.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
export const shortDate=(date:string)=>date?new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",year:"numeric"}).format(new Date(`${date.slice(0,10)}T12:00:00`)):"No date";
export const splitTags=(value:string)=>value.split(",").map(x=>x.trim()).filter(Boolean);

export function PageHeader({eyebrow,title,description,action,children}:{eyebrow:string;title:string;description:string;action?:ReactNode;children?:ReactNode}){return <><section className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</section>{children}</>}
export function EmptyState({icon,title,copy,action}:{icon:ReactNode;title:string;copy:string;action?:ReactNode}){return <div className="empty-state"><div className="empty-icon">{icon}</div><h2>{title}</h2><p>{copy}</p>{action}</div>}
export function Loading(){return <div className="loading"><LoaderCircle className="spin"/> Gathering your greenhouse…</div>}
export function ErrorNote({message}:{message:string}){return <div className="error-note"><AlertCircle size={17}/>{message}</div>}
export function Tags({items}:{items:string[]}){return items.length?<div className="tags">{items.map(tag=><span key={tag}>#{tag}</span>)}</div>:null}

export function Modal({title,subtitle,onClose,children,wide=false}:{title:string;subtitle?:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
  const dialog=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const top=()=>Array.from(document.querySelectorAll('[role="dialog"]')).at(-1)===dialog.current;
    if(!dialog.current?.contains(document.activeElement))dialog.current?.querySelector<HTMLElement>('input,button,textarea,select,[tabindex="0"]')?.focus();
    const key=(e:KeyboardEvent)=>{
      if(!top())return;
      if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();close.current()}
      if(e.key==="Tab"){
        const targets=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')||[]).filter(el=>el.getClientRects().length>0);
        const first=targets[0],last=targets.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
      }
    };
    window.addEventListener("keydown",key);return()=>{window.removeEventListener("keydown",key);if(previous?.isConnected)previous.focus()};
  },[]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section ref={dialog} className={`modal ${wide?"wide":""}`} role="dialog" aria-modal="true" aria-label={title}><header><div><span className="eyebrow">Greenhouse record</span><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X/></button></header>{children}</section></div>;
}
export function Confirm({title,copy,onConfirm,onClose}:{title:string;copy:string;onConfirm:()=>Promise<void>|void;onClose:()=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  return <Modal title={title} onClose={()=>{if(!busy)onClose()}}><div className="confirm"><p>{copy}</p>{error&&<ErrorNote message={error}/>}<div className="form-actions"><button type="button" className="button ghost" disabled={busy} onClick={onClose}>Keep it</button><button type="button" className="button danger" disabled={busy} onClick={async()=>{setBusy(true);try{await onConfirm()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}><Trash2 size={16}/> Delete permanently</button></div></div></Modal>;
}

export function FormActions({onCancel,busy,label="Save changes"}:{onCancel:()=>void;busy:boolean;label?:string}){return <div className="form-actions"><button type="button" className="button ghost" onClick={onCancel}>Cancel</button><button className="button primary" disabled={busy}>{busy?<LoaderCircle className="spin" size={17}/>:<Check size={17}/>} {label}</button></div>}
export function Field({label,children,wide=false,hint}:{label:string;children:ReactNode;wide?:boolean;hint?:string}){return <label className={`field ${wide?"field-wide":""}`}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
export function ChipsInput({options,value,onChange}:{options:Array<{id:string;name:string}>;value:string[];onChange:(value:string[])=>void}){return <div className="check-grid">{options.map(option=><label className={value.includes(option.id)?"check-chip selected":"check-chip"} key={option.id}><input type="checkbox" checked={value.includes(option.id)} onChange={e=>onChange(e.target.checked?[...value,option.id]:value.filter(id=>id!==option.id))}/>{option.name}</label>)}</div>}

export function PhotoUpload({plantId,terrariumId,onDone}:{plantId?:string;terrariumId?:string;onDone:()=>void}){const [file,setFile]=useState<File|null>(null);const [caption,setCaption]=useState("");const [date,setDate]=useState(new Date().toISOString().slice(0,10));const [tags,setTags]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const submit=async(e:FormEvent)=>{e.preventDefault();if(!file)return;setBusy(true);setError("");try{const form=new FormData();form.append("photo",file);if(plantId)form.append("plantId",plantId);if(terrariumId)form.append("terrariumId",terrariumId);form.append("caption",caption);form.append("dateTaken",date);form.append("tags",tags);await api.upload("/api/photos",form);onDone()}catch(e){setError((e as Error).message)}finally{setBusy(false)}};return <form className="form-grid" onSubmit={submit}><Field label="Photo" wide><label className="file-drop"><ImagePlus/><span>{file?file.name:"Choose an image"}</span><small>JPEG, PNG, WebP, or GIF · up to 20 MB</small><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" required onChange={e=>setFile(e.target.files?.[0]||null)}/></label></Field><Field label="Date taken"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field><Field label="Tags"><input value={tags} onChange={e=>setTags(e.target.value)} placeholder="growth, spring"/></Field><Field label="Caption" wide><textarea rows={3} value={caption} onChange={e=>setCaption(e.target.value)} placeholder="What changed?"/></Field>{error&&<ErrorNote message={error}/>}<button className="button primary field-wide" disabled={!file||busy}>{busy?<LoaderCircle className="spin"/>:<Plus/>} Add to progress</button></form>}

export function GlobalSearch({open,onClose,options}:{open:boolean;onClose:()=>void;options:AppOptions|null}){const [q,setQ]=useState("");const [results,setResults]=useState<GlobalSearchResult[]>([]);const input=useRef<HTMLInputElement>(null);const navigate=useNavigate();useEffect(()=>{if(open){setTimeout(()=>input.current?.focus(),10);setQ("");setResults([])}},[open]);useEffect(()=>{if(!q.trim()){setResults([]);return}const timer=setTimeout(()=>void api.get<GlobalSearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`).then(setResults),180);return()=>clearTimeout(timer)},[q]);if(!open)return null;return <div className="search-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="command"><label><Search/><input ref={input} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search plants, species, terrariums, and journal…"/><kbd>Esc</kbd></label>{q&&<div className="search-results">{results.length?results.map(result=><button key={`${result.type}-${result.id}`} onClick={()=>{navigate(result.url);onClose()}}><span className={`result-icon ${result.type}`}>{result.type[0].toUpperCase()}</span><span><strong>{result.title}</strong><small>{result.type} · {result.subtitle}</small></span></button>):<p>No matches in your greenhouse.</p>}</div>} {!q&&<div className="search-hints"><span className="eyebrow">Try searching</span><p>A plant name, scientific name, location, tag, terrarium, or words from your journal.</p><div><span>{options?.species.length||0} species</span><span>{options?.terrariums.length||0} terrariums</span><span>{options?.tags.length||0} tags</span></div></div>}</section></div>}
