import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api";
import type { AppOptions, Photo, Plant, PlantChoice, ProgressSession, Terrarium } from "../shared/types";
import { Confirm, ErrorNote, Field, FormActions, Loading, Modal, prettyStatus, shortDate } from "./Common";
import { useMutation } from "./Interaction";
import { PlantLinks, TagInput, pendingTags } from "./RecordChoices";
import { useLoad } from "./useLoad";
import "./ProgressSessions.css";

type Props = { open:boolean; plantId?:string; terrariumId?:string; sessionId?:string; requirePhotos?:boolean;
  options?:AppOptions; photos?:Photo[]; onClose:()=>void; onSaved:(session:ProgressSession)=>void; onDeleted?:()=>void };
const today=()=>{const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`};
const kinds=["health_issue","recovery","flowering","new_growth","repotted","pruned","moved","note"];
type Attachment = {key:string;photo?:Photo;file?:File;caption:string};

function PhotoPreview({attachment}:{attachment:Attachment}) {
  const [url,setUrl]=useState(attachment.photo?.url||"");
  useEffect(()=>{
    if(!attachment.file||!URL.createObjectURL)return;
    const next=URL.createObjectURL(attachment.file);setUrl(next);return()=>URL.revokeObjectURL(next);
  },[attachment.file]);
  return url?<img src={url} alt={attachment.photo?.originalName||attachment.file?.name||"Selected photo"}/>:null;
}

export function ProgressSessionEditor(props:Props) {
  const [busy,setBusy]=useState(false),[generation,setGeneration]=useState(0);
  const load=useLoad<ProgressSession>(props.sessionId?`/api/progress-sessions/${props.sessionId}`:null);
  const optionsLoad=useLoad<AppOptions>(props.open&&!props.options?"/api/options":null);
  const ownerPath=props.plantId?`/api/plants/${props.plantId}`:props.terrariumId?`/api/terrariums/${props.terrariumId}`:null;
  const profile=useLoad<Plant|Terrarium>(props.open&&!props.photos?ownerPath:null);
  const close=()=>{if(!busy)props.onClose()};
  return <Modal open={props.open} busy={busy} wide title={props.sessionId?"Edit photo session":props.requirePhotos?"Add photos":"Record a meaningful update"}
    subtitle="Keep a note and its photos together in your growing story." onClose={close} onExited={()=>setGeneration(value=>value+1)}>
    {load.loading?<Loading/>:load.error?<><ErrorNote message={load.error}/><button className="button ghost" onClick={()=>void load.reload()}>Retry session</button></>:
      <SessionFields key={`${props.sessionId||"new"}-${generation}`} {...props} session={load.data||undefined} onClose={close} onBusyChange={setBusy}
        options={props.options||optionsLoad.data||undefined} photos={props.photos||profile.data?.photos||[]}/>
    }
    {(optionsLoad.error||profile.error)&&<div className="refresh-note"><span>Photo choices could not load.</span><button className="text-button" onClick={()=>{void optionsLoad.reload();void profile.reload()}}>Retry choices</button></div>}
  </Modal>;
}

function SessionFields({session,onBusyChange,...props}:Props&{session?:ProgressSession;onBusyChange:(busy:boolean)=>void}) {
  const [value,setValue]=useState({title:session?.title||"",detail:session?.detail||"",eventDate:session?.eventDate||today(),eventType:session?.eventType||"note"});
  const [attachments,setAttachments]=useState<Attachment[]>(()=>session?.photos.map(photo=>({key:photo.id,photo,caption:photo.caption}))||[]);
  const [plantIds,setPlantIds]=useState(session?.plantIds|| (props.plantId?[props.plantId]:[]));
  const [tags,setTags]=useState<string[]>([]),[tagDraft,setTagDraft]=useState(""),[fileError,setFileError]=useState(""),[confirm,setConfirm]=useState(false);
  const counter=useRef(0),mutation=useMutation();
  useEffect(()=>onBusyChange(mutation.busy),[mutation.busy,onBusyChange]);
  const terrariumId=session?.terrariumId||props.terrariumId;
  const choices=new Map<string,PlantChoice>((props.options?.plants||[]).map(plant=>[plant.id,plant]));
  for(const id of plantIds)if(!choices.has(id))choices.set(id,{id,name:id===props.plantId?"This plant":id,status:"healthy",archivedAt:null});
  const eligible=(props.photos||[]).filter(photo=>terrariumId?photo.terrariumId===terrariumId:!photo.terrariumId&&plantIds.length>0&&plantIds.every(id=>(photo.plantIds||[photo.plantId]).includes(id)));
  const addFiles=(files:File[])=>{
    if(attachments.length+files.length>20){setFileError("Choose up to 20 photos per session.");return}
    if(files.some(file=>!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)||file.size>20*1024*1024)){
      setFileError("Choose JPEG, PNG, WebP, or GIF images up to 20 MB each.");return;
    }
    setFileError("");setAttachments(current=>[...current,...files.map(file=>({key:`upload-${counter.current++}`,file,caption:""}))]);
  };
  const set=(key:keyof typeof value,next:string)=>setValue(current=>({...current,[key]:next}));
  const submit=(event:FormEvent)=>{
    event.preventDefault();
    if(props.requirePhotos&&!session&&!attachments.length){setFileError("Choose at least one photo.");return}
    if(!terrariumId&&!plantIds.length){setFileError("Choose at least one plant.");return}
    setFileError("");
    void mutation.run(()=>{
      const form=new FormData();let index=0;
      const photos=attachments.map(attachment=>{
        if(attachment.photo)return {id:attachment.photo.id,caption:attachment.caption};
        form.append("photos",attachment.file!);return {uploadIndex:index++,caption:attachment.caption};
      });
      form.append("metadata",JSON.stringify({...value,plantIds,terrariumId:terrariumId||null,photos,tags:pendingTags(tags,tagDraft)}));
      return session?api.upload<ProgressSession>(`/api/progress-sessions/${session.id}`,form,"PUT"):api.upload<ProgressSession>("/api/progress-sessions",form);
    },props.onSaved);
  };
  return <>
    <form className="form-grid scroll-form progress-session-form" onSubmit={submit}>
      <fieldset className="form-fields" disabled={mutation.busy}>
        <Field label="Title" wide hint={props.requirePhotos?"Optional":"Required for an update without photos"}><input autoFocus required={!attachments.length&&!props.requirePhotos} value={value.title} onChange={event=>set("title",event.target.value)} placeholder="A new leaf unfurled"/></Field>
        <Field label="What happened?" wide hint="Shared note for this session"><textarea rows={4} value={value.detail} onChange={event=>set("detail",event.target.value)} placeholder="A few words to remember it by…"/></Field>
        <Field label="Kind"><select value={value.eventType} onChange={event=>set("eventType",event.target.value)}>{kinds.map(kind=><option key={kind} value={kind}>{prettyStatus(kind)}</option>)}</select></Field>
        <Field label="Date"><input type="date" required value={value.eventDate} onChange={event=>set("eventDate",event.target.value)}/></Field>
        {!terrariumId&&!session&&props.requirePhotos&&<PlantLinks options={[...choices.values()]} value={plantIds} onChange={ids=>{
          setPlantIds(ids);setAttachments(current=>current.filter(a=>!a.photo||ids.every(id=>(a.photo!.plantIds||[a.photo!.plantId]).includes(id))));
        }}/>}
        {session&&session.plantIds.length>1&&<p className="shared-record-note field-wide">This session is shared across {session.plantIds.length} plants. Changes apply everywhere it appears.</p>}
        <Field label="Photos" wide hint="Select several at once, or choose more later. Up to 20 photos, 20 MB each."><input aria-label="Session photos" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" onChange={event=>{addFiles(Array.from(event.target.files||[]));event.target.value=""}}/></Field>
        <div className="session-attachments field-wide" aria-label="Attached photos">{attachments.map((attachment,index)=><article key={attachment.key}>
          <PhotoPreview attachment={attachment}/><div><strong>{attachment.file?.name||attachment.photo?.originalName}</strong>
            <Field label={`Caption ${index+1}`} hint="Optional; shared wherever this photo appears"><textarea rows={2} value={attachment.caption} onChange={event=>setAttachments(current=>current.map(a=>a.key===attachment.key?{...a,caption:event.target.value}:a))}/></Field>
            <div className="session-attachment-actions"><button type="button" className="text-button" disabled={index===0} aria-label={`Move photo ${index+1} earlier`} onClick={()=>setAttachments(current=>{const next=[...current];[next[index-1],next[index]]=[next[index],next[index-1]];return next})}>Move earlier</button>
              <button type="button" className="text-button" aria-label={`Remove photo ${index+1}`} onClick={()=>setAttachments(current=>current.filter(a=>a.key!==attachment.key))}>Remove from session</button></div>
          </div>
        </article>)}</div>
        {eligible.length>0&&<details className="field-wide session-existing"><summary>Choose existing progress photos</summary><div>{eligible.map(photo=>{
          const checked=attachments.some(a=>a.photo?.id===photo.id);
          return <label key={photo.id}><input type="checkbox" checked={checked} disabled={!checked&&attachments.length>=20} onChange={event=>setAttachments(current=>event.target.checked?[...current,{key:photo.id,photo,caption:photo.caption}]:current.filter(a=>a.photo?.id!==photo.id))}/><img src={photo.url} alt=""/><span>{photo.caption||photo.originalName}<small>{shortDate(photo.dateTaken||photo.createdAt)}</small></span></label>;
        })}</div></details>}
        {attachments.some(a=>a.file)&&<Field label="Tags for new photos" wide><TagInput value={tags} draft={tagDraft} onChange={setTags} onDraftChange={setTagDraft} options={props.options?.tags||[]}/></Field>}
        <p className="field-wide session-help">Photos also appear in Progress photos. Removing an attachment keeps the photo in the gallery. Existing photo dates stay unchanged.</p>
      </fieldset>
      {(fileError||mutation.error)&&<div className="field-wide"><ErrorNote message={fileError||mutation.error}/></div>}
      <div className="field-wide"><FormActions busy={mutation.busy} onCancel={()=>{if(!mutation.isBusy())props.onClose()}} label={session?"Save session":props.requirePhotos?"Add to progress":"Add to history"}/></div>
      {session&&<button type="button" className="button danger-text" disabled={mutation.busy} onClick={()=>setConfirm(true)}>Delete session</button>}
    </form>
    {confirm&&session&&<Confirm title="Delete this session?" copy="The note will be removed. Its photos stay in Progress photos and keep their covers and captions." onClose={()=>setConfirm(false)} onConfirm={async()=>{
      await api.delete(`/api/progress-sessions/${session.id}`);setConfirm(false);props.onDeleted?.();
    }}/>}
  </>;
}
