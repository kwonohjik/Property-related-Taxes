/**
 * 「소득세법」 §114조의2 — 신축·증축 건물 5년 이내 양도 가산세 (순수 함수).
 *
 * `transfer-tax-rate-calc.ts`에서 분리(2026-08-11 — §104① 후단 배선으로 811줄 초과, 800줄 정책).
 * 세율·세액 결정(§104)과는 **다른 축**이라 이음매가 자연스럽다 — 이쪽은 취득가액 산정방법
 * (환산·감정)에 붙는 제재이고, 저쪽은 과세표준에 곱할 세율을 고르는 일이다.
 *
 * ⚠️ 종전 import 경로(`./transfer-tax-rate-calc`)를 깨지 않도록 그쪽에서 **재수출**한다
 *   (memory `feedback_800line_split_export_preservation`).
 */

import { addYears } from "date-fns";
import { applyRate, calculateEstimatedAcquisitionPrice } from "./tax-utils";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import type { TransferTaxInput, TransferTaxResult } from "./types/transfer.types";
import type { SplitPartResult } from "./types/transfer-split-gain.types";

/**
 * 취득가액 산정방식 × 양도일이 「소득세법」 §114조의2 가산세 **대상 조합**인가 — 엔진·UI 배지가 공유하는 단일 leaf.
 *
 * 환산취득가액은 양도일 ≥ 2018-01-01, 감정가액은 양도일 ≥ 2020-01-01. 매매사례가액(`salesCase`)과
 * 실지거래가액(`actual`)은 조문 문언(「감정가액 또는 환산취득가액」)에 없어 대상이 아니다.
 * `calculateBuildingPenalty`의 종전 인라인 게이트를 **그대로 추출**했다(거동 동일).
 *
 * 소비처가 날짜 게이트를 각자 재기술하면 환산·감정 게이트가 갈리는 순간 dual-truth가 된다(E-4).
 */
export function buildingPenaltyMethodApplies(
  method: TransferTaxInput["acquisitionMethod"],
  transferDate: Date,
): boolean {
  if (transferDate < new Date("2018-01-01")) return false;
  return (
    method === "estimated" ||
    (method === "appraisal" && transferDate >= new Date("2020-01-01"))
  );
}

export function calculateBuildingPenalty(
  input: TransferTaxInput,
  acquisitionPriceForPenalty: number,
): { penalty: number; note: string } | null {
  if (!input.isSelfBuilt) return null;

  const method = input.acquisitionMethod;
  const transferDate = input.transferDate;

  if (!buildingPenaltyMethodApplies(method, transferDate)) return null;

  if (input.buildingType === "extension") {
    if (transferDate < new Date("2020-01-01")) return null;
    if ((input.extensionFloorArea ?? 0) <= 85) return null;
  }

  if (!input.constructionDate) return null;
  // §114조의2 ① "취득일부터 5년 이내" — "이내"는 당일 포함 해석.
  // 정확한 날짜 비교(addYears 5)로 윤년·30일/31일 월말 경계 안전 처리.
  // 예: 취득 2018-03-31 → 5년 시점 2023-03-31. 양도일이 ≤ 2023-03-31이면 발동, > 이면 미적용.
  // 기존 365.25 분모 방식은 윤년에서 부정확(예: 2020-02-29 + 5년 = 2025-02-28인데 1826일 / 365.25 = 4.9986).
  const fifthAnniversary = addYears(input.constructionDate, 5);
  if (transferDate.getTime() > fifthAnniversary.getTime()) return null;

  const penalty = applyRate(acquisitionPriceForPenalty, 0.05);
  const typeLabel = `${input.penaltyDonorBuilt ? "증여자 " : ""}${input.buildingType === "extension" ? "증축" : "신축"}`;
  const methodLabel = method === "appraisal" ? "감정가액" : "환산취득가액";
  return {
    penalty,
    note: `${typeLabel} 5년 이내 양도 + ${methodLabel} 적용`,
  };
}

