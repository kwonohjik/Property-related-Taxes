/**
 * ④⑤⑧ — 같은 날 취득 주택의 **배율 초과 부수토지 분리** 경로를 타는 자산인가 (#17 · S08-1).
 *
 * 판정 규칙은 엔진 leaf(`lib/tax-engine/housing-excess-split.ts`) 하나다 — 여기는 `AssetForm` → 사실 변환뿐이다.
 * ⑤ 입력 카드 노출 · ④ 전송 게이트 · ⑧ 필수 · 엔진 게이트가 **같은 술어**를 읽으므로 «칸이 없는 요구»(막다른 길)도,
 * «칸은 있는데 전송 안 함»(침묵 no-op)도 없다.
 *
 * 면적은 ④가 엔진 `acquisitionArea`로 싣는 식(`resolveAcqAreaForStdPrice`)과 같고, 정착면적·소재지 구분도 ④가 싣는 값 그대로다.
 * 주 자산(primary)만 대상이다 — 함께 양도 주택 카드는 ④가 소재지·정착면적을 싣지 않아(신축 취득 제외) 분리 입력 경로가 없다.
 * 대신 ④가 `companionHousingLand`로 면적 사실만 실어 엔진 고지(`housingExcessUnseparatedNotice`)를 발화시킨다(분리·세액 불변).
 * 취득일이 개별주택가격 최초 공시일(2005-04-30) 전이면 «취득 당시 개별주택가격»이 없어 이 경로를 타지 않는다(막지 않고 고지).
 *
 * 취득가액 산정 방식은 자산 단위 방식(`deriveLegacyPartAcqMode`)만 본다(#17-4) — 이 경로는 토지 취득일을 따로 받지 않아 파트별 방식 라디오가
 * 화면에 없다. 저장된 파트 방식(`landAcqMode`·`buildingAcqMode`)은 별개취득을 켰다 끈 잔재일 수 있어 읽지 않고, ④도 자산 단위 방식을 싣는다.
 */
import { housingExcessAreaM2, housingExcessSplitApplies, isBeforeHousePriceFirstDisclosure } from "@/lib/tax-engine/housing-excess-split";
import { resolveAcqAreaForStdPrice } from "./transfer-tax-api-helpers";
import { deriveLegacyPartAcqMode, isSeparateAcquisition } from "./transfer-tax-split-acq-mode";
import { effectiveSelfOwns } from "./self-owns-scope";
import { phdFlagEffective } from "./phd-toggle-scope";
import { hasPre1990LandEstimation } from "./transfer-pre1990-land-gate";
import { getOwnershipRatio } from "./transfer-tax-api-helpers";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

function parseFormDate(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** 배율 초과 면적(㎡) — 분리 경로 대상 여부와 무관한 순수 면적 판정(화면 안내용). 입력이 모자라면 0. */
export function housingExcessAreaOfAsset(asset: AssetForm, transferDate: string | undefined): number {
  if (asset.assetKind !== "housing") return 0;
  return housingExcessAreaM2({
    zone: asset.appurtenantLandZone,
    footprintM2: parseFloat(asset.buildingFootprintArea) || 0,
    landAreaM2: resolveAcqAreaForStdPrice(asset) ?? 0,
    transferDate: parseFormDate(transferDate),
  });
}

function factsOf(asset: AssetForm, excessAreaM2: number) {
  return {
    isPlainHousing:
      asset.assetKind === "housing" &&
      !asset.isMixedUseHouse &&
      !phdFlagEffective(asset) &&
      !hasPre1990LandEstimation(asset),
    isPurchase: asset.acquisitionCause === "purchase",
    // 환산 + 공익수용만 범위 밖(§164⑨1호 주택 총액 특례가 분리 경로에 닿지 않는다) — 엔진 어댑터는 ④가 싣는 `useEstimatedAcquisition`·`transferCause`로 같은 판정.
    isExpropriationConversion:
      deriveLegacyPartAcqMode(asset) === "estimated" && asset.transferCause === "public_expropriation",
    ownsBoth: (effectiveSelfOwns(asset) ?? "both") === "both",
    isSeparateAcquisition: isSeparateAcquisition(asset),
    isBurdenedGift: asset.transferType === "burdened_gift" || asset.acquisitionCause === "burdened_gift",
    isFractional: getOwnershipRatio(asset) < 1,
    acquiredBeforeFirstDisclosure: isBeforeHousePriceFirstDisclosure(asset.acquisitionDate),
    excessAreaM2,
  };
}

/**
 * 같은 날 취득 주택의 초과분 분리 입력(취득시 3칸 + 양도시 2칸)이 필요한가.
 *
 * @param isPrimary 주 자산(첫 자산)인가 — 컴패니언 주택은 분리 입력 경로가 없어 false로 둔다.
 */
export function housingExcessNeedsLandSplit(
  asset: AssetForm,
  transferDate: string | undefined,
  isPrimary: boolean,
): boolean {
  if (!isPrimary) return false;
  return housingExcessSplitApplies(factsOf(asset, housingExcessAreaOfAsset(asset, transferDate)));
}

/**
 * 소재지 구분이 비어 배율을 정하지 못하는데, 가장 작은 배율(3배)로도 한도를 넘을 수 있는가 — 같은 경로의 대상이면 ⑧이 소재지 구분을 요구한다.
 * (미입력 fallback으로 3배를 쓰면 초과면적을 과다 산출해 납세자에게 불리하고, 아무것도 하지 않으면 초과분이 조용히 비과세된다 — 둘 다 금지.)
 */
export function housingExcessZonePending(asset: AssetForm, isPrimary: boolean): boolean {
  if (!isPrimary || asset.appurtenantLandZone !== undefined) return false;
  const footprint = parseFloat(asset.buildingFootprintArea) || 0;
  const landArea = resolveAcqAreaForStdPrice(asset) ?? 0;
  if (!(footprint > 0) || !(landArea > footprint * 3)) return false;
  return housingExcessSplitApplies(factsOf(asset, 1));
}
