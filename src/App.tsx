import { useEffect, useState } from "react";
import { BookOpenText, Flower2, Home, Leaf, PanelLeftClose, PanelLeftOpen, Search, Settings, Sprout } from "lucide-react";
import { BrowserRouter, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import type { AppOptions } from "./shared/types";
import { useLoad, GlobalSearch } from "./components/Common";
import { Dashboard } from "./components/Dashboard";
import { PlantsPage, PlantDetailPage } from "./components/Plants";
import { SpeciesPage, TerrariumDetailPage, TerrariumsPage } from "./components/Library";
import { JournalDetailPage, JournalPage, SettingsPage } from "./components/JournalSettings";

const nav=[
  {to:"/",label:"Home",icon:Home},
  {to:"/plants",label:"Plants",icon:Leaf},
  {to:"/terrariums",label:"Terrariums",icon:Sprout},
  {to:"/species",label:"Species",icon:Flower2},
  {to:"/journal",label:"Journal",icon:BookOpenText},
  {to:"/settings",label:"Settings",icon:Settings},
];
const emptyOptions:AppOptions={species:[],terrariums:[],tags:[]};

function Shell(){
  const navigate=useNavigate();
  const {data:options,reload}=useLoad<AppOptions>("/api/options");
  const [search,setSearch]=useState(false);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>localStorage.getItem("greenhouse-sidebar-collapsed")==="true");
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setSearch(true)}
      if(e.key==="Escape")setSearch(false);
    };
    window.addEventListener("keydown",key);
    return()=>window.removeEventListener("keydown",key);
  },[]);
  useEffect(()=>localStorage.setItem("greenhouse-sidebar-collapsed",String(sidebarCollapsed)),[sidebarCollapsed]);
  const current=options||emptyOptions;
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
      <header className="topbar"><button className="search-trigger" onClick={()=>setSearch(true)}><Search size={17}/><span>Search your greenhouse…</span><kbd>Ctrl K</kbd></button></header>
      <Routes>
        <Route path="/" element={<Dashboard onAddPlant={()=>navigate("/plants")}/>}/>
        <Route path="/plants" element={<PlantsPage options={current} refreshOptions={()=>void reload()}/>}/>
        <Route path="/plants/:id" element={<PlantDetailPage options={current} refreshOptions={()=>void reload()}/>}/>
        <Route path="/terrariums" element={<TerrariumsPage refreshOptions={()=>void reload()}/>}/>
        <Route path="/terrariums/:id" element={<TerrariumDetailPage refreshOptions={()=>void reload()}/>}/>
        <Route path="/species" element={<SpeciesPage refreshOptions={()=>void reload()}/>}/>
        <Route path="/species/:id" element={<SpeciesPage refreshOptions={()=>void reload()}/>}/>
        <Route path="/journal" element={<JournalPage options={current} refreshOptions={()=>void reload()}/>}/>
        <Route path="/journal/:id" element={<JournalDetailPage options={current} refreshOptions={()=>void reload()}/>}/>
        <Route path="/settings" element={<SettingsPage/>}/>
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
    </main>
    <GlobalSearch open={search} onClose={()=>setSearch(false)} options={options}/>
  </div>;
}

export function App(){return <BrowserRouter><Shell/></BrowserRouter>}
