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
 * 별개취득 토글을 켠 채 같은 날짜면 라디오가 화면에 있다 — 그 값이 자산 단위 방식과 다르면 ⑧이 막는다(`housingExcessPartModeMismatch` — 배율 한도 이내도).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { housingExcessAreaM2, housingExcessSplitApplies, isBeforeHousePriceFirstDisclosure } from "@/lib/tax-engine/housing-excess-split";
import { resolveAcqAreaForStdPrice } from "./transfer-tax-api-helpers";
import { deriveLegacyPartAcqMode, isSeparateAcquisition } from "./transfer-tax-split-acq-mode";
import { effectivePartAcqMode } from "./transfer-tax-split-acq-mode";
import { effectiveLandAcquisitionCause } from "./transfer-land-part-cause";
import { effectiveSelfOwns } from "./self-owns-scope";
import { phdFlagEffective } from "./phd-toggle-scope";
import { hasPre1990LandEstimation } from "./transfer-pre1990-land-gate";
import { getOwnershipRatio } from "./transfer-tax-api-helpers";
import { appurtenantCardAreaM2 } from "./transfer-tax-api-helpers";
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
    // 환산 + 공익수용·공매·경락만 범위 밖(§164⑨1호·2호 환산 분모 특례가 분리 경로에 닿지 않는다) — 엔진 어댑터는 ④가 싣는
    // `useEstimatedAcquisition`·`transferCause`·`isAuctionTransfer`(주택은 2호 전송 대상 — `isAuctionEligibleAssetKind`)로 같은 판정.
    isSec164_9Conversion:
      deriveLegacyPartAcqMode(asset) === "estimated" &&
      (asset.transferCause === "public_expropriation" || asset.isAuctionTransfer === true),
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
 * #17 후속(F1·G2) — 별개취득 토글 ON + 토지·건물 취득일 같음이면 분리 섹션의 파트 방식 라디오가 자산 단위 「취득가액 산정 방식」과 함께 화면에 있다
 * (토글이 렌더 조건). 두 라디오가 다르면 그중 하나는 계산에 반영되지 않으므로 ⑧이 어긋난 파트 라디오 칸으로 막는다 — 어긋난 칸(토지 먼저) 또는 null.
 * - 배율 초과분 분리 경로(F1): 자산 단위 방식으로 계산한다 — 파트 방식을 그대로 실으면 환산 파트는 400(양도시 개별주택가격 미전송), 감정·매매사례
 *   파트는 실가 총액의 안분 몫을 그 방식으로 부르는 값이 된다.
 * - 배율 한도 이내(G2): ④는 라디오 값을 싣지만 엔진은 비-별개취득에서 취득시 건물 기준시가(④ 미전송)가 필요한 조합이면 분리를 포기하고 자산 단위로
 *   계산한다 → 파트 라디오는 «양쪽 실가 + 파트 취득가액»일 때만 계산에 닿고, 그때는 자산 단위 방식이 무시된다(환산이면 총액 0 − 토지분 = 음수 건물분).
 * 그래서 범위는 배율 초과 여부와 무관한 같은 사실 집합(`factsOf` — 면적 조건만 뺀다)이다. 컴패니언 주택은 실측하지 않아 범위 밖으로 둔다.
 * 읽는 값은 ⑤가 라디오에 표시하는 값(`effectivePartAcqMode`)이다. 토지 상속·증여(D1)면 토지 라디오 대신 고정 안내가 떠서 토지는 보지 않는다.
 */
