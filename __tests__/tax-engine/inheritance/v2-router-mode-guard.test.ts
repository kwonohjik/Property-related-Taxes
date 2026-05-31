/**
 * evaluateAllEstateItems — V2 라우터 mode 검사 anchor (2026-05-31)
 *
 * 사용자 시나리오 (이미지 13/14/16):
 *   비상장주식 V1 simple 모드 + §54④ 1호(청산) 활성 + V2 객체 stale 잔류 →
 *   UI 카드는 V1 산식(perShareAssetValue=20,000 × 25,000주 = 500m) 정확 표시,
 *   그러나 evaluateAllEstateItems 라우터가 mode 검사 없이 V2 객체 존재만으로 라우팅 →
 *   V2 evaluate 결과(본칙 §54④ 미인식 → perShareMinValue=16,000 × 25,000주 = 400m)로
 *   집계표 합계열·validate expected가 산정되어 100m 갭 + 협의분할 경고 오작동.
 *
 * Fix: lib/tax-engine/property-valuation.ts:377 — resolveUnlistedDisplayMode 단일 진실 통과.
 *   `unlistedValuationMode === "formal"`(또는 default "formal") 일 때만 V2 라우팅.
 *   simple 모드 + V2 객체 잔류 → V1 라우팅 (computeStockValuation과 동일 결과).
 *
 * 3경로 정합:
 *   UI 카드 (UnlistedStockSimpleFields useMemo) = computeStockValuation = evaluateAllEstateItems
 */

import { describe, it, expect } from "vitest";
import { evaluateAllEstateItems } from "@/lib/tax-engine/property-valuation";
import type { EstateItem, UnlistedStockValuationInput } from "@/lib/tax-engine/types/inheritance-gift.types";

// 사용자 케이스 재현용 V2 객체 (의도적으로 불완전 — V2 라우팅 도달 시 throw하여 분기 증명).
// 본 anchor는 라우팅 검증만 목적이므로 V2 엔진 내부 정합성은 검사 대상 아님.
 
function makeStaleV2(): UnlistedStockValuationInput {
  return {
    totalShares: 25_000,
    ownedShares: 25_000,
    capitalChanges: [],
    fiscalYears: [] as unknown as UnlistedStockValuationInput["fiscalYears"],
  } as unknown as UnlistedStockValuationInput;
}

describe("evaluateAllEstateItems — V2 라우터 mode 검사 (dual-truth fix)", () => {
  it("simple 모드 + §54④ 1호 + V2 객체 stale 잔류 → V1 라우팅 (perShareAssetValue × ownedShares = 500m)", () => {
    const item: EstateItem = {
      id: "unlisted-1",
      category: "unlisted_stock",
      name: "비상장주식 1",
      unlistedValuationMode: "simple", // ★ 사용자가 simple 모드 명시
      unlistedStockData: {
        totalShares: 25_000,
        ownedShares: 25_000,
        weightedNetIncome: 0, // 적자
        netIncomeY1: 0,
        netIncomeY2: 0,
        netIncomeY3: 0,
        netAssetValue: 500_000_000, // 1주당 20,000
        capitalizationRate: 0.1,
        assetValueOnlyReason: "liquidation", // §54④ 1호 — 무조건 순자산가치 (80% 미적용)
      },
      unlistedStockValuationV2: makeStaleV2(), // ★ V2 객체 stale 잔류 (사용자가 한번 켰다 끄고 simple로 돌림)
    };

    const [result] = evaluateAllEstateItems([item]);
    // V1 라우팅: perShareAssetValue 20,000 × 25,000주 = 500,000,000
    expect(result.valuatedAmount).toBe(500_000_000);
  });

  it("formal 모드 + V2 객체 → V2 라우팅 진입 (기존 동작 회귀 0 — V2 엔진 throw로도 라우팅 도달 증명)", () => {
    const item: EstateItem = {
      id: "unlisted-2",
      category: "unlisted_stock",
      name: "비상장주식 V2",
      unlistedValuationMode: "formal",
      unlistedStockValuationV2: makeStaleV2(),
    };
    // V2 stub은 fiscalYears 비어있어 evaluateUnlistedStockV2가 throw — V2 라우팅으로 진입한 증거.
    // V1으로 잘못 라우팅됐다면 unlistedStockData 미제공이라 다른 경로로 갔을 것.
    expect(() => evaluateAllEstateItems([item])).toThrow();
  });

  it("undefined mode + V2 객체 → default 'formal' → V2 라우팅 (구버전 호환)", () => {
    const item: EstateItem = {
      id: "unlisted-3",
      category: "unlisted_stock",
      name: "비상장주식 V2 (구버전)",
      unlistedStockValuationV2: makeStaleV2(),
    };
    expect(() => evaluateAllEstateItems([item])).toThrow();
  });

  // ★ 보강 fix (2026-05-31): unlistedValuationMode 미저장 + V1 data + V2 stale 케이스
  it("mode 미저장 + unlistedStockData 존재 + V2 stale → V1 라우팅 (default formal 회피)", () => {
    const item: EstateItem = {
      id: "unlisted-mode-missing",
      category: "unlisted_stock",
      name: "비상장 — mode 필드 누락 + V1 데이터 + V2 stale",
      // unlistedValuationMode 의도적 미설정 — store에 mode 필드 명시 저장 안 된 사용자 케이스
      unlistedStockData: {
        totalShares: 25_000,
        ownedShares: 25_000,
        weightedNetIncome: 0,
        netAssetValue: 500_000_000,
        capitalizationRate: 0.1,
        assetValueOnlyReason: "liquidation",
      },
      unlistedStockValuationV2: makeStaleV2(),
    };
    const [result] = evaluateAllEstateItems([item]);
    // 종전 default "formal" → V2 throw였으나, 보강 후 V1 data 존재로 simple 판정 → V1 평가 → 500m
    expect(result.valuatedAmount).toBe(500_000_000);
  });

  it("simple 모드 + V2 객체 잔류 (사용자 케이스) — V2 throw 없이 V1으로 평가 완료", () => {
    // 위 첫 테스트와 동일하지만 throw가 일어나지 않음을 명시적으로 검증.
    const item: EstateItem = {
      id: "unlisted-4",
      category: "unlisted_stock",
      name: "비상장주식 simple + V2 stale",
      unlistedValuationMode: "simple",
      unlistedStockData: {
        totalShares: 25_000,
        ownedShares: 25_000,
        weightedNetIncome: 0,
        netAssetValue: 500_000_000,
        capitalizationRate: 0.1,
        assetValueOnlyReason: "liquidation",
      },
      unlistedStockValuationV2: makeStaleV2(),
    };
    expect(() => evaluateAllEstateItems([item])).not.toThrow();
  });
});
