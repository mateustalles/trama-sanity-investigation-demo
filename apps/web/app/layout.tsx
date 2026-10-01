import type { Metadata } from "next";
import "./globals.css";
import "./overrides.css";
import "./priority-panel.css";
import "./calendar.css";
import { LocalAgentChat } from "./local-agent-chat";
import { hostedAuthConfigured } from "../lib/supabase/config";
import { currentHostedUser } from "../lib/supabase/session";
import { isDemoJudge } from "../lib/supabase/demo-judge";

export const metadata: Metadata = {
  title: "Mesa do Investigador · Trama",
  description: "Veja o que está em movimento, o que precisa de você e o que não pode cair no esquecimento."
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentHostedUser();
  const showChat = !hostedAuthConfigured() || Boolean(user && !isDemoJudge(user));
  return (
    <html lang="pt-BR">
      <body>{children}{showChat && <LocalAgentChat />}</body>
    </html>
  );
}
