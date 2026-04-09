# Arcwright — Architecture Intelligence for VS Code

Live architecture visualization for AI-assisted development. See your codebase structure in real-time, detect dead code and circular dependencies, and instruct AI through the visual layer.

## Features

### Live Dependency Graph
Arcwright analyzes your TypeScript/JavaScript workspace and renders an interactive architecture graph in the sidebar. Files are nodes, imports are edges — colored by directory, updated on every save.

- **Click any node** to open that file in the editor
- **Color-coded** by directory for instant visual grouping
- **Entry points** highlighted with a yellow badge
- **Stats bar** shows file count, imports, exports, and analysis time

### Dead Code Detection
Finds files that no other file imports (orphans) and exports that nothing uses. Dead code nodes are dimmed in the graph so you can spot cleanup opportunities at a glance.

### Circular Dependency Detection
Uses DFS-based cycle detection to find circular imports. Direct A→B→A cycles are flagged as errors, longer chains as warnings. Cycle edges are highlighted in red.

### Architecture Boundaries (`.arcwright.yml`)
Define architectural rules in a `.arcwright.yml` file at your workspace root:

```yaml
boundaries:
  - name: "API Layer"
    includes:
      - "src/api/**"
      - "src/routes/**"
    must_not_import:
      - "src/components/**"
      - "src/pages/**"

  - name: "UI Layer"
    includes:
      - "src/components/**"
      - "src/pages/**"
    must_not_import:
      - "src/api/**"
```

Violations appear as VS Code diagnostics (squiggly lines) in the editor.

### Claude Code Bridge
Right-click integration with Claude Code CLI. Generate context-aware prompts from the architecture graph:
- **Explain** — understand a module's role and dependencies
- **Refactor** — get improvement suggestions with full import context
- **Fix** — auto-generate instructions to break circular deps or clean dead code

### Cloud AI Analysis
Connect to the Arcwright cloud API for deep AI-powered analysis using Claude or Cloudflare AI.

## Commands

| Command | Description |
|---------|-------------|
| `Arcwright: Show Architecture` | Open the architecture panel |
| `Arcwright: Analyze Workspace` | Trigger a full re-analysis |
| `Arcwright: Focus Current File` | Highlight the current file in the graph |
| `Arcwright: Ask Claude About This File` | Send the current file to Claude Code |
| `Arcwright: Login to Cloud API` | Authenticate with Arcwright cloud |
| `Arcwright: Analyze with AI (Cloud)` | Run AI-powered deep analysis |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `arcwright.autoAnalyze` | `true` | Auto-analyze on workspace open and file changes |
| `arcwright.excludePatterns` | `["**/node_modules/**", ...]` | Glob patterns to exclude |
| `arcwright.maxFiles` | `500` | Maximum files to analyze |
| `arcwright.apiUrl` | `https://arcwright-api...` | Arcwright cloud API URL |

## Requirements

- VS Code 1.85+
- TypeScript/JavaScript workspace (`.ts`, `.tsx`, `.js`, `.jsx`)
- Optional: Claude Code CLI for AI bridge features
- Optional: Arcwright cloud account for AI analysis

## Links

- [Web App](https://arcwright.pages.dev)
- [GitHub](https://github.com/bridge-intelligence/arcwright)
- [Issues](https://github.com/bridge-intelligence/arcwright/issues)

---

Built by [Bridge Intelligence](https://github.com/bridge-intelligence)
