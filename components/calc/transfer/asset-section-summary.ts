/**
 * 양도세 자산 카드 접기 섹션 헤더 — 라벨 요약 derive (표시 전용 순수 함수).
 *
 * 계획: docs/00-pm/transfer-asset-input-progressive-disclosure.plan.md §4-3
 * 원칙: **라벨 전용·금액 미포함**. 금액 합계의 단일 진실은 사이드바 computeTransferSummary
 *       (lib/stores/calc-wizard-store.ts:358) — 헤더가 금액을 재계산하면 dual-truth.
 * useEffect→store 미러링 없음 — 호출부(CompanionAssetCard)에서 useMemo로 래핑.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { ASSET_KIND_LABELS, ACQUISITION_CAUSE_LABELS, TRANSFER_TYPE_LABELS } from "./asset-labels";

export type AssetSectionKey = "basic" | "transfer" | "acquisition" | "expense" | "extras";

export interface SectionSummary {
  /** 접힘 헤더 우측에 보일 라벨 (금액 없음) */
  label: string;
  /** presence — 입력여부 점(✓/○). "유효"가 아님(검증은 별도) */
  filled: boolean;
}

export interface AssetSummary {
  basic: SectionSummary;
  transfer: SectionSummary;
  acquisition: SectionSummary;
  expense: SectionSummary;
  /** ⑤ 기타 특례 — land+NBL정밀 / housing·입주권에서만 non-null (그 외 섹션 미렌더) */
  extras: SectionSummary | null;
}

function hasText(s: string | undefined | null): boolean {
  return !!(s && s.trim().length > 0);
}

