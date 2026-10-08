/**
 * 토지·건물 별개 취득(split) **결과 표시 정본** — 순수 leaf (Phase C, 표시 전용 · 세액 불변).
 *
 * 같은 사실을 두 곳이 따로 쓰면 어긋난다 — 엔진 step 문구(`양도차익 계산`·`장기보유특별공제`)와 결과뷰
 * 상세명세서(취득가액·필요경비 행)·신고서가 모두 **이 파일의 값**을 읽는다(`summarizeSplitGain`).
 * 입력은 엔진 echo(`SplitGainResult`)뿐이고 값을 새로 계산하지 않는다 — 합은 파트 정의
 * `파트 양도차익 = 양도가 − (swap ? 0 : 취득가) − 직접경비 − 개산공제`를 그대로 더한 것이다.
 *
 * ⚠️ 문구에 곱셈 등식을 쓰지 않는 곳이 있다(보유분·거주분 — 잔액 흡수로 1원 어긋날 수 있다). 그리고 12억
 *    초과 안분은 파트별로 floor하므로 `Σ 파트 과세 양도차익`은 전체 `taxableGain`과 **1원 다를 수 있다** —
 *    어떤 문구도 「합 = 전체」를 단정하지 않는다.
 * ⚠️ 문구에는 `/`·`÷`를 쓰지 않는다 — `FormulaText`가 `숫자 / 숫자`를 분수로 치환한다.
 *
 * 설계: docs/02-design/features/transfer-split-acq-result-display.engine.design.md §4
 */
import { applyRateFraction } from "./tax-utils";
import type { SplitGainResult, SplitPartResult } from "./types/transfer-split-gain.types";

export type SplitPartKey = "land" | "building";
export type SplitAcqMode = NonNullable<SplitPartResult["acqMode"]>;

const PART_LABEL: Record<SplitPartKey, string> = { land: "토지", building: "건물" };

/**
 * 산정방식 표시명 — 입력 화면 라디오(`PartAcqInputs`)·겸용 결과(`sepAcqModeLabel`)와 **같은 어휘**다
 * (결정 9: 사용자가 입력한 단어가 결과에 그대로 나와야 검증이 된다).
 */
export function splitAcqModeLabel(mode: SplitAcqMode): string {
  switch (mode) {
    case "actual":
      return "실거래가";
    case "estimated":
      return "환산취득가";
    case "appraisal":
      return "감정가액";
    case "salesCase":
      return "매매사례가액";
  }
}

export type SplitPartCause = NonNullable<SplitPartResult["acquisitionCause"]>;

/**
 * 파트 취득원인 표시명 — 입력 화면 「취득 원인」 라디오(`CompanionAcquisitionCauseSection`)와 **같은 어휘**다(D1-3).
 * 부담부증여는 라디오가 아니라 양도 유형에서 고르지만 같은 단어를 쓴다.
 */
export function splitCauseLabel(cause: SplitPartCause): string {
  switch (cause) {
    case "purchase":
      return "매매";
    case "inheritance":
      return "상속";
    case "gift":
      return "증여";
    case "carryover_gift":
      return "이월과세(증여)";
    case "newConstruction":
      return "신축(자가건축)";
    case "burdened_gift":
      return "부담부증여";
  }
}

const RATE_BASIS_RULE: Record<NonNullable<SplitPartResult["rateBasisRule"]>, { label: string; law: string }> = {
  own: { label: "취득일", law: "소득세법 §104② 본문" },
  decedent: { label: "피상속인 취득일", law: "소득세법 §104②1호" },
  donor: { label: "증여자 취득일", law: "소득세법 §104②2호" },
};

/**
 * 「세율 기산일」 보조 문구 — 엔진 echo(`rateBasisRule`·두 기산일)를 그대로 읽는다(규칙을 날짜 비교로 재추론하지 않는다).
 * 법정 기산일과 적용 기산일이 다르면 주택 `max`(주택부수토지로서의 보유기간)가 적용된 것이다 — 그 사실을 밝힌다.
 * echo가 없는 구 결과는 `undefined`.
 */
