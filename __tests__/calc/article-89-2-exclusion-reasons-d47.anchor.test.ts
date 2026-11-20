/**
 * D-47 · D-21 anchor — §89② 배제가 **확정**되면(모르는 사실이 아니라 날짜·보유 구성으로 정해진 불성립) 사유가 1개 이상 있다.
 *
 * 종전에는 세 갈래(1주택 + 권리 2개 · ③ 1년 요건 미충족 · 2주택 + 1권리)와 원조합원 §155① 불성립이 `{status:"excluded"}`만 남겨
 * 판정 메뉴는 「과세」만, 계산기는 경고 0건이었다(권리만 빼면 비과세인 사안). 사유는 상속 축 카드에만 있었고 그 라벨이 상속 전용이라,
 * 일반 배제는 새 id(`89-2-exclusion-unmet`)·라벨로 낸다. 상속 축은 종전 id(`89-2-inherited-general-house-unheld`) 그대로다.
 * 결론(과세)은 「소득세법」 §89②·「소득세법 시행령」 §156의2③대로 맞고 표시만 고친다 — 본체가 통과할 때(결론을 가를 때)만 낸다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { buildCaseForm, observeCase, type RulingCase } from "./one-house-rulings/harness";
import { handoff, runCalc, withToday } from "./one-house-pr6b/_helpers";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

type Right = Record<string, unknown>;
function menu(o: { houseAcq: string; transfer: string; rights: Right[]; houses?: Record<string, unknown>[] }): RulingCase {
  return {
    id: "d47", docNo: "-", docDate: "-", basis: "current", today: o.transfer, summary: "d47", bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: o.transfer,
      contractTotalPrice: "800000000",
      asset: { assetKind: "housing", acquisitionDate: o.houseAcq, residenceInputMode: "direct", residencePeriodMonthsAsset: "24" },
      houses: o.houses ?? [],
      presaleRights: o.rights.map((r, i) => ({ id: `r${i}`, region: "non_capital", ...r })),
    } as unknown as RulingCase["form"],
  };
}
const succ = (acq: string): Right => ({ type: "redevelopment_right", acquisitionDate: acq, memberOrigin: "successor" });
const GENERAL = "89-2-exclusion-unmet";

const CASES: [string, RulingCase][] = [
  ["1주택 + 권리 2개", menu({ houseAcq: "2018-01-15", transfer: "2024-06-14", rights: [succ("2022-03-15"), succ("2023-03-15")] })],
  ["③ 1년 요건 미충족(주택 2022-01-10 → 입주권 2022-06-01)", menu({ houseAcq: "2022-01-10", transfer: "2024-03-04", rights: [succ("2022-06-01")] })],
  [
    "2주택 + 1권리(E011 모양)",
    menu({
      houseAcq: "2020-05-10",
      transfer: "2023-10-15",
      houses: [{ id: "b", region: "non_capital", acquisitionDate: "2021-07-20", acquisitionOrigin: "general" }],
      rights: [succ("2022-09-25")],
    }),
  ],
  ["권리를 양도 주택보다 먼저 취득(D-40)", menu({ houseAcq: "2021-06-15", transfer: "2024-03-04", rights: [succ("2021-03-15")] })],
  [
    "원조합원 — 양도 주택을 기존주택보다 나중에 취득(D-21)",
    menu({
      houseAcq: "2020-06-01",
      transfer: "2024-06-14",
      rights: [{ type: "redevelopment_right", acquisitionDate: "2019-03-01", memberOrigin: "original_house", managementDisposalApprovalDate: "2021-01-01" }],
    }),
  ],
];

describe("D-47 · D-21 — 확정 불성립이면 사유 ≥ 1 (일반 배제 id·라벨)", () => {
  for (const [label, c] of CASES) {
    it(label, async () => {
      const o = await observeCase(c);
      expect(o.validationErrors).toEqual([]);
      expect(o.isExempt).toBe(false);
      expect(o.unmetExceptions).toContain(GENERAL);
      expect(o.unmetExceptions).not.toContain("89-2-inherited-general-house-unheld");
      expect((o.unmetReasons[GENERAL] ?? []).length).toBeGreaterThanOrEqual(1);
    });
  }

  it("대조 — 권리를 빼면 비과세(사유가 결론을 가른다)", async () => {
    const o = await observeCase(menu({ houseAcq: "2018-01-15", transfer: "2024-06-14", rights: [] }));
    expect(o.isExempt).toBe(true);
  });
});

describe("D-47 계산기 — 판정 메뉴에서 넘긴 같은 사실", () => {
  it("1주택 + 권리 2개 — 과세 + 「§89② 배제를 적용했습니다」 사유 경고(종전 0건)", async () => {
    const c = CASES[0][1];
    const k = await withToday(c.today, async () => {
      const t = handoff(buildCaseForm(c));
      t.assets[0] = { ...t.assets[0], fixedAcquisitionPrice: "300000000" };
      return runCalc(t);
    });
    expect(k.status).toBe(200);
    expect(k.result.isExempt).toBe(false);
    expect((k.result.warnings ?? []).filter((w: string) => w.includes("§89② 배제를 적용했습니다") && w.includes("2개 보유한 세대"))).toHaveLength(1);
  });
});
