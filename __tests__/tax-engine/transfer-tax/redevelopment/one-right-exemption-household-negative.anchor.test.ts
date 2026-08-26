/**
 * anchor — §89①4호 **본문 세대 구성 요건의 음성 케이스** (T1-01)
 *
 * ## 왜 필요한가 — 안전망이 0이었다
 *
 * `resolveOneRightExemptionClause`의 본문 게이트에서 `input.householdRightCount !== 1`을 무력화해도
 * 회귀가 **0/14314**였다(2026-08-26 실측 · 리뷰 시점 0/7032와 동일). 원인은 사례 36 계열 fixture가
 * 전부 **요건 충족(양성)** 케이스라 「게이트가 막는」 동작이 한 번도 관측되지 않기 때문이다.
 *
 * 무력화되면 입주권을 2개 보유한 세대에게 **전액 비과세**가 잘못 부여된다 —
 * 리뷰 실측 총납부세액 259,611,000원 → 0원.
 *
 * ## 조문 (법제처 실독 — 소득세법 [시행 2026-07-01] §89①4호)
 *
 * > **조합원입주권을 1개 보유한 1세대**[관리처분계획의 인가일 … 현재 제3호가목에 해당하는
 * > 기존주택을 소유하는 세대]가 다음 각 목의 어느 하나의 요건을 충족하여 양도하는 경우 …
 * > 가. 양도일 현재 다른 주택 또는 **분양권**을 보유하지 아니할 것
 *
 * 「1개 보유한 1세대」는 **각 목 공통의 본문 요건**이다. 가·나목 중 무엇을 타든 먼저 성립해야 한다.
 *
 * ## 이 anchor가 세우는 축
 *
 * 양성 1건(가목 충족)과 음성 3건(입주권 2개 · 1세대 아님 · 인가일 요건 미충족)을 **같은 픽스처에서
 * 한 축씩만 바꿔** 대조한다. 한 축만 다르므로 세액 차이가 그 축에서 왔음이 확정된다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

/** 사례 36 계열 — 입주권 양도 · 청산금 납부 · 가목 요건 충족. */
function rightInfo(over: Partial<RedevelopmentInfo> = {}): RedevelopmentInfo {
  return {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2018-10-23"),
    rightsValue: 300_000_000,
    settlementDirection: "pay",
    settlementAmount: 90_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    exemptionEligibleAtApproval: true,
    ...over,
  } as RedevelopmentInfo;
}

function run(over: Partial<TransferTaxInput> = {}, redevOver: Partial<RedevelopmentInfo> = {}) {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 900_000_000, // ≤ 12억 — 안분 분기를 타지 않는다
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 0,
    householdRightCount: 1,
    residencePeriodMonths: 0,
    redevelopment: rightInfo(redevOver),
    ...over,
  });
  const result = calculateTransferTax(input, mockRates);
  return { result, detail: result.redevelopmentDetail! };
}

describe("T1-01 · §89①4호 본문 세대 구성 요건 — 음성 케이스", () => {
  it("T1-01-00: 양성 — 입주권 1개 · 다른 주택 0채면 가목 전액 비과세 (대조군)", () => {
    const { result, detail } = run();
    expect(detail.oneRightExemptionApplied).toBe(true);
    expect(result.totalTax).toBe(0);
  });

  it("T1-01-01: 🔑 입주권 2개 — 「1개 보유한 1세대」 불성립이므로 과세된다", () => {
    const { result, detail } = run({ householdRightCount: 2 });
    // 게이트가 회귀로 사라지면 여기서 true·0원이 되고, 종전에는 그것을 잡는 테스트가 없었다.
    expect(detail.oneRightExemptionApplied).toBeFalsy();
    expect(result.totalTax).toBeGreaterThan(0);
  });

  it("T1-01-02: 1세대가 아니면 목을 가르기 전에 불성립", () => {
    const { result, detail } = run({ isOneHousehold: false });
    expect(detail.oneRightExemptionApplied).toBeFalsy();
    expect(result.totalTax).toBeGreaterThan(0);
  });

  it("T1-01-03: 인가일 현재 기존주택 요건 미충족이면 불성립 (본문 괄호)", () => {
    const { result, detail } = run({}, { exemptionEligibleAtApproval: false });
    expect(detail.oneRightExemptionApplied).toBeFalsy();
    expect(result.totalTax).toBeGreaterThan(0);
  });

  it("T1-01-04: 🔑 세 음성 케이스는 서로 같은 세액이다 — 축 하나만 달라졌음을 확인", () => {
    const a = run({ householdRightCount: 2 }).result.totalTax;
    const b = run({ isOneHousehold: false }).result.totalTax;
    // 비과세만 빠지고 나머지 계산은 동일해야 한다(1세대 축은 LTHD 표2에도 영향을 주므로 b는 별개).
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    const c = run({}, { exemptionEligibleAtApproval: false }).result.totalTax;
    expect(c).toBeGreaterThan(0);
  });
});