/**
 * §114조의2① 증축부분 한정 penalty base — 정상·손실 경로 공통 (single-source).
 * 통상(비-부담부) 양도에서 base를 증축부분 한정 값으로 산출.
 *   · 환산(K-5): 증축부분 환산취득가 = 양도가 × (증축부분 취득기준시가 ÷ 양도시 건물 기준시가) — calculateEstimatedAcquisitionPrice 재사용.
 *   · 감정가액: 입력한 「증축한 부분의 감정가액」(`extensionAppraisalValue`) — 조문이 「증축한 부분에 한정한 감정가액」이라 건물 전체로 대신하지 않는다.
 * - 부담부증여(transferType/acquisitionCause)는 step override가 effectiveInput.estimatedBase·`penaltyAxis`에 증축부분 base를 이미 실으므로 배제(fullBuildingBase 그대로).
 * - 신축·증축필드 미입력 시 fullBuildingBase(건물 전체) 유지(환산). 감정가액 증축은 게이트가 열렸는데 값이 없으면 오류.
 * finalize STEP 10.5(정상 이익)와 transfer-tax.ts 손실 조기반환(§114조의2② 산출세액0) 양쪽에서 호출 — dual-truth 방지.
 *
 * @param penaltyMethod 감정가액 증축을 **이 호출이 맡는** 축의 산정방식. 호출부가 넘긴다 —
 *   일반건물 카드·부담부증여는 `penaltyAxis`가 이미 증축 한정 base를 싣고 있어 넘기지 않는다(undefined).
 */
export function resolveExtensionPenaltyBase(
  input: TransferTaxInput,
  fullBuildingBase: number,
  penaltyMethod?: TransferTaxInput["acquisitionMethod"],
): number {
  const isBurdenedGiftPath =
    input.transferType === "burdened_gift" || input.acquisitionCause === "burdened_gift";
  if (isBurdenedGiftPath) return fullBuildingBase;
  if (
    input.useEstimatedAcquisition &&
    input.buildingType === "extension" &&
    (input.extensionStdPriceAtAcquisition ?? 0) > 0 &&
    (input.standardPriceAtTransfer ?? 0) > 0
  ) {
    return calculateEstimatedAcquisitionPrice(
      input.transferPrice,
      input.extensionStdPriceAtAcquisition!,
      input.standardPriceAtTransfer!,
    );
  }
  if (
    penaltyMethod === "appraisal" &&
    input.buildingType === "extension" &&
    calculateBuildingPenalty({ ...input, acquisitionMethod: "appraisal" }, 1) !== null
  ) {
    const extensionAppraisal = input.extensionAppraisalValue ?? 0;
    if (extensionAppraisal <= 0) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "건물을 증축하고 5년 이내에 양도하면서 취득가액을 감정가액으로 산정하면 「소득세법」 제114조의2에 따라 " +
          "증축한 부분의 감정가액에 5% 가산세가 붙으므로 증축한 부분의 감정가액을 입력해야 합니다. " +
          "건물 전체 감정가액으로 대신할 수 없습니다(증축한 부분에 한정한 금액이 기준입니다).",
      );
    }
    if (fullBuildingBase > 0 && extensionAppraisal > fullBuildingBase) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        `증축한 부분의 감정가액이 감정가액(${fullBuildingBase.toLocaleString()}원)보다 클 수 없습니다.`,
      );
    }
    return extensionAppraisal;
  }
  return fullBuildingBase;
}

