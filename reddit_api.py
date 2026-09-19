from __future__ import annotations
import os
import praw
class RedditAPI:
 def __init__(self):
  self.reddit=praw.Reddit(client_id=os.environ['REDDIT_CLIENT_ID'],client_secret=os.environ['REDDIT_CLIENT_SECRET'],refresh_token=os.environ['REDDIT_REFRESH_TOKEN'],user_agent=os.getenv('REDDIT_USER_AGENT','Raeburn Social OS/1.0 by u/'+os.getenv('REDDIT_USERNAME','Martin_Raeburn')))
 def me(self):return str(self.reddit.user.me())
 def subreddit(self,name):return self.reddit.subreddit(name)
 def search(self,subreddit,query,limit=20,sort='new'):
  target=self.reddit.subreddit(subreddit) if subreddit else self.reddit.subreddit('all')
  return list(target.search(query,limit=limit,sort=sort,time_filter='month'))
 def new(self,subreddit,limit=25):return list(self.reddit.subreddit(subreddit).new(limit=limit))
 def hot(self,subreddit,limit=25):return list(self.reddit.subreddit(subreddit).hot(limit=limit))
 def comment(self,submission_id,text):return self.reddit.submission(id=submission_id).reply(text)
 def reply(self,comment_id,text):return self.reddit.comment(id=comment_id).reply(text)
 def upvote(self,thing):thing.upvote();return True
 def save(self,thing):thing.save();return True
 def submit(self,subreddit,title,body):return self.reddit.subreddit(subreddit).submit(title,selftext=body)
 def rules(self,subreddit):
  s=self.reddit.subreddit(subreddit)
  try:return [{'short_name':r.short_name,'description':r.description,'kind':r.kind} for r in s.rules]
  except Exception:return []
