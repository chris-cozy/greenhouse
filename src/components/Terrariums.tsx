import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Camera, ChevronRight, Edit3, Flower2, History, Leaf, MapPin, Plus, Sprout, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import type { Terrarium } from "../shared/types";
import { Confirm, EmptyState, ErrorNote, Loading, PageHeader, RefreshNote, shortDate, useLoad } from "./Common";
import { HistoryForm } from "./PlantForms";
import { TerrariumForm } from "./TerrariumForm";
import { ProfilePhotos, type ProfileMoment, type ProfileSaved } from "./ProfilePhotos";
import { ProfileTabs } from "./ProfileTabs";
import { Spirit } from "./Spirit";
import { SaveFeedback, useFeedback } from "./Interaction";

export function TerrariumsPage({ onAddTerrarium }: { onAddTerrarium: () => void }) {
  const [q, setQ] = useState("");
  const { data, loading, error } = useLoad<Terrarium[]>(`/api/terrariums?q=${encodeURIComponent(q)}`);
  const navigate = useNavigate();
  return <div className="content living-collection terrarium-collection">
    <PageHeader eyebrow="Terrariums" title="Miniature Ecosystems" description="See every habitat as a whole, and every plant living within it."
      action={<button className="button primary" onClick={onAddTerrarium}><Plus/> Add terrarium</button>}/>
    <div className="collection-tools"><label className="inline-search"><Sprout/><input aria-label="Search terrariums" value={q} onChange={e => setQ(e.target.value)} placeholder="Search terrariums…"/></label></div>
    {loading ? <Loading/> : error ? <ErrorNote message={error}/> : data?.length ? <div className="collection-grid terrarium-grid">{data.map(item => <button className="collection-card terrarium-card" key={item.id} onClick={() => navigate(`/terrariums/${item.id}`)}>
      <div className="card-photo terrarium-photo" style={item.coverPhotoUrl ? { backgroundImage: `url(${item.coverPhotoUrl})` } : undefined}>
        {!item.coverPhotoUrl && <div className="glass-shape"><Sprout/></div>}
      </div>
      <div className="card-body"><div><Spirit id={item.id} spriteImage={item.spriteImage} kind="terrarium"/><div className="plant-name-copy"><h2>{item.name}</h2><em>{item.type || "Living habitat"}</em></div></div>
        <p>{item.description || "A growing miniature world."}</p>
        <footer><span><Leaf/> {item.plantCount} {item.plantCount === 1 ? "plant" : "plants"}</span><span><MapPin/> {item.location || "Location not set"}</span></footer>
      </div>
    </button>)}</div> : <EmptyState icon={<Spirit id="new-terrarium" kind="terrarium" size="empty"/>}
      title={q ? "No terrariums found" : "Build your first little world"}
      copy={q ? "Try another name or habitat description." : "A name is enough to begin. Habitat details, residents, and photos can come later."}
      action={<button className="button primary" onClick={onAddTerrarium}><Plus/> Add terrarium</button>}/>}
  </div>;
}

const terrariumTabs = [["story", "Story"], ["residents", "Residents"], ["photos", "Habitat photos"], ["environment", "Environment"]] as const;
type TerrariumTab = typeof terrariumTabs[number][0];
type ProfileProps = { refreshOptions: () => void; welcomeTerrariumId?: string | null; onWelcomeShown?: () => void };

export function TerrariumDetailPage(props: ProfileProps) {
  const { id = "" } = useParams();
  return <TerrariumDetail key={id} id={id} {...props}/>;
}

