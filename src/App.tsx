import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowRight, Bell, BookOpenText, Flower2, Home, Leaf, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Search, Settings, Sprout } from "lucide-react";
import { createBrowserRouter, RouterProvider, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { AppNotifications, AppOptions } from "./shared/types";
import { useLoad, GlobalSearch, Loading, Modal, prettyStatus } from "./components/Common";
import type { GardenViewState } from "./components/Garden";
import { Spirit } from "./components/Spirit";
import { Dashboard } from "./components/Dashboard";
import { PlantsPage, PlantDetailPage } from "./components/Plants";
import { PlantForm } from "./components/PlantForms";
import { TerrariumForm } from "./components/TerrariumForm";
import { TerrariumDetailPage, TerrariumsPage } from "./components/Terrariums";
import { SpeciesPage } from "./components/Library";
import { SettingsPage } from "./components/JournalSettings";
const JournalWorkspace=lazy(()=>import("./journal/JournalWorkspace").then(module=>({default:module.JournalWorkspace})));

const nav=[
  {to:"/",label:"Home",icon:Home},
  {to:"/plants",label:"Plants",icon:Leaf},
  {to:"/terrariums",label:"Terrariums",icon:Sprout},
  {to:"/species",label:"Species",icon:Flower2},
  {to:"/journal",label:"Journal",icon:BookOpenText},
  {to:"/settings",label:"Settings",icon:Settings},
];
const emptyOptions:AppOptions={species:[],terrariums:[],tags:[]};

export function AttentionNotifications({data}:{data:AppNotifications|null}){
  const [open,setOpen]=useState(false);
  const attentionCount=data?.attentionCount||0;
  useEffect(()=>{if(attentionCount===0)setOpen(false)},[attentionCount]);
  if(!data||attentionCount===0)return null;
  return <div className="attention-menu">
    <button className="attention-notification" onClick={()=>setOpen(true)} aria-label={`${attentionCount} attention ${attentionCount===1?"notification":"notifications"}`} aria-expanded={open} aria-haspopup="dialog"><span className="attention-notification-icon"><Bell/><em>{attentionCount}</em></span></button>
    <Modal open={open} title="Needs attention" eyebrow="Gentle nudge" className="attention-dialog" onClose={()=>setOpen(false)}>
      <div className="attention-groups">{data.attentionPlants.length>0&&<div className="attention-group"><span>Plants</span>{data.attentionPlants.map(plant=><Link to={`/plants/${plant.id}`} key={plant.id} onClick={()=>setOpen(false)}><Spirit id={plant.id}/><span><strong>{plant.name}</strong><small>{prettyStatus(plant.status)}</small></span><ArrowRight/></Link>)}</div>}
      {data.attentionTerrariums.length>0&&<div className="attention-group"><span>Terrariums</span>{data.attentionTerrariums.map(terrarium=><Link to={`/terrariums/${terrarium.id}`} key={terrarium.id} onClick={()=>setOpen(false)}><Spirit id={terrarium.id} kind="terrarium"/><span><strong>{terrarium.name}</strong><small>{terrarium.residentAttentionCount} {terrarium.residentAttentionCount===1?"resident needs":"residents need"} attention</small></span><ArrowRight/></Link>)}</div>}</div>
    </Modal>
  </div>;
}

function Shell(){
  const navigate=useNavigate();
  const location=useLocation();
  const {data:options,reload:reloadOptions}=useLoad<AppOptions>("/api/options");
  const {data:notifications,reload:reloadNotifications}=useLoad<AppNotifications>("/api/notifications",[location.key]);
  const [search,setSearch]=useState(false);
  const [more,setMore]=useState(false);
  const [creatingPlant,setCreatingPlant]=useState(false);
  const [creatingTerrarium,setCreatingTerrarium]=useState(false);
  const gardenState=useRef<GardenViewState|undefined>(undefined);
  const [welcomePlantId,setWelcomePlantId]=useState<string|null>(null);
  const [welcomeTerrariumId,setWelcomeTerrariumId]=useState<string|null>(null);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>{
    try{return localStorage.getItem("greenhouse-sidebar-collapsed")==="true"}
    catch{return false}
  });
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){if((e.target as HTMLElement).closest("[contenteditable]"))return;e.preventDefault();setSearch(true)}
      if(e.key==="Escape")setSearch(false);
    };
    window.addEventListener("keydown",key);
    return()=>window.removeEventListener("keydown",key);
  },[]);
  useEffect(()=>{
    try{localStorage.setItem("greenhouse-sidebar-collapsed",String(sidebarCollapsed))}
    catch{/* Sidebar and appearance controls still work for this session. */}
  },[sidebarCollapsed]);
  const current=options||emptyOptions;
  const refreshApp=()=>{void reloadOptions({background:true});void reloadNotifications({background:true})};
  const toggleLabel=sidebarCollapsed?"Expand sidebar":"Collapse sidebar";
  return <div className={`app-shell ${sidebarCollapsed?"sidebar-collapsed":""}`}>
    <aside className="sidebar">
      <button className="brand" onClick={()=>navigate("/")} aria-label="Go to Home" title={sidebarCollapsed?"Greenhouse":undefined}>
        <span className="brand-mark"><Leaf size={19}/></span><span>Greenhouse</span>
      </button>
      <nav>{nav.map(item=><NavLink to={item.to} end={item.to==="/"} key={item.to} className={({isActive})=>`${isActive?"active":""} ${item.to==="/species"||item.to==="/settings"?"nav-secondary":""}`} title={sidebarCollapsed?item.label:undefined}><item.icon size={18}/><span>{item.label}</span></NavLink>)}<button className={`mobile-more ${location.pathname.startsWith("/species")||location.pathname==="/settings"?"active":""}`} aria-haspopup="dialog" aria-expanded={more} onClick={()=>setMore(true)}><MoreHorizontal size={18}/><span>More</span></button></nav>
      <button className="sidebar-toggle" onClick={()=>setSidebarCollapsed(value=>!value)} aria-label={toggleLabel} title={toggleLabel}>{sidebarCollapsed?<PanelLeftOpen size={17}/>:<PanelLeftClose size={17}/>}</button>
    </aside>
    <main>
      <header className="topbar"><button className="search-trigger" onClick={()=>setSearch(true)}><Search size={17}/><span>Search your greenhouse…</span><kbd>Ctrl K</kbd></button><AttentionNotifications data={notifications}/></header>
      <div className="page-scroll">
        <Suspense fallback={<Loading/>}><Routes>
          <Route path="/" element={<Dashboard onAddPlant={()=>setCreatingPlant(true)} onAddTerrarium={()=>setCreatingTerrarium(true)} gardenState={gardenState.current} onGardenStateChange={state=>{gardenState.current=state}}/>}/>
          <Route path="/plants" element={<PlantsPage options={current} onAddPlant={()=>setCreatingPlant(true)}/>}/>
          <Route path="/plants/:id" element={<PlantDetailPage options={current} refreshOptions={refreshApp} welcomePlantId={welcomePlantId} onWelcomeShown={()=>setWelcomePlantId(null)}/>}/>
          <Route path="/terrariums" element={<TerrariumsPage onAddTerrarium={()=>setCreatingTerrarium(true)}/>}/>
          <Route path="/terrariums/:id" element={<TerrariumDetailPage refreshOptions={refreshApp} welcomeTerrariumId={welcomeTerrariumId} onWelcomeShown={()=>setWelcomeTerrariumId(null)}/>}/>
          <Route path="/species" element={<SpeciesPage refreshOptions={refreshApp}/>}/>
          <Route path="/species/:id" element={<SpeciesPage refreshOptions={refreshApp}/>}/>
          <Route path="/journal" element={<JournalWorkspace options={current} refreshOptions={refreshApp}/>}/>
          <Route path="/journal/:id" element={<JournalWorkspace options={current} refreshOptions={refreshApp}/>}/>
          <Route path="/settings" element={<SettingsPage/>}/>
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes></Suspense>
      </div>
    </main>
    <PlantForm open={creatingPlant} options={current} onClose={()=>setCreatingPlant(false)} onSaved={plant=>{setCreatingPlant(false);setWelcomePlantId(plant.id);refreshApp();navigate(`/plants/${plant.id}`)}}/>
    <TerrariumForm open={creatingTerrarium} onClose={()=>setCreatingTerrarium(false)} onSaved={item=>{setCreatingTerrarium(false);setWelcomeTerrariumId(item.id);refreshApp();navigate(`/terrariums/${item.id}`)}}/>
    <Modal open={more} title="More in your greenhouse" eyebrow="Explore" className="navigation-sheet" onClose={()=>setMore(false)}><nav className="more-links" aria-label="More destinations">{nav.filter(item=>item.to==="/species"||item.to==="/settings").map(item=><NavLink key={item.to} to={item.to} onClick={()=>setMore(false)}><item.icon/><span>{item.label}<small>{item.to==="/species"?"Your botanical field guide":"Back up or restore your greenhouse"}</small></span><ArrowRight/></NavLink>)}</nav></Modal>
    <GlobalSearch open={search} onClose={()=>setSearch(false)} options={options}/>
  </div>;
}

const router=createBrowserRouter([{path:"*",element:<Shell/>}]);
export function App(){return <RouterProvider router={router}/>}
