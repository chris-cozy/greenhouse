import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, editorViewOptionsCtx, commandsCtx, parserCtx, serializerCtx } from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { slashFactory } from "@milkdown/kit/plugin/slash";
import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { Fragment } from "@milkdown/kit/prose/model";
import { setBlockType, toggleMark, wrapIn } from "@milkdown/kit/prose/commands";
import { wrapInList } from "@milkdown/kit/prose/schema-list";
import { undo, redo } from "@milkdown/kit/prose/history";
import { insertTableCommand, addRowAfterCommand, addColAfterCommand, deleteSelectedCellsCommand } from "@milkdown/kit/preset/gfm";
import type { Ctx } from "@milkdown/kit/ctx";
import { api } from "../api";
import type { JournalImage } from "../shared/types";
import { safeLink } from "../shared/journal";
import { diarySchema } from "./editorSchema";
import { dateMentionSuggestions, parseDateMention, parseYouTubeUrl, type DateMention } from "./richUtils";
import { ErrorNote, Field, Modal } from "../components/Common";

type Props = {id:string;content:string;onChange:(markdown:string)=>void;onBusy:(busy:boolean)=>void};
export type RichEditorHandle = {settle:()=>Promise<void>};
type Menu = {kind:"slash"|"date";from:number;to:number;query:string;left:number;top:number;items:Array<{id:string;label:string;detail:string;date?:DateMention}>;selected:number};
const commands=[
  ["text","Text","A plain paragraph"],["h1","Heading 1","Large heading"],["h2","Heading 2","Section heading"],["h3","Heading 3","Small heading"],
  ["bullet","Bulleted list","An unordered list"],["number","Numbered list","A sequence"],["task","Checklist","Tasks you can check off"],
  ["quote","Quote","Give a thought emphasis"],["code","Code block","Preformatted text"],["divider","Divider","A quiet pause"],
  ["table","Table","Organize observations"],["link","Link","Insert a web link"],["image","Image","Upload a local photo"],
  ["date","Date","Resolve a date mention"],["video","YouTube video","Keep a portable video link"],
].map(([id,label,detail])=>({id,label,detail}));

