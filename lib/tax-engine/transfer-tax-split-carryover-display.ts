/**
 * 주택 split **파트 이월과세**(소득세법 §97의2①) 결과 표시 — 카드·상세명세서·신고서·PDF 4뷰가 같은 view를 읽는다 (P2 C).
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §6
 *
 * 입력은 엔진 echo(`SplitPartResult.carryover` · `SplitGainResult.carryoverEvent`)뿐이고 값을 새로 계산하지 않는다 — 합·차는 엔진 값을 그대로 읽는다
 * (`feedback_engine_result_display_drift`). 순수 함수(JSX 없음)라 문구는 엔진 계층이 아니라 표시 계층 규약(한국어 풀어쓰기·변수명 라벨·약어 금지)을 따른다.
 * 구 이력(echo 없음)은 `undefined`를 돌려줘 소비처가 종전 화면을 그대로 낸다.
 */
import { CARRYOVER_EXCLUSION_REASON_LABELS } from "./transfer-carryover-exclusion-labels";
import { splitRateBasisNote } from "./transfer-tax-split-display";
import type { SplitGainResult, SplitPartCarryoverEcho, SplitPartResult } from "./types/transfer-split-gain.types";

type PartKey = "land" | "building";
const PART_LABEL: Record<PartKey, string> = { land: "토지", building: "건물" };

export interface SplitCarryoverPartView {
  key: PartKey;
  label: string;
  /** 이월과세(§97의2①)를 이 파트에 적용했는가 */
  applied: boolean;
  /** 판정 한 줄 — 「이월과세 적용」 / 「이월과세 미적용 — 사유」 */
  verdictLabel: string;
  /** 미적용 사유 라벨(적용이면 없음) */
  exclusionLabel?: string;
  /**
   * **장기보유특별공제** 기산일 — 엔진 파트 `acquisitionDate` echo 그대로(적용: 증여자 취득일(§95④ 단서), 미적용: 증여 등기접수일(수증자 취득)).
   * 세율 기산일과 다를 수 있다 — 주택 토지 파트의 세율은 `max(법정 기산일, 건물 취득일)`(주택부수토지로서의 보유기간)로 판정한다.
   */
  lthdStartDate: string;
  lthdStartLabel: string;
  /** **세율** 기산일 — 엔진이 파트별 기산일로 세율을 판정했을 때(`partRateBasisApplied`)만, 엔진 `appliedRateBasisDate` echo 그대로 */
  rateBasisDate?: string;
  /** 세율 기산 보조 문구(법정 기산일과 다르면 주택 `max` 적용 사실) — `rateBasisDate`가 있을 때만 */
  rateBasisNote?: string;
  donorAcquisitionDate: string;
  donorAcquisitionPrice: number;
  donorCapexAdded: number;
  donorCapexGuardApplied: boolean;
  /** 증여 당시 평가액(증여 신고가액) = 안분 분자 = 미적용 시 취득가액 */
  giftDateValuation: number;
  giftTaxApportioned: number;
  giftTaxLimitCap: number;
  giftTaxLimitApplied: boolean;
  /** 필요경비에 실제로 더한 증여세 상당액(미적용이면 0) */
  giftTaxAdded: number;
  /** 엔진이 이 파트에서 차감한 취득가액(= 파트 `acquisitionPrice`) — 적용: 증여자 취득가액 · 미적용: 증여 신고가액 */
  acquisitionValue: number;
  /** 필요경비 중 수증자가 지출한 자본적지출·양도비(엔진 직접경비 − 증여자 자본적지출 − 증여세 상당액) */
  recipientExpense: number;
  /** ②3호 비교 — 신고 전체 결정세액(상대 파트의 확정값 기준). 적격 판정에서 이미 배제된 파트는 없다 */
  comparison?: { withCarryover: number; without: number };
}

export interface SplitCarryoverView {
  giftRegistryDate: string;
  giftTaxCalculated: number;
  giftTaxBase: number;
  periodYears: 5 | 10;
  orderDependent: boolean;
  /** 이월과세 입력이 있던 파트만(토지 → 건물) */
  parts: SplitCarryoverPartView[];
}

