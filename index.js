#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

// Local stdio MCP server for StelaSpace. It runs on the user's machine, so it
// can read HTML files straight from disk by path and upload the bytes via the
// StelaSpace REST API — sidestepping the model-output-size limit that makes
// passing large file content as a tool argument impossible.

const API_KEY = process.env.STELASPACE_API_KEY;
const API_URL = (process.env.STELASPACE_API_URL || "https://stelaspace.com").replace(/\/+$/, "");

// Don't exit when the key is missing: directory inspectors (Glama, Smithery)
// and curious users start the server bare to introspect its tools. Warn here,
// fail helpfully at call time instead.
const NO_KEY_MSG =
  "STELASPACE_API_KEY is not set. Create an API key (starts with ss_sk_) at " +
  "https://stelaspace.com under Settings → API Keys, then set it in the MCP server's env.";
if (!API_KEY) console.error(`Warning: ${NO_KEY_MSG}`);

const authHeaders = { Authorization: `Bearer ${API_KEY}` };
const text = (t, structured) => ({
  content: [{ type: "text", text: t }],
  ...(structured ? { structuredContent: structured } : {}),
});
const fail = (t) => ({ content: [{ type: "text", text: t }], isError: true });

async function apiJson(res) {
  return res.json().catch(() => ({}));
}

const server = new McpServer({ name: "stelaspace", version: "1.0.3" });

server.registerTool(
  "publish_file",
  {
    title: "Publish an HTML file",
    description:
      "Upload a local .html/.htm file to a StelaSpace space and get back a permanent, shareable URL. The file is read from disk by path, so large files work fine. Reusing a slug publishes a new version.",
    inputSchema: {
      path: z.string().describe("Path to the .html/.htm file on this machine (absolute, or relative to the MCP server's working directory)."),
      spaceSlug: z.string().describe("Slug of the target space — call list_spaces to find valid slugs."),
      title: z.string().optional().describe("Document title. Defaults to the HTML <title> tag."),
      slug: z.string().optional().describe("Document slug. Reuse an existing slug to publish a new version; omit to auto-generate."),
      tags: z.array(z.string()).optional().describe("Optional tags for organization and search."),
      visibility: z
        .enum(["public", "private"])
        .optional()
        .describe("public = anyone with the link; private = team members only. Defaults to private."),
    },
  },
  async ({ path, spaceSlug, title, slug, tags, visibility }) => {
    if (!API_KEY) return fail(NO_KEY_MSG);
    let buf;
    try {
      buf = await readFile(path);
    } catch (e) {
      return fail(`Could not read file at "${path}": ${e.message}`);
    }

    let filename = basename(path);
    if (!/\.html?$/i.test(filename)) filename += ".html"; // the API only accepts .html/.htm

    const form = new FormData();
    form.append("file", new Blob([buf], { type: "text/html" }), filename);
    form.append("spaceSlug", spaceSlug);
    if (title) form.append("title", title);
    if (slug) form.append("slug", slug);
    if (tags?.length) form.append("tags", tags.join(","));
    form.append("visibility", visibility === "public" ? "public" : "private");

    const res = await fetch(`${API_URL}/api/v1/documents`, { method: "POST", headers: authHeaders, body: form });
    const data = await apiJson(res);
    if (!res.ok) return fail(`Publish failed (${res.status}): ${data.error || res.statusText}`);

    return text(`Published → ${data.url} (version ${data.versionNumber}, slug "${data.slug}")`, data);
  },
);

server.registerTool(
  "list_spaces",
  {
    title: "List spaces",
    description: "List the spaces in your team. Use a space's slug as the spaceSlug when publishing a document.",
    inputSchema: {},
  },
  async () => {
    if (!API_KEY) return fail(NO_KEY_MSG);
    const res = await fetch(`${API_URL}/api/v1/spaces`, { headers: authHeaders });
    const data = await apiJson(res);
    if (!res.ok) return fail(`List spaces failed (${res.status}): ${data.error || res.statusText}`);
    const spaces = (data.data || []).map((s) => ({ slug: s.slug, name: s.name, description: s.description }));
    return text(JSON.stringify(spaces, null, 2), { spaces });
  },
);

server.registerTool(
  "list_documents",
  {
    title: "List documents",
    description: "List documents in a space, optionally filtered by a case-insensitive title search term.",
    inputSchema: {
      spaceSlug: z.string().describe("Slug of the space to list documents from."),
      query: z.string().optional().describe("Optional case-insensitive term to filter documents by title."),
    },
  },
  async ({ spaceSlug, query }) => {
    if (!API_KEY) return fail(NO_KEY_MSG);
    const res = await fetch(`${API_URL}/api/v1/documents?spaceSlug=${encodeURIComponent(spaceSlug)}&limit=100`, {
      headers: authHeaders,
    });
    const data = await apiJson(res);
    if (!res.ok) return fail(`List documents failed (${res.status}): ${data.error || res.statusText}`);
    let docs = data.data || [];
    if (query?.trim()) {
      const q = query.trim().toLowerCase();
      docs = docs.filter((d) => (d.title || "").toLowerCase().includes(q));
    }
    const out = docs.map((d) => ({ slug: d.slug, title: d.title, visibility: d.visibility, viewCount: d.viewCount }));
    return text(JSON.stringify(out, null, 2), { documents: out });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
