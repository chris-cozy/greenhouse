import { Component, Suspense, lazy, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, List, Minus, Pause, Play, Plus, RotateCcw, Search, Sprout } from "lucide-react";
import { Link } from "react-router-dom";
import type { DashboardGardenItem } from "../shared/types";
import { companions, plots, clampCamera, DEFAULT_CAMERA, PLOT_SIZE, type CameraView } from "../garden/model";
import { GardenCarousel, type CarouselViewState } from "./GardenCarousel";
import { useOverlaysOpen, useReducedMotion } from "./Interaction";
import "./Garden.css";

export { gardenModulo } from "./GardenCarousel";
export const GARDEN_VIEW_KEY = "greenhouse-garden-view";
export type GardenViewState = { mode: "garden" | "list"; activeKey: string | null; plotKey: string | null; camera: CameraView; paused: boolean; listState?: CarouselViewState };
type Props = { plants: DashboardGardenItem[]; terrariums: DashboardGardenItem[]; initialState?: GardenViewState; onViewStateChange?: (state: GardenViewState) => void };
function preference(): "garden" | "list" { try { return localStorage.getItem(GARDEN_VIEW_KEY) === "list" ? "list" : "garden"; } catch { return "garden"; } }
class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function Garden({ plants, terrariums, initialState, onViewStateChange }: Props) {
  const [view, setView] = useState<GardenViewState>(() => initialState ?? { mode: preference(), activeKey: null, plotKey: null, camera: { ...DEFAULT_CAMERA }, paused: false });
  const [desktop, setDesktop] = useState(() => !!window.matchMedia?.("(min-width: 768px)").matches);
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0), [query, setQuery] = useState("");
  const [onscreen, setOnscreen] = useState(true), [visible, setVisible] = useState(!document.hidden), [keyboard, setKeyboard] = useState(false);
  const reduced = useReducedMotion(), overlays = useOverlaysOpen();
  const region = useRef<HTMLDivElement>(null), finder = useRef<HTMLDetailsElement>(null), pointer = useRef(false);
  const profileLink = useRef<HTMLAnchorElement>(null), focusSelection = useRef(false);
  const items = useMemo(() => companions(plants, terrariums), [plants, terrariums]), pages = useMemo(() => plots(items), [items]);
  const desiredIndex = pages.findIndex(page => page.some(item => item.key === (view.activeKey ?? view.plotKey)));
  const plotIndex = Math.max(0, desiredIndex), current = pages[plotIndex] ?? [];
  const selected = items.find(item => item.key === view.activeKey);
  const running = !view.paused && !reduced && !overlays && onscreen && visible && !keyboard;
  const LazyScene = useMemo(() => lazy(() => import("./GardenScene")), [attempt]);
  const resultsId = useId();
  const publish = useRef(onViewStateChange); publish.current = onViewStateChange;
  useEffect(() => { publish.current?.(view); }, [view]);
  useEffect(() => { if (focusSelection.current && profileLink.current) { focusSelection.current = false; profileLink.current.focus(); } });
  useEffect(() => {
    const media = window.matchMedia?.("(min-width: 768px)");
    const resize = () => setDesktop(!!media?.matches);
    media?.addEventListener("change", resize); resize();
    return () => media?.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", visibility);
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => setOnscreen(entries[0]?.isIntersecting ?? false));
    if (region.current) observer?.observe(region.current);
    return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    if (view.activeKey && !items.some(item => item.key === view.activeKey)) setView(previous => ({ ...previous, activeKey: null }));
  }, [items, view.activeKey]);
  const mode = (next: "garden" | "list") => { setView(previous => ({ ...previous, mode: next })); try { localStorage.setItem(GARDEN_VIEW_KEY, next); } catch { /* Session choice remains usable. */ } };
  const select = (key: string | null) => {
    focusSelection.current = !!key && !!finder.current?.contains(document.activeElement);
    setView(previous => ({ ...previous, activeKey: key, ...(key ? { plotKey: key } : {}) }));
    if (finder.current) finder.current.open = false;
  };
  const camera = (next: CameraView) => setView(previous => ({ ...previous, camera: clampCamera(next) }));
  const retry = async () => {
    try { const module = await import("./GardenScene"); module.clearGardenAssets(); } catch { /* Lazy import retries the module load. */ }
    setFailed(false); setAttempt(value => value + 1);
  };
  const fallback = <GardenCarousel plants={plants} terrariums={terrariums} initialState={view.listState} onViewStateChange={listState => setView(previous => ({ ...previous, listState }))}/>;
  const three = desktop && view.mode === "garden" && !failed && items.length > 0;
  return <div ref={region} className="garden-home" onPointerDownCapture={() => { pointer.current = true; setKeyboard(false); }}
    onFocusCapture={() => { if (!pointer.current) setKeyboard(true); }} onPointerUpCapture={() => { pointer.current = false; }} onPointerCancelCapture={() => { pointer.current = false; }}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setKeyboard(false); }}
    onKeyDownCapture={event => { pointer.current = false; if (event.key === "Tab") setKeyboard(true); if (event.key === "Escape") { select(null); if (finder.current) finder.current.open = false; } }}>
    {desktop && items.length > 0 && <div className="garden-mode-bar" role="group" aria-label="Collection view">
      <button className="button ghost" aria-pressed={view.mode === "garden"} onClick={() => mode("garden")}><Sprout size={15}/> Garden</button>
      <button className="button ghost" aria-pressed={view.mode === "list"} onClick={() => mode("list")}><List size={15}/> List</button>
    </div>}
    {failed && desktop && view.mode === "garden" && <p className="garden-fallback" role="status">The 3D garden couldn’t load. Your companions are here in the list. <button className="button ghost" onClick={() => void retry()}>Retry garden</button></p>}
    {three ? <article className="garden-card garden-3d" aria-label="Your collection">
      <header className="garden-card-header"><span className="eyebrow">Your collection</span><div className="garden-heading-row"><h2>All of the sprites in your garden</h2>
        <button className="button ghost" disabled={reduced} onClick={() => setView(previous => ({ ...previous, paused: !previous.paused }))}>{reduced || view.paused ? <Play size={15}/> : <Pause size={15}/>} {reduced ? "Motion off" : view.paused ? "Play" : "Pause"}</button>
      </div></header>
      <div className="garden-canvas-wrap">
        <SceneBoundary key={attempt} onError={() => setFailed(true)}><Suspense fallback={<div className="garden-loading" role="status">Opening your garden…</div>}>
          <LazyScene items={current} running={running} reduced={reduced} selected={selected?.key ?? null} camera={view.camera} onCamera={camera} onSelect={select} onError={() => setFailed(true)}/>
        </Suspense></SceneBoundary>
        <div className="garden-camera-tools" role="group" aria-label="Garden camera">
          <button className="icon-button" aria-label="Zoom in" disabled={view.camera.zoom >= 2.2} onClick={() => camera({ ...view.camera, zoom: view.camera.zoom + .2 })}><Plus size={16}/></button>
          <button className="icon-button" aria-label="Zoom out" disabled={view.camera.zoom <= .8} onClick={() => camera({ ...view.camera, zoom: view.camera.zoom - .2 })}><Minus size={16}/></button>
          <button className="icon-button" aria-label="Reset view" onClick={() => camera({ ...DEFAULT_CAMERA })}><RotateCcw size={16}/></button>
        </div>
        {selected && <div className="garden-selected" role="status"><span><strong>{selected.name}</strong><small>{selected.kind === "plant" ? "Plant companion" : "Terrarium habitat"}</small></span><Link ref={profileLink} className="button ghost" to={selected.href}>Open profile</Link><button className="icon-button" aria-label="Clear selection" onClick={() => select(null)}>×</button></div>}
      </div>
      <footer className="garden-footer garden-3d-footer">
        <div className="garden-plot-controls"><button className="icon-button" aria-label="Previous garden plot" disabled={plotIndex === 0} onClick={() => setView(previous => ({ ...previous, activeKey: null, plotKey: pages[plotIndex - 1][0].key, camera: { ...DEFAULT_CAMERA } }))}><ChevronLeft size={16}/></button>
          <span role="status">Plot {plotIndex + 1} of {pages.length} · {items.length} {items.length === 1 ? "companion" : "companions"}</span>
          <button className="icon-button" aria-label="Next garden plot" disabled={plotIndex === pages.length - 1} onClick={() => setView(previous => ({ ...previous, activeKey: null, plotKey: pages[plotIndex + 1][0].key, camera: { ...DEFAULT_CAMERA } }))}><ChevronRight size={16}/></button></div>
        <small>Drag to explore. Select a companion to visit its profile.</small>
      </footer>
      <details ref={finder} className="garden-finder"><summary><Search size={15}/> Find a companion</summary><div className="garden-finder-content">
        <label className="inline-search"><Search size={16}/><input aria-label="Search garden companions" aria-controls={resultsId} placeholder="Search by name…" value={query} onChange={event => setQuery(event.target.value)}/></label>
        <ul id={resultsId}>{items.filter(item => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(item => <li key={item.key}><button aria-pressed={view.activeKey === item.key} onClick={() => select(item.key)}><img src={item.spriteImage} alt=""/><span>{item.name}<small>{item.kind === "plant" ? "Plant" : "Terrarium"} · Plot {Math.floor(items.indexOf(item) / PLOT_SIZE) + 1}</small></span></button><Link to={item.href} aria-label={`Open ${item.kind} ${item.name}`}>Open profile</Link></li>)}</ul>
        {!items.some(item => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && <p>No companions match that name.</p>}
      </div></details>
    </article> : fallback}
  </div>;
}
