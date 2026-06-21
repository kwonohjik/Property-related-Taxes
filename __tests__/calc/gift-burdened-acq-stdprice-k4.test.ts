/**
 * 부담부증여 양도소득세 — 취득시 기준시가 필수 조건 (validateStep ⑧)
 *
 * 정책: 시가 모드 + 실지취득가액(K-4) + 비-토지 자산은 취득시 기준시가가
 *   양도차익 계산에 영향이 없으므로(엔진 anchor: burdened-gift-commercial F-3-3) 입력 불필요.
 *   - K-1~3(기준시가 안분) / K-5(환산): 취득시 기준시가가 산식 인자 → 필수.
 *   - K-4(실지) + 토지: 공시지가 비율 분배 라우팅에 필요 → 필수.
 */
import { describe, it, expect } from "vitest";
import {
  validateStep,
  INITIAL_FORM,
  type FormState,
} from "@/components/calc/gift-tax-form-shared";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const STEP1 = 1;

interface BgtOverrides {
  valuationMode?: "sangjeungbeop_standard" | "sangjeungbeop_market";
  acquisitionMethod?: "actual" | "converted";
  standardPriceAtAcquisition?: number;
}

function buildingItem(
  category: "real_estate_building" | "real_estate_land",
  bgt: BgtOverrides,
): EstateItem {
  return {
    id: "asset1",
    category,
    name: "정안빌딩",
    standardPrice: 1_000_000_000, // 양도시 기준시가(평가액 — 채무 초과 경고 회피용)
    assumedDebtForGift: 400_000_000,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2012-01-01"),
      standardPriceAtAcquisition: bgt.standardPriceAtAcquisition ?? 0,
      valuationMode: bgt.valuationMode ?? "sangjeungbeop_market",
      marketValueAtTransfer: 1_000_000_000,
      acquisitionMethod: bgt.acquisitionMethod,
      actualAcquisitionTotal: 160_000_000,
    },
  } as unknown as EstateItem;
}

function form(item: EstateItem): FormState {
  return {
    ...INITIAL_FORM,
    giftDate: "2025-01-15",
    giftItems: [item],
    stockItems: [],
  };
}

describe("부담부증여 취득시 기준시가 — K-4 비-토지 입력 불필요", () => {
  it("시가+실지(K-4)+상업용 + 취득시 기준시가 미입력(0) → 통과", () => {
    const msg = validateStep(
      STEP1,
      form(
        buildingItem("real_estate_building", {
          valuationMode: "sangjeungbeop_market",
          acquisitionMethod: "actual",
          standardPriceAtAcquisition: 0,
        }),
      ),
    );
    expect(msg).toBeNull();
  });

  it("시가+환산(K-5)+상업용 + 취득시 기준시가 미입력(0) → 차단", () => {
    const msg = validateStep(
      STEP1,
      form(
        buildingItem("real_estate_building", {
          valuationMode: "sangjeungbeop_market",
          acquisitionMethod: "converted",
          standardPriceAtAcquisition: 0,
        }),
      ),
    );
    expect(msg).not.toBeNull();
    expect(msg).toContain("취득시 기준시가");
  });

  it("기준시가 안분(K-1~3)+상업용 + 취득시 기준시가 미입력(0) → 차단", () => {
    const msg = validateStep(
      STEP1,
      form(
        buildingItem("real_estate_building", {
          valuationMode: "sangjeungbeop_standard",
          standardPriceAtAcquisition: 0,
        }),
      ),
    );
    expect(msg).not.toBeNull();
    expect(msg).toContain("취득시 기준시가");
  });

  it("시가+실지(K-4)+토지 + 취득시 기준시가 미입력(0) → 차단 (분배 라우팅 필요)", () => {
    const msg = validateStep(
      STEP1,
      form(
        buildingItem("real_estate_land", {
          valuationMode: "sangjeungbeop_market",
          acquisitionMethod: "actual",
          standardPriceAtAcquisition: 0,
        }),
      ),
    );
    expect(msg).not.toBeNull();
    expect(msg).toContain("취득시 기준시가");
  });
});