const Inner=forwardRef<RichEditorHandle,Props>(function Inner(props,ref){
  const latest=useRef(props);latest.current=props;
  const [menu,setMenu]=useState<Menu|null>(null),menuRef=useRef<Menu|null>(null);
  const menuElement=useRef<HTMLDivElement>(null);
  useEffect(()=>{menuElement.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:"nearest"})},[menu?.query,menu?.selected]);
  const [selection,setSelection]=useState(false),[inTable,setInTable]=useState(false);
  const [dialog,setDialog]=useState<"link"|"date"|"video"|null>(null),[value,setValue]=useState(""),[label,setLabel]=useState("");
  const [error,setError]=useState(""),[dialogError,setDialogError]=useState("");
  const files=useRef<HTMLInputElement>(null),ctxRef=useRef<Ctx|null>(null),dismissed=useRef("");
  const pending=useRef(new Set<Promise<void>>());
  const uploadKey=useRef(new PluginKey<DecorationSet>("diaryUploads"));
  const showMenu=(next:Menu|null)=>{menuRef.current=next;setMenu(next)};
  const view=()=>ctxRef.current?.get(editorViewCtx);
  const openDialog=(kind:"link"|"date"|"video")=>{showMenu(null);setValue("");setLabel("");setDialogError("");setDialog(kind)};

  function insertVideo(url:string){
    const v=view();if(!v)return;
    const node=v.state.schema.nodes.diary_video.create({url});
    const tr=v.state.tr.replaceSelectionWith(node);
    if(tr.doc.lastChild?.type.name==="diary_video"){tr.insert(tr.doc.content.size,v.state.schema.nodes.paragraph.create());tr.setSelection(TextSelection.atEnd(tr.doc));}
    v.dispatch(tr.scrollIntoView());v.focus();
  }
  function insertDate(date:DateMention){
    const v=view();if(!v)return;
    v.dispatch(v.state.tr.replaceSelectionWith(v.state.schema.nodes.diary_time.create(date)).insertText(" ").scrollIntoView());v.focus();
  }
  function uploadImages(list:File[],position?:number){
    const v=view();if(!v||!list.length)return;
    const targetId=props.id,token=Symbol("upload");
    v.dispatch(v.state.tr.setMeta(uploadKey.current,{add:{token,pos:position??v.state.selection.from}}));
    let job:Promise<void>;
    job=Promise.resolve().then(async()=>{
      try{
        const images:JournalImage[]=[];
        for(const file of list){
          if(!["image/png","image/jpeg","image/gif","image/webp"].includes(file.type)||file.size>20*1024*1024)throw new Error("Choose JPEG, PNG, GIF, or WebP images under 20 MB.");
          const data=new FormData();data.append("image",file);
          images.push(await api.upload<JournalImage>(`/api/journal/${targetId}/images`,data));
        }
        if(v.isDestroyed)return;
        const anchor=uploadKey.current.getState(v.state)?.find(undefined,undefined,spec=>spec.token===token)[0];
        if(anchor)v.dispatch(v.state.tr.replaceWith(anchor.from,anchor.from,Fragment.fromArray(images.map(image=>v.state.schema.nodes.image.create({src:image.url,alt:image.originalName,title:""})))).setMeta(uploadKey.current,{remove:token}));
      }catch(e){setError((e as Error).message)}finally{
        if(!v.isDestroyed)v.dispatch(v.state.tr.setMeta(uploadKey.current,{remove:token}));
        pending.current.delete(job);latest.current.onBusy(pending.current.size>0);
      }
    });
    pending.current.add(job);latest.current.onBusy(true);
  }
  useImperativeHandle(ref,()=>({settle:async()=>{await Promise.all([...pending.current]);}}),[]);

  function run(id:string){
    const v=view();if(!v||!ctxRef.current)return;
    const current=menuRef.current;
    if(current){v.dispatch(v.state.tr.delete(current.from,current.to));showMenu(null)}
    const schema=v.state.schema;
    if(id==="image"){files.current?.click();return}
    if(id==="link"||id==="date"||id==="video"){openDialog(id);return}
    if(id==="text")setBlockType(schema.nodes.paragraph)(v.state,v.dispatch);
    if(/^h[123]$/.test(id))setBlockType(schema.nodes.heading,{level:Number(id[1])})(v.state,v.dispatch);
    if(id==="bullet"||id==="task"){
      wrapInList(schema.nodes.bullet_list)(v.state,v.dispatch);
      if(id==="task"){
        const {$from}=v.state.selection;
        for(let depth=$from.depth;depth>0;depth--)if($from.node(depth).type.name==="list_item"){
          v.dispatch(v.state.tr.setNodeMarkup($from.before(depth),undefined,{...$from.node(depth).attrs,checked:false}));break;
        }
      }
    }
    if(id==="number")wrapInList(schema.nodes.ordered_list)(v.state,v.dispatch);
    if(id==="quote")wrapIn(schema.nodes.blockquote)(v.state,v.dispatch);
    if(id==="code")setBlockType(schema.nodes.code_block)(v.state,v.dispatch);
    if(id==="divider")v.dispatch(v.state.tr.replaceSelectionWith(schema.nodes.hr.create()));
    if(id==="table")ctxRef.current.get(commandsCtx).call(insertTableCommand.key,{row:3,col:3});
    if((id==="divider"||id==="table")&&["hr","table"].includes(v.state.doc.lastChild?.type.name||"")){
      const tr=v.state.tr.insert(v.state.doc.content.size,schema.nodes.paragraph.create());
      if(id==="divider")tr.setSelection(TextSelection.atEnd(tr.doc));
      v.dispatch(tr);
    }
    v.focus();
  }
  function choose(index:number){
    const current=menuRef.current,v=view();if(!current||!v)return;
    const item=current.items[index];if(!item)return;
    if(item.date){v.dispatch(v.state.tr.delete(current.from,current.to));showMenu(null);insertDate(item.date)}else run(item.id);
  }
  function inspect(v:EditorView){
    const {$from,empty}=v.state.selection;
    setSelection(!empty);
    let table=false;for(let depth=$from.depth;depth>0;depth--)if($from.node(depth).type.name==="table")table=true;
    setInTable(table);
    if(!empty||v.composing||$from.parent.type.name!=="paragraph"){showMenu(null);return}
    const text=$from.parent.textBetween(0,$from.parentOffset,"","\ufffc");
    const slash=text.match(/^\/([^\n]*)$/),date=text.match(/(?:^|\s)@([^@\n]*)$/);
    const match=slash||date;
    if(!match){dismissed.current="";showMenu(null);return}
    const kind=slash?"slash":"date",query=match[1],from=slash?$from.start():$from.pos-query.length-1;
    const signature=`${kind}:${from}:${query}`;
    if(dismissed.current===signature)return;
    const items=kind==="slash"?commands.filter(c=>`${c.label} ${c.detail}`.toLowerCase().includes(query.toLowerCase())):dateMentionSuggestions(query).map(date=>({id:date.datetime,label:date.label,detail:"Insert date",date}));
    const coords=v.coordsAtPos($from.pos);
    const previous=menuRef.current;
    showMenu({kind,from,to:$from.pos,query,items,selected:previous?.query===query?Math.min(previous.selected,Math.max(0,items.length-1)):0,left:Math.max(12,Math.min(coords.left,window.innerWidth-310)),top:Math.max(8,Math.min(coords.bottom+8,window.innerHeight-330))});
  }

  useEditor(root=>{
    const slash=slashFactory(`diary-${props.id}`);
    const uploads=$prose(()=>new Plugin<DecorationSet>({key:uploadKey.current,state:{init:()=>DecorationSet.empty,apply(tr,old){let next=old.map(tr.mapping,tr.doc);const action=tr.getMeta(uploadKey.current);if(action?.add){const span=document.createElement("span");span.className="upload-placeholder";span.textContent="Uploading image…";next=next.add(tr.doc,[Decoration.widget(action.add.pos,span,{token:action.add.token})])}if(action?.remove)next=next.remove(next.find(undefined,undefined,spec=>spec.token===action.remove));return next;}},props:{decorations:state=>uploadKey.current.getState(state)}}));
    return Editor.make().config(ctx=>{
      ctxRef.current=ctx;ctx.set(rootCtx,root);ctx.set(defaultValueCtx,props.content);
      ctx.update(editorViewOptionsCtx,options=>({...options,attributes:{role:"textbox","aria-label":"Diary entry body","aria-multiline":"true","data-placeholder":"Write freely. Type / for formatting or @ for a date…"},transformPastedHTML:html=>DOMPurify.sanitize(html,{FORBID_TAGS:["iframe","script","style","object","embed"]}),
        handlePaste(v,event){
          if(event.clipboardData?.files.length){event.preventDefault();uploadImages([...event.clipboardData.files]);return true;}
          const text=event.clipboardData?.getData("text/plain")||"";
          if(v.state.selection.$from.parent.type.name==="paragraph"&&!v.state.selection.$from.parent.textContent&&parseYouTubeUrl(text)){event.preventDefault();insertVideo(text.trim());return true;}return false;
        },
        handleDrop(v,event){if(event.dataTransfer?.files.length){event.preventDefault();uploadImages([...event.dataTransfer.files],v.posAtCoords({left:event.clientX,top:event.clientY})?.pos);return true}return false},
      }));
      ctx.set(slash.key,{
        props:{handleKeyDown(v,event){
          if(event.isComposing)return false;
          const {$from,empty}=v.state.selection;
          if(event.key==="Enter"&&!event.shiftKey&&empty&&$from.parent.type.name==="paragraph"&&$from.parentOffset===$from.parent.content.size&&parseYouTubeUrl($from.parent.textContent)){
            event.preventDefault();const url=$from.parent.textContent.trim();v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc,$from.start(),$from.end())));insertVideo(url);return true;
          }
          if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();event.stopPropagation();openDialog("link");return true}
          const current=menuRef.current;if(!current)return false;
          if(event.key==="Escape"){event.preventDefault();dismissed.current=`${current.kind}:${current.from}:${current.query}`;showMenu(null);return true}
          if(["ArrowDown","ArrowUp"].includes(event.key)){event.preventDefault();showMenu({...current,selected:(current.selected+(event.key==="ArrowDown"?1:-1)+Math.max(1,current.items.length))%Math.max(1,current.items.length)});return true}
          if(event.key==="Enter"&&current.items.length){event.preventDefault();choose(current.selected);return true}return false;
        }},
        view(initial){
          let previous=initial.state.doc;
          return {update(v){
            if(!v.state.doc.eq(previous)){previous=v.state.doc;latest.current.onChange(ctx.get(serializerCtx)(v.state.doc));}
            inspect(v);
          },destroy(){ctxRef.current=null;}};
        },
      });
    }).use(diarySchema).use(slash).use(uploads).use(history).use(clipboard);
  },[]);

  function format(mark:string){const v=view();if(!v)return;const type=v.state.schema.marks[mark];if(type)toggleMark(type)(v.state,v.dispatch);v.focus()}
  function submitDialog(){
    const v=view();if(!v)return;
    if(dialog==="link"){
      if(!safeLink(value.trim())){setDialogError("Enter an http, https, or mailto link.");return}
      const {from,to,empty}=v.state.selection;
      const tr=v.state.tr;
      if(empty){const text=label.trim()||value.trim();tr.insertText(text,from).addMark(from,from+text.length,v.state.schema.marks.link.create({href:value.trim()}));}
      else tr.addMark(from,to,v.state.schema.marks.link.create({href:value.trim()}));
      v.dispatch(tr);
    }
    if(dialog==="video"){const parsed=parseYouTubeUrl(value);if(!parsed){setDialogError("Enter a supported HTTPS YouTube video URL.");return}insertVideo(parsed.originalUrl)}
    if(dialog==="date"){const parsed=parseDateMention(value);if(!parsed){setDialogError("Try today, tomorrow, or August 27, 2026 at 10:00 AM.");return}insertDate(parsed)}
    setDialog(null);v.focus();
  }
  return <div className="diary-editor">
    <div className={`format-toolbar ${selection?"has-selection":""}`} role="toolbar" aria-label="Text formatting">
      {[["strong","Bold","B"],["emphasis","Italic","I"],["strike_through","Strikethrough","S"],["inlineCode","Inline code","‹›"]].map(([mark,title,label])=><button key={mark} type="button" title={title} aria-label={title} onMouseDown={e=>e.preventDefault()} onClick={()=>format(mark)}>{label}</button>)}
      <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>openDialog("link")}>Link</button>
      <span/>
      <button type="button" aria-label="Undo" onMouseDown={e=>e.preventDefault()} onClick={()=>{const v=view();if(v){undo(v.state,v.dispatch);v.focus()}}}>↶</button>
      <button type="button" aria-label="Redo" onMouseDown={e=>e.preventDefault()} onClick={()=>{const v=view();if(v){redo(v.state,v.dispatch);v.focus()}}}>↷</button>
    </div>
    {inTable&&<div className="table-toolbar" role="toolbar" aria-label="Table controls">{[["Add row",addRowAfterCommand],["Add column",addColAfterCommand],["Delete selection",deleteSelectedCellsCommand]].map(([label,cmd])=><button key={String(label)} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>{ctxRef.current?.get(commandsCtx).call((cmd as typeof addRowAfterCommand).key);view()?.focus()}}>{String(label)}</button>)}</div>}
    {error&&<div role="alert"><ErrorNote message={error}/><button type="button" className="text-button" onClick={()=>setError("")}>Dismiss</button></div>}
    <Milkdown/>
    <input ref={files} type="file" className="visually-hidden" aria-label="Insert diary images" multiple accept="image/png,image/jpeg,image/gif,image/webp" onChange={e=>{uploadImages([...e.target.files||[]]);e.target.value=""}}/>
    {menu&&<div ref={menuElement} className="diary-slash-menu" role="listbox" aria-label={menu.kind==="date"?"Date suggestions":"Formatting commands"} style={{left:menu.left,top:menu.top}}>
      <small>{menu.kind==="date"?"Insert a date":"Add to your story"}</small>
      {menu.items.length?menu.items.map((item,index)=><button type="button" role="option" aria-selected={index===menu.selected} key={item.id} className={index===menu.selected?"selected":""} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(index)}><strong>{item.label}</strong><span>{item.detail}</span></button>):<p>No matches. Try another word.</p>}
      <footer>↑ ↓ to browse · Enter to choose · Esc to close</footer>
    </div>}
    {dialog&&<Modal title={dialog==="link"?"Insert a link":dialog==="video"?"Insert a YouTube video":"Insert a date"} onClose={()=>{setDialog(null);view()?.focus()}}>
      <form className="form-grid" onSubmit={e=>{e.preventDefault();submitDialog()}}><Field label={dialog==="date"?"Date":"URL"} wide><input autoFocus required value={value} onChange={e=>setValue(e.target.value)} placeholder={dialog==="date"?"tomorrow at 9:00 AM":"https://…"}/></Field>{dialog==="link"&&<Field label="Link text (optional)" wide><input value={label} onChange={e=>setLabel(e.target.value)}/></Field>}{dialogError&&<ErrorNote message={dialogError}/>}<button className="button primary field-wide">Insert</button></form>
    </Modal>}
  </div>;
});
export const RichEditor=forwardRef<RichEditorHandle,Props>(function RichEditor(props,ref){return <MilkdownProvider><Inner {...props} ref={ref}/></MilkdownProvider>});
