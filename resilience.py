from __future__ import annotations
import json,os,time,uuid
OUTBOX=os.getenv('SOCIAL_OUTBOX','reddit_outbox.jsonl');MAX_CALLS=int(os.getenv('SOCIAL_MAX_LLM_CALLS','30'));_calls=0
def budget_call():
 global _calls
 if _calls>=MAX_CALLS:return False
 _calls+=1;return True
def usage():return _calls
def retry(fn,*args,**kwargs):
 delay=1
 for attempt in range(4):
  try:return fn(*args,**kwargs)
  except Exception:
   if attempt==3:raise
   time.sleep(delay);delay*=2
def queue(kind,payload):
 row={'id':str(uuid.uuid4()),'at':time.time(),'kind':kind,'payload':payload,'status':'PENDING'}
 with open(OUTBOX,'a',encoding='utf-8') as f:f.write(json.dumps(row,ensure_ascii=False)+'\n')
 return row['id']
def pending():
 if not os.path.exists(OUTBOX):return []
 with open(OUTBOX,encoding='utf-8') as f:return [json.loads(x) for x in f if x.strip() and json.loads(x).get('status')=='PENDING']
