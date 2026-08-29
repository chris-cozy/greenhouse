import { journalExcerpt } from "../shared/journal";
import { BellOff, BookOpenText, Camera, Check, MoreHorizontal, Plus, RotateCcw, Sprout, X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { CareItem, CompletedReminder, DashboardData } from "../shared/types";
import { EmptyState, ErrorNote, Loading, Modal, RefreshNote, prettyStatus, shortDate, useLoad } from "./Common";
import { Garden, type GardenViewState } from "./Garden";
export { Garden } from "./Garden";
import { useMutation, useReducedMotion } from "./Interaction";
import { Spirit } from "./Spirit";

type ReminderItem=DashboardData["upcomingReminders"][number];
type ReminderUndo={item:ReminderItem;result:CompletedReminder};
const dayMs=86_400_000;
const reminderSettleMs=360;
const wait=(milliseconds:number)=>new Promise<void>(resolve=>window.setTimeout(resolve,milliseconds));
const reminderTiming=(date:string)=>{
  const target=new Date(`${date}T12:00:00`),today=new Date();today.setHours(12,0,0,0);
  const days=Math.round((target.getTime()-today.getTime())/dayMs);
  if(days<0)return {className:"overdue",label:`${Math.abs(days)} ${Math.abs(days)===1?"day":"days"} overdue`};
  if(days===0)return {className:"today",label:"Due today"};
  if(days===1)return {className:"upcoming",label:"Due tomorrow"};
  return {className:"upcoming",label:`In ${days} days`};
};

function Reminder({item,onChanged,onCompleted,reducedMotion,expanded=false}:{item:ReminderItem;onChanged:()=>void;onCompleted:(item:ReminderItem,result:CompletedReminder,finish:()=>void)=>void;reducedMotion:boolean;expanded?:boolean}){
  const mutation=useMutation();
  const [completing,setCompleting]=useState(false);
  const timing=reminderTiming(item.nextReminderDate),activity=item.customLabel||prettyStatus(item.activityType);
  const update=(path:string,body:unknown)=>void mutation.run(()=>api.post<CareItem>(path,body),onChanged);
  const transitionName=`reminder-${expanded?"all":"strip"}-${item.id.replace(/[^a-zA-Z0-9_-]/g,"-")}`;
  const complete=()=>{setCompleting(true);void mutation.run(async()=>{const result=await api.post<CompletedReminder>(`/api/care/${item.id}/reminder/complete`,{});if(!reducedMotion)await wait(reminderSettleMs);return result},result=>onCompleted(item,result,()=>setCompleting(false)))};
  return <article className={`reminder-card ${expanded?"expanded":""} ${completing?"is-completing":""}`} style={{viewTransitionName:transitionName} as CSSProperties}>
    <Link className="reminder-identity" to={`/plants/${item.plantId}?tab=care`} aria-label={`Open ${item.plantName}'s care guidance`}>
      <Spirit id={item.plantId} spriteImage={item.plantSpriteImage} size="small" motion="still"/>
      <span><small>{item.plantName}</small><strong>{activity}</strong></span>
    </Link>
    <div className={`reminder-due ${timing.className}`}><strong>{timing.label}</strong><small>{shortDate(item.nextReminderDate)}</small></div>
    <div className="reminder-actions">
      <button className="button reminder-done" disabled={mutation.busy} onClick={complete}><Check size={15}/> {completing?"All set":"Done for now"}</button>
      <details className="reminder-menu"><summary aria-label={`More reminder options for ${item.plantName}`}><MoreHorizontal/></summary><div role="menu">
        <span>Snooze</span>
        {[1,3,7].map(days=><button role="menuitem" key={days} disabled={mutation.busy} onClick={event=>{event.currentTarget.closest("details")?.removeAttribute("open");update(`/api/care/${item.id}/reminder/snooze`,{days})}}>{days===1?"Tomorrow":`${days} days`}</button>)}
        <Link role="menuitem" to={`/plants/${item.plantId}?tab=care&care=${item.id}`}>Edit schedule</Link>
        <button role="menuitem" className="reminder-off" disabled={mutation.busy} onClick={event=>{event.currentTarget.closest("details")?.removeAttribute("open");update(`/api/care/${item.id}/reminder/disable`,{})}}><BellOff/> Turn off</button>
      </div></details>
    </div>
    {item.reminderRepeat&&item.reminderCadenceDays&&<small className="reminder-repeat">Repeats every {item.reminderCadenceDays} days</small>}
    {mutation.error&&<ErrorNote message={mutation.error}/>}
  </article>;
}

export function Dashboard({onAddPlant,onAddTerrarium,gardenState,onGardenStateChange}:{onAddPlant:()=>void;onAddTerrarium?:()=>void;gardenState?:GardenViewState;onGardenStateChange?:(state:GardenViewState)=>void}){
  const {data,loading,error,reload,refreshing,refreshError}=useLoad<DashboardData>("/api/dashboard");
  const navigate=useNavigate();
  const [viewAll,setViewAll]=useState(false),[undo,setUndo]=useState<ReminderUndo|null>(null),[listSettling,setListSettling]=useState(false);
  const undoMutation=useMutation();
  const reducedMotion=useReducedMotion();
  useEffect(()=>{if(!undo)return;const timer=window.setTimeout(()=>setUndo(null),6500);return()=>window.clearTimeout(timer)},[undo]);
  if(loading)return <div className="content"><Loading/></div>;
  if(error||!data)return <div className="content"><ErrorNote message={error||"Dashboard unavailable."}/></div>;
  const gardenSize=data.gardenPlants.length+data.gardenTerrariums.length;
  const empty=gardenSize===0;
  const transition=async(update:()=>Promise<unknown>|unknown)=>{
    const transitionDocument=document as Document&{startViewTransition?:(update:()=>Promise<unknown>|unknown)=>{finished:Promise<void>}};
    if(reducedMotion){await update();return}
    if(!transitionDocument.startViewTransition){await update();setListSettling(true);window.setTimeout(()=>setListSettling(false),reminderSettleMs);return}
    let updated=false;
    try{const movement=transitionDocument.startViewTransition(async()=>{updated=true;await update()});await movement.finished}catch{if(!updated)await update()}
  };
  const changed=()=>void transition(()=>reload({background:true}));
  const completed=(item:ReminderItem,result:CompletedReminder,finish:()=>void)=>void transition(async()=>{finish();setUndo({item,result});await reload({background:true})});
  const reminderList=(items:ReminderItem[],expanded=false)=>items.map(item=><Reminder key={item.id} item={item} expanded={expanded} reducedMotion={reducedMotion} onChanged={changed} onCompleted={completed}/>);
  return <div className="content dashboard-page">
    <section className="welcome"><div>
      <span className="eyebrow">{new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric"}).format(new Date())}</span>
      <h1>Your Greenhouse ♡</h1>
      <p>All of the plants under your care</p>
    </div>{!empty&&<div className="home-create-actions"><button className="button primary" onClick={onAddPlant}><Plus size={18}/> Add plant</button>{onAddTerrarium&&<button className="button ghost" onClick={onAddTerrarium}><Sprout size={18}/> Add terrarium</button>}</div>}</section>
    <section className="summary-grid">
      <Garden plants={data.gardenPlants} terrariums={data.gardenTerrariums} initialState={gardenState} onViewStateChange={onGardenStateChange}/>
    </section>
    {data.upcomingReminders.length>0&&<section className="reminder-strip"><div className="reminder-heading"><span className="eyebrow">Care reminders</span><h2>A few things to check</h2><p>Nothing is logged automatically.</p>{data.upcomingReminders.length>4&&<button className="reminder-view-all" onClick={()=>setViewAll(true)}>View all {data.upcomingReminders.length}</button>}</div><div className={`reminder-items ${listSettling?"is-settling":""}`}>{reminderList(data.upcomingReminders.slice(0,4))}</div></section>}
    <RefreshNote refreshing={refreshing} error={refreshError} onRetry={()=>void reload({background:true})}/>
    {empty?<section className="getting-started"><div className="start-art"><div className="pot"><Sprout/></div></div><div><span className="eyebrow">Start simply</span><h2>Every archive begins with a name.</h2><p>Add a plant now. Species details, care preferences, photos, and journal notes can come later—only when they’re useful.</p><div><button className="button primary" onClick={onAddPlant}><Plus/> Add your first plant</button>{onAddTerrarium&&<button className="button ghost" onClick={onAddTerrarium}><Sprout/> Add terrarium</button>}<Link className="button ghost" to="/species">Build species library</Link></div></div></section>:<section className="dashboard-grid">
      <article className="panel recent"><div className="section-heading"><div><span className="eyebrow">Recently updated</span><h2>Growing stories</h2></div><Link to="/plants">View collection</Link></div>{data.recentlyUpdated.length?<div className="plant-row">{data.recentlyUpdated.slice(0,3).map((plant,index)=><button className={`plant-card ${plant.profilePhotoUrl?"has-photo":"generated"} tone-${index}`} style={plant.profilePhotoUrl?{backgroundImage:`linear-gradient(0deg,rgba(6,13,8,.8),transparent),url(${plant.profilePhotoUrl})`}:undefined} key={plant.id} onClick={()=>navigate(`/plants/${plant.id}`)}><span className={`status ${plant.status}`}>{prettyStatus(plant.status)}</span><div><div className="story-card-name"><span className="story-card-spirit"><Spirit id={plant.id} spriteImage={plant.spriteImage} size="small" motion="still"/></span><h3>{plant.name}</h3></div><p>{plant.speciesCommonName||"Unidentified plant"}</p><small>{plant.terrariumName||plant.location||`Updated ${shortDate(plant.updatedAt)}`}</small></div></button>)}</div>:null}</article>
      <article className="panel journal"><div className="section-heading"><div><span className="eyebrow">From the journal</span><h2>Recent notes</h2></div><Link to="/journal">Open journal</Link></div>{data.recentJournals.length?data.recentJournals.slice(0,3).map(entry=><Link className="journal-entry" key={entry.id} to={`/journal/${entry.id}`}><time>{new Date(`${entry.entryDate}T12:00:00`).toLocaleDateString(undefined,{month:"short",day:"2-digit"})}</time><div><h3>{entry.title}</h3><p>{journalExcerpt(entry.content,120)}</p><span>{entry.tags.map(x=>`#${x}`).join(" · ")}</span></div></Link>):<EmptyState icon={<BookOpenText/>} title="No journal entries yet" copy="Journal entries will appear here when a moment feels worth keeping."/>}</article>
    </section>}
    {data.recentPhotos.length>0&&<section className="recent-photos"><div className="section-heading"><div><span className="eyebrow">Visual history</span><h2>Recent progress photos</h2></div><Camera/></div><div>{data.recentPhotos.slice(0,5).map(photo=><img key={photo.id} src={photo.url} alt={photo.caption||"Plant progress"}/>)}</div></section>}
    <Modal open={viewAll} wide className="reminder-modal" title="Care reminders" subtitle="A calm overview of what is due and what is coming up." onClose={()=>setViewAll(false)}><div className={`reminder-all-list ${listSettling?"is-settling":""}`}>{reminderList(data.upcomingReminders,true)}</div></Modal>
    {undo&&<div className="reminder-toast" role="status" aria-live="polite"><RotateCcw aria-hidden="true"/><span>{undo.result.reminder.reminderEnabled&&undo.result.reminder.nextReminderDate?`${undo.item.plantName} will return ${shortDate(undo.result.reminder.nextReminderDate)}.`:`${undo.item.plantName}’s one-time reminder is complete.`}</span><button disabled={undoMutation.busy} onClick={()=>void undoMutation.run(()=>api.post<CareItem>(`/api/care/${undo.item.id}/reminder/restore`,undo.result.previous),()=>{setUndo(null);changed()})}>Undo</button><button className="toast-close" aria-label="Dismiss message" onClick={()=>setUndo(null)}><X/></button></div>}
  </div>;
}
