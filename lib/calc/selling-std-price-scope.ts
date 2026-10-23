/**
 * 계산기 양도 주택의 **양도 당시 기준시가**(주택 공시가격) — ⑤ 칸 노출·⑧ 필수·④ 양도 주택 행 값의 단일 leaf
 * (계획서 `docs/00-pm/calc-selling-house-std-price-value-region.plan.md` §5 · PR-1).
 *
 * 「소득세법 시행령」 §167의3①1호는 수도권·광역시·특별자치시 밖(가액기준) 주택 중 양도 당시 기준시가 3억원 이하를 주택 수에서 빼고,
 * 같은 호를 인용하는 2주택·주택+권리 조문도 그 주택을 중과하지 않는다. 종전 계산기는 매매·실가 경로에 이 칸이 없어 ④가 0을 실었고
 * 엔진은 0을 「3억 이하」로 읽었다 — 모르는 사실이 납세자에게 유리하게 작동했다(실측 −190,575,000 · 계획서 §1.2).
 *
 * - 보임 = 주택 양도 ∧ 양도일 2018-04-01 이후(§104⑦) ∧ 양도일 현재 조정대상지역(주소 판정). 조정대상지역이 아니면 중과가 없어 결론을 가르지 않는다(Q-3 a).
 * - 필수 = 그중 가액기준(법정동코드 분류 — 엔진 `resolveLowPriceLocalHouse`와 같은 입력). 지역기준은 선택이고 2주택 9호(1억 이하) 판정에 쓴다.
 * - 판정 메뉴(M1 · `surcharge-price-criteria.ts`)는 조정대상지역과 관계없이 필수다 — 메뉴 자체가 중과 판정이라 결과 표가 모든 행을 그린다.
 *
 * 범위 밖(④는 종전 값을 그대로 싣는다):
 * - 겸용주택(V-3) — 1호의 「해당 주택 … 기준시가」가 주택분만인지 판단할 법령 근거를 아직 확인하지 않았다.
 * - 부담부증여 시가 모드(`stdPriceAtTransferComesFromElsewhere`) — 그 모드에서도 ④가 `standardPriceAtTransfer`를 §159 본문의
 *   건물 기준시가로 싣는다(`transfer-tax-api-burdened-gift.ts`). 칸을 열면 중과와 무관한 안분 분모가 함께 움직일 수 있다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { effectiveIsRegulatedAtTransfer } from "./effective-regulated-at-acquisition";
import { sellingHouseIsValueCriteria } from "./surcharge-price-criteria";
import { phdFlagEffective } from "./phd-toggle-scope";
import { hidesGeneralAcqSection } from "./redev-acquisition-price-source";
import { ownerSplitHousingNeedsTransferTotal } from "./transfer-tax-split-acq-mode";
import { effectiveBuildingCarryoverMix, effectiveBuildingCauseMix } from "./transfer-land-part-cause";
import { isGiftPreDeemedConversionAsset } from "./gift-pre-deemed";
import { isRedev166_3PreDeemedAsset } from "./transfer-tax-validate-clause-a";
import { stdPriceAtTransferComesFromElsewhere } from "./burdened-gift-transfer-price-scope";
import { DEEMED_ACQUISITION_DATE } from "./transfer-163-9-base-date";

/** §104⑦ 다주택 중과 시행일 — 그 전 양도는 중과가 없다 */
const SURCHARGE_START = "2018-04-01";

/** 주택 양도인가 — 입주권·분양권 양도는 §104⑦ 밖. 겸용·부담부증여 시가 모드는 범위 밖(머리 주석) */
function isHouseSale(asset: AssetForm): boolean {
  return (
    (asset.assetKind === "housing" || asset.assetKind === "redevelopment_apt") &&
    !asset.isMixedUseHouse &&
    !stdPriceAtTransferComesFromElsewhere(asset)
  );
}

/** ⑤ 칸 노출 — 주택 양도 ∧ 2018-04-01 이후 ∧ 양도일 현재 조정대상지역(주소 판정 — 주소가 없으면 열지 않는다) */
export function sellingStdPriceInScope(asset: AssetForm, transferDate: string | undefined): boolean {
  if (!isHouseSale(asset) || !asset.regionCode || !transferDate || transferDate < SURCHARGE_START) return false;
  return effectiveIsRegulatedAtTransfer({
    regionCode: asset.regionCode,
    regionInDesignatedDistrict: asset.regionInDesignatedDistrict,
    transferDate,
  });
}

/** ⑧ 필수 — 노출 ∧ 가액기준 */
export function sellingStdPriceRequired(asset: AssetForm, transferDate: string | undefined): boolean {
  return sellingStdPriceInScope(asset, transferDate) && sellingHouseIsValueCriteria({ assets: [asset] });
}

