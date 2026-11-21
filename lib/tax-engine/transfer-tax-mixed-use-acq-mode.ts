/**
 * 겸용주택 STEP 7.5 — 취득 경로별(부담부증여 · 파트 모델 · 표준) 양도차익 확정 분기.
 *
 * `transfer-tax-mixed-use.ts` 800줄 정책 분리(776줄) — 로직·주석은 오케스트레이터에서 **그대로** 옮겼다(동작 불변).
 * 표준 경로의 §97②2호 단서 계산은 `transfer-tax-mixed-use-proviso.ts`가 맡는다.
 */
import { applyMixedBurdenedGift } from "./mixed-use-burdened-gift";
import type { MixedBgPrepared } from "./mixed-use-burdened-gift-prepare";
import { applyMixedPartAcq } from "./mixed-use-part-acq";
import { buildingDirectShare, type MixedSalePart } from "./mixed-use-sale-split";
import { applyStandardProviso } from "./transfer-tax-mixed-use-proviso";
import {
  calcHousingGainSplit,
  calcCommercialGainSplit,
  type HousingEstimatedAcqResult,
  type HousingGainSplit,
  type CommercialGainSplit,
  type computeDerivedAreas,
  type computeAcqDerivedAreas,
} from "./transfer-tax-mixed-use-helpers";
import type { MixedUseApportionment, MixedUseAssetInput, MixedUseGainBreakdown } from "./types/transfer-mixed-use.types";

