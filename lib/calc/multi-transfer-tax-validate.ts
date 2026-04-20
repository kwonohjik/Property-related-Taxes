/**
 * 다건 양도소득세 폼 검증
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { MultiTransferFormData, PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { validateStep } from "./transfer-tax-validate";

/** 단건 자산의 필수 입력 완성도 검사 (0~100 정수) */
export function calcPropertyCompletion(form: PropertyItem["form"]): number {
  const checks = [
    !!form.propertyType,
    !!(form.transferPrice && parseAmount(form.transferPrice) > 0),
    !!form.transferDate,
    !!form.acquisitionDate,
    !!(
      form.useEstimatedAcquisition
        ? form.standardPriceAtAcquisition && form.standardPriceAtTransfer
        : form.acquisitionPrice !== undefined
    ),
    !!form.householdHousingCount,
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

/** 건별 편집이 최소 조건을 충족하는지 (다음 단계 이동 가능 여부) */
export function isPropertyReady(item: PropertyItem): boolean {
  // 단건 단계 0~3 검증 (Step 4 이후는 선택 사항)
  for (let step = 0; step <= 3; step++) {
    if (validateStep(step, item.form) !== null) return false;
  }
  return true;
}

/** 전체 다건 공통 설정 검증 */
export function validateMultiSettings(form: MultiTransferFormData): string | null {
  if (form.properties.length === 0) return "양도 건을 1건 이상 추가하세요.";
  if (form.properties.length > 20) return "최대 20건까지 동시 양도 계산을 지원합니다.";
  if (!form.taxYear || form.taxYear < 2000) return "과세연도를 확인하세요.";

  // 모든 건의 양도일이 taxYear 내에 있어야 함
  for (const p of form.properties) {
    if (!p.form.transferDate) continue;
    const year = new Date(p.form.transferDate).getFullYear();
    if (year !== form.taxYear) {
      return `"${p.propertyLabel}"의 양도일(${p.form.transferDate})이 과세연도(${form.taxYear})와 다릅니다.`;
    }
  }

  const used = parseAmount(form.annualBasicDeductionUsed);
  if (used > 2_500_000) return "연간 기사용 기본공제는 250만원을 초과할 수 없습니다.";

  return null;
}

/** 모든 건의 최소 조건 충족 여부 */
export function areAllPropertiesReady(properties: PropertyItem[]): boolean {
  return properties.every(isPropertyReady);
}
