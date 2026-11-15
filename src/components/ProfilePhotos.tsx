import { useState } from "react";
import { Camera, Image } from "lucide-react";
import type { AppOptions, Photo } from "../shared/types";
import { EmptyState, Modal, PhotoUpload, shortDate } from "./Common";
import { MakeCoverButton } from "./CoverPhoto";
import { ProgressSessionEditor } from "./ProgressSessionEditor";
import { Spirit } from "./Spirit";

export type ProfileMoment = { kind: "event" | "photo" | "session"; id: string };
export type ProfileSaved = (message: string, moment?: ProfileMoment) => void;

export function ProfilePhotos({ kind, id, options, spriteImage, photos, coverPhotoId, onSaved, newMoment, onMomentShown, adding: controlledAdding, onAddingChange }: {
  kind: "plant" | "terrarium"; id: string; options?:AppOptions; spriteImage?: string; photos: Photo[]; coverPhotoId: string | null;
  onSaved: ProfileSaved; newMoment: ProfileMoment | null; onMomentShown: () => void;
  adding?: boolean; onAddingChange?: (open: boolean) => void;
}) {
  const [sessionId,setSessionId]=useState<string|null>(null);
  const [editing,setEditing]=useState<Photo|null>(null),[editOpen,setEditOpen]=useState(false);
  const [localAdding, setLocalAdding] = useState(false), [uploadBusy, setUploadBusy] = useState(false), [compare, setCompare] = useState(false);
  const adding = controlledAdding ?? localAdding, setAdding = onAddingChange ?? setLocalAdding;
  const [left, setLeft] = useState(photos.at(-1)?.id || ""), [right, setRight] = useState(photos[0]?.id || "");
  const first = photos.find(photo => photo.id === left) || photos.at(-1);
  const second = photos.find(photo => photo.id === right) || photos[0];
  return <div>
    <div className="tab-toolbar"><p>Photos are ordered by date taken, so changes stay easy to see.</p><div>
      {photos.length > 1 && <button className="button ghost" onClick={() => setCompare(!compare)}><Image/> {compare ? "Close comparison" : "Compare photos"}</button>}
      <button className="button primary" onClick={() => setAdding(true)}><Camera/> Add photos</button>
    </div></div>
    {compare && photos.length > 1 && <div className="compare-panel"><div className="compare-controls">
      <select aria-label="Earlier photo" value={first?.id || ""} onChange={e => setLeft(e.target.value)}>{photos.map(photo => <option key={photo.id} value={photo.id}>{shortDate(photo.dateTaken || photo.createdAt)} · {photo.caption || "Photo"}</option>)}</select>
      <span>compared with</span>
      <select aria-label="Later photo" value={second?.id || ""} onChange={e => setRight(e.target.value)}>{photos.map(photo => <option key={photo.id} value={photo.id}>{shortDate(photo.dateTaken || photo.createdAt)} · {photo.caption || "Photo"}</option>)}</select>
    </div><div className="compare-images">{[first, second].map((photo, index) => photo && <figure key={`${index}-${photo.id}`}><img src={photo.url} alt={photo.caption || "Growing progress"}/><figcaption><strong>{index ? "Later" : "Earlier"} · {shortDate(photo.dateTaken || photo.createdAt)}</strong><span>{photo.caption}</span></figcaption></figure>)}</div></div>}
    {photos.length ? <div className="photo-grid">{photos.map(photo => <figure key={photo.id}
      className={(newMoment?.kind === "photo" || newMoment?.kind === "session") && (newMoment.id === photo.id || photo.sessions?.some(session=>session.id===newMoment.id)) ? "new-moment" : ""} onAnimationEnd={onMomentShown}>
      <img src={photo.url} alt={photo.caption || (kind === "plant" ? "Plant progress" : "Habitat progress")}/><figcaption><div><strong>{shortDate(photo.dateTaken || photo.createdAt)}</strong><span>{photo.caption || "A moment in its story."}</span></div>
        <div className="photo-session-links">{photo.sessions?.map(session=><button type="button" className="text-button" key={session.id} onClick={()=>setSessionId(session.id)}>Edit session · {session.title}</button>)}</div>
        <button type="button" className="text-button" onClick={()=>{setEditing(photo);setEditOpen(true)}}>Edit photo</button>
        {coverPhotoId !== photo.id ? <MakeCoverButton kind={kind} id={id} photoId={photo.id} onSaved={() => onSaved("Cover photo updated.")}/> : <span className="cover-label">Cover</span>}
      </figcaption>
    </figure>)}</div> : <EmptyState icon={<Spirit id={id} spriteImage={spriteImage} kind={kind} size="empty"/>} title={kind === "plant" ? "No progress photos yet" : "No habitat photos yet"} copy="A single photo is enough to begin a visual history." action={<button className="button primary" onClick={() => setAdding(true)}>Add photos</button>}/>}
    <ProgressSessionEditor open={adding} requirePhotos photos={photos} options={options} {...(kind==="plant"?{plantId:id}:{terrariumId:id})} onClose={()=>setAdding(false)} onSaved={session=>{
      setAdding(false);onSaved("Photos added to your growing story.",{kind:"session",id:session.id});
    }}/>
    {sessionId&&<ProgressSessionEditor open sessionId={sessionId} photos={photos} options={options} {...(kind==="plant"?{plantId:id}:{terrariumId:id})} onClose={()=>setSessionId(null)} onSaved={()=>{setSessionId(null);onSaved("Session updated.")}} onDeleted={()=>{setSessionId(null);onSaved("Session deleted. Photos kept.")}}/>}
    <Modal open={editOpen} onExited={()=>setEditing(null)} busy={uploadBusy} title="Edit progress photo" onClose={()=>{if(!uploadBusy)setEditOpen(false)}}>
      {editing&&<PhotoUpload key={editing.id} photo={editing} terrariumId={editing.terrariumId||undefined} options={options} onBusyChange={setUploadBusy} onDone={()=>{setUploadBusy(false);setEditOpen(false);onSaved(kind==="plant"?"Photo updated across linked plants.":"Photo updated.")}}/>}
    </Modal>
  </div>;
}
