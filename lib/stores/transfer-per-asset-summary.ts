/**
 * 양도세 사이드바 — 자산별 요약 순수 함수.
 *
 * 마법사 좌측 사이드바에 자산 1·2·… 별로 「양도가액·취득가액·필요경비·공제·감면」을
 * 분리 표시하기 위한 계산. `computeTransferSummary`(aggregate)와 별개 — 이 함수는
 * 자산 단위로 분해하며, 안분(§166⑥) 모드의 양도가액을 엔진 함수로 산출한다.
 *
 * 정책:
 *   - 안분 계산은 엔진 `apportionBundledSale` 재사용 (재구현 금지, single-source).
 *   - 기준시가 미입력 시 자동 안분 금지 → salePending(«계산 후 표시»). silent fallback 금지.
 *   - 무한 루프 방지: 소비처(TransferTaxCalculator)에서 useMemo로 래핑.
 *   - 결과(bundled) 매칭은 위치 인덱스가 아니라 assetId로 (payload primary/companion 별도 조립).
 *
 * 근거: 소득세법 시행령 §166⑥ (양도가액 기준시가 비율 안분).
 */

import { effectiveBuildingCauseMix } from "@/lib/calc/transfer-land-part-cause";
import { hasStaleSplitInput } from "@/lib/calc/transfer-land-part-cause";
import type { TransferFormData } from "./calc-wizard-store";
import type { AssetForm } from "./calc-wizard-asset";
import type { ReductionType } from "./calc-wizard-asset-reduction";
import type { TransferAPIResult } from "@/lib/calc/transfer-tax-api";
import { mixedUseDisplayedAcqPrice } from "@/lib/calc/mixed-use-part-acq-split";
import { isSuccessorRightTransfer } from "@/lib/calc/transfer-successor-right";
import { parseRaw, isParcelMode, isRedevelopmentPath, parcelAcqSum, directAcqRaw, directExpenseRaw } from "./transfer-per-asset-direct";
import { gbPartModes } from "@/lib/calc/transfer-tax-split-acq-mode";
import { partNeedsOwnAcqStd } from "@/lib/calc/transfer-tax-split-acq-mode";
import { isReceiveOnlyFiling } from "@/lib/calc/redev-field-scope";
import { redevFilingTotals } from "@/components/calc/results/transfer/redev-acquisition-inverse";
import type { BundledAssetInput, BundledAssetKind } from "@/lib/tax-engine/types/bundled-sale.types";
import { apportionBundledSale } from "@/lib/tax-engine/bundled-sale-apportionment";
import { calculateEstimatedAcquisitionPrice } from "@/lib/tax-engine/tax-utils";
import { computeEstimatedDeduction } from "@/lib/tax-engine/tax-utils";
import { estimatedDeductionRate } from "@/lib/tax-engine/legal-codes/transfer-nbl";
import { hasPre1990LandEstimation } from "@/lib/calc/transfer-pre1990-land-gate";
import { previewCommercialBuildingEstimated } from "@/lib/calc/transfer-estimated-preview";
import { previewGeneralBuildingEstimated } from "@/lib/calc/transfer-estimated-preview";
import { buildSameAdjustmentPeriodInput } from "@/lib/calc/transfer-same-adjustment-period-input";
import { replotIncrementStdPriceAtTransfer } from "@/lib/calc/replot-increment-std-price";
import { calcStdPriceMonths, classifySameAdjustmentPeriod, calcSameAdjustmentPeriodStdPrice } from "@/lib/tax-engine/same-adjustment-period-std-price";
import { primaryReductionsWithRows } from "@/lib/calc/house-count-exclusion-rows";
import { effectiveSelfOwns } from "@/lib/calc/self-owns-scope";
import { depreciationSupport } from "@/lib/calc/depreciation-scope";
import { summarizeSplitGain } from "@/lib/tax-engine/transfer-tax-split-display";

