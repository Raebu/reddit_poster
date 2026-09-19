from __future__ import annotations
import math
def saturation(submission):
 try:n=int(submission.num_comments or 0)
 except:n=0
 return min(1.0,math.log10(max(1,n))/3)
def conversation_potential(submission):
 try:
  score=max(0,int(submission.score or 0));comments=max(0,int(submission.num_comments or 0));ratio=(comments+1)/(score+comments+2)
  return min(1.5,ratio*2)
 except:return 0.0
def thread_text(submission):return ((getattr(submission,'title','') or '')+'\n'+(getattr(submission,'selftext','') or '')).strip()
