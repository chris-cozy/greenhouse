import { useState } from "react";
import type { AppOptions, Photo, TimelineItem } from "../shared/types";
import { ProgressSessionEditor } from "./ProgressSessionEditor";
import type { ProfileSaved } from "./ProfilePhotos";

export function SessionStory({moment,plantId,terrariumId,photos,options,onSaved}:{moment:TimelineItem;plantId?:string;terrariumId?:string;photos:Photo[];options?:AppOptions;onSaved:ProfileSaved}) {
  const [editing,setEditing]=useState(false);
  return <>
    <div className="session-photo-strip">{moment.photos?.map(photo=><figure key={photo.id}><img src={photo.url} alt={photo.caption||"Growing progress"}/>{photo.caption&&<figcaption>{photo.caption}</figcaption>}</figure>)}</div>
    <button type="button" className="text-button" onClick={()=>setEditing(true)}>Edit session</button>
    {editing&&<ProgressSessionEditor open sessionId={moment.id} plantId={plantId} terrariumId={terrariumId} photos={photos} options={options} onClose={()=>setEditing(false)}
      onSaved={()=>{setEditing(false);onSaved("Session updated.")}} onDeleted={()=>{setEditing(false);onSaved("Session deleted. Photos kept.")}}/>}
  </>;
}