export function applyMixedAcqModeGainSplits(args: {
  asset: MixedUseAssetInput;
  bg: MixedBgPrepared | undefined;
  isPartAcqModel: boolean;
  apportionment: MixedUseApportionment;
  derived: ReturnType<typeof computeDerivedAreas>;
  transferDate: Date;
  acqDerived: ReturnType<typeof computeAcqDerivedAreas>;
  acqApportionment: { housingAcqPrice: number; commercialAcqPrice: number } | undefined;
  housingAcqResult: HousingEstimatedAcqResult;
  housingGainSplit: HousingGainSplit;
  commercialGainSplit: CommercialGainSplit;
  housingSalePart?: MixedSalePart;
  commercialSalePart?: MixedSalePart;
}): {
  housingGainSplit: HousingGainSplit;
  commercialGainSplit: CommercialGainSplit;
  housingAcqResult: HousingEstimatedAcqResult;
  necessaryExpenseProviso: MixedUseGainBreakdown["necessaryExpenseProviso"];
  separateAcquisitionEcho: MixedUseGainBreakdown["separateAcquisition"];
  bgApplied: ReturnType<typeof applyMixedBurdenedGift> | undefined;
} {
  const { asset, bg, isPartAcqModel, apportionment, derived, transferDate, acqDerived, acqApportionment, housingSalePart, commercialSalePart } = args;
  let { housingAcqResult, housingGainSplit, commercialGainSplit } = args;

  /**
   * 🔴 **STEP 7.5 — §97②2호 단서**: 가목·나목 택일 (2026-08-07 W-8).
   *
   * > 「다만, 제1항제1호나목에 따라 취득가액을 **환산취득가액**으로 하는 경우로서
   * >  **가목의 금액이 나목의 금액보다 적은 경우**에는 나목의 금액을 필요경비로 할 수 있다.」
   *
   *   · **가목** = (주택분 + 상가분) 환산취득가액 + 개산공제  ← 필요경비 **전체**
   *   · **나목** = 자산 단위 자본적지출 + 양도비
   *
   * ⚠️ **비교 단위는 자산 단위**다. 근거는 `general-building-swap.ts:144-148`의 확립된 규칙
   *    — 「**파트별로 취득모드가 갈리면** 파트 단위, 아니면 자산 단위」. 겸용의 취득모드 플래그
   *    (`useActualAcquisition`·`acquisitionByInheritance` 등)는 전부 **자산 단위**라 갈리지 않는다.
   *
   * ⚠️ **환산 경로 전용**이다 — 실가·상속·증여(`usesDeemedAcq`)는 §97②**1호** 가산이거나
   *    §163⑨ 의제라 단서 대상이 아니다.
   *
   * ⚠️ **감정가액·매매사례가액(`useAppraisalSalesAcquisition`)도 단서 대상이 아니다**(2026-08-13 F19).
   *    단서는 「취득가액을 **환산취득가액**으로 하는 경우」 한정이고, 감정가액·매매사례가액
   *    (「소득세법 시행령」 §176의2②③)은 같은 호 **본문**이다. 겸용의 감정·매매사례 경로는
   *    취득가액 총액을 법 §100②로 안분해 **직접 차감**하는 경로라, 단서가 발동하면 그 안분값이
   *    통째로 0이 되어 취득가액이 소멸한다(과소과세 실측 129,309,577). 단건 엔진
   *    (`transfer-tax-helpers.ts` `isConversionMode = useEstimatedAcquisition === true`)과
   *    일반건물(`general-building-swap.ts` — appraisal·salesCase는 무동작)이 이미 같은 규칙이다.
   *
   * 🔑 **재호출은 3개면 된다** — `calcExcessLandRatio`(STEP 5·6)는 gain에 의존하지 않고
   *    `(asset, derived, transferDate)`만 받으므로 다시 돌릴 필요가 없다.
   */
  let necessaryExpenseProviso: MixedUseGainBreakdown["necessaryExpenseProviso"];
  let separateAcquisitionEcho: MixedUseGainBreakdown["separateAcquisition"];
  let bgApplied: ReturnType<typeof applyMixedBurdenedGift> | undefined;
  if (bg) {
    /**
     * 겸용 × 부담부증여 — 위 split은 «채무 귀속 양도가액(B')» 위에서 환산한 est다. 취득가액·개산공제·실비에 부분별 채무비율을
     * 곱하고 §97②2호 단서를 다시 판정한다(`applyMixedBurdenedGift` — 설계서 §3.2). 양도가액·보유기간은 est 그대로다.
     */
    bgApplied = applyMixedBurdenedGift({
      asset, bg, transferDate,
      est: { housing: housingGainSplit, commercial: commercialGainSplit },
      expThunk: () => ({
        housing: calcHousingGainSplit(apportionment.housingTransferPrice, housingAcqResult, asset, derived, transferDate, acqDerived, true),
        commercial: calcCommercialGainSplit(apportionment.commercialTransferPrice, asset, derived, transferDate, acqDerived, housingAcqResult, undefined, true),
      }),
      housingDeemedSelected: housingAcqResult.inheritedAcquisitionDetail?.selected,
    });
    housingGainSplit = bgApplied.housing;
    commercialGainSplit = bgApplied.commercial;
    housingAcqResult = { ...housingAcqResult, estimatedAcq: bgApplied.housingAcqTotal };
    necessaryExpenseProviso = bgApplied.proviso;
  } else if (isPartAcqModel) {
    /**
     * B1 파트 모델 — 위 split은 「양쪽 환산」 경로의 값(est)이다. 공통 경비 몫(exp)을 단서 호출로 한 번 더 얻어
     * 파트별 모드로 갈아끼운다(`applyMixedPartAcq`). 양도가액·보유기간·양도시 안분은 est 그대로다.
     * 단서(§97②2호)는 자산 단위 `provisoEligible`이 아니라 **환산 파트 묶음**으로 판정한다.
     */
    const exp = {
      housing: calcHousingGainSplit(
        apportionment.housingTransferPrice, housingAcqResult, asset, derived, transferDate, acqDerived, true, housingSalePart,
      ),
      commercial: calcCommercialGainSplit(
        apportionment.commercialTransferPrice, asset, derived, transferDate, acqDerived,
        housingAcqResult, undefined, true, commercialSalePart,
      ),
    };
    const applied = applyMixedPartAcq({
      asset,
      acqDerived,
      est: { housing: housingGainSplit, commercial: commercialGainSplit },
      exp,
      buildingDirect: {
        housing: buildingDirectShare(asset, derived, "housing"),
        commercial: buildingDirectShare(asset, derived, "commercial"),
      },
    });
    housingGainSplit = applied.housing;
    commercialGainSplit = applied.commercial;
    housingAcqResult = { ...housingAcqResult, estimatedAcq: applied.housingAcqTotal };
    necessaryExpenseProviso = applied.proviso;
    separateAcquisitionEcho = applied.echo;
  } else {
    const standard = applyStandardProviso({
      asset, apportionment, housingAcqResult, derived, transferDate, acqDerived,
      acqApportionment, housingGainSplit, commercialGainSplit, housingSalePart, commercialSalePart,
    });
    housingGainSplit = standard.housing;
    commercialGainSplit = standard.commercial;
    necessaryExpenseProviso = standard.proviso;
  }
  return { housingGainSplit, commercialGainSplit, housingAcqResult, necessaryExpenseProviso, separateAcquisitionEcho, bgApplied };
}
