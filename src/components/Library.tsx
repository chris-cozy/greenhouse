import { type FormEvent, useState } from "react";
import { BookOpen, Camera, ChevronRight, Edit3, FlaskConical, Flower2, Leaf, Plus } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import type { Species } from "../shared/types";
import { EmptyState, ErrorNote, Field, FormActions, Loading, Modal, PageHeader, useLoad } from "./Common";

const speciesFields:[keyof Species,string,string][]=[
  ["commonName","Common name","e.g. Swiss cheese plant"],["scientificName","Scientific name","e.g. Monstera deliciosa"],["family","Plant family","e.g. Araceae"],["description","Botanical description",""],["nativeHabitat","Native habitat",""],["growthCharacteristics","Growth characteristics",""],["matureSize","Typical mature size",""],["lightRequirements","Light requirements",""],["waterRequirements","Water requirements",""],["humidityRequirements","Humidity requirements",""],["temperatureRange","Temperature range",""],["substratePreferences","Soil / substrate preferences",""],["fertilizationRecommendations","Fertilization recommendations",""],["propagationMethods","Propagation methods",""],["commonProblems","Common problems",""],["commonPests","Common pests",""],["toxicity","Toxicity",""],["terrariumSuitability","Terrarium suitability",""],["notes","Personal reference notes",""]
];
function SpeciesForm({item,onClose,onSaved}:{item?:Species;onClose:()=>void;onSaved:(value:Species)=>void}){
  const initial=Object.fromEntries(speciesFields.map(([key])=>[key,item?.[key]||""])) as Record<string,string>;
  const [value,setValue]=useState(initial);
  const [image,setImage]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const submit=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setError("");
    try{
      let saved=item?await api.put<Species>(`/api/species/${item.id}`,value):await api.post<Species>("/api/species",value);
      if(image){const form=new FormData();form.append("image",image);saved=await api.upload<Species>(`/api/species/${saved.id}/image`,form)}
      onSaved(saved);
    }catch(e){setError((e as Error).message);setBusy(false)}
  };
  return <Modal title={item?`Edit ${item.commonName||item.scientificName}`:"Add a species"} subtitle="Reusable reference information stays separate from individual plants." onClose={onClose} wide><form className="form-grid scroll-form" onSubmit={submit}>
    <Field label="Reference image" wide hint={item?"Choose a new file only when you want to replace this image.":"A clear species image is required for new references."}>
      <label className={`file-drop species-image-drop ${item?.imageUrl&&!image?"has-preview":""}`}>
        {item?.imageUrl&&!image?<img src={item.imageUrl} alt="Current species reference"/>:<Camera/>}
        <span>{image?image.name:item?.imageUrl?"Change reference image":"Choose a reference image"}</span>
        <small>JPEG, PNG, WebP, or GIF · up to 20 MB</small>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" required={!item?.imageUrl} onChange={e=>setImage(e.target.files?.[0]||null)}/>
      </label>
    </Field>
    {speciesFields.map(([key,label,placeholder],index)=><Field key={key} label={label} wide={index>=3}><>{index>=3?<textarea rows={index===3?4:2} value={value[key]} onChange={e=>setValue({...value,[key]:e.target.value})}/>:<input autoFocus={index===0} value={value[key]} placeholder={placeholder} onChange={e=>setValue({...value,[key]:e.target.value})}/>}</></Field>)}
    {error&&<div className="field-wide"><ErrorNote message={error}/></div>}<div className="field-wide"><FormActions onCancel={onClose} busy={busy} label={item?"Save reference":"Add to library"}/></div>
  </form></Modal>;
}

export function SpeciesPage({refreshOptions}:{refreshOptions:()=>void}){
  const {id}=useParams();const navigate=useNavigate();const [q,setQ]=useState("");
  const {data:list,loading,error,reload}=useLoad<Species[]>(`/api/species?q=${encodeURIComponent(q)}`,[q]);
  const {data:selected,reload:reloadSelected}=useLoad<Species>(id?`/api/species/${id}`:"/api/species/__none__",[id]);
  const [editing,setEditing]=useState<Species|"new"|null>(null);
  return <div className="content"><PageHeader eyebrow="Species library" title="Botanical reference" description="Research once, then keep your own trusted reference close." action={<button className="button primary" onClick={()=>setEditing("new")}><Plus/> Add species</button>}/><div className="library-layout">
    <aside><label className="inline-search"><Flower2/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search the library…"/></label>{loading?<Loading/>:error?<ErrorNote message={error}/>:list?.length?<div className="species-list">{list.map(item=><button className={id===item.id?"active":""} onClick={()=>navigate(`/species/${item.id}`)} key={item.id}><div className={`species-glyph ${item.imageUrl?"has-image":""}`}>{item.imageUrl?<img src={item.imageUrl} alt=""/>:<Leaf/>}</div><div><strong>{item.commonName||item.scientificName}</strong><em>{item.scientificName||"Scientific name not set"}</em><small>{item.plantCount} in your collection</small></div><ChevronRight/></button>)}</div>:<EmptyState icon={<BookOpen/>} title="Build your own field guide" copy="Add a species once, then link as many individual plants as you like."/>}</aside>
    <main>{selected?<div className="species-detail"><section className={`species-reference-hero ${selected.imageUrl?"has-image":""}`}>{selected.imageUrl?<img src={selected.imageUrl} alt={`${selected.commonName||selected.scientificName} reference`}/>:<div className="species-reference-placeholder"><Leaf/></div>}<header><div><span className="eyebrow">{selected.family||"Plant family not recorded"}</span><h2>{selected.commonName||selected.scientificName}</h2><em>{selected.scientificName}</em></div><button className="button ghost" onClick={()=>setEditing(selected)}><Edit3/> Edit reference</button></header></section>{selected.description&&<p className="lead-copy">{selected.description}</p>}<div className="reference-groups"><section><span className="eyebrow">Origins & growth</span><Info label="Native habitat" value={selected.nativeHabitat}/><Info label="Growth" value={selected.growthCharacteristics}/><Info label="Mature size" value={selected.matureSize}/></section><section><span className="eyebrow">Environment</span><Info label="Light" value={selected.lightRequirements}/><Info label="Water" value={selected.waterRequirements}/><Info label="Humidity" value={selected.humidityRequirements}/><Info label="Temperature" value={selected.temperatureRange}/><Info label="Substrate" value={selected.substratePreferences}/></section><section><span className="eyebrow">Keeping & propagation</span><Info label="Fertilization" value={selected.fertilizationRecommendations}/><Info label="Propagation" value={selected.propagationMethods}/><Info label="Terrarium suitability" value={selected.terrariumSuitability}/></section><section><span className="eyebrow">Problems & safety</span><Info label="Common problems" value={selected.commonProblems}/><Info label="Common pests" value={selected.commonPests}/><Info label="Toxicity" value={selected.toxicity}/></section></div>{selected.notes&&<div className="personal-note"><FlaskConical/><div><span className="eyebrow">Your reference notes</span><p>{selected.notes}</p></div></div>}</div>:<EmptyState icon={<Flower2/>} title="Choose a species" copy="Select a species to open its reusable botanical reference."/>}</main>
  </div>{editing&&<SpeciesForm item={editing==="new"?undefined:editing} onClose={()=>setEditing(null)} onSaved={item=>{setEditing(null);void reload();void reloadSelected();refreshOptions();navigate(`/species/${item.id}`)}}/>}</div>;
}
function Info({label,value}:{label:string;value:string}){return <div className="reference-row"><strong>{label}</strong><p>{value||"Not recorded yet."}</p></div>}
