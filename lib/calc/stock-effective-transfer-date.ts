/**
 * 분할 모드의 «이 계산의 양도일» — ④·화면·검증 단일 소스
 *
 * 분할 모드에는 폼-전역 양도일 칸이 없다(lot 일자가 정본 — 단일→분할 전환이 그 칸을 비운다).
 * ④는 가장 이른 매도 lot 일자를 엔진 `transferDate`로 싣는다(대주주 임계 연도·증권거래세율·
 * 4호 판정·§165④ 연혁·신고기한). 화면·검증이 폼-전역 칸(빈 값)을 읽으면 그 판정들을 건너뛰거나
 * 엔진과 다른 날짜로 재게 된다 ⇒ 같은 값을 여기서 한 번만 정한다.
 *
 * 분할이 아니면(단일·lots-only) 폼-전역 양도일이 정본이다.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

export type EffectiveTransferDateFields = Pick<StockTransferFormData, "transferDate"> &
  Partial<Pick<StockTransferFormData, "lotsMode" | "transferLots">>;

export function effectiveTransferDate(form: EffectiveTransferDateFields): string {
  if (form.lotsMode !== "split") return form.transferDate;
  return (
    (form.transferLots ?? [])
      .map((l) => l.transferDate)
      .filter((d) => d && d.length > 0)
      .sort()[0] ?? ""
  );
}
