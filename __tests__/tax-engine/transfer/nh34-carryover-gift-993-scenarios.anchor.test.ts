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

  it("본 계산 — 증여 취득이라 불성립 · 세액 = 감면 없는 대조 137,566,000 (수정 전 결정세액 0 + 농특세 28,212,000)", () => {
    expect(r.new993Detail?.isEligible).toBe(false);
    expect(r.new993Detail?.ineligibleReasons.map((x) => x.code)).toEqual(["ACQUIRED_BY_INHERITANCE_OR_GIFT"]);
    expect(r.totalTax).toBe(ctl.totalTax);
    expect(r.totalTax).toBe(137_566_000);
  });

  it("시나리오 A — 결정세액이 감면 없는 대조와 같다 (수정 전 85,510,000) · 채택 A", () => {
    expect(r.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(r.carryoverTaxationDetail?.scenarioA?.determinedTax).toBe(ctl.carryoverTaxationDetail?.scenarioA?.determinedTax);
    expect(r.carryoverTaxationDetail?.scenarioA?.determinedTax).toBe(125_060_000);
  });
});

/**
 * 시나리오 B — §104②2호 세율 보유기간 때문에 B 입력은 `acquisitionCause: "purchase"`(일반 취득)로 바뀐다(`buildInputB`).
 * 감면 판정은 실제 취득 원인(이월과세 증여)을 엔진 내부 필드 `reductionAcquisitionCause`로 따로 읽는다(L1c · Q-3).
 * 수정 전: B 결정세액 0(매매 + 최초 계약 빈 값 = 종전 적용 · 「예」도 적용) — 수정 후 감면 없는 대조 B 45,990,000.
 */
describe("NH-34 — 이월과세 증여 × §99의3 (시나리오 B)", () => {
  const ctlB = calculateTransferTax(mk([]), rates).carryoverTaxationDetail?.scenarioB?.determinedTax;
  it.each([
    ["최초 계약 빈 값", R993],
    ["최초 계약 「예」(화면은 묻지 않는 범위의 옛 답)", { ...R993, firstContract993: "yes" as const }],
  ])("%s — B 결정세액 = 감면 없는 대조 45,990,000 (수정 전 0) · 채택 A · 본 계산 세액 불변 137,566,000", (_l, red) => {
    const r = calculateTransferTax(mk([red]), rates);
    expect(ctlB).toBe(45_990_000);
    expect(r.carryoverTaxationDetail?.scenarioB?.determinedTax).toBe(ctlB);
    expect(r.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(r.totalTax).toBe(137_566_000);
  });
});
