import { useEffect, useId, useRef, useState } from "react";
import { BookOpenText, Flower2, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { AppOptions, GlobalSearchResult } from "../shared/types";
import { ErrorNote, Modal } from "./Common";
import { Spirit } from "./Spirit";

export function GlobalSearch({ open, onClose, options }: { open: boolean; onClose: () => void; options: AppOptions | null }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [active, setActive] = useState(-1), [retry, setRetry] = useState(0);
  const list = useRef<HTMLDivElement>(null), generation = useRef(0);
  const resultId = useId(), navigate = useNavigate();
  const reset = () => { setQ(""); setResults([]); setError(""); setActive(-1); setLoading(false); };
  useEffect(() => {
    const request = ++generation.current;
    setResults([]); setActive(-1); setError("");
    if (!open || !q.trim()) { setLoading(false); return; }
    setLoading(true);
    const timer = window.setTimeout(() => {
      void api.get<GlobalSearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`).then(data => {
        if (generation.current === request) { setResults(data); setLoading(false); }
      }).catch(reason => {
        if (generation.current === request) { setError(reason instanceof Error ? reason.message : "Search could not load."); setLoading(false); }
      });
    }, 180);
    return () => { window.clearTimeout(timer); generation.current++; };
  }, [q, open, retry]);
  const select = (result: GlobalSearchResult) => { onClose(); navigate(result.url); };
  return <Modal open={open} onExited={reset} title="Search your greenhouse" eyebrow="Find a familiar face" className="search-dialog" onClose={onClose}>
    <div className="command-search">
      <label className="command-input"><Search aria-hidden="true"/><input autoFocus aria-label="Search plants, species, terrariums, and journal" role="combobox" aria-autocomplete="list" aria-controls={resultId} aria-expanded={!!q.trim()} aria-activedescendant={active >= 0 ? `${resultId}-${active}` : undefined} value={q} placeholder="A name, tag, or something you wrote…" onChange={e => setQ(e.target.value)} onKeyDown={e => {
        if ((e.key === "ArrowDown" || e.key === "ArrowUp") && results.length) {
          e.preventDefault();
          const next = active < 0 ? (e.key === "ArrowDown" ? 0 : results.length - 1) : (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
          setActive(next); list.current?.children[next]?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
        } else if (e.key === "Enter" && results.length) { e.preventDefault(); select(results[Math.max(0, active)]); }
      }}/></label>
      <div className="command-status" role="status" aria-live="polite">{loading ? "Searching your greenhouse…" : q.trim() && !error ? `${results.length} ${results.length === 1 ? "result" : "results"}` : ""}</div>
      {error && <div className="command-error"><ErrorNote message={error}/><button className="button ghost" onClick={() => setRetry(n => n + 1)}>Retry search</button></div>}
      <div ref={list} className="search-results" id={resultId} role="listbox" aria-label="Search results">
        {results.map((result, index) => <div role="option" aria-selected={active === index} id={`${resultId}-${index}`} key={`${result.type}-${result.id}`} onMouseDown={e => e.preventDefault()} onClick={() => select(result)}>
          {result.type === "plant" || result.type === "terrarium" ? <Spirit id={result.id} spriteImage={result.spriteImage} kind={result.type}/> : <span className="search-result-icon">{result.type === "species" ? <Flower2/> : <BookOpenText/>}</span>}
          <span><strong>{result.title}</strong><small>{result.type} · {result.subtitle}</small></span>
        </div>)}
      </div>
      {q.trim() && !loading && !error && !results.length && <p className="search-empty">No matches yet. Try a different name or a shorter phrase.</p>}
      {!q.trim() && <div className="search-hints"><p>A plant name, scientific name, location, tag, terrarium, or words from your journal.</p><div><span>{options?.species.length || 0} species</span><span>{options?.terrariums.length || 0} terrariums</span><span>{options?.tags.length || 0} tags</span></div></div>}
      <p className="command-help">↑ ↓ to explore · Enter to open · Esc to close</p>
    </div>
  </Modal>;
}
