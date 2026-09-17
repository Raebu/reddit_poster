from __future__ import annotations
import os,random,re,json
from openai import OpenAI
from reddit_api import RedditAPI
from voice import MARTIN_VOICE
import social_os,policy,strategy,semantic,resilience
MODEL=os.getenv('OPENAI_MODEL','gpt-5-mini');DRY=os.getenv('DRY_RUN','true').lower()=='true'
def main():
 topics=strategy.PORTFOLIO[:];random.shuffle(topics);chosen=topics[0];corr='\n'.join(str(x.get('Instruction','')) for x in social_os.corrections()[-20:])
 if not resilience.budget_call():print('HOLD model budget');return
 prompt=f"Create one Reddit-native original post for Martin. Strategic area: {chosen}. Return JSON only: {{\"subreddit\":\"\",\"title\":\"\",\"body\":\"\",\"why_here\":\"\"}}. It must be genuinely worth starting a discussion around, not repurposed LinkedIn copy. Use clear reasoning, natural paragraphs and enough depth to earn a Reddit post. For M&A use relevant lenses from {strategy.ma_lens()} without claiming personal deal history. No unverified current-event claims, marketing, self-promotion or engagement bait. If nothing is worth posting, return subreddit/title/body empty. Human corrections: {corr}"
 raw=OpenAI(api_key=os.environ['OPENAI_API_KEY']).responses.create(model=MODEL,input=MARTIN_VOICE+'\nTASK\n'+prompt).output_text.strip()
 try:d=json.loads(re.sub(r'^```(?:json)?\s*|\s*```$','',raw,flags=re.I))
 except Exception:return print('NO_POST parse failure')
 sub=str(d.get('subreddit','')).strip().lstrip('r/');title=str(d.get('title','')).strip();body=str(d.get('body','')).strip()
 if not sub or not title or not body:return print('NO_POST')
 ok,reason=policy.gate_generated(title+'\n'+body)
 if not ok:return print('HOLD',reason)
 if semantic.duplicate(title+'\n'+body,social_os.recent_texts()):return print('HOLD semantic duplicate')
 profile=social_os.community_profile(sub)
 stage=str(profile.get('Stage','UNKNOWN')).upper()
 if stage not in {'UNDERSTOOD','PARTICIPATING','ESTABLISHED'}:return print('HOLD community not understood:',sub,stage)
 print('POST CANDIDATE',sub,title,body,sep='\n')
 if not DRY and social_os.control('Reddit Live Enabled') and social_os.control('Reddit Posts Enabled'):
  r=resilience.retry(RedditAPI().submit,sub,title,body);cid=str(getattr(r,'id',''));fp=strategy.fingerprint(title+'\n'+body);social_os.lineage(cid,fp,chosen,'',title+'\n'+body);print('PUBLISHED',getattr(r,'permalink',cid))
 social_os.usage(resilience.usage(),0 if DRY else 1,1)
if __name__=='__main__':main()