function partView(
  key: PartKey,
  p: SplitPartResult,
  e: SplitPartCarryoverEcho,
  giftRegistryDate: string,
  /** 엔진이 파트별 기산일로 세율을 판정했는가(`SplitGainResult.partRateBasisApplied`) — 자산 단위 세율이면 파트 세율 기산일은 계산에 쓰이지 않았다 */
  rateJudgedByPart: boolean,
  houseCause: SplitPartResult["acquisitionCause"],
): SplitCarryoverPartView {
  const applied = e.judgment === "applied";
  const rateBasisDate = rateJudgedByPart ? p.appliedRateBasisDate : undefined;
  const rateBasisNote = rateBasisDate ? splitRateBasisNote(p, houseCause) : undefined;
  const exclusionLabel = applied || !e.exclusionReason ? undefined : CARRYOVER_EXCLUSION_REASON_LABELS[e.exclusionReason];
  return {
    key,
    label: PART_LABEL[key],
    applied,
    verdictLabel: applied ? "이월과세 적용 (증여자 기준)" : "이월과세 미적용 (수증자 기준)",
    ...(exclusionLabel ? { exclusionLabel } : {}),
    lthdStartDate: p.acquisitionDate ?? (applied ? e.donorAcquisitionDate : giftRegistryDate),
    lthdStartLabel: applied ? "증여자 취득일" : "증여 등기접수일",
    ...(rateBasisDate ? { rateBasisDate } : {}),
    ...(rateBasisNote ? { rateBasisNote } : {}),
    donorAcquisitionDate: e.donorAcquisitionDate,
    donorAcquisitionPrice: e.donorAcquisitionPrice,
    donorCapexAdded: e.donorCapexAdded,
    donorCapexGuardApplied: e.donorCapexGuardApplied,
    giftDateValuation: e.giftDateValuation,
    giftTaxApportioned: e.giftTaxApportioned,
    giftTaxLimitCap: e.giftTaxLimitCap,
    giftTaxLimitApplied: e.giftTaxLimitApplied,
    giftTaxAdded: e.giftTaxAddedToExpense,
    acquisitionValue: p.acquisitionPrice,
    recipientExpense: Math.max(0, p.directExpenses - e.donorCapexAdded - e.giftTaxAddedToExpense),
    ...(e.comparison
      ? { comparison: { withCarryover: e.comparison.determinedTaxWithCarryover, without: e.comparison.determinedTaxWithout } }
      : {}),
  };
}

/** 파트 이월과세 view — echo가 없는 결과(구 이력·이월과세 아님)는 `undefined`. */
export function splitCarryoverView(sd: SplitGainResult | undefined): SplitCarryoverView | undefined {
  const ev = sd?.carryoverEvent;
  if (!sd || !ev) return undefined;
  const parts: SplitCarryoverPartView[] = [];
  for (const key of ["land", "building"] as const) {
    const e = sd[key].carryover;
    if (e) parts.push(partView(key, sd[key], e, ev.giftRegistryDate, sd.partRateBasisApplied === true, sd.building.acquisitionCause));
  }
  if (parts.length === 0) return undefined;
  return {
    giftRegistryDate: ev.giftRegistryDate,
    giftTaxCalculated: ev.giftTaxCalculated,
    giftTaxBase: ev.giftTaxBase,
    periodYears: ev.applicablePeriodYears,
    orderDependent: ev.orderDependent === true,
    parts,
  };
}

const won = (n: number) => n.toLocaleString();

/** 증여세 상당액 안분 산식(영 §163의2②) — 숫자 옆에 변수명. 상세명세서·PDF 한 줄 문구. 나눗셈 피연산자는 괄호로 감싼다(`renderFormula`가 분수로 바꾸는 규약). */
export function splitCarryoverApportionText(v: SplitCarryoverView, p: SplitCarryoverPartView): string {
  const base = `증여세 산출세액 ${won(v.giftTaxCalculated)} × (${p.label} 증여 신고가액 ${won(p.giftDateValuation)}) ÷ (증여세 과세가액 ${won(v.giftTaxBase)}) = ${won(p.giftTaxApportioned)}`;
  if (!p.applied) return `${base} (이월과세를 적용하지 않아 필요경비에 가산하지 않음)`;
  return p.giftTaxLimitApplied
    ? `${base} → 한도 ${won(p.giftTaxLimitCap)}(${p.label} 양도차익) 적용으로 필요경비 가산 ${won(p.giftTaxAdded)}`
    : `${base} → 필요경비 가산 ${won(p.giftTaxAdded)}`;
}

