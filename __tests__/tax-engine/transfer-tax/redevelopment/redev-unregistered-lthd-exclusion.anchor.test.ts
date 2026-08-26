/**
 * anchor — E2-04 : 재개발 경로가 **미등기양도자산**에도 장기보유특별공제를 그대로 차감한다.
 *
 * ## 조문 (법제처 실독 — 소득세법 [시행 2026-07-01] §95②)
 *
 * > ②제1항에서 "장기보유 특별공제액"이란 제94조제1항제1호에 따른 자산(**제104조제3항에 따른
 * > 미등기양도자산**과 **같은 조 제7항 각 호에 따른 자산은 제외한다**)으로서 보유기간이 3년
 * > 이상인 것 및 …
 *
 * 괄호가 배제하는 것은 **둘**이다 — §104③ 미등기양도자산 **과** §104⑦ 각 호 자산(다주택 중과).
 *
 * ## 결함
 *
 * 재개발 분기는 LTHD를 `runRedevelopment`가 **분기별로** 산정해 넘기므로 일반 경로
 * (`transfer-tax-lthd.ts` L-0 `isUnregistered` → `exclusionReason: "unregistered"`)의 배제를
 * 타지 않는다. 이를 알고 `calculateRedevelopmentTax`가 `applyLthdExclusion`을 직접 걸어 두었으나
 * 트리거가 `resolveSurchargeApplication(...).isSurchargeApplied` **하나뿐**이었다.
 *
 * 결함이 겉으로 드러나지 않은 이유: 미등기를 켜면 세율(70% §104③)과 기본공제(0 §103①)는
 * 정상으로 바뀌므로 화면이 「미등기가 반영됐다」처럼 보인다. LTHD만 조용히 남는다.
 *
 * ## 실측 (mock 세율 · 재개발 신축APT · 취득 2009-04-15 · 인가 2013-10-23 · 양도 2023-02-16)
 *
 * | | LTHD | 과세표준 | 산출세액 |
 * |---|---|---|---|
 * | 등기 | 161,200,000 | — | 156,580,000 |
 * | 미등기 (종전) | **161,200,000 (불변)** | 458,800,000 | 321,160,000 |
 * | 동일 수치 일반주택 · 미등기 | **0** | 620,000,000 | 434,000,000 |
 *
 * ⇒ 재개발 경로 산출세액 **112,840,000원 과소**.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();

function redevInfo(): RedevelopmentInfo {
  return {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2013-10-23"),
    rightsValue: 600_000_000,
    settlementDirection: "pay",
    settlementAmount: 100_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    // 분양가는 결과 측 파생값이다 — 권리가액 600,000,000 + 납부청산금 100,000,000 = 700,000,000
  };
}

function input(o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 920_000_000,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2009-04-15"),
    acquisitionPrice: 300_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: redevInfo(),
    ...o,
  });
}

describe("E2-04 anchor — 미등기양도자산 LTHD 배제 (§95② 본문 괄호)", () => {
  const registered = calculateTransferTax(input(), rates);
  const unregistered = calculateTransferTax(input({ isUnregistered: true }), rates);

  it("기준선 — 등기 자산은 LTHD가 정상 차감된다", () => {
    expect(registered.longTermHoldingDeduction).toBeGreaterThan(0);
  });

  it("🔑 미등기 → 장기보유특별공제 0 (§95② 「제104조제3항에 따른 미등기양도자산 … 제외」)", () => {
    expect(unregistered.longTermHoldingDeduction).toBe(0);
  });

  it("분기 3개도 함께 0 — 「공제 0인데 분기엔 값이 있다」 금지", () => {
    const d = unregistered.redevelopmentDetail!;
    expect(d.preApproval.lthd).toBe(0);
    expect(d.postApprovalExistingHouse.lthd).toBe(0);
    expect(d.settlement.lthd).toBe(0);
    expect(d.total.lthd).toBe(0);
  });

  it("배제 사유가 화면까지 전달된다 — 「왜 0인지」를 표시할 수 있어야 한다", () => {
    expect(unregistered.lthdExclusionReason).toBe("unregistered");
  });

  it("🔑 구별력 — 등기/미등기가 LTHD를 실제로 가른다 (종전에는 동일했다)", () => {
    expect(unregistered.longTermHoldingDeduction).not.toBe(registered.longTermHoldingDeduction);
  });

  it("미등기의 다른 효과(70% 세율·기본공제 0)는 종전대로 정상 (회귀 가드)", () => {
    expect(unregistered.appliedRate).toBe(0.7);
    expect(unregistered.basicDeduction).toBe(0);
  });

  it("미등기가 아니면 배제 사유가 붙지 않는다", () => {
    expect(registered.lthdExclusionReason).toBeUndefined();
  });
});
