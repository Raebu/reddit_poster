from __future__ import annotations
import os,json,time,datetime
try:
 import gspread
 from google.oauth2.service_account import Credentials
except ImportError:gspread=None
SHEET=os.getenv('SOCIAL_MEMORY_SHEET_ID','1yIwJqlmgRbp1_o4MFCLHMSOOgaE3DYMd31eF43dF9bs')
TABS={
'Reddit Communities':['Updated','Subreddit','Stage','Observations','Accepted Actions','Removals','Mod Warning','Banned','Rules Summary','Notes'],
'Reddit Interactions':['At','Subreddit','Author','Thing ID','Action','Reason','Dry Run','Topic','Fingerprint'],
'Reddit Conversations':['At','Subreddit','Author','Thing ID','Direction','Text','Martin Reply','State'],
'Reddit Moderation':['At','Subreddit','Thing ID','Event','Detail','Action Taken'],
'Reddit Relationships':['Updated','Author','Stage','Interactions','Reciprocal','Last Interaction','Topics'],
'Reddit Agent Runs':['Started','Finished','Mode','Dry Run','Candidates','Actions','Notes'],
'Social Decision Replay':['At','Platform','Thing ID','Author','Topic','Decision','Reason','Confidence','Dry Run','Policy Version','Schema Version'],
'Social Research Queue':['At','Platform','Thing ID','Claim','Reason','Status'],
'Social Content Lineage':['At','Platform','Content ID','Fingerprint','Topic','Parent','Text'],
'Social Opportunities':['At','Platform','Account','Signal','Evidence Count','Stage'],
'Social Controls':['Control','Value'],
'Social Human Corrections':['At','Scope','Instruction','Active'],
'Social Negative Learning':['At','Pattern','Reason','Active'],
'Social Entity Graph':['At','Entity ID','Platform','Handle','Type','Relation','Evidence'],
'Social Usage':['At','Platform','Model Calls','Actions','Pool'],
'Social Health':['At','Platform','Component','Status','Detail']}
DEFAULTS={'Reddit Observe Enabled':'TRUE','Reddit Shadow Enabled':'TRUE','Reddit Live Enabled':'FALSE','Reddit Comments Enabled':'FALSE','Reddit Posts Enabled':'FALSE','Reddit Votes Enabled':'FALSE','Reddit Saves Enabled':'FALSE','Research Enabled':'FALSE'}
_BOOK=None;_WS={};_READY=False;_IR=None
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def _book():
 global _BOOK
 if _BOOK is not None:return _BOOK
 raw=os.getenv('GOOGLE_SERVICE_ACCOUNT_JSON','')
 if not raw:return None
 creds=Credentials.from_service_account_info(json.loads(raw),scopes=['https://www.googleapis.com/auth/spreadsheets']);_BOOK=gspread.authorize(creds).open_by_key(SHEET);return _BOOK
def ensure():
 global _READY,_WS
 if _READY:return _book()
 b=_book()
 if not b:return None
 existing={w.title:w for w in b.worksheets()}
 for title,heads in TABS.items():
  w=existing.get(title)
  if w is None:w=b.add_worksheet(title=title,rows=1500,cols=max(12,len(heads)));w.append_row(heads,value_input_option='RAW')
  else:
   cur=w.row_values(1)
   if not cur:w.append_row(heads,value_input_option='RAW')
   elif not all(h in cur for h in heads):w.update(range_name='A1',values=[cur+[h for h in heads if h not in cur]])
  _WS[title]=w
 rows=_WS['Social Controls'].get_all_records();known={str(r.get('Control')) for r in rows}
 for k,v in DEFAULTS.items():
  if k not in known:_WS['Social Controls'].append_row([k,v],value_input_option='RAW')
 _READY=True;return b
def _ws(t):ensure();return _WS.get(t)
def append(t,row):
 try:
  w=_ws(t)
  if w:w.append_row(row,value_input_option='RAW')
 except Exception as e:print('MEMORY_WARNING',type(e).__name__,str(e)[:120])
def rows(t):
 try:return _ws(t).get_all_records()
 except Exception:return []
def control(name,default=False):
 try:m={str(r.get('Control')):str(r.get('Value','')).upper() for r in rows('Social Controls')};return m.get(name,'TRUE' if default else 'FALSE') in {'TRUE','1','YES','ON'}
 except Exception:return default
def corrections():return [r for r in rows('Social Human Corrections') if str(r.get('Active','')).upper() not in {'FALSE','0','NO'}]
def interactions():
 global _IR
 if _IR is None:_IR=rows('Reddit Interactions')
 return _IR
def _age(s):
 try:return (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(str(s).replace('Z','+00:00'))).total_seconds()/86400
 except Exception:return 9999
def fatigue(author='',subreddit='',topic='',thread=''):
 data=interactions();ages=[]
 for r in data:
  if author and str(r.get('Author','')).lower()==author.lower():ages.append(_age(r.get('At')))
 n24=sum(x<=1 for x in ages);n7=sum(x<=7 for x in ages);n30=sum(x<=30 for x in ages);n90=sum(x<=90 for x in ages)
 return max(n24/2,n7/4,n30/8,n90/16),f'24h={n24};7d={n7};30d={n30};90d={n90}'
def community_profile(sub):
 rec=[r for r in rows('Reddit Communities') if str(r.get('Subreddit','')).lower()==sub.lower()]
 return rec[-1] if rec else {'Subreddit':sub,'Stage':'UNKNOWN','Observations':0,'Accepted Actions':0,'Removals':0,'Mod Warning':'FALSE','Banned':'FALSE'}
def log_community(sub,stage,observations,accepted,removals=0,mod_warning=False,banned=False,rules='',notes=''):append('Reddit Communities',[now(),sub,stage,observations,accepted,removals,str(mod_warning),str(banned),rules,notes])
def log_interaction(sub,author,thing,action,reason,dry,topic='',fp=''):
 global _IR
 row=[now(),sub,author,thing,action,reason,str(dry),topic,fp];append('Reddit Interactions',row)
 if _IR is not None:_IR.append(dict(zip(TABS['Reddit Interactions'],row)))
 append('Social Entity Graph',[now(),author.lower(),'Reddit',author,'person/account',action,reason])
def replay(thing,author,topic,decision,reason,dry,confidence=''):append('Social Decision Replay',[now(),'Reddit',thing,author,topic,decision,reason,confidence,str(dry),'1.0','1.0'])
def research_hold(thing,claim,reason):append('Social Research Queue',[now(),'Reddit',thing,claim,reason,'PENDING'])
def lineage(cid,fp,topic,parent='',text=''):append('Social Content Lineage',[now(),'Reddit',cid,fp,topic,parent,text])
def recent_texts(limit=400):return [str(r.get('Text','')) for r in rows('Social Content Lineage')[-limit:] if r.get('Text')]
def moderation(sub,thing,event,detail='',action=''):append('Reddit Moderation',[now(),sub,thing,event,detail,action])
def opportunity(author,signal):
 rec=[r for r in rows('Social Opportunities') if str(r.get('Account','')).lower()==author.lower()];n=len(rec)+1;stage='QUALIFIED' if n>=2 else 'OBSERVED';append('Social Opportunities',[now(),'Reddit',author,signal,n,stage]);return stage
def usage(calls,actions,pool):append('Social Usage',[now(),'Reddit',calls,actions,pool])
def log_run(started,mode,dry,candidates,actions,notes=''):append('Reddit Agent Runs',[started,now(),mode,str(dry),candidates,actions,notes]);append('Social Health',[now(),'Reddit',mode,'OK',notes])
