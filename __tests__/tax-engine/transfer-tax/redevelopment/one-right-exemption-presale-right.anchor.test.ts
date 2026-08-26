/**
 * anchor — L1-03 : §89①4호 **가목**의 「또는 분양권」 요건이 비과세 게이트에서 통째로 누락.
 *
 * ## 조문 (법제처 실독 — 소득세법 [시행 2026-07-01] §89①4호)
 *
 * > 4. 조합원입주권을 1개 보유한 1세대[…관리처분계획의 인가일… 현재 제3호가목에 해당하는
 * >    기존주택을 소유하는 세대]가 다음 각 목의 어느 하나의 요건을 충족하여 양도하는 경우 …
 * >    **가. 양도일 현재 다른 주택 또는 분양권을 보유하지 아니할 것**
 *
 * ## 결함
 *
 * `applyOneRightExemption`의 트리거는 네 조건뿐이었다 —
 * `exemptionEligibleAtApproval` · `isOneHousehold` · `householdHousingCount === 0` ·
 * `householdRightCount === 1`. 가목이 **명문으로** 요구하는 「분양권을 보유하지 아니할 것」을
 * 어디서도 보지 않았다.
 *
 * 엔진 입력에는 `presaleRights[]`가 이미 있고(`types/multi-house-surcharge.types.ts:256`),
 * ④(`lib/calc/transfer-tax-api.ts:87`)가 **입주권 양도에서도 주택 수 게이트 없이 전송**한다.
 * 즉 값은 도달하는데 게이트가 읽지 않았다.
 *
 * ## 두 종류를 가른다
 *
 * `PresaleRight.type`은 `"presale_right"`(분양권)과 `"redevelopment_right"`(조합원입주권)
 * 둘이다. 가목이 배제하는 것은 **분양권**이고, 조합원입주권 개수는 이미 본문·`householdRightCount`가
 * 본다. 그래서 `type === "presale_right"`만 세야 한다 — 전체 길이를 세면 자기 자신(양도 대상
 * 입주권)을 목록에 넣은 사용자가 조용히 비과세를 잃는다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const rates = makeMockRates();

/** 사례 36 fixture와 동일 — 인가일 2018-10-23·권리가액 3억·청산금 납부 9천만 */
function redevInfo(): RedevelopmentInfo {
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
  };
}

function input(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 520_000_000, // ≤ 12억
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 0,
    householdRightCount: 1,
    residencePeriodMonths: 0,
    redevelopment: redevInfo(),
    ...overrides,
  });
}

const presale = (type: PresaleRight["type"]): PresaleRight => ({
  id: "p1",
  type,
  acquisitionDate: new Date("2022-05-01"),
  region: "capital",
});

describe("L1-03 anchor — §89①4호 가목 「또는 분양권」", () => {
  const clean = calculateTransferTax(input(), rates);
  const withPresale = calculateTransferTax(input({ presaleRights: [presale("presale_right")] }), rates);
  const withRedevRight = calculateTransferTax(
    input({ presaleRights: [presale("redevelopment_right")] }),
    rates,
  );

  it("기준선 — 분양권 없음 → 전액 비과세 (calculatedTax 0)", () => {
    expect(clean.redevelopmentDetail?.oneRightExemptionApplied).toBe(true);
    expect(clean.calculatedTax).toBe(0);
    expect(clean.totalTax).toBe(0);
  });

  it("🔑 세대가 **분양권**을 보유하면 가목 요건 불충족 → 비과세 미적용", () => {
    expect(withPresale.redevelopmentDetail?.oneRightExemptionApplied).toBeUndefined();
    expect(withPresale.calculatedTax).toBeGreaterThan(0);
  });

  /**
   * ⚠️ **리뷰 문서의 수치(58,910,000 / 64,801,000)와 다르다 — 엔진 회귀가 아니다.**
   *
   * 리뷰의 대조군은 `residencePeriodMonths: 60`(거주 5년)을 썼는데 그 사실을 본문에 적지 않았다.
   * 실측으로 갈랐다 — 같은 fixture에 거주 60개월을 넣으면 §95② 표2 진입으로 LTHD가
   * 60,000,000 → 120,000,000이 되어 **정확히 58,910,000 / 64,801,000**이 나온다.
   * (거주 0개월 60,000,000 → 81,710,000 · 24개월 96,000,000 → 68,030,000 · 60개월 120,000,000 → 58,910,000)
   *
   * 이 anchor는 거주 0개월 fixture이므로 **81,710,000**이 이 조합에서 실제로 누락됐던 금액이다.
   */
  it("과세 전환 시 산출세액 81,710,000 · 세액합계 89,881,000 (거주 0개월 fixture)", () => {
    expect(withPresale.calculatedTax).toBe(81_710_000);
    expect(withPresale.totalTax).toBe(89_881_000);
  });

  it("리뷰 대조군 재현 — 거주 60개월이면 58,910,000 / 64,801,000 (표2 LTHD 120,000,000)", () => {
    const r = calculateTransferTax(
      input({ residencePeriodMonths: 60, presaleRights: [presale("presale_right")], householdHousingCount: 1 }),
      rates,
    );
    expect(r.longTermHoldingDeduction).toBe(120_000_000);
    expect(r.calculatedTax).toBe(58_910_000);
    expect(r.totalTax).toBe(64_801_000);
  });

  it("구별력 — 분양권 유무가 세액을 실제로 가른다 (종전에는 둘 다 0원이었다)", () => {
    expect(withPresale.totalTax).not.toBe(clean.totalTax);
  });

  it("⚠️ 조합원입주권(`redevelopment_right`)은 가목의 배제 대상이 아니다 — 비과세 유지", () => {
    expect(withRedevRight.redevelopmentDetail?.oneRightExemptionApplied).toBe(true);
    expect(withRedevRight.totalTax).toBe(0);
  });

  it("12억 초과 안분 경로도 분양권 보유 시 §89①4호 자체가 불성립 — 안분 미적용", () => {
    const over = calculateTransferTax(
      input({ transferPrice: 1_500_000_000, presaleRights: [presale("presale_right")] }),
      rates,
    );
    expect(over.redevelopmentDetail?.oneRightHighValueApplied).toBeUndefined();
  });
});
