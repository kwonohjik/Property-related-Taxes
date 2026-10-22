/**
 * 주택 split **파트 이월과세**(소득세법 §97의2①) 결과 표시 — 카드·상세명세서·신고서·PDF 4뷰가 같은 view를 읽는다 (P2 C).
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §6
 *
 * 입력은 엔진 echo(`SplitPartResult.carryover` · `SplitGainResult.carryoverEvent`)뿐이고 값을 새로 계산하지 않는다 — 합·차는 엔진 값을 그대로 읽는다
 * (`feedback_engine_result_display_drift`). 순수 함수(JSX 없음)라 문구는 엔진 계층이 아니라 표시 계층 규약(한국어 풀어쓰기·변수명 라벨·약어 금지)을 따른다.
 * 구 이력(echo 없음)은 `undefined`를 돌려줘 소비처가 종전 화면을 그대로 낸다.
 */
import { TRANSFER } from "./legal-codes";
import { DONOR_BUILT_SPLIT_UNDECLARED_NOTICE } from "./transfer-tax-carryover-donor-display";
import { CARRYOVER_EXCLUSION_REASON_LABELS } from "./transfer-carryover-exclusion-labels";
import { splitRateBasisDateText, splitRateBasisNote } from "./transfer-tax-split-display";
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
  /** 증여자 취득가액 — 실가 입력일 때만(환산 입력은 `estimated`) */
  donorAcquisitionPrice?: number;
  /** 파트 환산(P6) — 환산 입력일 때만. 분모·환산취득가액·개산공제는 적용(A) 파트만 채워진다(엔진 echo 그대로) */
  estimated?: SplitPartCarryoverEcho["estimated"];
  /** 이 파트의 양도가액(지분 반영 — 환산취득가액의 곱하는 수). 엔진 파트 결과 그대로 */
  transferPrice: number;
  /** §97②2호 단서 발동 — 환산 파트는 환산취득가액·개산공제 대신 자본적지출·양도비 합계를 필요경비로 쓴다(엔진 파트 `swapApplied`) */
  swapApplied: boolean;
  /** 개산공제 base·율(엔진 파트 echo) — 환산 파트에서만 읽는다. base는 지분 반영 값이라 분자와 다를 수 있다 */
  lumpDeductionBase?: number;
  lumpDeductionRate?: number;
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
  /** 증여자 신축·증축 §114조의2 가산세 echo(PR-3) — 건물 파트에 `donorBuilt`가 입력됐을 때만. 엔진 echo 그대로 */
  donorBuiltPenalty?: SplitPartCarryoverEcho["donorBuiltPenalty"];
}

