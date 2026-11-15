import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ASSETS, CLIPS, companions, plots, createWorld, stepWorld, WAYPOINTS, clampCamera } from "../src/garden/model";
import { PLANT_ICON_IMAGES, TERRARIUM_ICON_IMAGES } from "../src/shared/plantIcons";

const plants = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, name: `Plant ${i}`, spriteImage: PLANT_ICON_IMAGES[i % 9] }));
describe("garden identities and simulation", () => {
  it("maps every existing sprite to its family and pose without changing stored choices", () => {
    const result = companions(plants.slice(0, 9), TERRARIUM_ICON_IMAGES.map((spriteImage, i) => ({ id: `t${i}`, name: `Jar ${i}`, spriteImage })));
    expect(result.slice(0, 9).map(item => item.pose)).toEqual(["standing", "seated", "resting", "standing", "seated", "resting", "standing", "seated", "resting"]);
    expect(result.slice(9).map(item => item.family)).toEqual(["flowering", "succulent", "moss"]);
    expect(result.map(item => item.spriteImage)).toEqual([...PLANT_ICON_IMAGES, ...TERRARIUM_ICON_IMAGES]);
    expect(companions([{ id: "legacy", name: "Legacy", spriteImage: "" }], [])).toEqual(companions([{ id: "legacy", name: "Legacy", spriteImage: "" }], []));
    expect(result[9].href).toBe("/terrariums/t0");
  });
  it.each([0, 1, 24, 25, 100])("keeps every record exactly once across plots for %i records", count => {
    const items = companions(plants.slice(0, count), []), pages = plots(items);
    expect(pages.flat()).toEqual(items); expect(pages.every(page => page.length <= 24)).toBe(true);
    expect(new Set(pages.flat().map(item => item.key)).size).toBe(count);
  });
  it("moves independently, stays on the walkable graph, and reserves cells without collisions", () => {
    const world = createWorld(companions(plants.slice(0, 24), []));
    const initial = JSON.stringify(world);
    const clips = new Set<string>();
    for (let tick = 0; tick < 12000; tick++) {
      stepWorld(world, 1 / 30);
      world.actors.forEach(actor => clips.add(actor.clip));
      if (tick % 30 !== 0) continue;
      expect(new Set(world.actors.map(actor => actor.cell)).size).toBe(24);
      const targets = world.actors.flatMap(actor => actor.target === null ? [] : [actor.target]);
      expect(new Set(targets).size).toBe(targets.length);
      for (const actor of world.actors) {
        clips.add(actor.clip);
        expect(actor.x).toBeGreaterThanOrEqual(-4.01); expect(actor.x).toBeLessThanOrEqual(4.01);
        expect(actor.z).toBeGreaterThanOrEqual(-2.88); expect(actor.z).toBeLessThanOrEqual(2.88);
        if (actor.target === null) expect(Math.hypot(actor.x - WAYPOINTS[actor.cell].x, actor.z - WAYPOINTS[actor.cell].z)).toBeLessThan(.026);
      }
    }
    expect(JSON.stringify(world)).not.toBe(initial);
    expect(clips).toEqual(new Set(["idle", "walk", "run", "sit_down", "seated", "lie_down", "resting", "stand_up", "rise"]));
  });
  it("freezes the selected companion and clamps elapsed time after a hidden tab", () => {
    const items = companions(plants.slice(0, 6), []), a = createWorld(items), b = createWorld(items);
    const selected = structuredClone(a.actors[0]);
    stepWorld(a, 100, selected.key); expect(a.actors[0]).toEqual(selected);
    stepWorld(b, .05, selected.key); expect(a).toEqual(b);
    expect(clampCamera({ x: 100, z: -100, zoom: 8 })).toEqual({ x: 4, z: -3, zoom: 2.2 });
  });
});
describe("shipped garden assets", () => {
  it.each(Object.entries(ASSETS))("ships a valid local GLB for %s", (family, path) => {
    const data = readFileSync(new URL(`../public${path}`, import.meta.url));
    expect(data.subarray(0, 4).toString()).toBe("glTF"); expect(data.readUInt32LE(4)).toBe(2);
    const json = JSON.parse(data.toString("utf8", 20, 20 + data.readUInt32LE(12)));
    const triangles = json.meshes.flatMap((mesh: any) => mesh.primitives).reduce((sum: number, primitive: any) => sum + json.accessors[primitive.indices].count / 3, 0);
    expect(triangles).toBeLessThanOrEqual(family === "habitat" ? 10000 : 6000);
    expect(json.images.every((image: any) => image.bufferView !== undefined)).toBe(true);
    if (["flowering", "succulent", "moss"].includes(family)) {
      expect(new Set(json.animations.map((animation: any) => animation.name))).toEqual(new Set(CLIPS));
      expect(json.skins[0].joints).toHaveLength(6);
      expect(json.meshes.flatMap((mesh: any) => mesh.primitives)).toHaveLength(1);
    }
  });
});
