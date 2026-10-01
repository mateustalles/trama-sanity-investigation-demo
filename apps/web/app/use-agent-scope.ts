"use client";

import { useEffect, useState } from "react";
import { resolveAgentScope, type AgentScope } from "./agent-scope";

function readAgentScope(preferredAction?: HTMLElement | null): AgentScope {
  const contextElement = document.querySelector<HTMLElement>("[data-agent-view]");
  const actionElement = preferredAction?.isConnected && preferredAction.hasAttribute("open")
    ? preferredAction
    : document.querySelector<HTMLElement>("details[data-agent-action-id][open]");
  return resolveAgentScope({
    view: contextElement?.dataset.agentView,
    plotId: contextElement?.dataset.agentPlotId,
    plotTitle: contextElement?.dataset.agentPlotTitle,
    plotKind: contextElement?.dataset.agentPlotKind === "case" ? "case" : "plot",
    actionId: actionElement?.dataset.agentActionId,
    actionTitle: actionElement?.dataset.agentActionTitle
  });
}

function sameScope(left: AgentScope, right: AgentScope) {
  return left.kind === right.kind && left.entityId === right.entityId && left.title === right.title && left.plotId === right.plotId && left.actionId === right.actionId;
}

export function useAgentScope(enabled = true) {
  const [scope, setScope] = useState<AgentScope | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let preferredAction: HTMLElement | null = null;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = readAgentScope(preferredAction);
        setScope((current) => current && sameScope(current, next) ? current : next);
      });
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type !== "attributes" || record.attributeName !== "open" || !(record.target instanceof HTMLElement) || !record.target.matches("details[data-agent-action-id]")) continue;
        if (record.target.hasAttribute("open")) preferredAction = record.target;
        else if (preferredAction === record.target) preferredAction = null;
      }
      update();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open", "data-agent-view", "data-agent-plot-id", "data-agent-plot-title", "data-agent-plot-kind", "data-agent-action-id", "data-agent-action-title"]
    });
    window.addEventListener("popstate", update);
    window.addEventListener("trama:scope-changed", update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("popstate", update);
      window.removeEventListener("trama:scope-changed", update);
    };
  }, [enabled]);

  return scope;
}
