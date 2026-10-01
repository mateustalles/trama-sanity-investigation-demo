import Link from "next/link";
import { requireHostedUser } from "../../lib/supabase/session";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { savePreferences } from "./actions";

export default async function SettingsPage() {
  const user = await requireHostedUser();
  if (!user) return <main className="settingsPage"><section className="settingsPaper"><Link href="/">← Voltar</Link><h1>Configurações</h1><p>As preferências por usuário estarão disponíveis quando o modo hospedado for ativado.</p></section></main>;
  const { data } = await (await createSupabaseServerClient()).from("user_preferences").select("*").eq("user_id", user.id).single();
  return <main className="settingsPage"><section className="settingsPaper">
    <Link href="/">← Voltar à Mesa</Link><p className="kicker">Seu Trama</p><h1>Configurações</h1>
    <form action={savePreferences} className="preferenceForm">
      <fieldset><legend>Como a IA usa o contexto</legend>
        <label><input type="radio" name="contextMode" value="conversational" defaultChecked={data?.context_mode !== "focused"} /><span><strong>Conversa natural</strong><small>A tela aberta é uma pista; o que você disser explicitamente prevalece. Recomendado para OpenAI.</small></span></label>
        <label><input type="radio" name="contextMode" value="focused" defaultChecked={data?.context_mode === "focused"} /><span><strong>Contexto focado</strong><small>O item aberto delimita a conversa. Recomendado para modelos locais menores.</small></span></label>
      </fieldset>
      <fieldset><legend>Recursos do agente</legend>
        <Toggle name="guidedWorkflows" label="Mostrar ações guiadas" detail="Oferece caminhos determinísticos para o item em foco." checked={data?.guided_workflows === true} />
        <Toggle name="entityMemory" label="Usar histórico deste item" detail="Consulta conversas anteriores ligadas à mesma entidade." checked={data?.entity_memory !== false} />
        <Toggle name="globalMemory" label="Permitir contexto de outras Tramas" detail="Desligado por padrão; amplia a busca somente quando autorizado." checked={data?.global_memory === true} />
        <Toggle name="voiceInput" label="Ativar entrada por voz" detail="Exibe o controle de gravação e transcrição no chat." checked={data?.voice_input !== false} />
      </fieldset>
      <button type="submit">Salvar configurações</button>
    </form>
  </section></main>;
}

function Toggle({ name, label, detail, checked }: { name: string; label: string; detail: string; checked: boolean }) {
  return <label><input type="checkbox" name={name} defaultChecked={checked} /><span><strong>{label}</strong><small>{detail}</small></span></label>;
}