export interface SplitCarryoverView {
  giftRegistryDate: string;
  giftTaxCalculated: number;
  giftTaxBase: number;
  periodYears: 5 | 10;
  orderDependent: boolean;
  /** 이월과세 입력이 있던 파트만(토지 → 건물) */
  parts: SplitCarryoverPartView[];
  /**
   * 건물 파트도 증여받았는가 — 그렇다면(C) 자산의 수증자 취득일 = 증여 등기접수일이다. 토지만 이월과세(P3 A)는 건물을 따로 매수·신축했으므로
   * 자산 취득일(합계·건물 열)은 건물 취득일 그대로다. 신고서·상세명세서의 취득일 칸이 이 한 값으로 갈린다.
   */
  buildingGifted: boolean;
  /** 토지 파트도 증여받았는가 — 건물만 이월과세(P4 B)는 토지를 따로 매수했다. 상세명세서 취득일 문구가 갈린다. */
  landGifted: boolean;
  /** §97의2②2호(P5) — 적용하면 비로소 1세대1주택이 되어 모든 이월과세 파트를 적용하지 않았다(②3호 비교 없음) */
  oneHouseExclusion: boolean;
  /** 위 조합이지만 배우자 예외(증여일 현재 1세대1주택을 배우자로부터 통째로 증여)로 ②2호를 적용하지 않았다 */
  spouseOneHouseExceptionApplied: boolean;
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
  // 구주택 멸실·신축 통산(해석 (5))이면 `appliedRateBasisDate`는 합산 개월을 만드는 환산 기산일이다 — 다른 3뷰와 같이 「환산」을 붙여 실제 취득일로 읽히지 않게 한다.
  const rateBasisDate = rateJudgedByPart && p.appliedRateBasisDate ? splitRateBasisDateText(p) : undefined;
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
    ...(e.donorAcquisitionPrice !== undefined ? { donorAcquisitionPrice: e.donorAcquisitionPrice } : {}),
    ...(e.estimated ? { estimated: e.estimated } : {}),
    transferPrice: p.transferPrice,
    swapApplied: p.swapApplied === true,
    ...(p.lumpDeductionBase !== undefined ? { lumpDeductionBase: p.lumpDeductionBase } : {}),
    ...(p.lumpDeductionRate !== undefined ? { lumpDeductionRate: p.lumpDeductionRate } : {}),
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
    ...(e.donorBuiltPenalty ? { donorBuiltPenalty: e.donorBuiltPenalty } : {}),
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
    buildingGifted: parts.some((p) => p.key === "building"),
    landGifted: parts.some((p) => p.key === "land"),
    oneHouseExclusion: ev.oneHouseExclusion === true,
    spouseOneHouseExceptionApplied: ev.spouseOneHouseExceptionApplied === true,
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

/** 개산공제율 표기 — `0.03 → "3%"`. 율을 문자열로 박지 않는다(미등기 0.3% 등에서 거짓이 된다). 율이 없으면 「개산공제율」. */
function lumpRateText(rate: number | undefined): string {
  return rate === undefined || !Number.isFinite(rate) || rate <= 0 ? "개산공제율" : `${Number((rate * 100).toFixed(4))}%`;
}

/** 이 파트가 «이월과세 적용 + 환산취득가액»인가 — 분자·분모·환산취득가액이 모두 echo에 있다(엔진 `attachSplitCarryoverEcho`). */
function appliedEstimated(p: SplitCarryoverPartView): NonNullable<SplitCarryoverPartView["estimated"]> | undefined {
  const e = p.estimated;
  return p.applied && e && e.stdPriceAtTransfer !== undefined ? e : undefined;
}

/**
 * 환산 파트(P6, 이월과세 적용) 환산취득가액 산식 — `환산취득가액 = 토지 양도가액 X × (증여자 취득 당시 기준시가 N) ÷ (양도 당시 기준시가 D) = Y`.
 * 숫자 옆에 변수명, 약어·`floor()` 금지. 나눗셈 피연산자는 괄호로 감싼다(`renderFormula`가 분수로 바꾸는 규약). 환산 파트가 아니면 `undefined`.
 */
export function splitCarryoverEstimatedAcqFormula(p: SplitCarryoverPartView): string | undefined {
  const e = appliedEstimated(p);
  if (!e) return undefined;
  return `${p.label} 환산취득가액 = ${p.label} 양도가액 ${won(p.transferPrice)} × (증여자 취득 당시 기준시가 ${won(e.donorStdPriceAtAcquisition)}) ÷ (양도 당시 기준시가 ${won(e.stdPriceAtTransfer!)}) = ${won(p.acquisitionValue)}`;
}

/**
 * 환산 파트(P6, 이월과세 적용) 필요경비 풀이 — 개산공제 산식 · 증여세 상당액 가산 · 자본적지출 처리를 «실제로 필요경비에 들어간 것»만 거짓 없이 말한다.
 *   · 본문(swap 아님): 필요경비 = 개산공제. 증여자 자본적지출·수증자 자본적지출·양도비는 환산취득가액에 포함돼 필요경비에 넣지 않는다(단서 비교에만 쓴다).
 *   · 단서(swap): 환산취득가액·개산공제 대신 자본적지출·양도비 합계(수증자 + 증여자)를 필요경비로 쓴다.
 *   · 증여세 상당액은 어느 쪽이든 §97의2①3호의 별도 산입이라 단서 비교 밖에서 더한다.
 * 환산 파트가 아니면 빈 배열(카드는 줄 단위로 그린다).
 */
export function splitCarryoverEstimatedExpenseLines(p: SplitCarryoverPartView): string[] {
  const e = appliedEstimated(p);
  if (!e) return [];
  const parts: string[] = [];
  if (p.swapApplied) {
    parts.push(
      `${p.label} 환산취득가액·개산공제 대신 자본적지출·양도비 합계 ${won(p.recipientExpense + p.donorCapexAdded)}(수증자 자본적지출·양도비 ${won(p.recipientExpense)} + 증여자 자본적지출 ${won(p.donorCapexAdded)})를 필요경비로 적용 (${TRANSFER.CARRYOVER_ESTIMATED_EXPENSE_PROVISO})`,
    );
  } else {
    const base = p.lumpDeductionBase ?? e.donorStdPriceAtAcquisition;
    const share = base !== e.donorStdPriceAtAcquisition ? "(지분 반영) " : "";
    if (e.lumpDeduction !== undefined)
      parts.push(`${p.label} 개산공제 = 증여자 취득 당시 기준시가 ${share}${won(base)} × ${lumpRateText(p.lumpDeductionRate)} = ${won(e.lumpDeduction)} (${TRANSFER.CARRYOVER_ESTIMATED_LUMP_DED})`);
    if (p.donorCapexAdded > 0)
      parts.push(`증여자 자본적지출 ${won(p.donorCapexAdded)}은(는) 환산취득가액을 쓰므로 필요경비에 넣지 않았습니다 — 자본적지출·양도비 합계가 (환산취득가액 + 개산공제)보다 클 때만 단서로 대신 적용합니다 (${TRANSFER.CARRYOVER_ESTIMATED_EXPENSE_PROVISO})`);
  }
  if (p.giftTaxAdded > 0) parts.push(`필요경비에 증여세 상당액 ${won(p.giftTaxAdded)} 가산 (${TRANSFER.CARRYOVER_GIFT_TAX_EXPENSE} — 단서 비교 밖의 별도 산입)`);
  return parts;
}

/** `splitCarryoverEstimatedExpenseLines`를 한 줄로 이은 문구 — 상세명세서·신고서·PDF. 환산 파트가 아니면 `undefined`. */
export function splitCarryoverEstimatedExpenseText(p: SplitCarryoverPartView): string | undefined {
  const lines = splitCarryoverEstimatedExpenseLines(p);
  return lines.length ? lines.join(" · ") : undefined;
}

/**
 * 취득가액 분해 한 줄 — 적용: 증여자 취득가액(취득가액 칸) + 필요경비에 가산한 증여자 자본적지출·증여세 상당액, 미적용: 증여 신고가액.
 * 환산 파트(P6, 적용)는 환산취득가액 산식 한 줄(필요경비 풀이는 `splitCarryoverEstimatedExpenseText`).
 */
export function splitCarryoverAcquisitionText(p: SplitCarryoverPartView): string {
  if (!p.applied) return `${p.label} 증여 신고가액 ${won(p.giftDateValuation)} (이월과세 미적용 — 수증자의 취득가액)`;
  const estFormula = splitCarryoverEstimatedAcqFormula(p);
  if (estFormula) return `${estFormula}${p.swapApplied ? " (단서 적용으로 차감하지 않음)" : ""}`;
  const addOns: string[] = [];
  if (p.donorCapexAdded > 0) addOns.push(`증여자 자본적지출 ${won(p.donorCapexAdded)}`);
  if (p.giftTaxAdded > 0) addOns.push(`증여세 상당액 ${won(p.giftTaxAdded)}`);
  return `${p.label} 증여자 취득가액 ${won(p.donorAcquisitionPrice ?? 0)}${addOns.length ? ` (필요경비에 ${addOns.join(" + ")} 가산)` : ""}`;
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

/**
 * 「확인 필요」 고지 — 비교 단위(파트별)는 정면 해석례를 확인하지 못했고, 안정 구성이 둘이면 판정 순서가 결과를 가른다.
 * P5 §97의2②2호 — 판정 단위(주택 일체)·상태(건물·토지 각각)·배우자 예외 범위(통째 증여만)도 파트 이월과세를 정면으로 다룬 해석례가 없다.
 */
export function splitCarryoverNotices(v: SplitCarryoverView): string[] {
  const out: string[] = [];
  // ②2호가 걸리면 ②3호 비교는 하지 않았다 — 비교 단위 고지는 비교를 했을 때만
  if (!v.oneHouseExclusion)
    out.push(
      "②3호 비교(적용·미적용)는 토지·건물을 각각 별개 자산으로 보고 파트별로 했습니다(소득세법 §94①1호). 토지·건물을 주택 하나로 묶어 비교하는 독법과 결과가 다를 수 있으며 이를 정면으로 다룬 해석례는 확인하지 못했습니다 — 확인 필요.",
    );
  if (v.oneHouseExclusion || v.spouseOneHouseExceptionApplied)
    out.push(
      "②2호(이월과세를 적용해야 비로소 1세대1주택 비과세 양도가 되는 경우)는 토지·건물을 주택 하나(딸린 토지 포함)로 보고, 이월과세 파트를 모두 적용한 경우와 모두 적용하지 않은 경우의 비과세 해당 여부를 건물·토지 각각 비교해 판정했습니다. 토지·건물 중 일부만 증여받은 경우를 정면으로 다룬 해석례는 확인하지 못했습니다 — 확인 필요.",
    );
  // P6 §114조의2 — 건물 파트의 증여자 취득가액을 환산취득가액으로 계산했다. «증여자 신축·증축»을 입력했으면 적용/미적용을 echo 문장 정본으로, 입력하지 않았으면 입력 경로를 안내한다.
  const bldg = v.parts.find((p) => p.key === "building");
  //   echo 가 있으면 가산세 카드(적용 근거·붙지 않은 이유)가 따로 말한다 — 「확인 필요」 목록에는 입력이 없을 때의 안내만 싣는다.
  if (bldg && !bldg.donorBuiltPenalty && appliedEstimated(bldg)) out.push(DONOR_BUILT_SPLIT_UNDECLARED_NOTICE);
  if (v.spouseOneHouseExceptionApplied)
    out.push("증여일 현재 1세대1주택이던 주택을 배우자로부터 증여받아 ②2호를 적용하지 않았습니다(이월과세 판정은 ②3호 비교로 했습니다).");
  if (v.orderDependent)
    out.splice(
      1,
      0,
      "두 파트의 판정이 서로를 가려 적용·미적용 조합이 둘 이상 성립합니다 — 토지 → 건물 순으로 판정한 조합을 채택했습니다(순서에 따라 세액이 달라질 수 있음) — 확인 필요.",
    );
  return out;
}
