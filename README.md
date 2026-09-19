# Raeburn Social OS — Reddit

Hosted Reddit adapter for Martin Raeburn's cross-platform Social OS.

The target pipeline is:

`DISCOVER -> UNDERSTAND -> VERIFY -> RANK -> DECIDE -> GENERATE -> REVIEW -> GOVERN -> ROUTE -> ACT/HOLD -> REMEMBER -> LEARN`

## Runtime

Devvit is the hosted runtime. The five-minute scheduler performs discovery and maintenance; Reddit event triggers feed post, comment, deletion and moderation events into the conversation/memory layer. Redis is operational state.

The retained Python runner is parity/shadow tooling only and is permanently
read-only. It cannot post, comment, vote or save Reddit content.

## Autonomy modes

- **OBSERVE** — collect intelligence; no proposed or executed engagement.
- **SHADOW** — run the production decision path and record hypothetical actions; execute nothing.
- **CANARY** — allow narrowly budgeted APP-identity actions after every deterministic gate passes.
- **LIVE** — allow APP-identity actions within production budgets; safety, research, fatigue, moderation, duplicate and idempotency gates remain mandatory.

LIVE never means mandatory engagement. `NO_ACTION` is expected to remain the most common decision.

## Identity boundary

APP actions can be routed for autonomous execution where Reddit permits them. USER actions are always routed to an explicit approval queue. The system must never automate personal-account posting, commenting or subscribing, and it must not implement voting or user-following.

Devvit actions are installation-scoped: an installation may only mutate the
subreddit in whose context it is running. Deploying the app does not grant it
permission to act in unrelated communities.

## Production modules

- discovery / observer
- community and candidate intelligence
- factual and policy gates
- evidence verification
- deterministic decision engine
- canonical Martin voice brief
- adversarial review boundary
- governance, fatigue, budgets and circuit breaker
- APP/USER action router
- conversation lifecycle
- Redis memory and audit records
- hosted scheduler and event triggers

## Immutable principles

- never invent personal experience, clients, transactions, meetings, projects or outcomes
- current/consequential claims require evidence or HOLD
- political content is NO_ACTION
- moderation warnings pause autonomy
- duplicate and fatigue controls precede execution
- commercial opportunity detection is separate from outreach
- human corrections override learned behaviour
- safety rules are never modified by learning
- user deletion events must purge retained Reddit user content
- no Reddit data is used to train or fine-tune models

## External intelligence

If an approved LLM or external research provider is enabled, its domain must be explicitly allow-listed in `devvit.json`, secrets must be stored in Devvit settings/secrets rather than source code, and the app must satisfy Reddit's privacy, terms and app-review requirements. External intelligence must return structured data to deterministic gates; it never receives direct authority to execute Reddit actions.

## Release discipline

Development proceeds OBSERVE -> SHADOW -> CANARY -> LIVE. CI must pass TypeScript, Biome, native tests, build and Python parity tests before promotion. Playtest/sandbox validation precedes production actions.
