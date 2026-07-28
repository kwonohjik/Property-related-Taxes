/**
 * 감사 확정 결함 회귀 — lib/tax-engine/redevelopment.ts
 *
 * 결함 ref:
 *  - redevelopment.ts:189 (confirmed, drift) — 토지 출자 입주권 환산 경로에서
 *    인가전 필요경비(preApprovalExpenses)가 신고서 필요경비 칸에는 표시되나
 *    양도차익(preApprovalGain)에는 미차감 → 신고서 행 자기일관성 붕괴.
 *    법령: §163⑥ 개산공제가 환산모드 필요경비를 대체(§97② 환산 미차감,
 *    조심2016서2576). 정답: 표시 필요경비 = 개산공제만, preApprovalExpenses 미표시.
 *  - redevelopment.ts:182·328 (plausible, drift) — land·housing 환산 경로 분기
 *    보유월수를 lthdHoldingYears×12(연단위 절사)로 재구성해 잔여월(0~11)·일수 소실.
 *    법령: §166⑤1호 보유기간 = 취득일 ~ 인가일(초일불산입). 세액 무영향(표시 전용).
 *
 * 기대값은 조문·초일불산입 달력 산술로 독립 도출(엔진 출력 베끼기 금지).
 */

import { describe, it, expect } from "vitest";
import { runRedevelopment } from "@/lib/tax-engine/redevelopment";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

// ──────────────────────────────────────────────────────────────────────────────
// 결함 189 — 토지 출자 입주권 환산: 신고서 필요경비 자기일관 + 양도차익 불변
// ──────────────────────────────────────────────────────────────────────────────

// 사례 37 기반 토지 출자 입주권 (환산 모드). 취득 2007-04-09, 인가 2014-10-23.
// §166③ 환산취득가 = floor(300M × 100M / 150M) = 200,000,000
// §163⑥ 개산공제 = floor(100M × 3%) = 3,000,000
// §166①1호 인가전 양도차익 = 300M − 200M − 3M = 97,000,000 (preApprovalExpenses 미차감)
function landRedevInfo(preApprovalExpenses: number): RedevelopmentInfo {
  return {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2014-10-23"),
    rightsValue: 300_000_000,
    settlementDirection: "pay",
    settlementAmount: 100_000_000,
    preApprovalExpenses,
    postApprovalExpenses: 0,
    originalAssetType: "land",
    landStdPriceAtAcq: 100_000_000,
    landStdPriceAtApproval: 150_000_000,
    acquisitionRounding: "floor",
  };
}

function runLand(preApprovalExpenses: number) {
  return runRedevelopment({
    redevelopment: landRedevInfo(preApprovalExpenses),
    acquisitionDate: new Date("2007-04-09"),
    transferDate: new Date("2023-03-02"),
    transferPrice: 520_000_000,
    useEstimatedAcquisition: true,
  });
}

describe("결함189 — 토지 출자 입주권 환산: 인가전 필요경비 표시/차감 정합", () => {
  it("양도차익은 인가전 필요경비와 무관하게 불변 (환산모드 미차감)", () => {
    const gain0 = runLand(0).preApproval.gain;
    const gain10m = runLand(10_000_000).preApproval.gain;
    // §163⑥ 개산공제만 차감 → preApprovalExpenses 값과 무관하게 97,000,000
    expect(gain0).toBe(97_000_000);
    expect(gain10m).toBe(97_000_000);
    expect(gain10m).toBe(gain0);
  });

  it("표시 필요경비 = 개산공제(3,000,000)만 (preApprovalExpenses 미가산)", () => {
    // 인가전 필요경비 10,000,000 입력에도 표시 필요경비는 개산공제 3,000,000 고정
    expect(runLand(10_000_000).preApproval.expenses).toBe(3_000_000);
    expect(runLand(0).preApproval.expenses).toBe(3_000_000);
  });

  it("신고서 행 자기일관: 의제양도가 − 취득가 − 필요경비 = 양도차익", () => {
    const pre = runLand(10_000_000).preApproval;
    // 300,000,000 − 200,000,000 − 3,000,000 = 97,000,000
    expect(pre.apportionedTransfer).toBe(300_000_000);
    expect(pre.apportionedAcquisition).toBe(200_000_000);
    expect(
      pre.apportionedTransfer - pre.apportionedAcquisition - (pre.expenses ?? 0),
    ).toBe(pre.gain);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 결함 182·328 — 분기 보유월수·일수: 잔여월 보존 (표시 전용, 세액 불변)
// ──────────────────────────────────────────────────────────────────────────────

describe("결함182 — 토지 환산 경로 분기 보유기간 잔여월/일 보존 (§166⑤1호)", () => {
  const pre = runLand(0).preApproval;

  it("보유월수 = 90개월 (취득 2007-04-09 → 인가 2014-10-23, 초일불산입 만 7년 6개월)", () => {
    // 초일불산입: 2007-04-10 기산. 7년 → 2014-04-10, +6개월 → 2014-10-10, +13일 → 2014-10-23.
    // 7 × 12 + 6 = 90 (기존 84 = 7×12 로 잔여 6개월 소실).
    expect(pre.holdingMonths).toBe(90);
  });

  it("보유일수 = 13일 (2014-10-10 ~ 2014-10-23)", () => {
    expect(pre.holdingDays).toBe(13);
  });

  it("세액 무영향: LTHD율 14%·LTHD 13,580,000 불변 (만 7년, 표1 §95②)", () => {
    // 표1 보유율은 만 7년(=floor(90/12)) × 2% = 14% — 잔여월 재구성이 세율에 영향 없음.
    expect(pre.lthdRate).toBe(0.14);
    expect(pre.lthd).toBe(13_580_000);
  });
});

describe("결함328 — 주택 출자 입주권 환산 경로 분기 보유기간 잔여월/일 보존", () => {
  // 사례 39 기반: 취득 2008-04-09, 인가 2013-10-23, 청산금 수령.
  const housingRedevInfo: RedevelopmentInfo = {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2013-10-23"),
    rightsValue: 300_000_000,
    settlementDirection: "receive",
    settlementAmount: 50_000_000,
    settlementSaleDate: new Date("2023-03-02"),
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    housingStdPriceAtAcq: 120_000_000,
    housingStdPriceAtApproval: 200_000_000,
    acquisitionRounding: "floor",
  };

  const pre = runRedevelopment({
    redevelopment: housingRedevInfo,
    acquisitionDate: new Date("2008-04-09"),
    transferDate: new Date("2023-03-02"),
    transferPrice: 320_000_000,
    useEstimatedAcquisition: true,
  }).preApproval;

  it("보유월수 = 66개월 (초일불산입 만 5년 6개월)", () => {
    // 2008-04-10 기산. 5년 → 2013-04-10, +6개월 → 2013-10-10, +13일 → 2013-10-23.
    // 5 × 12 + 6 = 66 (기존 60 = 5×12 로 잔여 6개월 소실).
    expect(pre.holdingMonths).toBe(66);
  });

  it("보유일수 = 13일 (2013-10-10 ~ 2013-10-23)", () => {
    expect(pre.holdingDays).toBe(13);
  });

  it("세액 무영향: LTHD율 10%·LTHD 9,700,000 불변 (만 5년, 표1)", () => {
    expect(pre.lthdRate).toBe(0.10);
    expect(pre.lthd).toBe(9_700_000);
  });
});
