from __future__ import annotations
STOP_EVENTS={'BAN','MOD_WARNING','RULE_VIOLATION'}
def should_pause(events):return any(str(e).upper() in STOP_EVENTS for e in events)
def recordable_event(kind):return str(kind).upper() in {'REMOVED','LOCKED','MOD_WARNING','AUTOMOD_REJECTION','FLAIR_ERROR','RULE_VIOLATION','BAN','CONTENT_DELETED'}
