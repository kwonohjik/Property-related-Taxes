/**
 * 양도가액 안분은 **양도시 기준시가 비율**만 쓴다 — 취득시 비율 후퇴 폐지.
 *
 * 계획서 근거: 사용자 확정 규칙 ①(2026-07-29)
 *   "양도가액을 토지·건물로 구분 — 계약서에 구분 또는 **양도시 기준시가**로 비율"
 * 법령: 소득령 §166⑥ → 부가가치세법 시행령 §64①1호 준용
 *   ("공급계약일 = 양도 **현재**의 기준시가" 비율).
 *
 * 🔴 종전 결함: `saleRatio?.land ?? landRatio`(split-gain.ts) — 양도시 기준시가 2필드가
 * 없으면 **취득시** 비율로 조용히 후퇴했다. 토지는 오르고 건물은 감가하므로 두 시점의
 * 비율은 크게 다르다(probe 실측: 취득시 40% vs 양도시 80% → 토지 양도가액 4억 차이).
 * 회귀 0 목적의 한시 코드였으나 법령 근거가 없어 폐지한다.
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { baseTransferInput } from "../_helpers/mock-rates";

/** 취득시 토지 비율 40% (토지 2억 = 100만 × 200㎡ / 총 5억) */
const base = (over: Record<string, unknown> = {}) =>
  baseTransferInput({
    propertyType: "housing",
    acquisitionDate: new Date("2010-06-01"),
    landAcquisitionDate: new Date("2010-06-01"), // 동일 → **비-별개취득**
    transferDate: new Date("2026-06-01"),
    transferPrice: 1_000_000_000,
    acquisitionPrice: 400_000_000,
    saleSplitMode: "actual",
    standardPricePerSqmAtAcquisition: 1_000_000,
    acquisitionArea: 200,
    standardPriceAtAcquisition: 500_000_000,
    ...over,
  });

describe("비-별개취득 — 규칙 ① 강제", () => {
  it("🔴 양도시 기준시가·양도가액 구분이 둘 다 없으면 차단 (취득시 비율 후퇴 금지)", () => {
    expect(() => calcSplitGain(base())).toThrow(/양도가액/);
  });

  it("양도시 기준시가 2필드 → 그 비율로 안분 (토지 80%)", () => {
    const r = calcSplitGain(
      base({ landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 200_000_000 }),
    );
    expect(r!.land.transferPrice).toBe(800_000_000);
    expect(r!.building.transferPrice).toBe(200_000_000);
  });

  it("계약서 구분(양도가액 직접입력) → 그 금액 그대로", () => {
    const r = calcSplitGain(base({ landTransferPrice: 700_000_000 }));
    expect(r!.land.transferPrice).toBe(700_000_000);
    expect(r!.building.transferPrice, "반대쪽은 잔액으로 확정").toBe(300_000_000);
  });

  it("🔴 취득시 비율(40%)이 양도가액 안분에 절대 쓰이지 않는다", () => {
    const r = calcSplitGain(
      base({ landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 200_000_000 }),
    );
    expect(r!.land.transferPrice, "취득시 비율이면 400,000,000이 된다").not.toBe(400_000_000);
  });
});

describe("별개취득 — 동일 규칙", () => {
  const sep = (over: Record<string, unknown> = {}) =>
    base({
      landAcquisitionDate: new Date("2008-06-01"),
      isSeparateAcquisition: true,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      landAcquisitionPrice: 150_000_000,
      buildingAcquisitionPrice: 100_000_000,
      ...over,
    });

  it("양도시 기준시가·구분 없음 → 차단", () => {
    expect(() => calcSplitGain(sep())).toThrow(/양도가액/);
  });

  it("양도시 기준시가 있으면 정상", () => {
    const r = calcSplitGain(
      sep({ landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 200_000_000 }),
    );
    expect(r!.land.transferPrice).toBe(800_000_000);
  });
});
