import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";

const overlays = new Set<symbol>();
let unlockedOverflow = "";
const overlayListeners = new Set<() => void>();
const subscribeOverlays = (listener: () => void) => { overlayListeners.add(listener); return () => { overlayListeners.delete(listener); }; };
const notifyOverlays = () => overlayListeners.forEach(listener => listener());
export function useOverlay(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const key = Symbol();
    if (!overlays.size) { unlockedOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    overlays.add(key); notifyOverlays();
    return () => { overlays.delete(key); if (!overlays.size) document.body.style.overflow = unlockedOverflow; notifyOverlays(); };
  }, [open]);
}
export function useOverlaysOpen() { return useSyncExternalStore(subscribeOverlays, () => overlays.size > 0, () => false); }

/** Respond to usable content width, including sidebar changes, without replacing children. */
export function useContentWidth(minimum = 900) {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => { const style = getComputedStyle(element); setWide(element.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) >= minimum); };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element); window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [minimum]);
  return { ref, wide };
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const change = () => setReduced(query.matches);
    change(); query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return reduced;
}

export function usePresence(open: boolean) {
  const reduced = useReducedMotion();
  const [retained, setRetained] = useState(open);
  useEffect(() => {
    if (open) { setRetained(true); return; }
    if (!retained) return;
    if (reduced) { setRetained(false); return; }
    const timer = window.setTimeout(() => setRetained(false), 120);
    return () => window.clearTimeout(timer);
  }, [open, reduced, retained]);
  return { present: open || (!reduced && retained), exiting: !open };
}

/** Lock synchronously as well as visually: two submits in one render still produce one write. */
export function useMutation() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async <T,>(write: () => Promise<T>, saved: (value: T) => void) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    let value: T;
    try { value = await write(); }
    catch (error) {
      setError(error instanceof Error ? error.message : "Could not save. Please try again.");
      lock.current = false; setBusy(false); return;
    }
    lock.current = false; setBusy(false);
    // A successful write must never be reported as failed because its follow-up read failed.
    saved(value);
  };
  return { busy, error, run, isBusy: () => lock.current, clearError: () => setError("") };
}

export function useFeedback() {
  const [feedback, setFeedback] = useState<{ message: string; sequence: number } | null>(null);
  const [settling, setSettling] = useState(false);
  const sequence = useRef(0);
  const announce = useCallback((message: string) => {
    setFeedback({ message, sequence: ++sequence.current }); setSettling(true);
  }, []);
  useEffect(() => {
    if (!feedback) return;
    const settle = window.setTimeout(() => setSettling(false), 360);
    const hide = window.setTimeout(() => setFeedback(null), 4500);
    return () => { window.clearTimeout(settle); window.clearTimeout(hide); };
  }, [feedback]);
  return { feedback, settling, announce };
}

export function SaveFeedback({ message, sequence = 0 }: { message?: string; sequence?: number }) {
  return <div className={`save-feedback ${message ? "has-message" : ""}`} role="status" aria-live="polite" aria-atomic="true">
    {message && <span key={sequence} className="save-feedback-message"><Check size={16} aria-hidden="true"/><span>{message}</span></span>}
  </div>;
}
