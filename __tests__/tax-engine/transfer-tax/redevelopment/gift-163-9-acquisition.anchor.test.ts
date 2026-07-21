/**
 * 재개발 증여 종전자산 취득가액 §163⑨ 정합 anchor (실가 경로 회귀 가드).
 *
 * §163⑨: 증여받은 자산은 증여일 현재 상증법 §60~66 평가액(증여 신고가액)을 취득당시
 *   실지거래가액으로 본다 → 재개발 종전자산 취득가액 = 증여 신고가액(실가). §166③ 환산 아님.
 *
 * 증여 신고가액은 항상 확인 가능 → 실가(useEstimated=false) 모드로 입력하면 종전자산 취득가액이
 *   증여 신고가액 그대로 반영된다. (환산 모드는 validation 단계에서 차단 — §163⑨ 실가 강제.)
 *
 * 상속(inheritance-163-9-acquisition.anchor.test.ts)의 A' 케이스(실가 모드 = reported) 미러.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "./_helpers";

const mockRates = makeMockRates();

function buildGiftInput(acquisitionPrice: number): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    acquisitionCause: "gift",
    transferPrice: 525_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("2010-03-01"),
    acquisitionPrice,
    useEstimatedAcquisition: false, // 실가 모드 (§163⑨ 증여 신고가액=취득가액)
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: case44RedevelopmentInfo(),
  }) as TransferTaxInput;
}

describe("재개발 증여 §163⑨ 취득가액 정합 (실가)", () => {
  it("gift 실가 → 종전자산 취득가액 = 증여 신고가액(200,000,000)", () => {
    const r = calculateTransferTax(buildGiftInput(200_000_000), mockRates);
    expect(r.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(200_000_000);
    expect(r.redevelopmentDetail?.valuationMeta?.method).toBe("actual");
  });
});
