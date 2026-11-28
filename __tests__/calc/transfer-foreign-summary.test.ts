/**
 * ⑥ 국외 부동산 사이드바 합계 — 순수 함수 `computeForeignRealEstateSummary`
 *
 * 계산 전 = 입력으로 계산 가능한 환산만(0·미입력 제외) / 계산 후 = 엔진 값. 환산은 엔진 leaf(`tryToKrw`)와 같은 값이다.
 */
import { describe, it, expect } from "vitest";
import { computeForeignRealEstateSummary } from "@/lib/stores/transfer-foreign-summary";
import { calculateForeignRealEstateTransferTax as calc } from "@/lib/tax-engine/foreign-realestate";
import { ratesAt, k1Input, ftax, aAsset, bAsset } from "../tax-engine/foreign-realestate/_fixtures";
import { gainAsset2, k1Asset } from "./_foreign-form-fixture";
import { makeDefaultForeignAsset } from "@/lib/stores/calc-wizard-form-foreign";

const form = (...assets: ReturnType<typeof k1Asset>[]) => ({ foreignAssets: assets });

describe("계산 전 — 입력 환산", () => {
  it("K-1: 양도가액 990,000,000 · 취득가액 520,000,000 · 필요경비(양도비) 33,000,000", () => {
    const s = computeForeignRealEstateSummary(form(k1Asset()), null);
    expect(s.rows).toHaveLength(1);
    expect(s.totalTransferKrw).toBe(990_000_000);
    expect(s.totalAcquisitionKrw).toBe(520_000_000);
    expect(s.totalExpenseKrw).toBe(33_000_000);
    expect(s.hasResult).toBe(false);
  });

  it("결과 전에는 세액 항목이 모두 null (0원·null은 표시하지 않는다)", () => {
    const s = computeForeignRealEstateSummary(form(k1Asset()), null);
    for (const v of [s.capitalGainTotal, s.incomeAmountTotal, s.basicDeduction, s.taxBase, s.calculatedTax, s.foreignTaxCreditApplied, s.localIncomeTax, s.totalTax]) {
      expect(v).toBeNull();
    }
  });

  it("빈 카드는 모두 0 — 환율이 비면 환산하지 않는다(환율 fallback 없음)", () => {
    const s = computeForeignRealEstateSummary(form(makeDefaultForeignAsset()), null);
    expect(s.totalTransferKrw + s.totalAcquisitionKrw + s.totalExpenseKrw).toBe(0);
    const noRate = computeForeignRealEstateSummary(form(k1Asset({ transferRate: "", costRows: [] })), null);
    expect(noRate.totalTransferKrw).toBe(0);
    expect(noRate.totalAcquisitionKrw).toBe(520_000_000); // 취득가액은 입력 완료 — 계산 가능한 것만 보인다
  });

  it("환산할 수 없는 값(환율 0·음수 금액)은 0으로 두고 던지지 않는다", () => {
    const s = computeForeignRealEstateSummary(form(k1Asset({ transferRate: "0", acquisitionAmount: "-5" })), null);
    expect(s.totalTransferKrw).toBe(0);
    expect(s.totalAcquisitionKrw).toBe(0);
  });

  it("필요경비 = 자본적지출 + 양도비의 환산 합 · 2건은 건별 행 + 합계", () => {
    const row = { date: "2026-07-10", amountForeign: "1000", exchangeRate: "1100" };
    const s = computeForeignRealEstateSummary(form(k1Asset({ capitalRows: [row] }), gainAsset2()), null);
    expect(s.rows.map((r) => r.expenseKrw)).toEqual([34_100_000, 0]);
    expect(s.rows.map((r) => r.label)).toEqual(["국외자산 1", "국외자산 2"]);
    expect(s.totalTransferKrw).toBe(990_000_000 + 240_000_000);
  });

  it("외화 소수 4자리 환산도 엔진 leaf와 같다(floor 1회 — 인라인 복제 없음)", () => {
    const s = computeForeignRealEstateSummary(form(k1Asset({ transferAmount: "1234.5678", transferRate: "1234.5678" })), null);
    expect(s.totalTransferKrw).toBe(Math.floor(1234.5678 * 1234.5678)); // 1,524,138 — 엔진 `toKrw`와 동일 값은 별도 엔진 테스트가 고정
  });
});

