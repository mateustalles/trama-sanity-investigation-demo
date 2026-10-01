"use client";

import { useRef } from "react";
import { createAction } from "./actions";

type OpenLoopOption = { id: string; title: string };

export function ActionComposer({ plotId, openLoops }: {
  plotId: string; openLoops: OpenLoopOption[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return <>
    <button className="addActionButton" type="button" onClick={() => dialogRef.current?.showModal()}>+ Adicionar próximo passo</button>
    <dialog className="actionDialog" ref={dialogRef} onMouseDown={(event) => {
      if (event.target === event.currentTarget) dialogRef.current?.close();
    }}>
      <div className="actionDialogPaper">
        <header><div><p className="kicker">Transformar em movimento</p><h2>Adicionar próximo passo</h2></div><button className="dialogClose" type="button" aria-label="Fechar" onClick={() => dialogRef.current?.close()}>×</button></header>
        <form action={createAction} className="humanActionForm"><input type="hidden" name="plotId" value={plotId} />
          <label className="wide">O que precisa acontecer?<input name="title" required autoFocus /></label><label className="wide">Contexto<textarea name="description" /></label>
          <label>Responsável<input name="owner" defaultValue="Mateus" required /></label><label>Ponta solta<select name="openLoopId"><option value="">Criar automaticamente</option>{openLoops.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
          <label>Até quando?<input type="datetime-local" name="deadlineAt" required /></label>
          <label>Quanto isso importa?<select name="importance" defaultValue="high"><option value="low">Pouco neste momento</option><option value="medium">Importante</option><option value="high">Muito importante</option><option value="critical">Não pode esperar</option></select></label>
          <label>Quando precisa andar?<select name="timing" defaultValue="soon"><option value="flexible">Pode esperar um pouco</option><option value="soon">Nos próximos dias</option><option value="urgent">Agora / hoje</option></select></label>
          <label className="wide">O que pode dar errado ou cair no esquecimento?<input name="riskDescription" /></label><button type="submit">Adicionar aos próximos passos</button>
        </form>
      </div>
    </dialog>
  </>;
}
