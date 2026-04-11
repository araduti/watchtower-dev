# Watchtower — Agent Mapping Reference

This document maps every agent from the [awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) repository (130+ agents across 10 categories) to Watchtower's needs. It explains which agents we implemented, which we skipped, and why.

## Adaptation for GitHub Copilot with Claude 4.6 Opus

The awesome repo targets **Claude Code standalone** (`.claude/agents/` directory). Watchtower uses **GitHub Copilot coding agent with Claude 4.6 Opus**, which has key differences:

| Aspect | Claude Code Standalone | GitHub Copilot (Watchtower) |
|---|---|---|
| Agent directory | `.claude/agents/` | `.github/agents/` |
| Frontmatter fields | `name`, `description`, `tools`, `model` | `name`, `description` only |
| Tool control | Per-agent tool permissions (`Read`, `Write`, etc.) | Copilot manages all tools — no per-agent restriction |
| Model selection | Per-agent (`sonnet`, `opus`, `haiku`) | Single model for all agents (Claude 4.6 Opus) |
| Invocation | Automatic or explicit (`/agents`) | Referenced in Copilot Chat or coding agent tasks |
| Global instructions | `CLAUDE.md` | `.github/copilot-instructions.md` |

**What we adapted**: Removed `tools` and `model` from frontmatter, heavily customized each agent body with Watchtower-specific conventions (tRPC v11, Prisma 7, RLS, audit logging, three-layer isolation), and placed files in `.github/agents/`.

---

## Category 01: Core Development (11 agents)

| Agent | Relevance | Status | Watchtower Mapping |
|---|---|---|---|
| **api-designer** | ✅ High | **Implemented** | Adapted for tRPC v11 procedure design (not REST/GraphQL). References `API-Conventions.md`. |
| **backend-developer** | ✅ High | **Implemented** | Adapted for tRPC routers, Inngest workers, Bun runtime, and multi-tenant isolation patterns. |
| **fullstack-developer** | ✅ High | **Implemented** | End-to-end feature development: Next.js 16 → tRPC → Prisma → PostgreSQL 18. |
| **frontend-developer** | ⚠️ Medium | Covered by `nextjs-developer` | Watchtower's frontend is exclusively Next.js 16, so a generic frontend agent adds no value over the Next.js-specific one. |
| **design-bridge** | ❌ Low | Skipped | Watchtower has no design system handoff workflow. UI uses shadcn/ui components directly. |
| **electron-pro** | ❌ None | Skipped | Watchtower is a web application, not a desktop app. |
| **graphql-architect** | ❌ None | Skipped | Watchtower uses tRPC, not GraphQL. |
| **microservices-architect** | ❌ Low | Skipped | Watchtower is a monorepo with a single deployment. Microservices are not in scope. |
| **mobile-developer** | ❌ None | Skipped | No mobile app planned. |
| **ui-designer** | ❌ Low | Skipped | UI design is handled by shadcn/ui component library, not custom design. |
| **websocket-engineer** | ❌ Low | Skipped | No WebSocket requirement currently. If live dashboards emerge, revisit. |

## Category 02: Language Specialists (29 agents)

