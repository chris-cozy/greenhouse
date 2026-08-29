import { useEffect, useRef, useState } from "react";
import { Archive, ArrowLeft, CalendarDays, Camera, ChevronRight, CircleAlert, Droplets, Edit3, Flower2, History, Leaf, MapPin, Plus, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import type { AppOptions, CareItem, Plant } from "../shared/types";
import { Confirm, EmptyState, ErrorNote, Loading, PageHeader, RefreshNote, Tags, prettyStatus, shortDate, useLoad } from "./Common";
import { CareForm, HistoryForm, PlantForm, plantStatuses } from "./PlantForms";
import { Spirit } from "./Spirit";
import { ProfileTabs } from "./ProfileTabs";
import { ProfilePhotos, type ProfileMoment, type ProfileSaved } from "./ProfilePhotos";
import { SaveFeedback, useFeedback, useMutation } from "./Interaction";

export function PlantsPage({ options, onAddPlant }: { options: AppOptions; onAddPlant: () => void }) {
  const [scope, setScope] = useState("living"), [q, setQ] = useState("");
  const [status, setStatus] = useState(""), [terrarium, setTerrarium] = useState(""), [tag, setTag] = useState("");
  const navigate = useNavigate();
  const params = new URLSearchParams({ scope });
  if (q) params.set("q", q); if (status) params.set("status", status);
  if (terrarium) params.set("terrariumId", terrarium); if (tag) params.set("tag", tag);
  const { data: plants, loading, error } = useLoad<Plant[]>(`/api/plants?${params}`);
  return <div className="content plant-collection living-collection">
    <PageHeader eyebrow="Plant collection" title="The Living Archive" description="Browse the plants in your care, without turning care into paperwork."
      action={<button className="button primary" onClick={onAddPlant}><Plus/> Add plant</button>}/>
    <div className="collection-tools">
      <label className="inline-search"><Leaf/><input aria-label="Search plants" value={q} onChange={e => setQ(e.target.value)} placeholder="Search plants or locations…"/></label>
      <select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)}><option value="">Any status</option>{plantStatuses.map(value => <option value={value} key={value}>{prettyStatus(value)}</option>)}</select>
      <select aria-label="Filter by location" value={terrarium} onChange={e => setTerrarium(e.target.value)}><option value="">Any location</option>{options.terrariums.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
      <select aria-label="Filter by tag" value={tag} onChange={e => setTag(e.target.value)}><option value="">Any tag</option>{options.tags.map(value => <option key={value}>{value}</option>)}</select>
    </div>
    <div className="scope-tabs">{[["living", "Living"], ["deceased", "Deceased"], ["archived", "Archived"], ["all", "All"]].map(([id, label]) => <button className={scope === id ? "active" : ""} aria-pressed={scope === id} onClick={() => setScope(id)} key={id}>{label}</button>)}</div>
    {loading ? <Loading/> : error ? <ErrorNote message={error}/> : plants?.length ? <div className="collection-grid">{plants.map(plant =>
      <button className="collection-card" key={plant.id} onClick={() => navigate(`/plants/${plant.id}`)}>
        <div className={`card-photo ${plant.profilePhotoUrl ? "has-photo" : ""}`} style={plant.profilePhotoUrl ? { backgroundImage: `url(${plant.profilePhotoUrl})` } : undefined}>
          {!plant.profilePhotoUrl && <Leaf/>}<span className={`status ${plant.status}`}>{prettyStatus(plant.status)}</span>
        </div>
        <div className="card-body"><div><Spirit id={plant.id}/><div className="plant-name-copy"><h2>{plant.name}</h2><em>{plant.speciesCommonName || "Unidentified plant"}</em></div></div>
          <p>{plant.terrariumName || plant.location || "Location not set"}</p><Tags items={plant.tags}/><small>Updated {shortDate(plant.updatedAt)}</small>
        </div>
      </button>)}</div> : <EmptyState icon={<Spirit id="new-plant" size="empty"/>} title={scope === "living" ? "Your greenhouse is ready" : "No plants here"}
        copy={scope === "living" ? "Add your first plant. A name is enough to begin its story." : "Try another collection view or filter."}
        action={scope === "living" ? <button className="button primary" onClick={onAddPlant}><Plus/> Add your first plant</button> : undefined}/>}
  </div>;
}

const profileTabs = [["story", "Story"], ["care", "Care guidance"], ["photos", "Progress photos"], ["about", "Current details"]] as const;
type ProfileTab = typeof profileTabs[number][0];
type ProfileProps = { options: AppOptions; refreshOptions: () => void; welcomePlantId?: string | null; onWelcomeShown?: () => void };
export function PlantDetailPage(props: ProfileProps) {
  const { id = "" } = useParams();
  return <PlantDetail key={id} id={id} {...props}/>;
}

