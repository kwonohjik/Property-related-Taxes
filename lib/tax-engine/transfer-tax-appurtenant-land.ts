/**
 * 주택 **부수토지**의 §104② 세율 기산일 · 배율 초과분 · 비과세 제외 판정.
 *
 * `transfer-tax-split-rate.ts` 800줄 정책으로 분리했다(2026-08-02 · P12 1단계).
 * 분기 순서·산식 문자열·export 이름은 **종전 그대로**다
 * (memory `feedback_800line_split_export_preservation`).
 *
 * 이 파일은 「토지 파트가 **언제부터** 보유한 것으로 보는가 / **어디까지** 부수토지인가 /
 * 그 중 비과세에서 빠지는 부분은 어디인가」만 다룬다. 그 판정을 받아 실제 세율·§104⑤
 * 비교과세를 수행하는 쪽이 `transfer-tax-split-rate.ts`다 — **단방향**(이 파일 → split-rate)이라
 * 순환이 없다.
 */
import { calculateHoldingPeriod } from "./tax-utils";
import { round2 } from "./area-utils";
import { appurtenantLandMultiplier } from "./appurtenant-land-rate";
import { resolveRateBasisAcquisitionDate } from "./transfer-rate-holding-basis";
import { TRANSFER } from "./legal-codes";
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";

/** 「소득세법」 시행령 제154조 제1항 1세대1주택 보유요건 (2년) */
const ONE_HOUSE_HOLDING_MONTHS = 24;

/**
 * 토지 파트의 §104② 세율 보유기간 기산일.
 *
 * - **비주택**: 토지 취득일 그대로.
 * - **주택**(계획서 §5.4 G-3): **`max(토지 취득일, 주택 취득일)`**.
 *   §104①2호 괄호의 "주택… 이에 딸린 토지"는 **주택부수토지로서의** 보유기간을 뜻하므로,
 *   토지를 먼저 샀으면 주택 취득일(= 현행 동작 · 조심 2024인3140 정합), 토지를 나중에 샀으면
 *   토지 취득일이 기산일이 된다. `max` 하나가 양방향을 모두 설명한다.
 *   근거 수준은 **간접**이다 — 국세청 상속증여세과-466(2013.8.12.)·부동산거래관리과-435(2010.3.22.)가
 *   부수토지의 **취득시기를 개별 판정**하도록 한 데서 논리적으로 이어진 것이고, "세율 보유기간을
 *   `max`로" 라는 명시 판단은 없다(계획서 §10-1). ⇒ 되돌릴 수 있도록 이 함수 하나에 격리한다.
 */
export function resolveAppurtenantLandRateBasisDate(input: TransferTaxInput): Date | undefined {
  const effective = resolveLandStatutoryAcquisitionDate(input);
  if (!effective) return undefined;
  // ② 주택은 "주택부수토지로서의" 보유기간 → `max`
  if (input.propertyType !== "housing") return effective;
  return effective.getTime() >= input.acquisitionDate.getTime() ? effective : input.acquisitionDate;
}

/**
 * 토지 파트의 §104② 보유기간 기산일 — **주택 `max` 적용 전**의 법정 취득일.
 *
 * 「소득세법」 제104조 제2항 단서를 **토지 파트 고유의 취득원인**으로 적용한다(G-4).
 *   1호 상속 → 피상속인이 그 자산을 취득한 날
 *   2호 §97의2① 이월과세 → 증여자가 그 자산을 취득한 날
 * 토지 취득원인(`landAcquisitionCause`)이 명시되면 그 원인·날짜만 쓰고, 없으면 자산 단위
 * 값을 그대로 상속한다(회귀 0 — 종전에는 `calcTax`가 자산 단위 값으로 덮어썼다).
 */
