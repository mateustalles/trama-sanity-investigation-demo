import {applyApprovedSanityDelta, approveSanityDelta} from '../../../../lib/sanity/apply-approved-delta'
import {getRequestTramaService} from '../../../../lib/service'
import {currentHostedUser} from '../../../../lib/supabase/session'
import {hostedAuthConfigured} from '../../../../lib/supabase/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The browser may request an application, but it cannot write to Sanity
 * directly. A valid Trama conversation is required so approval and outcome
 * are retained in the local audit history.
 */
export async function POST(request: Request) {
  if (hostedAuthConfigured() && !await currentHostedUser()) {
    return Response.json({error: 'Autenticação necessária.'}, {status: 401})
  }

  let operationId: string | null = null
  try {
    const body = await request.json() as {
      caseId?: string
      deltaId?: string
      conversationId?: string
      messageId?: string
    }
    if (!body.caseId?.trim() || !body.deltaId?.trim()) {
      return Response.json({error: 'caseId e deltaId são obrigatórios.'}, {status: 400})
    }

    const service = await getRequestTramaService()
    const conversation = body.conversationId?.trim()
      ? null
      : await service.createConversation({
        title: 'Aprovação de Delta de investigação',
        primaryEntityType: 'workspace',
        primaryEntityId: 'trama',
        memoryScope: 'currentConversation',
        sourceClient: 'web',
      })
    const conversationId = body.conversationId?.trim() ?? conversation!.id
    const operation = await service.recordConversationOperation({
      conversationId,
      messageId: body.messageId ?? null,
      toolName: 'apply_approved_investigation_delta',
      arguments: {caseId: body.caseId, deltaId: body.deltaId},
    })
    operationId = operation.id
    await service.resolveConversationOperation(operationId, 'approved')

    await approveSanityDelta(body.caseId, body.deltaId)
    const result = await applyApprovedSanityDelta(body.caseId, body.deltaId)
    await service.resolveConversationOperation(operationId, 'executed', {
      caseId: body.caseId,
      deltaId: body.deltaId,
      conversationId,
      transactionId: result.transactionId,
    })
    return Response.json({caseId: body.caseId, deltaId: body.deltaId, conversationId, transactionId: result.transactionId})
  } catch (error) {
    if (operationId) {
      const message = error instanceof Error ? error.message : String(error)
      await (await getRequestTramaService()).resolveConversationOperation(operationId, 'failed', null, message)
    }
    return Response.json({error: error instanceof Error ? error.message : String(error)}, {status: 500})
  }
}
