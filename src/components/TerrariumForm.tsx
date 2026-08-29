import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import type { Terrarium } from "../shared/types";
import { ErrorNote, Field, FormActions, Modal } from "./Common";
import { CoverPhotoPicker } from "./CoverPhoto";
import { useMutation } from "./Interaction";
import { SpritePicker } from "./SpritePicker";

const blankTerrarium = { name: "", spriteImage: "", description: "", dateCreated: "", type: "", location: "", lightingSetup: "", humidityRequirements: "", wateringNotes: "", substrateInformation: "", notes: "", otherInhabitants: "" };

export function TerrariumForm({ item, open = true, onClose, onSaved, onCoverSaved }: {
  item?: Terrarium; open?: boolean; onClose: () => void; onSaved: (terrarium: Terrarium) => void; onCoverSaved?: () => void;
}) {
  const [value, setValue] = useState({ ...blankTerrarium, ...item });
  const [details, setDetails] = useState(false);
  const mutation = useMutation();
  const reset = () => { setValue({ ...blankTerrarium, ...item }); setDetails(false); mutation.clearError(); };
  useEffect(() => { if (open) reset(); }, [open, item?.id]);
  const set = (key: keyof typeof blankTerrarium, next: string) => setValue(current => ({ ...current, [key]: next }));
  const close = () => { if (!mutation.isBusy()) onClose(); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const payload = { ...value, name: value.name.trim() };
    void mutation.run(() => item ? api.put<Terrarium>(`/api/terrariums/${item.id}`, payload) : api.post<Terrarium>("/api/terrariums", payload), onSaved);
  };
  const optional = <>
    <Field label="Type"><input value={value.type} onChange={e => set("type", e.target.value)} placeholder="Closed tropical, arid…"/></Field>
    <Field label="Date created"><input type="date" value={value.dateCreated} onChange={e => set("dateCreated", e.target.value)}/></Field>
    <Field label="Location"><input value={value.location} onChange={e => set("location", e.target.value)} placeholder="A quiet corner, a sunny shelf…"/></Field>
    <Field label="Description" wide><textarea rows={3} value={value.description} onChange={e => set("description", e.target.value)}/></Field>
    <div className="form-divider field-wide"><span>Environment</span></div>
    <Field label="Lighting setup"><textarea rows={3} value={value.lightingSetup} onChange={e => set("lightingSetup", e.target.value)}/></Field>
    <Field label="Humidity requirements"><textarea rows={3} value={value.humidityRequirements} onChange={e => set("humidityRequirements", e.target.value)}/></Field>
    <Field label="Watering / misting"><textarea rows={3} value={value.wateringNotes} onChange={e => set("wateringNotes", e.target.value)}/></Field>
    <Field label="Substrate"><textarea rows={3} value={value.substrateInformation} onChange={e => set("substrateInformation", e.target.value)}/></Field>
    <Field label="Other inhabitants" wide><input value={value.otherInhabitants} onChange={e => set("otherInhabitants", e.target.value)} placeholder="Springtails, isopods…"/></Field>
    <Field label="Other notes" wide><textarea rows={3} value={value.notes} onChange={e => set("notes", e.target.value)}/></Field>
  </>;
  return <Modal open={open} onExited={reset} busy={mutation.busy} wide={!!item || details} title={item ? `Edit ${item.name}` : "Add a terrarium"}
    subtitle={item ? "Keep what matters to this little world." : "A name is enough. Its little world can grow from here."} onClose={close}>
    <form className="form-grid scroll-form terrarium-form" onSubmit={submit}>
      <fieldset className="form-fields" disabled={mutation.busy}>
        <Field label="Personal name" wide={!item}><input autoFocus required value={value.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Cloud Forest"/></Field>
        <SpritePicker kind="terrarium" value={value.spriteImage} allowRandom={!item} onChange={next => set("spriteImage", next)}/>
        {item && onCoverSaved && <section className="edit-cover-field field-wide" role="group" aria-labelledby={`terrarium-cover-heading-${item.id}`}>
          <div className="edit-cover-heading"><span id={`terrarium-cover-heading-${item.id}`}>Cover photo</span><small>Choose which habitat photo represents this terrarium across the greenhouse.</small></div>
          <CoverPhotoPicker kind="terrarium" id={item.id} photos={item.photos || []} currentId={item.coverPhotoId} embedded onSaved={onCoverSaved}/>
        </section>}
        {item ? optional : <details className="form-more" open={details} onToggle={e => setDetails(e.currentTarget.open)}><summary>More details</summary><div className="form-grid">{optional}</div></details>}
      </fieldset>
      {mutation.error && <div className="field-wide"><ErrorNote message={mutation.error}/></div>}
      <div className="field-wide"><FormActions onCancel={close} busy={mutation.busy} label={item ? "Save terrarium" : "Add to collection"}/></div>
    </form>
  </Modal>;
}
