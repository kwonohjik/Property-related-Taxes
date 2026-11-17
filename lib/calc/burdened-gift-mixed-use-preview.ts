/**
 * 겸용주택 × 부담부증여 — **엔진 판정·준비 leaf를 폼으로 부르는 어댑터** (⑤ 미리보기 · ⑧ validate 공용).
 *
 * 규칙은 엔진 `mixed-use-burdened-gift-prepare.ts`(MB-1~MB-18 · 귀속 안분 `B_h'`/`B_c'` · C · C_h)에만 있다 — 여기서 다시 쓰지 않는다.
 * 이 파일이 하는 일은 «폼 → 엔진 입력»이고, 입력은 **④가 실제로 보내는 값과 같은 함수**(`buildMixedUsePayload` · `buildBurdenedGiftInfo`)로 만든다
 * (표시 = 전송 = 요구, 3중 패턴). 순수 함수다(DB·throw 없음).
 *
 * 순환 방지: `burdened-gift-mixed-use-scope.ts`는 `transfer-tax-api-burdened-gift.ts`가 import하는 쪽이라 이 파일(둘 다 import)을 따로 둔다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  analyzeMixedBurdenedGift,
  type MixedBgAnalysis,
  type MixedBgIssue,
  type MixedBgSource,
} from "@/lib/tax-engine/mixed-use-burdened-gift-prepare";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { apportionCompanionBurdenedGiftDebt, buildBurdenedGiftInfo } from "./transfer-tax-api-burdened-gift";
import { buildMixedUsePayload } from "./transfer-tax-api-mixed-use";
import { getOwnershipRatio, isFullFractionalBundle } from "./transfer-tax-api-helpers";
import { isMixedBurdenedGift, mixedBgBundleAttrFixField, mixedBgBundleWinnerField } from "./burdened-gift-mixed-use-scope";
import { parseAmount } from "./number-parse";

/** 폼-전역 값이 없는(단위 테스트·부분 입력) 호출을 위한 최소 폼 — `buildMixedUsePayload`가 읽는 필드만 안전한 기본값으로 둔다. */
function minimalForm(transferDate: string): TransferFormData {
  return {
    transferDate,
    residencePeriodMonths: "",
    contractTotalPrice: "",
    isOneHousehold: false,
    householdHousingCount: "",
    houses: [],
  } as unknown as TransferFormData;
}

/**
 * 함께 양도 묶음의 자산별 재배분 채무 B_i — ④ `companionBgDebtOverrides`와 **같은 함수·같은 입력**이다(표시 = 전송 = 요구).
 * 자산가액(증여가액) 합이 0이라 배분 근거가 없으면 undefined.
 */
export function companionBgDebtSharesOfAssets(assets: readonly AssetForm[]): number[] | undefined {
  return apportionCompanionBurdenedGiftDebt(assets.map((a) => buildBurdenedGiftInfo(a)), assets.map((a) => getOwnershipRatio(a)));
}

/**
 * 이 겸용 부담부증여 자산이 **함께 양도(여러 물건) 묶음** 안에 있는가, 있으면 재배분 채무(`debt`)를 돌려준다. 묶음 밖이면 undefined.
 * 묶음 판정은 ⑧(`contractAssumedDebtTotal`)·④와 같다 — 카드 2장 이상 · 지분 분할 취득(축 B) 아님. `declaredMode`는 폼 `assetSplitMode`(화면은 `splitMode`).
 * 표시(`BurdenedGiftDebtAttributionCard`)·⑧ 안내가 같은 값을 읽는다.
 */
export function mixedBgBundleMember(
  assets: readonly AssetForm[],
  declaredMode: "companion" | "fractional" | undefined,
  assetId: string | undefined,
): { debt: number | undefined } | undefined {
  const idx = assets.findIndex((a) => a.assetId === assetId);
  if (idx < 0 || assets.length < 2 || !isMixedBurdenedGift(assets[idx])) return undefined;
  if (isFullFractionalBundle(assets as AssetForm[], declaredMode)) return undefined;
  return { debt: companionBgDebtSharesOfAssets(assets)?.[idx] };
}

