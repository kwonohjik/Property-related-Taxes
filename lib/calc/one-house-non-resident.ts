/**
 * 판정 메뉴 — 비거주자 사실의 ⑤(칸)·④(본문)·⑧(검증) 공용 게이트와 본문 조각.
 *
 * 엔진: `lib/tax-engine/one-house/non-resident.ts`(양도일 현재 비거주자) · `non-resident-holding.ts`(비거주 기간).
 */
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

type Form = Pick<
  OneHouseJudgmentFormData,
  | "transferorNonResident"
  | "nonResidentPeriod"
  | "nonResidentStartDate"
  | "residentFromDate"
  | "nonResidentResidedAtConversion"
>;

/**
 * 「보유 중 비거주 기간」 칸이 열리는가 — 양도일 현재 비거주자면 닫는다.
 * 그때는 비과세 자체가 배제되거나(§121② 단서) 나·다목 예외로 보유기간 제한이 없어 기산일을 물을 이유가 없다.
 */
export function judgmentNonResidentPeriodVisible(form: Form): boolean {
  return form.transferorNonResident !== true && form.nonResidentPeriod === true;
}

export function buildNonResidentPayload(form: Form) {
  return {
    ...(form.transferorNonResident ? { transferorNonResidentAtTransfer: true } : {}),
    ...(judgmentNonResidentPeriodVisible(form) && form.residentFromDate
      ? {
          nonResidentHoldingPeriod: {
            ...(form.nonResidentStartDate ? { startDate: form.nonResidentStartDate } : {}),
            endDate: form.residentFromDate,
            ...(form.nonResidentResidedAtConversion ? { residedAtConversion: true } : {}),
          },
        }
      : {}),
  };
}
