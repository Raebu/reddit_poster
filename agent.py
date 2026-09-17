from __future__ import annotations
import os,re,json
from collections import Counter
from datetime import datetime,timezone
from openai import OpenAI
from reddit_api import RedditAPI
from voice import MARTIN_VOICE
import social_os,policy,strategy,semantic,resilience,research,community,thread_intelligence,moderation
DRY=os.getenv('DRY_RUN','true').lower()=='true';MODEL=os.getenv('OPENAI_MODEL','gpt-5-mini');MAX_ACTIONS=int(os.getenv('REDDIT_MAX_ACTIONS','3'));MAX_MODEL=int(os.getenv('SOCIAL_MAX_MODEL_CANDIDATES','20'))
SUBREDDITS=[x.strip() for x in os.getenv('REDDIT_SUBREDDITS','technology,artificial,MachineLearning,startups,Entrepreneur,private_equity,venturecapital,finance,business,consulting,softwarearchitecture').split(',') if x.strip()]
QUERIES=['AI','automation','software','M&A','acquisition','corporate strategy','private equity','venture capital','operating model','digital transformation','technology leadership']
OPPORTUNITY=re.compile(r'\b(partner|partnership|speaker|investment|acquisition|vendor|procurement|rfp|tender|pilot|collaboration|adviser|advisor)\b',re.I)
def ask(prompt):
 if not resilience.budget_call():return 'NO_ACTION budget exhausted'
 corr='\n'.join(str(x.get('Instruction','')) for x in social_os.corrections()[-20:])
 return OpenAI(api_key=os.environ['OPENAI_API_KEY']).responses.create(model=MODEL,input=MARTIN_VOICE+'\nHUMAN CORRECTIONS\n'+corr+'\nTASK\n'+prompt).output_text.strip()
def observe(api):
 raw=[]
 for sub in SUBREDDITS:
  p=social_os.community_profile(sub);rules=api.rules(sub);obs=int(p.get('Observations',0) or 0)+1;st=community.stage({'observations':obs,'accepted_actions':int(p.get('Accepted Actions',0) or 0),'removals':int(p.get('Removals',0) or 0),'mod_warning':str(p.get('Mod Warning','')).upper()=='TRUE','banned':str(p.get('Banned','')).upper()=='TRUE'});social_os.log_community(sub,st,obs,int(p.get('Accepted Actions',0) or 0),int(p.get('Removals',0) or 0),str(p.get('Mod Warning','')).upper()=='TRUE',str(p.get('Banned','')).upper()=='TRUE',json.dumps(rules)[:1000],'observe')
  try:
   for x in api.new(sub,10):raw.append(x)
  except Exception as e:print('SUBREDDIT_WARNING',sub,type(e).__name__)
 for q in QUERIES:
  try:
   for x in api.search(None,q,8,'new'):raw.append(x)
  except Exception:pass
 out=[];seen=set();recent=social_os.recent_texts()
 for x in raw:
  sid=str(getattr(x,'id',''));sub=str(getattr(getattr(x,'subreddit',None),'display_name',''));author=str(getattr(x,'author','') or '[deleted]');text=thread_intelligence.thread_text(x);fp=strategy.fingerprint(text)
  if not sid or sid in seen or len(text)<80 or semantic.duplicate(text,recent):continue
  seen.add(sid);prof=social_os.community_profile(sub);cfit=community.fit_score({'observations':int(prof.get('Observations',0) or 0),'accepted_actions':int(prof.get('Accepted Actions',0) or 0),'removals':int(prof.get('Removals',0) or 0),'mod_warning':str(prof.get('Mod Warning','')).upper()=='TRUE','banned':str(prof.get('Banned','')).upper()=='TRUE'});t=strategy.topic(text,sub);fat=social_os.fatigue(author=author)[0];sat=thread_intelligence.saturation(x);conv=thread_intelligence.conversation_potential(x);score=strategy.score(text,t,cfit,conv,fat,sat);out.append({'thing':x,'id':sid,'sub':sub,'author':author,'text':text,'topic':t,'fp':fp,'score':score,'community':prof,'saturation':sat})
 return sorted(out,key=lambda c:c['score'],reverse=True)[:MAX_MODEL]
