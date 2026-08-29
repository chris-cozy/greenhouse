import { type FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import type { AppOptions, CareItem, HistoryEventType, Plant, PlantStatus } from "../shared/types";
import { ErrorNote, Field, FormActions, Modal, prettyStatus, splitTags } from "./Common";
import { CoverPhotoPicker } from "./CoverPhoto";
import { useMutation } from "./Interaction";
import { SpritePicker } from "./SpritePicker";

export const plantStatuses: PlantStatus[] = ["healthy", "needs_attention", "recovering", "dormant", "deceased"];
const careTypes = ["watering", "misting", "light", "humidity", "temperature", "fertilization", "pruning", "repotting", "custom"];
const blankPlant = { name: "", spriteImage: "", speciesId: "", description: "", dateAcquired: "", source: "", location: "", terrariumId: "", status: "healthy", dateOfDeath: "", causeOfDeath: "", finalNotes: "", tags: [] as string[] };
const dateInputKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const suggestedReminderDate=(days:number)=>{const date=new Date();date.setHours(12,0,0,0);date.setDate(date.getDate()+days);return dateInputKey(date)};

export function PlantForm({ plant, options, open = true, onClose, onSaved, onCoverSaved }: {
  plant?: Plant; options: AppOptions; open?: boolean; onClose: () => void; onSaved: (plant: Plant) => void; onCoverSaved?: () => void;
}) {
  const [value, setValue] = useState({ ...blankPlant, ...plant, tags: plant?.tags || [] });
  const [tags, setTags] = useState(value.tags.join(", "));
  const [details, setDetails] = useState(false);
  const mutation = useMutation();
  const reset = () => {
    setValue({ ...blankPlant, ...plant, tags: plant?.tags || [] });
    setTags((plant?.tags || []).join(", ")); setDetails(false); mutation.clearError();
  };
  // Reopening an editor reads the latest profile, without resetting an in-progress edit on a refresh.
  useEffect(() => { if (open) reset(); }, [open, plant?.id]);
  const set = (key: string, next: string) => setValue(current => ({ ...current, [key]: next }));
  const close = () => { if (!mutation.isBusy()) onClose(); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const payload = { ...value, name: value.name.trim(), speciesId: value.speciesId || null, terrariumId: value.terrariumId || null, tags: splitTags(tags) };
    void mutation.run(() => plant ? api.put<Plant>(`/api/plants/${plant.id}`, payload) : api.post<Plant>("/api/plants", payload), onSaved);
  };
  const optionalFields = <>
    <Field label="Status"><select value={value.status} onChange={e => set("status", e.target.value)}>{plantStatuses.map(status => <option key={status} value={status}>{prettyStatus(status)}</option>)}</select></Field>
    <Field label="Species"><select value={value.speciesId || ""} onChange={e => set("speciesId", e.target.value)}><option value="">Not identified</option>{options.species.map(species => <option key={species.id} value={species.id}>{species.commonName || species.scientificName}{species.commonName && species.scientificName ? ` · ${species.scientificName}` : ""}</option>)}</select></Field>
    <Field label="Terrarium"><select value={value.terrariumId || ""} onChange={e => set("terrariumId", e.target.value)}><option value="">Standalone</option>{options.terrariums.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    <Field label="Date acquired"><input type="date" value={value.dateAcquired} onChange={e => set("dateAcquired", e.target.value)}/></Field>
    <Field label="Source"><input value={value.source} onChange={e => set("source", e.target.value)} placeholder="Nursery, friend, propagation…"/></Field>
    <Field label="Standalone location" hint="Used when the plant is not in a terrarium"><input value={value.location} onChange={e => set("location", e.target.value)} placeholder="East window, studio shelf…"/></Field>
    <Field label="Tags"><input value={tags} onChange={e => setTags(e.target.value)} placeholder="tropical, favorite, rehab"/></Field>
    <Field label="Description / notes" wide><textarea rows={3} value={value.description} onChange={e => set("description", e.target.value)} placeholder="A little about this plant…"/></Field>
    {value.status === "deceased" && <>
      <div className="form-divider field-wide"><span>End-of-life record</span></div>
      <Field label="Date of death"><input type="date" value={value.dateOfDeath} onChange={e => set("dateOfDeath", e.target.value)}/></Field>
      <Field label="Known or suspected cause"><input value={value.causeOfDeath} onChange={e => set("causeOfDeath", e.target.value)}/></Field>
      <Field label="Final notes" wide><textarea rows={3} value={value.finalNotes} onChange={e => set("finalNotes", e.target.value)}/></Field>
    </>}
  </>;
  return <Modal open={open} onExited={reset} busy={mutation.busy} wide={!!plant || details}
    title={plant ? `Edit ${plant.name}` : "Add a plant"}
    subtitle={plant ? "Keep what matters to this plant’s story." : "A name is enough. The rest can grow with you."} onClose={close}>
    <form className="form-grid scroll-form plant-form" onSubmit={submit}>
      <fieldset className="form-fields" disabled={mutation.busy}>
        <Field label="Personal name" wide={!plant}><input autoFocus required value={value.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Mosslight"/></Field>
        <SpritePicker kind="plant" value={value.spriteImage} allowRandom={!plant} onChange={next => set("spriteImage", next)}/>
        {plant && onCoverSaved && <section className="edit-cover-field field-wide" role="group" aria-labelledby={`plant-cover-heading-${plant.id}`}>
          <div className="edit-cover-heading"><span id={`plant-cover-heading-${plant.id}`}>Cover photo</span><small>Choose which progress photo represents this plant across the greenhouse.</small></div>
          <CoverPhotoPicker kind="plant" id={plant.id} photos={plant.photos || []} currentId={plant.profilePhotoId} embedded onSaved={onCoverSaved}/>
        </section>}
        {plant ? optionalFields : <details className="form-more" open={details} onToggle={e => setDetails(e.currentTarget.open)}><summary>More details</summary><div className="form-grid">{optionalFields}</div></details>}
      </fieldset>
      {mutation.error && <div className="field-wide"><ErrorNote message={mutation.error}/></div>}
      <div className="field-wide"><FormActions onCancel={close} busy={mutation.busy} label={plant ? "Save plant" : "Add to collection"}/></div>
    </form>
  </Modal>;
}

type HistoryOwner = { plantId: string; terrariumId?: never } | { plantId?: never; terrariumId: string };
export function HistoryForm({ plantId, terrariumId, open, onClose, onSaved }: HistoryOwner & { open: boolean; onClose: () => void; onSaved: (id: string) => void }) {
  const initial = () => ({ eventType: "note", eventDate: new Date().toISOString().slice(0, 10), title: "", detail: "" });
  const [value, setValue] = useState(initial);
  const mutation = useMutation();
  const events: HistoryEventType[] = ["health_issue", "recovery", "flowering", "new_growth", "repotted", "pruned", "moved", "note"];
  const close = () => { if (!mutation.isBusy()) onClose(); };
  const reset = () => { setValue(initial()); mutation.clearError(); };
  return <Modal open={open} busy={mutation.busy} onExited={reset} title="Record a meaningful update" subtitle="A small change worth remembering." onClose={close}>
    <form className="form-grid scroll-form" onSubmit={event => {
      event.preventDefault();
      void mutation.run(() => api.post<{ id: string }>("/api/history", { ...value, ...(plantId ? { plantId } : { terrariumId }) }), result => onSaved(result.id));
    }}>
      <fieldset className="form-fields" disabled={mutation.busy}>
        <Field label="Title" wide><input autoFocus required value={value.title} onChange={e => setValue({ ...value, title: e.target.value })} placeholder="A new leaf unfurled"/></Field>
        <Field label="What happened?" wide hint="Optional"><textarea rows={4} value={value.detail} onChange={e => setValue({ ...value, detail: e.target.value })} placeholder="A few words to remember it by…"/></Field>
        <Field label="Kind"><select value={value.eventType} onChange={e => setValue({ ...value, eventType: e.target.value })}>{events.map(type => <option key={type} value={type}>{prettyStatus(type)}</option>)}</select></Field>
        <Field label="Date"><input type="date" value={value.eventDate} onChange={e => setValue({ ...value, eventDate: e.target.value })}/></Field>
      </fieldset>
      {mutation.error && <div className="field-wide"><ErrorNote message={mutation.error}/></div>}
      <div className="field-wide"><FormActions onCancel={close} busy={mutation.busy} label="Add to history"/></div>
    </form>
  </Modal>;
}

export function CareForm({ plantId, item, open, onClose, onSaved }: { plantId: string; item?: CareItem; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState({ activityType: item?.activityType || "watering", customLabel: item?.customLabel || "", guidance: item?.guidance || "", cadenceDays: item?.cadenceDays?.toString() || "", reminderEnabled: item?.reminderEnabled || false, reminderRepeat: item?.reminderRepeat || false, reminderCadenceDays: item?.reminderCadenceDays?.toString() || item?.cadenceDays?.toString() || "", nextReminderDate: item?.nextReminderDate || "", notes: item?.notes || "" });
  const mutation = useMutation();
  const set = (key: string, next: unknown) => setValue(current => ({ ...current, [key]: next }));
  const setReminderEnabled=(enabled:boolean)=>setValue(current=>({...current,reminderEnabled:enabled,nextReminderDate:enabled?(current.nextReminderDate||suggestedReminderDate(Number(current.cadenceDays)||0)):current.nextReminderDate}));
  const setReminderRepeat=(repeat:boolean)=>setValue(current=>({...current,reminderRepeat:repeat,reminderCadenceDays:repeat?(current.reminderCadenceDays||current.cadenceDays||"7"):current.reminderCadenceDays}));
  const close = () => { if (!mutation.isBusy()) onClose(); };
  return <Modal open={open} busy={mutation.busy} title={item ? "Edit care guidance" : "Add care guidance"} subtitle="A preference, not an obligation." onClose={close}>
    <form className="form-grid scroll-form" onSubmit={event => {
      event.preventDefault(); const body = { ...value, cadenceDays: value.cadenceDays ? Number(value.cadenceDays) : null, reminderCadenceDays: value.reminderRepeat&&value.reminderCadenceDays ? Number(value.reminderCadenceDays) : null };
      void mutation.run(() => item ? api.put(`/api/plants/${plantId}/care/${item.id}`, body) : api.post(`/api/plants/${plantId}/care`, body), onSaved);
    }}>
      <fieldset className="form-fields" disabled={mutation.busy}>
        <Field label="Activity"><select value={value.activityType} onChange={e => set("activityType", e.target.value)}>{careTypes.map(type => <option key={type} value={type}>{prettyStatus(type)}</option>)}</select></Field>
        {value.activityType === "custom" && <Field label="Custom label"><input required value={value.customLabel} onChange={e => set("customLabel", e.target.value)}/></Field>}
        <Field label="General guidance" wide><textarea required rows={3} value={value.guidance} onChange={e => set("guidance", e.target.value)} placeholder="Water when the top layer is dry…"/></Field>
        <Field label="Typical cadence (days)"><input type="number" min="1" value={value.cadenceDays} onChange={e => set("cadenceDays", e.target.value)} placeholder="Optional"/></Field>
        <Field label="Occasional notes"><input value={value.notes} onChange={e => set("notes", e.target.value)} placeholder="Seasonal adjustments…"/></Field>
        <label className="toggle field-wide"><input type="checkbox" checked={value.reminderEnabled} onChange={e => setReminderEnabled(e.target.checked)}/><span/><div><strong>Gentle in-app reminder</strong><small>Optional, and never creates a care log.</small></div></label>
        {value.reminderEnabled && <div className="reminder-schedule field-wide">
          <Field label="Reminder schedule"><select value={value.reminderRepeat?"repeating":"one-time"} onChange={e=>setReminderRepeat(e.target.value==="repeating")}><option value="one-time">One time</option><option value="repeating">Repeating</option></select></Field>
          <Field label="First reminder" hint={value.reminderRepeat?"Future reminders use the interval beside it.":undefined}><input type="date" required value={value.nextReminderDate} onChange={e => set("nextReminderDate", e.target.value)}/></Field>
          {value.reminderRepeat&&<Field label="Repeat every (days)"><input type="number" min="1" required value={value.reminderCadenceDays} onChange={e=>set("reminderCadenceDays",e.target.value)}/></Field>}
          <p className="reminder-schedule-note">{value.reminderRepeat?`Done for now will schedule the next reminder ${value.reminderCadenceDays||"—"} days later.`:"Done for now will complete and turn off this one-time reminder."}</p>
        </div>}
      </fieldset>
      {mutation.error && <div className="field-wide"><ErrorNote message={mutation.error}/></div>}
      <div className="field-wide"><FormActions onCancel={close} busy={mutation.busy}/></div>
    </form>
  </Modal>;
}
