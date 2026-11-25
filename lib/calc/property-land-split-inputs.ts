/**
 * 재산세 토지 — 같은 관할구역 합산 입력 칸(`otherSeparateAggregateValue`·`otherComprehensiveValue`)의 화면 쪽 어댑터 (PSA-E4).
 * 요구 술어·문구는 엔진 leaf(`property-land-split-tax.ts`)가 단일 소스 — ⑧·④는 그 함수를 그대로 부른다(⑫ Zod와 같은 술어).
 * 빈칸 = 미입력(차단), `0` = «없음»을 직접 입력한 것 — 기본값 0을 두지 않는다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import {
  PROPERTY_LAND_SPLIT_INPUT_MESSAGE,
  missingLandSplitInputs,
  propertyLandSplitRequiredFor,
} from "@/lib/tax-engine/property-land-split-tax";
import type { PropertyLandSplitInputKey, PropertyLandSplitRequired } from "@/lib/tax-engine/property-land-split-tax";
import type { SeparateAggregateLandItem } from "@/lib/tax-engine/separate-aggregate-land";
import type { SeparateTaxationInput } from "@/lib/tax-engine/separate-taxation";
import type { LandTaxType } from "@/lib/tax-engine/types/property.types";

export interface LandSplitFormValues {
  otherSeparateAggregateValue?: string;
  otherComprehensiveValue?: string;
}

/** 입력 칸 문자열 → 숫자. 빈칸·공백은 null(미입력), 숫자는 parseAmount(콤마 제거). */
function parseOptionalAmount(v: string | undefined): number | null {
  return v == null || v.trim() === "" ? null : parseAmount(v);
}

/** 이 폼이 연 합산 칸 — 별도합산은 필지 판정(분류 면적) 미리보기로, 분리과세는 면적 한도 초과(공장·목장)로, 직접 종합합산은 종합합산 칸 항상. */
export function landSplitRequiredFromForm(p: {
  landTaxType: LandTaxType | "" | undefined;
  separateAggregateItem: unknown;
  separateTaxationItem?: unknown;
}): PropertyLandSplitRequired {
  return propertyLandSplitRequiredFor({
    landTaxType: p.landTaxType === "" ? undefined : p.landTaxType,
    separateAggregateItem: p.separateAggregateItem as SeparateAggregateLandItem | undefined,
    separateTaxationItem: p.separateTaxationItem as Omit<SeparateTaxationInput, "assessedValue"> | undefined,
  });
}

/** ⑧ — 요구됐는데 비어 있는 첫 칸의 안내 문구(없으면 null). ⑫와 같은 문구·같은 순서. */
export function firstLandSplitIssue(required: PropertyLandSplitRequired, form: LandSplitFormValues): string | null {
  const [first] = missingLandSplitInputs(required, {
    otherSeparateAggregateValue: parseOptionalAmount(form.otherSeparateAggregateValue),
    otherComprehensiveValue: parseOptionalAmount(form.otherComprehensiveValue),
  });
  return first ? PROPERTY_LAND_SPLIT_INPUT_MESSAGE[first] : null;
}

/** ④ — 요구된 칸만 body에 싣는다(요구되지 않은 칸의 stale 값은 보내지 않는다). */
export function landSplitBodyFields(
  required: PropertyLandSplitRequired,
  form: LandSplitFormValues,
): Partial<Record<PropertyLandSplitInputKey, number>> {
  const out: Partial<Record<PropertyLandSplitInputKey, number>> = {};
  const sep = parseOptionalAmount(form.otherSeparateAggregateValue);
  const comp = parseOptionalAmount(form.otherComprehensiveValue);
  if (required.otherSeparate && sep !== null) out.otherSeparateAggregateValue = sep;
  if (required.otherComprehensive && comp !== null) out.otherComprehensiveValue = comp;
  return out;
}