function amount(s: string | undefined | null): number {
  const n = parseFloat((s ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function acquisitionMethodLabel(asset: AssetForm): string {
  if (asset.isSalesCaseAcquisition) return "매매사례가액";
  if (asset.isAppraisalAcquisition) return "감정가액";
  if (asset.useEstimatedAcquisition) return "환산취득가";
  return "실거래가";
}

/** 취득가가 전용 블록(cb·gb·redev 접두 필드)에 저장되어 표준 산정방식 플래그가 불명확한 자산 */
function isSpecialAsset(kind: AssetForm["assetKind"]): boolean {
  return kind === "general_building" || kind === "commercial_building" || kind === "redevelopment_apt";
}

/**
 * 접기 섹션 헤더용 라벨 요약.
 * @param ctx.totalTransferExpense 폼-전역 일괄 양도비 — 자산-수준 transferExpense 가 일괄안분 모드에서
 *        disabled(공란)일 때 ④ filled 판정에 필요 (asset-only 불가).
 */
export function summarizeAssetSections(
  asset: AssetForm,
  ctx: {
    totalTransferExpense?: string;
    /** 폼-전역 함께양도 모드 — 「안분」이면 ②가 받는 칸이 양도시 기준시가다. */
    bundledSaleMode?: string;
    /** 지분 분할(축 B) — 양도가액 칸이 자동산정 카드로 대체된다. */
    isFractionalSplit?: boolean;
  } = {},
): AssetSummary {
  const kindLabel = ASSET_KIND_LABELS[asset.assetKind] ?? asset.assetKind;

  // ① 기본정보 — 종류 · 소재지 (+ land 면적 입력여부)
  const place =
    asset.buildingName?.trim() ||
    asset.addressJibun?.trim() ||
    asset.addressRoad?.trim() ||
    "";
  const hasArea =
    asset.assetKind === "land" && (hasText(asset.transferArea) || hasText(asset.acquisitionArea));
  const basicParts = [kindLabel, place || "소재지 미입력"];
  if (hasArea) basicParts.push("면적 입력됨");
  const basic: SectionSummary = { label: basicParts.join(" · "), filled: !!place || hasArea };

  /**
   * ② 양도정보 — 양도형태 (부담부증여는 §159 자동산정).
   *
   * 🔴 **`transferCause`도 본다** (2026-09-07 UI 리뷰). `TransferModeBlock.selectMode`는
   *    공익수용을 `transferType: "regular" + transferCause: "public_expropriation"`으로 저장한다.
   *    같은 파일의 `currentMode`는 `transferCause`를 **우선**해 라디오를 올바로 그리는데
   *    이 요약만 `transferType`만 읽어, 3지선다에서 「공익수용·협의매수」를 고르고 섹션을 접으면
   *    헤더와 칩바가 「일반 양도」라고 말했다 — §77 감면·NBL 사업용 의제가 걸린 선택이다.
   *
   * 🔴 **입력여부도 한 필드만 보지 않는다.** 안분(`bundledSaleMode === "apportioned"`) 모드는
   *    양도가액 대신 **양도시 기준시가**를 받고, 지분 분할 모드는 양도가액 칸 자체를 자동산정
   *    카드로 대체해 `actualSalePrice`를 아예 쓰지 않는다(`CompanionSaleModeBlock`).
   *    두 경우 ②를 완전히 채워도 영구히 「○ 미입력」이었다.
   */
  const isBurdened = asset.transferType === "burdened_gift";
  const isExpropriation = asset.transferCause === "public_expropriation";
  const transferLabel = isExpropriation
    ? "공익수용·협의매수"
    : isBurdened
      ? "§159 자동산정"
      : (TRANSFER_TYPE_LABELS[asset.transferType || "regular"] ?? "일반 양도");
  /** 이 모드에서 ②의 값을 받는 칸이 무엇인가 — ⑤ `CompanionSaleModeBlock`과 같은 축. */
  const transferFilled =
    isBurdened ||
    hasText(asset.actualSalePrice) ||
    // 안분 모드: 양도가액 대신 양도시 기준시가를 받는다.
    (ctx.bundledSaleMode === "apportioned" && hasText(asset.standardPriceAtTransfer)) ||
    // 지분 분할: 양도가액은 자동산정이라 지분율 입력이 곧 ② 완료 신호다.
    (!!ctx.isFractionalSplit && hasText(asset.ownershipNumerator));
  const transfer: SectionSummary = { label: transferLabel, filled: transferFilled };

  // ③ 취득정보 — 원인 · 산정방식 (특수자산은 방식이 전용 블록에 있어 원인만)
  const causeLabel = ACQUISITION_CAUSE_LABELS[asset.acquisitionCause] ?? asset.acquisitionCause;
  const acquisition: SectionSummary = {
    label: isSpecialAsset(asset.assetKind)
      ? causeLabel
      : `${causeLabel} · ${acquisitionMethodLabel(asset)}`,
    filled: hasText(asset.acquisitionDate),
  };

  // ④ 필요경비 — 자산-수준 금액(>0) 또는 폼-전역 일괄 양도비 활성
  const useFormLevelExpense = amount(ctx.totalTransferExpense) > 0;
  const expenseFilled =
    useFormLevelExpense ||
    amount(asset.capitalExpenditure) > 0 ||
    amount(asset.transferExpense) > 0 ||
    amount(asset.directExpenses) > 0;
  const expense: SectionSummary = {
    label: expenseFilled ? "입력됨" : "미입력",
    filled: expenseFilled,
  };

  // ⑤ 기타 특례 — NBL 정밀판정(land) / 장기임대 거주주택(housing·입주권). 둘 다 아니면 null
  let extras: SectionSummary | null = null;
  const nblDetailed =
    asset.assetKind === "land" && asset.isNonBusinessLand && asset.nblUseDetailedJudgment;
  const isRentalEligible = asset.assetKind === "housing" || asset.assetKind === "right_to_move_in";
  if (nblDetailed) {
    extras = { label: "비사업용 토지 정밀판정", filled: true };
  } else if (isRentalEligible) {
    extras = {
      label: "장기임대 거주주택 특례",
      filled: asset.rentalHousingException?.applyException === true,
    };
  }

  return { basic, transfer, acquisition, expense, extras };
}