export function splitRateBasisNote(
  p: Pick<SplitPartResult, "rateBasisRule" | "rateBasisAcquisitionDate" | "appliedRateBasisDate">,
): string | undefined {
  if (!p.rateBasisRule || !p.appliedRateBasisDate) return undefined;
  const { label, law } = RATE_BASIS_RULE[p.rateBasisRule];
  if (p.rateBasisAcquisitionDate && p.rateBasisAcquisitionDate !== p.appliedRateBasisDate) {
    return `${label} ${p.rateBasisAcquisitionDate}(${law})보다 주택 취득일이 늦어 주택 취득일부터 — 주택부수토지로서의 보유기간`;
  }
  return `${label} — ${law}`;
}

export interface SplitGainPartSummary {
  key: SplitPartKey;
  /** 「토지」·「건물」 */
  label: string;
  /** 원값 — 라벨은 호출부가 `splitAcqModeLabel`로 만든다(어휘 단일). 구 결과에는 `undefined`. */
  mode: SplitAcqMode | undefined;
  transferPrice: number;
  /** 입력·산정된 취득가액(§97②2호 단서 swap이면 차감되지 않는 값) */
  acquisitionPrice: number;
  /** 엔진이 **실제로 차감한** 취득가액 = `swapApplied ? 0 : acquisitionPrice` */
  acquisitionDeducted: number;
  directExpenses: number;
  appraisalDeduction: number;
  swapApplied: boolean;
  gain: number;
  /** 엔진 echo 그대로(D1-3) — 구 결과에는 `undefined` */
  acquisitionCause: SplitPartResult["acquisitionCause"];
  acquisitionDate: string | undefined;
  rateBasisAcquisitionDate: string | undefined;
  rateBasisRule: SplitPartResult["rateBasisRule"];
  appliedRateBasisDate: string | undefined;
}

export interface SplitGainSummary {
  /** 소유 파트의 양도가 합 */
  transferPrice: number;
  /** 소유 파트의 **차감된** 취득가 합(swap 파트는 0) */
  acquisitionDeducted: number;
  /** 소유 파트의 필요경비 합 = Σ(직접경비 + 개산공제) */
  necessaryExpense: number;
  /** Σ 파트 양도차익 = `양도가 − 취득가 − 필요경비` */
  gain: number;
  /** 소유 파트만 — 토지 → 건물 순서 */
  parts: SplitGainPartSummary[];
  /**
   * 토지·건물 취득원인이 다른가 — 소유 파트 **둘 다** 원인 echo가 있고 서로 다를 때만 `true`.
   * 4뷰가 「취득 원인」·「세율 기산일」 행을 낼지 정하는 **유일한 근거**다(같으면 행을 내지 않아 기존 화면 diff 0).
   */
  mixedCause: boolean;
  /**
   * 「세율 기산일」 행을 낼 수 있는가 = `mixedCause` ∧ 엔진이 파트별 기산일로 세율을 판정했다(`partRateBasisApplied`).
   * 결손·세율 특칙 등으로 자산 단위 세율이 쓰였으면 파트 기산일은 계산에 쓰이지 않았다 — 원인 행만 남긴다.
   */
  rateBasisShown: boolean;
}

/** 소유 파트(`selfOwns`)만 토지 → 건물 순서로. */
function ownedParts(sd: SplitGainResult): Array<[SplitPartKey, SplitPartResult]> {
  const owns = sd.selfOwns ?? "both";
  const out: Array<[SplitPartKey, SplitPartResult]> = [];
  if (owns !== "building_only") out.push(["land", sd.land]);
  if (owns !== "land_only") out.push(["building", sd.building]);
  return out;
}

/**
 * 파트 하나의 **차감된** 취득가액 — §97②2호 단서 swap 파트는 0. 신고서 열별 셀(비소유 파트 포함)이 같은 정의를 읽도록
 * 합계(`summarizeSplitGain`)와 한 곳에서 낸다.
 */
export function splitPartAcquisitionDeducted(p: SplitPartResult): number {
  return p.swapApplied === true ? 0 : p.acquisitionPrice;
}