/** 취득가액 분해 한 줄 — 적용: 증여자 취득가액(취득가액 칸) + 필요경비에 가산한 증여자 자본적지출·증여세 상당액, 미적용: 증여 신고가액. */
export function splitCarryoverAcquisitionText(p: SplitCarryoverPartView): string {
  if (!p.applied) return `${p.label} 증여 신고가액 ${won(p.giftDateValuation)} (이월과세 미적용 — 수증자의 취득가액)`;
  const addOns: string[] = [];
  if (p.donorCapexAdded > 0) addOns.push(`증여자 자본적지출 ${won(p.donorCapexAdded)}`);
  if (p.giftTaxAdded > 0) addOns.push(`증여세 상당액 ${won(p.giftTaxAdded)}`);
  return `${p.label} 증여자 취득가액 ${won(p.donorAcquisitionPrice)}${addOns.length ? ` (필요경비에 ${addOns.join(" + ")} 가산)` : ""}`;
}

/** ②3호 비교 한 줄 — 신고 전체 결정세액(이 파트만 적용 / 이 파트만 미적용). 비교가 없으면(적격 판정에서 이미 배제) 빈 문자열. */
export function splitCarryoverComparisonText(p: SplitCarryoverPartView): string {
  return p.comparison ? `신고 전체 결정세액 적용 ${won(p.comparison.withCarryover)} / 미적용 ${won(p.comparison.without)}` : "";
}

/** 장기보유특별공제 기산 문구 — `장기보유특별공제 기산 증여자 취득일 1995-03-01` */
export function splitCarryoverLthdBasisText(p: SplitCarryoverPartView): string {
  return `장기보유특별공제 기산 ${p.lthdStartLabel} ${p.lthdStartDate}`;
}

/** 세율 기산 문구 — 엔진이 파트별로 세율을 판정했을 때만(없으면 빈 문자열) */
export function splitCarryoverRateBasisText(p: SplitCarryoverPartView): string {
  return p.rateBasisDate ? `세율 기산 ${p.rateBasisDate}${p.rateBasisNote ? ` (${p.rateBasisNote})` : ""}` : "";
}

/** 파트별 판정 요약 한 줄 — 4뷰 공통 헤드. 장기보유특별공제 기산일과 세율 기산일을 가른다(둘은 다를 수 있다). */
export function splitCarryoverVerdictText(p: SplitCarryoverPartView): string {
  const rate = splitCarryoverRateBasisText(p);
  const head = `${p.label} ${p.verdictLabel} · ${splitCarryoverLthdBasisText(p)}${rate ? ` · ${rate}` : ""}`;
  const cmp = splitCarryoverComparisonText(p);
  return `${head}${cmp ? ` · ${cmp}` : ""}${p.exclusionLabel ? ` — ${p.exclusionLabel}` : ""}`;
}

/** 「확인 필요」 고지 — 비교 단위(파트별)는 정면 해석례를 확인하지 못했고, 안정 구성이 둘이면 판정 순서가 결과를 가른다. 동일세대 사실은 묻지 않는다(Q-9). */
export function splitCarryoverNotices(v: SplitCarryoverView): string[] {
  const out = [
    "②3호 비교(적용·미적용)는 토지·건물을 각각 별개 자산으로 보고 파트별로 했습니다(소득세법 §94①1호). 토지·건물을 주택 하나로 묶어 비교하는 독법과 결과가 다를 수 있으며 이를 정면으로 다룬 해석례는 확인하지 못했습니다 — 확인 필요.",
    "증여자와 증여일부터 양도일까지 계속 같은 세대였는지는 묻지 않았고 1세대1주택 비과세 판정과 함께 계산하지 않았습니다 — 해당하는 양도라면 확인 필요.",
  ];
  if (v.orderDependent)
    out.splice(
      1,
      0,
      "두 파트의 판정이 서로를 가려 적용·미적용 조합이 둘 이상 성립합니다 — 토지 → 건물 순으로 판정한 조합을 채택했습니다(순서에 따라 세액이 달라질 수 있음) — 확인 필요.",
    );
  return out;
}
