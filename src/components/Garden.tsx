import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Sprout } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { DashboardGardenItem } from "../shared/types";
import { useOverlaysOpen, useReducedMotion } from "./Interaction";
import { Spirit } from "./Spirit";

export type GardenViewState = { anchorKey: string; fraction: number; paused: boolean };
type GardenProps = {
  plants: DashboardGardenItem[]; terrariums: DashboardGardenItem[];
  initialState?: GardenViewState; onViewStateChange?: (state: GardenViewState) => void;
};
export const gardenModulo = (value: number, period: number) => {
  if (period <= 0) return 0;
  const result = ((value % period) + period) % period;
  return result < 1e-7 || period - result < 1e-7 ? 0 : result;
};
const SPEED = 18, START_DELAY = 1200, INTERACTION_DELAY = 4000;

/** Native scrolling with decorative buffers; only the central sequence is keyboard/AT reachable. */
export function Garden({ plants, terrariums, initialState, onViewStateChange }: GardenProps) {
  const items = [...plants.map(item => ({ item, kind: "plant" as const, key: `plant:${item.id}` })), ...terrariums.map(item => ({ item, kind: "terrarium" as const, key: `terrarium:${item.id}` }))];
  const signature = items.map(({ key, item }) => `${key}:${item.name}`).join("\0");
  const region = useRef<HTMLElement>(null), track = useRef<HTMLUListElement>(null);
  const geometry = useRef({ period: 0, stride: 0, padding: 0 });
  const position = useRef<GardenViewState>(initialState || { anchorKey: items[0]?.key || "", fraction: 0, paused: false });
  const onPosition = useRef(onViewStateChange); onPosition.current = onViewStateChange;
  const [loop, setLoop] = useState(false), [paused, setPaused] = useState(position.current.paused);
  const [hovered, setHovered] = useState(false), [touching, setTouching] = useState(false), [dragging, setDragging] = useState(false);
  const [onscreen, setOnscreen] = useState(true), [visible, setVisible] = useState(!document.hidden);
  const [announcement, setAnnouncement] = useState("");
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const reduced = useReducedMotion(), overlays = useOverlaysOpen();
  const cooldown = useRef(performance.now() + START_DELAY), manualFrame = useRef(0);
  const drag = useRef<{ id: number; x: number; left: number; moved: boolean } | null>(null);
  const pointerFocus = useRef(false);
  const suppressClick = useRef(false);
  const navigate = useNavigate();
  const id = useId(), trackId = `${id}-track`, instructionsId = `${id}-instructions`;
  const savePosition = () => {
    const element = track.current, { period, stride } = geometry.current;
    if (!element || !stride || !items.length) return;
    if (loop) {
      const phase = gardenModulo(element.scrollLeft - period, period);
      const index = Math.min(items.length - 1, Math.floor(phase / stride));
      position.current = { anchorKey: items[index].key, fraction: (phase - index * stride) / stride, paused: pausedRef.current };
    } else position.current = { ...position.current, paused: pausedRef.current };
    onPosition.current?.(position.current);
  };
  const publish = () => {
    const element = track.current, { period } = geometry.current;
    if (!element || !period) return;
    if (loop) {
      const left = element.scrollLeft;
      if (left < period || left >= period * 2 - 1e-7) {
        const rebased = period + gardenModulo(left - period, period);
        element.scrollLeft = rebased;
        if (drag.current) drag.current.left += rebased - left;
      }
    }
    savePosition();
  };
  const latestPublish = useRef(publish); latestPublish.current = publish;
  const stopManual = () => { cancelAnimationFrame(manualFrame.current); manualFrame.current = 0; };
  const rest = () => { cooldown.current = performance.now() + INTERACTION_DELAY; stopManual(); };
  const changePlayback = (next: boolean, announce = true) => {
    pausedRef.current = next; setPaused(next);
    position.current = { ...position.current, paused: next }; onPosition.current?.(position.current);
    if (announce) setAnnouncement(next ? "Garden paused." : "Automatic scrolling enabled.");
  };

  useLayoutEffect(() => {
    const element = track.current;
    if (!element || !items.length) {
      geometry.current = { period: 0, stride: 0, padding: 0 }; setLoop(false);
      position.current = { anchorKey: "", fraction: 0, paused: pausedRef.current }; onPosition.current?.(position.current); return;
    }
    const measure = () => {
      stopManual();
      const canonical = Array.from(element.querySelectorAll<HTMLElement>('li[data-copy="0"]'));
      if (!canonical.length) return;
      const style = getComputedStyle(element), padding = parseFloat(style.paddingLeft) || 0, right = parseFloat(style.paddingRight) || 0;
      const gap = parseFloat(style.columnGap) || 0;
      const firstRect = canonical[0].getBoundingClientRect(), lastRect = canonical.at(-1)!.getBoundingClientRect();
      const period = loop ? firstRect.left - element.children[0].getBoundingClientRect().left : lastRect.right - firstRect.left + gap;
      const stride = period / items.length;
      geometry.current = { period, stride, padding };
      const overflow = items.length > 1 && period - gap + padding + right > element.clientWidth + 1;
      let index = items.findIndex(item => item.key === position.current.anchorKey);
      if (index < 0) { index = 0; position.current = { anchorKey: items[0].key, fraction: 0, paused: pausedRef.current }; }
      if (overflow !== loop) { setLoop(overflow); return; }
      element.scrollLeft = loop ? period + (index + Math.max(0, Math.min(.999, position.current.fraction))) * stride : 0;
      if (drag.current) drag.current = null;
      setDragging(false); savePosition();
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element); window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); stopManual(); };
  }, [signature, loop]);

  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    const endPointer = () => { pointerFocus.current = false; };
    document.addEventListener("keydown", endPointer, true);
    document.addEventListener("pointerup", endPointer, true);
    document.addEventListener("pointercancel", endPointer, true);
    document.addEventListener("visibilitychange", change);
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => setOnscreen(entries[0]?.isIntersecting ?? false));
    if (region.current) observer?.observe(region.current);
    return () => { document.removeEventListener("visibilitychange", change); document.removeEventListener("keydown", endPointer, true); document.removeEventListener("pointerup", endPointer, true); document.removeEventListener("pointercancel", endPointer, true); observer?.disconnect(); };
  }, []);
  useEffect(() => {
    if (!loop || paused || reduced || hovered || touching || dragging || !visible || !onscreen || overlays) return;
    let frame = 0, previous = performance.now(), preciseLeft = track.current?.scrollLeft || 0;
    const tick = (now: number) => {
      const elapsed = Math.min(64, Math.max(0, now - Math.max(previous, cooldown.current)));
      previous = now;
      if (track.current && elapsed) {
        const period = geometry.current.period;
        preciseLeft = period + gardenModulo(preciseLeft + elapsed * SPEED / 1000 - period, period);
        track.current.scrollLeft = preciseLeft; latestPublish.current();
      } else preciseLeft = track.current?.scrollLeft || 0;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [loop, paused, reduced, hovered, touching, dragging, visible, onscreen, overlays]);
  useEffect(() => { if (reduced) stopManual(); }, [reduced]);
  useEffect(() => () => stopManual(), []);

  const roll = (direction: number) => {
    rest();
    const element = track.current, distance = direction * geometry.current.stride;
    if (!element) return;
    if (reduced) { element.scrollTo({ left: element.scrollLeft + distance, behavior: "auto" }); publish(); }
    else {
      const start = performance.now(); let previous = 0, preciseLeft = element.scrollLeft;
      const step = (now: number) => {
        const progress = Math.min(1, (now - start) / 160), next = distance * (1 - Math.pow(1 - progress, 3));
        preciseLeft = geometry.current.period + gardenModulo(preciseLeft + next - previous - geometry.current.period, geometry.current.period);
        element.scrollLeft = preciseLeft; previous = next; latestPublish.current();
        if (progress < 1) manualFrame.current = requestAnimationFrame(step);
      };
      manualFrame.current = requestAnimationFrame(step);
    }
    const phase = gardenModulo(element.scrollLeft - geometry.current.period, geometry.current.period);
    const index = gardenModulo(Math.floor(phase / geometry.current.stride) + (reduced ? 0 : direction), items.length);
    setAnnouncement(`${items[index]?.item.name}. ${index + 1} of ${items.length} companions.`);
  };
  const reveal = (link: HTMLElement) => {
    const element = track.current, item = link.parentElement;
    if (!element || !item) return;
    stopManual();
    const { padding } = geometry.current;
    const bounds = item.getBoundingClientRect(), viewport = element.getBoundingClientRect();
    if (bounds.left < viewport.left + padding || bounds.right > viewport.right - padding) {
      element.scrollLeft += bounds.left - viewport.left - padding; publish();
    }
  };
  const endDrag = () => {
    if (!drag.current) return;
    suppressClick.current = drag.current.moved; drag.current = null; setDragging(false); rest(); publish();
  };
  const canonicalLinks = () => Array.from(track.current?.querySelectorAll<HTMLAnchorElement>('li[data-copy="0"] .garden-item') || []);
  return <article ref={region} className={`garden-card ${items.length ? "" : "empty"}`} role="region" aria-roledescription="carousel" aria-label="Your collection"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onPointerDownCapture={() => { pointerFocus.current = true; }} onPointerUpCapture={() => { pointerFocus.current = false; }} onPointerCancelCapture={() => { pointerFocus.current = false; }} onKeyDownCapture={() => { pointerFocus.current = false; }}
    onFocusCapture={() => { if (!pointerFocus.current) changePlayback(true, false); }}>
    <header className="garden-card-header">
      <span className="eyebrow">Your collection</span>
      <div className="garden-heading-row">
        <h2>All of the sprites in your garden</h2>
        {loop && <div className="garden-playback">
          <button className="button ghost" disabled={reduced} aria-controls={trackId} onClick={() => changePlayback(!pausedRef.current)}>{reduced || paused ? <Play size={16}/> : <Pause size={16}/>} {reduced ? "Motion off" : paused ? "Play" : "Pause"}</button>
          <div className="garden-arrows"><button className="icon-button" aria-label="Scroll garden left" aria-controls={trackId} onClick={() => roll(-1)}><ChevronLeft/></button><button className="icon-button" aria-label="Scroll garden right" aria-controls={trackId} onClick={() => roll(1)}><ChevronRight/></button></div>
        </div>}
      </div>
    </header>
    <div className="garden-scene" role="group" aria-label="Your plant and terrarium garden">
      {items.length ? <ul id={trackId} ref={track} className={`garden-track ${loop ? "is-looping" : ""} ${dragging ? "is-dragging" : ""}`} tabIndex={0} aria-label="Garden companions" aria-describedby={instructionsId} onScroll={publish}
        onDragStart={event => event.preventDefault()}
        onWheel={event => { if (event.deltaX || event.shiftKey) rest(); }}
        onTouchStart={() => { setTouching(true); rest(); }} onTouchMove={rest} onTouchEnd={() => { setTouching(false); rest(); }} onTouchCancel={() => { setTouching(false); rest(); }}
        onPointerDown={event => {
          suppressClick.current = false; rest();
          if (event.pointerType !== "mouse" || event.button !== 0 || !loop) return;
          drag.current = { id: event.pointerId, x: event.clientX, left: event.currentTarget.scrollLeft, moved: false };
        }}
        onPointerMove={event => {
          const gesture = drag.current;
          if (!gesture || gesture.id !== event.pointerId) return;
          if (!(event.buttons & 1)) { endDrag(); return; }
          const distance = event.clientX - gesture.x;
          if (!gesture.moved && Math.abs(distance) < 6) return;
          if (!gesture.moved) { gesture.moved = true; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); }
          event.preventDefault(); event.currentTarget.scrollLeft = gesture.left - distance; publish();
        }}
        onPointerUp={event => { if (drag.current?.id !== event.pointerId) return; endDrag(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={endDrag} onPointerLeave={() => { if (!drag.current?.moved) drag.current = null; }}
        onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
        onFocusCapture={event => {
          if (!(event.target instanceof HTMLElement) || !event.target.matches(".garden-item")) return;
          if (event.target.closest('li[data-copy="0"]')) reveal(event.target);
          else { const index = Number(event.target.parentElement?.dataset.index); canonicalLinks()[index]?.focus({ preventScroll: true }); }
        }}
        onKeyDown={event => {
          suppressClick.current = false;
          const links = canonicalLinks(), index = links.indexOf(event.target as HTMLAnchorElement);
          const next = event.key === "ArrowRight" ? gardenModulo(index + 1, links.length) : event.key === "ArrowLeft" ? gardenModulo(index < 0 ? links.length - 1 : index - 1, links.length) : event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 : null;
          if (next === null) return;
          event.preventDefault(); links[next]?.focus({ preventScroll: true }); setAnnouncement(`${items[next].item.name}. ${next + 1} of ${items.length} companions.`);
        }}>
        {(loop ? [-1, 0, 1] : [0]).flatMap(copy => items.map(({ item, kind, key }, index) => <li data-copy={copy} data-index={index} key={`${copy}:${key}`} aria-hidden={copy !== 0 ? true : undefined} aria-posinset={copy === 0 ? index + 1 : undefined} aria-setsize={copy === 0 ? items.length : undefined}>
          {copy === 0 ? <Link className={`garden-item ${kind}`} to={`/${kind === "plant" ? "plants" : "terrariums"}/${item.id}`} onMouseDown={event => event.preventDefault()} aria-label={`Open ${kind} ${item.name}`}><Spirit id={item.id} kind={kind} size="garden"/><span className="garden-item-label">{item.name}</span></Link> : <div className={`garden-item ${kind}`} onMouseDown={event => event.preventDefault()} onClick={() => navigate(`/${kind === "plant" ? "plants" : "terrariums"}/${item.id}`)}><Spirit id={item.id} kind={kind} size="garden"/><span className="garden-item-label">{item.name}</span></div>}
        </li>))}
      </ul> : <div className="garden-empty"><Sprout/><p>Add a plant or terrarium to begin your garden.</p></div>}
    </div>
    {items.length > 0 && <footer className="garden-footer"><span>{items.length} {items.length === 1 ? "companion" : "companions"}</span><small id={instructionsId}>{loop ? reduced ? "Reduced motion is on. Drag, swipe, or use the arrows." : "Drag, swipe, or use the arrow keys to explore." : "Every little world, together."}</small></footer>}
    <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
  </article>;
}
