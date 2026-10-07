/**
 * 신고서 양식 — 날짜·기간 포맷 · 일반건물 카드 취득일 · 장기보유특별공제 보유/거주 재안분 헬퍼.
 *
 * `FilingFormTableHelpers.ts`에서 분리(800줄 정책 — Phase C로 759줄 위험구간 진입, 기회주의적 분리). 순수 함수이고 동작 변경이 없다.
 * 기존 import 경로 유지를 위해 원 파일이 같은 이름으로 re-export한다.
 */
import { partAcquisitionDates } from "@/lib/calc/transfer-tax-split-acq-mode";
import { baseCardId } from "@/lib/tax-engine/general-building-share-id";
import { calculateHoldingPeriod } from "@/lib/tax-engine/tax-utils";

// ── 날짜·기간 포맷 헬퍼 ────────────────────────────────────────

/**
 * 보유 개월 수 — 「소득세법」 §95④ 「취득일부터 양도일까지」(**초일 산입**). 엔진 정본
 * `calculateHoldingPeriod`를 그대로 부른다 — 종전 자체 계산(초일 불산입)은 A1a(#1784) 이후 엔진과
 * 하루 차이로 갈려, 응당일 전날 양도에서 표의 보유연수가 1년 모자랐다.
 */
export function holdingMonthsFromDates(acq?: string, transfer?: string): number {
  if (!acq || !transfer) return 0;
  const a = new Date(acq);
  const t = new Date(transfer);
  if (isNaN(a.getTime()) || isNaN(t.getTime())) return 0;
  if (t < a) return 0;
  const h = calculateHoldingPeriod(a, t);
  return h.years * 12 + h.months;
}

export function fmtDate(s?: string): string {
  if (!s) return "-";
  return s;
}

export function fmtPeriod(months?: number): string {
  if (!months || months <= 0) return "-";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y}년 ${m}월`;
}

export function holdingPeriodFromDates(acq?: string, transfer?: string): string {
  if (!acq || !transfer) return "-";
  const a = new Date(acq);
  const t = new Date(transfer);
  if (isNaN(a.getTime()) || isNaN(t.getTime())) return "-";
  // 신고서 표시 규약(2026-07-29 사용자 확정): **연·월 숫자 차이만** 센다(일 무시).
  //   2025-01-08 → 2026-03-06 = 1년 2월 (일 절사 방식의 1년 1월 아님)
  // 만-개월 절사(일 borrow)는 적용하지 않는다 — 합계·토지·건물 전 열 동일 규약.
  const months =
    (t.getFullYear() - a.getFullYear()) * 12 + (t.getMonth() - a.getMonth());
  if (months < 0) return "-";
  // 같은 달 취득·양도(0개월)도 "-"가 아니라 명시적으로 표시한다.
  if (months === 0) return "0년 0월";
  return fmtPeriod(months);
}

// ── 장특공제 보유/거주 분할 ────────────────────────────────────

/**
 * GB(일반건물) 카드 propertyId별 정확한 취득일 산출.
 *
 * 엔진 내부 카드의 acquisitionDate를 UI에서도 동일하게 표시하기 위한 도메인 매핑:
 *  - 토지 카드(land·land_business·land_nbl) → 토지 취득일 (`partAcquisitionDates(asset).land`)
 *  - 원건물 카드(building·building1) → 건물 취득일 (M-1a 이후 `acquisitionDate`가 건물 취득일)
 *  - 증축건물 카드(building2) → 증축일 (gbExtensionDate, 영 §162①4호 빠른 날 — 사례 33)
 *
 * 비-GB 자산은 asset.acquisitionDate 그대로 반환.
 *
 * 사용처: FilingFormTableAggregateHelpers·DetailedStatementHelpers (DRY).
 */
export function getAcqDateForCard(asset: import("@/lib/stores/calc-wizard-asset").AssetForm | undefined, pid: string): string {
  if (!asset) return "";
  if (asset.assetKind !== "general_building") return asset.acquisitionDate || "";
  // 🔴 지분(%) 분할 카드는 `building2#0` 꼴이라 접미사를 벗기고 봐야 한다 —
  //    안 벗기면 증축분 카드가 default로 떨어져 **증축일 대신 원건물 취득일**을 표시한다.
  const base = baseCardId(pid);
  if (base === "building" || base === "building1") {
    return asset.acquisitionDate || "";
  }
  if (base === "building2") {
    return asset.gbExtensionDate || "";
  }
  // 🔴 토지 카드는 **토지 취득일**이다 — M-1a 이후 `acquisitionDate`는 건물 취득일이라
  //    그대로 쓰면 신축(자가건축)처럼 토지를 먼저 산 자산에서 토지 열 취득일자·보유기간이
  //    건물 기준으로 표시된다(장특공제는 엔진이 토지 취득일로 계산하므로 표시만 어긋난다).
  //    기산일 식은 엔진(`general-building-valuation.ts:412`)·API 변환과 **같은 단일 소스**를 쓴다.
  //
  // ⚠️ **토지 카드 id를 명시 열거한다.** default로 두면 카드 id가 아닌 컬럼(다건 모드의
  //    propertyId — 그 열은 GB 자산 **전체**다)까지 토지 취득일로 바뀐다.
  if (base === "land" || base === "land_business" || base === "land_nbl") {
    return partAcquisitionDates(asset).land;
  }
  return asset.acquisitionDate || "";
}

/**
 * 장기보유특별공제 보유/거주 분할 계산.
 * 소득세법 §95② 별표 — 보유기간분 공제율 : 거주기간분 공제율 비율로 안분.
 */
export function splitLtDeduction(
  totalAmount: number,
  holdingMonths: number,
  residenceMonths: number,
  useTable2: boolean,
): { holdingAmount: number; residenceAmount: number } {
  if (totalAmount <= 0) return { holdingAmount: 0, residenceAmount: 0 };
  if (!useTable2 || residenceMonths <= 0) {
    return { holdingAmount: totalAmount, residenceAmount: 0 };
  }
  const hY = Math.floor(holdingMonths / 12);
  const rY = Math.floor(residenceMonths / 12);
  const holdingRate = Math.min(hY * 0.04, 0.40);
  const residenceRate = Math.min(rY * 0.04, 0.40);
  const totalRate = holdingRate + residenceRate;
  if (totalRate <= 0) return { holdingAmount: totalAmount, residenceAmount: 0 };
  // §95② 표2: 보유기간분·거주기간분 각각 자기 공제율로 직접 산정(잔액 방식 아님).
  // floor 잔액(최대 1원)은 보유분(기저 공제)에 흡수 — 합 = 총 장특공제 불변식 유지, 세액 무관.
  const residenceAmount = Math.floor(totalAmount * residenceRate / totalRate);
  return { holdingAmount: totalAmount - residenceAmount, residenceAmount };
}
