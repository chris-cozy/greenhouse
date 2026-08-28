// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as FileURL } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Dashboard } from "../src/components/Dashboard";
import { getPlantIcon, PLANT_ICON_IMAGES } from "../src/shared/plantIcons";
import type { DashboardData } from "../src/shared/types";

const dashboard: DashboardData = {
  livingPlants: 32,
  terrariums: 2,
  gardenPlants: Array.from({ length: 32 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    name: `Plant ${index}`,
  })),
  gardenTerrariums: [
    { id: "terrarium-1", name: "Cloud Garden" },
    { id: "terrarium-2", name: "Moss Bowl" },
  ],
  attentionPlants: [],
  recentlyUpdated: [],
  recentJournals: [],
  recentPhotos: [],
  upcomingReminders: [],
};

vi.mock("../src/components/Common", async importOriginal => ({
  ...await importOriginal<typeof import("../src/components/Common")>(),
  useLoad: () => ({ data: dashboard, loading: false, error: "", reload: vi.fn() }),
}));

describe("dashboard collection icons", () => {
  it("shows the requested home copy and puts reminders immediately after the collection",()=>{
    dashboard.upcomingReminders=[{id:"care",plantId:"plant",plantName:"Fern",activityType:"watering",customLabel:"",guidance:"",cadenceDays:null,reminderEnabled:true,nextReminderDate:"2026-08-30",notes:"",sortOrder:0}];
    try {
      const html=renderToStaticMarkup(<MemoryRouter><Dashboard onAddPlant={()=>{}}/></MemoryRouter>);
      const document=new DOMParser().parseFromString(html,"text/html");
      expect(document.querySelector("h1")?.textContent).toBe("Your greenhouse ♡");
      expect(document.querySelector(".welcome p")?.textContent).toBe("All of the plants under your care");
      expect(document.querySelector(".garden-card h2")?.textContent).toBe("All of the sprites in your garden");
      expect(document.querySelector(".summary-grid")?.nextElementSibling?.className).toBe("reminder-strip");
    } finally {dashboard.upcomingReminders=[];}
  });
  it("retains the same heading and separate onboarding for an empty greenhouse",()=>{
    const plants=dashboard.gardenPlants,terrariums=dashboard.gardenTerrariums;
    dashboard.gardenPlants=[];dashboard.gardenTerrariums=[];
    try {const html=renderToStaticMarkup(<MemoryRouter><Dashboard onAddPlant={()=>{}}/></MemoryRouter>);expect(html).toContain("Your greenhouse ♡");expect(html).toContain("Add your first plant");expect(html).not.toContain("reminder-strip");}
    finally {dashboard.gardenPlants=plants;dashboard.gardenTerrariums=terrariums;}
  });
  it("keeps plant assignments and renders the new jar for every terrarium with its own link", () => {
    const html = renderToStaticMarkup(<MemoryRouter><Dashboard onAddPlant={() => {}}/></MemoryRouter>);
    const document = new DOMParser().parseFromString(html, "text/html");
    const plants = Array.from(document.querySelectorAll(".garden-item.plant"));
    expect(plants).toHaveLength(dashboard.gardenPlants.length);
    plants.forEach((link, index) => {
      const plant = dashboard.gardenPlants[index];
      expect(link.getAttribute("href")).toBe(`/plants/${plant.id}`);
      expect(link.getAttribute("aria-label")).toBe(`Open plant ${plant.name}`);
      expect(link.querySelector("img")?.getAttribute("src")).toBe(getPlantIcon(plant.id));
      expect(link.querySelector("img")?.className).toBe("garden-plant-icon");
    });
    expect(new Set(plants.map(link => link.querySelector("img")?.getAttribute("src"))))
      .toEqual(new Set(PLANT_ICON_IMAGES));
    const terrariums = Array.from(document.querySelectorAll(".garden-item.terrarium"));
    expect(terrariums).toHaveLength(dashboard.gardenTerrariums.length);
    terrariums.forEach((link, index) => {
      const terrarium = dashboard.gardenTerrariums[index];
      expect(link.getAttribute("href")).toBe(`/terrariums/${terrarium.id}`);
      expect(link.getAttribute("aria-label")).toBe(`Open terrarium ${terrarium.name}`);
      expect(link.querySelector("img")?.getAttribute("src")).toBe("/images/plant-spirit-terrarium.png");
    });
  });

  it("ships the replacement terrarium as a transparent PNG", () => {
    const image = readFileSync(new FileURL("../public/images/plant-spirit-terrarium.png", import.meta.url));
    expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(image.readUInt32BE(16)).toBeGreaterThan(0);
    expect(image.readUInt32BE(20)).toBeGreaterThan(0);
    expect(image[25]).toBe(6);
  });
});
