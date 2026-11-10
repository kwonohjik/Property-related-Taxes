/**
 * anchor -- 분자 > 0 · 분모 <= 0 은 감면율과 관계없이 양도소득금액 전액 차감 (2026-11-10 사용자 결정)
 *
 * 논리: 분모 -> 0+ 극한(5년간 발생분 -> 무한대)의 연장. 법규과-1181(서면-2021-법규재산-8218)대로 «감면율 × 5년간 발생분» 뒤
 *   «공제액이 과세대상소득금액을 초과하면 초과금액은 없는 것» 상한 -> min(무한대 × 율, 양도소득금액) = 양도소득금액.
 *   감면율 100% 미만에서 분모 <= 0을 직접 다룬 해석례는 없다(확인 필요). 종전: 분모 0·-1 = 양도소득금액 × 감면율, 분모 +1 = 전액 -> 절벽.
 * 기대값은 엔진 출력을 보기 전에 손계산했다: 차감액 = 양도소득금액, 세액은 리뷰 US-12 mock 실측의 «전액 차감» 값(5,137,000).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const mk = (reductions: unknown[], over: Record<string, unknown>) =>
  calculateTransferTax(
    baseTransferInput({ transferPrice: 400_000_000, acquisitionPrice: 250_000_000, householdHousingCount: 2, reductions, ...over } as never),
    makeMockRates(),
  );
const TRIO = [99_999_999, 100_000_000, 100_000_001]; // 취득시 1억 기준 분모 -1 / 0 / +1

describe("§98의6 1호(50%) -- 취득 2011-07-01 · 양도 2021-09-01 · 양도소득금액 120,000,000", () => {
  const O = { acquisitionDate: D("2011-07-01"), transferDate: D("2021-09-01") };
  const R = (tr: number, y5 = 150_000_000) => ({
    type: "unsold_98_6" as const, hoType986: "seller_rented" as const, stdPriceSumAtBase986: 550_000_000, floorAreaSqm986: 84.5,
    isUnsoldAfterCompletion986: true, isFirstContract986: true, isNotOccupiedAfterCompletion986: true, isNotRecontract986: true, sellerRented2Years986: true,
    standardPriceAtAcquisition986: 100_000_000, standardPriceAt5Years986: y5, standardPriceAtTransfer986: tr,
  });
  it("분모 -1·0·+1 모두 차감 120,000,000 · 총 5,137,000 (종전 분모 0·-1은 60,000,000 차감)", () => {
    for (const tr of TRIO) {
      const r = mk([R(tr)], O);
      expect(r.unsold986Detail!.reducibleTransferIncome, String(tr)).toBe(120_000_000);
      expect(r.totalTax, String(tr)).toBe(5_137_000);
    }
    expect(mk([R(100_000_000)], O).unsold986Detail!.signCase).toBe("pos_zero");
    expect(mk([R(99_999_999)], O).unsold986Detail!.signCase).toBe("pos_neg");
  });
  it("산식·고지: 분모 0·-1에 실제와 다른 «60,000,000» 문구가 없고 확인 필요가 있다", () => {
    for (const tr of [99_999_999, 100_000_000]) {
      const steps = mk([R(tr)], O).unsold986Detail!.formulaSteps;
      const joined = steps.map((x) => x.formula ?? "").join(" | ");
      expect(joined).toContain("확인 필요");
      expect(joined).toContain("법규과-1181");
      expect(joined).not.toContain("60,000,000");
      expect(steps[steps.length - 1].value).toBe(120_000_000);
    }
  });
  it("분자 <= 0은 종전대로 0 (분자 0 · 분모 0)", () => {
    expect(mk([R(100_000_000, 100_000_000)], O).unsold986Detail!.reducibleTransferIncome).toBe(0);
  });
  it("(+,+) 비율 <= 1 구간 불변: 발생분 = 120,000,000 × 34/44 = 92,727,272 -> × 50% = 46,363,636", () => {
    // 분자 134M-100M = 34M, 분모 144M-100M = 44M. 곱 먼저: 120,000,000 × 34,000,000 / 44,000,000 = 92,727,272(절사), × 50% = 46,363,636.
    expect(mk([R(144_000_000, 134_000_000)], O).unsold986Detail!.reducibleTransferIncome).toBe(46_363_636);
  });
});

describe("§98의7(100%) -- 값 불변: 분모 -1·0·+1 모두 전액 246,000,000 · 14,518,000", () => {
  it("회귀", () => {
    for (const tr of [199_999_999, 200_000_000, 200_000_001]) {
      const r = mk([{
        type: "unsold_98_7" as const, contractDate987: D("2012-10-15"), acquisitionPrice987: 550_000_000,
        isUnsoldAtCutoff987: true, isFirstContract987: true, isNotOccupiedAtContract987: true, isNotRecontract987: true,
        standardPriceAtAcquisition987: 200_000_000, standardPriceAt5Years987: 300_000_000, standardPriceAtTransfer987: tr,
      }], { acquisitionDate: D("2013-01-15"), transferDate: D("2022-08-01"), transferPrice: 800_000_000, acquisitionPrice: 500_000_000 });
      expect(r.unsold987Detail!.reducibleTransferIncome, String(tr)).toBe(246_000_000);
      expect(r.totalTax, String(tr)).toBe(14_518_000);
    }
  });
});
