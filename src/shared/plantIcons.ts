export const PLANT_ICON_IMAGES = [
  "/images/plant-spirit-standing.png",
  "/images/plant-spirit-seated.png",
  "/images/plant-spirit-resting.png",
  "/images/plant-spirit-succulent-standing.png",
  "/images/plant-spirit-succulent-seated.png",
  "/images/plant-spirit-succulent-resting.png",
  "/images/plant-spirit-moss-standing.png",
  "/images/plant-spirit-moss-seated.png",
  "/images/plant-spirit-moss-resting.png",
] as const;

export const TERRARIUM_ICON_IMAGES = [
  "/images/plant-spirit-terrarium.png",
  "/images/plant-spirit-succulent-terrarium.png",
  "/images/plant-spirit-moss-terrarium.png",
] as const;

export function isPlantIconImage(value: unknown): value is typeof PLANT_ICON_IMAGES[number] {
  return typeof value === "string" && (PLANT_ICON_IMAGES as readonly string[]).includes(value);
}

export function isTerrariumIconImage(value: unknown): value is typeof TERRARIUM_ICON_IMAGES[number] {
  return typeof value === "string" && (TERRARIUM_ICON_IMAGES as readonly string[]).includes(value);
}

function visualHash(id: string): number {
  // Record IDs provide the variation; hashing keeps each companion's icon stable
  // across renders, sorting, reloads, and devices without changing its record.
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

export function getPlantIcon(plantId: string, selected?: string | null): string {
  if (isPlantIconImage(selected)) return selected;
  return PLANT_ICON_IMAGES[visualHash(plantId) % PLANT_ICON_IMAGES.length];
}

export function getTerrariumIcon(terrariumId: string, selected?: string | null): string {
  if (isTerrariumIconImage(selected)) return selected;
  return TERRARIUM_ICON_IMAGES[visualHash(terrariumId) % TERRARIUM_ICON_IMAGES.length];
}
