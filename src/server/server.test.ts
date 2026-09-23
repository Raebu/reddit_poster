import assert from 'node:assert/strict'
import {test} from 'node:test'
import {Endpoint, EndpointMethod, type SocialOsMode} from '../shared/api.ts'

test('Social OS status endpoint is GET', () => {
  assert.equal(EndpointMethod[Endpoint.Status], 'GET')
})

test('Social OS mode endpoint is POST', () => {
  assert.equal(EndpointMethod[Endpoint.SetMode], 'POST')
})

test('Social OS modes are valid', () => {
  const modes: SocialOsMode[] = ['OBSERVE', 'SHADOW', 'CANARY', 'LIVE']

  assert.deepEqual(modes, ['OBSERVE', 'SHADOW', 'CANARY', 'LIVE'])
})

test('internal Devvit endpoints remain POST', () => {
  assert.equal(EndpointMethod[Endpoint.OnAppInstall], 'POST')
  assert.equal(EndpointMethod[Endpoint.OnMenuNewPost], 'POST')
})
