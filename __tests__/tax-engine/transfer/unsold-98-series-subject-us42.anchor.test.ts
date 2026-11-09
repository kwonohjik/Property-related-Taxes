// US-42 anchor — §98의3·§98의5·§98의6 적용 주체(사용자 결정 2026-11-06 「확인 토글」 — D11-05 방식)
//
// 세 조문 모두 「거주자 또는 「소득세법」 제120조에 따른 국내사업장이 없는 비거주자」만 대상이다
// (§98의3① MST 93520 · §98의5① MST 105139 · §98의6① MST 113587 — 리뷰 US-42 원문 확인).
// 종전에는 국내사업장 있는 비거주자를 막을 입력이 없었다: §98의3은 2지선다, §98의5·§98의6은 주체 필드 자체가 없어
// 모두 감면을 받았다(리뷰 실측 §98의5 5년 경과 59,565,000 과소).
// 근거: docs/reviews/unsold-98-series-review-2026-11.md US-42.
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { normalizeRentalAndSplitFields } from "@/lib/stores/calc-wizard-asset-migrate-rental-split";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";

const rates = makeMockRates();
type Reductions = TransferTaxInput["reductions"];

/** P3-8 사실관계 — 적격이면 감면 63,544,000 · 총부담 17,474,600 */
const UNSOLD_985 = {
  type: "unsold_98_5" as const,
  contractDate985: new Date("2010-06-15"),
  priceReductionRatePct985: 15,
  isNonCapitalUnsoldAtCutoff985: true,
  isFirstContract985: true,
  isNotOccupiedAtContract985: true,
  isNotRecontract985: true,
  standardPriceAtAcquisition985: 200_000_000,
  standardPriceAt5Years985: 300_000_000,
  standardPriceAtTransfer985: 400_000_000,
};
const run = (reductions: Reductions) =>
  calculateTransferTax(
    baseTransferInput({
      transferPrice: 800_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2011-06-15"),
      transferDate: new Date("2016-01-01"),
      householdHousingCount: 2,
      reductions,
    }),
    rates,
  );

describe("US-42 엔진", () => {
  it("S-1: 🔴 §98의5 주체 토글 해제 → NOT_ELIGIBLE_SUBJECT · 감면 미선택과 같은 세액", () => {
    const r = run([{ ...UNSOLD_985, isEligibleSubject985: false }] as Reductions);
    expect(r.unsold985Detail?.isEligible).toBe(false);
    expect(r.unsold985Detail?.ineligibleReasons.map((x) => x.code)).toContain("NOT_ELIGIBLE_SUBJECT");
    expect(r.totalTax).toBe(run([]).totalTax);
  });

  it("S-2: 대조군 — 토글 켜짐·미제공(옛 직접 API)은 P3-8 그대로", () => {
    for (const red of [{ ...UNSOLD_985, isEligibleSubject985: true }, UNSOLD_985]) {
      const r = run([red] as Reductions);
      expect(r.reductionAmount).toBe(63_544_000);
      expect(r.totalTax).toBe(17_474_600);
    }
  });

  it("S-3: §98의6·§98의3 — 주체 아님이면 부적격 사유에 NOT_ELIGIBLE_SUBJECT", async () => {
    const { evaluateUnsold986, evaluateUnsold983 } = await import("@/lib/tax-engine/transfer-reductions/unsold-hybrid-p3");
    const r986 = evaluateUnsold986({ transferDate: new Date("2016-01-01"), acquisitionDate: new Date("2013-01-01"), isEligibleSubject: false, transferIncome: 100_000_000 });
    expect(r986.ineligibleReasons.map((x) => x.code)).toContain("NOT_ELIGIBLE_SUBJECT");
    const r983 = evaluateUnsold983({ transferDate: new Date("2014-01-01"), acquisitionDate: new Date("2009-06-01"), residencyType: "nonresident_with_pe", contractDate: new Date("2009-06-01"), transferIncome: 100_000_000 });
    expect(r983.ineligibleReasons.map((x) => x.code)).toContain("NOT_ELIGIBLE_SUBJECT");
    const ok983 = evaluateUnsold983({ transferDate: new Date("2014-01-01"), acquisitionDate: new Date("2009-06-01"), residencyType: "resident", contractDate: new Date("2009-06-01"), transferIncome: 100_000_000 });
    expect(ok983.ineligibleReasons.map((x) => x.code)).not.toContain("NOT_ELIGIBLE_SUBJECT");
  });
});

describe("US-42 배선 — ②③④⑫", () => {
  it("W-1: 기본값·옛 기록 보정은 true(법문이 상정하는 통상의 경우 — D11-05)", () => {
    expect((getReductionDefault("unsold_98_5") as { isEligibleSubject985: boolean }).isEligibleSubject985).toBe(true);
    expect((getReductionDefault("unsold_98_6") as { isEligibleSubject986: boolean }).isEligibleSubject986).toBe(true);
    const legacy: Record<string, unknown> = { reductions: [{ type: "unsold_98_5" }, { type: "unsold_98_6" }] };
    normalizeRentalAndSplitFields(legacy);
    const [a, b] = legacy.reductions as Record<string, unknown>[];
    expect(a.isEligibleSubject985).toBe(true);
    expect(b.isEligibleSubject986).toBe(true);
  });

  it("W-2: ④ 해제값이 본문에 실리고 ⑫가 strip하지 않는다", () => {
    const form = { ...getReductionDefault("unsold_98_5"), isEligibleSubject985: false } as never;
    const [body] = toEngineReductions([form], "purchase") as unknown as Record<string, unknown>[];
    expect(body.isEligibleSubject985).toBe(false);
    const parsed = reductionSchema.parse({ ...body, contractDate985: undefined }) as Record<string, unknown>;
    expect(parsed.isEligibleSubject985).toBe(false);
    const p986 = reductionSchema.parse({ type: "unsold_98_6", isEligibleSubject986: false }) as Record<string, unknown>;
    expect(p986.isEligibleSubject986).toBe(false);
    const p983 = reductionSchema.parse({ type: "unsold_98_3", residencyType983: "nonresident_with_pe" }) as Record<string, unknown>;
    expect(p983.residencyType983).toBe("nonresident_with_pe");
  });
});
