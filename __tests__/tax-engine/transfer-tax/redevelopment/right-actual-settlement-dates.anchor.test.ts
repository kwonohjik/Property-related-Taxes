/**
 * 입주권 양도 **실가 모드** — 인가후 분(가목) 열의 취득일자·양도일자 표시 anchor
 * (2026-08-13 사용자 제보).
 *
 * 결함: `runOriginalMember`(실가 경로)가 청산금 분 일자를 `isApt ? ... : undefined`로 계산해
 * subject="right"이면 **undefined**를 넣는다(`redevelopment.ts:640~649`). 신고서 인가후 분 열의
 * 취득일자·양도일자가 "-"로 비어 보인다. 납부·수령 양쪽 모두 발생.
 *
 * 다른 두 경로는 이미 **인가일 ~ 양도일**을 넣는다:
 *   - 토지 출자 환산 `runLandContribEstimated`      → `redevelopment.ts:293·294`
 *   - 주택 출자 수령 환산 `runHousingContribReceiveEstimated` → `redevelopment.ts:457·458`
 * 환산 모드 화면이 인가후 분에 「취득 2013-10-23(=인가일) / 양도 2026-03-02」을 표시하던 근거다.
 *
 * 픽스처는 제보 화면을 재현한다:
 *   취득 2009-04-09 · 인가 2016-10-23 · 양도 2026-03-02
 *   권리가액 300,000,000 · 청산금 50,000,000 · 종전 실가 180,000,000 · 양도가액 320,000,000
 *   ⇒ 인가전 250,000,000 / 150,000,000 / 차익 100,000,000 · 인가후 차익 70,000,000
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

const ACQ = new Date("2009-04-09");
const APPROVAL = new Date("2016-10-23");
const TRANSFER = new Date("2026-03-02");

function buildInput(direction: "pay" | "receive"): TransferTaxInput {
  const redev: RedevelopmentInfo = {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: APPROVAL,
    rightsValue: 300_000_000,
    settlementDirection: direction,
    settlementAmount: 50_000_000,
    settlementSaleDate: TRANSFER,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    acquisitionRounding: "floor",
  };
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 320_000_000,
    transferDate: TRANSFER,
    acquisitionDate: ACQ,
    acquisitionPrice: 180_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    redevelopment: redev,
  });
}

describe("입주권 실가 모드 — 인가후 분 일자 표시", () => {
  const receive = calculateTransferTax(buildInput("receive"), mockRates).redevelopmentDetail!;
  const pay = calculateTransferTax(buildInput("pay"), mockRates).redevelopmentDetail!;

  it("D-0: 수령 케이스가 제보 화면 값과 일치한다 (픽스처 정합 확인)", () => {
    expect(receive.preApproval.apportionedTransfer).toBe(250_000_000);
    expect(receive.preApproval.apportionedAcquisition).toBe(150_000_000);
    expect(receive.preApproval.gain).toBe(100_000_000);
    expect(receive.settlement.gain).toBe(70_000_000);
  });

  it("D-1: 수령 — 인가후 분 취득일자 = 인가일, 양도일자 = 양도일", () => {
    expect(receive.settlement.branchAcqDate).toEqual(APPROVAL);
    expect(receive.settlement.branchTransferDate).toEqual(TRANSFER);
  });

  it("D-2: 납부 — 인가후 분 취득일자 = 인가일, 양도일자 = 양도일", () => {
    expect(pay.settlement.branchAcqDate).toEqual(APPROVAL);
    expect(pay.settlement.branchTransferDate).toEqual(TRANSFER);
  });

  it("D-3: 인가전 분 일자는 종전대로 취득일 ~ 인가일 (§166⑤1호 — 회귀 가드)", () => {
    expect(receive.preApproval.branchAcqDate).toEqual(ACQ);
    expect(receive.preApproval.branchTransferDate).toEqual(APPROVAL);
  });
});
