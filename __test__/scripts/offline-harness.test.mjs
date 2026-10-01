import assert from 'node:assert/strict'
import {it} from 'node:test'

it('blocks accidental live fetch before a provider request can be sent',async () => {
  await assert.rejects(()=>fetch('https://example.invalid/not-a-provider-request'),/Live fetch is disabled/)
})
