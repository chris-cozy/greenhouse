// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as FileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FOREST_AESTHETIC_KEY as key, initializeAppearance, setForestAesthetic } from "../src/appearance";
import { SettingsPage } from "../src/components/JournalSettings";
import { api } from "../src/api";

vi.mock("../src/api", () => ({ api: { upload:vi.fn(), get:vi.fn(), post:vi.fn(), put:vi.fn() } }));
let stop: () => void, root: Root, host: HTMLDivElement;
const enabled = () => document.documentElement.getAttribute("data-forest-aesthetic");
const toggle = () => host.querySelector<HTMLButtonElement>('[role="switch"]')!;
const mount = () => act(async () => root.render(<StrictMode><SettingsPage/></StrictMode>));
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); vi.clearAllMocks();
  stop = initializeAppearance();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); stop();
  vi.restoreAllMocks(); localStorage.clear(); document.documentElement.removeAttribute("data-forest-aesthetic");
});

describe("browser-local forest appearance", () => {
  it.each([null, "true", "false", "invalid", "null", "0", '"false"', "{}"])("uses the same default for %s before paint and after initialization", value => {
    stop(); if (value !== null) localStorage.setItem(key, value);
    const html = readFileSync(new FileURL("../index.html", import.meta.url), "utf8");
    const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    runInNewContext(bootstrap, { document, localStorage });
    expect(enabled()).toBe(String(value !== "false"));
    stop = initializeAppearance(); expect(enabled()).toBe(String(value !== "false"));
  });

  it("provides a labeled native switch, applies immediately and remembers its value independently of the sidebar", async () => {
    localStorage.setItem("greenhouse-sidebar-collapsed", "true");
    await mount();
    expect(toggle().tagName).toBe("BUTTON"); expect(toggle().type).toBe("button");
    expect(document.getElementById(toggle().getAttribute("aria-labelledby")!)?.textContent).toBe("Forest aesthetic");
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    const control = toggle(); control.focus();
    await act(async () => control.click());
    expect(toggle()).toBe(control); expect(document.activeElement).toBe(control);
    expect(enabled()).toBe("false"); expect(localStorage.getItem(key)).toBe("false");
    expect(localStorage.getItem("greenhouse-sidebar-collapsed")).toBe("true");
    stop(); stop = initializeAppearance(); expect(enabled()).toBe("false");
    expect(api.get).not.toHaveBeenCalled(); expect(api.put).not.toHaveBeenCalled(); expect(api.upload).not.toHaveBeenCalled();
  });

  it("synchronizes tabs, ignores unrelated/session storage, and defaults on when the key is removed or cleared", async () => {
    await mount(); const write = vi.spyOn(Storage.prototype, "setItem");
    const event = (key: string | null, value: string | null, storageArea = localStorage) => act(async () => window.dispatchEvent(new StorageEvent("storage", { key, newValue:value, storageArea })));
    await event(key, "false"); expect(enabled()).toBe("false"); expect(toggle().getAttribute("aria-checked")).toBe("false");
    await event("greenhouse-sidebar-collapsed", "true"); await event(key, "true", sessionStorage); expect(enabled()).toBe("false");
    await event(key, "nonsense"); expect(enabled()).toBe("true");
    await event(key, "false"); await event(key, null); expect(enabled()).toBe("true");
    await event(key, "false"); await event(null, null); expect(enabled()).toBe("true");
    expect(write).not.toHaveBeenCalled();
    await act(async () => root.render(<p>Another route</p>)); await event(key, "false"); expect(enabled()).toBe("false");
  });

  it("continues for the session when storage is blocked and reports when a later choice can be remembered", async () => {
    stop();
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    const html = readFileSync(new FileURL("../index.html", import.meta.url), "utf8");
    runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)![1], { document, localStorage });
    expect(enabled()).toBe("true"); stop = initializeAppearance();
    await mount(); await act(async () => toggle().click()); expect(enabled()).toBe("false");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("could not be remembered");
    await act(async () => root.render(<p>Another route</p>)); await mount(); expect(toggle().getAttribute("aria-checked")).toBe("false");
    read.mockRestore(); write.mockRestore(); await act(async () => toggle().click());
    expect(localStorage.getItem(key)).toBe("true"); expect(host.textContent).not.toContain("could not be remembered");
  });

  it("preserves a selected restore file and its open confirmation without performing a write", async () => {
    await mount(); const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable:true, value:[new File(["test"], "keep-me.zip", { type:"application/zip" })] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles:true })));
    await act(async () => Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Restore this backup")!.click());
    const dialog = host.querySelector('[role="dialog"]'), focused = document.activeElement;
    await act(async () => setForestAesthetic(false));
    expect(host.querySelector('[role="dialog"]')).toBe(dialog); expect(document.activeElement).toBe(focused);
    expect(dialog?.textContent).toContain("keep-me.zip"); expect(input.files?.[0].name).toBe("keep-me.zip"); expect(api.upload).not.toHaveBeenCalled();
  });

  it("keeps the application shell usable when accessing storage itself throws", async () => {
    stop();
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    window.history.replaceState(null, "", "/settings");
    vi.mocked(api.get).mockResolvedValue(null);
    const { App } = await import("../src/App");
    await act(async () => root.render(<StrictMode><App/></StrictMode>));
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    await act(async () => toggle().click()); expect(enabled()).toBe("false");
    expect(host.textContent).toContain("could not be remembered");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Collapse sidebar"]')!.click());
    expect(host.querySelector('[aria-label="Expand sidebar"]')).not.toBeNull();
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    window.history.replaceState(null, "", "/");
  });
});