export function resolveLandStatutoryAcquisitionDate(input: TransferTaxInput): Date | undefined {
  const land = input.landAcquisitionDate;
  if (!land) return undefined;
  const useLandCause = input.landAcquisitionCause !== undefined;
  // 판정은 `transfer-rate-holding-basis.ts` 단일 소스 — **단순 증여(`gift`)는 통산하지 않는다**.
  // 종전에는 `gift`도 증여자 취득일로 소급해 주택 단기 70%를 회피시켰다(계획서 D-3④).
  return resolveRateBasisAcquisitionDate({
    acquisitionCause: useLandCause ? input.landAcquisitionCause : input.acquisitionCause,
    acquisitionDate: land,
    decedentAcquisitionDate: useLandCause
      ? input.landDecedentAcquisitionDate
      : input.decedentAcquisitionDate,
    donorAcquisitionDate: useLandCause
      ? input.landDonorAcquisitionDate
      : input.donorAcquisitionDate,
  });
}

/**
 * 토지 파트 세율 판정용 입력 — 기산일을 확정한 뒤 **자산 단위 §104② 재적용을 무력화**한다.
 * `calcTax`의 `rateBasisAcquisitionDate`는 `acquisitionCause`가 상속·증여면 `acquisitionDate`를
 * 무시하고 피상속인·증여자 취득일로 덮어쓰므로, 여기서 이미 통산을 마친 날짜가 무시된다.
 */
export function buildLandRateInput(input: TransferTaxInput, basisDate: Date): TransferTaxInput {
  return {
    ...input,
    acquisitionDate: basisDate,
    acquisitionCause: "purchase",
    decedentAcquisitionDate: undefined,
    donorAcquisitionDate: undefined,
  };
}

/**
 * G-3 비과세 축 — 주택 부수토지를 **나중에** 취득해 보유 2년 미만이면 그 토지분은
 * 1세대1주택 비과세를 적용하지 않는다(「소득세법」 시행령 제154조 제1항 보유요건 미충족).
 * 건물분과 2년 이상 보유한 토지분만 비과세 대상이다(계획서 §5.4).
 *
 * `splitDetail` 없이 **입력만으로** 판정한다 — 전액 비과세 조기 반환(STEP 1a)을 막을지
 * 결정하는 시점에는 아직 양도차익이 계산되지 않았기 때문이다.
 */
export function isLaterAcquiredLandExemptExcluded(input: TransferTaxInput): boolean {
  if (input.propertyType !== "housing") return false;
  if ((input.selfOwns ?? "both") !== "both") return false;
  // 별개취득 입력이어야 `calcSplitGain`이 반드시 파트를 낸다(총액 경로로 흘러 null이 되지 않음).
  if (input.isSeparateAcquisition !== true) return false;
  const land = input.landAcquisitionDate;
  if (!land) return false;
  if (land.getTime() <= input.acquisitionDate.getTime()) return false;
  // 지분(총양도가) · 부담부증여(§159)는 12억 안분 분모가 자산 단위와 달라 파트별 안분 기준이
  // 확정돼 있지 않다 — 대상에서 제외한다(계획서 §5.4 선결 과제).
  if (input.totalPropertyTransferPrice !== undefined) return false;
  if (input.burdenedGiftDenominator !== undefined) return false;
  if (input.transferType === "burdened_gift" || input.acquisitionCause === "burdened_gift") return false;
  const held = calculateHoldingPeriod(land, input.transferDate);
  return held.years * 12 + held.months < ONE_HOUSE_HOLDING_MONTHS;
}

/** 주택 부수토지 배율 한도 판정 결과 (G-2) */
export interface AppurtenantLandExcess {
  /** 적용 배율 (3/5/10) */
  multiplier: number;
  /** 인정 한도 면적 = 정착면적 × 배율 */
  limitArea: number;
  /** 한도 초과 면적 */
  excessArea: number;
  /** 토지 양도차익 중 비사업용으로 이전할 비율 */
  nonBizRatio: number;
}

