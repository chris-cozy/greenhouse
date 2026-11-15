import { getPlantIcon, getTerrariumIcon } from "../shared/plantIcons";
import type { DashboardGardenItem } from "../shared/types";

export type Family = "flowering" | "succulent" | "moss";
export type Pose = "standing" | "seated" | "resting";
export type Companion = DashboardGardenItem & { key: string; kind: "plant" | "terrarium"; family: Family; pose: Pose; href: string };
export const PLOT_SIZE = 24;
export const ASSETS = {
  flowering: "/models/garden/flowering.glb", succulent: "/models/garden/succulent.glb", moss: "/models/garden/moss.glb",
  habitat: "/models/garden/habitat.glb", stone: "/models/garden/stone.glb", fern: "/models/garden/fern.glb", flower: "/models/garden/flower.glb",
} as const;
export const CLIPS = ["idle", "walk", "run", "sit_down", "seated", "lie_down", "resting", "stand_up", "rise", "react"] as const;
export type Clip = typeof CLIPS[number];
export type CameraView = { x: number; z: number; zoom: number };
export const DEFAULT_CAMERA: CameraView = { x: 0, z: 0, zoom: 1 };
export const clampCamera = (camera: CameraView): CameraView => ({ x: Math.max(-4, Math.min(4, camera.x)), z: Math.max(-3, Math.min(3, camera.z)), zoom: Math.max(.8, Math.min(2.2, camera.zoom)) });
export function companions(plants: DashboardGardenItem[], terrariums: DashboardGardenItem[]): Companion[] {
  return ([...plants.map(item => ({ ...item, kind: "plant" as const })), ...terrariums.map(item => ({ ...item, kind: "terrarium" as const }))]).map(item => {
    const spriteImage = item.kind === "plant" ? getPlantIcon(item.id, item.spriteImage) : getTerrariumIcon(item.id, item.spriteImage);
    return { ...item, spriteImage, key: `${item.kind}:${item.id}`, family: spriteImage.includes("succulent") ? "succulent" : spriteImage.includes("moss") ? "moss" : "flowering",
      pose: spriteImage.includes("seated") ? "seated" : spriteImage.includes("resting") ? "resting" : "standing", href: `/${item.kind === "plant" ? "plants" : "terrariums"}/${item.id}` };
  });
}
export function plots(items: Companion[]) { return Array.from({ length: Math.ceil(items.length / PLOT_SIZE) }, (_, index) => items.slice(index * PLOT_SIZE, (index + 1) * PLOT_SIZE)); }
export function hash(value: string) { let n = 2166136261; for (const char of value) n = Math.imul(n ^ char.charCodeAt(0), 16777619); return n >>> 0; }

// Connected clearing; scenery and jar habitats sit outside these walkable cells.
export const WAYPOINTS = Array.from({ length: 36 }, (_, i) => ({ x: (i % 6 - 2.5) * 1.6, z: (Math.floor(i / 6) - 2.5) * 1.15 }));
export const neighbors = (cell: number) => [cell % 6 > 0 ? cell - 1 : -1, cell % 6 < 5 ? cell + 1 : -1, cell >= 6 ? cell - 6 : -1, cell < 30 ? cell + 6 : -1].filter(i => i >= 0);
export type Actor = { key: string; cell: number; target: number | null; x: number; z: number; angle: number; clip: Clip; time: number; duration: number; seed: number; preferred: Pose };
export type World = { actors: Actor[] };
const random = (actor: Actor) => { actor.seed = (Math.imul(actor.seed, 1664525) + 1013904223) >>> 0; return actor.seed / 4294967296; };
export function createWorld(items: Companion[]): World {
  return { actors: items.filter(item => item.kind === "plant").map((item, i) => {
    // Spread initial positions across the clearing, including the back rows.
    const cell = (i * 5) % 36, point = WAYPOINTS[cell];
    return { key: item.key, cell, target: null, ...point, angle: .2, clip: item.pose === "standing" ? "idle" : item.pose,
      time: 0, duration: 3 + hash(item.key) % 100 / 12, seed: hash(item.key), preferred: item.pose };
  }) };
}
function enter(actor: Actor, clip: Clip, duration: number) { actor.clip = clip; actor.time = 0; actor.duration = duration; }
export function stepWorld(world: World, elapsed: number, selected: string | null = null) {
  const dt = Math.max(0, Math.min(elapsed, .05));
  const occupied = new Set(world.actors.flatMap(actor => actor.target === null ? [actor.cell] : [actor.cell, actor.target]));
  for (const actor of world.actors) {
    if (actor.key === selected) continue;
    actor.time += dt;
    if (actor.target !== null) {
      const destination = WAYPOINTS[actor.target], dx = destination.x - actor.x, dz = destination.z - actor.z;
      const distance = Math.hypot(dx, dz), speed = actor.clip === "run" ? 1.45 : .58;
      // Nearby actors slow each other rather than interpenetrating at crossings.
      const blocked = world.actors.some(other => other !== actor && Math.hypot(other.x - actor.x, other.z - actor.z) < .58 && dx * (other.x - actor.x) + dz * (other.z - actor.z) > 0);
      if (!blocked) {
        const stride = Math.min(distance, dt * speed);
        if (distance > .001) { actor.x += dx / distance * stride; actor.z += dz / distance * stride; }
      }
      const desired = Math.atan2(dx, dz), difference = Math.atan2(Math.sin(desired - actor.angle), Math.cos(desired - actor.angle));
      actor.angle += difference * Math.min(1, dt * 5);
      if (distance < .025) { occupied.delete(actor.cell); actor.cell = actor.target; actor.target = null; enter(actor, "idle", 1.5 + random(actor) * 5); }
      continue;
    }
    if (actor.time < actor.duration) continue;
    if (actor.clip === "sit_down") { enter(actor, "seated", 5 + random(actor) * 7); continue; }
    if (actor.clip === "lie_down") { enter(actor, "resting", 7 + random(actor) * 9); continue; }
    if (actor.clip === "seated" || actor.clip === "resting") { enter(actor, actor.clip === "seated" ? "stand_up" : "rise", 1); continue; }
    if (actor.clip === "stand_up" || actor.clip === "rise") { enter(actor, "idle", 1); continue; }
    const choice = random(actor);
    if (choice < .18 || actor.preferred !== "standing" && choice < .32) { enter(actor, actor.preferred === "resting" ? "lie_down" : "sit_down", 1); continue; }
    const free = neighbors(actor.cell).filter(cell => !occupied.has(cell));
    if (!free.length) { enter(actor, "idle", 1 + random(actor) * 2); continue; }
    actor.target = free[Math.floor(random(actor) * free.length)]; occupied.add(actor.target);
    enter(actor, random(actor) < .12 ? "run" : "walk", Infinity);
  }
}
