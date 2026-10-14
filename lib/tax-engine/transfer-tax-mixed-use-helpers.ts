/**
 * 겸용주택 분리계산 헬퍼 (순수 함수)
 *
 * transfer-tax-mixed-use.ts에서 사용하는 내부 헬퍼.
 * 소득세법 시행령 §160 ① 단서 / §164 / §168의12 / §95 ②
 */

import { highValueExcessLandTaxableGain } from "./high-value-excess-land";
import { applyFairMarketRatio } from "./tax-utils"; // 장특 공제율 × 차익 — double 공제율(0.68 등)의 1원 과소 방지(일반 경로 `applyLthdRate`와 같은 leaf)
import { getHousingMultiplier } from "./non-business-land/urban-area";
import {
  calcLongTermRate,
  buildHousingLthdEcho,
} from "./transfer-tax-mixed-use-inheritance";
import type { TransferTaxInput } from "./types/transfer.types";
/**
 * §159의4 표2 거주요건 — **단건과 같은 술어**. 겸용이 이것을 안 쓰던 것이 P5-c의 갭이었다.
 * 재수출 경로(`transfer-tax-exemption`)를 쓴다 — 5개 호출부 전부가 그 경로를 쓴다.
 */
import { meetsTable2ResidenceRequirement } from "./transfer-tax-exemption";
import type { CommercialGainSplit } from "./transfer-tax-mixed-use-commercial";
import type { HousingGainSplit } from "./transfer-tax-mixed-use-housing";
import type {
  MixedUseAssetInput,
  MixedUseDerivedAreas,
  MixedUseApportionment,
  MixedUseHousingPart,
  MixedUseCommercialPart,
  MixedUseNonBusinessLandPart,
  MixedUseTotalTax,
} from "./types/transfer-mixed-use.types";
import type { TaxBracket } from "./types";
import { calculateProgressiveTax } from "./tax-utils";
import { computeDerivedAreas, round2 } from "./mixed-use-derived-areas";
import { residualArea } from "./area-utils";
import { multiplyByArea } from "./area-utils";

// ──────────────────────────────────────────────────────────────
// 1. 면적 파생값 계산
// ──────────────────────────────────────────────────────────────

// round2 · computeDerivedAreas 는 leaf 모듈 `./mixed-use-derived-areas` 로 추출되어
// UI·사이드바·bridge·엔진이 단일 소스를 공유한다. 여기서는 재export 하여 하위 호환 유지.
// `MixedUseAssetInput` 은 leaf 파라미터(residentialLandAreaOverride? 포함) 구조를 만족하므로
// 호출부 `computeDerivedAreas(asset)` 가 그대로 override 를 자동 전파한다 (취득·양도 양시점).
export { computeDerivedAreas };

/**
 * 취득시 면적 파생값 산출 — 보유 중 일부 용도변경 (시행령 §166⑥).
 *
 * `partialUsageChange === undefined`이면 양도시 derived 그대로 반환 (backward compat).
 *
 * direction별 처리:
 *   - house_to_commercial: 취득시 전체가 주택. acqResidentialArea = 사용자입력 ?? 양도시 합계,
 *                          acqCommercialArea = 0
 *   - commercial_to_house: 취득시 전체가 상가. 반대.
 */
export function computeAcqDerivedAreas(
  asset: MixedUseAssetInput,
  transferDerived: MixedUseDerivedAreas,
): MixedUseDerivedAreas {
  if (!asset.partialUsageChange) return transferDerived;

  const { direction, acqResidentialArea, acqCommercialArea } = asset.partialUsageChange;
  const transferTotal = asset.residentialFloorArea + asset.nonResidentialFloorArea;

  const acqRes = direction === "house_to_commercial"
    ? (acqResidentialArea ?? transferTotal)
    : (acqResidentialArea ?? 0);
  const acqComm = direction === "house_to_commercial"
    ? (acqCommercialArea ?? 0)
    : (acqCommercialArea ?? transferTotal);

  const acqTotalFloor = acqRes + acqComm;
  if (acqTotalFloor <= 0) {
    return {
      residentialRatio: 0,
      residentialLandArea: 0,
      commercialLandArea: round2(asset.totalLandArea),
      residentialFootprintArea: 0,
    };
  }
  const acqResRatio = acqRes / acqTotalFloor;
  const acqResLand = round2(asset.totalLandArea * acqResRatio);
  return {
    residentialRatio: acqResRatio,
    residentialLandArea: acqResLand,
    // 잔액 흡수 정본 — round2(T − x)는 T가 2자리 초과일 때 ±0.01㎡ 어긋난다
    // (예: T=1.005, x=0.08 → 현행 0.93 / 정본 0.92). feedback_area_apportion_residual_absorption
    commercialLandArea: residualArea(asset.totalLandArea, acqResLand),
    residentialFootprintArea: round2(asset.buildingFootprintArea * acqResRatio),
  };
}

