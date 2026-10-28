/**
 * 양도세 사이드바 자산별 요약 — **계산 전 프리뷰·판정 helper** (800줄 분리, 2026-10-28).
 *
 * `transfer-per-asset-summary.ts`가 754줄이라 정책(트리거 800 · 착지 ≤700)에 닿아 이월과세 일반건물 사이드바 소스 전환(PR-2 ⑥)을 하면서
 * 상태 없는 helper를 함수 단위로 옮겼다. 이 파일은 `computeTransferPerAssetSummary`를 참조하지 않는다(단방향).
 * 로직 변경 없음 — 원문 그대로다.
 */

import { hasStaleSplitInput } from "@/lib/calc/transfer-land-part-cause";
import type { TransferFormData } from "./calc-wizard-store";
import type { AssetForm } from "./calc-wizard-asset";
import { parseRaw } from "./transfer-per-asset-direct";
import { isParcelMode } from "./transfer-per-asset-direct";
import { isRedevelopmentPath } from "./transfer-per-asset-direct";
import { gbPartModes } from "@/lib/calc/transfer-tax-split-acq-mode";
import { partNeedsOwnAcqStd } from "@/lib/calc/transfer-tax-split-acq-mode";
import { isRedevSuccessorAptActualOnly } from "@/lib/calc/redev-acquisition-price-source";
import type { BundledAssetInput } from "@/lib/tax-engine/types/bundled-sale.types";
import type { BundledAssetKind } from "@/lib/tax-engine/types/bundled-sale.types";
import { apportionBundledSale } from "@/lib/tax-engine/bundled-sale-apportionment";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { isFullFractionalBundle } from "@/lib/calc/transfer-tax-api-asset-basics";
import { hasPre1990LandEstimation } from "@/lib/calc/transfer-pre1990-land-gate";
import { buildSameAdjustmentPeriodInput } from "@/lib/calc/transfer-same-adjustment-period-input";
import { replotIncrementStdPriceAtTransfer } from "@/lib/calc/replot-increment-std-price";
import { calcStdPriceMonths } from "@/lib/tax-engine/same-adjustment-period-std-price";
import { classifySameAdjustmentPeriod } from "@/lib/tax-engine/same-adjustment-period-std-price";
import { calcSameAdjustmentPeriodStdPrice } from "@/lib/tax-engine/same-adjustment-period-std-price";
import { effectiveSelfOwns } from "@/lib/calc/self-owns-scope";

/** 지분율 (단독 소유는 1.0). computeTransferSummary·API 어댑터와 동일 규칙(inline). */
export function ownershipRatioOf(a: AssetForm): number {
  const n = parseFloat(a.ownershipNumerator || "100");
  const d = parseFloat(a.ownershipDenominator || "100");
  if (!isFinite(n) || !isFinite(d) || d <= 0 || n <= 0 || n >= d) return 1;
  return n / d;
}

/** AssetForm.assetKind → BundledAssetKind (안분 산식엔 미사용, 타입 충족용). */
export function toBundledKind(kind: AssetForm["assetKind"]): BundledAssetKind {
  if (kind === "land") return "land";
  if (kind === "housing" || kind === "right_to_move_in" || kind === "presale_right" || kind === "redevelopment_apt") {
    return "housing";
  }
  return "building";
}

/**
 * 필요경비가 개산공제(§163⑥)인 추계 3종 — 환산·감정·매매사례(「소득세법」 §97②2호 본문이
 * 제1항제1호 **나목** 셋을 한 묶음으로 다룬다). ④의 `acquisitionMethod` 분기와 같은 세 플래그다.
 */
export function isLumpSumMode(a: AssetForm): boolean {
  // 승계조합원 완공 APT는 실거래가 전용 — 남은 추계 플래그를 읽지 않는다(④⑤⑧과 같은 술어 · 계획서 redev-successor-bg-acq-method Q-2 a).
  if (isRedevSuccessorAptActualOnly(a)) return false;
  return a.useEstimatedAcquisition || a.isAppraisalAcquisition || a.isSalesCaseAcquisition;
}

