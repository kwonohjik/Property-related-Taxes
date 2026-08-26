/**
 * §164⑧ 자동 조회 — 「전기의 기준시가」와 「기준시가 조정월수」 파생 (⑤ UI 전용).
 *
 * ## 조회는 UI 층에서만 한다
 *
 * 엔진 leaf(`same-adjustment-period-std-price.ts`)는 **숫자만** 받는다. 엔진이 네트워크를
 * 타면 순수 함수 원칙(Layer 2)이 깨진다. 여기서 조회해 폼에 채워 넣고, 사용자가 수정할 수
 * 있게 둔다.
 *
 * ## §164③ — 어느 연도 고시분을 볼 것인가
 *
 * *"새로운 기준시가가 고시되기 전에 취득 또는 양도하는 경우에는 **직전의 기준시가**에 의한다."*
 * 개별공시지가는 1월 1일 기준이나 고시는 5월 31일경이다 ⇒ 5월 이전 취득·양도는 **전년도**분이
 * 적용된다. `recommendLandPriceYear`가 그 판정의 단일 소스다.
 *
 * ⚠️ **취득·양도를 비대칭으로 고르지 않는다** — 한쪽만 당해, 다른 쪽만 직전으로 잡으면
 *    환산취득가액이 통째로 어긋난다(memory `feedback_standard_price_year_164_3_prior`).
 *
 * ## 추정 공시일은 월수 파생에 쓰지 않는다
 *
 * 개별주택은 `pblntfDe`가 없으면 API가 `stdrYear + "0429"`로 **추정**한다
 * (`app/api/address/standard-price/route.ts`). 조정월수는 §80②1호가 「결정일」 기준이라
 * 월 경계(4/29 ↔ 5/1)에서 1개월이 어긋난다 ⇒ 추정이면 파생을 **끄고 수동 입력**으로 돌린다.
 */
import { recommendLandPriceYear } from "@/lib/utils/land-price-year";
import { calcStdPriceMonths } from "@/lib/tax-engine/same-adjustment-period-std-price";

export interface StdPriceLookupHit {
  price: number;
  /** YYYYMMDD */
  announcedDate: string;
  /** 공시일이 실제값이 아니라 추정치인가 */
  announcedDateEstimated?: boolean;
}

/** §164③ — 기준일에 적용되는 고시 연도 (취득·양도 **같은 규칙**) */
export function noticeYearFor(referenceDate: string): number {
  return recommendLandPriceYear(referenceDate);
}

/** 전기(직전 고시분) 연도 — 취득당시 고시 연도의 1년 전 */
export function priorNoticeYearFor(acquisitionDate: string): number {
  return noticeYearFor(acquisitionDate) - 1;
}

/** "YYYYMMDD" → Date. 형식이 아니면 null */
function parseCompactDate(v: string | undefined): Date | null {
  if (!v || !/^\d{8}$/.test(v)) return null;
  // UTC 자정 — `calcStdPriceMonths`가 UTC 달력 날짜를 읽으므로 로컬 자정(`T00:00:00`)을 쓰면
  // 실행 타임존만큼 어긋나 조정월수가 1월 절상된다.
  const d = new Date(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface AdjustmentMonthsDerivation {
  /** 파생된 조정월수. null이면 수동 입력으로 돌려야 한다 */
  months: number | null;
  /** null인 사유 — UI 안내용 */
  reason?: "estimated_notice_date" | "missing_notice_date";
}

/**
 * §80②1호 조정월수 파생.
 *  - 가목: 전기 결정일 ~ 취득당시 결정일 **전일**
 *  - 나목: 취득당시 결정일 ~ 새 결정일 **전일**
 *
 * 어느 한쪽이라도 **추정 공시일**이면 파생하지 않는다(null) — 틀린 월수를 조용히 넣지 않는다.
 */
export function deriveAdjustmentMonths(
  formula: "prev" | "new",
  acquisitionNotice: StdPriceLookupHit | undefined,
  counterpartNotice: StdPriceLookupHit | undefined,
): AdjustmentMonthsDerivation {
  if (!acquisitionNotice || !counterpartNotice) {
    return { months: null, reason: "missing_notice_date" };
  }
  if (acquisitionNotice.announcedDateEstimated || counterpartNotice.announcedDateEstimated) {
    return { months: null, reason: "estimated_notice_date" };
  }

  const acq = parseCompactDate(acquisitionNotice.announcedDate);
  const other = parseCompactDate(counterpartNotice.announcedDate);
  if (!acq || !other) return { months: null, reason: "missing_notice_date" };

  // 가목: 전기 결정일 → 취득 결정일 전일 / 나목: 취득 결정일 → 새 결정일 전일
  const [from, toExclusive] = formula === "prev" ? [other, acq] : [acq, other];
  const to = new Date(
    Date.UTC(toExclusive.getUTCFullYear(), toExclusive.getUTCMonth(), toExclusive.getUTCDate() - 1),
  );
  const months = calcStdPriceMonths(from, to);
  return { months: months > 0 ? months : null, reason: months > 0 ? undefined : "missing_notice_date" };
}
