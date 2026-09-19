import os,tempfile,unittest
import policy,strategy,semantic,community,moderation,resilience,learning,research,conversation,relationships,opportunities,discovery
class Tests(unittest.TestCase):
 def test_current_claim_hold(self):self.assertTrue(policy.current_claim('Company X acquired Company Y today'))
 def test_sales_blocked(self):self.assertFalse(policy.gate_generated('DM me and we can help')[0])
 def test_fake_personal_deal_blocked(self):self.assertFalse(policy.gate_generated('I led the acquisition')[0])
 def test_politics_detected(self):self.assertTrue(policy.political('vote for this candidate'))
 def test_semantic_duplicate(self):self.assertTrue(semantic.duplicate('integration risk destroys acquisition value',['acquisition value can be destroyed by integration risk'],.6))
 def test_community_stages(self):
  self.assertEqual(community.stage({'observations':0,'accepted_actions':0}),'UNKNOWN');self.assertEqual(community.stage({'observations':6,'accepted_actions':0}),'UNDERSTOOD');self.assertEqual(community.stage({'observations':6,'accepted_actions':3}),'PARTICIPATING')
 def test_unknown_community_cannot_participate(self):self.assertFalse(community.can_participate({'observations':1,'accepted_actions':0}))
 def test_moderation_pause(self):self.assertTrue(moderation.should_pause(['MOD_WARNING']))
 def test_research_fails_closed(self):
  old=os.environ.pop('SOCIAL_RESEARCH_ENDPOINT',None)
  try:self.assertFalse(research.verify('breaking acquisition')['verified'])
  finally:
   if old:os.environ['SOCIAL_RESEARCH_ENDPOINT']=old
 def test_network_health(self):
  h=learning.network_health([{'Action':'COMMENT','Author':'a','Topic':'x','Subreddit':'one'},{'Action':'POST','Author':'b','Topic':'y','Subreddit':'two'}]);self.assertEqual(h['unique_authors'],2);self.assertEqual(h['unique_subreddits'],2)
 def test_conversation_closure(self):self.assertEqual(conversation.state('thanks'),'NATURALLY_CLOSED');self.assertFalse(conversation.should_reply('NATURALLY_CLOSED'))
 def test_relationship_progression(self):self.assertEqual(relationships.stage(3,1,0),'RECIPROCAL');self.assertEqual(relationships.stage(12,4,3),'STRONG')
 def test_opportunity_requires_multiple_signals(self):self.assertTrue(opportunities.detect('looking for a technology adviser'));self.assertEqual(opportunities.stage(1),'OBSERVED');self.assertEqual(opportunities.stage(2),'QUALIFIED')
 def test_discovery_dedupe(self):
  class X:
   def __init__(self,i):self.id=i
  self.assertEqual(len(discovery.dedupe([X('1'),X('1'),X('2')])),2)
 def test_outbox(self):
  old=resilience.OUTBOX
  with tempfile.TemporaryDirectory() as d:
   resilience.OUTBOX=os.path.join(d,'o.jsonl');resilience.queue('memory',{'x':1});self.assertEqual(len(resilience.pending()),1)
  resilience.OUTBOX=old
if __name__=='__main__':unittest.main()