describe("계산 후 — 엔진 값", () => {
  const r = calc(k1Input(), ratesAt("2026-07-10"));

  it("K-1: 양도차익 437,000,000 · 기본공제 2,500,000 · 과세표준 434,500,000 · 산출세액 147,860,000 · 지방소득세 14,786,000 · 총 162,646,000", () => {
    const s = computeForeignRealEstateSummary(form(k1Asset()), r);
    expect(s.hasResult).toBe(true);
    expect(s.notLiable).toBe(false);
    expect(s.capitalGainTotal).toBe(437_000_000);
    expect(s.incomeAmountTotal).toBe(437_000_000);
    expect(s.basicDeduction).toBe(2_500_000);
    expect(s.taxBase).toBe(434_500_000);
    expect(s.calculatedTax).toBe(147_860_000);
    expect(s.localIncomeTax).toBe(14_786_000);
    expect(s.totalTax).toBe(162_646_000);
    expect(s.foreignTaxCreditApplied).toBeNull(); // 외국납부세액 없음 — 0은 숨긴다
  });

  it("행의 환산액도 엔진 값(입력과 같지만 출처가 엔진)", () => {
    const s = computeForeignRealEstateSummary(form(k1Asset()), r);
    expect(s.rows[0]).toMatchObject({ transferKrw: 990_000_000, acquisitionKrw: 520_000_000, expenseKrw: 33_000_000 });
  });

  it("외국납부세액 세액공제가 있으면 그 공제액이 보인다", () => {
    const withFtc = calc(k1Input({ foreignTax: { method: "credit", items: [ftax("a1", 10_000, "2026-08-01", 1_000)] } }), ratesAt("2026-07-10"));
    const s = computeForeignRealEstateSummary(form(k1Asset()), withFtc);
    expect(s.foreignTaxCreditApplied).toBe(10_000_000);
    expect(s.totalTax).toBe(162_646_000 - 10_000_000 - 1_000_000);
  });

  it("거주 5년 미만: notLiable · 세액 항목 전부 null · 행은 참고로 남는다", () => {
    const nl = calc(k1Input({ domesticResidenceYears: 3 }), ratesAt("2026-07-10"));
    const s = computeForeignRealEstateSummary(form(k1Asset()), nl);
    expect(s.notLiable).toBe(true);
    expect(s.taxBase).toBeNull();
    expect(s.totalTax).toBeNull();
    expect(s.rows[0].transferKrw).toBe(990_000_000);
  });

  it("2건: 엔진 합계(기본공제 1회) · 행은 건별", () => {
    const two = calc(k1Input({ assets: [aAsset(), bAsset()] }), ratesAt("2026-07-10"));
    const s = computeForeignRealEstateSummary(form(k1Asset(), gainAsset2()), two);
    expect(s.rows).toHaveLength(2);
    expect(s.basicDeduction).toBe(2_500_000);
    expect(s.incomeAmountTotal).toBe(537_000_000);
  });

  it("차손 자산 혼재: 양도차익 합계 417,000,000(차손 포함) · 양도소득금액 437,000,000(차손 0) · hasLossAsset", () => {
    const mixed = calc(k1Input({ assets: [aAsset(), bAsset({}, 200_000, 1_200)] }), ratesAt("2026-07-10"));
    const s = computeForeignRealEstateSummary(form(k1Asset(), gainAsset2()), mixed);
    expect(s.hasLossAsset).toBe(true);
    expect([s.capitalGainTotal, s.incomeAmountTotal, s.basicDeduction, s.taxBase, s.calculatedTax]).toEqual([417_000_000, 437_000_000, 2_500_000, 434_500_000, 147_860_000]);
    expect(computeForeignRealEstateSummary(form(k1Asset()), r).hasLossAsset).toBe(false);
    expect(computeForeignRealEstateSummary(form(k1Asset()), null).hasLossAsset).toBe(false);
  });

  it("같은 입력은 같은 결과(순수 — useMemo 캐시가 유효하다)", () => {
    const f = form(k1Asset());
    expect(computeForeignRealEstateSummary(f, r)).toEqual(computeForeignRealEstateSummary(f, r));
  });
});
