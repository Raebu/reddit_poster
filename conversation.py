from __future__ import annotations
CLOSED={'thanks','thank you','cheers','appreciate it','👍','🙏'}
def state(text='',removed=False,locked=False,deleted=False):
 if deleted:return 'DELETED'
 if removed:return 'MODERATED'
 if locked:return 'LOCKED'
 if str(text).strip().lower() in CLOSED:return 'NATURALLY_CLOSED'
 return 'ACTIVE'
def should_reply(current_state):return current_state in {'ACTIVE','OPEN','WAITING'}
