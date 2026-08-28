import { useState } from "react";
import { Camera, Image } from "lucide-react";
import type { Photo } from "../shared/types";
import { EmptyState, Modal, PhotoUpload, shortDate } from "./Common";
import { MakeCoverButton } from "./CoverPhoto";
import { Spirit } from "./Spirit";

export type ProfileMoment = { kind: "event" | "photo"; id: string };
export type ProfileSaved = (message: string, moment?: ProfileMoment) => void;

export function ProfilePhotos({ kind, id, photos, coverPhotoId, onSaved, newMoment, onMomentShown, adding: controlledAdding, onAddingChange }: {
  kind: "plant" | "terrarium"; id: string; photos: Photo[]; coverPhotoId: string | null;
  onSaved: ProfileSaved; newMoment: ProfileMoment | null; onMomentShown: () => void;
  adding?: boolean; onAddingChange?: (open: boolean) => void;
}) {
  const [localAdding, setLocalAdding] = useState(false), [uploadBusy, setUploadBusy] = useState(false), [compare, setCompare] = useState(false);
  const adding = controlledAdding ?? localAdding, setAdding = onAddingChange ?? setLocalAdding;
  const [left, setLeft] = useState(photos.at(-1)?.id || ""), [right, setRight] = useState(photos[0]?.id || "");
  const first = photos.find(photo => photo.id === left) || photos.at(-1);
  const second = photos.find(photo => photo.id === right) || photos[0];
  const close = () => { if (!uploadBusy) setAdding(false); };
  return <div>
    <div className="tab-toolbar"><p>Photos are ordered by date taken, so changes stay easy to see.</p><div>
      {photos.length > 1 && <button className="button ghost" onClick={() => setCompare(!compare)}><Image/> {compare ? "Close comparison" : "Compare photos"}</button>}
      <button className="button primary" onClick={() => setAdding(true)}><Camera/> Add photo</button>
    </div></div>
    {compare && photos.length > 1 && <div className="compare-panel"><div className="compare-controls">
      <select aria-label="Earlier photo" value={first?.id || ""} onChange={e => setLeft(e.target.value)}>{photos.map(photo => <option key={photo.id} value={photo.id}>{shortDate(photo.dateTaken || photo.createdAt)} · {photo.caption || "Photo"}</option>)}</select>
      <span>compared with</span>
      <select aria-label="Later photo" value={second?.id || ""} onChange={e => setRight(e.target.value)}>{photos.map(photo => <option key={photo.id} value={photo.id}>{shortDate(photo.dateTaken || photo.createdAt)} · {photo.caption || "Photo"}</option>)}</select>
    </div><div className="compare-images">{[first, second].map((photo, index) => photo && <figure key={`${index}-${photo.id}`}><img src={photo.url} alt={photo.caption || "Growing progress"}/><figcaption><strong>{index ? "Later" : "Earlier"} · {shortDate(photo.dateTaken || photo.createdAt)}</strong><span>{photo.caption}</span></figcaption></figure>)}</div></div>}
    {photos.length ? <div className="photo-grid">{photos.map(photo => <figure key={photo.id}
      className={newMoment?.kind === "photo" && newMoment.id === photo.id ? "new-moment" : ""} onAnimationEnd={onMomentShown}>
      <img src={photo.url} alt={photo.caption || (kind === "plant" ? "Plant progress" : "Habitat progress")}/><figcaption><div><strong>{shortDate(photo.dateTaken || photo.createdAt)}</strong><span>{photo.caption || "A moment in its story."}</span></div>
        {coverPhotoId !== photo.id ? <MakeCoverButton kind={kind} id={id} photoId={photo.id} onSaved={() => onSaved("Cover photo updated.")}/> : <span className="cover-label">Cover</span>}
      </figcaption>
    </figure>)}</div> : <EmptyState icon={<Spirit id={id} kind={kind} size="empty"/>} title={kind === "plant" ? "No progress photos yet" : "No habitat photos yet"} copy="A single photo is enough to begin a visual history." action={<button className="button primary" onClick={() => setAdding(true)}>Add a photo</button>}/>}
    <Modal open={adding} busy={uploadBusy} title={kind === "plant" ? "Add a progress photo" : "Add a habitat photo"} onClose={close}>
      <PhotoUpload {...(kind === "plant" ? { plantId: id } : { terrariumId: id })} onBusyChange={setUploadBusy} onDone={photo => {
        setAdding(false); onSaved("Photo added to your growing story.", { kind: "photo", id: photo.id });
      }}/>
    </Modal>
  </div>;
}
