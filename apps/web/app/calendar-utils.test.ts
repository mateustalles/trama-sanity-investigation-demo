import { describe, expect, it } from "vitest";
import { adjacentMonthKey, buildMonthGrid, calendarActionStatus, deadlineDateKey, parseMonthKey } from "./calendar-utils";

describe("calendar utilities", () => {
  it("builds a Monday-first six-week month grid", () => {
    const grid = buildMonthGrid(parseMonthKey("2026-08"), new Date(2026, 7, 19, 12));
    expect(grid).toHaveLength(42);
    expect(grid[0]?.dateKey).toBe("2026-07-27");
    expect(grid.find((day) => day.isToday)?.dateKey).toBe("2026-08-19");
  });

  it("navigates across years and respects the operational timezone", () => {
    expect(adjacentMonthKey(parseMonthKey("2026-01"), -1)).toBe("2025-12");
    expect(deadlineDateKey("2026-08-20T01:00:00.000Z")).toBe("2026-08-19");
  });

  it("maps Action resolutions to accessible calendar marks", () => {
    expect(calendarActionStatus("completed")).toEqual({ symbol: "✓", label: "Concluída", tone: "completed" });
    expect(calendarActionStatus("waiting")).toEqual({ symbol: "●", label: "Aguardando", tone: "waiting" });
    expect(calendarActionStatus("cancelled")).toEqual({ symbol: "×", label: "Cancelada", tone: "cancelled" });
    expect(calendarActionStatus("unknown")).toEqual({ symbol: "○", label: "Pendente", tone: "pending" });
  });
});