| Agent | Relevance | Status | Watchtower Mapping |
|---|---|---|---|
| **typescript-pro** | ✅ High | **Implemented** | Primary language. Adapted for Bun, tRPC, Prisma, Zod, strict mode patterns. |
| **nextjs-developer** | ✅ High | **Implemented** | Next.js 16 App Router with Server Components, tRPC integration, trust boundaries. |
| **sql-pro** | ⚠️ Medium | Covered by `postgres-pro` | Watchtower uses PostgreSQL exclusively; the postgres-pro agent is more specific and useful. |
| **react-specialist** | ⚠️ Medium | Covered by `nextjs-developer` | React patterns are covered within the Next.js agent since Watchtower doesn't use standalone React. |
| **javascript-pro** | ⚠️ Low | Covered by `typescript-pro` | Watchtower is TypeScript-only. JavaScript patterns are a subset. |
| **swift-expert** | ❌ None | Skipped | No iOS/macOS development. |
| **vue-expert** | ❌ None | Skipped | Watchtower uses React/Next.js, not Vue. |
| **angular-architect** | ❌ None | Skipped | Watchtower uses React/Next.js, not Angular. |
| **cpp-pro** | ❌ None | Skipped | No C++ code in Watchtower. |
| **csharp-developer** | ❌ None | Skipped | No .NET code. |
| **django-developer** | ❌ None | Skipped | Watchtower uses Next.js/tRPC, not Django. |
| **dotnet-core-expert** | ❌ None | Skipped | No .NET code. |
| **dotnet-framework-4.8-expert** | ❌ None | Skipped | No .NET Framework code. |
| **elixir-expert** | ❌ None | Skipped | No Elixir code. |
| **expo-react-native-expert** | ❌ None | Skipped | No mobile app. |
| **fastapi-developer** | ❌ None | Skipped | No Python backend. |
| **flutter-expert** | ❌ None | Skipped | No mobile app. |
| **golang-pro** | ❌ None | Skipped | No Go code. |
| **java-architect** | ❌ None | Skipped | No Java code. |
| **powershell-5.1-expert** | ❌ None | Skipped | No PowerShell. |
| **powershell-7-expert** | ❌ None | Skipped | No PowerShell. |
| **kotlin-specialist** | ❌ None | Skipped | No Kotlin code. |
| **laravel-specialist** | ❌ None | Skipped | No PHP/Laravel. |
| **php-pro** | ❌ None | Skipped | No PHP code. |
| **python-pro** | ❌ None | Skipped | No Python code (may revisit if data analysis scripts are added). |
| **rails-expert** | ❌ None | Skipped | No Ruby/Rails. |
| **rust-engineer** | ❌ None | Skipped | No Rust code. |
| **spring-boot-engineer** | ❌ None | Skipped | No Java/Spring. |
| **symfony-specialist** | ❌ None | Skipped | No PHP/Symfony. |

## Category 03: Infrastructure (16 agents)

| Agent | Relevance | Status | Watchtower Mapping |
|---|---|---|---|
| **docker-expert** | ✅ High | **Implemented** | Docker Compose on NUC, Garage S3, Inngest, PostgreSQL container roles. |
| **devops-engineer** | ✅ High | **Implemented** | CI/CD, GitHub Actions, migration automation, two-role deployment. |
| **database-administrator** | ✅ High | **Implemented** | PostgreSQL 18, Prisma migrations, RLS policies, role separation. |
| **security-engineer** | ⚠️ Medium | Covered by `security-auditor` | Infrastructure security is covered within the security-auditor agent, which is more tailored to Watchtower's multi-tenant model. |
| **deployment-engineer** | ⚠️ Medium | Covered by `devops-engineer` | Watchtower's deployment is Docker Compose-based; the devops-engineer covers this. |
| **incident-responder** | ⚠️ Low | Partially covered by `debugger` | The debugger agent handles Watchtower-specific incident debugging (RLS, multi-tenant leaks). A dedicated incident responder may be added post-production. |
| **devops-incident-responder** | ⚠️ Low | Partially covered by `debugger` | Same as above. |
| **sre-engineer** | ⚠️ Low | Skipped | Premature — Watchtower runs on a single NUC. SRE practices are deferred until multi-node deployment. |
| **cloud-architect** | ❌ Low | Skipped | Watchtower deploys on bare metal (NUC), not cloud. May revisit if cloud deployment is added. |
| **azure-infra-engineer** | ❌ None | Skipped | No Azure infrastructure (Watchtower talks to M365 Graph API but runs on-premise). |
| **kubernetes-specialist** | ❌ Low | Skipped | Docker Compose is the current choice. Kubernetes deferred until justified. |
| **network-engineer** | ❌ Low | Skipped | Single-NUC deployment — no complex networking. |
| **platform-engineer** | ❌ Low | Skipped | Single-team, single-repo — no internal platform needed. |
| **terraform-engineer** | ❌ None | Skipped | No IaC for cloud infrastructure. |
| **terragrunt-expert** | ❌ None | Skipped | No Terraform/Terragrunt. |
| **windows-infra-admin** | ❌ None | Skipped | Linux-based infrastructure only. |

