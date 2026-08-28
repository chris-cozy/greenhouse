import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookOpen, Camera, ChevronLeft, ChevronRight, Edit3, FlaskConical, Flower2, Leaf, Plus } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import type { Species } from "../shared/types";
import { EmptyState, ErrorNote, Field, FormActions, Loading, Modal, PageHeader, RefreshNote, useLoad } from "./Common";

import { SaveFeedback, useContentWidth, useFeedback, useMutation } from "./Interaction";

const speciesFields:[keyof Species,string,string][]=[
  ["commonName","Common name","e.g. Swiss cheese plant"],["scientificName","Scientific name","e.g. Monstera deliciosa"],["family","Plant family","e.g. Araceae"],["description","Botanical description",""],["nativeHabitat","Native habitat",""],["growthCharacteristics","Growth characteristics",""],["matureSize","Typical mature size",""],["lightRequirements","Light requirements",""],["waterRequirements","Water requirements",""],["humidityRequirements","Humidity requirements",""],["temperatureRange","Temperature range",""],["substratePreferences","Soil / substrate preferences",""],["fertilizationRecommendations","Fertilization recommendations",""],["propagationMethods","Propagation methods",""],["commonProblems","Common problems",""],["commonPests","Common pests",""],["toxicity","Toxicity",""],["terrariumSuitability","Terrarium suitability",""],["notes","Personal reference notes",""]
];
export function SpeciesForm({item,open=true,onClose,onSaved}:{item?:Species;open?:boolean;onClose:()=>void;onSaved:(value:Species)=>void}){
  const initial=()=>Object.fromEntries(speciesFields.map(([key])=>[key,item?.[key]||""])) as Record<string,string>;
  const [value,setValue]=useState(initial),[image,setImage]=useState<File|null>(null),[details,setDetails]=useState(false);
  const mutation=useMutation();
  // A record and its image are separate writes. Keep the first success across upload retries.
  const savedStage=useRef<{record:Species;payload:string}|null>(null);
  const [partial,setPartial]=useState(false);
  const reset=()=>{setValue(initial());setImage(null);setDetails(false);savedStage.current=null;setPartial(false);mutation.clearError()};
  useEffect(()=>{if(open)reset()},[open,item?.id]);
  const close=()=>{if(!mutation.isBusy())onClose()};
  const submit=(e:FormEvent)=>{
    e.preventDefault();
    void mutation.run(async()=>{
      if(!value.commonName.trim()&&!value.scientificName.trim())throw new Error("Enter a common name or a scientific name.");
      if(!item?.imageUrl&&!image)throw new Error("Choose a reference image.");
      const payload=JSON.stringify(value);
      let saved=savedStage.current?.record;
      if(!saved||savedStage.current?.payload!==payload){
        const id=saved?.id||item?.id;
        saved=id?await api.put<Species>(`/api/species/${id}`,value):await api.post<Species>("/api/species",value);
        savedStage.current={record:saved,payload};
      }
      if(image){
        const form=new FormData();form.append("image",image);
        try{saved=await api.upload<Species>(`/api/species/${saved.id}/image`,form)}catch(error){setPartial(true);throw error}
      }
      return saved;
    },onSaved);
  };
  const field=([key,label,placeholder]:[keyof Species,string,string],index:number)=><Field key={key} label={label} wide={index>=3}>{index>=3?<textarea rows={index===3?4:2} value={value[key]} onChange={e=>setValue({...value,[key]:e.target.value})}/>:<input autoFocus={index===0} value={value[key]} placeholder={placeholder} onChange={e=>setValue({...value,[key]:e.target.value})}/>}</Field>;
  const optional=speciesFields.slice(3).map((entry,index)=>field(entry,index+3));
  return <Modal open={open} onExited={reset} busy={mutation.busy} title={item?`Edit ${item.commonName||item.scientificName}`:"Add a species"} subtitle="Reusable reference information stays separate from individual plants." onClose={close} wide={!!item||details}>
    <form className="form-grid scroll-form" onSubmit={submit}>
      <fieldset className="form-fields" disabled={mutation.busy}>
        {speciesFields.slice(0,3).map(field)}
        <Field label="Reference image" wide hint={item?"Choose a new file only when you want to replace this image.":"A clear species image is required for new references."}>
          <div className={`file-drop species-image-drop ${item?.imageUrl&&!image?"has-preview":""}`}>
            {item?.imageUrl&&!image?<img src={item.imageUrl} alt="Current species reference"/>:<Camera/>}
            <span>{image?image.name:item?.imageUrl?"Change reference image":"Choose a reference image"}</span><small>JPEG, PNG, WebP, or GIF · up to 20 MB</small>
            <input aria-label="Reference image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required={!item?.imageUrl} onChange={e=>setImage(e.target.files?.[0]||null)}/>
          </div>
        </Field>
        {item?optional:<details className="form-more" open={details} onToggle={e=>setDetails(e.currentTarget.open)}><summary>Reference details</summary><div className="form-grid">{optional}</div></details>}
      </fieldset>
      {partial&&<p className="species-partial field-wide" role="status">The reference is saved, but its image could not upload. Try again to finish the image upload without creating another reference.</p>}
      {mutation.error&&<div className="field-wide"><ErrorNote message={mutation.error}/></div>}
      <div className="field-wide"><FormActions onCancel={close} busy={mutation.busy} label={partial?"Retry image upload":item?"Save reference":"Add to library"}/></div>
    </form>
  </Modal>;
}

