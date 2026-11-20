/**
 * 2026-11 리뷰 I-07 — 판정 메뉴 거주 구간이 ④ → ⑫ → ⑭ → 엔진까지 온다(기한 말일 현재 거주를 정확히 센다).
 * 엔진 단위는 `__tests__/tax-engine/transfer/residence-intervals-deadline-i07.anchor.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";
import { buildCaseForm } from "./one-house-rulings/harness";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";

// 강남 2023-01-02 취득 · 신규(가평 · 비조정) 2024-06-03 · 양도 예정 2027-12-01 · 판정 기준일 2026-11-18
const form = (moveIn: string) => ({
  isOneHousehold: true,
  transferDate: "2027-12-01",
  contractTotalPrice: "800000000",
  asset: {
    assetKind: "housing",
    acquisitionDate: "2023-01-02",
    regionCode: "1168010100",
    residenceInputMode: "interval",
    residencePeriods: [{ moveInDate: moveIn, moveOutDate: "2027-11-30" }],
  },
  houses: [{ id: "new", acquisitionDate: "2024-06-03", regionCode: "4182025021", region: "capital", acquisitionOrigin: "general" }],
});

describe("I-07 판정 메뉴 → route — 거주 구간", () => {
  it("④ 구간 모드면 본문에 구간을 싣는다(직접 입력 모드는 싣지 않는다)", () => {
    const f = buildCaseForm(mkCase("2026-11-18", form("2025-12-01")));
    expect((buildOneHouseExemptionApiBody(f) as { residenceIntervals?: unknown }).residenceIntervals).toEqual([{ start: "2025-12-01", end: "2027-11-30" }]);
    const direct = buildCaseForm(mkCase("2026-11-18", { ...form("2025-12-01"), asset: { ...form("2025-12-01").asset, residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "24" } }));
    expect((buildOneHouseExemptionApiBody(direct) as { residenceIntervals?: unknown }).residenceIntervals).toBeUndefined();
  });
  it("말일 현재 18개월(2025-12-01 입주) → 처분 기한을 약속하지 않는다 · 26개월(2025-04-01) → 조건 없이 약속", async () => {
    const short = await observeRaw(mkCase("2026-11-18", form("2025-12-01")));
    expect(short.status, JSON.stringify(short.json).slice(0, 300)).toBe(200);
    expect(short.issues.filter((i: string) => i.startsWith("error"))).toEqual([]);
    expect(short.j.pending.map((p: { id: string }) => p.id)).not.toContain("155-1-disposal-deadline");
    const long = await observeRaw(mkCase("2026-11-18", form("2025-04-01")));
    const p = long.j.pending.find((x: { id: string }) => x.id === "155-1-disposal-deadline");
    expect(p).toBeDefined();
    expect(p.deadlineNote ?? "").not.toContain("확인할 수 없습니다");
  });
});
