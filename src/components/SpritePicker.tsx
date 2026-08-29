import { useId } from "react";
import { PLANT_ICON_IMAGES, TERRARIUM_ICON_IMAGES } from "../shared/plantIcons";

type SpriteKind = "plant" | "terrarium";

function labelFor(src: string) {
  const head = src.includes("moss-") ? "Moss" : src.includes("succulent-") ? "Succulent" : "Leafy";
  if (src.includes("terrarium")) return `${head} terrarium`;
  const pose = src.includes("seated") ? "seated" : src.includes("resting") ? "resting" : "standing";
  return `${head} · ${pose}`;
}

export function SpritePicker({ kind, value, allowRandom = false, onChange }: {
  kind: SpriteKind;
  value: string;
  allowRandom?: boolean;
  onChange: (src: string) => void;
}) {
  const headingId = useId();
  const name = useId();
  const images = kind === "plant" ? PLANT_ICON_IMAGES : TERRARIUM_ICON_IMAGES;
  const surpriseImages = kind === "plant"
    ? [PLANT_ICON_IMAGES[0], PLANT_ICON_IMAGES[3], PLANT_ICON_IMAGES[6]]
    : [...TERRARIUM_ICON_IMAGES];

  return <section className={`sprite-picker sprite-picker-${kind} field-wide`} role="group" aria-labelledby={headingId}>
    <div className="sprite-picker-heading">
      <span id={headingId}>Companion sprite</span>
      <small>{allowRandom ? "Choose one now, or let the greenhouse surprise you." : "Choose how this companion appears across the greenhouse."}</small>
    </div>
    <div className="sprite-picker-grid">
      {allowRandom && <label className={`sprite-choice sprite-surprise ${value === "" ? "selected" : ""}`}>
        <input type="radio" name={name} value="" checked={value === ""} onChange={() => onChange("")}/>
        <span className="sprite-choice-preview">{surpriseImages.map(src => <img key={src} src={src} alt=""/>)}</span>
        <strong>Surprise me</strong><small>Assigned when saved</small>
      </label>}
      {images.map(src => <label className={`sprite-choice ${value === src ? "selected" : ""}`} key={src}>
        <input type="radio" name={name} value={src} checked={value === src} onChange={() => onChange(src)}/>
        <span className="sprite-choice-preview"><img src={src} alt=""/></span>
        <strong>{labelFor(src)}</strong>
      </label>)}
    </div>
  </section>;
}
