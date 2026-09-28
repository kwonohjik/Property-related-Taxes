/**
 * anchor — §166④1호 청산금 수령 비과세 게이트의 **음성 케이스** (T1-04)
 *
 * ## 왜 필요한가 — 안전망이 0이었다
 *
 * `applySettlementExemption`의 5조건 AND 게이트 중 **권리가액 12억 초과 배제**와
 * **`receiveOnlyMode` 배제**를 각각 무력화해도 회귀가 **0/14314**였다(2026-08-26 실측).
 *
 * 원인은 이 함수를 양성 발동시키는 fixture가 사례 47(권리가액 8억 · `receiveOnlyMode: false`)
 * 단 하나뿐이라는 것이다 — 권리가액이 12억을 넘는 케이스도, `receiveOnlyMode: true`인 케이스도
 * 없어서 게이트가 **막는 동작**이 한 번도 관측되지 않았다.
 *
 * 리뷰 실측(12억 게이트 무력화): 총납부세액 62,850,332원 → 41,002,866원 (Δ −21,847,466).
 * 청산금분 양도차익 74,666,666원이 통째로 비과세 처리된다.
 *
 * ## 축
 *
 * 「고가주택 판정 대상 = §166④1호 **권리가격**, 기준선 12억」은 도메인 오너가 확정한 규칙이다
 * (memory `project_right_to_move_in_asset_kind_axis` — 양도가액이 아니라 관리처분계획에 따라
 * 정하여진 가격을 본다). 그 규칙 자체가 무방비였다.
 *
 * ## 조문
 *
 * · 「소득세법 시행령」 §166④1호 — 관리처분계획에 따라 정하여진 가격.
 * · 「소득세법」 §89①4호 각 목 외의 부분 단서 · §95③ — 12억 초과분 과세.
 *
 * ⚠️ 이 anchor는 **게이트가 막는지**를 본다. 막지 않을 때의 산식(마스킹·안분)은
 *    `case-47-integration.test.ts`가 맡는다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case47RedevelopmentInfo } from "./_helpers";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

/** 사례 47 구조 — 한 축씩만 바꿔 대조한다. */
function run(redevOver: Partial<RedevelopmentInfo> = {}) {
  const redevelopment = { ...case47RedevelopmentInfo(), ...redevOver } as RedevelopmentInfo;
  const input: TransferTaxInput = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 2_000_000_000,
    transferDate: new Date("2022-03-01"),
    acquisitionDate: new Date("2001-01-01"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 254,
    redevelopment,
  });
  const result = calculateTransferTax(input, mockRates);
  return { result, detail: result.redevelopmentDetail! };
}

describe("T1-04 · §166④1호 청산금 수령 비과세 게이트 — 음성 케이스", () => {
  it("T1-04-00: 양성 — 권리가액 8억 · receiveOnlyMode=false면 비과세가 적용된다 (대조군)", () => {
    const { detail } = run();
    expect(detail.settlementExemptionApplied).toBe(true);
    expect(detail.settlement.gain).toBe(0); // 마스킹
    expect(detail.exemptedGain).toBeGreaterThan(0);
  });

  it("T1-04-01: 🔑 권리가액 15억 — 12억 초과 고가주택이므로 전액 비과세가 막힌다", () => {
    const { detail } = run({ rightsValue: 1_500_000_000 });
    // 게이트가 회귀로 사라지면 true·gain 0이 되고, 종전에는 그것을 잡는 테스트가 없었다.
    // L-12 — 막힌 뒤에는 §160① 안분이 걸린다(값은 `settlement-l12-transfer-date.anchor.test.ts` B-*).
    expect(detail.settlementExemptionApplied).toBeUndefined();
    expect(detail.settlement.gain).toBeGreaterThan(0);
    expect(detail.exemptedGain).toBeUndefined();
    expect(detail.settlementHighValueAllocation).toBeDefined();
  });

  it("T1-04-02: 경계 — 정확히 12억은 「초과」가 아니므로 비과세가 유지된다", () => {
    const { detail } = run({ rightsValue: 1_200_000_000 });
    expect(detail.settlementExemptionApplied).toBe(true);
  });

  it("T1-04-03: 경계 — 12억 + 1원부터 막힌다", () => {
    const { detail } = run({ rightsValue: 1_200_000_001 });
    expect(detail.settlementExemptionApplied).toBeUndefined();
  });

  /**
   * 🔄 L-12(2026-09-28) 뒤집힘 — 종전 기대는 「단독신고에는 이 비과세를 적용하지 않는다」였다.
   * 국세청 회신 3건(부동산거래관리과-380 · 서면-2016-법령해석재산-2705 · 사전-2022-법규재산-1282)은
   * 모두 **청산금 수령분 그 자체**(신축주택을 팔지 않은 조합원)의 1세대1주택 비과세를 다루고
   * 「양도일 현재」 요건을 갖추면 비과세라고 답한다. 단독신고를 배제할 법령·해석 근거는 확인되지
   * 않는다 — 배제하면 요건 충족자도 전액 과세된다(납세자 불리).
   * (이 fixture는 동시신고 양도가액·양도일 그대로 단독신고 플래그만 켠다 — 청산금분 양도일
   *  2022-03-01 = 양도일이라 세대 입력이 그 날의 사실이다.)
   */
  it("T1-04-04: 🔑 receiveOnlyMode=true — 청산금 단독신고에도 같은 비과세가 적용된다 (L-12)", () => {
    const { detail } = run({ receiveOnlyMode: true });
    expect(detail.settlementExemptionApplied).toBe(true);
    expect(detail.settlement.gain).toBe(0);
  });

  it("T1-04-05: 세액이 실제로 갈린다 — 게이트가 막으면 더 많이 낸다", () => {
    const allowed = run().result.totalTax;
    const blocked = run({ rightsValue: 1_500_000_000 }).result.totalTax;
    expect(blocked).toBeGreaterThan(allowed);
  });
});
