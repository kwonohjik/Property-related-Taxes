/**
 * anchor: 부수토지 장특공제는 **표1(토지 전체보유기간)과 표2(부수토지 보유기간) 중 큰 것**
 *         — 「소득세법 기본통칙 95-0…1」 (F11 잔여 축 해소, 2026-09-02)
 *
 * ── 근거 (실측) ────────────────────────────────────────────────────
 * [통칙] **소득세법 기본통칙 95-0…1 【주택부수토지가 주택보다 보유기간이 긴 경우】**
 *        (조문번호 이동 **2024.03.15.** · taxlaw.nts.go.kr 본문 실측)
 *
 *   > 「소득세법」제95조제2항을 적용할 때 1세대1주택에 딸린 토지를 양도하는 경우로서
 *   >  주택보다 보유기간이 오래된 주택 부수토지에 대한 장기보유특별공제는 **그 토지의
 *   >  전체보유기간**에 따른 같은 항 **표1의 공제율**과 **주택 부수토지로서의 보유기간**에
 *   >  따른 같은 항 **표2의 공제율** 중 **큰 공제율**을 적용한다.
 *
 *   같은 취지 예규: 기획재정부 **재산세제과-1183**(2010.12.10.) 「주택부수토지가 주택보다
 *   보유기간이 오래된 경우」(문서번호 NTS 확인).
 *
 * [법문] §95② 단서는 「1세대 1주택(**이에 딸린 토지를 포함한다**)에 해당하는 자산」에 표2를
 *        적용하고, §95④는 「**제2항에서 규정하는** 자산의 보유기간은 그 자산의 취득일부터
 *        양도일까지」로 표1·표2를 **함께** 규율한다.
 *
 * ── 왜 미뤄져 있었나, 무엇이 그것을 풀었나 ────────────────────────
 * F11(2026-08-13)은 표1 축과 3년 게이트만 토지 축으로 고치고 표2는 「예규가 표2 **단일축**
 * 시기(~2018) 것이라 현행 2축 표2(보유분+거주분)에 max를 어떻게 대입할지 **미확정**」으로
 * 남겨 뒀다. **현행 통칙이 그 두 전제를 동시에 무너뜨린다**:
 *   ⓐ 통칙은 **2024.03.15 현행**이다 — 2축 표2 시행(2020) 이후에도 살아 있다.
 *   ⓑ 「표2의 **공제율**」을 통째로 지목하므로 **보유분/거주분 분해가 필요 없다**.
 *
 * ── 종전 동작이 만들던 부조리 ──────────────────────────────────────
 * either/or였기 때문에 §95② **단서**(1세대1주택 **혜택** 규정)가 본문 표1보다 **못 받는**
 * 결과를 냈다 — 토지 10년 보유 · 주택 2년 6개월 · 거주 2년이면 표2가 3년 게이트에 걸려
 * **0%**인데, 1세대1주택이 아니었다면 표1로 18%를 받는다.
 *
 * ⚠️ **max를 「토지가 더 긴 경우」로 게이트하지 않는다** — 표2 보유분 4%/년 vs 표1 2%/년이라
 *    `landYears <= houseYears`면 표2가 구조적으로 이겨 max가 no-op이다(A-6·A-7이 고정).
 *    무조건 max = 통칙 게이트와 **동치**이고 축이 하나 줄어든다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/**
 * 일괄양도 companion 부수토지 — 1세대1주택 · 양도 9억 / 취득 1억 / 양도일 2024-06-01.
 * @param acq       토지 취득일 (표1 축)
 * @param houseMonths primary 주택 보유개월 (표2 보유분 축)
 * @param residMonths 거주개월 (표2 거주분 축 + 표2 대상 판정)
 */
function companionLand(acq: string, houseMonths: number, residMonths: number): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    landNature: "appurtenant_to_housing",
    transferPrice: 900_000_000,
    acquisitionPrice: 100_000_000,
    acquisitionDate: D(acq),
    transferDate: D("2024-06-01"),
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: residMonths,
    primaryContextForCompanionRate: {
      propertyType: "housing",
      holdingMonths: houseMonths,
      buildingFootprintArea: 100,
      isUrbanArea: true,
    },
  });
}

const lthdStep = (r: ReturnType<typeof calculateTransferTax>) =>
  r.steps?.find((s) => s.label === "장기보유특별공제");

