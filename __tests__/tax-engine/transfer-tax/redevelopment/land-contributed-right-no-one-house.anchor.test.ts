/**
 * 토지 출자 조합원입주권 — **1세대1주택 특례 미적용** anchor (2026-08-13 사용자 제보).
 *
 * 법령 근거 (KoreanLaw 원문 확인 2026-08-13, 소득세법 MST 280405):
 *   §89①4호 본문 — 「조합원입주권을 1개 보유한 1세대[…관리처분계획의 인가일… 현재
 *     **제3호가목에 해당하는 기존주택을 소유하는 세대**]가 …양도하는 경우」
 *     ⇒ 토지만 출자한 조합원은 인가일 현재 기존주택이 없어 **비과세 요건 자체가 불성립**.
 *   §95② 단서 — 「…대통령령으로 정하는 **1세대 1주택**(이에 딸린 토지를 포함한다)에 해당하는
 *     **자산**의 경우에는 …표 2…」 ⇒ 종전자산이 주택이 아니면 표2 진입 불가(표1만).
 *
 * 결함: `transfer-tax-redevelopment.ts:62`가 `isOneHousehold && householdHousingCount === 1`만
 * 보고 **출자자산 종류를 보지 않았다**. 환산 경로는 이미 `isOneHouseSingle: false`로 고정돼
 * 있었으나(`redevelopment-land-contribution.ts:166`) **실가 경로(`runOriginalMember`)는
 * `input.isOneHouseSingle`을 그대로 전달**해(`redevelopment.ts:535`) 표2가 적용됐다.
 *
 * 수정 전 실측: 결정세액 30,025,000(1세대1주택 ON) vs 44,926,000(OFF) — 약 1,490만원 과소.
 *
 * ⚠️ 가드 범위는 **subject="right"** 로 한정한다. 토지를 출자하고 완공 APT를 양도하는 경우
 *    (subject="apt")는 **주택 양도**라 §89①3호·§95② 표2 대상이 될 수 있다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

function buildInput(opts: {
  originalAssetType: "land" | "housing";
  isOneHousehold: boolean;
}): TransferTaxInput {
  const redev: RedevelopmentInfo = {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2016-10-23"),
    rightsValue: 300_000_000,
    settlementDirection: "pay",
    settlementAmount: 50_000_000,
    settlementSaleDate: new Date("2026-03-02"),
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: opts.originalAssetType,
  };
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 420_000_000,
    transferDate: new Date("2026-03-02"),
    acquisitionDate: new Date("2009-04-09"),
    acquisitionPrice: 180_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    redevelopment: redev,
    isOneHousehold: opts.isOneHousehold,
    householdHousingCount: opts.isOneHousehold ? 1 : 2,
    residencePeriodMonths: 60,
  });
}

describe("토지 출자 입주권 — 1세대1주택 특례 미적용", () => {
  const landOn = calculateTransferTax(
    buildInput({ originalAssetType: "land", isOneHousehold: true }),
    mockRates,
  );
  const landOff = calculateTransferTax(
    buildInput({ originalAssetType: "land", isOneHousehold: false }),
    mockRates,
  );

  it("E-1: 토지 출자 — 1세대1주택 ON/OFF가 결정세액을 바꾸지 않는다", () => {
    // 수정 전: 30,025,000(ON) ≠ 44,926,000(OFF) — 표2가 적용돼 세액 과소
    expect(landOn.determinedTax).toBe(landOff.determinedTax);
  });

  it("E-2: 토지 출자 — 1세대1주택 ON이어도 표1 기준 세액(44,926,000)", () => {
    expect(landOn.determinedTax).toBe(44_926_000);
  });

  it("E-3: 토지 출자 — 1세대1주택 ON이어도 비과세로 넘어가지 않는다", () => {
    expect(landOn.isExempt).toBe(false);
  });

  it("E-4: 주택 출자는 종전대로 1세대1주택이 반영된다 (과잉 차단 방지 회귀 가드)", () => {
    const housingOn = calculateTransferTax(
      buildInput({ originalAssetType: "housing", isOneHousehold: true }),
      mockRates,
    );
    const housingOff = calculateTransferTax(
      buildInput({ originalAssetType: "housing", isOneHousehold: false }),
      mockRates,
    );
    expect(housingOn.determinedTax).not.toBe(housingOff.determinedTax);
  });
});
