/**
 * anchor — NH-16 (리뷰 Q-6 · 기존 재개발 자산 사실 재사용): §166 재개발 분기의 §99의3 차감에 승계조합원 게이트가 닿는다.
 *
 * 조특령 §99의3⑤: 법 §99의3①2호의 «대통령령으로 정하는 조합원» = 관리처분계획 인가일(사업계획 승인일) 현재의 조합원.
 * 조특령 §99의3③2호도 같은 괄호(인가일 현재의 조합원)다. 재개발 자산의 승계조합원(`redevelopment.isSuccessorMember` — 관리처분계획
 * 인가일 뒤 입주권 승계, 인가일은 자산의 `approvalDate`)은 어느 갈래에도 해당하지 않는다. 새 날짜 칸은 만들지 않는다.
 * 라우터 컨텍스트 배선(`transfer-tax-redevelopment.ts` Step C.5)을 고정한다 — 평가기 단위 판정은 `nh99-l1b-acq-cause-luxury.anchor.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, makeMockRatesWithHouseEngine, baseTransferInput } from "../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "../transfer-tax/redevelopment/_helpers";

const rates = makeMockRates();
// 원조합원 완공 아파트는 조합원 갈래(준공일 축 — NH-36): 준공 2012-06-01은 기간 경과 후라 잔여주택 계약 사실 「예」,
// 주택 출자라 재개발 변형(종전주택 취득 당시 기준시가)이 필요하다(NH-32). 승계조합원은 그 전에 취득 원인 게이트가 막는다.
const R993 = {
  type: "new_99_3" as const,
  standardPriceAtAcquisition993: 100_000_000,
  standardPriceAt5Years: 160_000_000,
  standardPriceAtTransfer993: 250_000_000,
  region993: "outside_speculation" as const,
  remainderContract993: "yes" as const,
  previousHouseStdPrice993: 80_000_000,
};

function redevApt(successor: boolean): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("2005-04-09"),
    // 승계조합원은 실지 취득가액이 필요하다(소득세법 시행령 §163⑨ 오류 게이트) — 원조합원은 사례 44 환산 그대로
    acquisitionPrice: successor ? 300_000_000 : 0,
    expenses: 0,
    useEstimatedAcquisition: !successor,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: {
      ...case44RedevelopmentInfo(),
      completionDate: new Date("2012-06-01"),
      ...(successor ? { isSuccessorMember: true } : {}),
    },
    reductions: [R993] as unknown as TransferTaxInput["reductions"],
  });
}

describe("NH-16 — 재개발 분기 × §99의3 × 승계조합원", () => {
  it("원조합원(인가일 현재 조합원) — 종전과 같이 적용", () => {
    const r = calculateTransferTax(redevApt(false), rates);
    expect(r.new993Detail?.isEligible).toBe(true);
  });
  it("승계조합원 — NOT_MEMBER_AT_APPROVAL로 불성립(조특령 §99의3③2호·⑤)", () => {
    const r = calculateTransferTax(redevApt(true), rates);
    expect(r.new993Detail?.isEligible).toBe(false);
    expect(r.new993Detail?.ineligibleReasons.map((x) => x.code)).toEqual(["NOT_MEMBER_AT_APPROVAL"]);
  });
});

/**
 * STEP 0.45 중과 배제 선판정도 Step C.5와 같은 승계조합원 게이트를 본다(L1c — #2935 후속). 감면이 불성립인데 소령 §167의3①5호
 * 중과 배제만 남던 어긋남을 막는다. 3주택 · 조정대상지역 · 양도 2021-09-01 · mock 세율(정본 세액 아님).
 * 수정 전: 승계조합원도 중과 배제(tax_special_exemption) — 수정 후 감면 미선택 대조와 같은 중과·세액.
 */
describe("NH-16 — 재개발 승계조합원 × STEP 0.45 중과 배제", () => {
  const houseRates = makeMockRatesWithHouseEngine();
  const h = (id: string, acq: string) => ({ id, region: "capital", acquisitionDate: new Date(acq), officialPrice: 800_000_000, isInherited: false, isLongTermRental: false });
  const surchargeCase = (successor: boolean, withRed = true) => ({
    ...redevApt(successor),
    transferDate: new Date("2021-09-01"),
    isOneHousehold: true,
    householdHousingCount: 3,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    sellingHouseId: "s",
    houses: [h("s", "2005-04-09"), h("h2", "2015-01-01"), h("h3", "2015-01-01")],
    reductions: (withRed ? [R993] : []) as unknown as TransferTaxInput["reductions"],
  }) as TransferTaxInput;
  const reasons = (r: ReturnType<typeof calculateTransferTax>) =>
    (r.multiHouseSurchargeEvaluation?.exclusionReasons ?? []).map((e: { type: string }) => e.type);

  it("원조합원 — 종전과 같이 중과 배제", () => {
    expect(reasons(calculateTransferTax(surchargeCase(false), houseRates))).toEqual(["tax_special_exemption"]);
  });
  it("승계조합원 — 중과 배제 없음 · 세액 = 감면 미선택 대조", () => {
    const r = calculateTransferTax(surchargeCase(true), houseRates);
    const ctl = calculateTransferTax(surchargeCase(true, false), houseRates);
    expect(r.new993Detail?.ineligibleReasons.map((x) => x.code)).toEqual(["NOT_MEMBER_AT_APPROVAL"]);
    expect(reasons(r)).not.toContain("tax_special_exemption");
    expect(r.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(true);
    expect(r.totalTax).toBe(ctl.totalTax);
  });
});