export function SpeciesPage({refreshOptions}:{refreshOptions:()=>void}){
  const {id}=useParams();const navigate=useNavigate();const [q,setQ]=useState("");
  const layout=useContentWidth(),feedback=useFeedback();
  const listElement=useRef<HTMLDivElement>(null),listScroll=useRef(0),heading=useRef<HTMLHeadingElement>(null);
  useLayoutEffect(()=>{if(listElement.current)listElement.current.scrollTop=listScroll.current},[id,layout.wide]);
  const {data:list,loading,error,reload,refreshing,refreshError}=useLoad<Species[]>(`/api/species?q=${encodeURIComponent(q)}`,[q]);
  const selectedLoad=useLoad<Species>(id?`/api/species/${id}`:null);
  const {data:selected,reload:reloadSelected}=selectedLoad;
  useEffect(()=>{if(selected?.id===id)heading.current?.focus({preventScroll:true})},[id,selected?.id]);
  const [editing,setEditing]=useState<Species|"new"|null>(null);
  return <div ref={layout.ref} className={`content species-page ${layout.wide?"is-wide":""} ${id?"has-selection":""}`}><PageHeader eyebrow="Species library" title="Botanical reference" description="Research once, then keep your own trusted reference close." action={<button className="button primary" onClick={()=>setEditing("new")}><Plus/> Add species</button>}/><SaveFeedback message={feedback.feedback?.message} sequence={feedback.feedback?.sequence}/><RefreshNote refreshing={refreshing||selectedLoad.refreshing} error={refreshError||selectedLoad.refreshError} onRetry={()=>{void reload({background:true});void reloadSelected({background:true})}}/><div className="library-layout">
    <aside><label className="inline-search"><Flower2/><input aria-label="Search the species library" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search the library…"/></label>{loading?<Loading/>:error?<><ErrorNote message={error}/><button className="button ghost" onClick={()=>void reload()}>Retry library</button></>:list?.length?<div className="species-list" ref={listElement} onScroll={e=>{listScroll.current=e.currentTarget.scrollTop}}>{list.map(item=><button className={id===item.id?"active":""} onClick={()=>navigate(`/species/${item.id}`)} key={item.id}><div className={`species-glyph ${item.imageUrl?"has-image":""}`}>{item.imageUrl?<img src={item.imageUrl} alt=""/>:<Leaf/>}</div><div><strong>{item.commonName||item.scientificName}</strong><em>{item.scientificName||"Scientific name not set"}</em><small>{item.plantCount} in your collection</small></div><ChevronRight/></button>)}</div>:<EmptyState icon={<BookOpen/>} title="Build your own field guide" copy="Add a species once, then link as many individual plants as you like."/>}</aside>
    <section className="library-reference" aria-label="Botanical reference"><button className="button ghost species-back" onClick={()=>navigate("/species")}><ChevronLeft/> Back to library</button>{selectedLoad.loading?<Loading/>:selectedLoad.error?<div className="species-detail"><ErrorNote message={selectedLoad.error}/><button className="button ghost" onClick={()=>void reloadSelected()}>Retry reference</button></div>:selected?<div className="species-detail"><section className={`species-reference-hero ${selected.imageUrl?"has-image":""}`}>{selected.imageUrl?<img src={selected.imageUrl} alt={`${selected.commonName||selected.scientificName} reference`}/>:<div className="species-reference-placeholder"><Leaf/></div>}<header><div><span className="eyebrow">{selected.family||"Plant family not recorded"}</span><h2 ref={heading} tabIndex={-1}>{selected.commonName||selected.scientificName}</h2><em>{selected.scientificName}</em></div><div className="reference-actions"><button className="button ghost" onClick={()=>setEditing(selected)}><Edit3/> Edit reference</button></div></header></section>{selected.description&&<p className="lead-copy">{selected.description}</p>}<div className="reference-groups"><section><span className="eyebrow">Origins & growth</span><Info label="Native habitat" value={selected.nativeHabitat}/><Info label="Growth" value={selected.growthCharacteristics}/><Info label="Mature size" value={selected.matureSize}/></section><section><span className="eyebrow">Environment</span><Info label="Light" value={selected.lightRequirements}/><Info label="Water" value={selected.waterRequirements}/><Info label="Humidity" value={selected.humidityRequirements}/><Info label="Temperature" value={selected.temperatureRange}/><Info label="Substrate" value={selected.substratePreferences}/></section><section><span className="eyebrow">Keeping & propagation</span><Info label="Fertilization" value={selected.fertilizationRecommendations}/><Info label="Propagation" value={selected.propagationMethods}/><Info label="Terrarium suitability" value={selected.terrariumSuitability}/></section><section><span className="eyebrow">Problems & safety</span><Info label="Common problems" value={selected.commonProblems}/><Info label="Common pests" value={selected.commonPests}/><Info label="Toxicity" value={selected.toxicity}/></section></div>{selected.notes&&<div className="personal-note"><FlaskConical/><div><span className="eyebrow">Your reference notes</span><p>{selected.notes}</p></div></div>}</div>:<EmptyState icon={<Flower2/>} title="Choose a species" copy="Select a species to open its reusable botanical reference."/>}</section>
  </div><SpeciesForm open={editing!==null} item={editing===null||editing==="new"?undefined:editing} onClose={()=>{setEditing(null);void reload({background:true});void reloadSelected({background:true});refreshOptions()}} onSaved={item=>{setEditing(null);void reload({background:true});if(item.id===id)void reloadSelected({background:true});refreshOptions();navigate(`/species/${item.id}`);feedback.announce("Botanical reference saved.")}}/></div>;
}
function Info({label,value}:{label:string;value:string}){return <div className="reference-row"><strong>{label}</strong><p>{value||"Not recorded yet."}</p></div>}
