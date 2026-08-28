import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

export function localDateKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dateAtNoon(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose a valid creation date.");
  const date = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime()) || localDateKey(date) !== value) throw new Error("Choose a valid creation date.");
  return date.toISOString();
}

export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags = new Map<string, string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (name && !tags.has(name.toLocaleLowerCase())) tags.set(name.toLocaleLowerCase(), name);
  }
  return [...tags.values()];
}

const parser = unified().use(remarkParse).use(remarkGfm);
type TextNode = {type: string; value?: string; alt?: string; children?: TextNode[]};
function readable(node: TextNode): string {
  if (node.type === "html") return (node.value || "").replace(/<[^>]*>/g, "");
  if (node.type === "image" || node.type === "imageReference") return ` ${node.alt || "Image"} `;
  if (["definition", "footnoteDefinition"].includes(node.type)) return "";
  if (node.value) return node.value;
  return (node.children || []).map(readable).join(["paragraph", "heading", "link", "emphasis", "strong", "delete"].includes(node.type) ? "" : " ");
}
export function journalExcerpt(markdown: string, length = 210): string {
  return readable(parser.parse(markdown) as TextNode).replace(/\s+/g, " ").trim().slice(0, length);
}

export function safeLink(value: string): boolean {
  if (/^\/(?!\/)/.test(value)) return !/[\u0000-\u0020\\]/.test(value);
  try { const url = new URL(value); return ["https:", "http:", "mailto:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
export function safeImage(value: string): boolean {
  return /^\/media\/[A-Za-z0-9_./-]+$/.test(value) && !value.split("/").includes("..");
}

export function timestampLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeStyle: "short"}).format(new Date(value));
}
export function toLocalInput(value: string): string {
  const date = new Date(value);
  return `${localDateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
