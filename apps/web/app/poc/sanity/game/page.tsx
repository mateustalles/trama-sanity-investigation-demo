import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {requireHostedUser} from '../../../../lib/supabase/session';
import {demoAccountAllowed} from '../../../../lib/supabase/demo-judge';
import {DeltaGame} from './delta-game';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {title: 'Delta / The investigation game · Trama', description: 'Build, challenge, and branch your own investigation decisions.'};

export default async function DeltaGamePage() {
  const user = await requireHostedUser({allowDemoJudge: true});
  if (!demoAccountAllowed(user, {requireJudge: process.env.TRAMA_DEMO_REQUIRE_JUDGE === 'true', operatorId: process.env.TRAMA_DEMO_OPERATOR_ID})) notFound();
  return <DeltaGame />;
}