// ──────────────────────────────────────────────────────────────
// 2. 양도가액 안분 (STEP 2)
//    주택부분 기준시가 = 개별주택공시가격 (토지+건물 일괄)
//    상가부분 기준시가 = (공시지가 × 상가부수토지 면적) + 상가건물 기준시가
// ──────────────────────────────────────────────────────────────

export function apportionTransferPrice(
  totalTransferPrice: number,
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
): MixedUseApportionment {
  const housingStdPrice = asset.transferStandardPrice.housingPrice;
  // 상가부수토지 기준시가 = 공시지가/㎡ × 상가부수토지 면적 — 원 단위 정수 보장
  const commercialLandPrice = multiplyByArea(asset.transferStandardPrice.landPricePerSqm, derived.commercialLandArea);
  const commercialStdPrice =
    commercialLandPrice + asset.transferStandardPrice.commercialBuildingPrice;

  const totalStd = housingStdPrice + commercialStdPrice;
  if (totalStd <= 0) {
    return {
      housingStandardPrice: 0,
      commercialStandardPrice: 0,
      housingRatio: 0,
      housingTransferPrice: 0,
      commercialTransferPrice: totalTransferPrice,
    };
  }

  const housingRatio = housingStdPrice / totalStd;
  const housingTransferPrice = Math.floor(totalTransferPrice * housingRatio);
  const commercialTransferPrice = totalTransferPrice - housingTransferPrice;

  return {
    housingStandardPrice: housingStdPrice,
    commercialStandardPrice: commercialStdPrice,
    housingRatio,
    housingTransferPrice,
    commercialTransferPrice,
    /**
     * §89①3호 고가주택 분모 — **물건 전체 주택분**(영 §156①·②). 지분 양도 전용이고,
     * 미지정(단독 소유)이면 `housingTransferPrice`가 그대로 분모가 된다.
     * 안분 비율은 위와 **같은 `housingRatio`** 를 쓴다 — 다른 비율을 쓰면 두 값이 어긋난다.
     */
    ...(asset.totalPropertyTransferPrice !== undefined
      ? {
          wholeHousingTransferPrice: Math.floor(
            asset.totalPropertyTransferPrice * housingRatio,
          ),
        }
      : {}),
  };
}

/**
 * 취득 실거래가 안분 (법 §100² — 매매 실가 모드 전용, R1).
 *
 * `apportionTransferPrice`(양도가액·양도시 기준시가)의 **취득시 미러** — 총 취득 실거래가를
 * 취득시 기준시가 비율로 주택분/상가분에 안분. 법 §100²("취득 또는 양도 당시의 기준시가 등을
 * 고려하여 안분")에 직접 근거. 오케스트레이터에서 useActualAcquisition=true일 때 1회 호출.
 *
 * ⚠️ 취득시 상가부수토지 면적은 `acqDerived.commercialLandArea`. house_to_commercial 등
 *    용도변경 조합은 실가 모드 미지원(엔진 throw)이라 여기 도달하지 않음.
 *
 * @param acqStdOverride 취득시 기준시가 축 **직접 주입** — §164⑦ 미공시(PHD) 전용(2026-08-13 F18).
 *   PHD 모드에서는 `acquisitionStandardPrice.housingPrice`가 **구조적으로 부재**하다(UI가 그 칸을
 *   숨기고, 값 자체를 PHD가 3시점으로 역산한다). 그대로 두면 분자가 0 → `housingRatio` 0 →
 *   자산 단위 공통 자본적지출의 **주택분 안분분이 통째로 소멸**하고 상가분이 전액을 흡수한다.
 *   PHD가 역산한 취득시 개별주택가격(P_A_est)·4부분 취득시 기준시가를 주입해 축을 복원한다.
 *   미전달 필드는 종전 `acquisitionStandardPrice` 기반 값으로 그대로 계산한다.
 */
