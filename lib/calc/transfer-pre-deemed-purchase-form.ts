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
import { isRedevelopmentSec166Asset, redevHidesGeneralAcqSection } from "./redev-acquisition-price-source";
import { gbPartModes } from "./transfer-tax-split-acq-mode";

export const PRE_DEEMED_DATE = "1985-01-01";

const KINDS: ReadonlySet<AssetForm["assetKind"]> = new Set(["land", "housing", "building", "commercial_building"]);

type GateFields = Pick<
  AssetForm,
  | "acquisitionCause"
  | "transferType"
  | "acquisitionDate"
  | "assetKind"
  | "isMixedUseHouse"
  | "hasSeperateLandAcquisitionDate"
  | "usePreHousingDisclosure"
  | "parcelMode"
  | "isSuccessorRightToMoveIn"
  | "redevIsSuccessorMember"
>;

type GbGateFields = Pick<
  AssetForm,
  | "acquisitionCause"
  | "transferType"
  | "acquisitionDate"
  | "assetKind"
  | "hasSeperateLandAcquisitionDate"
  | "landAcquisitionDate"
  | "gbBuildingAcquisitionCause"
  | "gbHasExtension"
> & Parameters<typeof gbPartModes>[0];

/** 일반건물 일괄취득 매매(분리 OFF · 증축 없음)이고 취득일 칸이 의제취득일인가 — 모드는 따로 본다 */
function isGbPreDeemedBundledPurchase(a: GbGateFields): boolean {
  return (
    a.assetKind === "general_building" &&
    a.acquisitionCause === "purchase" &&
    a.transferType !== "burdened_gift" &&
    a.acquisitionDate === PRE_DEEMED_DATE &&
    a.landAcquisitionDate === PRE_DEEMED_DATE &&
    !a.hasSeperateLandAcquisitionDate &&
    !a.gbHasExtension &&
    (a.gbBuildingAcquisitionCause || "purchase") === "purchase"
  );
}

function isGbActualMode(a: GbGateFields): boolean {
  const m = gbPartModes(a);
  return m.land === "actual" && m.building === "actual";
}

/** ⑤ 안내 — 일반건물 일괄취득 추계 모드는 ②를 비교하지 않는다(Q-15 b · 환산→실가 전환 장치 없음) */
export function gbPreDeemedPurchaseNotCompared(a: GbGateFields): boolean {
  return isGbPreDeemedBundledPurchase(a) && !isGbActualMode(a);
}

/** 카드를 여는 자산인가 — 취득일 칸이 의제취득일(덮어쓰기 결과)인 1차 범위 매매 자산 */
export function isPreDeemedPurchaseAsset(a: GateFields & Partial<GbGateFields>): boolean {
  if (a.assetKind === "general_building") {
    const g = a as GbGateFields;
    return isGbPreDeemedBundledPurchase(g) && isGbActualMode(g);
  }
  if (a.acquisitionCause !== "purchase" || a.transferType === "burdened_gift") return false;
  if (a.acquisitionDate !== PRE_DEEMED_DATE) return false;
  // 재개발은 원조합원만(승계조합원은 취득일이 승계 시점이고 §166③ 대상이 아니다 · Q-4 a)
  const kindOpen = isRedevelopmentSec166Asset(a) ? redevHidesGeneralAcqSection(a) : KINDS.has(a.assetKind);
  if (!kindOpen || a.isMixedUseHouse || a.parcelMode) return false;
  // 토지·건물 취득일을 따로 두면 파트마다 취득월이 다르다(2차 범위) — PHD는 같은 날 두 칸이라 연다
  if (a.hasSeperateLandAcquisitionDate && !a.usePreHousingDisclosure) return false;
  return true;
}

/** 실제 취득일이 의제취득일 전으로 입력됐는가 — 이때만 ④가 보내고 ⑥이 「계산 후 확정」으로 둔다 */
export function preDeemedPurchaseApplies(a: GateFields & Pick<AssetForm, "preDeemedOriginalAcquisitionDate">): boolean {
  const o = a.preDeemedOriginalAcquisitionDate;
  return isPreDeemedPurchaseAsset(a) && !!o && o < PRE_DEEMED_DATE;
}