/** 취득가액·필요경비·양도차익의 **정본 합** — 엔진 문구와 결과뷰가 같은 정의를 쓴다. */
export function summarizeSplitGain(sd: SplitGainResult): SplitGainSummary {
  const parts: SplitGainPartSummary[] = ownedParts(sd).map(([key, p]) => {
    const swapApplied = p.swapApplied === true;
    return {
      key,
      label: PART_LABEL[key],
      mode: p.acqMode,
      transferPrice: p.transferPrice,
      acquisitionPrice: p.acquisitionPrice,
      acquisitionDeducted: splitPartAcquisitionDeducted(p),
      directExpenses: p.directExpenses,
      appraisalDeduction: p.appraisalDeduction,
      swapApplied,
      gain: p.gain,
      acquisitionCause: p.acquisitionCause,
      acquisitionDate: p.acquisitionDate,
      rateBasisAcquisitionDate: p.rateBasisAcquisitionDate,
      rateBasisRule: p.rateBasisRule,
      appliedRateBasisDate: p.appliedRateBasisDate,
    };
  });
  const sum = (f: (p: SplitGainPartSummary) => number) => parts.reduce((s, p) => s + f(p), 0);
  const [a, b] = parts;
  const mixedCause =
    parts.length === 2 && !!a.acquisitionCause && !!b.acquisitionCause && a.acquisitionCause !== b.acquisitionCause;
  return {
    mixedCause,
    rateBasisShown: mixedCause && sd.partRateBasisApplied === true,
    transferPrice: sum((p) => p.transferPrice),
    acquisitionDeducted: sum((p) => p.acquisitionDeducted),
    necessaryExpense: sum((p) => p.directExpenses + p.appraisalDeduction),
    gain: sum((p) => p.gain),
    parts,
  };
}

const won = (n: number) => n.toLocaleString();
const joinOrZero = (xs: string[]) => (xs.length ? xs.join(" + ") : "0");

/**
 * 「양도차익 계산」 step 문구 — 파트 합 기준.
 *
 * `양도가(토지 X + 건물 Y) - 취득가(토지 실거래가 A + 건물 환산취득가 B) - 경비(건물 개산공제 C)`
 * 글자 그대로 계산하면 단계 amount가 나온다. 파트 모드가 없거나(구 결과) 항등식이 깨지면 `null` —
 * 호출부가 종전 문구로 후퇴한다(거짓말보다 종전이 낫다).
 */
