/**
 * 자경농지 감면(조특법 §69) 연혁 행 + §133 한도 연혁 anchor
 *
 * 계획서: docs/00-pm/self-farming-history-rows.plan.md (Q-1 a · Q-2 a · Q-3 a, 2026-11-12)
 *
 * 구현 전: 규칙 행이 2023-01-01 한 건뿐이라 그 전 양도는 감면 0원 + «계산하지 못함» 고지였고, `buildLimitGroups`가 2024 이하를
 *         전 연도 연 1억·5개 과세기간 2억으로 두었다(조문과 어긋남).
 * 구현 후: 연혁 행 3개(2009-03-16 · 2016-01-01 · 2018-01-01)와 `buildLimitGroups` 연도 분기. 한도는 양도일 기준이다
 *         (부칙 제13560호·제15227호 제2조③ «시행 이후 양도하는 경우부터 적용»).
 *
 * | 양도일 | 연(과세기간별) | 5개 과세기간 합계 | 근거 |
 * |---|---|---|---|
 * | 2009-03-16 ~ 2015-12-31 | 2억 | 3억 | §133①1호 나목 · 2호 다목 |
 * | 2016-01-01 ~ 2017-12-31 | 1억 | 3억 | §133①1호(단일 열거) · 2호 다목 |
 * | 2018-01-01 ~ | 1억 | 2억 | §133①1호 · 2호 |
 * | ~ 2009-03-15 | 규칙 행 없음 — 고지 유지 | | 조회 범위 밖 |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { buildLimitGroups } from "@/lib/tax-engine/aggregate-reduction-limits";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const NOTICE = /자경농지 감면 규칙/;

/** 산출세액이 한도를 넘도록 양도가를 크게 잡는다(3억 이상 산출세액) */
function farmland(date: string, o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    transferPrice: 1_500_000_000,
    acquisitionPrice: 100_000_000,
    acquisitionDate: new Date("1995-01-01"),
    transferDate: new Date(date),
    residencePeriodMonths: 0,
    reductions: [{ type: "self_farming", farmingYears: 12 }],
    ...o,
  });
}
const run = (input: TransferTaxInput) => calculateTransferTax(input, loadFallbackTransferRates(input.transferDate));
const noticeCount = (r: { warnings?: string[] }) => (r.warnings ?? []).filter((w) => NOTICE.test(w)).length;

describe("SH-1 buildLimitGroups — 양도연도별 연·5개 과세기간 한도", () => {
  const sf = (y: number) => buildLimitGroups(y).find((g) => g.types.includes("self_farming"))!;
  it.each([
    [2009, 200_000_000, 300_000_000],
    [2013, 200_000_000, 300_000_000],
    [2015, 200_000_000, 300_000_000],
    [2016, 100_000_000, 300_000_000],
    [2017, 100_000_000, 300_000_000],
    [2018, 100_000_000, 200_000_000],
    [2024, 100_000_000, 200_000_000],
    [2025, 100_000_000, 200_000_000],
  ])("%i년 양도 — 연 %i · 5년 %i", (y, annual, five) => {
    expect([sf(y).annualLimit, sf(y).fiveYearLimit]).toEqual([annual, five]);
  });
  it("2025 전 단일 그룹은 자경·§77 계열이 한도를 공유한다(§133①1호 나목·다목에 §69와 §77이 같이 열거) — 2015 이전 §77도 연 2억·5년 3억", () => {
    const g = buildLimitGroups(2013).find((x) => x.types.includes("public_expropriation"))!;
    expect(g.types).toContain("self_farming");
    expect([g.annualLimit, g.fiveYearLimit]).toEqual([200_000_000, 300_000_000]);
    expect(g.fiveYearTypes).not.toContain("gb_designated_land"); // 5개 과세기간 열거에 §77의3 없음(종전과 같다)
  });
  it("2025 이후의 §77 계열 별도 그룹은 그대로", () => {
    expect(buildLimitGroups(2025)).toHaveLength(2);
    expect(buildLimitGroups(2024)).toHaveLength(1);
    expect(buildLimitGroups(2015)).toHaveLength(1);
  });
});

describe("SH-2 규칙 행 선택 + 단건 연 한도(이력 없음) — 경계 전후일", () => {
  it.each([
    ["2009-03-15", 0, 1],
    ["2009-03-16", 200_000_000, 0],
    ["2015-12-31", 200_000_000, 0],
    ["2016-01-01", 100_000_000, 0],
    ["2017-12-31", 100_000_000, 0],
    ["2018-01-01", 100_000_000, 0],
    ["2022-12-31", 100_000_000, 0],
    ["2023-01-01", 100_000_000, 0],
  ])("SH-2 %s: 감면 %i · 고지 %i건", (d, reduction, notices) => {
    const r = run(farmland(d));
    expect(r.reductionAmount).toBe(reduction);
    expect(noticeCount(r)).toBe(notices);
  });

  it("SH-2-b 산출세액이 한도 안이면 산출세액 전액 감면(100%) — 2013-06-01 · 2015-06-01", () => {
    for (const d of ["2013-06-01", "2015-06-01"]) {
      const r = run(farmland(d, { transferPrice: 800_000_000 }));
      expect(r.reductionAmount).toBe(r.calculatedTax);
      expect(r.reductionAmount).toBeGreaterThan(100_000_000); // 연 1억 한도였다면 잘렸을 구간
    }
  });
});

describe("SH-3 5개 과세기간 합계(이력 있음) — 양도연도의 시행본 한도를 쓴다", () => {
  const prior = (year: number) => [{ year, type: "self_farming", amount: 200_000_000 }];
  it.each([
    ["2015-12-31", 2013, 100_000_000], // 5년 3억 − 이력 2억
    ["2017-12-31", 2015, 100_000_000], // 5년 3억 − 이력 2억 (연 1억)
    ["2018-01-01", 2017, 0], // 5년 2억 − 이력 2억
    ["2023-06-01", 2022, 0],
  ])("SH-3 %s · 이력 %i년 2억 → 감면 %i", (d, y, reduction) => {
    expect(run(farmland(d, { priorReductionUsage: prior(y) })).reductionAmount).toBe(reduction);
  });
});

describe("SH-4 두 한도 출처의 일치 — 규칙 행 maxAmount ↔ buildLimitGroups(양도연도)", () => {
  // 단건·이력 없음은 규칙 행 maxAmount가, 이력 있음·다건은 buildLimitGroups가 연 한도를 자른다 — 어긋나면 경로마다 한도가 달라진다.
  it.each(Array.from({ length: 2024 - 2009 + 1 }, (_, i) => 2009 + i))("%i-06-01 양도 — 감면 상한 = buildLimitGroups 연 한도", (y) => {
    const group = buildLimitGroups(y).find((g) => g.types.includes("self_farming"))!;
    expect(run(farmland(`${y}-06-01`)).reductionAmount).toBe(group.annualLimit);
  });

  it("SH-4-b 시딩 스크립트가 쓰는 deductionRulesSchema를 통과한다(운영 DB 시딩 전 검증)", async () => {
    const { historicalSeeds } = await import("@/lib/tax-engine/data/transfer-rate-seed-historical");
    const { deductionRulesSchema } = await import("@/lib/tax-engine/schemas/rate-table.schema");
    const rows = historicalSeeds.filter((s) => s.sub_category === "self_farming");
    expect(rows.map((r) => r.effective_date)).toEqual(["2009-03-16", "2016-01-01", "2018-01-01"]);
    for (const r of rows) expect(deductionRulesSchema.safeParse(r.deduction_rules).success).toBe(true);
  });
});
