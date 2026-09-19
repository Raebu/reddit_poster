from __future__ import annotations

def candidate_key(x):
 return str(getattr(x,'id',''))

def dedupe(things):
 out=[];seen=set()
 for x in things:
  k=candidate_key(x)
  if not k or k in seen:continue
  seen.add(k);out.append(x)
 return out
