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
  collectMixedBurdenedGiftIssues,
  type MixedBgAnalysis,
  type MixedBgIssue,
  type MixedBgSource,
} from "@/lib/tax-engine/mixed-use-burdened-gift-prepare";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { buildBurdenedGiftInfo } from "./transfer-tax-api-burdened-gift";
import { buildMixedUsePayload } from "./transfer-tax-api-mixed-use";
import { getOwnershipRatio } from "./transfer-tax-api-helpers";
import { isMixedBurdenedGift } from "./burdened-gift-mixed-use-scope";

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

/** 엔진 판정 입력 `MixedBgSource` — ④와 같은 payload에서 만든다. 겸용 BG가 아니면 undefined. */
export function mixedBgSourceOfForm(
  asset: AssetForm,
  form: TransferFormData | undefined,
  transferDate: string,
  opts?: { isCompanion?: boolean },
): MixedBgSource | undefined {
  if (!isMixedBurdenedGift(asset)) return undefined;
  const f = form ?? minimalForm(transferDate);
  const mu = buildMixedUsePayload(asset, f);
  if (!mu) return undefined;
  const info = buildBurdenedGiftInfo(asset, undefined, transferDate) as unknown as BurdenedGiftInfo;
  return {
    ...(mu as unknown as MixedBgSource),
    ownershipRatio: getOwnershipRatio(asset),
    acquisitionCause: asset.acquisitionCause,
    burdenedGift: info,
    transferDate,
    isCompanion: opts?.isCompanion === true,
  };
}

/** 이슈 + 준비 값을 한 번에. 겸용 BG가 아니면 undefined. */
export function analyzeMixedBgOfForm(
  asset: AssetForm,
  form: TransferFormData | undefined,
  transferDate: string,
  opts?: { isCompanion?: boolean },
): MixedBgAnalysis | undefined {
  const src = mixedBgSourceOfForm(asset, form, transferDate, opts);
  return src ? analyzeMixedBurdenedGift(src) : undefined;
}

/**
 * 엔진 이슈의 `path` → 화면 입력칸(`data-field`). ⑧ 점프 앵커.
 * 엔진 경로는 «API 본문 기준»이라 폼 필드 이름과 다르다 — 여기서 한 번만 옮긴다.
 */
export function mixedBgIssueField(issue: MixedBgIssue): string {
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
 * 함께 양도(컴패니언)·지분 분할(축 B) 묶음 안의 겸용 부담부증여 차단 문구 — 엔진 MB-6의 문구를 **그대로** 쓴다(복제 금지).
 * 묶음 여부는 폼-전역 사실이라 BG 공통 검증(`validateBurdenedGiftAsset`)이 먼저 알려야 한다 — 그 뒤 검증은 채울 수 없는 칸을 요구할 수 있다.
 */
export function mixedBgCompanionBlockMessage(): string {
  const issues = collectMixedBurdenedGiftIssues({
    burdenedGift: {
      valuationMode: "sangjeungbeop_standard", lendingDepositTotal: 0, mortgageDebtAmount: 0, annualRentTotal: 0,
      landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 0, landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 0,
    } as BurdenedGiftInfo,
    isCompanion: true,
    residentialFloorArea: 0, nonResidentialFloorArea: 0, buildingFootprintArea: 0, totalLandArea: 0,
  });
  return issues.find((i) => i.code === "MB-6")?.message ?? "겸용주택 부담부증여는 단독 소유 단건만 지원합니다.";
}
