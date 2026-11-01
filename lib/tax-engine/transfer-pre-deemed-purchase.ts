/**
 * STEP 0.471 — 의제취득일(1985.1.1.) 전 «매수» 부동산 취득가액: 영 §176조의2④ 「많은 것」
 *
 *   1호 ① 의제취득일 현재 §176조의2③1~3호 가액(매매사례·감정·환산)
 *   2호 ② 취득 당시 실지거래가액 + 그 가액 × 취득일~의제취득일 직전일 생산자물가상승률
 *        = floor(실가 × 1984.12. 지수 ÷ 취득월 지수) — 재산46014-10094
 * 실가로 신고해도 비교한다(제도46014-12108 · 대법원 2002두4075·2004두1520). 2호는 상속·증여에 부적용 — 매수만.
 *
 * 선택·필요경비는 주식 구현(`stock-pre-deemed-acquisition.ts` `resolvePreDeemedBasis`)과 같은 규약이다:
 *   ① > ②일 때만 ①(입력 모드 그대로 — 개산공제 · 환산이면 §97②2호 단서 swap) · 동액이면 ② ·
 *   ② 채택이면 실가 경로(법 §97②1호 나목 — 실비, 개산공제 없음) · 실가 모드는 ①이 없어 ②만(「① 미산정」).
 * ①은 이 STEP 뒤의 본 계산과 같은 함수로 구한다(`calcTransferGain` · 상가 `runCommercialBuildingStep`) — 산식 이중화 금지.
 *
 * 범위(계획서 `docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md` Q-3 a · §12):
 *   토지·주택(토지·건물 같은 날 취득 · PHD 포함)·건물·상가 · 재개발 원조합원(완공 APT·입주권 — ① = 영 §166③ · Q-4 a).
 *   토지·건물 취득일 분리는 한 파트만 의제취득일 전일 때 그 파트만 비교한다(`part` · 계획서 §12.8).
 *   일반건물은 이 STEP을 타지 않는다 — 실가 경로가 안분 전 총액에 ②를 쓴다(`general-building-route-actual.ts` · Q-8 a · Q-15 b).
 *   그 밖의 입력은 값을 바꾸지 않고 사유를 경고로 남긴다(⑧·⑫가 먼저 막는다).
 */

import type { CalculationStep, TransferTaxInput } from "./types/transfer.types";
import type { PreDeemedPurchaseDetail } from "./types/transfer-pre-deemed-purchase.types";
import { DEEMED_ACQUISITION_DATE } from "./types/inheritance-acquisition.types";
import { monthKey } from "./producer-price-ratio";
import { computePreDeemedClause2 } from "./pre-deemed-purchase-clause2";
import { calcTransferGain } from "./transfer-tax-helpers";
import { calcSplitGain } from "./transfer-tax-split-gain";
import { deriveLegacyAcqMode } from "./transfer-tax-split-acq-price";
import { runCommercialBuildingStep } from "./transfer-tax-commercial-step";
import { isRedevelopmentActive } from "./redevelopment-dispatch";
import { resolveRedevelopment166_3AcquisitionPrice } from "./redevelopment-166-3-price";
import { TRANSFER } from "./legal-codes/transfer";

const IN_SCOPE_PROPERTY_TYPES: ReadonlySet<TransferTaxInput["propertyType"]> = new Set([
  "land",
  "housing",
  "building",
  "commercial_building",
]);

const METHOD_LABEL: Record<NonNullable<PreDeemedPurchaseDetail["clause1Method"]>, string> = {
  estimated: "환산취득가액",
  appraisal: "감정가액",
  salesCase: "매매사례가액",
  redevelopment166_3: "§166③ 환산취득가액",
};

const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();

