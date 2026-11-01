/**
 * 의제취득일(1985.1.1.) 전 «매수» 영 §176조의2④ — 화면 쪽 단일 술어·④ payload·⑧ 검증
 * 계획서: docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md §4.2·§4.3
 *
 * ⑤ 카드(`PreDeemedPurchaseCard`)·④ 단건·컴패니언·⑧·⑥·다건 차단이 모두 `isPreDeemedPurchaseAsset`을 읽는다(3중 패턴).
 * 게이트는 엔진 범위(`preDeemedPurchaseOutOfScopeReason`)와 같은 자산만 연다 — 취득일 칸이 덮어쓰기 결과(1985-01-01)인
 * 매매 토지·주택·건물·상가·재개발 원조합원(완공 APT·입주권)·일반건물 일괄취득 실가 모드(Q-8 a · Q-15 b)
 * · 겸용·부담부증여·토지·건물 취득일 분리(PHD 같은 날 제외)·다필지 제외.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { parseDecimal } from "@/lib/calc/number-parse";
import { isBeforePpiSeries } from "@/lib/tax-engine/producer-price-ratio";
import { PRE_DEEMED_PURCHASE_PPI_RATIO_REQUIRED_MESSAGE } from "@/lib/tax-engine/transfer-pre-deemed-purchase-messages";
import { TRANSFER } from "@/lib/tax-engine/legal-codes/transfer";
import { fieldError } from "./transfer-tax-validate-field";
import { effectiveSelfOwns } from "./self-owns-scope";
import { isRedevelopmentSec166Asset, redevHidesGeneralAcqSection } from "./redev-acquisition-price-source";
import { effectivePartAcqMode, gbPartModes } from "./transfer-tax-split-acq-mode";
import { effectiveBuildingCarryoverMix, effectiveBuildingCauseMix, effectiveCarryoverDonorSplit, effectiveLandCarryover, landCauseDisplay } from "./transfer-land-part-cause";

export const PRE_DEEMED_DATE = "1985-01-01";

const KINDS: ReadonlySet<AssetForm["assetKind"]> = new Set(["land", "housing", "building", "commercial_building"]);

type Fields = AssetForm;

/**
 * 토지·건물 취득일 분리에서 의제취득일 전 매수인 파트 — 한 파트만일 때. 날짜 칸이 덮어쓰기 결과(1985-01-01)이고 상대 파트는 그 뒤다.
 * 두 파트 모두 1985 전이면 칸이 같은 값이라 별개 취득이 꺼지고 파트 실가·취득월을 받을 곳이 없다 — 비교하지 않고 안내만(계획서 §12.8).
 */
export function preDeemedSplitPart(a: Pick<Fields, "hasSeperateLandAcquisitionDate" | "landAcquisitionDate" | "acquisitionDate">): "land" | "building" | undefined {
  if (!a.hasSeperateLandAcquisitionDate) return undefined;
  const { landAcquisitionDate: l, acquisitionDate: b } = a;
  if (l === PRE_DEEMED_DATE && b > PRE_DEEMED_DATE) return "land";
  if (b === PRE_DEEMED_DATE && l > PRE_DEEMED_DATE) return "building";
  return undefined;
}

/** 파트 칸이 모두 의제취득일 — 분리 ON인데 두 파트 모두 1985 전 */
const bothPartsDeemed = (a: Pick<Fields, "hasSeperateLandAcquisitionDate" | "landAcquisitionDate" | "acquisitionDate">) =>
  !!a.hasSeperateLandAcquisitionDate && a.landAcquisitionDate === PRE_DEEMED_DATE && a.acquisitionDate === PRE_DEEMED_DATE;

/** 주택 PHD 두 칸의 실제 취득월이 다른가(둘 다 입력된 경우만 — 옛 저장값은 토지 원값이 없다) */
function phdMonthsDiffer(a: Pick<Fields, "preDeemedOriginalAcquisitionDate" | "preDeemedOriginalLandAcquisitionDate">): boolean {
  const l = a.preDeemedOriginalLandAcquisitionDate;
  const b = a.preDeemedOriginalAcquisitionDate;
  return !!l && !!b && l.slice(0, 7) !== b.slice(0, 7);
}