export function apportionAcquisitionPrice(
  totalAcqPrice: number,
  asset: MixedUseAssetInput,
  acqDerived: MixedUseDerivedAreas,
  acqStdOverride?: { housingStd?: number; commercialStd?: number },
): { housingRatio: number; housingAcqPrice: number; commercialAcqPrice: number } {
  const housingStd = acqStdOverride?.housingStd ?? (asset.acquisitionStandardPrice.housingPrice ?? 0);
  const commercialLandStd = multiplyByArea(asset.acquisitionStandardPrice.landPricePerSqm, acqDerived.commercialLandArea);
  const commercialStd =
    acqStdOverride?.commercialStd ??
    commercialLandStd + asset.acquisitionStandardPrice.commercialBuildingPrice;
  const totalStd = housingStd + commercialStd;
  // totalStd<=0은 validation(취득시 기준시가 3필드 필수)에서 선차단되어 실경로 도달 불가 — 방어적 균등 0.5.
  // (양도가액 apportionTransferPrice는 미러이나 이 극단 fallback만 0 반환으로 다름 — 도달 불가라 영향 없음.)
  const housingRatio = totalStd > 0 ? housingStd / totalStd : 0.5;
  const housingAcqPrice = Math.floor(totalAcqPrice * housingRatio);
  return {
    housingRatio,
    housingAcqPrice,
    commercialAcqPrice: totalAcqPrice - housingAcqPrice, // 잔액 흡수
  };
}

// 3. 주택부분 환산취득가액(STEP 3)은 800줄 정책에 따라 transfer-tax-mixed-use-housing-acq.ts 로 분리(2026-10-14).
//    기존 호출부의 import 경로 유지를 위해 재export 한다.
import type { HousingEstimatedAcqResult } from "./transfer-tax-mixed-use-housing-acq";
export { calcHousingEstimatedAcq, type HousingEstimatedAcqResult } from "./transfer-tax-mixed-use-housing-acq";

// STEP 4(주택부분 토지/건물 양도차익 분리)는 800줄 정책에 따라
// transfer-tax-mixed-use-housing.ts 로 분리(2026-07-28) — 상가부분과 대칭 구조.
// 재export 로 기존 호출부(transfer-tax-mixed-use.ts·fourpart·period-split·test) import 경로 유지.
export { calcHousingGainSplit, type HousingGainSplit } from "./transfer-tax-mixed-use-housing";

// STEP 5(상가부분 환산취득가액 + 양도차익 분리, STEP 7)는 800줄 정책에 따라
// transfer-tax-mixed-use-commercial.ts 로 분리(2026-07-20). 아래에서 재export 하여
// 기존 호출부(transfer-tax-mixed-use.ts 등)의 import 경로를 그대로 유지한다.
export { calcCommercialGainSplit, type CommercialGainSplit } from "./transfer-tax-mixed-use-commercial";

// 장기보유공제율(§95② 별표)은 buildHousingLthdEcho와 함께 transfer-tax-mixed-use-inheritance.ts 로
// 이관(800줄 정책). 기존 호출부(totals·period-split·test)의 import 경로 유지를 위해 재export.
export { calcLongTermRate } from "./transfer-tax-mixed-use-inheritance";

// ──────────────────────────────────────────────────────────────
// 7. 주택부수토지 배율초과 → 비사업용 이전 (STEP 6)
// ──────────────────────────────────────────────────────────────

export interface ExcessLandResult {
  multiplier: 3 | 5 | 10;
  excessArea: number;
  nonBizRatio: number;
}

export function calcExcessLandRatio(
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
  /** 양도일 — 영 §168의12 배율 경과조치(2022.1.1., 부칙 §39) 판정용. 미제공 시 현행 배율. */
  transferDate?: Date,
): ExcessLandResult {
  const zoneType = asset.zoneType ?? "residential";
  const isMetro = asset.isMetropolitanArea ?? true;
  const { multiplier: rawMultiplier } = getHousingMultiplier(zoneType, isMetro, transferDate);
  const multiplier = (rawMultiplier as 3 | 5 | 10);

  const allowedArea = derived.residentialFootprintArea * multiplier;
  const excessArea = Math.max(0, derived.residentialLandArea - allowedArea);
  const nonBizRatio =
    derived.residentialLandArea > 0 ? excessArea / derived.residentialLandArea : 0;

  return { multiplier, excessArea, nonBizRatio };
}

// ──────────────────────────────────────────────────────────────
// 8. 부분별 양도소득금액·세액 조립 헬퍼
// ──────────────────────────────────────────────────────────────

