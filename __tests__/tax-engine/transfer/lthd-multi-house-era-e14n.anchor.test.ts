/**
 * anchor E-14n: 「소득세법」 §95② — **2018.4.1. 전 양도분은 다주택이라는 이유로 장특을 빼지 않는다.**
 *
 * - 2018.1.15. 행위시법(MST 199742) §95② 괄호: 「제104조제3항에 따른 미등기양도자산은 제외한다」뿐.
 * - 2018.4.1. 시행분 괄호: 「제104조제3항에 따른 미등기양도자산과 **같은 조 제7항 각 호에 따른 자산**은 제외한다」.
 * - 법률 제15225호 부칙 제1조1호 「… 제95조제2항 각 표 외의 부분 본문 … 의 개정규정: 2018년 4월 1일」 ·
 *   제2조② 「이 법 중 양도소득에 관한 개정규정은 이 법 시행 이후 양도하는 자산으로부터 발생하는 소득분부터 적용한다」.
 * - 구간 상수는 `data/lthd-multi-house-exclusion-era.ts`(2012.1.1.~2018.3.31. = 배제 불가). 2012 전 구간은
 *   이 anchor가 판정하지 않는다(종전 동작 유지).
 *
 * 종전: 배제 분기(L-1 · 재개발 Step A.8)가 중과 **케이스**만 보고 시기를 보지 않아, 2018.1.1.~3.31. 조정지역 2주택 이상
 * 양도에 장특이 0이었다(중과 세율은 `resolveSurchargeAddonRate`가 이미 2018.4.1.부터만 붙였다).
 * 다건 route를 양도일 세율로 바꾸는 E-14n에서 드러났다 — 종전 다건은 과세기간 말일 행 덕에 일부 세대만 우연히 맞았다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRatesWithHouseEngine } from "../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "../transfer-tax/redevelopment/_helpers";

const rates = makeMockRatesWithHouseEngine(); // 유예 OFF
const d = (s: string) => new Date(s);

/** 조정지역 · 3주택 · 원시 플래그(명부 없음) · 보유 8년 이상 */
const general = (transferDate: string): TransferTaxInput =>
  baseTransferInput({
    transferPrice: 900_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: d("2009-06-01"),
    transferDate: d(transferDate),
    isOneHousehold: false,
    householdHousingCount: 3,
    isRegulatedArea: true,
    residencePeriodMonths: 0,
  });

const redev = (transferDate: string): TransferTaxInput =>
  baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: d(transferDate),
    acquisitionDate: d("2005-04-09"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 3,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    residencePeriodMonths: 0,
    redevelopment: case44RedevelopmentInfo(),
  });

describe("E-14n §95② 다주택 장특 배제 시기 — 2018.4.1.부터", () => {
  it("G-1 일반 주택 · 2018-03-31 → 장특 표1 공제 · 배제 사유 없음", () => {
    const r = calculateTransferTax(general("2018-03-31"), rates);
    expect(r.lthdExclusionReason).toBeUndefined();
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0);
  });

  it("G-2 긍정 짝 — 일반 주택 · 2018-04-01 → 배제(multi_house_surcharge)", () => {
    const r = calculateTransferTax(general("2018-04-01"), rates);
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.lthdExclusionReason).toBe("multi_house_surcharge");
  });

  it("G-3 재개발 경로(Step A.8)도 같은 시기 술어 — 2018-03-31 → 배제 사유 없음", () => {
    const r = calculateTransferTax(redev("2018-03-31"), rates);
    expect(r.lthdExclusionReason).toBeUndefined();
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0);
  });

  it("G-4 긍정 짝 — 재개발 · 2018-04-01 → 배제", () => {
    const r = calculateTransferTax(redev("2018-04-01"), rates);
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.lthdExclusionReason).toBe("multi_house_surcharge");
  });
});
