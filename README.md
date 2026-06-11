# stelaspace-mcp

A local [MCP](https://modelcontextprotocol.io) server for publishing HTML files to
[StelaSpace](https://stelaspace.com) from coding agents that work with your local
files — **Claude Code** and **Codex**.

It runs on your machine, so it reads HTML files **directly from disk by path** and
uploads the bytes via the StelaSpace API. That's what lets it publish large (1 MB+)
reports and dashboards — unlike passing file contents as a tool argument, which is
capped by the model's output size.

> Claude Desktop (chat) isn't supported for publishing: its sandbox can't share
> files with a local MCP server, so it can't upload local reports. Use Claude Code
> or Codex, where the agent generates the report to disk and publishes it directly.

## Tools

- **`publish_file`** — `{ path, spaceSlug, title?, slug?, tags?, visibility? }` → reads
  the file and returns its permanent URL. Reusing a `slug` publishes a new version.
- **`list_spaces`** — list the spaces in your team.
- **`list_documents`** — `{ spaceSlug, query? }` — list documents in a space.

## Setup

Get an API key from StelaSpace → **Settings → API Keys** (starts with `ss_sk_`).

### Claude Code

```bash
claude mcp add stelaspace --scope user \
  --env STELASPACE_API_KEY=ss_sk_your_key \
  -- npx -y stelaspace-mcp
```

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.stelaspace]
command = "npx"
args = ["-y", "stelaspace-mcp"]
env = { STELASPACE_API_KEY = "ss_sk_your_key" }
```

Then ask the agent to build and publish a report, e.g.
*"generate the sales dashboard and publish the HTML to my reports space as public."*

## Environment

- `STELASPACE_API_KEY` (required) — your `ss_sk_` key.
- `STELASPACE_API_URL` (optional) — override the API endpoint. Defaults to
  `https://stelaspace.com`; most users never need to set this.
