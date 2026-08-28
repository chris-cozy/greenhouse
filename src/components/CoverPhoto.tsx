import { useState } from "react";
import { Camera, Check } from "lucide-react";
import { api } from "../api";
import type { Photo } from "../shared/types";
import { ErrorNote, Modal, shortDate } from "./Common";
import "./CoverPhoto.css";

type Props={kind:"plant"|"terrarium";id:string;onSaved:()=>void};
const endpoint=(kind:Props["kind"],id:string)=>`/api/${kind==="plant"?"plants":"terrariums"}/${id}/${kind==="plant"?"profile-photo":"cover-photo"}`;
export function MakeCoverButton({kind,id,photoId,onSaved}:Props&{photoId:string}){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  return <span className="make-cover"><button disabled={busy} onClick={async()=>{setBusy(true);setError("");try{await api.post(endpoint(kind,id),{photoId});onSaved()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>{busy?"Saving…":"Make cover"}</button>{error&&<span role="alert">{error}</span>}</span>;
}
export function CoverPhotoControl({kind,id,photos,currentId,onSaved}:Props&{photos:Photo[];currentId:string|null}){
  const [open,setOpen]=useState(false),[pending,setPending]=useState<string|null>(null),[error,setError]=useState("");
  return <><button className="button ghost" onClick={()=>{setError("");setOpen(true)}}><Camera size={16}/> Choose cover photo</button>
    {open&&<Modal title="Choose cover photo" subtitle="Choose a photo for this profile and its collection card." wide onClose={()=>{if(!pending)setOpen(false)}}><div className="cover-picker scroll-form">
      {error&&<ErrorNote message={error}/>}
      {photos.length?<div className="cover-picker-grid">{photos.map(photo=><button className={currentId===photo.id?"selected":""} key={photo.id} disabled={!!pending||currentId===photo.id} aria-label={`${currentId===photo.id?"Current cover":"Choose cover"}: ${photo.caption||photo.originalName}`} onClick={async()=>{setPending(photo.id);setError("");try{await api.post(endpoint(kind,id),{photoId:photo.id});setOpen(false);onSaved()}catch(e){setError((e as Error).message)}finally{setPending(null)}}}><img src={photo.url} alt={photo.caption||photo.originalName}/><span><strong>{photo.caption||shortDate(photo.dateTaken||photo.createdAt)}</strong><small>{pending===photo.id?"Saving…":currentId===photo.id?<><Check size={12}/> Current cover</>:"Use as cover"}</small></span></button>)}</div>:<p>Add a progress photo first, then choose it as this {kind}’s cover.</p>}
    </div></Modal>}
  </>;
}
