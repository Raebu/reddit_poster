# Reddit App Review Package

## Purpose

Raeburn Social OS is a hosted Reddit participation agent for the app identity, with an explicit user-action queue for any USER-identity operation.

## Safety model

- OBSERVE and SHADOW never execute Reddit actions.
- CANARY is restricted to one action/day.
- LIVE remains subject to hourly/daily budgets.
- Political content is NO_ACTION.
- Current claims require verified evidence or HOLD.
- Moderation warning/ban signals pause participation.
- Repeated failures trip a circuit breaker.
- Idempotency prevents duplicate writes.
- Generated content is re-checked deterministically before execution.

## AI

OpenAI is the only configured external LLM provider. Reddit text is sent only when needed for generation or synthesis. Requests specify `store: false`. Reddit data is not used to train or fine-tune models.

## USER actions

USER posting/commenting/subscribing is never background automation. Each action is queued and must be explicitly triggered by the user.

## Data handling

Devvit Redis stores operational state. Matching retained content is purged after Reddit deletion events. Secrets are server-side only.

## Prohibited capabilities

No voting. No user-follow automation. No spam-like engagement loops. No autonomous sales outreach.