/** 주택부분 조립
 *
 * 처리 순서 (계산 경계 명문화):
 *   ① 비사업용토지 이전 — 주택 토지차익 중 배율초과 면적 비율만큼 비사업용으로 분리.
 *      비사업용토지는 1세대1주택 비과세 대상이 아니므로 12억 안분 적용 X.
 *   ② 12억 초과 비과세 안분 — 비사업용 이전 후 남은 주택부분 양도차익(토지+건물)에만 적용.
 *      §89 ① 3호 단서, 시행령 §160.
 *   ③ 장기보유특별공제 — 12억 안분 후 과세대상 양도차익에 토지/건물 별 보유연수 기반 표율 적용.
 *      이 패턴은 transfer-tax-helpers.ts:382~406 (단일주택 분리계산)과 동일.
 *   ④ 양도소득금액 = 12억 안분 양도차익 - 장기보유공제액.
 */
export function buildHousingPart(
  apportionment: MixedUseApportionment,
  housingAcqResult: HousingEstimatedAcqResult,
  gainSplit: HousingGainSplit,
  excessResult: ExcessLandResult,
  residenceYears: number,
  // §154⑧3호 표2 '대상 판정'용 통산 거주 연수 (게이트 전용). 거주분 공제율은 residenceYears(실거주) 유지.
  table2ResidenceYears: number,
  isOneHouseExempt: boolean = true,  // 미주입 시 true (기존 겸용주택 사례14 등 backward compat)
  /** §95② 미등기양도자산 장기보유특별공제 배제 (자산 전체). */
  isUnregistered = false,
  /**
   * §95② **§104⑦ 각 호(다주택 중과) 자산** 장기보유특별공제 배제 — **주택분 전용**.
   * 상가분(`buildCommercialPart`)·비사토(`buildNonBusinessPart`)에는 넘기지 않는다:
   * §104⑦의 대상이 「주택(이에 딸린 토지 포함)」이라 상가는 그 자산이 아니다.
   */
  surchargeLthdExcluded = false,
  /**
   * §155의3 상생임대주택 — 표2의 **거주 2년 요건 면제** 사실 (P5-c).
   * 판정은 하지 않고 단건과 **같은 술어**(`meetsTable2ResidenceRequirement`)에 그대로 넘긴다.
   */
  winWinRentalHouse?: TransferTaxInput["winWinRentalHouse"],
  /** L-10 — 고가 **판정** 실지거래가액(영 §154③ 본문이면 건물 전체, 영 §156②). 미주입 = 산식 분모와 같음. */
  highValueJudgmentBase?: number,
  /**
   * §155의3① 2026 개정(제36737호) — 상생임대주택 **양도기한** 판정에 필요한 양도일.
   * `meetsTable2ResidenceRequirement`에 그대로 넘긴다(단건과 같은 술어). 미주입 시 종전 동작
   * (기한 미판정 — 2026-10-01 전 양도로 본다)과 같다.
   */
  transferDate?: Date,
  /**
   * §155의3①1호 「취득한 후 체결」 날짜 하한용 취득일 — 단건과 같은 술어(`qualifiesWinWinRental`)가 읽는다.
   * 겸용주택은 건물 취득일이 주택 부분 취득일이다(`transfer-tax-mixed-use-exemption.ts`와 같은 값).
   */
  acquisitionDate?: Date,
  /** 나중에 취득한 부수토지가 보유요건 미만(`laterLandExemptExcluded`) — 토지분은 12억 비과세·안분 없이 전액 과세. */
  laterLandExemptExcluded = false,
): MixedUseHousingPart {
  // 주택분에 걸리는 §95② 배제 사유 합집합 — 아래 4개 calcLongTermRate 호출의 단일 소스.
  const housingLthdExcluded = isUnregistered || surchargeLthdExcluded;
  const housingAcq = housingAcqResult.estimatedAcq;
  /**
   * G-5: 주택(§89①3호) 축의 고가주택 기준금액 정본은 양도일 시점 함수
   * (`one-house/threshold.ts` `resolveHighValueHouseThreshold` — 6억/9억/12억)다.
   *
   * 겸용 경로만 리터럴을 남긴 이유: `calcMixedUseTransferTax`가 **2022-01-01 이전 양도를
   * 거부한다**(`transfer-tax-mixed-use.ts` `MIXED_USE_EFFECTIVE_DATE`). 12억 시행일이
   * 2021-12-08이므로 이 경로에 도달하는 양도일은 **항상 12억 시대**다 — 시점 함수로 바꿔도
   * 값이 달라지는 입력이 없다(뮤테이션 실측: 구별력 0).
   *
   * ⚠️ 그 게이트를 완화해 2022-01-01 이전 양도를 계산하게 되면 **이 상수를 시점 함수로
   *    바꿔야 한다** — 판정(`checkExemptionCore`)은 이미 시점 함수를 쓰므로, 그대로 두면
   *    「9억 초과로 판정해 놓고 12억으로 안분」이 되어 안분이 통째로 빠진다.
   */
  const HIGH_VALUE_THRESHOLD = 1_200_000_000;
  // ─── 🚨 Critical (이슈 8-A): 다주택자 1세대1주택 비과세 미적용 분기 ───
  // - isOneHouseExempt === false: 다주택자·요건 미충족 → 12억 비과세 미적용 (전액 과세)
  // - isOneHouseExempt === true (기본): 12억 이하 비과세 + 표2 거주공제 가능
  /**
   * §89①3호 고가주택 **안분 산식 분모**(영 §160①) — 공유지분 축은 「소득세법 시행령」 제156조 제1항.
   *
   * ①은 "1주택 및 이에 딸린 토지의 일부를 양도하거나 **일부가 타인 소유인 경우**"에
   * "양도하는 부분(**타인 소유부분을 포함한다**)"의 비율로 나눈 금액으로 12억을 판정하라고 한다
   * ⇒ 공유지분이어도 **물건 전체 기준**이다. §160① 괄호가 고가주택 산식에서 「주택 외의 부분은
   * 주택으로 보지 않는다」고 하므로 산식 분모는 그 전체 중 **주택분**이다.
   *
   * ⚠️ **판정** 분모는 다를 수 있다(L-10) — §156②가 「제154조제3항 **본문**에 따라 주택으로 보는
   *    부분」의 가액을 포함하라고 하므로 주택 연면적 > 주택 외 연면적이면 **건물 전체**로 판정한다
   *    (법규과-3154 — 주택분 12억 이하·전체 13.2억을 고가주택으로 봄). 호출부가 `highValueJudgmentBase`로 준다.
   *
   * 🔴 종전에는 이 분모가 `housingTransferPrice`(= **내 지분분**)뿐이라 지분 60%면 물건 전체
   *    20억까지 12억 이하로 판정돼 **전액 비과세**가 됐다(실측: 세액 153,322,963 → 17,983,739).
   *    일반 주택 경로는 `totalPropertyTransferPrice`로 이미 총 물건가를 분모로 쓰고 있었고
   *    (`transfer-tax-helpers.ts` `calcOneHouseProration`) 겸용만 빠져 있었다.
   *
   * 단독 소유면 `wholeHousingTransferPrice`가 없어 종전과 완전히 같은 값이다.
   */
  const highValueBase =
    apportionment.wholeHousingTransferPrice ?? apportionment.housingTransferPrice;
  const isExempt =
    isOneHouseExempt && (highValueJudgmentBase ?? highValueBase) <= HIGH_VALUE_THRESHOLD;

  // ── ① 비사업용토지 이전 (안분 전 양도차익에서 분리) ──
  const nonBizRatio = excessResult.nonBizRatio;
  const nonBusinessTransferredGain = Math.floor(gainSplit.landGain * nonBizRatio);
  const housingLandGainAfterNB = gainSplit.landGain - nonBusinessTransferredGain;

  // ── ② 12억 초과 비과세 안분 (비사업용 제외 주택부분 양도차익에만 적용) ──
  // §89 ① 3호 단서 — 비사업용토지는 1세대1주택 비과세 대상이 아니므로 비사업용 이전 후 잔여 양도차익에만 안분
  // 🚨 Critical: 다주택자(isOneHouseExempt === false)는 12억 안분이 아니라 전액 과세 (proratio = 1)
  let proratio: number;
  if (!isOneHouseExempt) {
    proratio = 1;  // 다주택자: 전액 과세
  } else if (isExempt) {
    proratio = 0;  // 1세대1주택자 + 12억 이하: 전액 비과세
  } else {
    // 1세대1주택자 + 12억 초과: 안분 과세. 분모는 물건 전체 주택분(지분분 아님 — 「12억 초과로 판정해
    // 놓고 지분분으로 안분」 금지). L-10: 전체로 고가 판정됐어도 주택분 ≤ 12억이면 (주택분 − 12억) ≤ 0
    // → 0(음수 양도차익은 산식상 의미가 없다 — 직접 선례 미확보, 법규과-3154 전제 「주택분 12억 이하 비과세」와 같은 결과).
    proratio =
      highValueBase > HIGH_VALUE_THRESHOLD ? (highValueBase - HIGH_VALUE_THRESHOLD) / highValueBase : 0;
  }

  // 분리취득 G-3과 같다 — 보유요건 미만인 나중 토지분은 비과세 대상이 아니므로 안분하지 않고 전액 과세하고, 12억 초과면 건물분만
  // 안분한다(분모는 그대로 주택분 전체 — `split-part-rate.anchor` A-12c). 보유 2·3년 미만이라 장특(3년)도 0이다.
  const landProratio = laterLandExemptExcluded ? 1 : proratio;
  /**
   * 고가주택(일부 비과세) + 배율 초과 — 기획재정부 재산세제과-915(2011.10.27.) 회신 방식(단일 주택 `applyHousingLandExclusions`와 **같은 함수**).
   * 기준면적 이내 토지분 = 전체 부수토지 양도차익의 12억 안분값 − 초과분 양도차익(음수면 0), 초과분은 안분 전 전액 과세(위 ①이 비사업용으로 이전).
   * 종전에는 초과분을 먼저 떼어낸 «나머지»만 다시 안분해 초과분이 이중으로 빠졌다. 12억 이하(전액 비과세)·비과세 아님(proratio 1)·나중 취득 토지(G-3)는
   * 이 산식이 닿지 않는다 — 값 불변.
   */
  const proratePart = (gain: number) => Math.floor(Math.max(gain, 0) * proratio);
  const rulingApplies =
    nonBusinessTransferredGain > 0 && isOneHouseExempt && !isExempt && !laterLandExemptExcluded;
  const proratedLandGain = rulingApplies
    ? highValueExcessLandTaxableGain({ landGain: gainSplit.landGain, excessGain: nonBusinessTransferredGain, prorate: proratePart })
    : Math.floor(Math.max(housingLandGainAfterNB, 0) * landProratio);
  const proratedBuildingGain = Math.floor(Math.max(gainSplit.buildingGain, 0) * proratio);
  const proratedTaxableGain = proratedLandGain + proratedBuildingGain;

  // ── ③ 장기보유특별공제 (안분 후 과세대상 양도차익에 표율 적용) ──
  // 🚨 Critical: 다주택자는 거주 2년+ 이어도 표1 적용 (1세대1주택 거주공제 미적용)
  // 표2 게이트는 통산(table2ResidenceYears), 거주분 공제율은 실거주(residenceYears) — §154⑧3호 / 2021-202.
  /**
   * ✅ **§155의3(상생임대) 거주요건 면제 — P5-c에서 닫았다.**
   *
   * 종전에는 `table2ResidenceYears >= 2`를 **손으로** 비교해, 상생임대주택인데도 거주 2년이
   * 안 되면 표1로 떨어뜨렸다(과다과세). P3가 이 줄을 미룬 이유는 「§155의3의 **입력 경로 자체가
   * 없어** 필드만 늘리면 도달하지 않는 배선이 생긴다」였는데, P5-a(판정 메뉴 → 계산기 전달)와
   * P5-b-2(판정 불러오기)가 그 경로를 만들어 **전제가 뒤집혔다**.
   *
   * 🔑 술어는 단건과 **같은 것 하나**다. 여기서 `qualifiesWinWinRental`을 다시 쓰면 요건 5개가
   *    두 벌이 되어 한쪽만 개정 반영되는 상태가 생긴다.
   * 🔑 **표시 문구도 같은 술어를 쓴다**(`transfer-tax-mixed-use-steps.ts`) — 게이트만 고치면
   *    「공제율은 표2인데 문구는 표1」 드리프트가 난다
   *    (`feedback_enumerate_all_write_sites_before_fixing`).
   */
  const useTable2 =
    isOneHouseExempt &&
    meetsTable2ResidenceRequirement({ winWinRentalHouse, transferDate, acquisitionDate }, table2ResidenceYears);
  const longTermDeductionTable: 1 | 2 = useTable2 ? 2 : 1;

  const landDedRate = calcLongTermRate(
    gainSplit.landHoldingYears,
    residenceYears,
    useTable2,
    housingLthdExcluded,
  );
  const buildingDedRate = calcLongTermRate(
    gainSplit.buildingHoldingYears,
    residenceYears,
    useTable2,
    housingLthdExcluded,
  );

  const landDeductionAmount = applyFairMarketRatio(Math.max(proratedLandGain, 0), landDedRate);
  const buildingDeductionAmount = applyFairMarketRatio(Math.max(proratedBuildingGain, 0), buildingDedRate);
  const longTermDeductionAmount = landDeductionAmount + buildingDeductionAmount;

  // 단일 공제율은 "혼합" — 대표값을 건물 기준으로 표시 (UI용)
  const longTermDeductionRate = buildingDedRate;

  // echo — 보유/거주 기간분 분리(표시 전용·세액 불변). 계산은 inheritance leaf에 위임(800줄 정책).
  const lthdEcho = buildHousingLthdEcho({
    proratedLandGain,
    proratedBuildingGain,
    landDedRate,
    buildingDedRate,
    landHoldingRate: calcLongTermRate(gainSplit.landHoldingYears, 0, useTable2, housingLthdExcluded),
    buildingHoldingRate: calcLongTermRate(gainSplit.buildingHoldingYears, 0, useTable2, housingLthdExcluded),
    longTermDeductionAmount,
    buildingHoldingYears: gainSplit.buildingHoldingYears,
    residenceYears,
  });

  // ── ④ 양도소득금액 ──
  const incomeAmount = Math.max(0, proratedTaxableGain - longTermDeductionAmount);

  return {
    estimatedAcquisitionPrice: housingAcq,
    acqHousingStandardPrice: housingAcqResult.acqHousingStandardPrice,
    phdEstimatedAcqHousingPrice: housingAcqResult.phdAcqHousingPrice,
    phdResult: housingAcqResult.phdResult,
    inheritedAcquisitionDetail: housingAcqResult.inheritedAcquisitionDetail,
    transferGain: gainSplit.totalGain,
    landTransferGain: gainSplit.landGain,
    buildingTransferGain: gainSplit.buildingGain,
    landTransferPrice: gainSplit.landTransferPrice,
    landAcqPrice: gainSplit.landAcqPrice,
    landAppraisalDed: gainSplit.landAppraisalDed,
    landStdPriceAtAcq: gainSplit.landStdPriceAtAcq,
    buildingTransferPrice: gainSplit.buildingTransferPrice,
    buildingAcqPrice: gainSplit.buildingAcqPrice,
    buildingAppraisalDed: gainSplit.buildingAppraisalDed,
    buildingStdPriceAtAcq: gainSplit.buildingStdPriceAtAcq,
    ...(gainSplit.housingStdSplit ? { housingStdSplit: gainSplit.housingStdSplit } : {}),
    isExempt,
    ...(laterLandExemptExcluded ? { laterLandExemptExcluded: true as const } : {}),
    // 재산세제과-915 회신 방식 echo — 결과 화면·신고서가 산식을 다시 만들지 않고 이 값을 읽는다(세액 불변).
    ...(rulingApplies
      ? {
          highValueExcessRuling: {
            wholeLandGain: Math.max(gainSplit.landGain, 0),
            wholeLandProrated: proratePart(gainSplit.landGain),
            landTaxableGain: proratedLandGain,
            buildingTaxableGain: proratedBuildingGain,
            landLongTermDeduction: landDeductionAmount,
            buildingLongTermDeduction: buildingDeductionAmount,
          },
        }
      : {}),
    proratedTaxableGain,
    highValueBase,
    ...(highValueJudgmentBase !== undefined ? { highValueJudgmentBase } : {}),
    longTermDeductionTable,
    longTermDeductionRate,
    longTermDeductionAmount,
    ...lthdEcho,
    incomeAmount,
    nonBusinessTransferRatio: nonBizRatio,
    nonBusinessTransferredGain,
  };
}

