from __future__ import annotations
STAGES=('UNKNOWN','OBSERVING','UNDERSTOOD','PARTICIPATING','ESTABLISHED')
def stage(profile):
 if profile.get('banned') or profile.get('mod_warning'):return 'UNKNOWN'
 n=int(profile.get('observations',0));a=int(profile.get('accepted_actions',0))
 if a>=8:return 'ESTABLISHED'
 if a>=2:return 'PARTICIPATING'
 if n>=5:return 'UNDERSTOOD'
 if n>=1:return 'OBSERVING'
 return 'UNKNOWN'
def can_participate(profile):return stage(profile) in {'UNDERSTOOD','PARTICIPATING','ESTABLISHED'} and not profile.get('banned') and not profile.get('mod_warning')
def removal_signal(profile):return int(profile.get('removals',0))>0
def fit_score(profile):
 s=stage(profile);return {'UNKNOWN':-1.5,'OBSERVING':-.5,'UNDERSTOOD':.5,'PARTICIPATING':1.0,'ESTABLISHED':1.5}[s]-(1.5 if removal_signal(profile) else 0)