/** 범위 밖이면 그 사유 — 없으면 범위 안 */
export function preDeemedPurchaseOutOfScopeReason(input: TransferTaxInput): string | undefined {
  if (input.acquisitionCause !== undefined && input.acquisitionCause !== "purchase") return "취득원인이 매매가 아닙니다";
  if (input.transferType === "burdened_gift") return "부담부증여";
  if (input.inheritedAcquisition || input.carryoverTaxation) return "상속·증여·이월과세 취득가액";
  if (input.parcels?.length || input.mixedUse) return "다필지·겸용주택";
  if (input.redevelopment) {
    if (
      !isRedevelopmentActive(input.propertyType, input.redevelopment, input.isSuccessorRightToMoveIn) ||
      input.redevelopment.isSuccessorMember === true
    ) {
      return "재개발 원조합원 외";
    }
  } else if (!IN_SCOPE_PROPERTY_TYPES.has(input.propertyType)) {
    return "자산 종류";
  }
  const part = input.preDeemedPurchase?.part;
  if (part) {
    // 파트 비교 — 별개 취득(날짜가 다름) · 주택·건물(`calcSplitGain` 경로) · 그 파트 날짜가 의제취득일 · 파트 원인 혼합 없음
    const partDate = part === "land" ? input.landAcquisitionDate : input.acquisitionDate;
    if (
      (input.propertyType !== "housing" && input.propertyType !== "building") ||
      !input.landAcquisitionDate ||
      sameDay(input.landAcquisitionDate, input.acquisitionDate) ||
      !partDate ||
      !sameDay(partDate, DEEMED_ACQUISITION_DATE) ||
      (input.landAcquisitionCause !== undefined && input.landAcquisitionCause !== "purchase") ||
      (input.selfOwns !== undefined && input.selfOwns !== "both")
    ) {
      return "토지·건물 파트 비교 대상 아님";
    }
  } else if (input.landAcquisitionDate && !(input.preHousingDisclosure && sameDay(input.landAcquisitionDate, input.acquisitionDate))) {
    return "토지·건물 취득일 분리";
  }
  return undefined;
}

export type PreDeemedPurchaseStepResult =
  | { applied: false; warning: string }
  | {
      applied: true;
      updatedInput: TransferTaxInput;
      detail: PreDeemedPurchaseDetail;
      step: CalculationStep;
      /** ② 채택으로 추계(STEP 0.4 1990.8.30. 전 토지 환산 포함)를 쓰지 않게 됐다 — 그 echo를 결과에서 뺀다 */
      dropsEstimatedEcho: boolean;
    };

function clause1Of(input: TransferTaxInput): { amount: number; method: NonNullable<PreDeemedPurchaseDetail["clause1Method"]> } | undefined {
  if (input.redevelopment) {
    const amount = resolveRedevelopment166_3AcquisitionPrice(input.redevelopment, input.acquisitionDate) ?? 0;
    return amount > 0 ? { amount, method: "redevelopment166_3" } : undefined;
  }
  if (input.useEstimatedAcquisition) {
    const cb = runCommercialBuildingStep(input);
    const amount = cb ? cb.acquisitionPrice : calcTransferGain(input).estimatedBase;
    return amount > 0 ? { amount, method: "estimated" } : undefined;
  }
  if (input.acquisitionMethod === "appraisal" || input.acquisitionMethod === "salesCase") {
    const amount = calcTransferGain(input).estimatedBase;
    return amount > 0 ? { amount, method: input.acquisitionMethod } : undefined;
  }
  return undefined;
}

/** 파트 ① — 본 계산과 같은 함수의 그 파트 취득가액(§176조의2③ · 상대 파트 영향 없음) */
function partClause1Of(
  input: TransferTaxInput,
  part: "land" | "building",
  mode: "actual" | "estimated" | "appraisal" | "salesCase",
): { amount: number; method: NonNullable<PreDeemedPurchaseDetail["clause1Method"]> } | undefined {
  const amount = calcSplitGain(input)?.[part].acquisitionPrice ?? 0;
  return amount > 0 && mode !== "actual" ? { amount, method: mode } : undefined;
}

/**
 * @returns 입력이 없거나 의제취득일 이후 취득·②의 기준 실가가 없으면 undefined(no-op)
 */