/** 상가부분 조립 */
export function buildCommercialPart(
  gainSplit: CommercialGainSplit,
  /** §95② 미등기양도자산 장기보유특별공제 배제. */
  isUnregistered = false,
): MixedUseCommercialPart {
  const holdingYears = Math.max(gainSplit.landHoldingYears, gainSplit.buildingHoldingYears);
  const landDedRate = calcLongTermRate(gainSplit.landHoldingYears, 0, false, isUnregistered);
  const buildingDedRate = calcLongTermRate(gainSplit.buildingHoldingYears, 0, false, isUnregistered);

  const longTermDeductionAmount =
    applyFairMarketRatio(Math.max(gainSplit.landGain, 0), landDedRate) +
    applyFairMarketRatio(Math.max(gainSplit.buildingGain, 0), buildingDedRate);

  const longTermDeductionRate = calcLongTermRate(holdingYears, 0, false, isUnregistered);

  return {
    estimatedAcquisitionPrice: gainSplit.estimatedAcqPrice,
    inheritedAcquisitionDetail: gainSplit.inheritedAcquisitionDetail,
    transferGain: gainSplit.totalGain,
    // 파트별 양도소득금액 — §104①2·3호 단기세율은 토지·건물 각각의 보유기간으로 갈린다.
    // 장특이 이미 파트별(landDedRate·buildingDedRate)이므로 같은 축으로 노출한다(재도출 금지).
    landIncomeAmount: Math.max(0, gainSplit.landGain - applyFairMarketRatio(Math.max(gainSplit.landGain, 0), landDedRate)),
    buildingIncomeAmount: Math.max(
      0,
      gainSplit.buildingGain - applyFairMarketRatio(Math.max(gainSplit.buildingGain, 0), buildingDedRate),
    ),
    landTransferGain: gainSplit.landGain,
    buildingTransferGain: gainSplit.buildingGain,
    landTransferPrice: gainSplit.landTransferPrice,
    landAcqPrice: gainSplit.landAcqPrice,
    landAppraisalDed: gainSplit.landAppraisalDed,
    landStdPriceAtAcq: gainSplit.landStdPriceAtAcq,
    buildingTransferPrice: gainSplit.buildingTransferPrice,
    buildingAcqPrice: gainSplit.buildingAcqPrice,
    buildingAppraisalDed: gainSplit.buildingAppraisalDed,
    buildingStdPriceAtAcq: gainSplit.buildingStdPriceAtAcq,
    longTermDeductionRate,
    longTermDeductionAmount,
    holdingYears,
    incomeAmount: Math.max(0, gainSplit.totalGain - longTermDeductionAmount),
    acqStandardSource: gainSplit.acqStandardSource,
    acqStandardTotal: gainSplit.acqStandardLand + gainSplit.acqStandardBuilding,
    acqStandardLand: gainSplit.acqStandardLand,
    acqStandardBuilding: gainSplit.acqStandardBuilding,
  };
}

