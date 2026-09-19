from __future__ import annotations
STAGES=('DISCOVERED','FAMILIAR','ENGAGED','RECIPROCAL','RECURRING','STRONG')
def stage(interactions=0,reciprocal=0,continued=0):
 if interactions>=12 and reciprocal>=4 and continued>=3:return 'STRONG'
 if interactions>=7 and reciprocal>=2:return 'RECURRING'
 if reciprocal>=1:return 'RECIPROCAL'
 if interactions>=3:return 'ENGAGED'
 if interactions>=1:return 'FAMILIAR'
 return 'DISCOVERED'
