/**
 * 계산명세서 — **공용 leaf** (800줄 분리, 2026-09-11)
 *
 * `DetailedStatementHelpers.ts` 를 전·후반으로 가르면서 **양쪽이 함께 쓰는** 두 헬퍼를
 * 여기로 내렸다(원본 6회 · 후반 4회씩 사용 — 실측).
 *
 * 🔴 내리지 않으면 「원본 → 후반 → 원본」 **순환**이 된다. 플레이북이 「순환은 재export
 *    때문에 생긴다 · 처방은 둘 다 보는 leaf」라고 기록한 바로 그 형태다
 *    ([[feedback_800line_split_playbook]]).
 *
 * ⚠️ 원본이 이 둘을 **재export** 한다 — 외부 import 사이트 보존
 *    ([[feedback_800line_split_export_preservation]]).
 */

import type { CalculationStep } from "@/lib/tax-engine/transfer-tax";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { PerAssetValue } from "./DetailedStatementConfig";

/**
 * result.steps[] 에서 label 부분일치로 step 찾기.
 * 엔진이 emit한 산식·법령을 그대로 재사용하기 위함.
 */
export function findStepByLabel(
  steps: CalculationStep[] | undefined,
  ...keywords: string[]
): CalculationStep | undefined {
  if (!steps) return undefined;
  for (const kw of keywords) {
    const found = steps.find((s) => s.label?.includes(kw));
    if (found) return found;
  }
  return undefined;
}

/**
 * 자산별 PerAssetValue[] 생성.
 *
 * 일반건물 일괄 모드는 단일 AssetForm이 토지/건물/증축건물 카드로 분해되므로
 * propertyId별로 별도 매핑이 필요. 그 외는 propertyId === assetId.
 */
/**
 * 자산별 PerAssetValue[] 생성 — formula 빌더 포함.
 *
 * 산식이 있는 항목(양도가액·취득가액·필요경비 등)에서 사용.
 * formulaBuilder가 undefined를 반환하면 formula 미설정 (라벨+값만 표시).
 */
export function buildPerAssetWithFormula(
  properties: PerPropertyBreakdown[],
  picker: (p: PerPropertyBreakdown) => number | string,
  formulaBuilder: (p: PerPropertyBreakdown) => string | undefined,
): PerAssetValue[] {
  return properties.map((p) => ({
    label: p.propertyLabel,
    value: picker(p),
    formula: formulaBuilder(p),
  }));
}
