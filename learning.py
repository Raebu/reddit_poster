from __future__ import annotations
from collections import Counter
def outcome_weight(action):return {'COMMENT':3,'REPLY':3,'POST':4,'NO_ACTION':0}.get(action,0)
def network_health(rows):
 active=[r for r in rows if str(r.get('Action',''))!='NO_ACTION'];authors=Counter(str(r.get('Author','')).lower() for r in active);topics=Counter(str(r.get('Topic','')) for r in active);subs=Counter(str(r.get('Subreddit','')).lower() for r in active);n=max(1,len(active))
 return {'actions':len(active),'unique_authors':len(authors),'unique_topics':len(topics),'unique_subreddits':len(subs),'max_author_share':max(authors.values(),default=0)/n,'max_topic_share':max(topics.values(),default=0)/n,'max_subreddit_share':max(subs.values(),default=0)/n}