## Category 04: Quality & Security (15 agents)

| Agent | Relevance | Status | Watchtower Mapping |
|---|---|---|---|
| **security-auditor** | ✅ Critical | **Implemented** | Multi-tenant isolation audit, RLS verification, three-layer defense review. |
| **compliance-auditor** | ✅ Critical | **Implemented** | CIS/NIST compliance model, audit log integrity, evidence handling. Core to the business. |
| **code-reviewer** | ✅ High | **Implemented** | Enforces Watchtower PR checklist, API/Code conventions, security invariants. |
| **debugger** | ✅ High | **Implemented** | RLS debugging, Prisma query issues, tRPC errors, Inngest workflow failures. |
| **qa-expert** | ✅ High | **Implemented** | Three-tier testing (unit/integration/E2E), RLS-aware tests, audit assertions. |
| **performance-engineer** | ✅ High | **Implemented** | PostgreSQL query optimization, RLS overhead, Bun runtime performance. |
| **architect-reviewer** | ✅ High | **Implemented** | Multi-tenant architecture evaluation, design decision reviews, ADR guidance. |
| **test-automator** | ⚠️ Medium | Covered by `qa-expert` | Test automation patterns are covered within the QA expert agent. |
| **error-detective** | ⚠️ Medium | Covered by `debugger` | Error analysis is covered within the debugger agent. |
| **penetration-tester** | ⚠️ Medium | Deferred | Valuable for Phase 1+ when the application is running. Not useful during Phase 0 (database foundation). |
| **chaos-engineer** | ❌ Low | Skipped | Single-NUC deployment — chaos engineering is premature. |
| **accessibility-tester** | ⚠️ Low | Deferred | No UI yet (Phase 0). Add when frontend is implemented in Phase 1. |
| **ad-security-reviewer** | ❌ None | Skipped | No Active Directory in Watchtower's infrastructure. |
| **ai-writing-auditor** | ❌ None | Skipped | Not relevant to a compliance platform. |
| **powershell-security-hardening** | ❌ None | Skipped | No PowerShell in the stack. |

## Category 05: Data & AI (13 agents)

| Agent | Relevance | Status | Watchtower Mapping |
|---|---|---|---|
| **postgres-pro** | ✅ High | **Implemented** | PostgreSQL 18, RLS policies, Prisma 7, multi-tenant indexing, audit log design. |
| **database-optimizer** | ⚠️ Medium | Covered by `postgres-pro` + `performance-engineer` | Database optimization is covered between these two agents. |
| **data-engineer** | ⚠️ Low | Deferred | Relevant when the cross-org analytics path is built (separate analytics schema). Currently designed but not built. |
| **ai-engineer** | ❌ None | Skipped | No AI/ML features in Watchtower. |
| **data-analyst** | ❌ Low | Skipped | No standalone analytics layer yet. |
| **data-scientist** | ❌ None | Skipped | No data science workflows. |
| **llm-architect** | ❌ None | Skipped | No LLM integration. |
| **machine-learning-engineer** | ❌ None | Skipped | No ML features. |
| **ml-engineer** | ❌ None | Skipped | No ML features. |
| **mlops-engineer** | ❌ None | Skipped | No ML features. |
| **nlp-engineer** | ❌ None | Skipped | No NLP features. |
| **prompt-engineer** | ❌ None | Skipped | No prompt engineering needs. |
| **reinforcement-learning-engineer** | ❌ None | Skipped | No RL features. |

## Category 06: Developer Experience (14 agents)

