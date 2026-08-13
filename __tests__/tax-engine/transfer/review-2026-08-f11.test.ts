/**
 * F11 — 부수토지 일체과세(L-1b)의 **표1 공제율·3년 진입요건**이 주택이 아니라 토지 자신의
 * 보유기간을 보아야 한다.
 *
 * 근거: 「소득세법」 §95④ 본문 「제2항에서 규정하는 자산의 보유기간은 **그 자산의 취득일부터
 * 양도일까지**로 한다」. 같은 항 **단서의 예외는 §97의2①(이월과세)와 가업상속공제 적용비율분
 * 둘로 한정 열거**돼 부수토지 예외가 없다. §95②의 진입요건 「보유기간이 3년 이상인 것」도 같은 정의다.
 *
 * 일체과세의 사정거리: §104①2호 괄호 「주택(이에 딸린 토지…를 포함한다. **이하 이 항에서 같다**)」는
 * 정의확장을 **제104조 제1항 내부로 한정**한다 ⇒ 세율 축 근거를 §95(장특) 보유기간으로 전이할 수 없다.
 *
 * ⚠️ **표2(1세대1주택) 축은 이번 범위 밖이다.** 기획재정부 재산세제과-1183(2010.12.10)의
 *    「표1(토지 전체보유기간) vs 표2(주택 부수토지 보유기간) 중 큰 공제율」 규칙은 표2가 보유
 *    **단일축**이던 시기(~2018) 해석이라, 현행 2축 표2(보유분+거주분)에 어떻게 대입할지가 미확정이다
 *    (nts 48건·6건, 조세심판원 5건 전수 조회 결과 부존재). ⇒ 표1 축·3년 게이트만 좁게 고친다.
 *
 * 기대값은 전부 엔진을 실제로 호출해 관측한 값이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 일괄양도 companion 부수토지 — 양도 5억 / 취득 1억 / 양도일 2024-06-01 */
const companionLand = (
  over: Partial<TransferTaxInput>,
  primaryHoldingMonths: number,
): TransferTaxInput =>
  baseTransferInput({
    propertyType: "land",
    landNature: "appurtenant_to_housing",
    transferPrice: 500_000_000,
    acquisitionPrice: 100_000_000,
    acquisitionDate: new Date("2021-06-01"),
    transferDate: new Date("2024-06-01"),
    isOneHousehold: false,
    householdHousingCount: 3,
    residencePeriodMonths: 0,
    primaryContextForCompanionRate: {
      propertyType: "housing",
      holdingMonths: primaryHoldingMonths,
      buildingFootprintArea: 100,
      isUrbanArea: true,
    },
    ...over,
  });

describe("F11 — 부수토지 LTHD 표1·3년 게이트는 토지 자신의 보유기간 축이다", () => {
  it("토지 2년 11개월 · 주택 14년 → 표1 미적용 (주택 축이면 28% 공제가 잘못 부여됐다)", () => {
    const r = calculateTransferTax(companionLand({}, 168), rates);

    // 수정 전: rate 0.28 · 공제 112,000,000 · 총세액 97,405,000 (48,961,000 과소과세)
    expect(r.longTermHoldingRate).toBe(0);
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.calculatedTax).toBe(133_060_000);
    expect(r.localIncomeTax).toBe(13_306_000);
    expect(r.totalTax).toBe(146_366_000);
  });

  it("산식 표시가 채택 축과 일치한다 (자기모순 제거)", () => {
    const r = calculateTransferTax(companionLand({}, 168), rates);
    const formula = r.steps.find((s) => s.label === "장기보유특별공제")?.formula;
    // 수정 전: "400,000,000 × 28% | 보유 2년×2% = 28% (30% 한도) | 보유기간 2년 11개월"
    expect(formula).toBe(
      "400,000,000 × 0% | 보유 2년×2% = 0% (30% 한도) | 보유기간 2년 11개월",
    );
  });

  it("토지 10년 · 주택 2년 → 토지 축으로 표1이 살아난다 (반대 방향)", () => {
    const r = calculateTransferTax(
      companionLand({ acquisitionDate: new Date("2014-06-01") }, 24),
      rates,
    );
    // 수정 전: 주택 24개월 < 36 게이트에 걸려 rate 0 · 총세액 146,366,000
    expect(r.longTermHoldingRate).toBeCloseTo(0.18, 10);
    expect(r.longTermHoldingDeduction).toBe(72_000_000);
    expect(r.calculatedTax).toBe(104_260_000);
    expect(r.totalTax).toBe(114_686_000);
  });

  it("표2(1세대1주택) 축은 종전대로 주택 보유기간을 쓴다 (범위 밖 — 미결 max 규칙)", () => {
    const r = calculateTransferTax(
      companionLand(
        {
          acquisitionDate: new Date("2021-01-01"), // 토지 3년 4개월
          isOneHousehold: true,
          householdHousingCount: 1,
          residencePeriodMonths: 30,
        },
        30, // 주택 2년 6개월 → 표2 3년 미달
      ),
      rates,
    );
    // 토지가 3년을 넘어도 표2 대상이면 주택 축을 유지하므로 공제 0 — 현행 유지 확인.
    expect(r.longTermHoldingRate).toBe(0);
    expect(r.longTermHoldingDeduction).toBe(0);
  });
});
