import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

export function ProfileTabs<T extends string>({ selected, onSelect, tabs, prefix, label }: {
  selected: T; onSelect: (tab: T) => void; tabs: ReadonlyArray<readonly [T, string]>; prefix: string; label: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const button = list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
      if (button) setIndicator({ left: button.offsetLeft, width: button.offsetWidth });
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (list.current) observer?.observe(list.current);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [selected]);
  return <div className="detail-tabs" role="tablist" aria-label={label} ref={list}
    style={{ "--tab-left": `${indicator.left}px`, "--tab-width": `${indicator.width}px` } as CSSProperties}>
    {tabs.map(([key, title], index) => <button role="tab" id={`${prefix}-tab-${key}`} aria-controls={`${prefix}-panel-${key}`}
      aria-selected={selected === key} tabIndex={selected === key ? 0 : -1} className={selected === key ? "active" : ""} key={key} onClick={() => onSelect(key)}
      onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); onSelect(tabs[next][0]); list.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
      }}>{title}</button>)}
    <span className="tab-indicator" aria-hidden="true"/>
  </div>;
}