| Agent | Relevance | Status | Watchtower Mapping |
|---|---|---|---|
| **documentation-engineer** | ✅ High | **Implemented** | Architecture docs, ADRs, API/Code conventions, schema design notes. |
| **refactoring-specialist** | ✅ High | **Implemented** | Safe refactoring preserving multi-tenant isolation and audit integrity. |
| **git-workflow-manager** | ⚠️ Medium | Covered by `devops-engineer` | Git workflow is part of the CI/CD pipeline managed by the devops agent. |
| **dependency-manager** | ⚠️ Low | Skipped | Bun handles dependencies; no complex dependency management needed. |
| **build-engineer** | ⚠️ Low | Covered by `devops-engineer` | Build system (Bun + esbuild) is covered by the devops agent. |
| **cli-developer** | ❌ Low | Skipped | No CLI tool planned. May revisit if a `watchtower-cli` is created. |
| **dx-optimizer** | ⚠️ Low | Skipped | Small team — developer experience is handled organically. |
| **legacy-modernizer** | ❌ None | Skipped | Watchtower is a greenfield project. |
| **mcp-developer** | ❌ None | Skipped | No MCP integration planned. |
| **readme-generator** | ❌ Low | Skipped | README is maintained manually. |
| **slack-expert** | ❌ None | Skipped | No Slack integration. |
| **tooling-engineer** | ❌ Low | Skipped | Tooling is minimal (Bun, Prisma, Docker). |
| **powershell-ui-architect** | ❌ None | Skipped | No PowerShell. |
| **powershell-module-architect** | ❌ None | Skipped | No PowerShell. |

## Category 07: Specialized Domains (12 agents)

| Agent | Relevance | Status | Watchtower Mapping |
|---|---|---|---|
| **m365-admin** | ⚠️ Medium | Deferred | Relevant to understanding the M365 environment Watchtower audits. May implement in Phase 1 when Microsoft Graph connector is built. |
| **fintech-engineer** | ⚠️ Low | Skipped | Watchtower has Stripe billing but isn't a fintech product. The payment-integration agent is more relevant, but billing is a small part of the system. |
| **payment-integration** | ⚠️ Low | Skipped | Stripe metered billing is straightforward; no dedicated agent needed. |
| **risk-manager** | ⚠️ Low | Partially covered by `compliance-auditor` | Risk assessment is part of the compliance audit workflow. |
| **api-documenter** | ⚠️ Low | Covered by `documentation-engineer` | API documentation is part of the documentation engineer's scope. |
| **blockchain-developer** | ❌ None | Skipped | No blockchain features. |
| **embedded-systems** | ❌ None | Skipped | No embedded systems. |
| **game-developer** | ❌ None | Skipped | Not a game. |
| **iot-engineer** | ❌ None | Skipped | No IoT integration. |
| **mobile-app-developer** | ❌ None | Skipped | No mobile app. |
| **quant-analyst** | ❌ None | Skipped | No quantitative analysis. |
| **seo-specialist** | ❌ None | Skipped | Watchtower is a SaaS tool, not a content site. SEO is irrelevant. |

## Category 08: Business & Product (12 agents)

| Agent | Relevance | Status | Watchtower Mapping |
|---|---|---|---|
| **product-manager** | ⚠️ Low | Skipped | Product decisions are made by the team, not by an AI agent. May revisit for roadmap planning. |
| **business-analyst** | ⚠️ Low | Skipped | Requirements are captured in Architecture.md and issue tracker. |
| **project-manager** | ⚠️ Low | Skipped | Project management is handled via GitHub Issues/Projects. |
| **technical-writer** | ⚠️ Low | Covered by `documentation-engineer` | Technical writing is part of the documentation engineer's scope. |
| **legal-advisor** | ⚠️ Low | Deferred | Relevant for GDPR right-to-erasure and data privacy questions. May implement when those ADRs are resolved. |
| **license-engineer** | ⚠️ Low | Skipped | Software licensing is handled manually. |
| **scrum-master** | ❌ Low | Skipped | No formal Scrum process. |
| **content-marketer** | ❌ None | Skipped | Marketing is out of scope for engineering agents. |
| **customer-success-manager** | ❌ None | Skipped | Customer success is a human function. |
| **sales-engineer** | ❌ None | Skipped | Sales is a human function. |
| **ux-researcher** | ❌ Low | Skipped | No formal UX research process. |
| **wordpress-master** | ❌ None | Skipped | No WordPress. |

## Category 09: Meta & Orchestration (13 agents)

