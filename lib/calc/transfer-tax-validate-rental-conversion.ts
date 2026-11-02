/**
 * ⑧ validate — §97의3 단기→장기 변경신고 입력 검사 (PR-C #3, 사용자 결정 Q-2: 신고일·수리일 모두 필수 — 자동 대체 금지)
 *
 * 엔진 `rental-97-3.ts` 2-0 단계·`rental-97-short-term-conversion.ts`와 같은 조건(3중 패턴):
 * - `before`(2020.7.10 이전 변경신고)면 변경 신고일·수리일 필수. 엔진은 두 날짜가 없으면 ④가 싣지 않아 변경신고가 없는 것으로 계산한다.
 * - 신고일 ≥ 2020-07-11이면 법 §97의3① 괄호로 제외 대상 — 「2020.7.11 이후 변경신고」를 고르도록 안내한다(엔진은 `CONVERTED_FROM_SHORT_TERM`).
 * - 수리일 < 신고일이면 엔진 `INVALID_SHORT_TERM_CONVERSION_DATES`.
 * - 단기 등록일(`registrationDate`) ≥ 수리일이면 단기 기간이 없어 입력 오류로 본다.
 *
 * 반환: 위반 메시지(`fieldError`로 입력칸 기록) 또는 null.
 */
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";
import { SHORT_TERM_CONVERSION_EXCLUDED_FROM } from "@/lib/tax-engine/transfer-reductions/rental-97-short-term-conversion";
import { fieldError } from "./transfer-tax-validate-field";

type Rental973Reduction = Extract<AssetReductionForm, { type: "rental_97_3" }>;

export function rentalConversionIssue(r: Rental973Reduction, label: string): string | null {
  if (r.shortTermConversionMode !== "before") return null;
  const reported = r.conversionReportedDate || "";
  const accepted = r.conversionAcceptedDate || "";
  if (!reported)
    return fieldError(`reduction.${r.type}.conversionReportedDate`, `${label} 적용: 단기민간임대주택을 장기일반민간임대주택으로 변경 신고한 날을 입력하세요 (조특법 §97의3① 괄호 · 조특령 §97의3④ 후단).`);
  if (reported >= SHORT_TERM_CONVERSION_EXCLUDED_FROM)
    return fieldError(`reduction.${r.type}.conversionReportedDate`, `${label} 적용: 2020.7.11 이후 변경 신고한 주택은 적용이 제외됩니다 — 「2020.7.11 이후 변경신고」를 선택하세요 (조특법 §97의3① 괄호).`);
  if (!accepted)
    return fieldError(`reduction.${r.type}.conversionAcceptedDate`, `${label} 적용: 변경신고 수리일(장기일반민간임대주택 등록일)을 입력하세요 (조특령 §97의3④ 후단).`);
  if (accepted < reported)
    return fieldError(`reduction.${r.type}.conversionAcceptedDate`, `${label} 적용: 변경신고 수리일은 변경 신고일과 같거나 그 뒤여야 합니다.`);
  if (r.registrationDate && r.registrationDate >= accepted)
    return fieldError(`reduction.${r.type}.registrationDate`, `${label} 적용: 변경신고 주택은 임대사업자 등록일에 단기민간임대주택으로 등록한 날을 입력하세요 — 변경신고 수리일보다 앞서야 합니다.`);
  return null;
}

/**
 * 장기일반민간임대주택등 「등록」일 — 등록 시한·건설한정 판정 축(엔진 `longRegistrationDate`와 같은 축).
 * 변경신고 주택(`before`)은 수리일, 아니면 임대사업자 등록일.
 */
export function rental973LongRegistrationDate(r: Rental973Reduction): string {
  return r.shortTermConversionMode === "before" && r.conversionAcceptedDate ? r.conversionAcceptedDate : r.registrationDate || "";
}
