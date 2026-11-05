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
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "../transfer-tax/redevelopment/_helpers";

const rates = makeMockRates();
const R993 = {
  type: "new_99_3" as const,
  contractDate993: "2002-01-01",
  standardPriceAtAcquisition993: 100_000_000,
  standardPriceAt5Years: 160_000_000,
  standardPriceAtTransfer993: 250_000_000,
  region993: "outside_speculation" as const,
  acquisitionType993: "from_builder" as const,
  firstContract993: "yes" as const,
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
      ...(successor ? { isSuccessorMember: true, completionDate: new Date("2012-06-01") } : {}),
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