function TerrariumDetail({ id, refreshOptions, welcomeTerrariumId, onWelcomeShown }: ProfileProps & { id: string }) {
  const navigate = useNavigate();
  const { data: item, loading, error, reload, refreshing, refreshError } = useLoad<Terrarium>(`/api/terrariums/${id}`);
  const [tab, setTab] = useState<TerrariumTab>("story"), [hasTabbed, setHasTabbed] = useState(false);
  const [editing, setEditing] = useState(false), [history, setHistory] = useState(false), [addingPhoto, setAddingPhoto] = useState(false), [confirm, setConfirm] = useState(false);
  const [newMoment, setNewMoment] = useState<ProfileMoment | null>(null);
  const { feedback, settling, announce } = useFeedback();
  const welcomeShown = useRef(false);
  useEffect(() => {
    if (item && welcomeTerrariumId === id && !welcomeShown.current) {
      welcomeShown.current = true; announce(`Welcome to the greenhouse, ${item.name}.`); onWelcomeShown?.();
    }
  }, [item, welcomeTerrariumId, id, announce, onWelcomeShown]);
  useEffect(() => {
    if (!newMoment) return;
    const timer = window.setTimeout(() => setNewMoment(null), 4500);
    return () => window.clearTimeout(timer);
  }, [newMoment]);
  const saved: ProfileSaved = (message, moment) => {
    announce(message); if (moment) setNewMoment(moment);
    void reload({ background: true }); refreshOptions();
  };
  const selectTab = (next: TerrariumTab) => { setTab(next); setHasTabbed(true); };
  if (loading) return <div className="content living-profile terrarium-profile"><Loading/></div>;
  if (error || !item) return <div className="content living-profile terrarium-profile"><ErrorNote message={error || "Terrarium not found."}/><button className="button ghost" onClick={() => void reload()}>Retry</button></div>;
  const residents = (item.plants || []).filter(plant => !plant.archivedAt);
  const photoCount = item.photos?.length || 0;
  const panel = (key: TerrariumTab) => ({ id: `terrarium-panel-${key}`, role: "tabpanel", "aria-labelledby": `terrarium-tab-${key}`, hidden: tab !== key, className: `profile-tab-panel ${tab === key && hasTabbed ? "is-transitioning" : ""}` });
  return <div className="living-profile terrarium-profile">
    <section className="terrarium-summary-shell"><div className={`detail-hero terrarium-hero terrarium-summary-card ${item.coverPhotoUrl ? "photo-hero" : ""}`} style={item.coverPhotoUrl ? { backgroundImage: `linear-gradient(90deg,rgba(16,26,20,.96),rgba(16,26,20,.36)),url(${item.coverPhotoUrl})` } : undefined}>
      <div className="detail-hero-inner">
        <div className="profile-summary-toolbar"><button className="back-link" onClick={() => navigate("/terrariums")}><ArrowLeft/> Terrariums</button>
          <button className="button ghost profile-summary-edit" onClick={() => setEditing(true)}><Edit3/> Edit</button>
        </div>
        <div className="hero-copy"><div className="profile-identity"><Spirit key={feedback?.sequence || 0} id={item.id} spriteImage={item.spriteImage} kind="terrarium" size="profile" motion={settling ? "settle" : "idle"}/><div>
          <span className="eyebrow">{item.type || "Living habitat"}</span><h1>{item.name}</h1>
        </div></div><p>{item.description || "This little world’s story is just beginning."}</p>
          <div className="hero-meta"><span><MapPin/> {item.location || "Location not set"}</span>{item.dateCreated && <span><CalendarDays/> Created {shortDate(item.dateCreated)}</span>}<span><Leaf/> {item.plantCount} living {item.plantCount === 1 ? "plant" : "plants"}</span><span><Camera/> {photoCount} {photoCount === 1 ? "photo" : "photos"}</span></div>
        </div>
        <SaveFeedback message={feedback?.message} sequence={feedback?.sequence}/>
      </div>
    </div></section>
    <div className="detail-content">
      <div className="terrarium-record">
        <ProfileTabs tabs={terrariumTabs} prefix="terrarium" label="Terrarium profile" selected={tab} onSelect={selectTab}/>
        <RefreshNote refreshing={refreshing} error={refreshError} onRetry={() => void reload({ background: true })}/>
        <div className="profile-tab-content">
        <section {...panel("story")}><div className="story-layout"><div>
          <div className="section-heading"><div><span className="eyebrow">Meaningful changes</span><h2>A little world, growing</h2></div><button className="button primary" onClick={() => setHistory(true)}><Plus/> Add update</button></div>
          {item.history?.length ? <div className="timeline">{item.history.map(moment => <article key={`${moment.kind}-${moment.id}`} className={`${moment.kind} ${newMoment?.kind === moment.kind && newMoment.id === moment.id ? "new-moment" : ""}`} onAnimationEnd={() => setNewMoment(null)}>
            <div className={`timeline-mark ${moment.kind}`}>{moment.kind === "photo" ? <Camera/> : moment.kind === "journal" ? <Flower2/> : <History/>}</div>
            <div><time>{shortDate(moment.date)}</time><h3>{moment.title}</h3><p>{moment.detail}</p>{moment.photoUrl && <img src={moment.photoUrl} alt={moment.detail || "Habitat progress"}/>}
              {moment.journalId && <Link to={`/journal/${moment.journalId}`}>Read journal entry <ChevronRight/></Link>}
            </div>
          </article>)}</div> : <EmptyState icon={<Spirit id={id} spriteImage={item.spriteImage} kind="terrarium" size="empty"/>} title="Its story starts here" copy="Photos, linked journal entries, and little changes will gather into this habitat’s story."/>}
        </div></div></section>
        <section {...panel("residents")}><div className="section-heading"><div><span className="eyebrow">Residents</span><h2>Plants inside</h2></div><span>{item.plantCount} living here</span></div>
          {residents.length ? <div className="resident-list">{residents.map(plant => <Link to={`/plants/${plant.id}`} key={plant.id}>
            <div className="resident-thumb" style={plant.profilePhotoUrl ? { backgroundImage: `url(${plant.profilePhotoUrl})` } : undefined}>{!plant.profilePhotoUrl && <Leaf/>}</div>
            <Spirit id={plant.id} spriteImage={plant.spriteImage}/><div className="resident-name"><strong>{plant.name}</strong><span>{plant.speciesCommonName || "Unidentified plant"}</span></div><ChevronRight/>
          </Link>)}</div> : <EmptyState icon={<Spirit id={id} spriteImage={item.spriteImage} kind="terrarium" size="empty"/>} title="No resident plants yet" copy="Edit a plant and choose this terrarium as its home."/>}
        </section>
        <section {...panel("photos")}><ProfilePhotos kind="terrarium" id={id} spriteImage={item.spriteImage} photos={item.photos || []} coverPhotoId={item.coverPhotoId} onSaved={saved} newMoment={newMoment} onMomentShown={() => setNewMoment(null)} adding={addingPhoto} onAddingChange={setAddingPhoto}/></section>
        <section {...panel("environment")}><div className="about-grid"><article className="environment-card fact-card"><span className="eyebrow">Environment notes</span><dl>
          <div><dt>Lighting</dt><dd>{item.lightingSetup || "Not recorded"}</dd></div><div><dt>Humidity</dt><dd>{item.humidityRequirements || "Not recorded"}</dd></div>
          <div><dt>Watering & misting</dt><dd>{item.wateringNotes || "Not recorded"}</dd></div><div><dt>Substrate</dt><dd>{item.substrateInformation || "Not recorded"}</dd></div>
          <div><dt>Other inhabitants</dt><dd>{item.otherInhabitants || "None recorded"}</dd></div><div><dt>Other notes</dt><dd>{item.notes || "—"}</dd></div>
        </dl><button className="button ghost" onClick={() => setEditing(true)}><Edit3/> Edit habitat</button></article>
          <article className="danger-card"><Sprout/><h3>Habitat controls</h3><p>Deleting this terrarium makes its resident plants standalone. They keep their complete stories.</p><button className="button danger-text" onClick={() => setConfirm(true)}><Trash2/> Delete terrarium</button></article>
        </div></section>
        </div>
      </div>
    </div>
    <TerrariumForm open={editing} item={item} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); saved("Terrarium details saved."); }} onCoverSaved={() => saved("Cover photo updated.")}/>
    <HistoryForm open={history} terrariumId={id} onClose={() => setHistory(false)} onSaved={eventId => { setHistory(false); saved("A new moment added to the story.", { kind: "event", id: eventId }); }}/>
    {confirm && <Confirm title={`Delete ${item.name}?`} copy="Resident plants will become standalone and keep their complete histories. The terrarium record and its photos will be removed." onClose={() => setConfirm(false)} onConfirm={async () => { await api.delete(`/api/terrariums/${id}`); refreshOptions(); navigate("/terrariums"); }}/>}
  </div>;
}
