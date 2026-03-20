# NVST Quick Use

Quick reference for the main development loop. See [COMMANDS.md](COMMANDS.md) for full command reference.

**Running commands:** Use `bun nvst` so Bun resolves the binary. Or add `node_modules/.bin` to your PATH: `export PATH="$PATH:$(pwd)/node_modules/.bin"` to run `nvst` directly.

## First-time setup

```bash
# Install the toolkit from npm (package is published)
npm install @quinteroac/agents-coding-toolkit
# or with Bun
bun add @quinteroac/agents-coding-toolkit

# From local path (development)
# bun add /path/to/nerds-vibecoding-survivor-toolkit

# Initialize scaffold in your project
bun nvst init
```

## Typical iteration flow (end-to-end)

```bash
bun nvst define requirement --agent codex
bun nvst refine requirement --agent codex --challenge   # optional
bun nvst approve requirement
bun nvst create prototype --agent codex --iterations 10
bun nvst audit prototype --agent codex
bun nvst refactor prototype --agent codex
bun nvst approve prototype
```

Use this command order as the standard loop:

`Define/Refine/Approve Requirement → Create Prototype → Audit Prototype → Refactor Prototype → Approve Prototype`

## Agent providers

Use `--agent` with: `claude`, `codex`, `gemini`, or `cursor`.

Example:

```bash
bun nvst define requirement --agent cursor
```