/**
 * OH-17 — 「소득세법 시행령」 §154③ **본문**: 주택 연면적이 주택 외 연면적보다 크면 건물 전부를 주택으로
 * 본다. 부수토지 면적 비례 안분(§154④)은 **단서** 전용이므로 본문이면 토지 전부가 주택 부수토지이고,
 * 배율 한도(§154⑦)는 **건물 전체 정착면적** × 배율이다. 배율은 단서 경로와 같은 값을 받는다.
 */
export function calcWholeBuildingExcessLand(
  asset: MixedUseAssetInput,
  multiplier: ExcessLandResult["multiplier"],
): ExcessLandResult {
  const allowedArea = asset.buildingFootprintArea * multiplier;
  const excessArea = Math.max(0, asset.totalLandArea - allowedArea);
  const nonBizRatio = asset.totalLandArea > 0 ? excessArea / asset.totalLandArea : 0;
  return { multiplier, excessArea, nonBizRatio };
}

/**
 * OH-17 — §154③ 본문으로 주택이 된 「상가」 부분: 1세대1주택 비과세(전체 12억 이하)가 미치므로
 * 양도소득금액은 0이다. 토지분 중 배율 초과 비율만큼은 비과세 대상이 아니라 비사업용 토지로 옮긴다
 * (`nonBusinessTransferredGain` — 주택 부분 ①과 같은 절사 규약). 양도차익·가액 echo는 그대로 둔다(산식 표시).
 */
