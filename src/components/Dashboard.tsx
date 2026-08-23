import { ArrowRight, BookOpenText, Camera, Check, Leaf, Plus, Sprout } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { DashboardData } from "../shared/types";
import { EmptyState, ErrorNote, Loading, prettyStatus, shortDate, useLoad } from "./Common";

export function Dashboard({onAddPlant}:{onAddPlant:()=>void}){
  const {data,loading,error,reload}=useLoad<DashboardData>("/api/dashboard");
  const navigate=useNavigate();
  if(loading)return <div className="content"><Loading/></div>;
  if(error||!data)return <div className="content"><ErrorNote message={error||"Dashboard unavailable."}/></div>;
  const empty=data.livingPlants===0&&data.terrariums===0;
  return <div className="content dashboard-page">
    <section className="welcome"><div>
      <span className="eyebrow">{new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric"}).format(new Date())}</span>
      <h1>{empty?"A greenhouse of your own.":"Your greenhouse is growing."}</h1>
      <p>{empty?"Begin with one plant. Its archive can grow naturally over time.":"A calm view of the plants, places, and stories you’re tending."}</p>
    </div></section>
    <section className="summary-grid">
      <Link to="/plants" className="summary-card"><div className="summary-icon"><Leaf/></div><div><span>Living plants</span><strong>{data.livingPlants}</strong><small>In your active collection</small></div></Link>
      <Link to="/terrariums" className="summary-card"><div className="summary-icon amber"><Sprout/></div><div><span>Terrariums</span><strong>{data.terrariums}</strong><small>Miniature ecosystems</small></div></Link>
      {data.attentionPlants.length?<Link to="/plants?attention=true" className="attention-card"><div><span className="eyebrow">A gentle nudge</span><h2>{data.attentionPlants.length} {data.attentionPlants.length===1?"plant may":"plants may"} need attention</h2><p>Review them when you have a moment.</p></div><span>View plants <ArrowRight/></span></Link>:<article className="attention-card calm"><div><span className="eyebrow">All looks calm</span><h2>No plants flagged for attention</h2><p>There’s nothing urgent waiting for you.</p></div><Check/></article>}
    </section>
    {empty?<section className="getting-started"><div className="start-art"><div className="pot"><Sprout/></div></div><div><span className="eyebrow">Start simply</span><h2>Every archive begins with a name.</h2><p>Add a plant now. Species details, care preferences, photos, and journal notes can come later—only when they’re useful.</p><div><button className="button primary" onClick={onAddPlant}><Plus/> Add your first plant</button><Link className="button ghost" to="/species">Build species library</Link></div></div></section>:<section className="dashboard-grid">
      <article className="panel recent"><div className="section-heading"><div><span className="eyebrow">Recently updated</span><h2>Growing stories</h2></div><Link to="/plants">View collection</Link></div>{data.recentlyUpdated.length?<div className="plant-row">{data.recentlyUpdated.slice(0,3).map((plant,index)=><button className={`plant-card ${plant.profilePhotoUrl?"has-photo":"generated"} tone-${index}`} style={plant.profilePhotoUrl?{backgroundImage:`linear-gradient(0deg,rgba(6,13,8,.8),transparent),url(${plant.profilePhotoUrl})`}:undefined} key={plant.id} onClick={()=>navigate(`/plants/${plant.id}`)}><span className={`status ${plant.status}`}>{prettyStatus(plant.status)}</span><div>{!plant.profilePhotoUrl&&<Leaf className="placeholder-leaf"/>}<h3>{plant.name}</h3><p>{plant.speciesCommonName||"Unidentified plant"}</p><small>{plant.terrariumName||plant.location||`Updated ${shortDate(plant.updatedAt)}`}</small></div></button>)}</div>:null}</article>
      <article className="panel journal"><div className="section-heading"><div><span className="eyebrow">From the journal</span><h2>Recent notes</h2></div><Link to="/journal">Open journal</Link></div>{data.recentJournals.length?data.recentJournals.slice(0,3).map(entry=><Link className="journal-entry" key={entry.id} to={`/journal/${entry.id}`}><time>{new Date(`${entry.entryDate}T12:00:00`).toLocaleDateString(undefined,{month:"short",day:"2-digit"})}</time><div><h3>{entry.title}</h3><p>{entry.content.replace(/[#*_>`]/g,"").slice(0,120)}</p><span>{entry.tags.map(x=>`#${x}`).join(" · ")}</span></div></Link>):<EmptyState icon={<BookOpenText/>} title="No journal entries yet" copy="Journal entries will appear here when a moment feels worth keeping."/>}</article>
    </section>}
    {data.upcomingReminders.length>0&&<section className="reminder-strip"><div><span className="eyebrow">Optional reminders</span><h2>Coming up, whenever you’re ready</h2></div><div className="reminder-items">{data.upcomingReminders.slice(0,4).map(item=><article key={item.id}><span>{item.plantName}</span><strong>{item.customLabel||prettyStatus(item.activityType)}</strong><small>{shortDate(item.nextReminderDate)}</small><button aria-label="Dismiss reminder" onClick={async()=>{await api.post(`/api/care/${item.id}/dismiss`,{});void reload()}}><Check/></button></article>)}</div></section>}
    {data.recentPhotos.length>0&&<section className="recent-photos"><div className="section-heading"><div><span className="eyebrow">Visual history</span><h2>Recent progress photos</h2></div><Camera/></div><div>{data.recentPhotos.slice(0,5).map(photo=><img key={photo.id} src={photo.url} alt={photo.caption||"Plant progress"}/>)}</div></section>}
  </div>;
}