export interface TransferAssetSummaryRow {
  assetId: string;
  /** 1-based 순번 — "자산 N" 헤더용 */
  index: number;
  assetLabel: string;
  assetKind: AssetForm["assetKind"];
  salePrice: number;
  acqPrice: number;
  /**
   * 취득가액 라벨 — 표시값의 **범위가 자산 종류마다 다르므로** 라벨로 구분한다.
   *
   * 재개발·입주권(§166)의 취득가액은 자산 전체가 아니라 **인가 전 분 종전주택** 취득가액이다
   * (인가 후 분은 분양가 = 권리가액 ± 청산금으로 따로 산정된다 — `RedevelopmentBlock.tsx:341`).
   * 그냥 「취득가액」으로 두면 전체 취득가액으로 오독된다. 입력 카드 문구
   * (「인가전 분 종전 주택 취득가액」)와 같은 어휘를 쓴다.
   */
  acqLabel: string;
  expense: number;
  reductionTypes: ReductionType[];
  /** «계산 후 표시» 플래그 (환산/안분 미충족 등) */
  salePending: boolean;
  acqPending: boolean;
  expensePending: boolean;
  /** 양도가액이 기준시가 비율 안분값이면 true → «기준시가 안분» 라벨 */
  saleIsApportioned: boolean;
  /** < 1 이면 지분 단계취득 → «지분 N%» 라벨 */
  ownershipRatio: number;
}

export interface TransferPerAssetSummary {
  rows: TransferAssetSummaryRow[];
  /** Σ rows.salePrice — 사이드바 합계 양도가액 푸터용 */
  totalSalePrice: number;
}

/** 지분율 (단독 소유는 1.0). computeTransferSummary·API 어댑터와 동일 규칙(inline). */
function ownershipRatioOf(a: AssetForm): number {
  const n = parseFloat(a.ownershipNumerator || "100");
  const d = parseFloat(a.ownershipDenominator || "100");
  if (!isFinite(n) || !isFinite(d) || d <= 0 || n <= 0 || n >= d) return 1;
  return n / d;
}

