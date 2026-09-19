# Privacy Policy — Raeburn Social OS

Raeburn Social OS is a Reddit Devvit application that analyses Reddit content to decide whether the app account should take a useful, policy-compliant action.

## Data processed

The app may process Reddit post/comment text, Reddit usernames, subreddit names, thread identifiers, moderation signals, interaction history, and app-generated decisions. Operational state is stored in Devvit Redis.

Where AI generation is enabled, limited Reddit text and verified evidence necessary to generate a response may be sent to OpenAI. Requests use `store: false`. Reddit data is not used by this app to train or fine-tune any model.

## Retention

Operational records are minimised and retained only as long as needed for safety, idempotency, conversation state, relationship learning and audit. Deletion events trigger removal of matching retained content.

## User actions

Actions performed as a Reddit user are never automatic. They require a distinct explicit manual action. Autonomous actions are limited to the app identity and Reddit-permitted capabilities.

## Secrets

API keys and credentials must be stored as Devvit secrets/settings and must not be exposed to the client, source repository, Redis logs or Reddit-visible content.

## Contact

For privacy enquiries, contact the operator through The Raeburn Group.
