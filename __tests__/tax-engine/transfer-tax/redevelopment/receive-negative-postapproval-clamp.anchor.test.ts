/**
 * anchor — 청산금 **수령** 경로의 인가후 차손 0 clamp (T1-05 · 두 분기)
 *
 * ## 왜 필요한가 — 안전망이 0이었다
 *
 * `Math.max(0, …)` clamp를 제거해도 회귀가 **0/14314**였다(2026-08-26 실측 · 두 분기 각각):
 *
 * | 분기 | 위치 | 함수 |
 * |---|---|---|
 * | 완공APT + 수령 | `redevelopment-split.ts` `postApprovalGain` | `computeAptReceive` |
 * | 입주권 + 수령 | `redevelopment-settlement.ts` `settlementGain` | `splitReceive` |
 *
 * 두 clamp 모두 「양도가액 < 분양가(권리가액 − 수령청산금)」일 때만 발동하는데,
 * receive fixture 중 그런 케이스가 **하나도 없어** 한 번도 실행되지 않았다.
 *
 * 리뷰 실측(apt+receive clamp 제거): 총납부세액 64,801,000원 → 43,901,000원 (Δ −20,900,000).
 * 인가후 기존주택분 양도차익 0 → −50,000,000이 인가전 이익과 상계된다.
 *
 * ## 🟠 이 anchor는 clamp가 **옳다고 단언하지 않는다**
 *
 * 리뷰가 명시했듯 「clamp가 §166 및 §102②(양도차손 통산) 관점에서 타당한지는 판단하지 않았다」.
 * 현행 동작을 고정해 **조용한 변경**을 막는 것이 목적이다. 엔진 내부적으로는 일관돼 있다 —
 * `apt+pay` 분기(`splitAptPay`)도 `postApprovalGain <= 0` 가드로 동일하게 0 처리한다.
 *
 * ⇒ clamp를 바꾸려면 먼저 §166①2호 가목·§102②을 실독해 「인가전·인가후 분이 하나의 자산 안에서
 *   통산되는가」를 확정할 것. 그 전에는 이 anchor가 현행을 지킨다
 *   (memory `feedback_unverified_authority_blocks_tax_change`).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

const RIGHTS_VALUE = 500_000_000;
const SETTLEMENT_RECEIVED = 100_000_000;
/** 분양가 = 권리가액 − 수령청산금 */
const SALE_PRICE_TOTAL = RIGHTS_VALUE - SETTLEMENT_RECEIVED; // 400,000,000

function redevInfo(subject: "apt" | "right"): RedevelopmentInfo {
  return {
    subject,
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2015-06-01"),
    rightsValue: RIGHTS_VALUE,
    settlementDirection: "receive",
    settlementAmount: SETTLEMENT_RECEIVED,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    receiveOnlyMode: false,
    exemptionEligibleAtApproval: false, // 비과세 마스킹을 배제해 clamp만 관측한다
  } as RedevelopmentInfo;
}

function run(subject: "apt" | "right", transferPrice: number) {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: subject === "apt" ? "redevelopment_apt" : "right_to_move_in",
    transferPrice,
    transferDate: new Date("2023-09-01"),
    acquisitionDate: new Date("2005-03-10"),
    acquisitionPrice: 200_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: redevInfo(subject),
  });
  const result = calculateTransferTax(input, mockRates);
  return { result, detail: result.redevelopmentDetail! };
}

/** 양도가액이 분양가보다 낮은 케이스 — clamp가 발동하는 유일한 구간. */
const BELOW = 350_000_000; // < 400,000,000
/** 대조군 — 분양가보다 높아 clamp가 발동하지 않는다. */
const ABOVE = 600_000_000;

describe("T1-05 · 청산금 수령 경로 인가후 차손 clamp", () => {
  describe("완공APT + 수령 (computeAptReceive)", () => {
    it("T1-05a-00: 대조군 — 양도가액 > 분양가면 인가후 차익이 양수다", () => {
      const { detail } = run("apt", ABOVE);
      expect(detail.postApprovalExistingHouse.gain).toBeGreaterThan(0);
    });

    it("T1-05a-01: 🔑 양도가액 < 분양가 — 인가후 차익이 음수가 아니라 0이다", () => {
      const { detail } = run("apt", BELOW);
      // clamp가 회귀로 사라지면 −50,000,000이 되어 인가전 이익과 상계된다.
      expect(detail.postApprovalExistingHouse.gain).toBe(0);
      expect(detail.postApprovalExistingHouse.gain).not.toBeLessThan(0);
    });

    it("T1-05a-02: 세액이 실제로 달라진다 — 상계되면 덜 낸다", () => {
      const clamped = run("apt", BELOW).result.totalTax;
      // clamp 제거 시 총 양도차익이 250,000,000으로 줄어 세액이 내려간다(리뷰 실측 Δ −20,900,000).
      // 여기서는 「인가전 이익이 그대로 살아 있다」를 세액으로 고정한다.
      expect(clamped).toBeGreaterThan(0);
      const preGain = run("apt", BELOW).detail.preApproval.gain;
      expect(preGain).toBeGreaterThan(0);
    });
  });

  describe("입주권 + 수령 (splitReceive)", () => {
    it("T1-05b-00: 대조군 — 양도가액 > 분양가면 청산금분 차익이 양수다", () => {
      const { detail } = run("right", ABOVE);
      expect(detail.settlement.gain).toBeGreaterThan(0);
    });

    it("T1-05b-01: 🔑 양도가액 < 분양가 — 청산금분 차익이 음수가 아니라 0이다", () => {
      const { detail } = run("right", BELOW);
      expect(detail.settlement.gain).toBe(0);
      expect(detail.settlement.gain).not.toBeLessThan(0);
    });
  });

  it("T1-05-03: 🔑 두 분기가 같은 규칙을 쓴다 — 한쪽만 고치는 회귀를 막는다", () => {
    expect(run("apt", BELOW).detail.postApprovalExistingHouse.gain).toBe(0);
    expect(run("right", BELOW).detail.settlement.gain).toBe(0);
  });

  it("T1-05-04: 분양가 = 양도가액 경계에서도 0이다", () => {
    expect(run("apt", SALE_PRICE_TOTAL).detail.postApprovalExistingHouse.gain).toBe(0);
    expect(run("right", SALE_PRICE_TOTAL).detail.settlement.gain).toBe(0);
  });
});
