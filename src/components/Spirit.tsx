import type { CSSProperties } from "react";
import { getPlantIcon } from "../shared/plantIcons";

export type SpiritMotion = "still" | "idle" | "settle";
type SpiritPose = "standing" | "seated" | "resting" | "terrarium";

function visualHash(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return hash >>> 0;
}
function poseFor(src: string): SpiritPose {
  if (src.includes("seated")) return "seated";
  if (src.includes("resting")) return "resting";
  return "standing";
}

export function Spirit({ id, kind = "plant", size = "small", motion = "still" }: {
  id: string; kind?: "plant" | "terrarium"; size?: "small" | "garden" | "profile" | "empty"; motion?: SpiritMotion;
}) {
  const src = kind === "plant" ? getPlantIcon(id) : "/images/plant-spirit-terrarium.png";
  const hash = visualHash(id), pose = kind === "plant" ? poseFor(src) : "terrarium";
  const profile = pose === "standing" ? "sway" : pose === "seated" ? "nod" : pose === "resting" ? "breathe" : "terrarium";
  const style = {
    "--spirit-duration": `${5200 + hash % 1800}ms`,
    "--spirit-delay": `${-(hash % 4800)}ms`,
  } as CSSProperties;
  return <span className={`spirit spirit-${size} spirit-${kind} spirit-pose-${pose} spirit-motion-${motion} spirit-profile-${profile}`}
    data-pose={pose} data-motion-profile={profile} style={style} aria-hidden="true">
    <img className={kind === "plant" ? "garden-plant-icon" : "garden-terrarium"} src={src} alt="" draggable={false}/>
  </span>;
}