/**
 * 주택 부수토지 배율 한도 판정 — 초과분이 없으면 `null`.
 *
 * 배율 수치는 「소득세법」 시행령 제168조의12(비사업용 토지 축)와 제167조의5(세율 축)가
 * **동일**하다(3/5/5/10, 2022.1.1. 전 양도분은 도시지역 일률 5배). 입력 필드가
 * `appurtenantLandZone`이므로 그 축의 헬퍼(`appurtenantLandMultiplier`)를 그대로 쓰되,
 * **여기서의 근거 조문은 비사업용 토지 축인 시행령 제168조의12**다(§1.1.1 「축을 섞지 말 것」).
 *
 * ⚠️ 용도지역(`appurtenantLandZone`) 미입력 시 진입하지 않는다 — 미입력 fallback은 가장 작은
 * 한도(3배)를 돌려주어 초과면적을 과다 산출하고 **납세자에게 불리**해진다(계획서 R-7).
 * 미입력은 ⑧validate가 차단한다.
 */
export function resolveAppurtenantLandExcess(
  input: TransferTaxInput,
): AppurtenantLandExcess | null {
  if (input.propertyType !== "housing") return null;
  if ((input.selfOwns ?? "both") !== "both") return null;
  if (input.isSeparateAcquisition !== true) return null;
  if (input.appurtenantLandZone === undefined) return null;
  const footprint = input.buildingFootprintArea ?? 0;
  const landArea = input.acquisitionArea ?? 0;
  if (footprint <= 0 || landArea <= 0) return null;

  const multiplier = appurtenantLandMultiplier(input.appurtenantLandZone, input.transferDate);
  const limitArea = round2(footprint * multiplier);
  const excessArea = round2(Math.max(0, landArea - limitArea));
  if (excessArea <= 0) return null;
  return { multiplier, limitArea, excessArea, nonBizRatio: excessArea / landArea };
}

/** `applyHousingLandExclusions` 결과 */
export interface HousingLandExclusionResult {
  /** 배율 초과분(비사업용 토지) 양도차익 — 12억 안분 대상 아님 */
  nonBusinessGain: number;
  /** 배율 내 토지분 과세 양도차익 */
  landTaxableGain: number;
  /** 건물분의 12억 안분 후 과세 양도차익 */
  buildingTaxableGain: number;
  /** 자산 과세 양도차익 = 위 셋의 합 (Σ파트 = 자산 불변식) */
  taxableGain: number;
  step: CalculationStep;
}

/**
 * 주택 부수토지 중 **1세대1주택 비과세 대상이 아닌 부분**을 분리한다 (G-2 + G-3).
 *
 * 겸용주택 정본(`buildHousingPart`)의 ①→② 순서를 그대로 따른다:
 *   ① 비과세 비대상분을 **안분 전** 양도차익에서 분리 — 전액 과세
 *      · G-2: 배율 초과분 → 비사업용 토지(§104의3①5호). 별도 파트로 조립한다.
 *      · G-3: 배율 내이지만 나중 취득으로 보유 2년 미만인 토지분(영 §154① 보유요건 미충족).
 *   ② 12억 안분(영 §160①)은 **잔여 주택분**(배율 내 + 2년 이상 토지 + 건물)에만 적용.
 *      분모는 자산 양도가액 그대로다 — 고가주택 판정(§89①3호)은 주택과 그 부수토지 전체의
 *      실지거래가액 기준이기 때문이다.
 *
 * 파트별 과세 양도차익을 `splitDetail`에 역기입해 `calcLongTermHoldingDeduction`이 같은 값으로
 * 장특공제를 산정하게 한다(이중 안분 방지).
 *
 * 적용 대상이 아니면 `null` — 호출부는 기존 안분 경로를 그대로 쓴다.
 */