/** 엔진 판정 입력 `MixedBgSource` — ④와 같은 payload에서 만든다. 겸용 BG가 아니면 undefined. */
export function mixedBgSourceOfForm(
  asset: AssetForm,
  form: TransferFormData | undefined,
  transferDate: string,
  /** `isCompanion` = 묶음(함께 양도·축 B) 안의 겸용 · `isAxisB` = 그중 지분 분할 취득. 함께 양도면 ④와 같은 재배분 채무(`assumedDebtOverride`)를, 축 B면 ④와 같은 ×r 채무를 쓴다. */
  opts?: { isCompanion?: boolean; isAxisB?: boolean },
): MixedBgSource | undefined {
  if (!isMixedBurdenedGift(asset)) return undefined;
  const f = form ?? minimalForm(transferDate);
  const mu = buildMixedUsePayload(asset, f);
  if (!mu) return undefined;
  // 축 B(지분 분할 취득) — ④(`transfer-tax-api-primary-context.ts` `bgInfoBase`)와 같은 r로 채무·귀속을 ×r한다(3중 패턴 · 계획서 §3.3.3 8).
  //   원값으로 넘기면 엔진 leaf가 ×r된 증여가액과 원 채무를 비교해 MB-10 「인수 채무가 증여가액을 초과」를 오탐한다(S12 — route는 200).
  let info = buildBurdenedGiftInfo(asset, opts?.isAxisB === true ? getOwnershipRatio(asset) : undefined, transferDate) as unknown as BurdenedGiftInfo;
  const inBundle = opts?.isCompanion === true && opts.isAxisB !== true;
  if (inBundle && form) {
    // ④ `companionBgDebtOverrides`와 같은 함수·같은 입력 — 신고 단위 채무를 자산가액 비율로 재배분한 이 자산의 몫(Q-3 ①).
    const idx = form.assets.findIndex((a) => a.assetId === asset.assetId);
    const overrides = idx >= 0 ? companionBgDebtSharesOfAssets(form.assets) : undefined;
    if (overrides) info = { ...info, assumedDebtOverride: overrides[idx] };
  }
  return {
    ...(mu as unknown as MixedBgSource),
    ownershipRatio: getOwnershipRatio(asset),
    acquisitionCause: asset.acquisitionCause,
    burdenedGift: info,
    transferDate,
    isCompanion: opts?.isCompanion === true,
    isAxisB: opts?.isAxisB === true,
  };
}

/** 이슈 + 준비 값을 한 번에. 겸용 BG가 아니면 undefined. */
export function analyzeMixedBgOfForm(
  asset: AssetForm,
  form: TransferFormData | undefined,
  transferDate: string,
  opts?: { isCompanion?: boolean; isAxisB?: boolean },
): MixedBgAnalysis | undefined {
  const src = mixedBgSourceOfForm(asset, form, transferDate, opts);
  return src ? analyzeMixedBurdenedGift(src) : undefined;
}

/**
 * 엔진 이슈의 `path` → 화면 입력칸(`data-field`). ⑧ 점프 앵커.
 * 엔진 경로는 «API 본문 기준»이라 폼 필드 이름과 다르다 — 여기서 한 번만 옮긴다.
 */
