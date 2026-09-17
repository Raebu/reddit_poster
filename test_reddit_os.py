import os,tempfile,unittest
from collections import Counter
import policy,strategy,semantic,community,moderation,resilience,learning,research
class Tests(unittest.TestCase):
 def test_current_claim_hold(self):self.assertTrue(policy.current_claim('Company X acquired Company Y today'))
 def test_sales_blocked(self):self.assertFalse(policy.gate_generated('DM me and we can help')[0])
 def test_fake_personal_deal_blocked(self):self.assertFalse(policy.gate_generated('I led the acquisition')[0])
 def test_politics_detected(self):self.assertTrue(policy.political('vote for this candidate'))
 def test_semantic_duplicate(self):self.assertTrue(semantic.duplicate('integration risk destroys acquisition value',['acquisition value can be destroyed by integration risk'],.6))
 def test_community_stages(self):
  self.assertEqual(community.stage({'observations':0,'accepted_actions':0}),'UNKNOWN');self.assertEqual(community.stage({'observations':6,'accepted_actions':0}),'UNDERSTOOD');self.assertEqual(community.stage({'observations':6,'accepted_actions':3}),'PARTICIPATING')
 def test_moderation_pause(self):self.assertTrue(moderation.should_pause(['MOD_WARNING']))
 def test_research_fails_closed(self):
  old=os.environ.pop('SOCIAL_RESEARCH_ENDPOINT',None)
  try:self.assertFalse(research.verify('breaking acquisition')['verified'])
  finally:
   if old:os.environ['SOCIAL_RESEARCH_ENDPOINT']=old
 def test_network_health(self):
  h=learning.network_health([{'Action':'COMMENT','Author':'a','Topic':'x','Subreddit':'one'},{'Action':'SAVE','Author':'b','Topic':'y','Subreddit':'two'}]);self.assertEqual(h['unique_authors'],2);self.assertEqual(h['unique_subreddits'],2)
 def test_outbox(self):
  old=resilience.OUTBOX
  with tempfile.TemporaryDirectory() as d:
   resilience.OUTBOX=os.path.join(d,'o.jsonl');resilience.queue('memory',{'x':1});self.assertEqual(len(resilience.pending()),1)
  resilience.OUTBOX=old
if __name__=='__main__':unittest.main()