function PlantDetail({ id, options, refreshOptions, welcomePlantId, onWelcomeShown }: ProfileProps & { id: string }) {
  const navigate = useNavigate();
  const { data: plant, loading, error, reload, refreshing, refreshError } = useLoad<Plant>(`/api/plants/${id}`);
  const [tab, setTab] = useState<ProfileTab>("story"), [hasTabbed, setHasTabbed] = useState(false);
  const [editing, setEditing] = useState(false), [history, setHistory] = useState(false), [confirm, setConfirm] = useState(false);
  const [care, setCare] = useState<{ item?: CareItem; version: number } | null>(null), [careOpen, setCareOpen] = useState(false);
  const [newMoment, setNewMoment] = useState<ProfileMoment | null>(null);
  const { feedback, settling, announce } = useFeedback();
  const welcomeShown = useRef(false);
  const archive = useMutation();
  useEffect(() => {
    if (plant && welcomePlantId === id && !welcomeShown.current) {
      welcomeShown.current = true; announce(`Welcome to the greenhouse, ${plant.name}.`); onWelcomeShown?.();
    }
  }, [plant, welcomePlantId, id, announce, onWelcomeShown]);
  useEffect(() => {
    if (!newMoment) return;
    const timer = window.setTimeout(() => setNewMoment(null), 4500);
    return () => window.clearTimeout(timer);
  }, [newMoment]);
  const saved: ProfileSaved = (message, moment) => {
    announce(message); if (moment) setNewMoment(moment);
    void reload({ background: true }); refreshOptions();
  };
  const openCare = (item?: CareItem) => { setCare(current => ({ item, version: (current?.version || 0) + 1 })); setCareOpen(true); };
  if (loading) return <div className="content plant-profile living-profile"><Loading/></div>;
  if (error || !plant) return <div className="content plant-profile living-profile"><ErrorNote message={error || "Plant not found."}/><button className="button ghost" onClick={() => void reload()}>Retry</button></div>;
  const place = plant.terrariumName || plant.location || "Location not set";
  const panel = (key: ProfileTab) => ({ id: `plant-panel-${key}`, role: "tabpanel", "aria-labelledby": `plant-tab-${key}`, hidden: tab !== key, className: `plant-tab-panel profile-tab-panel ${tab === key && hasTabbed ? "is-transitioning" : ""}` });
  return <div className="plant-profile living-profile">
    <section className="plant-summary-shell"><div className={`detail-hero plant-summary-card ${plant.profilePhotoUrl ? "photo-hero" : ""}`} style={plant.profilePhotoUrl ? { backgroundImage: `linear-gradient(90deg,rgba(16,26,20,.96),rgba(16,26,20,.36)),url(${plant.profilePhotoUrl})` } : undefined}>
      <div className="detail-hero-inner">
        <div className="profile-summary-toolbar"><button className="back-link" onClick={() => navigate("/plants")}><ArrowLeft/> Collection</button>
          <button className="button ghost profile-summary-edit" onClick={() => setEditing(true)}><Edit3/> Edit</button>
        </div>
        <div className="hero-copy"><div className="profile-identity"><Spirit key={feedback?.sequence || 0} id={plant.id} size="profile" motion={settling ? "settle" : "idle"}/><div>
          <span className={`status ${plant.status}`}>{prettyStatus(plant.status)}</span><h1>{plant.name}</h1>
          <em>{plant.speciesCommonName || "Unidentified plant"}{plant.speciesScientificName && ` · ${plant.speciesScientificName}`}</em>
        </div></div><p>{plant.description || "This plant’s story is just beginning."}</p>
          <div className="hero-meta"><span><MapPin/> {place}</span>{plant.dateAcquired && <span><CalendarDays/> Acquired {shortDate(plant.dateAcquired)}</span>}
            <span><Leaf/> {plant.source || "Source not recorded"}</span><span><Camera/> {plant.photos?.length || 0} {(plant.photos?.length || 0) === 1 ? "photo" : "photos"}</span>
          </div><Tags items={plant.tags}/>
        </div>
        <SaveFeedback message={feedback?.message} sequence={feedback?.sequence}/>
      </div>
    </div></section>
    <div className="detail-content">
      <div className="plant-record">
        <ProfileTabs tabs={profileTabs} prefix="plant" label="Plant profile" selected={tab} onSelect={next => { setHasTabbed(true); setTab(next); }}/>
        <RefreshNote refreshing={refreshing} error={refreshError} onRetry={() => void reload({ background: true })}/>
        <div className="plant-tab-content profile-tab-content">
        <section {...panel("story")}><div className="story-layout"><div>
          <div className="section-heading"><div><span className="eyebrow">Meaningful changes</span><h2>The story so far</h2></div><button className="button primary" onClick={() => setHistory(true)}><Plus/> Add update</button></div>
          {plant.history?.length ? <div className="timeline">{plant.history.map(item => <article key={`${item.kind}-${item.id}`}
            className={`${item.kind} ${newMoment?.id === item.id && newMoment.kind === item.kind ? "new-moment" : ""}`} onAnimationEnd={() => setNewMoment(null)}>
            <div className={`timeline-mark ${item.kind}`}>{item.kind === "photo" ? <Camera/> : item.kind === "journal" ? <Flower2/> : <History/>}</div>
            <div><time>{shortDate(item.date)}</time><h3>{item.title}</h3><p>{item.detail}</p>{item.photoUrl && <img src={item.photoUrl} alt={item.detail || "Plant progress"}/>}
              {item.journalId && <Link to={`/journal/${item.journalId}`}>Read journal entry <ChevronRight/></Link>}
            </div>
          </article>)}</div> : <EmptyState icon={<Spirit id={plant.id} size="empty"/>} title="Its story starts here" copy="Acquisition, photos, journal entries, and meaningful updates will gather into this timeline."/>}
        </div>{plant.status === "deceased" && <aside className="story-aside memorial-aside"><div className="memorial-card"><Leaf/><span className="eyebrow">Remembered</span><h3>{plant.dateOfDeath ? shortDate(plant.dateOfDeath) : "Date unknown"}</h3><p>{plant.causeOfDeath || "Cause not recorded"}</p><small>{plant.finalNotes}</small></div></aside>}</div></section>
        <section {...panel("care")}><div className="tab-toolbar"><p>Guidance lives here without asking you to log every watering.</p><button className="button primary" onClick={() => openCare()}><Plus/> Add guidance</button></div>
          {plant.careItems?.length ? <div className="care-grid">{plant.careItems.map(item => <article className="care-card" key={item.id}><div className="care-icon">{item.activityType === "watering" || item.activityType === "misting" ? <Droplets/> : <Leaf/>}</div><div><span className="eyebrow">{item.customLabel || prettyStatus(item.activityType)}</span><h3>{item.guidance}</h3>{item.notes && <p>{item.notes}</p>}<footer>{item.cadenceDays && <span>About every {item.cadenceDays} days</span>}{item.reminderEnabled && <span className="reminder-pill"><CircleAlert/> Reminder {shortDate(item.nextReminderDate)}</span>}<button onClick={() => openCare(item)}>Edit</button></footer></div></article>)}</div> : <EmptyState icon={<Spirit id={plant.id} size="empty"/>} title="Care that fits this plant" copy="Add general guidance such as “water when the top layer is dry.” Schedules are optional." action={<button className="button primary" onClick={() => openCare()}>Add guidance</button>}/>}
        </section>
        <section {...panel("photos")}><ProfilePhotos kind="plant" id={plant.id} photos={plant.photos || []} coverPhotoId={plant.profilePhotoId} onSaved={saved} newMoment={newMoment} onMomentShown={() => setNewMoment(null)}/></section>
        <section {...panel("about")}><div className="about-grid"><article className="fact-card"><span className="eyebrow">Current profile</span><dl>
          <div><dt>Species</dt><dd>{plant.speciesCommonName || "Not identified"}</dd></div><div><dt>Scientific name</dt><dd>{plant.speciesScientificName || "—"}</dd></div><div><dt>Acquired</dt><dd>{plant.dateAcquired ? shortDate(plant.dateAcquired) : "Not recorded"}</dd></div><div><dt>Source</dt><dd>{plant.source || "Not recorded"}</dd></div><div><dt>Location</dt><dd>{place}</dd></div>
        </dl></article><article className="danger-card"><Archive/><h3>Collection controls</h3><p>Archive hides this plant without losing its story. Permanent deletion removes its records and photos.</p><div>
          <button className="button ghost" disabled={archive.busy} onClick={() => void archive.run(() => api.post(`/api/plants/${plant.id}/archive`, { archived: !plant.archivedAt }), () => { refreshOptions(); navigate("/plants"); })}>{plant.archivedAt ? "Return to collection" : "Archive plant"}</button>
          <button className="button danger-text" onClick={() => setConfirm(true)}><Trash2/> Delete</button>
        </div>{archive.error && <ErrorNote message={archive.error}/>}</article></div></section>
        </div>
      </div>
    </div>
    <PlantForm open={editing} plant={plant} options={options} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); saved("Plant details saved."); }} onCoverSaved={() => saved("Cover photo updated.")}/>
    {care && <CareForm key={care.version} open={careOpen} plantId={plant.id} item={care.item} onClose={() => setCareOpen(false)} onSaved={() => { setCareOpen(false); saved("Care guidance saved."); }}/>}
    <HistoryForm open={history} plantId={plant.id} onClose={() => setHistory(false)} onSaved={eventId => { setHistory(false); saved("A new moment added to the story.", { kind: "event", id: eventId }); }}/>
    {confirm && <Confirm title={`Delete ${plant.name}?`} copy="This permanently removes the profile, photos, care guidance, and history. Linked journal entries remain, with this plant link removed." onClose={() => setConfirm(false)} onConfirm={async () => { await api.delete(`/api/plants/${plant.id}`); refreshOptions(); navigate("/plants"); }}/>}
  </div>;
}