export function mixedBgIssueField(issue: MixedBgIssue, asset?: AssetForm): string {
  // 함께 양도 묶음 전용 이슈(MB-19~21) — 경로가 `burdenedGiftInfo.*`로 비슷해 코드로 먼저 가른다.
  if (issue.code === "MB-19") return (asset && mixedBgBundleAttrFixField(asset)) ?? "bgMortgageAttribution"; // 남아 있는 주택·상가 귀속 선언
  if (issue.code === "MB-20") return asset ? mixedBgBundleWinnerField(asset) : "bgMortgageDebtAmount"; // 담보·임대 평가를 만든 채무 칸
  const p = issue.path.join(".");
  switch (p) {
    case "transferDate": return "transferDate";
    case "mixedUse.usePreHousingDisclosure": return "usePreHousingDisclosure";
    case "mixedUse.separateAcquisition": return "mixedAcqPerPartMode";
    case "mixedUse.partialUsageChange": return "hasPartialUsageChange";
    case "transferCause": return "transferType";
    case "ownershipRatio": return "ownershipNumerator";
    case "acquisitionCause": return "acquisitionCause";
    case "mixedUse.landAcquisitionDate": return "acquisitionDate";
    case "mixedUse.housingInheritedValue": return "mixedHousingInheritedValueOverride";
    case "mixedUse.transferStandardPrice.housingPrice": return "mixedTransferHousingPrice";
    case "mixedUse.transferStandardPrice.landPricePerSqm": return "mixedTransferLandPricePerSqm";
    case "mixedUse.transferStandardPrice.commercialBuildingPrice": return "mixedTransferCommercialBuildingPrice";
    case "mixedUse.transferStandardPrice.housingBuildingPrice": return "mixedTransferHousingBuildingStdPrice";
    case "mixedUse.acquisitionStandardPrice.housingPrice": return "mixedAcqHousingPrice";
    case "mixedUse.acquisitionStandardPrice.landPricePerSqm": return "mixedAcqLandPricePerSqm";
    case "mixedUse.acquisitionStandardPrice.commercialBuildingPrice": return "mixedAcqCommercialBuildingPrice";
    case "mixedUse.acquisitionStandardPrice.housingBuildingPrice": return "mixedAcqHousingBuildingStdPrice";
    case "mixedUse.acquisitionStandardPrice.landPricePerSqmAtBuildingAcq": return "mixedAcqLandPricePerSqmAtBuildingAcq";
    case "burdenedGiftInfo.marketValueAtTransfer": return "bgMarketValueAtTransfer";
    case "burdenedGiftInfo.acquisitionMethod": return "bgAcquisitionMethod";
    case "burdenedGiftInfo.actualAcquisitionTotal": return "bgActualAcquisitionTotal";
    case "burdenedGiftInfo.presumedAcquisitionTotal": return "bgPresumedAcquisitionTotal";
    case "burdenedGiftInfo.mortgageDebtAmount": return "bgMortgageDebtAmount";
    case "burdenedGiftInfo.housingAppraisal": return "bgHousingAppraisalDeclared";
    case "burdenedGiftInfo.housingAppraisal.housingValue": return "bgHousingAppraisalValue";
    case "burdenedGiftInfo.buildingStdPriceAtTransfer": return "mixedTransferHousingPrice";
    case "burdenedGiftInfo.debtAttribution": return "bgDepositAttribution";
    default: return "transferType";
  }
}

/**
 * 증여자 상속·증여 취득의 ① 평가액 누락(엔진 MB-11 `mixedUse.housingInheritedValue`) → 비어 있는 칸. 엔진 경로는 두 칸을 한 경로로 알리고
 * 폼 칸은 취득원인(상속/증여)마다 다르다 — 주택분이 차 있으면 상가분 칸으로 보낸다(PR-7b-7a).
 */
export function mixedBgReportedField(asset: AssetForm): string {
  const gift = asset.acquisitionCause === "gift";
  const housing = parseAmount(gift ? asset.mixedHousingGiftValueOverride : asset.mixedHousingInheritedValueOverride);
  if (!(housing > 0)) return gift ? "mixedHousingGiftValueOverride" : "mixedHousingInheritedValueOverride";
  return gift ? "mixedCommercialGiftValueOverride" : "mixedCommercialInheritedValueOverride";
}
