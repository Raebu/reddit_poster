from __future__ import annotations
import re,hashlib
PORTFOLIO=['technology_ai','ma_corpdev','strategy_economics','investment_capital','leadership_operating_model','transformation_execution','entrepreneurship_building','human_curiosity']
TERMS={'technology_ai':r'\b(ai|automation|software|technology|model|agent|cloud|data|cyber)\b','ma_corpdev':r'\b(m&a|merger|acquisition|acquire|corp(?:orate)? dev|diligence|synerg|integration)\b','strategy_economics':r'\b(strategy|economics|market|pricing|incentive|competition|margin)\b','investment_capital':r'\b(invest|capital|private equity|venture capital|vc|pe|valuation|funding)\b','leadership_operating_model':r'\b(leadership|ceo|executive|operating model|organisation|organization|governance)\b','transformation_execution':r'\b(transformation|execution|implementation|change programme|delivery)\b','entrepreneurship_building':r'\b(founder|startup|entrepreneur|building|product)\b'}
def topic(text,source=''):
 s=(text+' '+source).lower();scores={k:len(re.findall(v,s,re.I)) for k,v in TERMS.items()};best=max(scores,key=scores.get);return best if scores[best] else 'human_curiosity'
def fingerprint(text):return hashlib.sha256(re.sub(r'\W+',' ',text.lower()).strip().encode()).hexdigest()[:20]
def ma_lens():return 'strategic rationale; build-versus-buy; valuation assumptions; diligence; technology debt; IP; talent; distribution; operating-model fit; integration; incentives; synergy quality; dis-synergies; execution; second-order effects'
def score(text,topic_name,community_fit=0.0,conversation=0.0,fatigue=0.0,saturation=0.0):
 base=min(4,len(text)/220)+2;executive=2 if topic_name in {'ma_corpdev','strategy_economics','investment_capital','leadership_operating_model'} else 0
 return base+executive+community_fit+conversation-fatigue*4-saturation*2
