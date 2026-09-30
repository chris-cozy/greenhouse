import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ImagePlus, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { PlantLinks, TagInput, pendingTags } from "./RecordChoices";
import { useLoad } from "./useLoad";
import { api } from "../api";
import type { AppOptions, Photo, PlantChoice } from "../shared/types";
import { usePresence, useMutation, useOverlay } from "./Interaction";
export { GlobalSearch } from "./GlobalSearch";
export { useLoad } from "./useLoad";

export const prettyStatus=(value:string)=>value.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
export const shortDate=(date:string)=>date?new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",year:"numeric"}).format(new Date(`${date.slice(0,10)}T12:00:00`)):"No date";
export const splitTags=(value:string)=>value.split(",").map(x=>x.trim()).filter(Boolean);

export function PageHeader({eyebrow,title,description,action,children}:{eyebrow:string;title:string;description:string;action?:ReactNode;children?:ReactNode}){return <><section className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</section>{children}</>}
export function EmptyState({icon,title,copy,action}:{icon:ReactNode;title:string;copy:string;action?:ReactNode}){return <div className="empty-state"><div className="empty-icon">{icon}</div><h2>{title}</h2><p>{copy}</p>{action}</div>}
export function Loading(){return <div className="loading" role="status"><LoaderCircle className="spin" aria-hidden="true"/> Gathering your greenhouse…</div>}
export function ErrorNote({message}:{message:string}){return <div className="error-note" role="alert"><AlertCircle size={17}/>{message}</div>}
export function RefreshNote({refreshing,error,onRetry}:{refreshing:boolean;error:string;onRetry:()=>void}){return error?<div className="refresh-note" role="alert"><span>Saved changes are safe. This view could not refresh: {error}</span><button className="button ghost" onClick={onRetry}>Retry refresh</button></div>:refreshing?<div className="refresh-progress" role="status">Refreshing this view…</div>:null}
export function Tags({items}:{items:string[]}){return items.length?<div className="tags">{items.map(tag=><span key={tag}>#{tag}</span>)}</div>:null}

type ModalProps={title:string;subtitle?:string;eyebrow?:string;className?:string;onClose:()=>void;children:ReactNode;wide?:boolean;open?:boolean;busy?:boolean;onExited?:()=>void};
export function Modal({open=true,onExited,...props}:ModalProps){
  const {present,exiting}=usePresence(open);
  const wasPresent=useRef(present),afterExit=useRef(onExited);afterExit.current=onExited;
  useEffect(()=>{if(wasPresent.current&&!present)afterExit.current?.();wasPresent.current=present},[present]);
  return present?createPortal(<ModalSurface {...props} exiting={exiting}/>,document.body):null;
}
function ModalSurface({title,subtitle,eyebrow="Greenhouse record",className="",onClose,children,wide=false,busy=false,exiting}:{exiting:boolean}&ModalProps){
  useOverlay(true);
  const [entered,setEntered]=useState(false);
  const dialog=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
  // Capture before children commit: a legacy autoFocus input must not become its own return target.
  const returnFocus=useRef(typeof document==="undefined"?null:document.activeElement as HTMLElement|null);
  const blocked=useRef(false);blocked.current=busy||exiting;
  useEffect(()=>{
    const previous=returnFocus.current;
    const top=()=>Array.from(document.querySelectorAll('[role="dialog"]')).at(-1)===dialog.current;
    if(!dialog.current?.contains(document.activeElement))(dialog.current?.querySelector<HTMLElement>('input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')||dialog.current?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();
    const key=(e:KeyboardEvent)=>{
      if(!top())return;
      if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();if(!blocked.current)close.current()}
      if(e.key==="Tab"){
        const targets=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,a[href],[tabindex="0"]')||[]).filter(el=>{
          const closedDetails=el.closest('details:not([open])');
          return el.tabIndex>=0&&el.getClientRects().length>0&&!el.closest('[hidden],fieldset:disabled')&&(!closedDetails||closedDetails.querySelector('summary')===el);
        });
        e.preventDefault();
        if(!targets.length){dialog.current?.focus();return}
        const index=targets.indexOf(document.activeElement as HTMLElement);
        const next=index<0?(e.shiftKey?targets.length-1:0):(index+(e.shiftKey?-1:1)+targets.length)%targets.length;
        targets[next]?.focus();
      }
    };
    window.addEventListener("keydown",key);return()=>{window.removeEventListener("keydown",key);const remaining=Array.from(document.querySelectorAll('[role="dialog"]')).at(-1);if(previous?.isConnected&&(!remaining||remaining.contains(previous)))previous.focus({preventScroll:true})};
  },[]);
  return <div className={`modal-backdrop ${exiting?"is-exiting":""}`} role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!blocked.current)onClose()}}><section ref={dialog} tabIndex={-1} className={`modal ${wide?"wide":""} ${entered?"has-entered":""} ${className}`} onAnimationEnd={e=>{if(e.target===e.currentTarget&&e.animationName==="dialog-enter")setEntered(true)}} role="dialog" aria-modal="true" aria-busy={busy} aria-label={title} onKeyDownCapture={e=>{if(exiting&&e.key!=="Tab"){e.preventDefault();e.stopPropagation()}}} onSubmitCapture={e=>{if(exiting){e.preventDefault();e.stopPropagation()}}}><header><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button type="button" disabled={busy||exiting} className="icon-button" onClick={onClose} aria-label="Close"><X/></button></header>{children}</section></div>;
}
export function Confirm({title,copy,onConfirm,onClose}:{title:string;copy:string;onConfirm:()=>Promise<void>|void;onClose:()=>void}){
  const mutation=useMutation();
  return <Modal title={title} busy={mutation.busy} onClose={()=>{if(!mutation.isBusy())onClose()}}><div className="confirm"><p>{copy}</p>{mutation.error&&<ErrorNote message={mutation.error}/>}<div className="form-actions"><button type="button" className="button ghost" disabled={mutation.busy} onClick={onClose}>Keep it</button><button type="button" className="button danger" disabled={mutation.busy} onClick={()=>void mutation.run(async()=>{await onConfirm()},()=>{})}><Trash2 size={16}/> {mutation.busy?"Deleting…":"Delete permanently"}</button></div></div></Modal>;
}

