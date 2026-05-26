/**
 * §22② 최대주주 → 금융재산공제 배제 실연동 anchor
 *
 * Plan: docs/00-pm/inheritance-section22-major-shareholder-toggle.plan.md §6
 * 법령: 상증법 §22②(최대주주 보유 주식등은 금융재산공제 금융재산에 포함되지 아니한다)
 *
 * - AN-1: resolveFinancialEligibility — 비상장 V2 토글 ON(isSection22MajorShareholder=true) → false(제외)
 *         (구현 전 = 가드 없음 → unlisted_stock default true 반환 → RED)
 * - AN-2: suggestNetFinancialAssets — ON 시 비상장 평가액이 제안 순금융재산에서 제외
 * - AN-3: OFF/undefined → 기존대로 포함 (회귀 0)
 */

import { describe, expect, it } from "vitest";
import {
  resolveFinancialEligibility,
} from "@/lib/calc/financial-deduction-resolver";
import { suggestNetFinancialAssets } from "@/lib/calc/inheritance-deduction-suggest";
import { resolveAssetToggleVisibility } from "@/lib/calc/asset-toggle-visibility";
import type {
  EstateItem,
  UnlistedStockValuationInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// 비상장 V2 자산 — resolveFinancialEligibility는 unlistedStockValuationV2.isSection22MajorShareholder만 참조.
// 전체 V2 입력은 불필요하므로 해당 필드만 가진 partial 캐스팅.
function unlistedV2Asset(isSection22Major: boolean | undefined): EstateItem {
  return {
    id: "v2",
    category: "unlisted_stock",
    name: "비상장주식 V2",
    marketValue: 663_200_000,
    unlistedStockValuationV2: {
      isSection22MajorShareholder: isSection22Major,
    } as unknown as UnlistedStockValuationInput,
  };
}

// ============================================================
// AN-1 — resolveFinancialEligibility §22② 가드
// ============================================================
describe("[AN-1] §22② 가드 — 최대주주 ON → 금융재산공제 제외", () => {
  it("ON(true) → false (§22② 법정 배제)", () => {
    expect(resolveFinancialEligibility(unlistedV2Asset(true))).toBe(false);
  });

  it("§22② ON은 사용자 명시 isFinancialAssetForDeduction=true보다 우선 (false 반환)", () => {
    const item = { ...unlistedV2Asset(true), isFinancialAssetForDeduction: true };
    expect(resolveFinancialEligibility(item)).toBe(false);
  });
});

// ============================================================
// AN-3 — OFF/undefined 회귀 (포함 유지)
// ============================================================
describe("[AN-3] OFF/미입력 → 비상장 default 포함 (회귀)", () => {
  it("OFF(false) → true (포함)", () => {
    expect(resolveFinancialEligibility(unlistedV2Asset(false))).toBe(true);
  });
  it("undefined → true (포함)", () => {
    expect(resolveFinancialEligibility(unlistedV2Asset(undefined))).toBe(true);
  });
});

// ============================================================
// AN-2 — suggestNetFinancialAssets 제안값 제외
// ============================================================
describe("[AN-2] §22 순금융재산 제안 — ON 시 비상장 평가액 제외", () => {
  it("ON → 제안 순금융재산에서 비상장 평가액(663,200,000) 제외", () => {
    const on = suggestNetFinancialAssets([unlistedV2Asset(true)], []);
    expect(on.value).toBe(0);
  });
  it("OFF → 제안 순금융재산에 비상장 평가액 포함", () => {
    const off = suggestNetFinancialAssets([unlistedV2Asset(false)], []);
    expect(off.value).toBe(663_200_000);
  });
});

// ============================================================
// AN-6 — 부수효과: 토글 가시성 무회귀 (unlisted_stock base="default")
// ============================================================
describe("[AN-6] §22② 가드 추가 후 자산 토글 가시성 무회귀", () => {
  it("§22② ON/OFF 모두 financialDeduction 토글 가시성 'default' 유지", () => {
    // unlisted_stock base가 이미 default이고 가시성 로직은 default로 올리기만 하므로 변화 없음.
    // (§22② 배제는 resolveFinancialEligibility priority-0 가드가 담당 — AN-1 precedence 참조)
    expect(resolveAssetToggleVisibility(unlistedV2Asset(true)).financialDeduction).toBe("default");
    expect(resolveAssetToggleVisibility(unlistedV2Asset(false)).financialDeduction).toBe("default");
  });
});
