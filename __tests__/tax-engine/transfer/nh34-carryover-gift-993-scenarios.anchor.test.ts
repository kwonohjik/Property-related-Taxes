/**
 * anchor — NH-34 · Q-3(이월과세 증여 = 「최초 계약자 취득」 불인정): 이월과세 시나리오 A·B·본 계산 모두 §99의3이 적용되지 않는다.
 *
 * 근거: 조세특례제한법 §99의3①1호 「주택건설업자와 최초로 매매계약을 체결하고 계약금을 납부한 자가 취득한 신축주택」.
 * 배우자로부터 증여받아 취득한 주택은 포함하지 않는다 — 서면인터넷방문상담4팀-1192(2006.4.28.) · 서면인터넷방문상담4팀-1719(2005.9.23.) ·
 * 사전-2025-법규재산-0749(2025.9.23.) (메인 세션 원문 확인).
 *
 * 리뷰 실측 시료: 증여자 분양계약 2002-06 · 배우자 증여 2006-01 · 양도 2010-06 · 8억.
 * 수정 전: 시나리오 A 결정세액 85,510,000(증여자 취득일 기준 5년 안분) ↔ 본 계산 결정세액 0 + 농특세 28,212,000(수증자 취득일 기준 5년 이내 전액 차감).
 * 수정 후: 감면 없는 대조와 같다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const rates = makeMockRates();
const R993 = {
  type: "new_99_3" as const,
  contractDate993: "2002-06-01",
  acquisitionType993: "from_builder" as const,
  region993: "outside_speculation" as const,
  standardPriceAtAcquisition993: 100_000_000,
  standardPriceAt5Years: 200_000_000,
  standardPriceAtTransfer993: 400_000_000,
  exclusiveAreaSqm993: 84,
  houseType993: "apartment" as const,
};
const ct = {
  giftRegistryDate: D("2006-01-15"),
  donorAcquisitionDate: D("2002-06-15"),
  useEstimatedAcquisition: false,
  donorAcquisitionPrice: 300_000_000,
  giftTaxAmount: 0,
  giftDateValuation: 600_000_000,
  donorRelation: "spouse",
};
const mk = (reductions: unknown[]) =>
  baseTransferInput({
    transferPrice: 800_000_000,
    acquisitionPrice: 600_000_000,
    acquisitionDate: D("2006-01-15"),
    transferDate: D("2010-06-15"),
    householdHousingCount: 2,
    isOneHousehold: false,
    residencePeriodMonths: 0,
    reductions,
    acquisitionCause: "carryover_gift",
    carryoverTaxation: ct,
  } as unknown as Partial<TransferTaxInput>);

describe("NH-34 — 이월과세 증여 × §99의3 (시나리오 A·본 계산)", () => {
  const r = calculateTransferTax(mk([R993]), rates);
  const ctl = calculateTransferTax(mk([]), rates);

  it("본 계산 — 증여 취득이라 불성립 · 세액 = 감면 없는 대조 155,166,000 (수정 전 결정세액 0 + 농특세 28,212,000)", () => {
    expect(r.new993Detail?.isEligible).toBe(false);
    expect(r.new993Detail?.ineligibleReasons.map((x) => x.code)).toEqual(["ACQUIRED_BY_INHERITANCE_OR_GIFT"]);
    expect(r.totalTax).toBe(ctl.totalTax);
    expect(r.totalTax).toBe(155_166_000);
  });

  it("시나리오 A — 결정세액이 감면 없는 대조와 같다 (수정 전 85,510,000) · 채택 A", () => {
    expect(r.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(r.carryoverTaxationDetail?.scenarioA?.determinedTax).toBe(ctl.carryoverTaxationDetail?.scenarioA?.determinedTax);
    expect(r.carryoverTaxationDetail?.scenarioA?.determinedTax).toBe(141_060_000);
  });
});
