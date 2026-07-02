/**
 * G4: §23의2① 주택부수토지 면적한도 — anchor
 *
 * 법령: §23의2①(소득세법 §89①3호 준용) + 소득세 시행령 §154⑦
 *   배율: 수도권 주거·상업·공업 3배 / 수도권 녹지 5배 / 수도권 밖 5배 / 그 밖 10배
 *
 * 리뷰 #16 정정: 개별주택가격은 건물+토지 일체이므로 초과분은 '부수토지 공시가격(토지분)'에서만
 *   비례 차감하고 건물분은 보존한다. applyAncillaryLandLimit 5번째 인자 = ancillaryLandStdPrice.
 *   limitReductionAmount = floor(landStdPrice × excessArea / ancillaryLandArea).
 *   ※ 아래 순수토지 케이스(landStdPrice = cohabitHouseStdPrice)는 건물분 0 = 전액 토지 상황으로,
 *     지역별 배율·floor 검증용. 건물분 보존은 G4-BUILDING-PRESERVE 참조.
 *
 * 계약 C4: AncillaryLandRegion enum 4종
 *   "metro_residential_commercial_industrial" | "metro_green" | "non_metro" | "other"
 */
import { describe, it, expect } from "vitest";
import {
  applyAncillaryLandLimit,
} from "@/lib/tax-engine/deductions/inheritance-deductions";

const METRO = "metro_residential_commercial_industrial" as const;