export function buildSplitGainFormula(sd: SplitGainResult): string | null {
  const s = summarizeSplitGain(sd);
  if (s.parts.length === 0 || s.parts.some((p) => p.mode === undefined)) return null;
  if (s.transferPrice - s.acquisitionDeducted - s.necessaryExpense !== s.gain) return null;

  const transferItems = s.parts.map((p) => `${p.label} ${won(p.transferPrice)}`);
  // §97②2호 단서 swap 파트는 취득가를 차감하지 않는다 — 취득가 항에서 뺀다.
  const acquisitionItems = s.parts
    .filter((p) => !p.swapApplied)
    .map((p) => `${p.label} ${splitAcqModeLabel(p.mode!)} ${won(p.acquisitionPrice)}`);
  // 파트당 한 갈래만 나온다 — 실거래가는 직접경비만, 비실가 비swap은 개산공제만, swap은 직접경비만.
  const expenseItems: string[] = [];
  for (const p of s.parts) {
    if (p.directExpenses > 0) {
      expenseItems.push(
        p.swapApplied
          ? `${p.label} 자본적지출·양도비 ${won(p.directExpenses)} — 환산취득가액·개산공제 대신 적용`
          : `${p.label} 자본적지출·양도비 ${won(p.directExpenses)}`,
      );
    }
    if (p.appraisalDeduction > 0) expenseItems.push(`${p.label} 개산공제 ${won(p.appraisalDeduction)}`);
  }
  return `양도가(${joinOrZero(transferItems)}) - 취득가(${joinOrZero(acquisitionItems)}) - 경비(${joinOrZero(expenseItems)})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 장기보유특별공제 — 파트별 보유·거주 분해
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 파트 공제액의 보유분·거주분 분해(E-1) — 정수 % 단위로 나눈 뒤 분수로 되돌린다.
 *
 * `holdingOnlyRate`는 거주 0으로 부른 공제율(`calcLongTermRate(y, 0, …)`)이라 보유분만이다.
 * 거주분 율 = 총율 − 보유분 율을 **정수 %로 환산한 뒤** 뺀다(`0.68 − 0.4` 같은 double 뺄셈 금지).
 * 거주분 금액 = `floor(공제액 × 거주% ÷ 총%)`, 보유분 = 공제액 − 거주분(잔액 흡수 — 합 = 공제액).
 */
export function deriveSplitLthdEcho(args: {
  totalRate: number;
  holdingOnlyRate: number;
  deduction: number;
}): Pick<
  SplitPartResult,
  "holdingDeductionRate" | "residenceDeductionRate" | "holdingDeductionAmount" | "residenceDeductionAmount"
> {
  const totalPct = Math.round(args.totalRate * 100);
  const holdPct = Math.min(Math.round(args.holdingOnlyRate * 100), totalPct);
  const resPct = totalPct - holdPct;
  const residenceDeductionAmount = totalPct > 0 && resPct > 0 ? applyRateFraction(args.deduction, resPct, totalPct) : 0;
  return {
    holdingDeductionRate: holdPct / 100,
    residenceDeductionRate: resPct / 100,
    holdingDeductionAmount: args.deduction - residenceDeductionAmount,
    residenceDeductionAmount,
  };
}

export interface SplitLthdDisplayArgs {
  sd: SplitGainResult;
  /** 확정된 장기보유특별공제 총액(§98의2 특칙 재할당 후) */
  longTermHoldingDeduction: number;
  /** 표2(1세대1주택) 대상인가 — 표시 계층이 이미 계산 축과 같은 술어로 판정한 값 */
  isTable2: boolean;
  /** 2009~2020 양도분 표2 단일축(보유 연 8%) */
  singleAxis: boolean;
  /** 실거주 연수 */
  residenceYears: number;
}

const pct = (rate: number) => Math.round(rate * 100);

function partReason(p: SplitPartResult, a: SplitLthdDisplayArgs): string {
  const years = p.holdingYears;
  if (years < 3) return `보유 ${years}년 — 3년 미만은 공제 없음`;
  const total = pct(p.longTermRate);
  if (a.singleAxis) return `표2 보유 ${years}년×8% = ${total}%, 80% 한도 — 2020.12.31. 이전 양도분`;
  if (a.isTable2) {
    return `보유 ${years}년×4%=${pct(p.holdingDeductionRate!)}% + 거주 ${a.residenceYears}년×4%=${pct(p.residenceDeductionRate!)}%`;
  }
  return `보유 ${years}년×2% = ${total}%, 30% 한도`;
}

function nbReason(years: number, rate: number): string {
  return `표1 보유 ${years}년×2% = ${pct(rate)}%, 30% 한도`;
}

/**
 * 호출 전 가드 — 아래 중 하나라도 거짓이면 `false`(호출부가 종전 문구로 후퇴).
 *   ① 소유 파트 전부에 분해 echo가 있다(구 결과·장특 배제 경로는 없다)
 *   ② Σ(소유 파트 공제액) + 배율초과분 = 확정 공제 총액 — §98의2 특칙 재할당 등 총액이 달라진 경우를 거른다
 *   ③ Σ 분해(보유분 + 거주분) + 배율초과분 = 총액
 */
function guardOk(a: Pick<SplitLthdDisplayArgs, "sd" | "longTermHoldingDeduction">): boolean {
  const owned = ownedParts(a.sd);
  if (owned.length === 0) return false;
  let partSum = 0;
  let echoSum = 0;
  for (const [, p] of owned) {
    if (
      p.holdingDeductionRate === undefined ||
      p.residenceDeductionRate === undefined ||
      p.holdingDeductionAmount === undefined ||
      p.residenceDeductionAmount === undefined
    ) {
      return false;
    }
    partSum += p.longTermDeduction;
    echoSum += p.holdingDeductionAmount + p.residenceDeductionAmount;
  }
  const nbDed = a.sd.nonBusinessLandPart?.longTermDeduction ?? 0;
  return partSum + nbDed === a.longTermHoldingDeduction && echoSum + nbDed === a.longTermHoldingDeduction;
}

/**
 * 「장기보유특별공제」 step 문구 — 파트별 `과세 양도차익 × 공제율 = 공제액`의 합.
 * 종전의 `× 0%`·건물 보유연수 하나(`보유기간 N년 M개월`) 꼬리는 쓰지 않는다. 가드 실패 시 `null`.
 */
export function buildSplitLthdFormula(a: SplitLthdDisplayArgs): string | null {
  if (!guardOk(a)) return null;
  const items = ownedParts(a.sd).map(([key, p]) => {
    const base = Math.max(p.taxableGainAfterProration ?? p.gain, 0);
    return `${PART_LABEL[key]}분 ${won(base)} × ${pct(p.longTermRate)}% = ${won(p.longTermDeduction)} (${partReason(p, a)})`;
  });
  const nb = a.sd.nonBusinessLandPart;
  if (nb) {
    items.push(
      `배율초과 부수토지분 ${won(Math.max(nb.taxableGainAfterProration ?? nb.gain, 0))} × ${pct(nb.longTermRate)}% = ${won(nb.longTermDeduction)} (${nbReason(nb.holdingYears, nb.longTermRate)})`,
    );
  }
  return items.join(" + ");
}

/**
 * 분리 자산의 **보유 기간분·거주 기간분 장특 합계** — 소유 파트의 엔진 echo 합(+ 배율초과 부수토지분은 보유분).
 *
 * 합산 상세명세서 자산별·합계 행이 이 값을 읽는다 — 종전에는 공제 총액을 폼값(거주 개월)으로 다시 안분(`splitLtDeduction`)해
 * 신고서·단건 step 문구와 다른 숫자를 냈다. `holdingAmount + residenceAmount = longTermHoldingDeduction`이 성립할 때만 값을 낸다
 * (구 이력·장특 배제 경로는 echo가 없고, §98의2 특칙 재할당 등으로 총액이 달라진 경우도 거른다) — 아니면 `null`(호출부가 종전 재안분).
 */
export function sumSplitLthdAmounts(
  sd: SplitGainResult,
  longTermHoldingDeduction: number,
): { holdingAmount: number; residenceAmount: number } | null {
  if (!guardOk({ sd, longTermHoldingDeduction })) return null;
  let holdingAmount = 0;
  let residenceAmount = 0;
  for (const [, p] of ownedParts(sd)) {
    holdingAmount += p.holdingDeductionAmount!;
    residenceAmount += p.residenceDeductionAmount!;
  }
  holdingAmount += sd.nonBusinessLandPart?.longTermDeduction ?? 0;
  return { holdingAmount, residenceAmount };
}

export interface SplitLthdSubFormula {
  formula: string;
  amount: number;
}

/**
 * 표2 「보유 기간분 장특」·「거주 기간분 장특」 sub-step — **Σ 파트별 분해**.
 * 배율초과 부수토지분(표1 보유)은 보유분에 들어간다 — 합 = 총 공제액 불변식을 지킨다. 가드 실패 시 `null`.
 */
export function buildSplitLthdSubFormulas(
  a: SplitLthdDisplayArgs,
): { holding: SplitLthdSubFormula; residence: SplitLthdSubFormula } | null {
  if (!guardOk(a)) return null;
  const owned = ownedParts(a.sd);
  const holdItems: string[] = [];
  const resItems: string[] = [];
  let holdAmount = 0;
  let resAmount = 0;
  for (const [key, p] of owned) {
    const label = `${PART_LABEL[key]}분`;
    const hold = p.holdingDeductionAmount!;
    const res = p.residenceDeductionAmount!;
    holdAmount += hold;
    resAmount += res;
    if (p.holdingYears < 3) {
      const why = `보유 ${p.holdingYears}년 — 3년 미만은 공제 없음`;
      holdItems.push(`${label} ${won(hold)} (${why})`);
      resItems.push(`${label} ${won(res)} (${why})`);
    } else {
      holdItems.push(`${label} ${won(hold)} (보유 ${p.holdingYears}년×4% = ${pct(p.holdingDeductionRate!)}%)`);
      resItems.push(`${label} ${won(res)} (거주 ${a.residenceYears}년×4% = ${pct(p.residenceDeductionRate!)}%)`);
    }
  }
  const nb = a.sd.nonBusinessLandPart;
  if (nb) {
    holdAmount += nb.longTermDeduction;
    holdItems.push(`배율초과 부수토지분 ${won(nb.longTermDeduction)} (${nbReason(nb.holdingYears, nb.longTermRate)})`);
  }
  return {
    holding: { formula: holdItems.join(" + "), amount: holdAmount },
    residence: { formula: resItems.join(" + "), amount: resAmount },
  };
}
