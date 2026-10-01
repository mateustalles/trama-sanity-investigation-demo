import {readFile, mkdir, writeFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {randomBytes} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import postgres from 'postgres'

const [mode, email, envPath, origin] = process.argv.slice(2)
if (!['plan','create'].includes(mode) || !email || !envPath) throw new Error('Usage: node scripts/provision-sanity-demo-judge.mjs plan|create email env-file [origin]')
const env = parseEnv(await readFile(envPath,'utf8'))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
let existing
for (let page=1;;page++) {
  const {data,error} = await admin.auth.admin.listUsers({page,perPage:100})
  if(error) throw new Error('Cannot inspect Auth accounts')
  existing = data.users.find(user=>user.email?.toLowerCase()===email.toLowerCase())
  if(existing || data.users.length<100) break
}
if(mode==='plan') {
  console.log(JSON.stringify({accountExists:Boolean(existing),existingJudge:existing?.app_metadata?.trama_access==='sanity_demo_judge'}))
} else {
  if(existing) throw new Error('Account already exists; no account was modified')
  if(env.TRAMA_HOSTED_TENANCY_READY!=='true') throw new Error('Hosted tenancy must be enabled')
  const url = new URL(origin)
  if(url.username || url.password || url.pathname!=='/' || url.search || url.hash ||
    !(url.protocol==='https:' || (url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) throw new Error('Use a trusted HTTPS origin or localhost')
  const sql = postgres(env.SUPABASE_DATABASE_URL,{max:1,ssl:'require'})
  try {
    const migration = await readFile(new URL('../supabase/migrations/202609290001_sanity_demo_judge_access.sql',import.meta.url),'utf8')
    await sql.begin(async tx => {await tx.unsafe(migration)})
  } finally {await sql.end()}
  const expiresAt = new Date(Date.now()+14*24*60*60*1000).toISOString()
  const {data,error} = await admin.auth.admin.createUser({email,email_confirm:true,password:randomBytes(32).toString('base64url'),
    app_metadata:{trama_access:'sanity_demo_judge',sanity_demo_expires_at:expiresAt},user_metadata:{display_name:'Sanity Challenge Judge'}})
  if(error) throw new Error('Judge creation failed; migration applied but no credential was written')
  const link = await admin.auth.admin.generateLink({type:'recovery',email})
  if(link.error) throw new Error('Judge created but setup link failed; do not rerun create')
  const setup = new URL('/auth/callback',url)
  setup.searchParams.set('token_hash',link.data.properties.hashed_token)
  setup.searchParams.set('type','recovery')
  const directory = new URL('../.trama/runtime/',import.meta.url)
  await mkdir(directory,{recursive:true})
  await writeFile(new URL('sanity-demo-judge-setup.json',directory),JSON.stringify({email,expiresAt,setupUrl:setup.href},null,2),{mode:0o600})
  console.log(JSON.stringify({created:true,userId:data.user.id,expiresAt,privateSetupFile:'.trama/runtime/sanity-demo-judge-setup.json'}))
}