describe("부수토지 LTHD — 표1 ↔ 표2 max (기본통칙 95-0…1)", () => {
  it("A-1: 🔴 토지 20년 · 주택 3년 · 거주 3년 → 표1 30%가 표2 24%를 이긴다", () => {
    const r = calculateTransferTax(companionLand("2004-06-01", 36, 36), rates);
    // 종전(either/or): 표2 24% · 공제 192,000,000 · 총세액 240,207,000
    expect(r.longTermHoldingRate).toBe(0.3);
    expect(r.longTermHoldingDeduction).toBe(240_000_000);
    expect(r.totalTax).toBe(218_031_000);
  });

  it("A-2: 🔴 거주 2년(표2 거주분 8%)이면 격차가 더 벌어진다 — 표2 20% vs 표1 30%", () => {
    const r = calculateTransferTax(companionLand("2004-06-01", 36, 24), rates);
    // 종전: 표2 20% · 총세액 254,991,000
    expect(r.longTermHoldingRate).toBe(0.3);
    expect(r.totalTax).toBe(218_031_000);
  });

  it("A-3: 🔑 부조리 케이스 — 주택 2년 6개월(표2 3년 게이트 미달)인데 토지는 9년 11개월", () => {
    /**
     * 종전에는 표2 축만 보아 **0%**였다. 1세대1주택이 아니었다면 표1로 18%를 받는 자산이
     * 「1세대1주택이라서」 공제를 통째로 잃는 구조였다.
     */
    const r = calculateTransferTax(companionLand("2014-06-01", 30, 24), rates);
    expect(r.longTermHoldingRate).toBe(0.18);
    expect(r.longTermHoldingDeduction).toBe(144_000_000);
    expect(r.totalTax).toBe(262_383_000); // 종전 328,911,000
  });

  it("A-4: 표2가 이기면 표2 그대로 — 토지 15년(표1 30%) · 주택 4년 · 거주 4년 → 32%", () => {
    const r = calculateTransferTax(companionLand("2009-06-01", 48, 48), rates);
    expect(r.longTermHoldingRate).toBe(0.32);
    expect(r.totalTax).toBe(210_639_000);
  });

  it("A-5: 표2 만점 구간은 불변 — 토지 20년 · 주택 10년 · 거주 10년 → 80%", () => {
    const r = calculateTransferTax(companionLand("2004-06-01", 120, 120), rates);
    expect(r.longTermHoldingRate).toBe(0.8);
    expect(r.totalTax).toBe(43_901_000);
  });

  it("A-6: 토지가 **짧으면** max는 no-op — 토지 3년 · 주택 14년 · 거주 10년 → 표2 80%", () => {
    const r = calculateTransferTax(companionLand("2021-06-01", 168, 120), rates);
    expect(r.longTermHoldingRate).toBe(0.8);
  });

  it("A-7: 토지 3년 미만(표1 0%)이어도 표2는 그대로 적용된다", () => {
    const r = calculateTransferTax(companionLand("2021-08-01", 168, 120), rates);
    expect(r.longTermHoldingRate).toBe(0.8);
  });

  it("A-8: 표2 **미대상**(1세대1주택 아님)은 종전대로 표1 단독 — F11 회귀 가드", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        landNature: "appurtenant_to_housing",
        transferPrice: 500_000_000,
        acquisitionPrice: 100_000_000,
        acquisitionDate: D("2021-06-01"), // 2년 11개월 → 3년 미달
        transferDate: D("2024-06-01"),
        isOneHousehold: false,
        householdHousingCount: 3,
        residencePeriodMonths: 0,
        primaryContextForCompanionRate: {
          propertyType: "housing",
          holdingMonths: 168, // 주택 14년 — 주택 축이면 28%가 잘못 부여된다
          buildingFootprintArea: 100,
          isUrbanArea: true,
        },
      }),
      rates,
    );
    expect(r.longTermHoldingRate).toBe(0);
    expect(r.totalTax).toBe(146_366_000);
  });
});

describe("부수토지 LTHD — 산식 표시가 공제율의 출처와 일치한다", () => {
  /**
   * 표시 계층(`transfer-tax-lthd-steps.ts`)은 `isOneHousehold && 1주택 && 거주 2년↑`이면
   * 표2 형식(「보유 N년×4% + 거주 M년×4%」)으로 쓴다. 표1이 이긴 경우 그 분해는 실제
   * 공제율과 맞지 않아 **자기모순**이 된다(실측 종전: 「보유 20년×4%=40% + 거주 3년×4%=12% = 30%」).
   * ⇒ `appurtenantTable1Applied` echo로 표시 축을 뒤집는다. **세액에는 영향이 없다.**
   */
  it("A-9: 표1이 이기면 표1 형식으로 쓴다 (분해 = 합)", () => {
    const s = lthdStep(calculateTransferTax(companionLand("2004-06-01", 36, 36), rates));
    expect(s?.formula).toContain("보유 19년×2% = 30% (30% 한도)");
    expect(s?.formula).toContain("보유기간 19년 11개월"); // 토지 축
    expect(s?.formula).not.toContain("거주"); // 표2 형식이 새어 나오면 안 된다
  });

  it("A-10: 표2가 이기면 표2 형식 그대로 (분해 = 합)", () => {
    const s = lthdStep(calculateTransferTax(companionLand("2009-06-01", 48, 48), rates));
    expect(s?.formula).toContain("보유 4년×4%=16% + 거주 4년×4%=16% = 32%");
    expect(s?.formula).toContain("보유기간 4년 0개월"); // 주택 축
  });
});