/**
 * ④ 양도 주택 행 `officialPrice` — 같은 사실(양도 당시 주택 공시가격)을 받는 칸이 모드마다 다르다.
 * §164⑦ 3시점(PHD)은 그 카드의 양도시 개별주택가격, 상속·증여 주택 3시점 평가 카드만 채웠으면 그 값을 쓴다.
 */
export function sellingHouseStdPriceAtTransfer(asset: AssetForm): number {
  const std = parseAmount(asset.standardPriceAtTransfer);
  if (asset.isMixedUseHouse) return std;
  if (phdFlagEffective(asset)) return parseAmount(asset.phdTransferHousingPrice);
  return std || parseAmount(asset.inhHouseValHousePriceAtTransfer);
}

/**
 * ⑬ 명부 없는 중과 판정 구성(엔진 `noRosterSellingHouse`)의 양도 주택 행 값 — 전용 키로 싣는다(계획서 Q-4 a · PR-2).
 * 명부가 있으면 같은 값이 `houses[selling].officialPrice`로 간다. 범위 밖 자산(겸용·부담부증여 시가 모드)은 화면에 없는 칸이라 싣지 않는다.
 */
export function sellingHouseStdPricePayload(asset: AssetForm): { sellingHouseStdPriceAtTransfer?: number } {
  if (!isHouseSale(asset)) return {};
  const value = sellingHouseStdPriceAtTransfer(asset);
  return value > 0 ? { sellingHouseStdPriceAtTransfer: value } : {};
}

/** 매매 블록(환산 칸) — `CompanionAcqPurchaseBlock`이 마운트되고 환산 분모 칸을 그리는가 */
function purchaseEstimatedFieldShown(asset: AssetForm): boolean {
  const purchaseBlock =
    asset.acquisitionCause === "purchase" || !!effectiveBuildingCauseMix(asset) || effectiveBuildingCarryoverMix(asset);
  return (
    purchaseBlock &&
    asset.transferType !== "burdened_gift" &&
    !hidesGeneralAcqSection(asset) &&
    !!asset.useEstimatedAcquisition &&
    !phdFlagEffective(asset)
  );
}

/** 의제취득일(1985.1.1.) 전 상속·증여 — ③ 환산 분모 칸(`PreDeemedConversionFields`) */
function preDeemedConversionFieldShown(asset: AssetForm): boolean {
  if (asset.transferType === "burdened_gift" || effectiveBuildingCauseMix(asset)) return false;
  if (asset.acquisitionCause === "gift") return isGiftPreDeemedConversionAsset(asset);
  if (asset.acquisitionCause !== "inheritance") return false;
  const base = asset.inheritanceStartDate || asset.acquisitionDate;
  return !!base && base < DEEMED_ACQUISITION_DATE && !isRedev166_3PreDeemedAsset(asset);
}

/**
 * ⑤ 같은 카드의 다른 칸이 이 사실을 이미 받는가 — 같은 사실 칸을 두 개 두지 않는다.
 * `saleBlockShowsStd`는 양도가액 블록의 안분 칸(부담부증여·함께 양도 안분)이다 — 그 판정은 블록이 가진 값으로 호출부가 정한다.
 */
export function sellingStdPriceInputElsewhere(asset: AssetForm, saleBlockShowsStd: boolean): boolean {
  return (
    saleBlockShowsStd ||
    phdFlagEffective(asset) ||
    purchaseEstimatedFieldShown(asset) ||
    (ownerSplitHousingNeedsTransferTotal(asset) && !!asset.hasSeperateLandAcquisitionDate) ||
    preDeemedConversionFieldShown(asset)
  );
}

/** ⑧ — 필수인데 값이 없으면 앵커 필드와 메시지. PHD는 그 카드의 칸이 앵커다. */
export function sellingStdPriceIssue(
  asset: AssetForm,
  transferDate: string | undefined,
): { field: "standardPriceAtTransfer" | "phdTransferHousingPrice"; message: string } | null {
  if (!sellingStdPriceRequired(asset, transferDate) || sellingHouseStdPriceAtTransfer(asset) > 0) return null;
  return {
    field: phdFlagEffective(asset) ? "phdTransferHousingPrice" : "standardPriceAtTransfer",
    message:
      "양도 당시 기준시가(주택 공시가격)를 입력하세요 — 수도권·광역시·특별자치시 밖 주택은 양도 당시 기준시가가 3억원 이하이면 주택 수에서 빠지고 중과하지 않습니다(소득세법 시행령 §167의3①1호). 비워 두면 그 판정을 할 수 없습니다.",
  };
}