/** AssetForm.assetKind → BundledAssetKind (안분 산식엔 미사용, 타입 충족용). */
function toBundledKind(kind: AssetForm["assetKind"]): BundledAssetKind {
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
function isLumpSumMode(a: AssetForm): boolean {
  return a.useEstimatedAcquisition || a.isAppraisalAcquisition || a.isSalesCaseAcquisition;
}

/**
 * 일반건물에 비-actual(환산·감정·매매사례) 파트가 있는가 — ④·⑧과 **같은 leaf**(`gbPartModes` · `partNeedsOwnAcqStd`).
 * 분리 ON은 명시 파트 모드, OFF는 레거시 3플래그 파생이라 `isLumpSumMode`가 못 보는 파트 모드를 본다.
 */
function isGbNonActualPart(a: AssetForm): boolean {
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
function isPlainLumpSumAsset(a: AssetForm): boolean {
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
 * 조건: 안분 모드 · 자산 2건 이상 · 총액 > 0 · **비지분(variable) 자산**의 양도시 기준시가 > 0.
 * (지분 자산은 총액×지분을 §166⑥ 본문 구분 기재로 넘겨 안분 대상에서 제외되므로 기준시가 불요.)
 */
function canApportion(formData: TransferFormData): boolean {
  if (formData.bundledSaleMode !== "apportioned") return false;
  if (formData.assets.length < 2) return false;
  if (parseRaw(formData.contractTotalPrice) <= 0) return false;
  return formData.assets.every(
    (a, i) => ownershipRatioOf(a) < 1 || apportionStdPriceAtTransfer(formData, a, i) > 0,
  );
}

/**
 * 안분 키로 쓸 「양도시 기준시가」 — ④(`buildAssetPayload`)와 **같은 축**.
 *
 * 증환지 증가분은 자기 칸을 입력받지 않고 당초분에서 파생하는데, 종전에는 사이드바만
 * raw를 읽어 **엔진은 안분하는데 화면은 아무것도 못 보여주는** 상태가 됐다(L-8 실체).
 * ④가 `slice(1)`에만 파생을 적용하므로 여기서도 **index ≥ 1**에만 적용한다.
 */
function apportionStdPriceAtTransfer(
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
 * 엔진 `buildAssetPayload`(transfer-tax-api-helpers:489-495)와 동일하게 지분 자산은
 * `fixedSalePrice = 총액 × 지분`으로 넘겨 §166⑥ 본문 안분 제외 → 잔여만 비지분 자산에 안분.
 * (미러링 누락 시 형제 자산이 잔여 아닌 전체총액 기준으로 안분되어 합계가 어긋남 — 이중계상.)
 */
function computeApportionedSaleMap(formData: TransferFormData): Map<string, number> | null {
  const total = parseRaw(formData.contractTotalPrice);
  const assets: BundledAssetInput[] = formData.assets.map((a, i) => {
    const ratio = ownershipRatioOf(a);
    return {
      assetId: a.assetId,
      assetLabel: a.assetLabel,
      assetKind: toBundledKind(a.assetKind),
      standardPriceAtTransfer: apportionStdPriceAtTransfer(formData, a, i),
      fixedSalePrice: ratio < 1 ? Math.floor(total * ratio) : undefined,
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
function previewStdPriceAtTransfer(a: AssetForm, transferDate: string | undefined): number {
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

export function computeTransferPerAssetSummary(
  formData: TransferFormData,
  result: TransferAPIResult | null,
): TransferPerAssetSummary {
  const isSingle = formData.assets.length === 1;
  const bundledResult = result?.mode === "bundled" ? result : null;
  const singleResult = result?.mode === "single" ? result.result : null;
  // 겸용주택(§160①단서)은 별도 mode "mixed-use"(MixedUseGainBreakdown) — single/bundled 어디에도
  // 안 걸려, 처리 없으면 취득가액·필요경비가 계산 후에도 «-»로 누락된다. 겸용은 단일 자산 전제
  // (transfer-tax-api.ts:129 primary만 판정)라 primary 행(i===0)에만 적용.
  const mixedResult = result?.mode === "mixed-use" ? result.result : null;

  // 계산 전 안분 프리뷰 맵 (bundled 결과가 없을 때만 사용)
  const apportionedMap =
    !bundledResult && canApportion(formData) ? computeApportionedSaleMap(formData) : null;

  /**
   * 단건 환산 프리뷰 게이트 — **공통 §176의2② 경로**(양도가액 × 취득시 기준시가 ÷ 양도시 기준시가)를
   * 타는 자산인가.
   *
   * 엔진의 환산 산식은 자산 종류를 보지 않는다(`transfer-tax-helpers.ts:312-330` —
   * `input.useEstimatedAcquisition`만 판정). 따라서 게이트도 종류 화이트리스트가 아니라
   * **전용 환산 경로를 타는 자산의 제외**로 정의한다. 종전의 `land || housing` 화이트리스트는
   * 같은 산식을 쓰는 `building`·`presale_right`를 근거 없이 «계산 후 표시»에 묶어 두었다.
   *
   * 제외 대상(각자 별도 산식·별도 입력 필드):
   *   · `general_building`   — 토지·건물 파트별 환산(`general-building-valuation.ts`)
   *   · `commercial_building`— §164⑧ 기준시가 조정(`commercial-building-valuation.ts`)
   *   · 재개발·입주권         — §166 인가 전·후 분리
   *   · 겸용주택·다필지·별개취득·부담부증여 — 파트/필지 단위 계산
   *
   * ⚠️ 일반건물·상가는 이 게이트에서 빠지지만 **프리뷰가 없는 것은 아니다** — 각자 전용
   *    엔진 함수를 재사용하는 `transfer-estimated-preview.ts`가 담당한다(아래 `dedicatedPreview`).
   *    여기서 제외하는 것은 「공통 식으로 계산하지 말라」는 뜻이지 「미리 보여주지 말라」가 아니다.
   */
  const primary = formData.assets[0];
  const canPreviewEstimated =
    isSingle &&
    !!primary &&
    primary.useEstimatedAcquisition &&
    !primary.parcelMode &&
    !primary.isMixedUseHouse &&
    (!primary.hasSeperateLandAcquisitionDate || hasStaleSplitInput(primary)) &&
    primary.transferType !== "burdened_gift" &&
    primary.assetKind !== "general_building" &&
    primary.assetKind !== "commercial_building" &&
    !isRedevelopmentPath(primary);

  const rows: TransferAssetSummaryRow[] = formData.assets.map((a, i) => {
    const ratio = ownershipRatioOf(a);
    const fractional = ratio < 1;

    /**
     * 전용 환산 프리뷰(일반건물·상가) — 계산 **전** 산출값. 산식은 재구현하지 않고 route가 쓰는
     * 엔진 함수를 그대로 부른다(`transfer-estimated-preview.ts`). 입력이 덜 찼으면 null이라
     * «계산 후 표시»가 유지된다.
     *
     * 단건 자산에만 적용한다 — 멀티 자산은 양도가액이 안분으로 갈리고 그 안분값이 환산 분자에
     * 들어가므로, 자산 하나만 떼어 계산하면 실제와 다른 값이 나온다.
     */
    const dedicatedPreview =
      isSingle && !result && a.useEstimatedAcquisition && a.transferType !== "burdened_gift"
        ? a.assetKind === "commercial_building"
          ? previewCommercialBuildingEstimated(a, formData)
          : a.assetKind === "general_building"
            ? previewGeneralBuildingEstimated(a, formData)
            : null
        : null;
    // bundled 결과의 primary(주 자산) 엔트리는 route.ts에서 assetId "primary"로 하드코딩됨
    // (companion만 실제 assetId 유지) → i===0 은 "primary"로 매칭. 미러링 누락 시
    // 주 자산이 bundledMatch 실패 → salePending("계산 후 표시")로 잘못 빠짐.
    const bundledAssetId = i === 0 ? "primary" : a.assetId;
    const bundledMatch = bundledResult?.apportionment.apportioned.find((p) => p.assetId === bundledAssetId);
    // 엔진이 이 자산에 **실제로 쓴** 취득가액·필요경비(E-U1 이후 분리 자산도 파트 합) — 취득·경비 두 칸이 같은 축을 읽는다.
    const bundledProperty = bundledResult?.aggregated?.properties?.find((p) => p.propertyId === bundledAssetId);

    /**
     * **자산카드 분해 결과의 귀속** — 일반건물(§166⑥·§104의3 비사업용 분할)은 폼 자산 1건이
     * 엔진에서 여러 자산카드로 쪼개져 돌아온다. 그때 `apportioned[].assetId`는 폼의 assetId가
     * 아니라 **카드 ID**(`land_business`·`land_nbl`·`building` — `general-building-route-cards.ts:200`)라
     * 위 매칭이 반드시 실패한다. 그 결과 계산을 마친 뒤에도 취득가액·필요경비가 «-»로 남았다.
     *
     * 폼 자산이 1건이면 카드 전부가 그 자산의 것이므로 합계로 귀속한다. 멀티 자산에서는
     * 카드↔자산 대응이 성립하지 않으므로 적용하지 않는다(잘못된 자산에 남의 금액이 붙는다).
     */
    const bundledCards =
      isSingle && bundledResult && !bundledMatch
        ? bundledResult.apportionment.apportioned.reduce(
            (acc, p) => ({
              sale: acc.sale + p.allocatedSalePrice,
              acq: acc.acq + p.allocatedAcquisitionPrice,
              exp: acc.exp + p.allocatedExpenses,
            }),
            { sale: 0, acq: 0, exp: 0 },
          )
        : null;

    // ── 양도가액 ──
    let salePrice = 0;
    let salePending = false;
    let saleIsApportioned = false;
    /**
     * 청산금 수령분 **단독 신고** — 신고 단위가 청산금 수령액이다(C1-05).
     *
     * ④가 `transferPrice`를 이 값으로 바꿔 보내므로(다른 모드보다 **우선**한다) 여기서도
     * 체인 맨 앞에 둔다. 술어·인자 모두 ④와 같은 leaf를 쓴다
     * (memory `feedback_shared_predicate_argument_parity`).
     */
    const receiveOnlySalePrice = isReceiveOnlyFiling(a) ? parseRaw(a.redevSettlementAmount) : 0;
    if (receiveOnlySalePrice > 0) {
      salePrice = receiveOnlySalePrice;
    } else if (bundledMatch) {
      salePrice = bundledMatch.allocatedSalePrice;
      saleIsApportioned = bundledMatch.saleMode === "apportioned";
    } else if (bundledCards && bundledCards.sale > 0) {
      // 자산카드 분해(일반건물) — 카드 양도가액 합 = 그 자산의 양도가액. 카드 간 분할은
      // 자산 내부 안분이므로 «기준시가 안분» 라벨은 붙이지 않는다.
      salePrice = bundledCards.sale;
    } else if (apportionedMap && apportionedMap.has(a.assetId)) {
      // 안분 프리뷰 (지분 자산 포함 — 엔진과 동일하게 fixedSalePrice 제외·잔여흡수 반영).
      // 지분 자산은 고정값(«지분 N%»), 비지분 자산은 기준시가 안분값(«기준시가 안분»).
      salePrice = apportionedMap.get(a.assetId)!;
      saleIsApportioned = !fractional;
    } else if (fractional) {
      // 지분 단계취득 (안분 프리뷰 불가 시) — 총액 × 지분 (API :493-495와 일치)
      salePrice = Math.floor(parseRaw(formData.contractTotalPrice) * ratio);
    } else if (formData.bundledSaleMode === "apportioned" && !isSingle) {
      salePending = true; // 기준시가 미입력 등 — «계산 후 표시»
    } else {
      // 실가 모드 · 단일 자산
      salePrice = parseRaw(a.actualSalePrice);
    }

    /**
     * §166 재개발·입주권 — 계산 후 합계 취득가액·필요경비 (C1-04).
     *
     * 신고서·계산명세서가 쓰는 **같은 leaf**를 그대로 쓴다. 파트 합이 아니라 **역산**인 이유는
     * §166이 단계별 의제라 「파트 합 ≠ 양도가액」이 설계상 정상이기 때문이다
     * (`redev-acquisition-inverse.ts` 헤더 주석).
     *
     * 🔴 종전에는 계산 전 «계산 후 표시»를 안내하고도 계산 후 **«-»**가 남았다 —
     *    `directAcqRaw`가 §166 실가 필드만 읽어 환산 모드에서 0이고, fallback이 보는
     *    `estimatedBase`를 §166 결과가 싣지 않기 때문이다(실측: 값은 분기 안에 있었다).
     */
    const redevResultTotals =
      singleResult?.redevelopmentDetail && i === 0
        ? redevFilingTotals(singleResult.redevelopmentDetail, salePrice)
        : null;
    // 청산금 **수령** 동시신고는 신고 단위가 두 개의 양도다 — 사이드바 양도가액도 신고서 합계와
    // 같은 값을 말해야 한다(그러지 않으면 「양도가 = 취득가 + 경비 + 차익」이 사이드바에서 깨진다).
    if (redevResultTotals) salePrice = redevResultTotals.transferPrice;

    // ── 취득가액 ──
    const acqSource = directAcqRaw(a);
    let acqPrice = fractional ? Math.floor(acqSource.value * ratio) : acqSource.value;
    // 미확정 파트·필지가 있으면 계산 후 확정 — 부분합을 총액으로 표시하지 않는다.
    let acqPending = acqSource.pending;
    /** 아래 분기가 이미 감가상각비를 공제한 값을 내는가(일반건물 카드 합) — 이중 공제 방지. */
    let depAlreadyDeducted = false;
    if (mixedResult && i === 0) {
      // 겸용주택: 결과 카드와 같은 단일 소스(B1 파트 모델은 단서 판정 후 실제 차감값).
      acqPrice = mixedUseDisplayedAcqPrice(mixedResult);
    } else if (bundledMatch) {
      acqPrice = bundledMatch.allocatedAcquisitionPrice;
      // 분리(split) 자산은 안분 프리뷰가 아니라 **엔진 echo**(E-U1 — 소유 파트 차감 취득가 합)가 정본이다. 별개 취득은 자산 단위
      // 취득가액 칸이 숨어 프리뷰가 0이고, 아래 필요경비(집계 값)와 축이 갈렸다. 엔진 값은 §97③ 공제 후라 아래에서 또 빼지 않는다.
      if (bundledProperty?.splitDetail) {
        acqPrice = bundledProperty.acquisitionPrice;
        depAlreadyDeducted = true;
      }
    } else if (bundledCards) {
      // 자산카드 분해(일반건물) — 카드별 취득가액 합. 엔진이 실제 쓴 값이라 환산·실가 모두 정확.
      // §97③ 감가상각비는 `buildApportionment`가 이미 공제한 **후** 값이다 — 아래에서 또 빼지 않는다.
      acqPrice = bundledCards.acq;
      acqPending = false;
      depAlreadyDeducted = true;
    } else if (isParcelMode(a) && singleResult?.parcelDetails?.length) {
      // 다필지 — 필지별 결과 취득가액 합(환산 필지 포함). 계산 전 pending을 여기서 해소한다.
      acqPrice = singleResult.parcelDetails.reduce((s, p) => s + p.acquisitionPrice, 0);
      acqPending = false;
    } else if (redevResultTotals) {
      acqPrice = redevResultTotals.acquisition;
      acqPending = false;
    } else if (dedicatedPreview) {
      /**
       * 일반건물·상가 전용 환산 프리뷰 — 계산 후 값과 **같은 엔진 함수**에서 나온다.
       *
       * `acqPrice === 0` 조건 **앞**에 둔다. 환산 모드에서는 자산 전체 실가 칸이 UI에서
       * 숨겨지지만 폼 값은 보존되므로(토글 OFF 시 복원용), stale 실가가 남아 있으면 그것이
       * 표시되어 **계산에 쓰이지 않는 금액**을 보여주게 된다. 환산이 확정한 값이 우선이다.
       */
      acqPrice = dedicatedPreview.acqPrice;
      acqPending = false;
      // 일반건물·상가 프리뷰는 §97③ 감가상각비를 이미 공제한 값이다 — 아래에서 또 빼지 않는다.
      depAlreadyDeducted = true;
    } else if (isSingle && singleResult?.splitDetail?.land?.acquisitionBasis) {
      // D1-4 영 §163⑨ 단서 1호(1990.8.30. 전 상속·증여 토지) — 입력 단계는 max(평가액, 영 §164④ 가액)를 엔진만 알아
      // pending으로 두고(`separateAcqPartsSum`), 결과가 오면 엔진이 실제로 차감한 파트 합을 쓴다(bundled split 분기와 같은 정본).
      acqPrice = summarizeSplitGain(singleResult.splitDetail).acquisitionDeducted;
      acqPending = false;
      depAlreadyDeducted = true;
    } else if (acqPrice === 0 && isSingle) {
      // 단건 fallback 체인 (상속의제 → 계산 결과 환산 → 환산 프리뷰)
      /**
       * A18(2026-09-02): 종전 게이트는 `a.inheritanceMode === "post-deemed" | "pre-deemed"`였는데
       * **`inheritanceMode`는 쓰기 지점이 전 저장소에 0건인 죽은 필드였다** — factory가 null로
       * 만들고 마이그레이션 둘이 undefined를 null로 강제하며, 유일한 읽기 지점도 로컬 파생
       * fallback을 탔다. 도입 시 계획된 「onChange → 자동 결정」이 구현되지 않았다.
       * ⇒ **2026-09-03에 그 필드 자체를 제거했다.** 분기는 이제 상속개시일에서 그때그때
       *   파생된다(`InheritedAcquisitionDeemedSection.computeMode`가 유일한 산출 지점).
       *
       * 그 결과 상속 자산의 사이드바 취득가액이 계산 전후 모두 0이 되어 **「취득가액 -」**로
       * 표시됐다. 결과 화면·신고서에는 값이 나오므로 같은 화면 안에서 어긋났다.
       * 세액은 불변(표시 전용).
       *
       * ⚠️ 취득원인을 **`inheritance`로 좁힌다.** `isSec163_9Cause`는 `inheritance || gift`인데,
       *    증여는 신고가액을 `fixedAcquisitionPrice`(required)에 쓰므로 상위 ⑤ 분기가 이미 값을
       *    돌려 여기 도달조차 하지 않는다 — 그대로 쓰면 항상 0을 읽는 무의미 분기가 된다.
       *
       * ⚠️ 다건 축은 이 체인 자체가 `isSingle` 게이트 안이라 도달하지 않는다(별건).
       */
      // D2(건물 상속·증여 + 토지 매매) — 건물 평가액은 파트 칸이 정본이라 숨은 `publishedValueAtInheritance`를 읽지 않는다(미입력 = pending).
      if (a.acquisitionCause === "inheritance" && a.inheritanceStartDate && !effectiveBuildingCauseMix(a)) {
        // 계산 결과(§163⑨ max(상증법 평가액, §164④~⑦)) 우선, 미계산 시 상증법 평가액 프리뷰
        acqPrice =
          singleResult?.inheritedAcquisitionDetail?.acquisitionPrice ||
          parseRaw(a.publishedValueAtInheritance);
      } else if (singleResult?.usedEstimatedAcquisition) {
        /**
         * §97②2호 **단서**(swap)이면 환산취득가액은 차감되지 않는다 — 취득가액은 **0**이고
         * 필요경비가 자본적지출 + 양도비 전액이다(`transfer-tax-helpers.ts:396`).
         *
         * 🔴 종전에는 swap에서도 `estimatedBase`를 실어 사이드바가 「취득가액 200,000,000 +
         *   필요경비 230,000,000」을 나란히 보여줬다(실측 2026-09-15). 합이 430,000,000이라
         *   실제 차감액 230,000,000과 어긋나고, 같은 화면 결과 탭(취득가액 230,000,000 ·
         *   필요경비 –)과도 축이 달랐다. 0이면 사이드바 정책상 그 행이 표시되지 않는다.
         *
         * 바로 아래 상가(§164⑧) 분기는 같은 교리를 이미 적용하고 있었다 — 환산 분기만 빠졌다.
         */
        acqPrice = singleResult.swapApplied ? 0 : (singleResult.estimatedBase ?? 0);
      } else if (
        singleResult?.commercialBuildingValuationDetail &&
        !singleResult.swapApplied
      ) {
        // 상가·오피스텔(§164⑧) — STEP 0.35가 `useEstimatedAcquisition`을 false로 되돌리므로
        // `usedEstimatedAcquisition`·`estimatedBase`가 비어 위 분기에 걸리지 않는다
        // (`transfer-tax-commercial-step.ts:136` · `transfer-tax.ts:654`). 전용 상세에서 읽는다.
        // §97②2호 swap이 발동하면 환산취득가액 대신 실가 쪽이 채택되므로 제외한다.
        acqPrice = singleResult.commercialBuildingValuationDetail.estimatedAcquisitionTotal;
      } else if (canPreviewEstimated) {
        const stdAcq = parseRaw(a.standardPriceAtAcq);
        // ⑥ §164⑧ 동일조정기간 환산 — 사이드바 추정도 엔진과 **같은 leaf**를 쓴다.
        //    안 쓰면 취득·양도 기준시가가 같은 구간에서 사이드바만 「양도차익 0」을 보여준다.
        const stdTransfer = previewStdPriceAtTransfer(a, formData.transferDate);
        const sale = parseRaw(a.actualSalePrice);
        acqPrice =
          stdAcq > 0 && stdTransfer > 0 && sale > 0
            ? calculateEstimatedAcquisitionPrice(sale, stdAcq, stdTransfer)
            : 0;
      }
      if (acqPrice === 0 && !result && a.useEstimatedAcquisition) acqPending = true;
    } else if (acqPrice === 0 && !result && a.useEstimatedAcquisition) {
      // 멀티 환산 — 프리뷰 미지원
      acqPending = true;
    }

    // §97③ 감가상각비 — 취득가액에서 공제한 값이 엔진이 차감하는 취득가액이다. 위 체인의 값은 전부
    // 공제 **전**(입력 실가·환산 `estimatedBase`·상가 환산 총액·안분액)이라 여기서 한 번만 뺀다.
    // 받을 수 없는 구조(파트별 취득가액 등)는 엔진도 공제하지 않으므로 빼지 않는다(`depreciation-scope.ts`
    // — ⑤·⑧과 같은 술어). swap(§97②2호 단서)은 취득가액이 0이라 뺄 것이 없다.
    if (acqPrice > 0 && !depAlreadyDeducted && !singleResult?.swapApplied && depreciationSupport(a).status === "ok") {
      const depRaw = parseRaw(a.depreciationAmount);
      const dep = fractional ? Math.floor(depRaw * ratio) : depRaw;
      if (dep > 0) acqPrice = Math.max(0, acqPrice - dep);
    }

    // ── 필요경비 ──
    const expBase = directExpenseRaw(a);
    let expense = fractional ? Math.floor(expBase * ratio) : expBase;
    // 다필지에 환산 필지가 섞이면 그 필지의 개산공제(§163⑥)가 계산 후에야 확정된다 —
    // 입력분만 더한 부분합을 총액으로 보이지 않게 pending으로 시작한다.
    let expensePending = isParcelMode(a) && parcelAcqSum(a).pending;
    if (expensePending) expense = 0;
    if (mixedResult && i === 0) {
      // 겸용주택 필요경비 = 주택·상가 각 토지·건물분 개산공제(§163⑥) 합.
      // (swap §97② 발동 시 실제 필요경비와 달라질 수 있음 — 계획서 §6 리스크 참조)
      const { housingPart: h, commercialPart: c } = mixedResult;
      expense =
        h.landAppraisalDed + h.buildingAppraisalDed + c.landAppraisalDed + c.buildingAppraisalDed;
    } else if (bundledMatch) {
      // 엔진이 자산별로 **실제 차감한** 필요경비 — 안분 결과(`allocatedExpenses`)는 입력 경비만
      // 담고 개산공제(§163⑥)는 그 뒤 단건 엔진이 더하므로, 추계 자산에서 0으로 보였다(F-14).
      expense = bundledProperty?.necessaryExpense ?? bundledMatch.allocatedExpenses;
    } else if (bundledCards) {
      // 자산카드 분해(일반건물) — 카드별 필요경비 합(개산공제 포함).
      expense = bundledCards.exp;
    } else if (isParcelMode(a) && singleResult?.parcelDetails?.length) {
      // 다필지 — 필지별 결과 필요경비 합(환산 필지의 개산공제 §163⑥ 포함). pending 해소.
      expense = singleResult.parcelDetails.reduce((s, p) => s + p.expenses, 0);
      expensePending = false;
    } else if (redevResultTotals) {
      // §166 — 분기별 필요경비 합(환산 경로의 §163⑥ 개산공제 포함). 위 역산과 **같은 인자**다.
      expense = redevResultTotals.expenses;
      expensePending = false;
    } else if (dedicatedPreview) {
      // 환산의 필요경비는 개산공제(§163⑥)이지 폼의 자본적지출이 아니다 — §97②2호 swap이
      // 발동한 경우에만 실제 경비가 채택되며, 그 판정도 프리뷰 함수 안에서 끝난다.
      expense = dedicatedPreview.expense;
      expensePending = false;
    } else if (!result && isGbNonActualPart(a)) {
      // 일반건물 파트 모드가 비-actual(환산·감정·매매사례) — 필요경비는 개산공제(§163⑥)뿐이라 파트 자본적지출은 계산에 쓰이지 않는다.
      // 입력분(`landDirectExpenses`+`buildingDirectExpenses`)을 부분합으로 보이면 쓰이지 않는 금액을 보여 준다(A2 §8.2).
      // ⚠️ `dedicatedPreview`(환산 전용 프리뷰) **뒤**에 둔다 — 앞에 두면 환산 프리뷰를 가로채 사이드바 spec 2건이 깨진다.
      expense = 0;
    } else if (isSingle && singleResult) {
      // 계산 후 — 엔진이 **실제 차감한** 필요경비(`expensesApplied`). 환산 본문은 개산공제,
      // §97②2호 단서(swap)는 자본적지출·양도비다. 종전에는 폼에 자본적지출이 남아 있으면 그 합을
      // 보여 엔진과 어긋났다(F-14 실측 7,000,000 ↔ 3,000,000).
      expense = singleResult.expenses ?? 0;
    } else if (!result && isLumpSumMode(a) && isPlainLumpSumAsset(a)) {
      /**
       * 계산 전 개산공제 — 율·절사 모두 **엔진 leaf**(F-14). 종전 `applyRate(stdAcq, 0.03)`은
       * 미등기 0.3%(§163⑥1호 단서)도 §163⑥4호 1%(분양권·입주권)도 보지 못했다.
       *
       * 미등기 축은 엔진이 받는 값과 같아야 한다 — 주 자산은 폼-전역 값(`transfer-tax-api.ts`),
       * 컴패니언은 자산 값(`transfer-tax-api-companion-payload.ts`). 주 자산에 남은 자산 값은 쓰지 않는다.
       * §97②2호 단서(swap)는 환산취득가액이 있어야 판정되므로 계산 후에 확정된다.
       */
      const unregistered = i === 0 ? formData.isUnregistered : a.isUnregistered;
      const rate = estimatedDeductionRate(unregistered, a.assetKind);
      expense = computeEstimatedDeduction(parseRaw(a.standardPriceAtAcq), rate, ratio);
    }
    if (expense === 0 && !result && (isLumpSumMode(a) || isGbNonActualPart(a))) expensePending = true;

    return {
      assetId: a.assetId,
      index: i + 1,
      assetLabel: a.assetLabel,
      assetKind: a.assetKind,
      salePrice,
      acqPrice,
      /**
       * 승계조합원은 종전 부동산을 소유한 적이 없어 「인가 전 분」이 성립하지 않는다 —
       * 두 종류 모두 일반 라벨을 쓴다.
       *   · 완공APT 승계조합원(사례 48, `redevIsSuccessorMember`) — §166 안분 우회
       *   · 입주권 승계조합원(`isSuccessorRightToMoveIn`)          — §166 미적용(§97①1호 가목)
       * 후자를 빠뜨리면 「승계취득가액 + 추가분담금」 합계에 「인가전 분」 라벨이 붙어
       * 화면의 입력 카드와 사이드바가 서로 다른 개념을 가리킨다(2026-08-23 브라우저 실측).
       */
      acqLabel:
        isRedevelopmentPath(a) &&
        a.redevIsSuccessorMember !== "yes" &&
        !isSuccessorRightTransfer(a)
          ? "인가전 분 취득가액"
          : "취득가액",
      expense,
      // 대표 자산은 명부 행 ⑥의 §99의4·§98의9도 칩으로(④와 같은 leaf — 행으로 옮겨도 칩이 사라지지 않게)
      reductionTypes: (i === 0 ? primaryReductionsWithRows(formData) : (a.reductions ?? [])).map((r) => r.type),
      salePending,
      acqPending,
      expensePending,
      saleIsApportioned,
      ownershipRatio: ratio,
    };
  });

  const totalSalePrice = rows.reduce((acc, r) => acc + r.salePrice, 0);
  return { rows, totalSalePrice };
}