| Agent | Relevance | Status | Watchtower Mapping |
|---|---|---|---|
| **context-manager** | ⚠️ Low | Skipped | GitHub Copilot manages context differently than Claude Code. Not applicable. |
| **agent-organizer** | ⚠️ Low | Skipped | GitHub Copilot handles agent selection. Not needed. |
| **multi-agent-coordinator** | ⚠️ Low | Skipped | GitHub Copilot's agent system handles coordination. |
| **workflow-orchestrator** | ❌ Low | Skipped | Copilot manages its own workflow. |
| **task-distributor** | ❌ Low | Skipped | Copilot handles task distribution. |
| **error-coordinator** | ❌ Low | Covered by `debugger` | Error coordination is part of the debugging workflow. |
| **knowledge-synthesizer** | ❌ Low | Skipped | Not applicable to GitHub Copilot's model. |
| **performance-monitor** | ❌ Low | Skipped | Agent performance monitoring doesn't apply to Copilot. |
| **agent-installer** | ❌ None | Skipped | Claude Code-specific installer. Not applicable. |
| **airis-mcp-gateway** | ❌ None | Skipped | MCP-specific. Not applicable. |
| **it-ops-orchestrator** | ❌ None | Skipped | No IT ops orchestration needed. |
| **pied-piper** | ❌ None | Skipped | Claude Code-specific. |
| **taskade** | ❌ None | Skipped | External tool, not an agent. |

## Category 10: Research & Analysis (8 agents)

| Agent | Relevance | Status | Watchtower Mapping |
|---|---|---|---|
| **research-analyst** | ⚠️ Low | Skipped | Useful for ad-hoc research but not a development agent. |
| **competitive-analyst** | ⚠️ Low | Skipped | Competitive analysis is a business function. |
| **search-specialist** | ❌ Low | Skipped | Not relevant to development. |
| **trend-analyst** | ❌ None | Skipped | Not relevant to development. |
| **market-researcher** | ❌ None | Skipped | Not relevant to development. |
| **project-idea-validator** | ❌ None | Skipped | Watchtower's concept is already validated. |
| **data-researcher** | ❌ None | Skipped | No data research workflow. |
| **scientific-literature-researcher** | ❌ None | Skipped | Not applicable. |

---

## Summary

| Category | Total Agents | Implemented | Covered by Others | Deferred | Skipped |
|---|---|---|---|---|---|
| 01. Core Development | 11 | 3 | 1 | 0 | 7 |
| 02. Language Specialists | 29 | 2 | 3 | 0 | 24 |
| 03. Infrastructure | 16 | 3 | 2 | 0 | 11 |
| 04. Quality & Security | 15 | 7 | 2 | 2 | 4 |
| 05. Data & AI | 13 | 1 | 1 | 1 | 10 |
| 06. Developer Experience | 14 | 2 | 2 | 0 | 10 |
| 07. Specialized Domains | 12 | 0 | 2 | 1 | 9 |
| 08. Business & Product | 12 | 0 | 1 | 1 | 10 |
| 09. Meta & Orchestration | 13 | 0 | 1 | 0 | 12 |
| 10. Research & Analysis | 8 | 0 | 0 | 0 | 8 |
| **Total** | **143** | **18** | **15** | **5** | **105** |

### Agents to Revisit in Future Phases

| Agent | When to Add | Trigger |
|---|---|---|
| **penetration-tester** | Phase 1 | When application code and UI exist |
| **accessibility-tester** | Phase 1 | When frontend UI is implemented |
| **m365-admin** | Phase 1 | When Microsoft Graph connector is built |
| **data-engineer** | Phase 2+ | When cross-org analytics path is built |
| **legal-advisor** | When needed | When GDPR/privacy ADRs are being resolved |

### Agents Implemented (18)

All 18 agents are in `.github/agents/` and are customized with:
- Watchtower-specific tech stack context (TypeScript, Bun, tRPC v11, Prisma 7, PostgreSQL 18)
- Multi-tenant isolation patterns (three-layer defense)
- Audit log integrity requirements
- Permission-first RBAC conventions
- References to authoritative documentation (`Architecture.md`, `API-Conventions.md`, `Code-Conventions.md`)

See `.github/copilot-instructions.md` for global instructions that apply to all agents.
