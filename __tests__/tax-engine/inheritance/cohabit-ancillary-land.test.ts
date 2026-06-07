/**
 * G4: §23의2① 주택부수토지 면적한도 — anchor
 *
 * 법령: §23의2①(소득세법 §89①3호 준용) + 소득세 시행령 §154⑦
 *   배율: 수도권 주거·상업·공업 3배 / 수도권 녹지 5배 / 수도권 밖 5배 / 그 밖 10배
 *
 * 전제: 아파트·공동주택가격은 부수토지 포함 → G4 적용 불필요
 *   단독주택 대형토지를 별도 EstateItem으로 입력 시 초과분 비율 차감
 *
 * Pre-Do anchor (feedback_pre_anchor_verification):
 *   - G4-EXCEED: 함수 없음 → RED
 *   - G4-NOOP: ancillaryLandArea 미입력 → 차감 없음 = 기존 동작 → GREEN
 *
 * 계약 C4: AncillaryLandRegion enum 4종
 *   "metro_residential_commercial_industrial" | "metro_green" | "non_metro" | "other"
 */
import { describe, it, expect } from "vitest";
import {
  applyAncillaryLandLimit,
} from "@/lib/tax-engine/deductions/inheritance-deductions";

describe("G4 §23의2① 주택부수토지 면적한도 — applyAncillaryLandLimit", () => {
  // ─── 기본 동작 ─────────────────────────────────────────────
  it("G4-EXCEED 수도권 주거 3배, 부수토지400㎡>한도300㎡ → 초과 25% 차감 ★Pre-Do RED", () => {
    // buildingFootprintArea=100㎡, metro_residential_commercial_industrial → 3배 = 300㎡
    // ancillaryLandArea=400㎡, excess=100, ratio=100/400=0.25
    // adjustedHousePrice = floor(500_000_000 × 0.75) = 375_000_000
    const r = applyAncillaryLandLimit(
      100,
      400,
      "metro_residential_commercial_industrial",
      500_000_000,
    );
    expect(r.adjustedHousePrice).toBe(375_000_000);
    expect(r.limitArea).toBe(300);
    expect(r.excessArea).toBe(100);
    expect(r.excessRatio).toBeCloseTo(0.25, 6);
    expect(r.limitReductionAmount).toBe(125_000_000);
  });

  it("G4-NOOP ancillaryLandArea 미입력(undefined) → 차감 없음 (자동 fallback 금지)", () => {
    // ancillaryLandArea undefined → 조정 없이 원가 그대로
    const r = applyAncillaryLandLimit(100, undefined, "metro_residential_commercial_industrial", 500_000_000);
    expect(r.adjustedHousePrice).toBe(500_000_000);
    expect(r.limitReductionAmount).toBe(0);
  });

  it("G4-NOOP-UNDEFINED-REGION region undefined → 차감 없음", () => {
    const r = applyAncillaryLandLimit(100, 400, undefined, 500_000_000);
    expect(r.adjustedHousePrice).toBe(500_000_000);
    expect(r.limitReductionAmount).toBe(0);
  });

  it("G4-NOOP-FOOTPRINT-UNDEFINED buildingFootprintArea undefined → 차감 없음", () => {
    const r = applyAncillaryLandLimit(undefined, 400, "metro_residential_commercial_industrial", 500_000_000);
    expect(r.adjustedHousePrice).toBe(500_000_000);
    expect(r.limitReductionAmount).toBe(0);
  });

  it("G4-DETACHED-OK 수도권 주거, 부수토지250㎡ ≤ 한도300㎡ → 차감 없음", () => {
    const r = applyAncillaryLandLimit(100, 250, "metro_residential_commercial_industrial", 500_000_000);
    expect(r.adjustedHousePrice).toBe(500_000_000);
    expect(r.excessArea).toBe(0);
    expect(r.limitReductionAmount).toBe(0);
  });

  it("G4-EXACT-LIMIT 부수토지=한도 → 차감 없음 (경계)", () => {
    // 300㎡ = 100 × 3 → excessArea=0
    const r = applyAncillaryLandLimit(100, 300, "metro_residential_commercial_industrial", 500_000_000);
    expect(r.adjustedHousePrice).toBe(500_000_000);
    expect(r.excessArea).toBe(0);
  });

  // ─── 지역별 배율 ────────────────────────────────────────────
  it("G4-METRO-GREEN 수도권 녹지 5배, 건물100㎡, 부수토지600㎡>한도500㎡", () => {
    // limitArea=100×5=500, excessArea=100, excessRatio=100/600≈0.1667
    // adjustedHousePrice=floor(600_000_000×(1-100/600))=floor(600_000_000×500/600)=floor(500_000_000)=500_000_000
    const r = applyAncillaryLandLimit(100, 600, "metro_green", 600_000_000);
    expect(r.limitArea).toBe(500);
    expect(r.excessArea).toBe(100);
    // adjustedHousePrice = floor(600_000_000 × (1 - 100/600)) = floor(600_000_000 × 0.8333...) = 500_000_000
    expect(r.adjustedHousePrice).toBe(500_000_000);
  });

  it("G4-NON-METRO 수도권 밖 5배, 건물100㎡, 부수토지550㎡>한도500㎡", () => {
    const r = applyAncillaryLandLimit(100, 550, "non_metro", 1_000_000_000);
    expect(r.limitArea).toBe(500);
    expect(r.excessArea).toBe(50);
    // excessRatio = 50/550, adjustedHousePrice = floor(1_000_000_000 × (1 - 50/550))
    //   = floor(1_000_000_000 × 500/550) = floor(909_090_909.09) = 909_090_909
    expect(r.adjustedHousePrice).toBe(909_090_909);
  });

  it("G4-OTHER 그 밖 10배, 건물100㎡, 부수토지1100㎡>한도1000㎡", () => {
    const r = applyAncillaryLandLimit(100, 1100, "other", 500_000_000);
    expect(r.limitArea).toBe(1000);
    // excessRatio=100/1100, adjustedHousePrice=floor(500_000_000 × 1000/1100)=floor(454_545_454.54...)=454_545_454
    expect(r.adjustedHousePrice).toBe(454_545_454);
  });

  // ─── 정수 연산 검증 ──────────────────────────────────────────
  it("G4-FLOOR floor 연산 확인 (Math.floor, 반올림 아님)", () => {
    // excessRatio = 1/3 (소수점 무한반복)
    // buildingFootprintArea=100, ancillaryLandArea=150, metro_residential 3배 → limitArea=300
    // 150 < 300 → excessArea=0 → 차감 없음
    const r1 = applyAncillaryLandLimit(100, 150, "metro_residential_commercial_industrial", 500_000_000);
    expect(r1.adjustedHousePrice).toBe(500_000_000);

    // ancillaryLandArea=400>300, ratio=100/400=0.25
    // floor(500_000_000 × 0.75) = 375_000_000 (정수)
    const r2 = applyAncillaryLandLimit(100, 400, "metro_residential_commercial_industrial", 500_000_000);
    expect(r2.adjustedHousePrice).toBe(375_000_000);
  });

  // ─── 엣지 케이스 ────────────────────────────────────────────
  it("G4-ZERO-PRICE 주택가액 0 → 차감 없음(0)", () => {
    const r = applyAncillaryLandLimit(100, 400, "metro_residential_commercial_industrial", 0);
    expect(r.adjustedHousePrice).toBe(0);
  });

  it("G4-ALL-EXCESS 부수토지만 존재, 건물면적 0 → limitArea=0, 전체 초과", () => {
    // buildingFootprintArea=0 → limitArea=0×3=0, excessArea=ancillaryLandArea
    // 주택가액 전체 차감 → adjustedHousePrice = 0
    const r = applyAncillaryLandLimit(0, 300, "metro_residential_commercial_industrial", 500_000_000);
    expect(r.limitArea).toBe(0);
    expect(r.excessArea).toBe(300);
    expect(r.adjustedHousePrice).toBe(0);
  });
});