export function applyHousingLandExclusions(args: {
  input: TransferTaxInput;
  splitDetail: SplitGainResult | undefined;
  isExempt: boolean;
  isPartialExempt: boolean;
  /** `calcOneHouseProration` — 12억 안분(영 §160①) 단일 소스 */
  prorate: (gain: number) => number;
}): HousingLandExclusionResult | null {
  const { input, splitDetail, isExempt, isPartialExempt, prorate } = args;
  if (!splitDetail) return null;
  const excess = resolveAppurtenantLandExcess(input);
  const laterLand = isLaterAcquiredLandExemptExcluded(input);
  if (!excess && !laterLand) return null;

  const landGain = Math.max(0, splitDetail.land.gain);
  const buildingGain = Math.max(0, splitDetail.building.gain);

  // ① 배율 초과분을 비사업용 토지로 이전 (12억 안분 대상 아님)
  const nonBusinessGain = excess ? Math.floor(landGain * excess.nonBizRatio) : 0;
  const housingLandGain = landGain - nonBusinessGain;

  // ② 잔여 주택분 — 비과세 대상이면 안분(전액 비과세면 0), 아니면 전액 과세
  const exemptApplies = isExempt || isPartialExempt;
  const applyExempt = (gain: number) => (isExempt ? 0 : prorate(gain));
  //   배율 내 토지분: G-3(보유 2년 미만)이면 비과세 대상이 아니라 전액 과세
  const landTaxableGain =
    !exemptApplies || laterLand ? housingLandGain : applyExempt(housingLandGain);
  const buildingTaxableGain = !exemptApplies ? buildingGain : applyExempt(buildingGain);

  splitDetail.land.taxableGainAfterProration = landTaxableGain;
  splitDetail.building.taxableGainAfterProration = buildingTaxableGain;
  if (excess) {
    splitDetail.nonBusinessLandPart = {
      limitArea: excess.limitArea,
      excessArea: excess.excessArea,
      appliedMultiplier: excess.multiplier,
      gain: nonBusinessGain,
      taxableGainAfterProration: nonBusinessGain,
      holdingYears: splitDetail.land.holdingYears,
      longTermRate: 0, // `calcLongTermHoldingDeduction`이 표1로 채운다
      longTermDeduction: 0,
    };
  }

  const reasons: string[] = [];
  if (excess) {
    reasons.push(
      `배율 초과분 ${excess.excessArea.toFixed(2)}㎡(한도 정착면적 × ${excess.multiplier}배 = ` +
        `${excess.limitArea.toFixed(2)}㎡)는 「소득세법」 제104조의3 제1항 제5호의 비사업용 토지 — ` +
        `양도차익 ${nonBusinessGain.toLocaleString()}을 분리해 전액 과세`,
    );
  }
  if (laterLand) {
    const held = calculateHoldingPeriod(input.landAcquisitionDate!, input.transferDate);
    reasons.push(
      `주택 취득 후 취득한 부수토지(보유 ${held.years}년 ${held.months}개월)는 「소득세법」 ` +
        `시행령 제154조 제1항 보유요건 미충족으로 1세대1주택 비과세 대상이 아님 — ` +
        `양도차익 ${housingLandGain.toLocaleString()}을 12억 안분 없이 전액 과세`,
    );
  }
  const taxableGain = nonBusinessGain + landTaxableGain + buildingTaxableGain;
  return {
    nonBusinessGain,
    landTaxableGain,
    buildingTaxableGain,
    taxableGain,
    step: {
      label: "부수토지 비과세 제외",
      formula: `${reasons.join(" / ")} · 건물분 과세 양도차익 ${buildingTaxableGain.toLocaleString()}`,
      amount: taxableGain,
      legalBasis: TRANSFER.ONE_HOUSE_EXEMPT,
    },
  };
}

/** STEP 1a 전액 비과세 조기 반환을 억제해야 하는가 (G-2 또는 G-3) */
export function hasHousingLandExemptExclusion(input: TransferTaxInput): boolean {
  return isLaterAcquiredLandExemptExcluded(input) || resolveAppurtenantLandExcess(input) !== null;
}
