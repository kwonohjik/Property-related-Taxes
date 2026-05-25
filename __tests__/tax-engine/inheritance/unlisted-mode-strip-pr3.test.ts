/**
 * PR-3 Pre-Do anchor — resolveActiveUnlistedValuation 헬퍼
 *
 * 구현 전 먼저 실패 확인 후 구현하는 강제 정책
 * (feedback_pre_anchor_verification 정책 준수).
 *
 * 검증 항목:
 *   C-2: simple 모드 + V2 잔존 → 엔진에 V2 strip
 *   C-3: formal 모드 최초 → V2 그대로 유지
 *   C-4: formal 모드 재진입 → V2 그대로
 *   C-5: simple→formal→simple 왕복 → 두 데이터 객체 모두 폼 state에 보존
 *   C-8: 구버전 mode 없음 + V2 있음 → formal로 자동 판정
 *   C-9: 구버전 mode 없음 + V2 없음 → simple로 자동 판정
 *   비상장이 아닌 category → 변경 없이 그대로 반환
 */

import { describe, it, expect } from "vitest";
import { resolveActiveUnlistedValuation } from "@/lib/calc/unlisted-valuation-mode";
import type { EstateItem, UnlistedStockValuationInput } from "@/lib/tax-engine/types/inheritance-gift.types";
import { createDefaultUnlistedStockV2 } from "@/components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card";

// ────────────────────────────────────────────────────
// 픽스처 헬퍼
// ────────────────────────────────────────────────────

function makeUnlistedItem(overrides: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "test-1",
    category: "unlisted_stock",
    name: "테스트주식회사",
    unlistedStockData: {
      totalShares: 1000,
      ownedShares: 100,
      weightedNetIncome: 50_000_000,
      netAssetValue: 200_000_000,
      capitalizationRate: 0.1,
    },
    ...overrides,
  };
}

// V2 stub — createDefaultUnlistedStockV2()로 생성 (필수 필드 자동 포함)
// 테스트에서는 동일 참조 비교용으로 사용 (타입 안전)
const STUB_V2: UnlistedStockValuationInput = createDefaultUnlistedStockV2();

// ────────────────────────────────────────────────────
// 테스트
// ────────────────────────────────────────────────────

describe("resolveActiveUnlistedValuation — PR-3 Pre-Do anchor", () => {
  it("비상장이 아닌 category는 변경 없이 그대로 반환", () => {
    const item: EstateItem = {
      id: "land-1",
      category: "real_estate_land",
      name: "테스트 토지",
      marketValue: 100_000_000,
    };
    const result = resolveActiveUnlistedValuation(item);
    expect(result).toBe(item); // 동일 참조
  });

  it("C-9: 구버전 mode 없음 + V2 없음 → simple로 판정, V1 데이터 그대로", () => {
    const item = makeUnlistedItem(); // unlistedValuationMode 없음, V2 없음
    const result = resolveActiveUnlistedValuation(item);
    expect(result.unlistedStockData).toBeDefined();
    expect(result.unlistedStockValuationV2).toBeUndefined();
  });

  it("C-8: 구버전 mode 없음 + V2 있음 → formal로 판정, V2 그대로 유지", () => {
    const item = makeUnlistedItem({
      // unlistedValuationMode 없음 (구버전)
      unlistedStockValuationV2: STUB_V2,
    });
    const result = resolveActiveUnlistedValuation(item);
    expect(result.unlistedStockValuationV2).toBeDefined();
    expect(result.unlistedStockValuationV2).toBe(STUB_V2); // 동일 참조
  });

  it("C-2: simple 모드 + V2 잔존 → 엔진 전달 시 V2 strip (폼 state는 건드리지 않음)", () => {
    const item = makeUnlistedItem({
      unlistedValuationMode: "simple",
      unlistedStockValuationV2: STUB_V2, // 과거 정식 입력 잔존
    });
    const result = resolveActiveUnlistedValuation(item);
    // V2 strip됨 — 엔진에 V2가 전달되지 않아야 함
    expect(result.unlistedStockValuationV2).toBeUndefined();
    // V1 데이터는 보존
    expect(result.unlistedStockData).toBeDefined();
    // 원본 item은 변경되지 않음 (폼 state 보존)
    expect(item.unlistedStockValuationV2).toBe(STUB_V2);
  });

  it("C-3: formal 모드 + V2 있음 → V2 그대로 유지", () => {
    const item = makeUnlistedItem({
      unlistedValuationMode: "formal",
      unlistedStockValuationV2: STUB_V2,
    });
    const result = resolveActiveUnlistedValuation(item);
    expect(result.unlistedStockValuationV2).toBe(STUB_V2); // 동일 참조
    expect(result.unlistedStockData).toBeDefined(); // V1도 보존
  });

  it("C-4: formal 모드 재진입 → V2 그대로 (item과 동일 참조)", () => {
    const item = makeUnlistedItem({
      unlistedValuationMode: "formal",
      unlistedStockValuationV2: STUB_V2,
    });
    const result = resolveActiveUnlistedValuation(item);
    // formal 모드에서는 item을 그대로 반환 (동일 참조)
    expect(result).toBe(item);
  });

  it("C-5: simple→formal→simple 왕복 후 두 데이터 객체 모두 보존 (폼 state 시뮬)", () => {
    // 초기 상태: simple 모드, V1 입력됨
    let formItem = makeUnlistedItem({
      unlistedValuationMode: "simple",
    });

    // step 1: formal 모드 선택 → V2 생성, 폼 state에 저장
    formItem = {
      ...formItem,
      unlistedValuationMode: "formal",
      unlistedStockValuationV2: STUB_V2,
    };
    expect(formItem.unlistedValuationMode).toBe("formal");
    expect(formItem.unlistedStockValuationV2).toBeDefined();
    expect(formItem.unlistedStockData).toBeDefined(); // V1 보존

    // step 2: simple로 복귀 → V2 삭제 금지 (폼 state에 보존), mode만 변경
    formItem = {
      ...formItem,
      unlistedValuationMode: "simple",
      // V2는 삭제하지 않음!
    };
    expect(formItem.unlistedValuationMode).toBe("simple");
    expect(formItem.unlistedStockValuationV2).toBeDefined(); // 보존됨
    expect(formItem.unlistedStockData).toBeDefined(); // V1도 보존됨

    // 엔진 전달 시 strip 적용 — simple이므로 V2 제거
    const engineItem = resolveActiveUnlistedValuation(formItem);
    expect(engineItem.unlistedStockValuationV2).toBeUndefined(); // strip
    expect(engineItem.unlistedStockData).toBeDefined(); // V1 유지

    // 폼 state는 여전히 두 데이터 모두 보존
    expect(formItem.unlistedStockValuationV2).toBeDefined();
    expect(formItem.unlistedStockData).toBeDefined();

    // step 3: 다시 formal → 기존 V2 재사용
    formItem = { ...formItem, unlistedValuationMode: "formal" };
    const engineItemFormal = resolveActiveUnlistedValuation(formItem);
    expect(engineItemFormal.unlistedStockValuationV2).toBe(STUB_V2); // 기존 V2 재사용
  });

  it("simple 모드 + V2 없음 → 변경 없이 그대로 (C-1 기본)", () => {
    const item = makeUnlistedItem({
      unlistedValuationMode: "simple",
      // V2 없음
    });
    const result = resolveActiveUnlistedValuation(item);
    expect(result.unlistedStockValuationV2).toBeUndefined();
    expect(result.unlistedStockData).toBeDefined();
  });
});
