/**
 * 입주권 LTHD는 **신축주택 거주월수를 산입하지 않는다** (2026-08-14).
 *
 * 입주권(subject="right")은 완공 **전** 권리 양도라 신축 APT 거주가 존재할 수 없다.
 * 종전에는 `computeRedevelopmentLthd`가 `existingResidenceMonths = prior + new`를
 * 그대로 `computeRightLthd`에 넘겨, 신축 거주월수만 입력해도 인가전 분 LTHD가
 * 표1 14% → 표2 68%까지 올라갔다(실측).
 *
 * 방어선 4층 중 **엔진 정본 가드**를 보는 anchor다. UI·API 게이트를 우회하는
 * 별도 조립 경로(다건 route 등)까지 여기서 덮는다.
 *
 * 근거: 소득세법 §95② 단서 · 시행령 §166⑤1호 (입주권은 인가전 분만 LTHD 대상)
 */
import { describe, it, expect } from "vitest";
import { computeRedevelopmentLthd } from "@/lib/tax-engine/redevelopment-lthd";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const ACQ = new Date("2009-04-09");
const APPROVAL = new Date("2016-10-23");
const TRANSFER = new Date("2026-03-02");

function info(subject: "right" | "apt"): RedevelopmentInfo {
  return {
    subject,
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: APPROVAL,
    rightsValue: 300_000_000,
    settlementDirection: "pay",
    settlementAmount: 50_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
  } as unknown as RedevelopmentInfo;
}

function lthd(subject: "right" | "apt", prior?: number, next?: number) {
  return computeRedevelopmentLthd({
    redevelopment: info(subject),
    acquisitionDate: ACQ,
    transferDate: TRANSFER,
    isSuccessorRightToMoveIn: false,
    isOneHouseSingle: true,
    priorHouseResidenceMonths: prior,
    newHouseResidenceMonths: next,
  } as never);
}

describe("입주권 LTHD — 신축주택 거주월수 미산입", () => {
  it("L-1: 신축 거주 120개월만 입력해도 거주율이 0이다 (종전 40%p 가산)", () => {
    const base = lthd("right", 0, 0);
    const leaked = lthd("right", 0, 120);

    expect(leaked.preApproval.residenceRate).toBe(0);
    expect(leaked.preApproval.rate).toBe(base.preApproval.rate);
  });

  it("L-2: 종전주택 거주월수는 그대로 산입된다 (사례 36 회귀 방지)", () => {
    const none = lthd("right", 0, 0);
    const lived = lthd("right", 24, 0);

    expect(lived.preApproval.residenceRate).toBeGreaterThan(0);
    expect(lived.preApproval.rate).toBeGreaterThan(none.preApproval.rate);
  });

  it("L-3: 신축 거주월수를 더해도 종전주택 거주분만 반영된다", () => {
    const priorOnly = lthd("right", 24, 0);
    const withNew = lthd("right", 24, 60);

    expect(withNew.preApproval.rate).toBe(priorOnly.preApproval.rate);
    expect(withNew.preApproval.residenceRate).toBe(priorOnly.preApproval.residenceRate);
  });

  it("L-4: 완공 APT는 종전 그대로 — 신축 거주월수가 반영된다 (사례 45 회귀 방지)", () => {
    const priorOnly = lthd("apt", 24, 0);
    const withNew = lthd("apt", 24, 60);

    expect(withNew.preApproval.rate).toBeGreaterThan(priorOnly.preApproval.rate);
  });
});
