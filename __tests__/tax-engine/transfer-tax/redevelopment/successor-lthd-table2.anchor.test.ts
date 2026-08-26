/**
 * anchor — E1-08 : 승계조합원 분기가 §95② 표2에 진입하지 못한다.
 *
 * ## 조문
 *
 * · 소득세법 **§95②** 단서 — 「대통령령으로 정하는 **1세대 1주택**…에 해당하는 자산의 경우에는
 *   그 자산의 양도차익에 **표 2**에 따른 보유기간별 공제율…과 거주기간별 공제율…을 합산」
 * · 소득세법 시행령 **§159의4** — 「1세대가 **양도일 현재 국내에 1주택**을 보유하고 보유기간 중
 *   **거주기간이 2년 이상**인 것」
 * · 소득세법 시행령 **§162①4호** — 승계조합원 신축주택의 취득일 = 사용승인서 교부일(준공일)
 *
 * ⚠️ §95②의 「조합원으로부터 취득한 것은 제외한다」 괄호는 **§94①2호가목 조합원입주권**에 붙은
 *    것이다. 승계조합원이 **준공 후 신축주택**을 양도하면 그 자산은 §94①**1호**(건물)이므로
 *    그 괄호가 걸리지 않는다 — 표1·표2 판단은 §159의4 축을 그대로 탄다.
 *
 * ## 결함
 *
 * `runSuccessorMember`가 `isOneHouseSingle`·거주월수를 **한 번도 읽지 않고**
 * 자체 정의한 `computeTable1Rate`로 **표1만** 적용했다. 같은 파일 헤더는 이 분기를
 * 「단순 housing 양도와 동치 처리」라고 선언하는데, 단순 주택 양도라면 표2가 적용돼야 한다.
 *
 * 더구나 **상위 오케스트레이터는 같은 입력을 1세대1주택으로 인정해** §95③ 12억 안분을
 * 발동시킨다 — 한 계산 안에서 1세대1주택 여부가 **두 개의 답**을 가졌다. 방향은 불리하다.
 *
 * ## 실측 (mock 세율 · 인가 2009-01-10 · 입주권 승계 2010-05-01 · 준공 2011-03-01
 *          · 2023-02-16 신축APT를 2,000,000,000에 양도 · 취득가 500,000,000)
 *
 * | | LTHD율 | LTHD | 12억 안분 |
 * |---|---|---|---|
 * | 종전 | 표1 0.22 | 132,000,000 | **1세대1주택으로 발동** ← 모순 |
 * | 수정 후 (거주 132개월) | 표2 0.80 | 480,000,000 | 발동 |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();

function redevInfo(extra: Partial<RedevelopmentInfo> = {}): RedevelopmentInfo {
  return {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2009-01-10"),
    rightsValue: 0,
    settlementDirection: "pay",
    settlementAmount: 0,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    isSuccessorMember: true,
    completionDate: new Date("2011-03-01"),
    ...extra,
  };
}

function input(o: Partial<TransferTaxInput> = {}, redev: Partial<RedevelopmentInfo> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 2_000_000_000,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2010-05-01"),
    acquisitionPrice: 500_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isSuccessorRightToMoveIn: true,
    redevelopment: redevInfo(redev),
    ...o,
  });
}

describe("E1-08 anchor — 승계조합원 신축주택도 §159의4 축을 탄다", () => {
  /** 거주 132개월(11년) — §159의4 「거주 2년 이상」 충족 */
  const oneHouseResided = calculateTransferTax(
    input({}, { newHouseResidenceMonths: 132 }),
    rates,
  );
  /** 다주택 — 표1 */
  const multiHouse = calculateTransferTax(
    input({ isOneHousehold: false, householdHousingCount: 2 }, { newHouseResidenceMonths: 132 }),
    rates,
  );
  /** 1세대1주택이지만 거주 12개월 — §159의4 미충족 → 표1 */
  const shortStay = calculateTransferTax(
    input({}, { newHouseResidenceMonths: 12 }),
    rates,
  );

  it("기준선 — 다주택은 표1 (보유 11년 × 2% = 0.22)", () => {
    expect(multiHouse.redevelopmentDetail?.postApprovalExistingHouse.lthdRate).toBe(0.22);
  });

  it("🔑 1세대1주택 + 거주 2년 이상 → 표2 진입 (보유 0.40 + 거주 0.40 = 0.80)", () => {
    expect(oneHouseResided.redevelopmentDetail?.postApprovalExistingHouse.lthdRate).toBe(0.8);
  });

  it("거주 2년 미만이면 표1 — §159의4 「보유기간 중 거주기간이 2년 이상」", () => {
    expect(shortStay.redevelopmentDetail?.postApprovalExistingHouse.lthdRate).toBe(0.22);
  });

  it("🔑 한 계산 안에서 1세대1주택 여부가 하나의 답을 갖는다 — 12억 안분과 LTHD 표가 일치", () => {
    // 12억 안분은 종전에도 1세대1주택으로 발동했다. LTHD만 표1이었다.
    expect(oneHouseResided.redevelopmentDetail?.highValueAllocation).toBeDefined();
    expect(oneHouseResided.redevelopmentDetail?.postApprovalExistingHouse.lthdRate).toBeGreaterThan(0.3);
  });

  it("🔑 구별력 — 1세대1주택 여부가 LTHD를 실제로 가른다 (종전 두 값이 같았다)", () => {
    expect(oneHouseResided.redevelopmentDetail?.postApprovalExistingHouse.lthdRate)
      .not.toBe(multiHouse.redevelopmentDetail?.postApprovalExistingHouse.lthdRate);
    expect(oneHouseResided.totalTax).toBeLessThan(multiHouse.totalTax);
  });

  it("보유 3년 미만은 표1·표2 이전에 LTHD 자체가 0 (§95② 「보유기간이 3년 이상인 것」)", () => {
    const shortHold = calculateTransferTax(
      input({ transferDate: new Date("2013-01-01") }, { newHouseResidenceMonths: 12 }),
      rates,
    );
    expect(shortHold.redevelopmentDetail?.postApprovalExistingHouse.lthdRate).toBe(0);
  });
});
