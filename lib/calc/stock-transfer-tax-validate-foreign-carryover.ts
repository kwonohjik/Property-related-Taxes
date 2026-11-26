/**
 * 주식 양도소득세 — 국외주식 §97의2① 이월과세 Validation (14지점 ⑧)
 *
 * 판정은 **서버 ⑫와 같은 leaf** `foreignCarryoverIssues`(`foreign-stock-carryover-required.ts`)가 한다 —
 * 이 파일은 그 결과를 마법사 **단계별**로 나눠 `StockValidationError`로 바꿀 뿐이다.
 * 한쪽만 막으면 「UI 통과 → API 400」 또는 「API 직접 호출로 뚫림」이 생긴다(⑧↔⑫ 격자 정합 anchor:
 * `__tests__/calc/foreign-stock-carryover-wiring.anchor.test.ts` FW-4).
 *
 * 🔑 leaf에 넘기는 사실은 **④가 만든 body에서 읽는다** — 폼 문자열을 여기서 다시 파싱하면 ④와 ⑧이 다른 값을
 *    볼 수 있다(예: 지출액이 0이면 ④는 지출일 환율을 안 싣는다). 같은 body를 보면 구조적으로 갈릴 수 없다.
 * 🔑 자동 fallback 금지 — 증여자 취득가액·환율·지출일 환율의 빈 칸은 **오류**다(계획서 Q-3·Q-4).
 *
 * 단계 배정(입력 위치 = 검증 위치):
 *   1단계  관계 · 증여자 취득일 · (수증일 ≤ 양도일)
 *   2단계  증여자 취득가액 산정 방식 · 1주당 취득가 · 증여자 취득일 환율
 *   3단계  자본적지출 지출일 환율 · 증여세 산출세액/안분 분자·분모
 */
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockValidationError } from "./stock-transfer-tax-validate";
import { foreignCarryoverIssues, type ForeignCarryoverField } from "./foreign-stock-carryover-required";
import { isForeignCarryoverForm } from "./stock-foreign-carryover";
import { appendForeignCarryoverBody } from "./stock-transfer-tax-api-carryover";

const STEP_OF_FIELD: Record<ForeignCarryoverField, 1 | 2 | 3> = {
  donorRelation: 1,
  donorAcquisitionDate: 1,
  acquisitionDate: 1,
  donorAcquisitionMode: 2,
  donorPerShareAcquisitionPriceForeign: 2,
  donorAcquisitionExchangeRate: 2,
  donorCapitalExpenditureExchangeRate: 3,
  giftTaxAmount: 3,
  transferredAssetValue: 3,
  giftTaxableValue: 3,
};

export function foreignCarryoverStepErrors(
  form: StockTransferFormData,
  step: 1 | 2 | 3,
): StockValidationError[] {
  if (!isForeignCarryoverForm(form)) return [];
  const body: Record<string, unknown> = {};
  appendForeignCarryoverBody(body, form);
  const num = (k: string) => (typeof body[k] === "number" ? (body[k] as number) : undefined);
  const issues = foreignCarryoverIssues({
    acquisitionCause: body.acquisitionCause as string | undefined,
    donorRelation: body.donorRelation as string | undefined,
    donorAcquisitionDate: body.donorAcquisitionDate as string | undefined,
    acquisitionDate: form.acquisitionDate || undefined,
    transferDate: form.transferDate || undefined,
    donorAcquisitionMode: body.donorAcquisitionMode as string | undefined,
    donorPerShareAcquisitionPriceForeign: num("donorPerShareAcquisitionPriceForeign"),
    donorAcquisitionExchangeRate: num("donorAcquisitionExchangeRate"),
    donorCapitalExpenditureForeign: num("donorCapitalExpenditureForeign"),
    donorCapitalExpenditureExchangeRate: num("donorCapitalExpenditureExchangeRate"),
    giftTaxAmount: num("giftTaxAmount"),
    transferredAssetValue: num("transferredAssetValue"),
    giftTaxableValue: num("giftTaxableValue"),
  });
  return issues
    .filter((i) => STEP_OF_FIELD[i.field] === step)
    .map((i) => ({ field: i.field, message: i.message, severity: "error" as const }));
}
