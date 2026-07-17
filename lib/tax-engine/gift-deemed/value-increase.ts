/** (Phase 3) 재산 취득 후 재산가치 증가에 따른 이익의 증여 (§42의3 · 시행령 §32의3) */
import { differenceInYears, parseISO, addYears, isAfter } from "date-fns";
import { GIFT } from "../legal-codes";
import { safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type {
  DeemedGiftResult,
  ValueIncreaseAcquisitionCause,
  ValueIncreaseInput,
  ValueIncreaseReason,
} from "./types";

const ABSOLUTE_THRESHOLD = 300_000_000;

/** §42의3①1·2·3호 취득사유 라벨 */
const CAUSE_LABEL: Record<ValueIncreaseAcquisitionCause, string> = {
  gift: "특수관계인 증여 (§42의3①1호)",
  inside_info: "내부정보 유상취득 (§42의3①2호)",
  borrowed_funds: "차입·담보차입 자금 취득 (§42의3①3호)",
};

/** 시행령 §32의3① 재산가치증가사유 라벨 (1호는 4개 세분 — 법령상 동일 1호) */
const REASON_LABEL: Record<ValueIncreaseReason, string> = {
  development: "개발사업 시행 (영§32의3①1호)",
  form_change: "형질변경 (영§32의3①1호)",
  partition: "공유물 분할 (영§32의3①1호)",
  license: "사업 인가·허가 (영§32의3①1호)",
  kotc_registration: "한국금융투자협회 등록 (영§32의3①2호)",
  konex_listing: "코넥스시장 상장 (영§32의3①3호)",
  similar: "그 밖의 유사 사유 (영§32의3①4호)",
};

/**
 * 시행령 §32의3③: 이익 = 해당 재산가액 − 취득가액 − 통상적 가치상승분 − 가치상승기여분.
 * 기준금액(§32의3②) = MIN((취득가액+통상상승분+기여분) × 30%, 3억). 미만이면 제외.
 * 취득사유·가치증가사유·5년요건은 echo(valueIncreaseDetail)로만 표시 — 산식·applied 불변.
 */
export function calcValueIncreaseGift(input: ValueIncreaseInput): DeemedGiftResult {
  const { currentValue, acquisitionCost, normalIncrease, contribution } = input;
  const raw = currentValue - acquisitionCost - normalIncrease - contribution;
  const value0 = raw > 0 ? raw : 0;

  const deductSum = acquisitionCost + normalIncrease + contribution;
  const threshold = Math.min(safeMultiplyThenDivide(deductSum > 0 ? deductSum : 0, 30, 100), ABSOLUTE_THRESHOLD);
  const applied = value0 > 0 && value0 >= threshold;
  const value = applied ? value0 : 0;

  const breakdown: CalculationStep[] = [
    { label: "사유발생일 현재 재산가액", amount: currentValue, lawRef: GIFT.VALUE_INCREASE },
    { label: "취득가액", amount: acquisitionCost },
    { label: "통상적인 가치상승분", amount: normalIncrease },
    { label: "가치상승기여분", amount: contribution },
    { label: "이익 (재산가액 − 취득가 − 통상상승 − 기여분)", amount: value0 },
    { label: "기준금액 (차감합계 30%·3억 중 적은 금액)", amount: threshold },
    { label: "증여재산가액", amount: value, lawRef: GIFT.VALUE_INCREASE, note: "§42의3 재산취득 후 가치증가" },
  ];

  // ── echo (산식·value·applied에 영향 없음) ──
  const { acquisitionCause, valueIncreaseReason, acquisitionDate, eventDate } = input;
  const hasDates = !!acquisitionDate && !!eventDate;
  const holdingYears = hasDates ? differenceInYears(parseISO(eventDate!), parseISO(acquisitionDate!)) : undefined;
  // "5년 이내"는 일수 기준 판정 — differenceInYears(절사)로 5년10개월을 '이내'로 오표시하지 않도록.
  const withinFiveYears = hasDates
    ? !isAfter(parseISO(eventDate!), addYears(parseISO(acquisitionDate!), 5))
    : undefined;
  const hasDetail = !!valueIncreaseReason || !!acquisitionCause || hasDates;
  const valueIncreaseDetail = hasDetail
    ? {
        acquisitionCauseLabel: acquisitionCause ? CAUSE_LABEL[acquisitionCause] : undefined,
        reasonLabel: valueIncreaseReason ? REASON_LABEL[valueIncreaseReason] : undefined,
        withinFiveYears,
        holdingYears,
        isExchangeListingNotice: valueIncreaseReason === "similar" ? true : undefined,
      }
    : undefined;

  return {
    type: "value_increase",
    applied,
    deemedGiftValue: value,
    breakdown,
    // §47① 합산배제증여재산(§42의3). §55①3호 — 증여재산가액 − 3천만. (H-40·G-4)
    aggregationExcluded: true,
    exclusionReason: applied ? undefined : "이익이 기준금액(차감합계 30%·3억 중 적은 금액) 미만",
    legalBasis: GIFT.VALUE_INCREASE,
    thresholdEcho: { gain: value0, threshold },
    valueIncreaseDetail,
  };
}