/** 매수뿐인가 — 파트 원인 혼합·소유자 분리 없음 */
function isPlainPurchase(a: Fields): boolean {
  return (
    a.acquisitionCause === "purchase" &&
    a.transferType !== "burdened_gift" &&
    !landCauseDisplay(a) &&
    !effectiveBuildingCauseMix(a) &&
    (a.selfOwns ?? "both") === "both"
  );
}

/** 일반건물 매수 공통(증축 없음 · 건물도 매수) — 모드는 따로 본다 */
function isGbPlainPurchase(a: Fields): boolean {
  return a.assetKind === "general_building" && isPlainPurchase(a) && !a.gbHasExtension && (a.gbBuildingAcquisitionCause || "purchase") === "purchase";
}
const isGbBundledDeemed = (a: Fields) => !a.hasSeperateLandAcquisitionDate && a.acquisitionDate === PRE_DEEMED_DATE && a.landAcquisitionDate === PRE_DEEMED_DATE;

function isGbActualMode(a: Fields): boolean {
  const m = gbPartModes(a);
  return m.land === "actual" && m.building === "actual";
}

/**
 * ⑤ 안내 — 의제취득일 전 매수인데 ①·② 비교를 반영하지 않는 입력(값은 그대로 계산한다 · Q-12 a):
 *   일반건물 추계 모드(Q-15 b) · 분리 ON 두 파트 모두 1985 전 · PHD 두 칸 실제 취득월 다름
 */
export function preDeemedPurchaseNotCompared(a: Fields): boolean {
  if (!isPlainPurchase(a)) return false;
  if (a.assetKind === "general_building") {
    if (!isGbPlainPurchase(a)) return false;
    return bothPartsDeemed(a) || ((isGbBundledDeemed(a) || !!preDeemedSplitPart(a)) && !isGbActualMode(a));
  }
  if (a.assetKind !== "housing" && a.assetKind !== "building") return false;
  if (a.isMixedUseHouse || a.parcelMode || !bothPartsDeemed(a)) return false;
  return !a.usePreHousingDisclosure || phdMonthsDiffer(a);
}

/** 카드를 여는 자산인가 — 취득일 칸이 의제취득일(덮어쓰기 결과)인 범위 안 매매 자산 */
export function isPreDeemedPurchaseAsset(a: Fields): boolean {
  if (preDeemedPurchaseNotCompared(a)) return false;
  if (a.acquisitionCause !== "purchase" || a.transferType === "burdened_gift") return false;
  const part = preDeemedSplitPart(a);
  if (a.assetKind === "general_building") {
    return isGbPlainPurchase(a) && isGbActualMode(a) && (isGbBundledDeemed(a) || !!part);
  }
  if (part) return (a.assetKind === "housing" || a.assetKind === "building") && !a.isMixedUseHouse && !a.parcelMode && isPlainPurchase(a);
  if (a.acquisitionDate !== PRE_DEEMED_DATE) return false;
  // 재개발은 원조합원만(승계조합원은 취득일이 승계 시점이고 §166③ 대상이 아니다 · Q-4 a)
  const kindOpen = isRedevelopmentSec166Asset(a) ? redevHidesGeneralAcqSection(a) : KINDS.has(a.assetKind);
  // 소유자 분리는 파트 경로라 엔진이 전체 비교를 받지 않는다(범위 밖 안내 · 카드가 칸을 요구하면 막다른 길)
  if (!kindOpen || a.isMixedUseHouse || a.parcelMode || (effectiveSelfOwns(a) ?? "both") !== "both") return false;
  // 분리 ON + 두 칸 같은 날은 PHD만 연다(위 안내가 나머지를 거른다) · 날짜가 다른데 파트가 없으면(1985-01-01 + 그 전 값) 범위 밖
  if (a.hasSeperateLandAcquisitionDate && !(a.usePreHousingDisclosure && (!a.landAcquisitionDate || a.landAcquisitionDate === PRE_DEEMED_DATE))) return false;
  return true;
}

/** 범위 밖 자산의 종류 — ⑤ 안내 문구가 읽는다(Q-12 a · 값은 그대로 계산한다) */
export type PreDeemedOutOfScopeKind = "parcels" | "carryover" | "burdened_gift" | "mixed_use" | "extension" | "part_cause" | "other";

const isBeforeDeemed = (d: string | undefined) => !!d && d < PRE_DEEMED_DATE;

