/**
 * anchor — 소득세법 시행령 §154①2호 나·다목(해외이주·국외거주 출국) 단서의 **출국 후 양도** · **출국일 현재 보유**.
 *
 * 법문: 「세대전원이 출국하는 경우. 다만, 출국일 현재 1주택을 보유하고 있는 경우로서 출국일부터 2년 이내에
 * 양도하는 경우에 한한다」. 「출국일 현재 1주택을 보유하고 있는 경우로서」는 대통령령 제20618호(2008.2.22.)로
 * 들어왔다(부칙 제3조 — 시행 후 최초 양도분). 평가셋 F311·F312·N-F217(출국 전 양도) · N-F275(출국 뒤 취득).
 *
 * | # | 주장 |
 * |---|---|
 * | O-1 | 출국 전 양도는 미적용 · 출국일 당일 양도는 적용 |
 * | O-2 | 2008.2.22. 이후 양도 — 출국 뒤 취득한 주택은 미적용 · 출국일 당일 취득은 적용 |
 * | O-3 | 2008.2.21. 양도 — 출국일 현재 보유 요건 전이라 출국 뒤 취득도 적용 |
 * | O-4 | 출국일부터 2년 경계 |
 */
import { describe, it, expect } from "vitest";
import { resolveExemptionProviso } from "@/lib/tax-engine/transfer-tax-exemption-holding";

const D = (s: string) => new Date(s);

const judge = (acq: string, departure: string, transfer: string, reason: "overseas_migration" | "overseas_residence" = "overseas_residence") =>
  resolveExemptionProviso({
    acquisitionDate: D(acq),
    transferDate: D(transfer),
    oneHouseExemptionProviso: { reason, departureDate: D(departure) },
  } as Parameters<typeof resolveExemptionProviso>[0]);

describe("O-1 출국 후 양도", () => {
  it("출국 전 양도는 미적용(나·다목 공통)", () => {
    expect(judge("2024-12-16", "2026-09-15", "2025-11-17")).toBeNull();
    expect(judge("2004-04-13", "2005-03-15", "2005-01-21", "overseas_migration")).toBeNull();
    expect(judge("2004-04-13", "2005-01-22", "2005-01-21", "overseas_migration")).toBeNull();
  });
  it("출국일 당일·출국 후 양도는 적용", () => {
    expect(judge("2004-04-13", "2005-01-21", "2005-01-21", "overseas_migration")).toBe("both");
    expect(judge("2024-12-16", "2025-03-03", "2025-11-17")).toBe("both");
  });
});

describe("O-2 · O-3 출국일 현재 보유(2008.2.22. 이후 양도분)", () => {
  it("출국 뒤 취득한 주택은 미적용 · 출국일 당일 취득은 적용", () => {
    expect(judge("2025-03-17", "2024-11-15", "2026-06-15")).toBeNull();
    expect(judge("2024-11-15", "2024-11-15", "2026-06-15")).toBe("both");
  });
  it("경계 — 2008-02-22 양도는 요건 적용, 2008-02-21 양도는 요건 전", () => {
    expect(judge("2007-06-01", "2007-03-01", "2008-02-22")).toBeNull();
    expect(judge("2007-06-01", "2007-03-01", "2008-02-21")).toBe("both");
  });
});

describe("O-4 출국일부터 2년", () => {
  it("만료일(평일)까지 적용 · 다음 날 미적용", () => {
    // 출국 2023-06-14(수) → 만료 2025-06-14(토) → 민법 §161 → 2025-06-16(월)
    expect(judge("2020-01-10", "2023-06-14", "2025-06-16")).toBe("both");
    expect(judge("2020-01-10", "2023-06-14", "2025-06-17")).toBeNull();
  });
});
