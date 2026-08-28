import { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Leaf, Sprout } from "lucide-react";
import { Link } from "react-router-dom";
import type { DashboardGardenItem } from "../shared/types";
import { useReducedMotion } from "./Interaction";
import { Spirit } from "./Spirit";

type GardenProps = {
  plants: DashboardGardenItem[]; terrariums: DashboardGardenItem[];
  initialScroll?: number; onScrollPositionChange?: (position: number) => void;
};
const emptyView = { overflow: false, previous: false, next: false, first: 0, last: 0 };

/** One continuous native scroller: no cloned entries, automatic movement, or page replacements. */
export function Garden({ plants, terrariums, initialScroll = 0, onScrollPositionChange }: GardenProps) {
  const items = [...plants.map(item => ({ item, kind: "plant" as const })), ...terrariums.map(item => ({ item, kind: "terrarium" as const }))];
  const track = useRef<HTMLUListElement>(null);
  const position = useRef(initialScroll), onPosition = useRef(onScrollPositionChange);
  onPosition.current = onScrollPositionChange;
  const [view, setView] = useState(emptyView), [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; left: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const reduced = useReducedMotion();
  const signature = items.map(({ item, kind }) => `${kind}:${item.id}:${item.name}`).join("\0");
  const publish = () => {
    const element = track.current;
    if (!element) return;
    const maximum = Math.max(0, element.scrollWidth - element.clientWidth);
    const left = Math.max(0, Math.min(element.scrollLeft, maximum));
    position.current = left; onPosition.current?.(left);
    const padding = Number.parseFloat(getComputedStyle(element).paddingLeft) || 0;
    const children = Array.from(element.children) as HTMLElement[];
    const visible = children.map((child, index) => ({ child, index })).filter(({ child }) => {
      const center = child.offsetLeft + child.offsetWidth / 2;
      return center >= left + padding && center <= left + element.clientWidth - padding;
    });
    const next = { overflow: maximum > 1, previous: left > 1, next: left < maximum - 1, first: visible[0]?.index || 0, last: visible.at(-1)?.index ?? Math.max(0, children.length - 1) };
    setView(current => Object.keys(next).every(key => current[key as keyof typeof next] === next[key as keyof typeof next]) ? current : next);
  };
  useLayoutEffect(() => {
    const element = track.current;
    if (!element) { position.current = 0; onPosition.current?.(0); setView(emptyView); return; }
    const restore = () => {
      element.scrollLeft = Math.max(0, Math.min(position.current, element.scrollWidth - element.clientWidth));
      publish();
    };
    restore();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(restore) : null;
    observer?.observe(element); window.addEventListener("resize", restore);
    return () => { observer?.disconnect(); window.removeEventListener("resize", restore); };
  }, [signature]);
  const scrollTo = (left: number) => {
    const element = track.current;
    if (!element) return;
    const target = Math.max(0, Math.min(left, element.scrollWidth - element.clientWidth));
    element.scrollTo({ left: target, behavior: reduced ? "auto" : "smooth" });
  };
  const roll = (direction: number) => {
    const element = track.current;
    if (!element) return;
    const first = element.children[0] as HTMLElement, second = element.children[1] as HTMLElement | undefined;
    const step = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;
    scrollTo(element.scrollLeft + direction * step);
  };
  const reveal = (link: HTMLElement) => {
    const element = track.current, item = link.parentElement;
    if (!element || !item) return;
    const padding = Number.parseFloat(getComputedStyle(element).paddingLeft) || 0;
    if (item.offsetLeft < element.scrollLeft + padding) scrollTo(item.offsetLeft - padding);
    else if (item.offsetLeft + item.offsetWidth > element.scrollLeft + element.clientWidth - padding) scrollTo(item.offsetLeft + item.offsetWidth - element.clientWidth + padding);
  };
  return <article className={`garden-card ${items.length ? "" : "empty"}`} role="region" aria-roledescription="carousel" aria-label="Your collection">
    <header className="garden-card-header"><div><span className="eyebrow">Your collection</span><h2>All of the sprites in your garden</h2></div><div><Link to="/plants"><Leaf/> Plants</Link><Link to="/terrariums"><Sprout/> Terrariums</Link></div></header>
    <div className="garden-scene" role="group" aria-label="Your plant and terrarium garden">
      {items.length ? <ul id="garden-track" ref={track} className={`garden-track ${dragging ? "is-dragging" : ""}`} tabIndex={0} aria-label="Garden companions" aria-describedby="garden-instructions" onScroll={publish}
        onDragStart={event => event.preventDefault()}
        onPointerDown={event => {
          suppressClick.current = false;
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          drag.current = { id: event.pointerId, x: event.clientX, left: event.currentTarget.scrollLeft, moved: false };
        }}
        onPointerMove={event => {
          const gesture = drag.current;
          if (!gesture || gesture.id !== event.pointerId) return;
          if (!(event.buttons & 1)) { drag.current = null; setDragging(false); return; }
          const distance = event.clientX - gesture.x;
          if (!gesture.moved && Math.abs(distance) < 6) return;
          if (!gesture.moved) { gesture.moved = true; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); }
          event.preventDefault(); event.currentTarget.scrollLeft = gesture.left - distance; publish();
        }}
        onPointerUp={event => {
          if (!drag.current || drag.current.id !== event.pointerId) return;
          suppressClick.current = drag.current.moved; drag.current = null; setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          publish();
        }}
        onPointerCancel={() => { drag.current = null; suppressClick.current = false; setDragging(false); }}
        onPointerLeave={() => { if (!drag.current?.moved) drag.current = null; }}
        onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
        onFocusCapture={event => { if (event.target instanceof HTMLElement && event.target.matches('.garden-item')) reveal(event.target); }}
        onKeyDown={event => {
          suppressClick.current = false;
          const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('.garden-item'));
          const index = links.indexOf(event.target as HTMLAnchorElement);
          const next = event.key === "ArrowRight" ? Math.min(links.length - 1, index + 1) : event.key === "ArrowLeft" ? Math.max(0, index - 1) : event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 : null;
          if (next === null) return;
          event.preventDefault(); links[next]?.focus({ preventScroll: true });
        }}>
        {items.map(({ item, kind }) => <li key={`${kind}-${item.id}`}><Link className={`garden-item ${kind}`} to={`/${kind === "plant" ? "plants" : "terrariums"}/${item.id}`} aria-label={`Open ${kind} ${item.name}`}>
          <Spirit id={item.id} kind={kind} size="garden"/><span className="garden-item-label">{item.name}</span>
        </Link></li>)}
      </ul> : <div className="garden-empty"><Sprout/><p>Add a plant or terrarium to begin your garden.</p></div>}
    </div>
    {items.length > 0 && <footer className="garden-controls"><div><span>{view.overflow ? `${view.first + 1}–${view.last + 1} of ${items.length} companions` : `${items.length} ${items.length === 1 ? "companion" : "companions"}`}</span><small id="garden-instructions">{view.overflow ? "Drag, swipe, or use the arrow keys to explore." : "Every little world, together."}</small></div>
      {view.overflow && <div className="garden-arrows"><button className="icon-button" aria-label="Scroll garden left" aria-controls="garden-track" disabled={!view.previous} onClick={() => roll(-1)}><ChevronLeft/></button><button className="icon-button" aria-label="Scroll garden right" aria-controls="garden-track" disabled={!view.next} onClick={() => roll(1)}><ChevronRight/></button></div>}
    </footer>}
  </article>;
}
