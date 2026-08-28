import { commonmark, htmlSchema, imageSchema, linkSchema } from "@milkdown/kit/preset/commonmark";
import { gfm, extendListItemSchemaForTask } from "@milkdown/kit/preset/gfm";
import { $node, $remark, $view } from "@milkdown/kit/utils";
import { safeImage, safeLink } from "../shared/journal";
import { parseYouTubeUrl, semanticTimeMarkdown } from "./richUtils";

type AstNode = {type:string;value?:string;url?:string;children?:AstNode[];datetime?:string;label?:string};
// Recognize only the semantic extensions we own. All other HTML stays inert in Milkdown's literal HTML node.
export const richSyntax = $remark("diarySyntax",()=>()=>tree=>{
  const root=tree as AstNode;
  function visit(node:AstNode){
    if(!node.children)return;
    const children=node.children;
    for(let i=0;i<children.length;i++){
      const child=children[i];
      const match=child.type==="html"?child.value?.match(/^<time datetime="(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?)">$/):null;
      if(match&&Number.isFinite(Date.parse(match[1]))){
        const end=children.findIndex((n,j)=>j>i&&n.type==="html"&&n.value==="</time>");
        if(end>i&&children.slice(i+1,end).every(n=>n.type==="text"))children.splice(i,end-i+1,{type:"diaryTime",datetime:match[1],label:children.slice(i+1,end).map(n=>n.value||"").join("")});
      }
      visit(children[i]);
    }
  }
  visit(root);
  root.children=root.children?.map(node=>{
    if(node.type!=="paragraph"||node.children?.length!==1)return node;
    const child=node.children[0];
    const value=child.type==="text"?child.value:child.type==="link"&&child.children?.length===1&&child.children[0].value===child.url?child.url:undefined;
    return value&&parseYouTubeUrl(value)?{type:"diaryVideo",url:value.trim()}:node;
  });
});

export const dateNode=$node("diary_time",()=>({
  group:"inline",inline:true,atom:true,attrs:{datetime:{default:""},label:{default:""}},
  parseDOM:[{tag:"time[datetime]",getAttrs:dom=>({datetime:(dom as HTMLElement).getAttribute("datetime"),label:(dom as HTMLElement).textContent})}],
  toDOM:node=>["time",{datetime:node.attrs.datetime,class:"date-mention",contenteditable:"false"},node.attrs.label],
  parseMarkdown:{match:node=>node.type==="diaryTime",runner:(state,node,type)=>{state.addNode(type,{datetime:node.datetime,label:node.label})}},
  toMarkdown:{match:node=>node.type.name==="diary_time",runner:(state,node)=>{state.addNode("html",undefined,semanticTimeMarkdown(node.attrs.datetime,node.attrs.label))}},
}));

export const videoNode=$node("diary_video",()=>({
  group:"block",atom:true,attrs:{url:{default:""}},
  parseDOM:[{tag:"figure[data-diary-video]",getAttrs:dom=>({url:(dom as HTMLElement).dataset.diaryVideo})}],
  toDOM:node=>["figure",{"data-diary-video":node.attrs.url},["a",{href:safeLink(node.attrs.url)?node.attrs.url:undefined},node.attrs.url]],
  parseMarkdown:{match:node=>node.type==="diaryVideo",runner:(state,node,type)=>{state.addNode(type,{url:node.url})}},
  toMarkdown:{match:node=>node.type.name==="diary_video",runner:(state,node)=>{state.addNode("html",undefined,node.attrs.url)}},
}));
export const videoView=$view(videoNode,()=>(node,view,getPos)=>{
  const dom=document.createElement("figure");dom.className="diary-video";dom.contentEditable="false";
  const reference=parseYouTubeUrl(node.attrs.url);
  const link=document.createElement("a");link.textContent="Open on YouTube ↗";link.href=reference?.originalUrl||"#";link.target="_blank";link.rel="noopener noreferrer";
  const play=document.createElement("button");play.type="button";play.className="video-load";play.textContent="▶  Load YouTube video";
  const hint=document.createElement("small");hint.textContent="Loads from YouTube only when you choose to play.";
  play.onclick=()=>{
    if(!reference)return;
    const iframe=document.createElement("iframe");iframe.title="YouTube video player";iframe.src=`https://www.youtube-nocookie.com/embed/${reference.videoId}?start=${reference.startSeconds}`;
    iframe.allow="encrypted-media; picture-in-picture; fullscreen";iframe.allowFullscreen=true;iframe.referrerPolicy="strict-origin-when-cross-origin";
    play.replaceWith(iframe);hint.textContent="If playback is unavailable, use the original link.";
  };
  const remove=document.createElement("button");remove.type="button";remove.className="text-button";remove.textContent="Remove video";remove.setAttribute("aria-label","Remove YouTube video");remove.onclick=()=>{const pos=getPos();if(pos!==undefined)view.dispatch(view.state.tr.delete(pos,pos+node.nodeSize));};
  dom.append(play,hint,link,remove);return {dom,stopEvent:event=>(event.target as Element).closest("button,a,iframe")!==null,ignoreMutation:()=>true};
});

const safeImages=imageSchema.extendSchema(prev=>ctx=>({...prev(ctx),toDOM:node=>safeImage(node.attrs.src)?["img",{...node.attrs,loading:"lazy"}]:["span",{class:"unavailable-image","data-image-src":node.attrs.src},`Image: ${node.attrs.alt||"external image"} (not loaded)`]}));
const safeLinks=linkSchema.extendSchema(prev=>ctx=>({...prev(ctx),toDOM:mark=>["a",{...mark.attrs,href:safeLink(mark.attrs.href)?mark.attrs.href:undefined,rel:"noopener noreferrer"},0]}));

export const taskView=$view(extendListItemSchemaForTask.node,()=> (node,view,getPos)=>{
  const dom=document.createElement("li"),contentDOM=document.createElement("div"),checkbox=document.createElement("input");
  checkbox.type="checkbox";checkbox.contentEditable="false";checkbox.setAttribute("aria-label","Complete task");
  let current=node;
  const update=()=>{dom.dataset.task=String(current.attrs.checked!==null);checkbox.hidden=current.attrs.checked===null;checkbox.checked=!!current.attrs.checked;};
  checkbox.onchange=()=>{const pos=getPos();if(pos!==undefined)view.dispatch(view.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,checked:checkbox.checked}));};
  dom.append(checkbox,contentDOM);update();
  return {dom,contentDOM,update(next){if(next.type.name!=="list_item")return false;current=next;update();return true;},stopEvent:event=>event.target===checkbox,ignoreMutation:mutation=>mutation.type!=="selection"&&(mutation.target===checkbox||mutation.target===dom)};
});

export const diarySchema=[...commonmark.filter(plugin=>!imageSchema.includes(plugin as never)&&!linkSchema.includes(plugin as never)),...safeImages,...safeLinks,...gfm,...richSyntax,dateNode,videoNode,videoView,taskView];
// Exporting the literal node documents the deliberate fallback for unrecognized HTML.
export { htmlSchema };
