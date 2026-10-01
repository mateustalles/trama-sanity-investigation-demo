import {NextResponse} from 'next/server'
import {createSupabaseServerClient} from '../../../lib/supabase/server'

export const runtime = 'nodejs'

/**
 * Supabase password recovery uses PKCE. The verifier is an HTTP-only cookie
 * stored when the reset was requested, so this exchange must happen on the
 * server rather than in a browser component.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const recovery = tokenHash && url.searchParams.get('type') === 'recovery'
  if (!code && !recovery) {
    return NextResponse.redirect(new URL('/login?error=Invalid%20recovery%20link.', url))
  }

  const client = await createSupabaseServerClient()
  const {error} = recovery
    ? await client.auth.verifyOtp({token_hash:tokenHash!,type:'recovery'})
    : await client.auth.exchangeCodeForSession(code!)
  if (error) {
    return NextResponse.redirect(new URL('/login?error=This%20link%20has%20expired%20or%20was%20already%20used.', url))
  }
  return NextResponse.redirect(new URL('/set-password', url))
}
