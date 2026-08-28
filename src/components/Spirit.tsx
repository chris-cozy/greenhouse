import { getPlantIcon } from "../shared/plantIcons";

export function Spirit({ id, kind = "plant", size = "small", settling = false }: {
  id: string; kind?: "plant" | "terrarium"; size?: "small" | "garden" | "profile" | "empty"; settling?: boolean;
}) {
  return <span className={`spirit spirit-${size}${settling ? " spirit-settling" : ""}`} aria-hidden="true">
    <img className={kind === "plant" ? "garden-plant-icon" : "garden-terrarium"}
      src={kind === "plant" ? getPlantIcon(id) : "/images/plant-spirit-terrarium.png"} alt="" draggable={false}/>
  </span>;
}