export function exemptCommercialPartAsHouse(
  part: MixedUseCommercialPart,
  nonBizRatio: number,
  /**
   * 나중에 취득한 부수토지가 보유요건 미만(`laterLandExemptExcluded`) — 주택으로 본 상가 부분의 **토지분**도 비과세 대상이 아니다.
   * 배율 초과 몫을 뺀 토지 양도차익을 그대로 과세한다(보유 2·3년 미만이라 장특 0). 세율은 상가 토지 파트 그대로다 —
   * §154③은 「법 제89조제1항제3호를 적용할 때」 주택으로 보는 규정이다.
   */
  laterLandExemptExcluded = false,
): { part: MixedUseCommercialPart; nonBusinessTransferredGain: number } {
  const nonBusinessTransferredGain = Math.floor(Math.max(part.landTransferGain, 0) * nonBizRatio);
  const landIncomeAmount = laterLandExemptExcluded
    ? Math.max(0, part.landTransferGain - nonBusinessTransferredGain)
    : 0;
  return {
    part: {
      ...part,
      landIncomeAmount,
      buildingIncomeAmount: 0,
      longTermDeductionRate: 0,
      longTermDeductionAmount: 0,
      incomeAmount: landIncomeAmount,
      deemedHouseBy154_3Main: true,
    },
    nonBusinessTransferredGain,
  };
}

// buildNonBusinessPart / buildTotalTax 는 transfer-tax-mixed-use-totals.ts 로 분리.
export { buildNonBusinessPart, buildTotalTax } from "./transfer-tax-mixed-use-totals";