/** 이월과세 증여자가 1985 전에 매수했는가 — 증여자 취득일 칸은 덮어쓰지 않아 원 입력 그대로다. 받는 칸이 있는 서브폼만 읽는다(잔재 무시). */
function carryoverDonorPreDeemed(a: Fields, isNonPrimary: boolean): boolean {
  const wholeOn = a.acquisitionCause === "carryover_gift";
  const forms = [
    wholeOn || effectiveBuildingCarryoverMix(a) ? a.carryover : undefined,
    effectiveLandCarryover(a) || (wholeOn && effectiveCarryoverDonorSplit(a, { isNonPrimary })) ? a.landCarryover : undefined,
    a.assetKind === "general_building" && a.gbBuildingAcquisitionCause === "carryover_gift" ? a.buildingCarryover : undefined,
  ];
  return forms.some((c) => c && c.donorAcquisitionCause === "purchase" && isBeforeDeemed(c.donorAcquisitionDate));
}

/** 매수 파트의 취득일 칸이 의제취득일(덮어쓰기 결과)인가 — 상속·증여·이월과세 파트 칸은 보지 않는다 */
function hasDeemedPurchaseDate(a: Fields): boolean {
  const landDeemed = a.landAcquisitionDate === PRE_DEEMED_DATE;
  const buildingDeemed = a.acquisitionDate === PRE_DEEMED_DATE;
  if (a.assetKind === "general_building") {
    return (a.acquisitionCause === "purchase" && landDeemed) || ((a.gbBuildingAcquisitionCause || a.acquisitionCause) === "purchase" && buildingDeemed);
  }
  // 건물 상속·증여·이월과세 + 토지 매수 — 건물 칸은 사실값이다
  if (effectiveBuildingCauseMix(a) || effectiveBuildingCarryoverMix(a)) return landDeemed;
  if (a.acquisitionCause !== "purchase") return false;
  return buildingDeemed || (!landCauseDisplay(a) && !!a.hasSeperateLandAcquisitionDate && landDeemed);
}

/**
 * ⑤ 안내 — 의제취득일 전 매수인데 ①·② 비교 범위 밖인 자산의 종류. 입력 카드·`preDeemedPurchaseNotCompared` 안내가 뜨는 자산은 undefined.
 * 겸용 부담부증여는 ⑧ MB-16이 이미 막는다(Q-10) — 안내하지 않는다. 다필지는 ④가 필지 값만 쓰므로 필지 날짜를 본다.
 */
export function preDeemedPurchaseOutOfScopeKind(a: Fields, opts: { isNonPrimary?: boolean } = {}): PreDeemedOutOfScopeKind | undefined {
  if (a.assetKind === "land" && a.parcelMode) return (a.parcels ?? []).some((p) => !p.useDayAfterReplotting && isBeforeDeemed(p.acquisitionDate)) ? "parcels" : undefined;
  if (carryoverDonorPreDeemed(a, !!opts.isNonPrimary)) return "carryover";
  if (isPreDeemedPurchaseAsset(a) || preDeemedPurchaseNotCompared(a) || !hasDeemedPurchaseDate(a)) return undefined;
  if (a.transferType === "burdened_gift") return a.isMixedUseHouse ? undefined : "burdened_gift";
  if (a.isMixedUseHouse) return "mixed_use";
  if (a.assetKind === "general_building" && a.gbHasExtension) return "extension";
  const buildingCauseSplit = a.assetKind === "general_building" && (a.gbBuildingAcquisitionCause || a.acquisitionCause) !== "purchase";
  return !isPlainPurchase(a) || buildingCauseSplit ? "part_cause" : "other";
}

/** 그 자산(파트)의 실제 취득일 칸 값 */
export function preDeemedOriginalDate(a: Fields): string {
  return preDeemedSplitPart(a) === "land" ? a.preDeemedOriginalLandAcquisitionDate : a.preDeemedOriginalAcquisitionDate;
}

/** 실제 취득일이 의제취득일 전으로 입력됐는가 — 이때만 ④가 보내고 ⑥이 「계산 후 확정」으로 둔다 */
export function preDeemedPurchaseApplies(a: Fields): boolean {
  const o = preDeemedOriginalDate(a);
  return isPreDeemedPurchaseAsset(a) && !!o && o < PRE_DEEMED_DATE;
}