export function runPreDeemedPurchaseStep(
  input: TransferTaxInput,
  hasAcquisitionOverride: boolean,
): PreDeemedPurchaseStepResult | undefined {
  const pd = input.preDeemedPurchase;
  if (!pd || !(pd.originalAcquisitionDate.getTime() < DEEMED_ACQUISITION_DATE.getTime())) return undefined;
  const outOfScope = hasAcquisitionOverride ? "외부 취득가액 지정" : preDeemedPurchaseOutOfScopeReason(input);
  if (outOfScope) {
    return { applied: false, warning: `${TRANSFER.PRE_DEEMED_PURCHASE_MAX} 비교를 적용하지 않았습니다 — 범위 밖(${outOfScope}).` };
  }

  const part = pd.part;
  const partMode = part ? ((part === "land" ? input.landAcqMode : input.buildingAcqMode) ?? deriveLegacyAcqMode(input)) : undefined;
  // 재개발 §166 경로는 감정·매매사례를 읽지 않는다 — 모드는 환산 플래그 하나다(`transfer-tax-redevelopment-steps.ts`).
  const isActualMode = part
    ? partMode === "actual"
    : input.redevelopment
      ? !input.useEstimatedAcquisition
      : !input.useEstimatedAcquisition && input.acquisitionMethod !== "appraisal" && input.acquisitionMethod !== "salesCase";
  const partActual = part === "land" ? input.landAcquisitionPrice : input.buildingAcquisitionPrice;
  const actualBase = Math.max(0, Math.floor(isActualMode ? (part ? (partActual ?? 0) : input.acquisitionPrice) : (pd.actualPrice ?? 0)));
  if (!(actualBase > 0)) return undefined;

  const c2 = computePreDeemedClause2(actualBase, pd);
  if (!c2) {
    // 자동 fallback 금지 — ⑧·⑫가 막는 입력이다. 엔진 직접 호출 방어로 ②를 산정하지 않았음을 남긴다.
    return {
      applied: false,
      warning: `취득월(${monthKey(pd.originalAcquisitionDate).key})이 생산자물가지수 계열(1965.01~) 이전이라 ②(${TRANSFER.PRE_DEEMED_PURCHASE_MAX} 2호)를 산정하지 않았습니다 — 물가상승 배율을 입력하세요.`,
    };
  }
  const { clause2Amount, ratio, ratioSource, acquisitionMonth, deemedPrevMonth, ppiAtAcquisition, ppiAtDeemedPrev } = c2;

  const clause1 = isActualMode ? undefined : part ? partClause1Of(input, part, partMode!) : clause1Of(input);
  const selected: PreDeemedPurchaseDetail["selected"] = clause1 && clause1.amount > clause2Amount ? "clause1" : "clause2";
  const detail: PreDeemedPurchaseDetail = {
    ...(part ? { part } : {}),
    ...c2,
    ...(clause1 ? { clause1Amount: clause1.amount, clause1Method: clause1.method } : {}),
    selected,
    expenseBasis: selected === "clause2" ? "actual" : "estimated",
  };

  const ratioText =
    ratioSource === "table"
      ? `생산자물가지수 ${deemedPrevMonth} ${ppiAtDeemedPrev!.toFixed(2)} ÷ ${acquisitionMonth} ${ppiAtAcquisition!.toFixed(2)}`
      : `물가상승 배율 ${ratio}(직접 입력)`;
  const step: CalculationStep = {
    label: "의제취득일 전 매수 — 취득가액 비교",
    formula:
      `② 취득 당시 실지거래가액 ${actualBase.toLocaleString()} × ${ratioText} = ${clause2Amount.toLocaleString()}` +
      (clause1
        ? ` · ① 의제취득일 현재 ${METHOD_LABEL[clause1.method]} ${clause1.amount.toLocaleString()} → ${selected === "clause1" ? "①" : "②"} 채택`
        : " · ① 미산정 → ② 적용"),
    amount: selected === "clause1" ? clause1!.amount : clause2Amount,
    legalBasis: `${TRANSFER.PRE_DEEMED_PURCHASE_MAX} · ${TRANSFER.PRE_DEEMED_PPI_RATE_RULE}`,
  };

  if (selected === "clause1") return { applied: true, updatedInput: input, detail, step, dropsEstimatedEcho: false };

  // ② 채택 — 실가 경로. 환산 플래그와 감정·매매사례 방식을 끊으면 `calcTransferGain`·상가 STEP 0.35가 ②를 실가로 차감한다.
  //   PHD·같은 날 토지 취득일은 두어도 분리 경로를 타지 않는다(PHD는 파트가 모두 환산일 때만 — `phdSplitPathTaken`).
  // 파트 비교는 그 파트만 실가 파트로 바꾼다 — 상대 파트의 모드·값은 그대로(혼합 모드 `calcPartAcquisitionPrice`).
  const updatedInput: TransferTaxInput = part
    ? part === "land"
      ? { ...input, landAcqMode: "actual", landAcquisitionPrice: clause2Amount }
      : { ...input, buildingAcqMode: "actual", buildingAcquisitionPrice: clause2Amount }
    : isActualMode
    ? { ...input, acquisitionPrice: clause2Amount }
    : { ...input, acquisitionPrice: clause2Amount, useEstimatedAcquisition: false, acquisitionMethod: "actual" };
  return { applied: true, updatedInput, detail, step, dropsEstimatedEcho: !isActualMode };
}
