import { useEffect, useState } from "react";
import { Camera, Check } from "lucide-react";
import { api } from "../api";
import type { Photo } from "../shared/types";
import { ErrorNote, Modal, shortDate } from "./Common";
import { useMutation } from "./Interaction";
import "./CoverPhoto.css";

type Props = { kind: "plant" | "terrarium"; id: string; onSaved: () => void };
const endpoint = (kind: Props["kind"], id: string) => `/api/${kind === "plant" ? "plants" : "terrariums"}/${id}/${kind === "plant" ? "profile-photo" : "cover-photo"}`;
export function MakeCoverButton({ kind, id, photoId, onSaved }: Props & { photoId: string }) {
  const mutation = useMutation();
  return <span className="make-cover"><button type="button" disabled={mutation.busy} onClick={() => void mutation.run(() => api.post(endpoint(kind, id), { photoId }), onSaved)}>{mutation.busy ? "Saving…" : "Make cover"}</button>{mutation.error && <span role="alert">{mutation.error}</span>}</span>;
}
type PickerProps = Props & { photos: Photo[]; currentId: string | null; embedded?: boolean; onBusyChange?: (busy: boolean) => void };
export function CoverPhotoPicker({ kind, id, photos, currentId, onSaved, embedded = false, onBusyChange }: PickerProps) {
  const [pending, setPending] = useState<string | null>(null);
  const mutation = useMutation();
  useEffect(() => { onBusyChange?.(mutation.busy); }, [mutation.busy, onBusyChange]);
  return <div className={`cover-picker ${embedded ? "cover-picker-embedded" : "scroll-form"}`}>
    {mutation.error && <ErrorNote message={mutation.error}/>}
    {photos.length ? <div className="cover-picker-grid">{photos.map(photo => <button type="button" className={currentId === photo.id ? "selected" : ""} key={photo.id} disabled={mutation.busy || currentId === photo.id}
      aria-label={`${currentId === photo.id ? "Current cover" : "Choose cover"}: ${photo.caption || photo.originalName}`} onClick={() => {
        if (mutation.isBusy()) return;
        setPending(photo.id);
        void mutation.run(() => api.post(endpoint(kind, id), { photoId: photo.id }), onSaved);
      }}><img src={photo.url} alt={photo.caption || photo.originalName}/><span><strong>{photo.caption || shortDate(photo.dateTaken || photo.createdAt)}</strong><small>{pending === photo.id && mutation.busy ? "Saving…" : currentId === photo.id ? <><Check size={12}/> Current cover</> : "Use as cover"}</small></span></button>)}</div> : <p>Add a progress photo first, then choose it as this {kind}’s cover.</p>}
  </div>;
}
export function CoverPhotoControl({ kind, id, photos, currentId, onSaved, triggerLabel = "Choose cover photo" }: Props & { photos: Photo[]; currentId: string | null; triggerLabel?: string }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const close = () => { if (!busy) setOpen(false); };
  return <><button type="button" className="button ghost" onClick={() => setOpen(true)}><Camera size={16}/> {triggerLabel}</button>
    <Modal open={open} busy={busy} title="Choose cover photo" subtitle="Choose a photo for this profile and its collection card." wide onClose={close}>
      <CoverPhotoPicker kind={kind} id={id} photos={photos} currentId={currentId} onBusyChange={setBusy} onSaved={() => { setBusy(false); setOpen(false); onSaved(); }}/>
    </Modal>
  </>;
}
