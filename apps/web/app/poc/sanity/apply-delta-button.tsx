'use client'

import {useState} from 'react'

export function ApplyDeltaButton({caseId, deltaId}: {caseId: string; deltaId: string}) {
  const [state, setState] = useState<'idle' | 'applying' | 'applied' | 'failed'>('idle')
  const [message, setMessage] = useState('')

  async function apply() {
    if (!window.confirm('Aplicar esta Delta? A alteração será auditada no Trama e gravada no Sanity.')) return
    setState('applying')
    setMessage('')
    const response = await fetch('/api/investigations/apply-approved-delta', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({caseId, deltaId}),
    })
    const result = await response.json() as {error?: string; transactionId?: string}
    if (!response.ok) {
      setState('failed')
      setMessage(result.error ?? 'Não foi possível aplicar a Delta.')
      return
    }
    setState('applied')
    setMessage(`Aplicada e auditada. Transação ${result.transactionId ?? 'confirmada'}.`)
  }

  return <div>
    <button type="button" onClick={() => void apply()} disabled={state === 'applying' || state === 'applied'}>
      {state === 'applying' ? 'Aplicando…' : state === 'applied' ? 'Aplicada' : 'Aprovar e aplicar'}
    </button>
    {message && <p role={state === 'failed' ? 'alert' : 'status'}>{message}</p>}
  </div>
}