/**
 * 🔴 **§114조의2 — 토지·건물 분리 자산의 판정 축은 「건물 파트」다** (2026-08-13).
 *
 * 「소득세법」 제114조의2 제1항은 base를 **「해당 건물의」 감정가액 또는 환산취득가액**으로
 * 명시한다(증축은 증축 부분 한정). 그런데 분리(§166⑥) 자산에서 게이트·base는 둘 다
 * **자산-수준** 값에서 왔다:
 *
 *   · 게이트: `calculateBuildingPenalty`가 읽는 `acquisitionMethod` — 파트 라디오
 *     (`landAcqMode`/`buildingAcqMode`)는 이 값을 갱신하지 않는다. 건물 파트가 환산이어도
 *     자산-수준이 실가면 **가산세가 발동하지 않는다**(실측: 0원).
 *   · base: `calcTransferGain`의 split 분기가 `estimatedBase = 토지 + 건물 합계`를 낸다.
 *     자산-수준을 환산으로 돌려 게이트를 켜면 이번엔 **토지 실취득가까지 base에 섞인다**
 *     (실측: 425,000,000 × 5% = 21,250,000 — 법정 정답 225,000,000 × 5% = 11,250,000의 약 1.9배).
 *
 * ⇒ 두 값을 **파트-국소 신호**(`SplitPartResult.acqMode`·`acquisitionPrice`)에서 가져온다.
 *   자산-수준 `useEstimatedAcquisition`을 파트에서 역파생하는 방식은 **채택하지 않는다** —
 *   그 플래그의 소비 지점이 이 엔진 안에만 35곳이고(split-gain `deriveLegacyAcqMode`의 모드
 *   미지정 파트 자동 환산 승격 · helpers `estimatedBase` 합계화 · 상가 STEP 0.35 · 공익수용
 *   평가 · 재개발), 과소를 과대로 바꿀 뿐이다. 같은 교리를 이미 쓰는 선례는
 *   `app/api/calc/transfer/general-building-route-cards.ts`(카드가 속한 파트의 축만 싣는다).
 *
 * 건물 파트가 실가·매매사례이면 `undefined`를 반환해 **종전 자산-수준 경로를 그대로 둔다**
 * (§114조의2 대상이 아니므로 `calculateBuildingPenalty`가 어차피 null을 낸다).
 *
 * 정상 경로(finalize STEP 10.5)와 손실 조기반환(`transfer-tax-loss-return.ts` — §114조의2②, 산출세액 0에도 적용)이
 * **같은 이 함수**를 쓴다(2026-10-16 — 종전엔 손실 경로가 이 축을 안 읽어 분리 취득 건물 파트의 가산세가 0이었다).
 *
 * 🔴 **증축은 증축부분 한정 base다**(§114조의2① 괄호 「증축의 경우 증축한 부분에 한정한다」 — 2026-10-16).
 *   종전엔 건물 파트 전체 환산·감정가액이 base였다(실측 225,000,000 / 250,000,000).
 *   · 환산: 증축부분 환산취득가 = 건물 파트 양도가액 × 증축부분 취득시 기준시가 ÷ 건물 양도시 기준시가
 *     — 비분리 경로(`resolveExtensionPenaltyBase`)가 자산 전체 값으로 쓰는 식을 「해당 건물」 값으로 쓴 것이다.
 *   · 감정가액: 입력한 「증축한 부분의 감정가액」(`extensionAppraisalValue`) — 건물 파트 감정가액으로 대신하지 않는다.
 */
export function resolveSplitBuildingPenaltyAxis(
  splitDetail: TransferTaxResult["splitDetail"],
  input: TransferTaxInput,
): { acquisitionMethod: "estimated" | "appraisal"; base: number } | undefined {
  const mode = splitDetail?.building.acqMode;
  if (mode !== "estimated" && mode !== "appraisal") return undefined;
  const building = splitDetail!.building;
  return { acquisitionMethod: mode, base: splitExtensionPenaltyBase(input, mode, building) };
}

/** 분리 취득 건물 파트의 §114조의2 base — 증축이고 가산세 게이트가 열릴 때만 증축부분 값, 그 밖은 건물 파트 전체. */
function splitExtensionPenaltyBase(
  input: TransferTaxInput,
  mode: "estimated" | "appraisal",
  building: SplitPartResult,
): number {
  const full = building.acquisitionPrice;
  if (input.buildingType !== "extension") return full;
  if (calculateBuildingPenalty({ ...input, acquisitionMethod: mode }, 1) === null) return full;
  if (mode === "estimated") {
    const extStdAtAcq = input.extensionStdPriceAtAcquisition ?? 0;
    const stdAtTransfer = building.stdPriceAtTransfer ?? 0;
    // 미입력이면 비분리 경로와 같이 건물 전체를 유지한다(⑧이 증축부분 기준시가를 필수로 받는다).
    if (extStdAtAcq <= 0 || stdAtTransfer <= 0) return full;
    return calculateEstimatedAcquisitionPrice(building.transferPrice, extStdAtAcq, stdAtTransfer);
  }
  const extensionAppraisal = input.extensionAppraisalValue ?? 0;
  if (extensionAppraisal <= 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "증축한 건물을 5년 이내에 양도하면서 건물 취득가액을 감정가액으로 산정하면 「소득세법」 제114조의2에 따라 " +
        "증축한 부분의 감정가액에 5% 가산세가 붙으므로 증축한 부분의 감정가액을 입력해야 합니다. " +
        "건물 감정가액 전체로 대신할 수 없습니다(증축한 부분에 한정한 금액이 기준입니다).",
    );
  }
  if (full > 0 && extensionAppraisal > full) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `증축한 부분의 감정가액이 건물 감정가액(${full.toLocaleString()}원)보다 클 수 없습니다.`,
    );
  }
  return extensionAppraisal;
}
