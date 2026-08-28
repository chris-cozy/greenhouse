// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { Editor, rootCtx, defaultValueCtx, parserCtx, serializerCtx, editorViewCtx } from "@milkdown/kit/core";
import { EditorView } from "@milkdown/kit/prose/view";
import { diarySchema } from "../src/journal/editorSchema";
import { journalExcerpt, safeLink, safeImage } from "../src/shared/journal";
import { dateMentionSuggestions, parseDateMention, parseYouTubeUrl } from "../src/journal/richUtils";
import { RichEditor, type RichEditorHandle } from "../src/journal/RichEditor";
import { api } from "../src/api";

describe("diary Markdown document",()=>{
  it("round-trips GFM, semantic dates, videos, images, and inert HTML",async()=>{
    const source='# A growing story\n\n**bold** *italic* ~~strike~~ `inline` [link](https://example.com)\n\n- first\n  - nested\n\n- [x] done\n- [ ] later\n\n> A quote\n\n```ts\nconst fern = true;\n```\n\n| A | B |\n| :-- | --: |\n| a | b |\n\n![Fern](/media/journal/one/photo.png)\n\n<time datetime="2026-08-27">August 27, 2026</time>\n\nhttps://youtu.be/dQw4w9WgXcQ?t=90\n\n<script>alert("unsafe")</script>\n\n\\*literal\\*\n';
    const root=document.createElement("div");document.body.append(root);
    const editor=await Editor.make().config(ctx=>{ctx.set(rootCtx,root);ctx.set(defaultValueCtx,source)}).use(diarySchema).create();
    const result=editor.action(ctx=>ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));
    const again=editor.action(ctx=>ctx.get(serializerCtx)(ctx.get(parserCtx)(result)));
    expect(again).toBe(result);expect(result).toContain('| A');expect(result).toMatch(/[-*] \[x\] done/);expect(result).toContain('<time datetime="2026-08-27">August 27, 2026</time>');expect(result).toContain('https://youtu.be/dQw4w9WgXcQ?t=90');expect(result).toContain('![Fern](/media/journal/one/photo.png)');expect(result).toContain('<script>alert("unsafe")</script>');expect(root.querySelector('script')).toBeNull();expect(root.querySelector('iframe')).toBeNull();expect(root.querySelector('time')?.textContent).toBe('August 27, 2026');expect(root.querySelector('input[type=checkbox]')).not.toBeNull();
    await editor.destroy();root.remove();
  });
  it("produces readable excerpts and rejects executable URLs",()=>{expect(journalExcerpt('## Fern\n\n**New** [growth](https://example.com) ![leaf](/media/leaf.png)')).toBe('Fern New growth leaf');expect(safeLink('javascript:alert(1)')).toBe(false);expect(safeLink('//evil.example')).toBe(false);expect(safeLink('https://example.com')).toBe(true);expect(safeImage('/media/../private.png')).toBe(false);expect(safeImage('https://example.com/track.png')).toBe(false)});
  it("keeps footnotes and unknown HTML losslessly alongside editable content",async()=>{
    const source='A note[^leaf] and [reference][garden].\n\n[^leaf]: Keep **this** exact footnote.\n\n[garden]: https://example.com "Garden"\n\n<div data-custom="yes">\n  Unknown & preserved\n</div>\n';
    const root=document.createElement("div");document.body.append(root);
    const editor=await Editor.make().config(ctx=>{ctx.set(rootCtx,root);ctx.set(defaultValueCtx,source)}).use(diarySchema).create();
    const output=editor.action(ctx=>ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));
    expect(output).toContain('[^leaf]');expect(output).toContain('[^leaf]: Keep **this** exact footnote.');expect(output).toContain('<div data-custom="yes">\n  Unknown & preserved\n</div>');expect(root.querySelector('[data-custom]')).toBeNull();
    expect(editor.action(ctx=>ctx.get(serializerCtx)(ctx.get(parserCtx)(output)))).toBe(output);
    await editor.destroy();root.remove();
  });
  it("uploads dropped and pasted files, awaits insertion, and rejects unsupported images",async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const rootElement=document.createElement("div");document.body.append(rootElement);const root=createRoot(rootElement),ref=createRef<RichEditorHandle>(),onChange=vi.fn(),onBusy=vi.fn();
    const upload=vi.spyOn(api,"upload").mockResolvedValue({id:"image",journalId:"entry",url:"/media/journal/image.png",originalName:"leaf.png",mimeType:"image/png",sizeBytes:20});
    const hitTest=vi.spyOn(EditorView.prototype,"posAtCoords").mockReturnValue({pos:1,inside:0});
    try{
      await act(async()=>root.render(createElement(RichEditor,{ref,id:"entry",content:"",onChange,onBusy})));
      await vi.waitFor(()=>expect(rootElement.querySelector('[contenteditable="true"]')).not.toBeNull());
      const editor=rootElement.querySelector('[contenteditable="true"]')!;
      for(const kind of ["drop","paste"]){
        await act(async()=>{
          const event=new Event(kind,{bubbles:true,cancelable:true});Object.defineProperty(event,kind==="drop"?"dataTransfer":"clipboardData",{value:{files:[new File(["PNG"],"leaf.png",{type:"image/png"})],getData:()=>"",types:["Files"]}});editor.dispatchEvent(event);await ref.current?.settle();
        });
      }
      expect(upload).toHaveBeenCalledTimes(2);expect(rootElement.querySelectorAll('img[src="/media/journal/image.png"]')).toHaveLength(2);expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining("![leaf.png](/media/journal/image.png)"));expect(onBusy).toHaveBeenLastCalledWith(false);
      await act(async()=>{const event=new Event("paste",{bubbles:true,cancelable:true});Object.defineProperty(event,"clipboardData",{value:{files:[new File(["<svg/>"],"unsafe.svg",{type:"image/svg+xml"})],getData:()=>"",types:["Files"]}});editor.dispatchEvent(event);await ref.current?.settle()});
      expect(upload).toHaveBeenCalledTimes(2);expect(rootElement.textContent).toContain("Choose JPEG, PNG, GIF, or WebP images under 20 MB.");
    }finally{await act(async()=>root.unmount());rootElement.remove();upload.mockRestore();hitTest.mockRestore();}
  });
  it("resolves dates deterministically and validates YouTube hosts and timestamps",()=>{const now=new Date(2026,7,27,10);expect(parseDateMention('yesterday',now)?.datetime).toBe('2026-08-26');expect(parseDateMention('February 30',now)).toBeNull();expect(dateMentionSuggestions('tom',now)[0].datetime).toBe('2026-08-28');expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=1m30s')?.startSeconds).toBe(90);expect(parseYouTubeUrl('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ')).toBeNull()});
});