def decide(c):
 if policy.political(c['text']):return 'NO_ACTION','political restraint'
 if policy.current_claim(c['text']):
  ev=research.verify(c['text']) if social_os.control('Research Enabled') else {'verified':False,'reason':'research disabled'}
  if not ev.get('verified'):return 'HOLD','current claim: '+ev.get('reason','unverified')
 prompt=f"Subreddit: r/{c['sub']}\nCommunity stage: {c['community'].get('Stage','UNKNOWN')}\nTopic: {c['topic']}\nThread:\n{c['text']}\nChoose exactly one: NO_ACTION, COMMENT, SAVE, UPVOTE. COMMENT only if Martin can add genuinely new substance not already implied by the thread. Prefer restraint. For M&A, use at most one or two relevant lenses from: {strategy.ma_lens()}. Never self-promote or claim unverified personal deal experience. Output LABEL then a short reason."
 x=ask(prompt);label=x.split()[0].strip(':').upper();return (label if label in {'NO_ACTION','COMMENT','SAVE','UPVOTE'} else 'NO_ACTION'),x[:240]
def make_comment(c):
 x=ask(f"Write a Reddit-native comment for this thread:\n{c['text']}\nSubreddit: r/{c['sub']}\nTopic: {c['topic']}\nAdd one genuinely useful distinction, mechanism, trade-off or second-order effect. Do not sound like LinkedIn. No self-promotion, generic praise, canned hook or forced question. Never invent personal experience or current facts. Output comment only or NO_COMMENT.")
 if x.upper().startswith('NO_COMMENT'):return None
 ok,_=policy.gate_generated(x);return x if ok and not semantic.duplicate(x,social_os.recent_texts()) else None
def main():
 started=datetime.now(timezone.utc).isoformat();api=RedditAPI();print('Authenticated Reddit account:',api.me());pool=observe(api);print('POOL',len(pool));actions=0;authors=Counter();subs=Counter();topics=Counter();live=(not DRY) and social_os.control('Reddit Live Enabled')
 for c in pool:
  if actions>=MAX_ACTIONS:break
  if authors[c['author'].lower()]>=1 or subs[c['sub'].lower()]>=2 or topics[c['topic']]>=2:continue
  prof=c['community'];events=[]
  if str(prof.get('Mod Warning','')).upper()=='TRUE':events.append('MOD_WARNING')
  if str(prof.get('Banned','')).upper()=='TRUE':events.append('BAN')
  if moderation.should_pause(events):social_os.replay(c['id'],c['author'],c['topic'],'NO_ACTION','moderation pause',DRY);continue
  choice,reason=decide(c);print(choice,c['id'],c['sub'],c['author'],c['topic']);social_os.replay(c['id'],c['author'],c['topic'],choice,reason,DRY)
  if choice=='HOLD':social_os.research_hold(c['id'],c['text'][:700],reason);continue
  acted=False
  if choice=='COMMENT':
   body=make_comment(c)
   if body:
    if live and social_os.control('Reddit Comments Enabled'):resilience.retry(api.comment,c['id'],body)
    acted=True
  elif choice=='SAVE':
   if live and social_os.control('Reddit Saves Enabled'):resilience.retry(api.save,c['thing'])
   acted=True
  elif choice=='UPVOTE':
   if live and social_os.control('Reddit Votes Enabled'):resilience.retry(api.upvote,c['thing'])
   acted=True
  if acted:
   actions+=1;authors[c['author'].lower()]+=1;subs[c['sub'].lower()]+=1;topics[c['topic']]+=1;social_os.log_interaction(c['sub'],c['author'],c['id'],choice,reason,DRY,c['topic'],c['fp']);social_os.lineage(c['id'],c['fp'],c['topic'],'',c['text'])
  if OPPORTUNITY.search(c['text']):print('OPPORTUNITY',c['author'],social_os.opportunity(c['author'],c['text'][:220]))
 social_os.usage(resilience.usage(),actions,len(pool));social_os.log_run(started,'shadow' if DRY else 'live',DRY,len(pool),actions,f'calls={resilience.usage()}; authors={len(authors)}; subs={len(subs)}; topics={len(topics)}');print(f'SUMMARY pool={len(pool)} calls={resilience.usage()} actions={actions} authors={len(authors)} subreddits={len(subs)} topics={len(topics)} dry_run={DRY}')
if __name__=='__main__':main()