/**
 * 일반건물에 비-actual(환산·감정·매매사례) 파트가 있는가 — ④·⑧과 **같은 leaf**(`gbPartModes` · `partNeedsOwnAcqStd`).
 * 분리 ON은 명시 파트 모드, OFF는 레거시 3플래그 파생이라 `isLumpSumMode`가 못 보는 파트 모드를 본다.
 */
export function isGbNonActualPart(a: AssetForm): boolean {
  if (a.assetKind !== "general_building") return false;
  const m = gbPartModes(a);
  return partNeedsOwnAcqStd(m.land) || partNeedsOwnAcqStd(m.building);
}

/**
 * 공통 개산공제(**취득당시 기준시가 × 율**)로 계산 전에 미리 볼 수 있는 자산인가 (F-14).
 *
 * 개산공제는 양도가액 안분과 무관하므로 일괄양도의 각 자산도 미리 볼 수 있다. 다만 기준시가를
 * 전용 경로가 따로 만드는 자산은 뺀다 — 공통 식으로 보이면 엔진과 다른 값이 된다:
 *   일반건물·상가(전용 프리뷰) · 재개발·입주권(§166·§165①) · 겸용 · 다필지 · 토지/건물 분리(파트별) ·
 *   부담부증여(§159 안분) · 1990.8.30. 전 토지(서브엔진) · 이월과세(증여자 기준시가).
 */
export function isPlainLumpSumAsset(a: AssetForm): boolean {
  return (
    a.assetKind !== "general_building" &&
    a.assetKind !== "commercial_building" &&
    !isRedevelopmentPath(a) &&
    !a.isMixedUseHouse &&
    !isParcelMode(a) &&
    (!a.hasSeperateLandAcquisitionDate || hasStaleSplitInput(a)) &&
    (effectiveSelfOwns(a) ?? "both") === "both" &&
    a.transferType !== "burdened_gift" &&
    a.acquisitionCause !== "carryover_gift" &&
    !hasPre1990LandEstimation(a)
  );
}

/**
 * 안분 모드에서 자산별 양도가액을 산출 가능한지 판정.
 * 조건: 안분 모드 · 자산 2건 이상 · 총액 > 0 · **안분 대상 자산**의 양도시 기준시가 > 0.
 * (축 B — 같은 물건 지분 분할 — 의 지분 자산만 총액×지분 자동가라 기준시가가 필요 없다. 함께 양도 묶음의 지분 자산은
 *  물건 전체 기준시가 × 지분율이 안분 키다 — ④ `buildAssetPayload`와 같은 규칙.)
 */
export function canApportion(formData: TransferFormData): boolean {
  if (formData.bundledSaleMode !== "apportioned") return false;
  if (formData.assets.length < 2) return false;
  if (parseRaw(formData.contractTotalPrice) <= 0) return false;
  const axisB = isFullFractionalBundle(formData.assets, formData.assetSplitMode);
  return formData.assets.every(
    (a, i) => (axisB && ownershipRatioOf(a) < 1) || apportionStdPriceAtTransfer(formData, a, i) > 0,
  );
}

/**
 * 안분 키로 쓸 「양도시 기준시가」 — ④(`buildAssetPayload`)와 **같은 축**.
 *
 * 증환지 증가분은 자기 칸을 입력받지 않고 당초분에서 파생하는데, 종전에는 사이드바만
 * raw를 읽어 **엔진은 안분하는데 화면은 아무것도 못 보여주는** 상태가 됐다(L-8 실체).
 * ④가 `slice(1)`에만 파생을 적용하므로 여기서도 **index ≥ 1**에만 적용한다.
 */
export function apportionStdPriceAtTransfer(
  formData: TransferFormData,
  a: AssetForm,
  index: number,
): number {
  const raw = parseRaw(a.standardPriceAtTransfer);
  if (raw > 0 || index === 0) return raw;
  return replotIncrementStdPriceAtTransfer(a, formData.assets[0]) ?? 0;
}

