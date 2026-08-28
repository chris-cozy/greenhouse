import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowRight, Bell, BookOpenText, Flower2, Home, Leaf, PanelLeftClose, PanelLeftOpen, Search, Settings, Sprout } from "lucide-react";
import { createBrowserRouter, RouterProvider, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { AppNotifications, AppOptions } from "./shared/types";
import { useLoad, GlobalSearch, Loading, prettyStatus } from "./components/Common";
import { Dashboard } from "./components/Dashboard";
import { PlantsPage, PlantDetailPage } from "./components/Plants";
import { SpeciesPage, TerrariumDetailPage, TerrariumsPage } from "./components/Library";
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

function AttentionNotifications({data}:{data:AppNotifications|null}){
  const [open,setOpen]=useState(false);
  const menu=useRef<HTMLDivElement>(null);
  const attentionCount=data?.attentionCount||0;
  useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node))setOpen(false)};const key=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};document.addEventListener("pointerdown",close);window.addEventListener("keydown",key);return()=>{document.removeEventListener("pointerdown",close);window.removeEventListener("keydown",key)}},[open]);
  useEffect(()=>{if(attentionCount===0)setOpen(false)},[attentionCount]);
  if(!data||attentionCount===0)return null;
  return <div className="attention-menu" ref={menu}>
    <button className="attention-notification" onClick={()=>setOpen(value=>!value)} aria-label={`${attentionCount} attention ${attentionCount===1?"notification":"notifications"}`} aria-expanded={open} aria-controls="attention-dropdown"><span className="attention-notification-icon"><Bell/><em>{attentionCount}</em></span></button>
    {open&&<section className="attention-dropdown" id="attention-dropdown" aria-label="Items needing attention"><header><span className="eyebrow">Gentle nudge</span><strong>Needs attention</strong></header>{data.attentionPlants.length>0&&<div className="attention-group"><span>Plants</span>{data.attentionPlants.map(plant=><Link to={`/plants/${plant.id}`} key={plant.id} onClick={()=>setOpen(false)}><span className="attention-item-icon"><Leaf/></span><span><strong>{plant.name}</strong><small>{prettyStatus(plant.status)}</small></span><ArrowRight/></Link>)}</div>}{data.attentionTerrariums.length>0&&<div className="attention-group"><span>Terrariums</span>{data.attentionTerrariums.map(terrarium=><Link to={`/terrariums/${terrarium.id}`} key={terrarium.id} onClick={()=>setOpen(false)}><span className="attention-item-icon terrarium"><Sprout/></span><span><strong>{terrarium.name}</strong><small>{terrarium.residentAttentionCount} {terrarium.residentAttentionCount===1?"resident needs":"residents need"} attention</small></span><ArrowRight/></Link>)}</div>}</section>}
  </div>;
}

function Shell(){
  const navigate=useNavigate();
  const location=useLocation();
  const {data:options,reload:reloadOptions}=useLoad<AppOptions>("/api/options");
  const {data:notifications,reload:reloadNotifications}=useLoad<AppNotifications>("/api/notifications",[location.key]);
  const [search,setSearch]=useState(false);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>localStorage.getItem("greenhouse-sidebar-collapsed")==="true");
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){if((e.target as HTMLElement).closest("[contenteditable]"))return;e.preventDefault();setSearch(true)}
      if(e.key==="Escape")setSearch(false);
    };
    window.addEventListener("keydown",key);
    return()=>window.removeEventListener("keydown",key);
  },[]);
  useEffect(()=>localStorage.setItem("greenhouse-sidebar-collapsed",String(sidebarCollapsed)),[sidebarCollapsed]);
  const current=options||emptyOptions;
  const refreshApp=()=>{void reloadOptions();void reloadNotifications()};
  const toggleLabel=sidebarCollapsed?"Expand sidebar":"Collapse sidebar";
  return <div className={`app-shell ${sidebarCollapsed?"sidebar-collapsed":""}`}>
    <aside className="sidebar">
      <button className="brand" onClick={()=>navigate("/")} aria-label="Go to Home" title={sidebarCollapsed?"Greenhouse":undefined}>
        <span className="brand-mark"><Leaf size={19}/></span><span>Greenhouse</span>
      </button>
      <nav>{nav.map(item=><NavLink to={item.to} end={item.to==="/"} key={item.to} title={sidebarCollapsed?item.label:undefined}><item.icon size={18}/><span>{item.label}</span></NavLink>)}</nav>
      <button className="sidebar-toggle" onClick={()=>setSidebarCollapsed(value=>!value)} aria-label={toggleLabel} title={toggleLabel}>{sidebarCollapsed?<PanelLeftOpen size={17}/>:<PanelLeftClose size={17}/>}</button>
    </aside>
    <main>
      <header className="topbar"><button className="search-trigger" onClick={()=>setSearch(true)}><Search size={17}/><span>Search your greenhouse…</span><kbd>Ctrl K</kbd></button><AttentionNotifications data={notifications}/></header>
      <Suspense fallback={<Loading/>}><Routes>
        <Route path="/" element={<Dashboard onAddPlant={()=>navigate("/plants")}/>}/>
        <Route path="/plants" element={<PlantsPage options={current} refreshOptions={refreshApp}/>}/>
        <Route path="/plants/:id" element={<PlantDetailPage options={current} refreshOptions={refreshApp}/>}/>
        <Route path="/terrariums" element={<TerrariumsPage refreshOptions={refreshApp}/>}/>
        <Route path="/terrariums/:id" element={<TerrariumDetailPage refreshOptions={refreshApp}/>}/>
        <Route path="/species" element={<SpeciesPage refreshOptions={refreshApp}/>}/>
        <Route path="/species/:id" element={<SpeciesPage refreshOptions={refreshApp}/>}/>
        <Route path="/journal" element={<JournalWorkspace options={current} refreshOptions={refreshApp}/>}/>
        <Route path="/journal/:id" element={<JournalWorkspace options={current} refreshOptions={refreshApp}/>}/>
        <Route path="/settings" element={<SettingsPage/>}/>
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes></Suspense>
    </main>
    <GlobalSearch open={search} onClose={()=>setSearch(false)} options={options}/>
  </div>;
}

const router=createBrowserRouter([{path:"*",element:<Shell/>}]);
export function App(){return <RouterProvider router={router}/>}
