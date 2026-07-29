/**
 * anchor(회귀 방어) — 재개발/재건축 조합원입주권은 §164⑨ 공익수용 특례 **미대상** (계획 P7/D12 · U3 확정).
 *
 * 법령 판단(KoreanLaw, 소득세법 MST 280405 / 시행령 286211):
 *   - 조합원입주권 = §94①2호가목/§99①2호가목 "부동산을 취득할 수 있는 권리"(§88 9호·관리처분인가 성질전환).
 *   - §164⑨은 원문상 법 §99①1호 "가목부터 라목까지"(물건) 전용 — 2호(권리) 준용 전무 → 입주권 미대상.
 *   - 재개발 종전자산의 실제 수용은 관리처분 인가 전 일반 주택/토지 수용(§99①1호, P5·P6 기배선)으로 처리.
 *   ⇒ 재개발 경로에 §164⑨을 배선하지 않는 것이 정답. `SUPPORTED_ASSET_KINDS`·`expropriation-scope`에
 *      redevelopment_apt를 추가하면 §164⑨ 오적용이므로 **절대 금지**.
 *
 * 본 anchor는 재개발 입력에 §164⑨ 필드(수용·보상·공매·split)를 **심어도** 재개발 산출이 불변이고
 * 어떤 §164⑨ detail도 부착되지 않음을 고정한다(미래에 누군가 배선하면 즉시 RED).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "../transfer-tax/redevelopment/_helpers";

const rates = makeMockRates();

/** 사례 44 재개발(환산) 베이스 + §164⑨ 전 트랙 필드 주입 */
function redevWithExprFields(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("2005-04-09"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: case44RedevelopmentInfo(),
    // §164⑨ 전 트랙 필드 주입 — 재개발 경로는 이를 소비하지 않아야 한다.
    transferCause: "public_expropriation",
    standardPricePerSqmAtTransfer: 3_000_000,
    transferArea: 100,
    compensationPerSqm: 1_000_000,
    compensationBasisStdPrice: 1_500_000,
    housingCompensationTotal: 300_000_000,
    housingCompensationBasisTotal: 350_000_000,
    isAuctionTransfer: true,
    auctionPrice: 200_000_000,
    splitLandCompensationTotal: 100_000_000,
    splitLandCompensationBasisTotal: 120_000_000,
    ...overrides,
  } as Partial<TransferTaxInput>);
}

describe("재개발 §164⑨ 미대상 (P7/D12 · U3 확정)", () => {
  it("재개발 분기 활성 — §164⑨ 필드를 심어도 재개발 경로로 라우팅", () => {
    const r = calculateTransferTax(redevWithExprFields(), rates);
    expect(r.redevelopmentDetail).toBeDefined();
  });

  it("어떤 §164⑨ detail도 부착되지 않는다 (미대상)", () => {
    const r = calculateTransferTax(redevWithExprFields(), rates);
    expect(r.expropriationValuationDetail).toBeUndefined();
    expect(r.housingExpropriationValuationDetail).toBeUndefined();
    expect(r.auctionValuationDetail).toBeUndefined();
    // 재개발은 splitDetail 경로가 아니라 redevelopmentDetail을 쓴다 → split 특례도 무관.
    expect(r.splitDetail).toBeUndefined();
  });

  it("§164⑨ 필드 주입이 재개발 산출을 바꾸지 않는다 (사례 44 baseline 불변)", () => {
    const withFields = calculateTransferTax(redevWithExprFields(), rates);
    // 사례 44 확정 anchor 값과 동일 — 환산취득가·양도차익 불변.
    expect(withFields.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(141_221_534);
    expect(withFields.transferGain).toBe(288_445_917);
    expect(withFields.longTermHoldingDeduction).toBe(86_533_774);
    // §164⑨ 필드 없는 baseline과 세액합계 동일.
    const baseline = calculateTransferTax(
      redevWithExprFields({
        transferCause: "general",
        compensationPerSqm: undefined,
        compensationBasisStdPrice: undefined,
        housingCompensationTotal: undefined,
        housingCompensationBasisTotal: undefined,
        isAuctionTransfer: false,
        auctionPrice: undefined,
        splitLandCompensationTotal: undefined,
        splitLandCompensationBasisTotal: undefined,
      }),
      rates,
    );
    expect(withFields.totalTax).toBe(baseline.totalTax);
    expect(withFields.transferGain).toBe(baseline.transferGain);
  });
});
