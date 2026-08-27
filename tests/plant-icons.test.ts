import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPlantIcon, PLANT_ICON_IMAGES } from "../src/shared/plantIcons";

const plantIds = Array.from(
  { length: 64 },
  (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
);

describe("collection plant icons", () => {
  it("uses only the three replacement plant variants", () => {
    expect(PLANT_ICON_IMAGES).toEqual([
      "/images/plant-spirit-standing.png",
      "/images/plant-spirit-seated.png",
      "/images/plant-spirit-resting.png",
    ]);
  });

  it("selects from the entire pool for existing and newly created plant IDs", () => {
    const icons = plantIds.map(getPlantIcon);
    expect(new Set(icons)).toEqual(new Set(PLANT_ICON_IMAGES));
    for (const icon of icons) expect(PLANT_ICON_IMAGES).toContain(icon);
  });

  it("keeps each assignment stable across repeated calls", () => {
    const initialIcons = plantIds.map(getPlantIcon);
    for (let render = 0; render < 10; render++) {
      expect(plantIds.map(getPlantIcon)).toEqual(initialIcons);
    }
  });

  it("does not reassign icons when plants are renamed, reordered, added, or removed", () => {
    const plants = plantIds.map((id, index) => ({ id, name: `Plant ${index}` }));
    const initialIcons = new Map(plants.map(plant => [plant.id, getPlantIcon(plant.id)]));
    getPlantIcon("new-plant-id");
    const changedCollection = plants.slice(8).reverse().map(plant => ({ ...plant, name: "Renamed" }));
    for (const plant of changedCollection) {
      expect(getPlantIcon(plant.id)).toBe(initialIcons.get(plant.id));
    }
  });

  it.each(PLANT_ICON_IMAGES)("ships a PNG asset for %s", icon => {
    const image = readFileSync(new URL(`../public${icon}`, import.meta.url));
    expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(image.readUInt32BE(16)).toBeGreaterThan(0);
    expect(image.readUInt32BE(20)).toBeGreaterThan(0);
    // The icons need an alpha channel to sit on the collection's grass scene.
    expect(image[25]).toBe(6);
  });
});
