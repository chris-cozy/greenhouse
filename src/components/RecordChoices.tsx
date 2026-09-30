import { useId, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import type { PlantChoice } from "../shared/types";

export function uniqueTags(values:string[]) {
  const seen=new Set<string>();
  return values.map(value=>value.trim()).filter(value=>{
    const key=value.toLocaleLowerCase();if(!value||seen.has(key))return false;seen.add(key);return true;
  });
}
export const pendingTags=(tags:string[],draft:string)=>uniqueTags([...tags,...draft.split(",")]);

export function ChoiceInput({label,value,options,onChange,onSelect,placeholder}:{label:string;value:string;options:string[];onChange:(value:string)=>void;onSelect?:(value:string)=>void;placeholder?:string}) {
  const id=useId(),[open,setOpen]=useState(false),[selected,setSelected]=useState(0),[query,setQuery]=useState("");
  const matches=uniqueTags(options).filter(option=>option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const create=value.trim()&&!options.some(option=>option.toLocaleLowerCase()===value.trim().toLocaleLowerCase());
  const choices=[...matches,...(create?[value.trim()]:[])];
  const active=Math.min(selected,Math.max(0,choices.length-1));
  const choose=(option:string)=>{if(onSelect)onSelect(option);else onChange(option);setOpen(false);setSelected(0)};
  const key=(event:KeyboardEvent<HTMLInputElement>)=>{
    if(event.nativeEvent.isComposing)return;
    if(event.key==="Escape"&&open){event.stopPropagation();setOpen(false)}
    if(event.key==="ArrowDown"||event.key==="ArrowUp"){
      event.preventDefault();setOpen(true);setSelected(open?(active+(event.key==="ArrowDown"?1:-1)+Math.max(1,choices.length))%Math.max(1,choices.length):0);
    }
    if(event.key==="Enter"&&open&&choices.length){event.preventDefault();choose(choices[active])}
  };
  return <div className="record-choice" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false)}}>
    <input aria-label={label} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={id} aria-activedescendant={open&&choices.length?`${id}-${active}`:undefined}
      value={value} placeholder={placeholder} onFocus={()=>{setQuery("");setOpen(true);setSelected(0)}} onChange={event=>{onChange(event.target.value);setQuery(event.target.value);setSelected(0);setOpen(true)}} onKeyDown={key}/>
    {open&&<div className="record-choice-options" id={id} role="listbox" aria-label={`${label} choices`}>
      {choices.map((option,index)=><button type="button" role="option" id={`${id}-${index}`} aria-selected={index===active} key={option.toLocaleLowerCase()} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(option)}>{create&&index===choices.length-1?`Use new value “${option}”`:option}</button>)}
      {!choices.length&&<p>Type a new value.</p>}
    </div>}
  </div>;
}

export function TagInput({value,draft,onChange,onDraftChange,options,label="Tags"}:{value:string[];draft:string;onChange:(tags:string[])=>void;onDraftChange:(draft:string)=>void;options:string[];label?:string}) {
  const commit=(next:string)=>{onChange(pendingTags(value,next));onDraftChange("")};
  return <div className="tag-choice" onKeyDownCapture={event=>{if(event.key===","&&!event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();commit(draft)}}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)&&draft.trim())commit(draft)}} onPaste={event=>{const pasted=event.clipboardData.getData("text");if(pasted.includes(",")){event.preventDefault();commit(draft+pasted)}}}>
    <div className="record-tag-chips">{value.map(tag=><span key={tag.toLocaleLowerCase()}>{tag}<button type="button" aria-label={`Remove ${tag} tag`} onClick={()=>onChange(value.filter(item=>item!==tag))}><X size={12}/></button></span>)}</div>
    <ChoiceInput label={label} value={draft} options={options.filter(option=>!value.some(tag=>tag.toLocaleLowerCase()===option.toLocaleLowerCase()))} onChange={next=>{if(next.includes(","))commit(next);else onDraftChange(next)}} onSelect={commit} placeholder="Choose or type a tag"/>
    <div className="tag-entry-actions"><button type="button" className="text-button" disabled={!draft.trim()} onClick={()=>commit(draft)}>Add tag</button><small>Enter or commas add tags.</small></div>
  </div>;
}

export function PlantLinks({options,value,onChange}:{options:PlantChoice[];value:string[];onChange:(ids:string[])=>void}) {
  const [query,setQuery]=useState("");
  const matches=options.filter(plant=>plant.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section className="plant-links field-wide" aria-label="Plants in this photo">
    <strong>Plants in this photo</strong>
    <input aria-label="Search plants to link" placeholder="Search plants…" value={query} onChange={event=>setQuery(event.target.value)}/>
    <div className="linked-plant-summary">{options.filter(plant=>value.includes(plant.id)).map(plant=><span key={plant.id}>{plant.name}</span>)}</div>
    <div className="plant-link-options">{matches.map(plant=><label key={plant.id}><input type="checkbox" checked={value.includes(plant.id)} onChange={event=>onChange(event.target.checked?[...value,plant.id]:value.filter(id=>id!==plant.id))}/><span>{plant.name}{(plant.archivedAt||plant.status==="deceased")&&<small>{plant.archivedAt?"Archived":"Deceased"}</small>}</span></label>)}{!matches.length&&<p>No matching plants.</p>}</div>
    {!value.length&&<small role="status">Choose at least one plant.</small>}
  </section>;
}
