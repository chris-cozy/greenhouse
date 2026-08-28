import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import type { JournalTag } from "../shared/types";
import { api } from "../api";
import { useMutation } from "../components/Interaction";
import { Confirm, ErrorNote, Modal } from "../components/Common";

export function DiaryTagPicker({tags,value,onChange}:{tags:JournalTag[];value:string[];onChange:(value:string[])=>void}){
  const [query,setQuery]=useState(""),[open,setOpen]=useState(false),[selected,setSelected]=useState(0);
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(open)root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:"nearest"})},[open,selected,query]);
  const clean=query.trim().replace(/^#/,"");
  const matches=tags.filter(tag=>tag.name.toLocaleLowerCase().includes(clean.toLocaleLowerCase()));
  const options=matches.map(tag=>({name:tag.name,count:tag.entryCount,create:false}));
  if(clean&&!tags.some(tag=>tag.name.toLocaleLowerCase()===clean.toLocaleLowerCase()))options.push({name:clean,count:0,create:true});
  function add(name:string){if(!value.some(tag=>tag.toLocaleLowerCase()===name.toLocaleLowerCase()))onChange([...value,name]);setQuery("");setSelected(0)}
  return <div className="diary-tag-picker" ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false)}}>
    <Tag size={15} aria-hidden="true"/>
    {value.map(tag=><span className="diary-tag" key={tag}>{tag}<button type="button" aria-label={`Remove ${tag} tag`} onClick={()=>onChange(value.filter(t=>t!==tag))}><X size={12}/></button></span>)}
    <div className="tag-input-wrap"><input aria-label="Add a diary tag" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="diary-tag-options" aria-activedescendant={open&&options.length?`diary-tag-option-${Math.min(selected,options.length-1)}`:undefined} value={query} placeholder="Add a tag" onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setSelected(0);setOpen(true)}} onKeyDown={e=>{
      if(e.isPropagationStopped())return;
      if(e.key==="Escape"){e.stopPropagation();setOpen(false)}
      if(e.key==="Backspace"&&!query&&value.length){e.preventDefault();onChange(value.slice(0,-1))}
      if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setOpen(true);setSelected((selected+(e.key==="ArrowDown"?1:-1)+Math.max(1,options.length))%Math.max(1,options.length))}
      if((e.key==="Enter"||e.key===",")&&!(e.nativeEvent as KeyboardEvent).isComposing){e.preventDefault();const option=options[Math.min(selected,options.length-1)];if(option)add(option.name);else if(clean)add(clean)}
    }}/>
    {open&&<div className="diary-tag-options" id="diary-tag-options" role="listbox" aria-label="Diary tags">{options.length?options.map((tag,index)=>{
      const assigned=value.some(t=>t.toLocaleLowerCase()===tag.name.toLocaleLowerCase());
      return <button type="button" role="option" id={`diary-tag-option-${index}`} aria-selected={index===selected} aria-disabled={assigned} key={tag.name} onMouseDown={e=>e.preventDefault()} onClick={()=>add(tag.name)}>{tag.create?`Create “${tag.name}”`:tag.name}<small>{assigned?"Added":tag.create?"New tag":`${tag.count} entries`}</small></button>
    }):<p>Type to create your first tag.</p>}</div>}
    </div>
  </div>;
}

export function DiaryTagManager({tags,onChanged,onClose}:{tags:JournalTag[];onChanged:()=>Promise<void>;onClose:()=>void}){
  const [editing,setEditing]=useState<JournalTag|null>(null),[removing,setRemoving]=useState<JournalTag|null>(null),[name,setName]=useState("");
  const mutation=useMutation();
  const [refreshError,setRefreshError]=useState(""),[refreshing,setRefreshing]=useState(false),[message,setMessage]=useState("");
  const busy=mutation.busy||refreshing;
  async function refresh(){setRefreshing(true);try{await onChanged();setRefreshError("")}catch(error){setRefreshError((error as Error).message)}finally{setRefreshing(false)}}
  function save(){void mutation.run(()=>editing?api.put(`/api/journal-tags/${editing.id}`,{name}):api.post("/api/journal-tags",{name}),()=>{setEditing(null);setName("");setMessage("Diary tag saved.");void refresh()})}
  return <Modal busy={busy} title="Manage diary tags" subtitle="These tags belong only to your diary. Plant and photo tags stay unchanged." onClose={()=>{if(!busy)onClose()}}>
    <div className="tag-manager scroll-form">
      <form onSubmit={e=>{e.preventDefault();void save()}}><label>{editing?`Rename ${editing.name}`:"Create a tag"}<input autoFocus required disabled={busy} aria-label="Tag name" value={name} onChange={e=>setName(e.target.value)}/></label><button className="button primary" disabled={busy}>{editing?"Rename":<><Plus size={15}/> Create</>}</button>{editing&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setEditing(null);setName("")}}>Cancel</button>}</form>
      {mutation.error&&<ErrorNote message={mutation.error}/>}<p role="status" className="save-feedback">{message}</p>{refreshError&&<div className="refresh-note"><ErrorNote message={refreshError}/><button className="button ghost" disabled={refreshing} onClick={()=>void refresh()}>Retry tag refresh</button></div>}
      <ul>{tags.map(tag=><li key={tag.id}><span>#{tag.name}<small>{tag.entryCount} {tag.entryCount===1?"entry":"entries"}</small></span><button type="button" className="icon-button" aria-label={`Rename ${tag.name}`} disabled={busy} onClick={()=>{setEditing(tag);setName(tag.name)}}><Pencil size={15}/></button><button type="button" className="icon-button" aria-label={`Delete ${tag.name}`} disabled={busy} onClick={()=>setRemoving(tag)}><Trash2 size={15}/></button></li>)}</ul>
    </div>
    {removing&&<Confirm title={`Delete #${removing.name}?`} copy={`Remove this tag from ${removing.entryCount} diary entries. The entries themselves, and all plant/photo tags, will remain.`} onClose={()=>setRemoving(null)} onConfirm={async()=>{await api.delete(`/api/journal-tags/${removing.id}`);setRemoving(null);setMessage("Diary tag removed.");void refresh()}}/>}
  </Modal>;
}