describe("G4 §23의2① 주택부수토지 면적한도 — applyAncillaryLandLimit", () => {
  // ─── 리뷰 #16: 건물분 보존 (핵심 정정) ───────────────────────
  it("G4-BUILDING-PRESERVE 결합 5억(건물2억+토지3억), 초과 400/1000 → 건물 보존, 3.8억", () => {
    // 건물100㎡ metro 3배 → 한도 300㎡. 부수토지 1000㎡ → excess 700? → 아니, 한도=footprint×배율
    // footprint=200㎡ → 한도 600㎡. ancillaryLandArea=1000 → excess=400.
    // excessLandValue = floor(300_000_000(토지분) × 400/1000) = 120_000_000
    // adjustedHousePrice = 500_000_000 − 120_000_000 = 380_000_000 (건물 2억 전액 보존)
    const r = applyAncillaryLandLimit(200, 1000, METRO, 500_000_000, 300_000_000);
    expect(r.limitArea).toBe(600);
    expect(r.excessArea).toBe(400);
    expect(r.limitReductionAmount).toBe(120_000_000);
    expect(r.adjustedHousePrice).toBe(380_000_000);
  });

  it("G4-NOOP-NO-LANDPRICE 3필드 입력·토지분 공시가격 미입력 → 차감 없음 (자동 fallback 금지)", () => {
    const r = applyAncillaryLandLimit(100, 400, METRO, 500_000_000, undefined);
    expect(r.adjustedHousePrice).toBe(500_000_000);
    expect(r.limitReductionAmount).toBe(0);
  });

  // ─── 기본 동작 (순수토지: landStdPrice = 결합가격) ───────────
  it("G4-EXCEED 수도권 주거 3배, 부수토지400㎡>한도300㎡ → 초과 25% 차감", () => {
    // buildingFootprintArea=100㎡, metro 3배 = 300㎡, ancillaryLandArea=400㎡, excess=100, 25%
    // landStdPrice=500_000_000(순수토지) → reduction=floor(500M×100/400)=125M, adjusted=375M
    const r = applyAncillaryLandLimit(100, 400, METRO, 500_000_000, 500_000_000);
    expect(r.adjustedHousePrice).toBe(375_000_000);
    expect(r.limitArea).toBe(300);
    expect(r.excessArea).toBe(100);
    expect(r.excessRatio).toBeCloseTo(0.25, 6);
    expect(r.limitReductionAmount).toBe(125_000_000);
  });

  it("G4-NOOP ancillaryLandArea 미입력(undefined) → 차감 없음 (자동 fallback 금지)", () => {
    const r = applyAncillaryLandLimit(100, undefined, METRO, 500_000_000, 500_000_000);
    expect(r.adjustedHousePrice).toBe(500_000_000);
    expect(r.limitReductionAmount).toBe(0);
  });

  it("G4-NOOP-UNDEFINED-REGION region undefined → 차감 없음", () => {
    const r = applyAncillaryLandLimit(100, 400, undefined, 500_000_000, 500_000_000);
    expect(r.adjustedHousePrice).toBe(500_000_000);
    expect(r.limitReductionAmount).toBe(0);
  });

  it("G4-NOOP-FOOTPRINT-UNDEFINED buildingFootprintArea undefined → 차감 없음", () => {
    const r = applyAncillaryLandLimit(undefined, 400, METRO, 500_000_000, 500_000_000);
    expect(r.adjustedHousePrice).toBe(500_000_000);
    expect(r.limitReductionAmount).toBe(0);
  });

  it("G4-DETACHED-OK 수도권 주거, 부수토지250㎡ ≤ 한도300㎡ → 차감 없음", () => {
    const r = applyAncillaryLandLimit(100, 250, METRO, 500_000_000, 500_000_000);
    expect(r.adjustedHousePrice).toBe(500_000_000);
    expect(r.excessArea).toBe(0);
    expect(r.limitReductionAmount).toBe(0);
  });

  it("G4-EXACT-LIMIT 부수토지=한도 → 차감 없음 (경계)", () => {
    const r = applyAncillaryLandLimit(100, 300, METRO, 500_000_000, 500_000_000);
    expect(r.adjustedHousePrice).toBe(500_000_000);
    expect(r.excessArea).toBe(0);
  });

  // ─── 지역별 배율 (순수토지) ─────────────────────────────────
  it("G4-METRO-GREEN 수도권 녹지 5배, 건물100㎡, 부수토지600㎡>한도500㎡", () => {
    // limitArea=500, excess=100, reduction=floor(600M×100/600)=100M, adjusted=500M
    const r = applyAncillaryLandLimit(100, 600, "metro_green", 600_000_000, 600_000_000);
    expect(r.limitArea).toBe(500);
    expect(r.excessArea).toBe(100);
    expect(r.adjustedHousePrice).toBe(500_000_000);
  });

  it("G4-NON-METRO 수도권 밖 5배, 건물100㎡, 부수토지550㎡>한도500㎡", () => {
    // reduction=floor(1,000,000,000×50/550)=90,909,090, adjusted=909,090,910
    const r = applyAncillaryLandLimit(100, 550, "non_metro", 1_000_000_000, 1_000_000_000);
    expect(r.limitArea).toBe(500);
    expect(r.excessArea).toBe(50);
    expect(r.adjustedHousePrice).toBe(909_090_910);
  });

  it("G4-OTHER 그 밖 10배, 건물100㎡, 부수토지1100㎡>한도1000㎡", () => {
    // reduction=floor(500M×100/1100)=45,454,545, adjusted=454,545,455
    const r = applyAncillaryLandLimit(100, 1100, "other", 500_000_000, 500_000_000);
    expect(r.limitArea).toBe(1000);
    expect(r.adjustedHousePrice).toBe(454_545_455);
  });

  // ─── 정수 연산 검증 ──────────────────────────────────────────
  it("G4-FLOOR floor 연산 확인 (Math.floor, 반올림 아님)", () => {
    const r1 = applyAncillaryLandLimit(100, 150, METRO, 500_000_000, 500_000_000);
    expect(r1.adjustedHousePrice).toBe(500_000_000);
    // reduction=floor(500M×100/400)=125M, adjusted=375M
    const r2 = applyAncillaryLandLimit(100, 400, METRO, 500_000_000, 500_000_000);
    expect(r2.adjustedHousePrice).toBe(375_000_000);
  });

  // ─── 엣지 케이스 ────────────────────────────────────────────
  it("G4-ZERO-PRICE 주택가액 0 → 차감 없음(0)", () => {
    const r = applyAncillaryLandLimit(100, 400, METRO, 0, 0);
    expect(r.adjustedHousePrice).toBe(0);
  });

  it("G4-ALL-EXCESS 부수토지만 존재, 건물면적 0 → limitArea=0, 전체 초과", () => {
    // footprint=0 → limitArea=0, excess=ancillaryLandArea. 순수토지(landStdPrice=결합가) → 전액 차감
    const r = applyAncillaryLandLimit(0, 300, METRO, 500_000_000, 500_000_000);
    expect(r.limitArea).toBe(0);
    expect(r.excessArea).toBe(300);
    expect(r.adjustedHousePrice).toBe(0);
  });

  it("G4-LAND-CLAMP 토지분 공시가격 > 결합가격 → 차감액은 결합가로 clamp (음수 방지)", () => {
    // landStdPrice=600M > combined 500M, excess 전액 → reduction=floor(600M×300/300)=600M → clamp 500M
    const r = applyAncillaryLandLimit(0, 300, METRO, 500_000_000, 600_000_000);
    expect(r.limitReductionAmount).toBe(500_000_000);
    expect(r.adjustedHousePrice).toBe(0);
  });
});
