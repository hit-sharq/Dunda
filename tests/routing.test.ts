import { describe, expect, it } from "vitest";
import { stationFor, splitIntoTickets, isClosed, type TicketLine } from "../artifacts/api-server/src/lib/routing";
import { ORDER_STATUS_TRANSITIONS } from "../artifacts/api-server/src/lib/orderWorkflow";

/**
 * Routing decides which station sees an order line, and a mistake here sends a
 * burger to the bar or a whisky to the kitchen.
 */
describe("station routing", () => {
  it("sends a category's own station when it names one", () => {
    expect(stationFor({ station: "KITCHEN", group: "drinks" })).toBe("KITCHEN");
    expect(stationFor({ station: "BAR", group: "food" })).toBe("BAR");
  });

  it("falls back to the reporting group when no station is named", () => {
    expect(stationFor({ station: null, group: "food" })).toBe("KITCHEN");
    expect(stationFor({ station: null, group: "drinks" })).toBe("BAR");
  });

  it("sends an ungrouped or unknown category to the bar rather than nowhere", () => {
    expect(stationFor({ station: null, group: null })).toBe("BAR");
    expect(stationFor(undefined)).toBe("BAR");
    expect(stationFor({ station: "NOT_A_STATION", group: null })).toBe("BAR");
  });
});

function line(name: string, station: "BAR" | "KITCHEN"): TicketLine {
  return { orderItemId: name, name, quantity: 1, notes: null, station };
}

describe("splitting an order into tickets", () => {
  it("puts drinks and food on separate tickets", () => {
    const result = splitIntoTickets([
      line("Whisky", "BAR"),
      line("Steak", "KITCHEN"),
      line("Coke", "BAR"),
    ]);
    expect([...result.keys()].sort()).toEqual(["BAR", "KITCHEN"]);
    expect(result.get("BAR")!.map((l) => l.name)).toEqual(["Whisky", "Coke"]);
    expect(result.get("KITCHEN")!.map((l) => l.name)).toEqual(["Steak"]);
  });

  it("produces one ticket when a table only ordered one kind of thing", () => {
    const result = splitIntoTickets([line("Whisky", "BAR"), line("Coke", "BAR")]);
    expect(result.size).toBe(1);
    expect(result.get("BAR")).toHaveLength(2);
  });

  it("produces no tickets for no items", () => {
    expect(splitIntoTickets([]).size).toBe(0);
  });
});

/**
 * The service workflow is enforced on the server so a ticket cannot skip a
 * stage. These are the transitions the UI offers, and the ones it must not.
 */
describe("order status transitions", () => {
  const allowed = (from: string, to: string) =>
    (ORDER_STATUS_TRANSITIONS[from] ?? []).includes(to);

  it("walks the normal path through the kitchen", () => {
    expect(allowed("PENDING", "ACCEPTED")).toBe(true);
    expect(allowed("ACCEPTED", "PREPARING")).toBe(true);
    expect(allowed("PREPARING", "READY")).toBe(true);
    expect(allowed("READY", "SERVED")).toBe(true);
  });

  it("refuses skipping a stage", () => {
    expect(allowed("PENDING", "PREPARING")).toBe(false);
    expect(allowed("PENDING", "SERVED")).toBe(false);
    expect(allowed("ACCEPTED", "READY")).toBe(false);
  });

  it("lets any open ticket be cancelled", () => {
    for (const from of ["DRAFT", "PENDING", "ACCEPTED", "PREPARING", "READY", "SERVED", "PAYMENT_PENDING"]) {
      expect(allowed(from, "CANCELLED")).toBe(true);
    }
  });

  it("closes a completed or cancelled ticket permanently", () => {
    expect(ORDER_STATUS_TRANSITIONS.COMPLETED).toBeNull();
    expect(ORDER_STATUS_TRANSITIONS.CANCELLED).toBeNull();
  });

  it("only settles payment from the stages where payment is outstanding", () => {
    expect(allowed("SERVED", "COMPLETED")).toBe(true);
    expect(allowed("PAYMENT_PENDING", "COMPLETED")).toBe(true);
    expect(allowed("PENDING", "COMPLETED")).toBe(false);
  });
});

describe("closed tickets", () => {
  it("treats served, completed and cancelled as finished", () => {
    for (const s of ["SERVED", "COMPLETED", "CANCELLED"]) {
      expect(isClosed(s)).toBe(true);
    }
  });

  it("treats everything still being worked as open", () => {
    for (const s of ["PENDING", "ACCEPTED", "PREPARING", "READY"]) {
      expect(isClosed(s)).toBe(false);
    }
  });
});
