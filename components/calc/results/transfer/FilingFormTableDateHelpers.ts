/**
 * 신고서 양식 — 날짜·기간 포맷 · 일반건물 카드 취득일 · 장기보유특별공제 보유/거주 재안분 헬퍼.
 *
 * `FilingFormTableHelpers.ts`에서 분리(800줄 정책 — Phase C로 759줄 위험구간 진입, 기회주의적 분리). 순수 함수이고 동작 변경이 없다.
 * 기존 import 경로 유지를 위해 원 파일이 같은 이름으로 re-export한다.
 */
import { partAcquisitionDates } from "@/lib/calc/transfer-tax-split-acq-mode";
import { baseCardId } from "@/lib/tax-engine/general-building-share-id";
import { cardSuffixOf } from "@/lib/tax-engine/general-building-share-id";
import { SHARE_ID_SEPARATOR } from "@/lib/tax-engine/general-building-share-id";
import { purchasedPartParentIdOf } from "@/lib/tax-engine/general-building-share-id";
import { calculateHoldingPeriod } from "@/lib/tax-engine/tax-utils";
import { table2ResidencePct } from "@/lib/tax-engine/data/lthd-table2-era";
import type { AggregateTransferResult, PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";

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

/**
 * 신고서 양식·상세명세서 「보유기간」 — 「소득세법」 §95④ 「취득일부터 양도일까지」의 **만 기간(초일 산입)**.
 *
 * 2026-11-09 사용자 결정으로 종전 규약(2026-07-29 「연·월 숫자 차이 — 일 무시」)을 대체한다. 종전 규약은
 * 1996-06-15 → 2001-06-13을 「5년 0월」로 적어, 같은 화면의 장기보유특별공제 「4년 11개월」·§98 「5년 미만」 판정과
 * 어긋났다. 이제 엔진 정본 `calculateHoldingPeriod`(`holdingMonthsFromDates`)와 같은 값이다 — 2025-01-08 → 2026-03-06 = 1년 1월.
 * 합계·토지·건물·겸용·자산 합산·재개발 분기·파트 이월과세 열이 모두 이 함수 하나를 쓴다.
 */
export function holdingPeriodFromDates(acq?: string, transfer?: string): string {
  if (!acq || !transfer) return "-";
  const a = new Date(acq);
  const t = new Date(transfer);
  if (isNaN(a.getTime()) || isNaN(t.getTime())) return "-";
  if (t < a) return "-";
  const months = holdingMonthsFromDates(acq, transfer);
  // 1개월 미만(0개월)도 "-"가 아니라 명시적으로 표시한다.
  if (months === 0) return "0년 0월";
  return fmtPeriod(months);
}

/** 겸용 파트 카드 중 토지 파트 — `app/api/calc/transfer/mixed-use-part-cards.ts` `MIXED_USE_PART_IDS` */
const MIXED_USE_LAND_CARD_IDS = new Set(["mu-house-land", "mu-comm-land", "mu-nbl"]);

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
  // 겸용 파트 카드(`mu-house-land#${자산id}` 등) — 토지 파트는 토지 취득일이다(④ `transfer-tax-api-mixed-use.ts`가 엔진에 보내는 값과 같은 식).
  if (asset.isMixedUseHouse && MIXED_USE_LAND_CARD_IDS.has(baseCardId(pid))) return partAcquisitionDates(asset).land;
  if (asset.assetKind !== "general_building") return asset.acquisitionDate || "";
  // 🔴 지분(%) 분할 카드는 `building2#0` 꼴이라 접미사를 벗기고 봐야 한다 —
  //    안 벗기면 증축분 카드가 default로 떨어져 **증축일 대신 원건물 취득일**을 표시한다.
  // 채무 부분(매입분) 꼬리 카드는 부모 카드와 같은 파트다(열별 취득일은 `purchasedPartAcqDateOverride`가 먼저 정하고, 여기는 그 echo가 없을 때의 폴백).
  const base = baseCardId(purchasedPartParentIdOf(pid));
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
 * 일반건물 부담부증여 × 이월과세(F27) **A 채택** — 파트 카드의 보유기간은 당초 증여자 취득일부터 센다(소득세법 §95④ 단서).
 * 엔진이 그 날짜로 장기보유특별공제를 계산했으므로 표시도 route echo(`scenarioA`)를 읽는다 — 폼 취득일(증여받은 날)을 쓰면
 * 「보유 1년 10월 · 장특공제율 22%」 자기모순이 된다(PR-4 실측). B 채택·echo 없음(옛 결과)·토지·원건물 카드가 아니면 `undefined`.
 */
export function gbCarryoverAcqDateOverride(
  aggregated: Pick<AggregateTransferResult, "burdenedGiftCarryoverDetail" | "burdenedGiftCarryoverUnits"> | undefined,
  pid: string,
): string | undefined {
  // 함께 부담부증여 묶음(자산 id)·지분 분할(지분 index)은 카드 접미사마다 채택이 다르다(PR-1·PR-2) — 단건 명세는 접미사 없는 카드에만 쓴다.
  //   연간 합산 지분은 복합 접미사(`<자산id>.<지분번호>`)가 통째로 키다 — 자산 부분(`cardSuffixOf`)이 아니라 `#` 뒤 전체로 찾는다(단건·묶음은 둘이 같다).
  const suffix = cardSuffixOf(pid);
  const detail = suffix !== undefined && aggregated?.burdenedGiftCarryoverUnits
    ? aggregated.burdenedGiftCarryoverUnits[pid.slice(pid.indexOf(SHARE_ID_SEPARATOR) + SHARE_ID_SEPARATOR.length)]
    : aggregated?.burdenedGiftCarryoverDetail;
  const a = detail?.adoptedScenario === "A" ? detail.scenarioA : undefined;
  if (!a) return undefined;
  const base = baseCardId(pid);
  if (base === "land" || base === "land_business" || base === "land_nbl") return a.landHoldingStartDate;
  if (base === "building" || base === "building1") return a.buildingHoldingStartDate;
  return undefined;
}

/**
 * 이월과세 × 당초 증여 채무 부분(매입분) **A 채택** — 집계 서식 열의 취득일.
 * 증여분 열은 당초 증여자 취득일, 매입분 열은 증여 등기접수일이다(엔진 echo `scenarioA.purchasedPartSplit` · 조각 id가 열 id).
 * 폼 자산에는 취득일 칸이 없어 두 열이 같은 날짜·보유기간으로 찍히던 자리다. B 채택(카드 한 장)이면 그 카드의 취득 사실은 B라 `undefined`.
 * r = 1이면 매입분 한 장이 원 id를 쓰므로 `purchased.propertyId`가 그 열이다.
 */
export function purchasedPartAcqDateOverride(
  properties: readonly Pick<PerPropertyBreakdown, "propertyId" | "carryoverTaxationDetail">[],
  pid: string,
): { date: string; note: string } | undefined {
  for (const p of properties) {
    const d = p.carryoverTaxationDetail;
    const split = d?.scenarioA?.purchasedPartSplit;
    if (!split || d?.adoptedScenario !== "A") continue;
    if (split.gift?.propertyId === pid) return { date: split.gift.acquisitionDate, note: "당초 증여자 취득일 — 이월과세 적용(시나리오 A) · 소득세법 §95④ 단서" };
    if (split.purchased.propertyId === pid) return { date: split.purchased.acquisitionDate, note: "증여 등기접수일 — 당초 증여 때 채무를 인수한 부분(채무 인수 부분 · 매입분)의 취득일" };
  }
  return undefined;
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
  const residenceRate = table2ResidencePct(rY) / 100;
  const totalRate = holdingRate + residenceRate;
  if (totalRate <= 0) return { holdingAmount: totalAmount, residenceAmount: 0 };
  // §95② 표2: 보유기간분·거주기간분 각각 자기 공제율로 직접 산정(잔액 방식 아님).
  // floor 잔액(최대 1원)은 보유분(기저 공제)에 흡수 — 합 = 총 장특공제 불변식 유지, 세액 무관.
  const residenceAmount = Math.floor(totalAmount * residenceRate / totalRate);
  return { holdingAmount: totalAmount - residenceAmount, residenceAmount };
}