export function housingExcessPartModeMismatch(
  asset: AssetForm,
  isPrimary: boolean,
): "landAcqMode" | "buildingAcqMode" | null {
  // 면적 1 — 배율 초과 여부만 빼고 분리 경로와 같은 사실 판정(`housingExcessZonePending`과 같은 방식).
  if (asset.hasSeperateLandAcquisitionDate !== true || !isPrimary || !housingExcessSplitApplies(factsOf(asset, 1))) return null;
  const mode = deriveLegacyPartAcqMode(asset);
  if (!effectiveLandAcquisitionCause(asset) && effectivePartAcqMode(asset.landAcqMode, asset) !== mode) return "landAcqMode";
  if (effectivePartAcqMode(asset.buildingAcqMode, asset) !== mode) return "buildingAcqMode";
  return null;
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

/**
 * #17 후속 — 배율 초과분 분리 경로에서 자산 전체 자본적지출의 **토지분** 칸이 필요한가. ⑤ 칸 노출 · ⑧ 필수 · ④ 전송이 같은 술어를 읽는다.
 *
 * 분리 경로(`calcSplitGain`)는 파트 자본적지출(`landDirectExpenses`·`buildingDirectExpenses`)만 읽는다. 「소득세법」 §100② 후문은 공통되는
 * 취득가액·양도비용만 안분 대상으로 열거하므로 자본적지출은 귀속 파트를 받아야 한다(자동 안분 금지) — 토지분 1칸을 받고 건물분은 전체 − 토지분.
 *
 * 별개취득 토글이 켜져 있으면(같은 날짜라 이 경로를 타더라도) 분리 섹션의 파트 자본적지출 칸이 화면에 있고 ④가 그 값을 싣는다 — 이중 입력을
 * 막으려고 그때는 이 칸을 열지 않는다(④ `partInputsActive`와 상보 — 이 경로는 소유자 분리가 아니므로 토글만 보면 된다).
 */
export function housingExcessNeedsCapexSplit(asset: AssetForm, transferDate: string | undefined, isPrimary: boolean): boolean {
  // 감정가액·매매사례가액 취득은 필요경비가 개산공제뿐이라(§97②2호 — 단서 비교는 환산취득가액만) 자본적지출이 세액에 닿지 않는다 — 묻지 않는다.
  const mode = deriveLegacyPartAcqMode(asset);
  return (
    (mode === "actual" || mode === "estimated") &&
    asset.hasSeperateLandAcquisitionDate !== true &&
    parseAmount(asset.capitalExpenditure ?? "") > 0 &&
    housingExcessNeedsLandSplit(asset, transferDate, isPrimary)
  );
}

/** 토지분(미입력이면 null)·건물분(= 전체 − 토지분, 토지분 미입력·초과면 null) — 100% 기준 금액. ⑤ 표시·⑧·④가 같은 값을 쓴다. */
export function housingExcessCapexParts(asset: AssetForm): { total: number; land: number | null; building: number | null } {
  const total = parseAmount(asset.capitalExpenditure ?? "");
  const raw = (asset.housingExcessLandCapex ?? "").trim();
  const land = raw === "" ? null : parseAmount(raw);
  const building = land === null || land < 0 || land > total ? null : total - land;
  return { total, land, building };
}

/**
 * #17 후속(K1) — 배율 한도를 함께 쓰는 면적(화면 일체과세 배지용). route `appurtenantLimitShareOf`(엔진 입력 기준)와 **같은 사실**을 폼에서 읽는다.
 * - 주택 카드 토지: 주 자산이 «토지·건물 모두 본인 소유» 주택(겸용 아님 — ④가 `propertyType: "housing"`으로 싣는 범위)일 때 ④가 싣는 `acquisitionArea`.
 * - 부수토지 카드 합계: 분리 진입 조건(토지 · 주택부수토지 · 수동 세율 지정 없음 · 면적 > 0)을 통과한 카드의 ④ `areaM2`(`appurtenantCardAreaM2`).
 */
export function appurtenantLimitShareOfAssets(
  primary: AssetForm,
  companions: readonly AssetForm[],
): { houseLandAreaM2?: number; appurtenantCardsAreaM2: number } {
  const houseCounts =
    primary.assetKind === "housing" && !primary.isMixedUseHouse && (effectiveSelfOwns(primary) ?? "both") === "both";
  return {
    houseLandAreaM2: houseCounts ? resolveAcqAreaForStdPrice(primary) : undefined,
    appurtenantCardsAreaM2: companions.reduce(
      (sum, c) => (c.manualHoldingPeriodOverride !== undefined ? sum : sum + appurtenantCardAreaM2(c)),
      0,
    ),
  };
}
