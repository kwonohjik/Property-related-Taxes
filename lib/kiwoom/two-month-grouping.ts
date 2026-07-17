/**
 * two-month-grouping — 상장주식 평가조서(을) 4그룹 분할.
 *
 * 키움 `valuation-2month` 응답의 단일 slot array를 갑·을 양식에 맞춰
 * 좌측 beforeM1·beforeM2 + 우측 afterM1·afterM2 4그룹으로 분할.
 *
 * NO 매핑 (이미지 5 정합):
 *   beforeM1: NO 1 = D (평가기준일 자체), NO k = D − (k−1) 캘린더일
 *   beforeM2: NO 1 = D − 31일, NO k = D − (30 + k) 캘린더일
 *   afterM1:  NO 1 = D, NO k = D + (k−1) 캘린더일
 *   afterM2:  NO 1 = D + 31일, NO k = D + (30 + k) 캘린더일
 *
 * ★ D 종가는 좌(beforeM1 NO 1)·우(afterM1 NO 1) 양쪽에 표시 + 평균 산식 양쪽 카운트.
 *   이미지 H사 검증: 좌소계 350,490 + 우소계 359,540 = 710,030, floor(710,030/84) = 8,452 ✓
 *
 * Plan: docs/00-pm/listed-stock-besshi-form-replica.plan.md §3-3
 * Design: docs/02-design/features/listed-stock-besshi-form-replica.engine.design.md §4
 */

import type {
  ListedStockDailyRow,
  ListedStockMonthGroups,
} from "@/lib/tax-engine/types/listed-stock-valuation.types";

const ROWS_PER_GROUP = 31;

function isoOffsetDays(baseIso: string, offsetDays: number): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatMonthDay(iso: string): string {
  // 평가조서(을) 양식 — MM-DD 형식 (이미지 12 정합)
  const [, m, d] = iso.split("-");
  return `${m}-${d}`;
}

/**
 * 응답 slot array(slotDates·closingPrices·weekendLabels — same-index aligned)를
 * 4그룹으로 분할.
 *
 * @param slotDates       slot ISO 날짜 정순 (oldest → newest)
 * @param closingPrices   slot 같은 인덱스의 종가 또는 null (영업일 아님·미수신)
 * @param weekendLabels   slot 같은 인덱스의 비영업일 라벨 또는 "" (영업일)
 * @param valuationDateIso D
 * @param options.startOverrideDate §52의2②1·3호 — 이전 사유 다음날. 이 일자 이전 before 행은 "기간외"
 * @param options.endOverrideDate   §52의2②2·3호 — 이후 사유 전일. 이 일자 이후 after 행은 "기간외"
 */
export function splitTwoMonthSurroundingByMonthGroup(
  slotDates: string[],
  closingPrices: ReadonlyArray<number | null>,
  weekendLabels: ReadonlyArray<string>,
  valuationDateIso: string,
  options?: { startOverrideDate?: string; endOverrideDate?: string },
): ListedStockMonthGroups {
  // slot 인덱싱 맵
  const slotMap = new Map<string, { closing: number | null; label: string }>();
  for (let i = 0; i < slotDates.length; i++) {
    slotMap.set(slotDates[i], {
      closing: closingPrices[i] ?? null,
      label: weekendLabels[i] ?? "",
    });
  }

  const overrideStart = options?.startOverrideDate;
  const overrideEnd = options?.endOverrideDate;
  // §52의2②: 이전 사유 override는 before 행(초기 구간), 이후 사유 override는 after 행(말기 구간)에 적용.
  const isWithinStart = (iso: string): boolean => !overrideStart || iso >= overrideStart;
  const isWithinEnd = (iso: string): boolean => !overrideEnd || iso <= overrideEnd;

  const buildRow = (no: number, iso: string, isBefore: boolean): ListedStockDailyRow => {
    const slot = slotMap.get(iso);
    const withinOverride = isBefore ? isWithinStart(iso) : isWithinEnd(iso);
    if (!withinOverride) {
      return { no, date: iso, monthDay: formatMonthDay(iso), closing: null, label: "기간외" };
    }
    if (!slot) {
      // slot 자체 누락 (구간 외 또는 응답 누락) → 표시는 하되 빈칸
      return { no, date: iso, monthDay: formatMonthDay(iso), closing: null, label: "" };
    }
    return {
      no,
      date: iso,
      monthDay: formatMonthDay(iso),
      closing: slot.closing,
      label: slot.label,
    };
  };

  const beforeM1: ListedStockDailyRow[] = [];
  const beforeM2: ListedStockDailyRow[] = [];
  const afterM1: ListedStockDailyRow[] = [];
  const afterM2: ListedStockDailyRow[] = [];

  for (let k = 1; k <= ROWS_PER_GROUP; k++) {
    beforeM1.push(buildRow(k, isoOffsetDays(valuationDateIso, -(k - 1)), true));
    beforeM2.push(buildRow(k, isoOffsetDays(valuationDateIso, -(30 + k)), true));
    afterM1.push(buildRow(k, isoOffsetDays(valuationDateIso, k - 1), false));
    afterM2.push(buildRow(k, isoOffsetDays(valuationDateIso, 30 + k), false));
  }

  const sumClosings = (rows: ListedStockDailyRow[]): number =>
    rows.reduce((acc, r) => acc + (r.closing ?? 0), 0);

  const countTradingRows = (rows: ListedStockDailyRow[]): number =>
    rows.reduce((acc, r) => acc + (r.closing !== null ? 1 : 0), 0);

  const beforeSubtotal = sumClosings(beforeM1) + sumClosings(beforeM2);
  const afterSubtotal = sumClosings(afterM1) + sumClosings(afterM2);
  const tradingDays =
    countTradingRows(beforeM1) +
    countTradingRows(beforeM2) +
    countTradingRows(afterM1) +
    countTradingRows(afterM2);
  const closingSum = beforeSubtotal + afterSubtotal;
  const closingAverage = tradingDays > 0 ? Math.floor(closingSum / tradingDays) : 0;

  return {
    beforeM1,
    beforeM2,
    afterM1,
    afterM2,
    beforeSubtotal,
    afterSubtotal,
    tradingDays,
    closingSum,
    closingAverage,
  };
}