/**
 * 안분 결과를 assetId → allocatedSalePrice 맵으로 (계산 전 프리뷰).
 * ④(`buildAssetPayload` · `transfer-tax-api-companion-payload.ts`)와 같은 규칙이다:
 *   · 축 B(같은 물건 지분 분할)의 지분 자산 — `fixedSalePrice = 총액 × 지분`(안분 제외, 자동가).
 *   · 함께 양도 묶음의 지분 자산 — 안분 키 = 물건 전체 기준시가 × 지분율(양도하는 것이 지분이다).
 * 종전에는 지분 자산이면 모두 「총액 × 지분」으로 미리 보여 줘, #2080(혼합)·전 자산 지분 함께 양도에서 계산 전 값이 엔진과 달랐다
 * (2026-10-18 실측 — 혼합 안분 5억·5억 vs 엔진 666,666,667·333,333,333).
 */
export function computeApportionedSaleMap(formData: TransferFormData): Map<string, number> | null {
  const total = parseRaw(formData.contractTotalPrice);
  const axisB = isFullFractionalBundle(formData.assets, formData.assetSplitMode);
  const assets: BundledAssetInput[] = formData.assets.map((a, i) => {
    const ratio = ownershipRatioOf(a);
    const std = apportionStdPriceAtTransfer(formData, a, i);
    return {
      assetId: a.assetId,
      assetLabel: a.assetLabel,
      assetKind: toBundledKind(a.assetKind),
      standardPriceAtTransfer: ratio < 1 && !axisB ? applyRatio(std, ratio) : std,
      fixedSalePrice: ratio < 1 && axisB ? applyRatio(total, ratio) : undefined,
    };
  });
  try {
    const res = apportionBundledSale({ totalSalePrice: total, assets });
    return new Map(res.apportioned.map((p) => [p.assetId, p.allocatedSalePrice]));
  } catch {
    return null;
  }
}

/**
 * ⑥ 사이드바 환산 프리뷰용 「양도당시 기준시가」 — §164⑧ 적용 후 값.
 *
 * 엔진(STEP 0.47)과 **같은 leaf**를 쓴다. 별도 산식을 두면 사이드바만 다른 값을 보여준다.
 * 요건 미충족·토글 OFF면 입력값을 그대로 돌려주므로 종전 동작과 같다(회귀 0).
 */
export function previewStdPriceAtTransfer(a: AssetForm, transferDate: string | undefined): number {
  /**
   * ⚠️ 증환지 fallback을 **여기서는 쓰지 않는다.** 이 함수는 `isSingle` 분기 안에서만
   *    불리는데, 자산이 1건이면 당초분이 자기 자신이 되어 「자기 ㎡당 × 자기 면적」으로
   *    파생하게 된다. 그런데 ④는 `form.assets.slice(1)`에만 파생을 적용하고 primary는
   *    입력값을 그대로 쓰므로(`transfer-tax-api.ts:681`·`:426`), 파생하면 **엔진이
   *    재현할 수 없는 금액**을 사이드바가 보여준다. 값을 안 보여주는 편이 정직하다.
   */
  const raw = parseRaw(a.standardPriceAtTransfer);
  const sap = buildSameAdjustmentPeriodInput(a);
  if (!sap || !transferDate || !a.acquisitionDate) return raw;

  // `T00:00:00`(로컬 자정) 대신 date-only ISO(UTC 자정)로 만든다 — 엔진(`toDate`)과 같은 규약이라야
  // 사이드바 보유월수와 §164⑧ 엔진 보유월수가 갈리지 않는다(`calcStdPriceMonths`는 UTC 달력 날짜를 읽는다).
  const acqDate = new Date(a.acquisitionDate);
  const tsfDate = new Date(transferDate);
  const acq = parseRaw(a.standardPriceAtAcq);
  if (classifySameAdjustmentPeriod({
    standardPriceAtAcquisition: acq,
    standardPriceAtTransfer: raw,
    acquisitionDate: acqDate,
    transferDate: tsfDate,
  }) !== "clause_1") {
    return raw;
  }

  const holdingMonths = calcStdPriceMonths(acqDate, tsfDate);
  if (!(holdingMonths > 0)) return raw;

  return calcSameAdjustmentPeriodStdPrice({
    formula: sap.formula ?? "prev",
    standardPriceAtAcquisition: acq,
    priorStandardPrice: sap.priorStandardPrice,
    newStandardPrice: sap.newStandardPrice,
    holdingMonths,
    adjustmentMonths: sap.adjustmentMonths ?? 12,
  }).value;
}

