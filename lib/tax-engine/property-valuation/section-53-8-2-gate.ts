/**
 * section-53-8-2-gate — 상증령 §53⑧2호 전부매각 할증배제 요건 검증 게이트.
 *
 * §53⑧2호: 평가기준일 전후 6개월(증여재산: 평가기준일 전 6개월부터 평가기준일 후 3개월)
 *   이내 기간 중 최대주주등 보유 주식 전부 매각(§49①1호 적합 한정) → 할증평가 제외.
 *
 * 매매계약일(S) 기준일은 §49②1호. 정상 매매거래(§49①1호) 여부·전부매각 여부는
 * 납세자만 아는 사실이므로 보조입력으로 받아 요건 충족 시에만 배제(eligible) 판정.
 *
 * 상장(valuationDate)·비상장(evaluationDate) 공용 — 평가기준일 D는 매개변수 주입.
 *
 * Design: docs/02-design/features/stock-premium-exclusion-53-8-2-correction.engine.design.md §3
 * 법령: 상증령 §53⑧2 · §49①1·②1 (KoreanLaw 검증 2026-06-27, 시행 20260227)
 */

import { addMonths, subMonths } from "date-fns";
import { toDate } from "@/lib/api/date-coerce";
import type {
  Section53_8_2Input,
  Section53_8_2Result,
} from "@/lib/tax-engine/types/stock-premium-exclusion.types";

/** 시각 제거 — date-only 경계 비교 (JSON string·coerceDates 시분초 영향 차단) */
function dateOnly(d: Date | string): number {
  const dt = toDate(d, "saleContractDate");
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
}

/**
 * §53⑧2호 전부매각 배제 요건 게이트.
 *
 * @param input 2호 보조입력 (미선택/미입력 시 undefined → missing_input)
 * @param valuationDate 평가기준일 D (상속개시일/증여일)
 */
export function evaluateSection53_8_2(
  input: Section53_8_2Input | undefined,
  valuationDate: Date,
): Section53_8_2Result {
  if (!input) return { eligible: false, failReason: "missing_input" };
  if (!input.allSharesSold) return { eligible: false, failReason: "not_all_sold" };
  if (!input.meetsArticle49_1_1) {
    return { eligible: false, failReason: "not_normal_transaction" };
  }

  // 기간: 하한 D−6월(공통), 상한 상속 D+6월 / 증여 D+3월. 경계 포함.
  const lower = dateOnly(subMonths(valuationDate, 6));
  const upper = dateOnly(
    input.transferType === "gift" ? addMonths(valuationDate, 3) : addMonths(valuationDate, 6),
  );
  const s = dateOnly(input.saleContractDate);

  if (s < lower || s > upper) return { eligible: false, failReason: "out_of_period" };
  return { eligible: true };
}