export function FormActions({onCancel,busy,label="Save changes"}:{onCancel:()=>void;busy:boolean;label?:string}){return <div className="form-actions"><button type="button" className="button ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="button primary" disabled={busy}>{busy?<LoaderCircle className="spin" size={17}/>:<Check size={17}/>} {busy?"Saving…":label}</button></div>}
export function Field({label,children,wide=false,hint}:{label:string;children:ReactNode;wide?:boolean;hint?:string}){return <label className={`field ${wide?"field-wide":""}`}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
export function ChipsInput({options,value,onChange}:{options:Array<{id:string;name:string}>;value:string[];onChange:(value:string[])=>void}){return <div className="check-grid">{options.map(option=><label className={value.includes(option.id)?"check-chip selected":"check-chip"} key={option.id}><input type="checkbox" checked={value.includes(option.id)} onChange={e=>onChange(e.target.checked?[...value,option.id]:value.filter(id=>id!==option.id))}/>{option.name}</label>)}</div>}

export function PhotoUpload({plantId,terrariumId,photo,options:providedOptions,onDone,onBusyChange}:{plantId?:string;terrariumId?:string;photo?:Photo;options?:AppOptions;onDone:(photo:Photo)=>void;onBusyChange?:(busy:boolean)=>void}){
  const [file,setFile]=useState<File|null>(null),[caption,setCaption]=useState(photo?.caption||"");
  const [preview,setPreview]=useState(""),[fileError,setFileError]=useState("");
  const today=new Date();
  const [date,setDate]=useState(photo?.dateTaken??`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`);
  const [tags,setTags]=useState(photo?.tags||[]),[tagDraft,setTagDraft]=useState("");
  const [plantIds,setPlantIds]=useState(photo?.plantIds??(photo?.plantId?[photo.plantId]:plantId?[plantId]:[]));
  const loaded=useLoad<AppOptions>(providedOptions?null:"/api/options"),options=providedOptions||loaded.data;
  const choices=new Map<string,PlantChoice>((options?.plants||[]).map(plant=>[plant.id,plant]));
  for(const plant of photo?.linkedPlants||[])if(!choices.has(plant.id))choices.set(plant.id,{...plant,status:"healthy",archivedAt:null});
  if(plantId&&!choices.has(plantId))choices.set(plantId,{id:plantId,name:"This plant",status:"healthy",archivedAt:null});
  const mutation=useMutation();
  useEffect(()=>{onBusyChange?.(mutation.busy)},[mutation.busy,onBusyChange]);
  useEffect(()=>{
    if(!file||typeof URL.createObjectURL!=="function"){setPreview("");return}
    const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);
  },[file]);
  const submit=(event:FormEvent)=>{
    event.preventDefault();if((!photo&&!file)||(!terrariumId&&!plantIds.length))return;
    const committed=pendingTags(tags,tagDraft);
    void mutation.run(()=>{
      if(photo)return api.put<Photo>(`/api/photos/${photo.id}`,{caption,dateTaken:date,tags:committed,plantIds});
      const form=new FormData();form.append("photo",file!);
      if(terrariumId)form.append("terrariumId",terrariumId);else form.append("plantIds",JSON.stringify(plantIds));
      form.append("caption",caption);form.append("dateTaken",date);form.append("tags",committed.join(","));
      return api.upload<Photo>("/api/photos",form);
    },onDone);
  };
  return <form className="form-grid scroll-form photo-form" onSubmit={submit}>
    <fieldset className="form-fields" disabled={mutation.busy}>
      {photo?<div className="photo-preview field-wide"><img src={photo.url} alt={photo.caption||"Progress photo"}/></div>:<Field label="Photo" wide><div className={`file-drop photo-file-drop ${preview?"has-preview":""}`}>
        {preview?<img src={preview} alt="Selected photo preview"/>:<ImagePlus/>}
        <span>{file?file.name:"Choose an image"}</span><small>{file?"Choose another image":"JPEG, PNG, WebP, or GIF · up to 20 MB"}</small>
        <input aria-label="Photo image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required onChange={event=>{
          const next=event.target.files?.[0]||null;
          if(next&&(!["image/jpeg","image/png","image/webp","image/gif"].includes(next.type)||next.size>20*1024*1024)){
            setFile(null);setFileError("Choose a JPEG, PNG, WebP, or GIF image up to 20 MB.");event.target.value="";return;
          }
          setFileError("");setFile(next);
        }}/>
      </div></Field>}
      {!terrariumId&&<PlantLinks options={[...choices.values()]} value={plantIds} onChange={setPlantIds}/>}
      {photo&&<p className="shared-record-note field-wide">Caption, date, and tags are shared across all linked plants.</p>}
      <Field label="Date taken"><input type="date" value={date} onChange={event=>setDate(event.target.value)}/></Field>
      <Field label="Tags"><TagInput value={tags} draft={tagDraft} onChange={setTags} onDraftChange={setTagDraft} options={options?.tags||[]}/></Field>
      <Field label="Caption" wide><textarea rows={3} value={caption} onChange={event=>setCaption(event.target.value)} placeholder="What changed?"/></Field>
    </fieldset>
    {(fileError||mutation.error)&&<div className="field-wide"><ErrorNote message={fileError||mutation.error}/></div>}
    {loaded.error&&<div className="field-wide refresh-note"><span>Choices could not load: {loaded.error}</span><button type="button" className="text-button" onClick={()=>void loaded.reload()}>Retry</button></div>}
    <button className="button primary field-wide" disabled={(!photo&&!file)||(!terrariumId&&!plantIds.length)||mutation.busy}>{mutation.busy?<LoaderCircle className="spin"/>:<Plus/>} {mutation.busy?"Saving…":photo?"Save photo":"Add to progress"}</button>
  </form>;
}
