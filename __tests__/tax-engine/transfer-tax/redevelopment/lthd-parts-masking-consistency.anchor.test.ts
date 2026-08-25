/**
 * anchor — 비과세 마스킹·안분 후에도 **「장특공제 = 보유분 + 거주분」**이 성립한다 (E3-05)
 *
 * ## 신고서 서식이 두 값을 각각 읽는다
 *
 * `FilingFormTableRedevRows.ts`는 열별 보유분·거주분을 `b.lthdHoldingPart ?? b.lthd`로 읽고,
 * 합계 장특공제는 `result.longTermHoldingDeduction`(= 마스킹 후 값)을 쓴다. 두 소스가
 * 갈리면 **같은 표 안에서** 「공제 0인데 보유분은 6천만」이 인쇄된다.
 *
 * 2026-08-26 실측(수정 전) — 세 변환 모두 `lthd`만 건드리고 분해 2필드를 원값으로 남겼다:
 *
 * | 경로 | 실측 |
 * |---|---|
 * | `applySettlementExemption` (완공APT·수령 비과세) | 청산금 열 공제 0 vs 보유분 **52,500,000** |
 * | `applyOneRightExemption` 12억 초과 안분 | 인가전 열 공제 84,000,000 vs 보유분 **210,000,000** |
 * | `applyOneRightExemption` 전액 비과세 | 공제 0 vs 보유분 **210,000,000** |
 *
 * 같은 파일의 `applyLthdExclusion`(§95② 배제)은 처음부터 두 필드를 함께 0으로 덮고 있었고
 * 그 이유를 주석으로 적어 두었다 — **규약은 이미 있었고 세 곳이 따르지 않았을 뿐**이다.
 *
 * ## 조문
 *
 * · 「소득세법」 §95② 별표 표2 — 보유기간별·거주기간별 공제율을 따로 정한다.
 *   분해값은 그 두 율의 산물이므로 총액이 축소·소멸하면 함께 움직여야 한다.
 *
 * ⚠️ **undefined는 0으로 바꾸지 않는다** — 「분해 없음」(표1 등)과 「분해했는데 0」은 다른 뜻이다.
 *    `applyLthdExclusion`의 조건부 spread 규약을 그대로 쓴다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type {
  RedevelopmentInfo,
  RedevelopmentBranchDetail,
  RedevelopmentResult,
} from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

function run(over: Partial<RedevelopmentInfo>, inputOver: Partial<TransferTaxInput> = {}) {
  const redevelopment = {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2018-10-23"),
    rightsValue: 800_000_000,
    settlementDirection: "receive",
    settlementAmount: 200_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    acquisitionRounding: "floor",
    exemptionEligibleAtApproval: false,
    ...over,
  } as RedevelopmentInfo;
  const input: TransferTaxInput = baseTransferInput({
    propertyType: redevelopment.subject === "right" ? "right_to_move_in" : "redevelopment_apt",
    transferPrice: 1_100_000_000,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 252,
    redevelopment,
    ...inputOver,
  });
  return calculateTransferTax(input, mockRates).redevelopmentDetail!;
}

const BRANCHES = ["preApproval", "postApprovalExistingHouse", "settlement"] as const;

/** 분해가 부착된 열은 「공제 = 보유분 + 거주분」이어야 한다. */
function expectBranchConsistent(b: RedevelopmentBranchDetail, label: string) {
  const hasSplit = b.lthdHoldingPart !== undefined || b.lthdResidencePart !== undefined;
  if (!hasSplit) return; // 「분해 없음」은 그대로 둔다
  expect((b.lthdHoldingPart ?? 0) + (b.lthdResidencePart ?? 0), label).toBe(b.lthd);
}

function expectAllConsistent(d: RedevelopmentResult, label: string) {
  let holding = 0;
  let residence = 0;
  for (const k of BRANCHES) {
    expectBranchConsistent(d[k], `${label} · ${k}`);
    holding += d[k].lthdHoldingPart ?? 0;
    residence += d[k].lthdResidencePart ?? 0;
  }
  // 신고서 합계 행 — 장특공제 합계 vs 보유분+거주분 합계
  expect(holding + residence, `${label} · 합계`).toBe(d.total.lthd);
}

const RIGHT_ONE_HOUSEHOLD = {
  subject: "right" as const,
  settlementDirection: "pay" as const,
  settlementAmount: 50_000_000,
  exemptionEligibleAtApproval: true,
};
const RIGHT_INPUT = { householdHousingCount: 0, householdRightCount: 1 };

describe("E3-05 · 마스킹 3경로의 LTHD 분해 정합", () => {
  it("E3-05-01: 🔑 청산금 수령 비과세(applySettlementExemption) — 마스킹된 열의 보유분도 0이다", () => {
    const d = run({ rightsValue: 800_000_000, exemptionEligibleAtApproval: true });
    // 수정 전: 공제 0인데 보유분 52,500,000이 남아 합계가 그만큼 부풀었다.
    expect(d.settlement.lthd).toBe(0);
    expectAllConsistent(d, "settlementExemption");
  });

  it("E3-05-02: 🔑 1세대1입주권 12억 초과 안분 — 분해도 같은 비율로 축소된다", () => {
    const d = run(RIGHT_ONE_HOUSEHOLD, { ...RIGHT_INPUT, transferPrice: 2_000_000_000 });
    expect(d.preApproval.lthd).toBeGreaterThan(0); // 안분 후에도 공제는 남는다
    expectAllConsistent(d, "oneRight 12억초과");
  });

  it("E3-05-03: 🔑 1세대1입주권 전액 비과세 — 분해도 0이 된다", () => {
    const d = run(RIGHT_ONE_HOUSEHOLD, { ...RIGHT_INPUT, transferPrice: 520_000_000 });
    expect(d.total.lthd).toBe(0);
    expectAllConsistent(d, "oneRight 전액비과세");
  });

  it("E3-05-04: 대조군 — 마스킹이 없는 정상 경로도 정합이다 (규약 자체의 회귀 감시)", () => {
    expectAllConsistent(run({}), "정상 apt+receive");
    expectAllConsistent(
      run({ subject: "right", settlementDirection: "pay", settlementAmount: 50_000_000 }),
      "정상 right+pay",
    );
  });

  it("E3-05-05: §95② 배제(미등기)도 정합이다 — 이미 지켜지던 규약의 고정", () => {
    const d = run({}, { isUnregistered: true });
    expect(d.total.lthd).toBe(0);
    expectAllConsistent(d, "미등기 배제");
  });

  it("E3-05-06: 「분해 없음」은 0으로 바뀌지 않는다 — undefined가 보존된다", () => {
    // 표1 경로(1세대1주택 아님)는 거주분 분해가 없다. undefined를 0으로 덮으면
    // 신고서가 「분해했는데 거주분 0」으로 오독한다.
    const d = run(
      { subject: "right", settlementDirection: "pay", settlementAmount: 50_000_000 },
      { isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 },
    );
    expect(d.postApprovalExistingHouse.gain).toBe(0);
    expectAllConsistent(d, "표1 경로");
  });
});
