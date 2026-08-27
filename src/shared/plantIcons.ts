export const PLANT_ICON_IMAGES = [
  "/images/plant-spirit-standing.png",
  "/images/plant-spirit-seated.png",
  "/images/plant-spirit-resting.png",
] as const;

export function getPlantIcon(plantId: string): string {
  // Random UUIDs provide the variation; hashing keeps each plant's icon stable
  // across renders, sorting, reloads, and devices without changing its record.
  let hash = 2166136261;
  for (let index = 0; index < plantId.length; index++) {
    hash = Math.imul(hash ^ plantId.charCodeAt(index), 16777619);
  }
  return PLANT_ICON_IMAGES[(hash >>> 0) % PLANT_ICON_IMAGES.length];
}
