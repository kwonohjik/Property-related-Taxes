/**
 * anchor — §99의3 5년 후 안분: 양도시 기준시가 미입력 차단 (D3-01)
 *
 * 결함: `new-99-3.ts` STEP 3의 5년 후 분기가 형제 조문(`new-99.ts:257-263`·`unsold-98-8.ts`·
 * `unsold-hybrid.ts`·`new-99-4.ts`)과 달리 `MISSING_STD_PRICE` 가드를 갖지 않아,
 * 양도시 기준시가가 0(미입력)이면 분모가 음수가 되어 `pos_neg` → **양도소득금액 전액 감면**으로
 * 오분류된다. 결과 화면은 이를 「부동산-525(2010.4.7.) 해석」으로 제시한다.
 *
 * 도달성: `lib/calc/transfer-tax-api.ts:416-425`가 `standardPriceAtTransfer`를 **환산(isEstimated)
 * 모드에서만** 전송하므로, 실지거래가·감정·매매사례 모드의 §99의3 5년 후 양도는 기본으로 이 경로를 탄다.
 *
 * ⚠️ 「분모 음수」 자체는 결함이 아니다 — 기준시가가 실제로 하락한 경우 조특령 §99의3②2호에
 *    대한 부동산-525 해석이 전액 감면을 인정한다. 차단 대상은 **미입력(0 이하)** 뿐이다.
 */
import { describe, it, expect } from "vitest";
import { evaluateNew993 } from "@/lib/tax-engine/transfer-reductions/new-99-3";

const D = (s: string) => new Date(`${s}T00:00:00`);

const BASE = {
  transferDate: D("2024-06-30"),
  acquisitionDate: D("2003-06-30"),
  contractDate: D("2002-01-10"),
  transferIncome: 800_000_000,
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAt5Years: 300_000_000,
  wholePropertyTransferPrice: 900_000_000,
  exclusiveAreaSqm: 84,
  region: "outside_speculation" as const,
  isResident: true,
  isHousingConstructionBusiness: false,
  acquisitionType: "from_builder" as const,
  calculatedTaxBeforeReduction: 215_010_000,
  calculatedTaxAfterReduction: 0,
};

describe("§99의3 5년 후 안분 — 양도시 기준시가 가드", () => {
  it("정상 입력(6억)은 조특령 §99의3②2호 안분 25% → 감면 2억", () => {
    const r = evaluateNew993({ ...BASE, standardPriceAtTransfer: 600_000_000 });
    expect(r.isEligible).toBe(true);
    expect(r.fiveYearRatio).toBe(0.25);
    expect(r.reducibleTransferIncome).toBe(200_000_000);
    expect(r.signCase).toBe("all_positive");
  });

  it("양도시 기준시가 미입력(0)은 MISSING_STD_PRICE로 차단한다 — 전액 감면 금지", () => {
    const r = evaluateNew993({ ...BASE, standardPriceAtTransfer: 0 });
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons?.map((x) => x.code)).toContain("MISSING_STD_PRICE");
    expect(r.reducibleTransferIncome).toBe(0);
  });

  it("취득시 기준시가 미입력(0)도 같은 코드로 차단한다", () => {
    const r = evaluateNew993({
      ...BASE,
      standardPriceAtAcquisition: 0,
      standardPriceAtTransfer: 600_000_000,
    });
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons?.map((x) => x.code)).toContain("MISSING_STD_PRICE");
  });

  it("5년시점 기준시가 미입력(0)도 같은 코드로 차단한다", () => {
    const r = evaluateNew993({
      ...BASE,
      standardPriceAt5Years: 0,
      standardPriceAtTransfer: 600_000_000,
    });
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons?.map((x) => x.code)).toContain("MISSING_STD_PRICE");
  });

  it("기준시가가 실제로 하락한 경우(양도시 1억 < 취득시 2억)는 차단하지 않는다 — 부동산-525 해석 유지", () => {
    const r = evaluateNew993({ ...BASE, standardPriceAtTransfer: 100_000_000 });
    expect(r.isEligible).toBe(true);
    expect(r.signCase).toBe("pos_neg");
    expect(r.reducibleTransferIncome).toBe(800_000_000);
  });

  it("5년 이내 양도는 기준시가를 보지 않는다 — 가드가 정상 경로를 막지 않는다", () => {
    const r = evaluateNew993({
      ...BASE,
      transferDate: D("2007-06-29"),
      standardPriceAtTransfer: 0,
      standardPriceAt5Years: 0,
    });
    expect(r.isEligible).toBe(true);
    expect(r.reducibleTransferIncome).toBe(800_000_000);
    expect(r.signCase).toBe("within_5_years");
  });
});