/** 환산·감정·매매사례 모드인가 — 그때만 「함께 견줄 실가」 칸이 ②의 기준이다(실가 모드는 취득가액 칸) */
export function preDeemedPurchaseUsesCompareActual(a: Fields): boolean {
  // 재개발 ⑤ 라디오는 실가·환산뿐이다 — 숨은 감정·매매사례 플래그를 읽지 않는다(엔진과 같은 규칙)
  if (isRedevelopmentSec166Asset(a)) return a.useEstimatedAcquisition === true;
  const part = a.assetKind === "general_building" ? undefined : preDeemedSplitPart(a);
  if (part) return effectivePartAcqMode(part === "land" ? a.landAcqMode : a.buildingAcqMode, a) !== "actual";
  return a.useEstimatedAcquisition === true || a.isAppraisalAcquisition === true || a.isSalesCaseAcquisition === true;
}

/** ④ — 단건·컴패니언 공용. `ratioed`는 호출부의 지분 스케일러(금액 규약 = `acquisitionPrice`). */
export function buildPreDeemedPurchasePayload(
  a: AssetForm,
  ratioed: (v: string | undefined) => number | undefined,
): { preDeemedPurchase?: { part?: "land" | "building"; originalAcquisitionDate: string; actualPrice?: number; ppiRatio?: number } } {
  // 일반건물은 서브객체로 싣는다(`buildGbPreDeemedPurchasePayload` — 단건·함께 양도·지분이 같은 빌더)
  if (a.assetKind === "general_building" || !preDeemedPurchaseApplies(a)) return {};
  const o = preDeemedOriginalDate(a);
  const part = preDeemedSplitPart(a);
  const actualPrice = preDeemedPurchaseUsesCompareActual(a) ? ratioed(a.preDeemedActualPrice) : undefined;
  const ratio = parseDecimal(a.preDeemedPpiRatio);
  return {
    preDeemedPurchase: {
      ...(part ? { part } : {}),
      originalAcquisitionDate: o,
      ...(actualPrice ? { actualPrice } : {}),
      ...(isBeforePpiSeries(o) && ratio > 0 ? { ppiRatio: ratio } : {}),
    },
  };
}

/** ④ 일반건물 `generalBuildingValuation` 실가 payload — 실가 모드라 ②의 기준은 일괄 취득가액이다 */
export function buildGbPreDeemedPurchasePayload(a: AssetForm): { preDeemedPurchase?: { part?: "land" | "building"; originalAcquisitionDate: string; ppiRatio?: number } } {
  if (!preDeemedPurchaseApplies(a)) return {};
  const o = preDeemedOriginalDate(a);
  const part = preDeemedSplitPart(a);
  const ratio = parseDecimal(a.preDeemedPpiRatio);
  return { preDeemedPurchase: { ...(part ? { part } : {}), originalAcquisitionDate: o, ...(isBeforePpiSeries(o) && ratio > 0 ? { ppiRatio: ratio } : {}) } };
}

/** ⑧ — 카드에 칸이 있을 때만 요구한다(막다른 길 금지) */
export function preDeemedPurchaseInputError(a: AssetForm, label: string): string | null {
  if (!isPreDeemedPurchaseAsset(a)) return null;
  const o = preDeemedOriginalDate(a);
  const dateField = preDeemedSplitPart(a) === "land" ? "preDeemedOriginalLandAcquisitionDate" : "preDeemedOriginalAcquisitionDate";
  if (!o) {
    return fieldError(
      dateField,
      `${label}: 실제 취득일을 입력하세요 — 1985.1.1. 전에 매수했으면 취득가액을 ${TRANSFER.PRE_DEEMED_PURCHASE_MAX}에 따라 비교합니다(취득일 칸은 의제취득일 1985.1.1.로 둡니다).`,
    );
  }
  if (o > PRE_DEEMED_DATE) {
    return fieldError(
      dateField,
      `${label}: 실제 취득일이 1985.1.1. 이후입니다 — 취득일 칸에 실제 취득일을 입력하세요.`,
    );
  }
  if (o < PRE_DEEMED_DATE && isBeforePpiSeries(o) && !(parseDecimal(a.preDeemedPpiRatio) > 0)) {
    return fieldError("preDeemedPpiRatio", `${label}: ${PRE_DEEMED_PURCHASE_PPI_RATIO_REQUIRED_MESSAGE}`);
  }
  return null;
}