/** 환산·감정·매매사례 모드인가 — 그때만 「함께 견줄 실가」 칸이 ②의 기준이다(실가 모드는 취득가액 칸) */
export function preDeemedPurchaseUsesCompareActual(
  a: Pick<AssetForm, "assetKind" | "isSuccessorRightToMoveIn" | "useEstimatedAcquisition" | "isAppraisalAcquisition" | "isSalesCaseAcquisition">,
): boolean {
  // 재개발 ⑤ 라디오는 실가·환산뿐이다 — 숨은 감정·매매사례 플래그를 읽지 않는다(엔진과 같은 규칙)
  if (isRedevelopmentSec166Asset(a)) return a.useEstimatedAcquisition === true;
  return a.useEstimatedAcquisition === true || a.isAppraisalAcquisition === true || a.isSalesCaseAcquisition === true;
}

/** ④ — 단건·컴패니언 공용. `ratioed`는 호출부의 지분 스케일러(금액 규약 = `acquisitionPrice`). */
export function buildPreDeemedPurchasePayload(
  a: AssetForm,
  ratioed: (v: string | undefined) => number | undefined,
): { preDeemedPurchase?: { originalAcquisitionDate: string; actualPrice?: number; ppiRatio?: number } } {
  // 일반건물은 서브객체로 싣는다(`buildGbPreDeemedPurchasePayload` — 단건·함께 양도·지분이 같은 빌더)
  if (a.assetKind === "general_building" || !preDeemedPurchaseApplies(a)) return {};
  const o = a.preDeemedOriginalAcquisitionDate;
  const actualPrice = preDeemedPurchaseUsesCompareActual(a) ? ratioed(a.preDeemedActualPrice) : undefined;
  const ratio = parseDecimal(a.preDeemedPpiRatio);
  return {
    preDeemedPurchase: {
      originalAcquisitionDate: o,
      ...(actualPrice ? { actualPrice } : {}),
      ...(isBeforePpiSeries(o) && ratio > 0 ? { ppiRatio: ratio } : {}),
    },
  };
}

/** ④ 일반건물 `generalBuildingValuation` 실가 payload — 실가 모드라 ②의 기준은 일괄 취득가액이다 */
export function buildGbPreDeemedPurchasePayload(a: AssetForm): { preDeemedPurchase?: { originalAcquisitionDate: string; ppiRatio?: number } } {
  if (!preDeemedPurchaseApplies(a)) return {};
  const o = a.preDeemedOriginalAcquisitionDate;
  const ratio = parseDecimal(a.preDeemedPpiRatio);
  return { preDeemedPurchase: { originalAcquisitionDate: o, ...(isBeforePpiSeries(o) && ratio > 0 ? { ppiRatio: ratio } : {}) } };
}

/** ⑧ — 카드에 칸이 있을 때만 요구한다(막다른 길 금지) */
export function preDeemedPurchaseInputError(a: AssetForm, label: string): string | null {
  if (!isPreDeemedPurchaseAsset(a)) return null;
  const o = a.preDeemedOriginalAcquisitionDate;
  if (!o) {
    return fieldError(
      "preDeemedOriginalAcquisitionDate",
      `${label}: 실제 취득일을 입력하세요 — 1985.1.1. 전에 매수했으면 취득가액을 ${TRANSFER.PRE_DEEMED_PURCHASE_MAX}에 따라 비교합니다(취득일 칸은 의제취득일 1985.1.1.로 둡니다).`,
    );
  }
  if (o > PRE_DEEMED_DATE) {
    return fieldError(
      "preDeemedOriginalAcquisitionDate",
      `${label}: 실제 취득일이 1985.1.1. 이후입니다 — 취득일 칸에 실제 취득일을 입력하세요.`,
    );
  }
  if (o < PRE_DEEMED_DATE && isBeforePpiSeries(o) && !(parseDecimal(a.preDeemedPpiRatio) > 0)) {
    return fieldError("preDeemedPpiRatio", `${label}: ${PRE_DEEMED_PURCHASE_PPI_RATIO_REQUIRED_MESSAGE}`);
  }
  return null;
}
