from __future__ import annotations
import re
SIGNAL=re.compile(r'\b(partner|partnership|speaker|speaking|investment|investor|acquisition|vendor|supplier|procurement|rfp|tender|pilot|collaboration|adviser|advisor|hiring|seeking|looking for)\b',re.I)
def detect(text):return bool(SIGNAL.search(text or ''))
def stage(evidence_count):return 'QUALIFIED' if evidence_count>=2 else 'OBSERVED' if evidence_count==1 else 'NONE'
