"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";

export interface InvestigatorNode {
  id: string;
  parentId: string | null;
  kind: "trama" | "case" | "action" | "openLoop" | "step";
  title: string;
  status: string;
  tone: string;
  href?: string;
  contextPlotId?: string;
  contextActionId?: string;
}

type Point = { x: number; y: number };
const cardWidth = 148;
const cardHeight = 118;

function initialPositions(nodes: InvestigatorNode[]): Record<string, Point> {
  const result: Record<string, Point> = {};
  const roots = nodes.filter((node) => node.parentId === null);
  roots.forEach((root, rootIndex) => {
    result[root.id] = { x: 42 + rootIndex * 250, y: 36 };
    const queue = [root];
    while (queue.length > 0) {
      const parent = queue.shift()!;
      const parentPosition = result[parent.id]!;
      const children = nodes.filter((node) => node.parentId === parent.id);
      children.forEach((child, childIndex) => {
        result[child.id] = { x: parentPosition.x + 24, y: parentPosition.y + 150 + childIndex * 138 };
        queue.push(child);
      });
    }
  });
  return result;
}

export function InvestigatorBoard({ plotId, nodes }: { plotId: string; nodes: InvestigatorNode[] }) {
  const storageKey = `trama.investigator-board.v1.${plotId}`;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const visibleNodes = useMemo(() => nodes.filter((node) =>
    node.kind === "trama" || node.kind === "case" || Boolean(node.parentId && expanded.has(node.parentId))
  ), [expanded, nodes]);
  const defaults = useMemo(() => initialPositions(visibleNodes), [visibleNodes]);
  const [positions, setPositions] = useState<Record<string, Point>>(defaults);
  const [selected, setSelected] = useState<string | null>(null);
  const dragging = useRef<{ id: string; lastX: number; lastY: number; moved: boolean } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    try { setPositions({ ...defaults, ...JSON.parse(localStorage.getItem(storageKey) ?? "{}") }); }
    catch { setPositions(defaults); }
  }, [defaults, storageKey]);

  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(positions)); }, [positions, storageKey]);

  const related = useMemo(() => {
    if (!selected) return new Set(visibleNodes.map((node) => node.id));
    const node = nodes.find((item) => item.id === selected);
    return new Set([selected, node?.parentId, ...nodes.filter((item) => item.parentId === selected).map((item) => item.id)].filter(Boolean) as string[]);
  }, [nodes, selected, visibleNodes]);

  function pointerDown(event: PointerEvent<HTMLElement>, id: string) {
    dragging.current = { id, lastX: event.clientX, lastY: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<HTMLElement>) {
    if (!dragging.current) return;
    const state = dragging.current;
    const dx = event.clientX - state.lastX; const dy = event.clientY - state.lastY;
    state.lastX = event.clientX; state.lastY = event.clientY; state.moved ||= Math.abs(dx) + Math.abs(dy) > 1;
    setPositions((current) => ({ ...current, [state.id]: { x: Math.max(0, (current[state.id]?.x ?? 0) + dx), y: Math.max(0, (current[state.id]?.y ?? 0) + dy) } }));
  }

  function pointerUp() { dragged.current = dragging.current?.moved ?? false; dragging.current = null; }

  const maxY = Math.max(620, ...Object.values(positions).map((point) => point.y + cardHeight + 40));
  const maxX = Math.max(980, ...Object.values(positions).map((point) => point.x + cardWidth + 40));
  return <div className="investigatorCanvas" style={{ height: maxY, width: maxX }} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
    <svg className="evidenceThreads" aria-hidden="true">
      {visibleNodes.filter((node) => node.parentId && positions[node.id] && positions[node.parentId]).map((node) => {
        const from = positions[node.parentId!]!; const to = positions[node.id]!;
        const active = !selected || related.has(node.id) && related.has(node.parentId!);
        return <line key={`${node.parentId}-${node.id}`} x1={from.x + cardWidth / 2} y1={from.y + cardHeight / 2} x2={to.x + cardWidth / 2} y2={to.y + cardHeight / 2} className={active ? "active" : "muted"} />;
      })}
    </svg>
    {visibleNodes.map((node, index) => {
      const position = positions[node.id] ?? { x: 20 + index * 20, y: 20 + index * 20 };
      const childCount = nodes.filter((item) => item.parentId === node.id).length;
      const content = <><small>{node.kind === "openLoop" ? "Ponta Solta" : node.kind === "case" ? "Caso" : node.kind === "action" ? "Ação" : node.kind === "step" ? "Passo dado" : "Trama"}</small><strong>{node.title}</strong><span className={`boardStatus status-${node.tone}`}>{node.status}</span>{childCount > 0 && <span className="expandHint">{expanded.has(node.id) ? "− Recolher" : `+ Expandir (${childCount})`}</span>}</>;
      const className = `evidenceNote kind-${node.kind} status-border-${node.tone}${selected === node.id ? " selected" : ""}${!related.has(node.id) ? " muted" : ""}`;
      return <article className={className} style={{ transform: `translate(${position.x}px, ${position.y}px)` }} onPointerDown={(event) => pointerDown(event, node.id)} onClick={() => { if (!dragged.current) { setSelected((current) => current === node.id ? null : node.id); if (childCount > 0) setExpanded((current) => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; }); } dragged.current = false; }} key={node.id}>
        {content}<div className="evidenceActions">{node.href && <a href={node.href} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>Abrir ↗</a>}<button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); const entityType = node.kind === "trama" || node.kind === "case" ? "plot" : node.kind === "openLoop" ? "openLoop" : "action"; const entityId = entityType === "action" ? node.contextActionId ?? node.id : node.id; window.dispatchEvent(new CustomEvent("trama:open-agent", { detail: { plotId: node.contextPlotId, actionId: node.contextActionId, entityType, entityId, title: node.title } })); }}>Conversar</button></div>
      </article>;
    })}
    <button type="button" className="resetBoard" onClick={() => { setPositions(defaults); setSelected(null); }}>Reorganizar quadro</button>
  </div>;
}
