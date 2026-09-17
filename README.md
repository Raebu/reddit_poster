# Reddit Social OS

Reddit adapter for Martin Raeburn's cross-platform Social OS.

This repository is intentionally **observe/shadow first**. Live Reddit actions remain disabled unless explicitly enabled and only where Reddit terms/approval permit the intended use.

Core pipeline:

`DISCOVER -> COMMUNITY -> THREAD -> VERIFY -> SCORE -> DECIDE -> REVIEW -> ACT/HOLD -> REMEMBER -> LEARN`

Key design principles:
- quality over quotas; NO_ACTION is a first-class outcome
- community rules and moderation state before participation
- no invented personal experience, transactions, clients or outcomes
- current/consequential factual claims require verification or HOLD
- separate opportunity detection from outreach
- shared cross-platform memory via the Social OS workbook
- semantic duplicate protection across platforms
- user/thread/subreddit/topic fatigue
- relationship stages based on evidence, not vanity metrics
- fail closed on research/API/memory uncertainty
- dry-run by default
