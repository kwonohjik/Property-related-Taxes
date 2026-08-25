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

import type { TransferFormData } from "./calc-wizard-store";
import type { AssetForm } from "./calc-wizard-asset";
import type { ReductionType } from "./calc-wizard-asset-reduction";
import type { TransferAPIResult } from "@/lib/calc/transfer-tax-api";
import { isSeparateAcquisition, separateAcqPartsSum } from "@/lib/calc/transfer-tax-split-acq-mode";
import {
  isSuccessorRightTransfer,
  successorRightAcquisitionTotal,
  successorRightEstimationMode,
} from "@/lib/calc/transfer-successor-right";
import { isReceiveOnlyFiling } from "@/lib/calc/redev-field-scope";
import { redevBranchTotals } from "@/components/calc/results/transfer/redev-acquisition-inverse";
import { inverseRedevAcquisition } from "@/components/calc/results/transfer/redev-acquisition-inverse";
import type { BundledAssetInput, BundledAssetKind } from "@/lib/tax-engine/types/bundled-sale.types";
import { apportionBundledSale } from "@/lib/tax-engine/bundled-sale-apportionment";
import { calculateEstimatedAcquisitionPrice, applyRate } from "@/lib/tax-engine/tax-utils";
import { previewCommercialBuildingEstimated } from "@/lib/calc/transfer-estimated-preview";
import { previewGeneralBuildingEstimated } from "@/lib/calc/transfer-estimated-preview";
import { buildSameAdjustmentPeriodInput } from "@/lib/calc/transfer-same-adjustment-period-input";
import { replotIncrementStdPriceAtTransfer } from "@/lib/calc/replot-increment-std-price";
import { calcStdPriceMonths, classifySameAdjustmentPeriod, calcSameAdjustmentPeriodStdPrice } from "@/lib/tax-engine/same-adjustment-period-std-price";
import { postApprovalExpensesInScope } from "@/lib/calc/redev-field-scope";

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

function parseRaw(v: string | undefined): number {
  return parseInt((v ?? "").replace(/[^0-9]/g, "") || "0", 10);
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

/** 다필지 경로(§166⑥ 필지별 계산) 활성 판정 — API `transfer-tax-api.ts:140-141`과 동일 조건. */
function isParcelMode(a: AssetForm): boolean {
  return !!a.parcelMode && a.assetKind === "land" && (a.parcels?.length ?? 0) > 0;
}

/** 재개발·입주권(§166) 경로 판정 — API `transfer-tax-api.ts:175-176`(`isRedevelopment`)과 동일 조건. */
function isRedevelopmentPath(a: AssetForm): boolean {
  return a.assetKind === "redevelopment_apt" || a.assetKind === "right_to_move_in";
}

/**
 * 다필지 취득가액 합 — API `transfer-tax-api.ts:584`(`parcels[].acquisitionPrice`)와 같은 소스.
 *
 * 환산(`acquisitionMethod === "estimated"`) 필지는 API가 금액을 보내지 않고 엔진이 기준시가로
 * 산정하므로 계산 후에야 확정된다 → `pending`. 미확정 필지가 있으면 부분합을 총액으로 표시하지
 * 않는다(`separateAcqPartsSum`과 같은 정책 — 부분합 오독 차단).
 */
function parcelAcqSum(a: AssetForm): { sum: number; pending: boolean } {
  let sum = 0;
  let pending = false;
  for (const p of a.parcels ?? []) {
    if (p.acquisitionMethod === "estimated") {
      pending = true;
      continue;
    }
    const v = parseRaw(p.acquisitionPrice);
    if (v <= 0) pending = true;
    sum += v;
  }
  return { sum, pending };
}

/** 다필지 필요경비 합 — 필지별 자본적지출 + 양도비 (legacy 단일 `expenses` fallback). */
function parcelExpenseSum(a: AssetForm): number {
  return (a.parcels ?? []).reduce((acc, p) => {
    const split = parseRaw(p.capitalExpenditure) + parseRaw(p.transferExpense);
    return acc + (split > 0 ? split : parseRaw(p.expenses));
  }, 0);
}

/**
 * 자산별 직접 취득가액 base (지분 ratio 적용 전 raw) + 미확정 여부.
 *
 * **분기 순서·소스는 API 변환(`transfer-tax-api.ts:277-289` `acquisitionPrice`)의 정본을 미러링**한다 —
 * 자산 종류마다 취득가액을 담는 필드가 다르고, 사이드바가 자기 규칙을 세우면 표시값과 실제
 * 계산값이 갈린다(memory `feedback_ui_engine_dual_truth_avoidance`).
 *
 * 미확정(환산·미입력 파트)이 있으면 0 + `pending`을 돌려 fallback 체인으로 넘긴다 —
 * 부분합을 합계로 표시하면 총액으로 오독된다.
 */
function directAcqRaw(a: AssetForm): { value: number; pending: boolean } {
  // ①-0 승계조합원 입주권 — §166 미적용(§97①1호 가목).
  //     ①보다 **앞**에 둔다 — `isRedevelopmentPath`가 assetKind만 보므로 순서를 바꾸면
  //     승계 자산이 §166 필드(빈 값)를 읽어 0으로 표시된다. API 변환의 분기 순서와 동일.
  //
  // 🔴 2026-08-26 정정(U2-04): 종전에는 **산정 방식과 무관하게** 실가 2칸 합을 확정값으로
  //    표시했다. 산정 방식 라디오는 boolean 3개만 뒤집고 실가 2칸을 비우지 않으므로(전용 필드를
  //    비우는 것은 「조합원 유형」 토글뿐), 환산으로 바꾸면 화면에서 사라진 값이 사이드바에만
  //    남았다 — ④는 `acquisitionPrice: 0`을 보내고 §165① 기준시가로 환산한다
  //    (실측 사이드바 500,000,000 vs 엔진 환산취득가 200,000,000).
  //    ⇒ ④와 **같은 술어**(`successorRightEstimationMode`)로 갈래를 나눈다.
  if (isSuccessorRightTransfer(a)) {
    switch (successorRightEstimationMode(a)) {
      case "actual":
        return { value: successorRightAcquisitionTotal(a), pending: false };
      // ④ `similarSalesValue`(영 §176의2③1호) — 승계는 §166을 안 타므로 추계 3종이 열린다.
      case "salesCase":
        return { value: parseRaw(a.similarSalesValue), pending: false };
      // ④ `appraisalValue`(영 §176의2③2호)는 `fixedAcquisitionPrice`를 싣는다.
      case "appraisal":
        return { value: parseRaw(a.fixedAcquisitionPrice), pending: false };
      // 환산(영 §176의2②2호)은 계산 후 확정 — 0을 돌려 공통 fallback 체인의
      // 「미계산 + 환산 → pending」 규칙에 맡긴다(여기서 pending을 세우면 계산 후에도 남는다).
      case "estimated":
        return { value: 0, pending: false };
    }
  }
  // ① 재개발·입주권 — 상단 일반 취득가액 칸이 숨겨지고 §166 섹션 전용 필드를 쓴다.
  //    승계조합원(사례 48)만 자산 카드 `fixedAcquisitionPrice` (API :283-286).
  if (isRedevelopmentPath(a)) {
    const v =
      a.redevIsSuccessorMember === "yes"
        ? parseRaw(a.fixedAcquisitionPrice)
        : parseRaw(a.redevActualAcquisitionPrice);
    return { value: v, pending: false };
  }
  // ② 다필지 — 자산 전체 취득가액이 없고 필지별로 실재한다 (API :277 `parcelModeActive` → 0 송신).
  if (isParcelMode(a)) {
    const { sum, pending } = parcelAcqSum(a);
    return { value: pending ? 0 : sum, pending };
  }
  // ③ 별개 취득(토지·건물 취득시기 상이) — 자산 전체 칸이 숨겨져 파트 합계가 정본.
  if (isSeparateAcquisition(a)) {
    const { sum, pending } = separateAcqPartsSum(a);
    return { value: pending ? 0 : sum, pending };
  }
  // ④ 매매사례가액
  if (a.isSalesCaseAcquisition) return { value: parseRaw(a.similarSalesValue), pending: false };
  // ⑤ 자산 전체 실가. 비어 있는데 파트별 실가가 있으면(일반건물 토지·건물 개별 입력) 파트 합계.
  //    자산 전체 값이 있으면 그쪽이 우선 — stale 파트 값에 밀리지 않게 한다.
  const fixed = parseRaw(a.fixedAcquisitionPrice);
  if (fixed > 0) return { value: fixed, pending: false };
  if (parseRaw(a.landAcquisitionPrice) > 0 || parseRaw(a.buildingAcquisitionPrice) > 0) {
    const { sum, pending } = separateAcqPartsSum(a);
    return { value: pending ? 0 : sum, pending };
  }
  return { value: 0, pending: false };
}

/**
 * 자산별 직접 필요경비 base (지분 ratio 적용 전 raw).
 *
 * 취득가액과 같은 이유로 자산 종류별 소스가 다르다 — 재개발은 §166 인가 전·후 분리 입력,
 * 다필지는 필지별, 일반건물은 토지·건물 파트별.
 */
function directExpenseRaw(a: AssetForm): number {
  // 재개발·입주권 — API `transfer-tax-api-redev.ts`: 인가전 + (인가후 + 자본적지출 + 양도비)
  // ⚠️ 인가후 분은 **승계조합원 축에서만** 합산한다 — API가 같은 술어로 게이트하므로(U1-02)
  //    여기서만 더하면 사이드바가 계산에 쓰이지 않는 금액을 보여준다.
  if (isRedevelopmentPath(a)) {
    return (
      parseRaw(a.redevPreApprovalExpenses) +
      (postApprovalExpensesInScope(a) ? parseRaw(a.redevPostApprovalExpenses) : 0) +
      parseRaw(a.capitalExpenditure) +
      parseRaw(a.transferExpense)
    );
  }
  if (isParcelMode(a)) return parcelExpenseSum(a);
  const split = parseRaw(a.capitalExpenditure) + parseRaw(a.transferExpense);
  if (split > 0) return split;
  const partSplit = parseRaw(a.landDirectExpenses) + parseRaw(a.buildingDirectExpenses);
  if (partSplit > 0) return partSplit;
  return parseRaw(a.directExpenses);
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

  const acqDate = new Date(`${a.acquisitionDate}T00:00:00`);
  const tsfDate = new Date(`${transferDate}T00:00:00`);
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
    !primary.hasSeperateLandAcquisitionDate &&
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
        ? redevBranchTotals(singleResult.redevelopmentDetail)
        : null;

    // ── 취득가액 ──
    const acqSource = directAcqRaw(a);
    let acqPrice = fractional ? Math.floor(acqSource.value * ratio) : acqSource.value;
    // 미확정 파트·필지가 있으면 계산 후 확정 — 부분합을 총액으로 표시하지 않는다.
    let acqPending = acqSource.pending;
    if (mixedResult && i === 0) {
      // 겸용주택: 주택+상가 환산취득가액 합(전용 필드, 라벨 파싱 아님).
      acqPrice =
        mixedResult.housingPart.estimatedAcquisitionPrice +
        mixedResult.commercialPart.estimatedAcquisitionPrice;
    } else if (bundledMatch) {
      acqPrice = bundledMatch.allocatedAcquisitionPrice;
    } else if (bundledCards) {
      // 자산카드 분해(일반건물) — 카드별 취득가액 합. 엔진이 실제 쓴 값이라 환산·실가 모두 정확.
      acqPrice = bundledCards.acq;
      acqPending = false;
    } else if (isParcelMode(a) && singleResult?.parcelDetails?.length) {
      // 다필지 — 필지별 결과 취득가액 합(환산 필지 포함). 계산 전 pending을 여기서 해소한다.
      acqPrice = singleResult.parcelDetails.reduce((s, p) => s + p.acquisitionPrice, 0);
      acqPending = false;
    } else if (redevResultTotals) {
      acqPrice = inverseRedevAcquisition({
        totalTransferPrice: salePrice,
        totalExpenses: redevResultTotals.expenses,
        totalGain: redevResultTotals.gain,
      });
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
    } else if (acqPrice === 0 && isSingle) {
      // 단건 fallback 체인 (상속의제 → 계산 결과 환산 → 환산 프리뷰)
      if (a.inheritanceMode === "post-deemed" && a.inheritanceStartDate) {
        // 계산 결과(§163⑨2호 max(상증법 평가액, §164⑦)) 우선, 미계산 시 상증법 평가액(엔진 실경로) 프리뷰
        acqPrice =
          singleResult?.inheritedAcquisitionDetail?.acquisitionPrice ||
          parseRaw(a.publishedValueAtInheritance);
      } else if (
        a.inheritanceMode === "pre-deemed" &&
        a.inheritanceStartDate &&
        singleResult?.inheritedAcquisitionDetail
      ) {
        acqPrice = singleResult.inheritedAcquisitionDetail.acquisitionPrice || 0;
      } else if (singleResult?.usedEstimatedAcquisition) {
        acqPrice = singleResult.estimatedBase ?? 0;
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
      expense = bundledMatch.allocatedExpenses;
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
    } else if (expense === 0 && isSingle) {
      if (singleResult) {
        expense = singleResult.expenses ?? 0;
      } else if (canPreviewEstimated) {
        const stdAcq = parseRaw(a.standardPriceAtAcq);
        const stdTransfer = parseRaw(a.standardPriceAtTransfer);
        const sale = parseRaw(a.actualSalePrice);
        const est =
          stdAcq > 0 && stdTransfer > 0 && sale > 0
            ? calculateEstimatedAcquisitionPrice(sale, stdAcq, stdTransfer)
            : 0;
        expense = est > 0 ? applyRate(stdAcq, 0.03) : 0;
      }
      if (
        expense === 0 &&
        !result &&
        (a.useEstimatedAcquisition || a.isAppraisalAcquisition)
      ) {
        expensePending = true;
      }
    } else if (
      expense === 0 &&
      !result &&
      (a.useEstimatedAcquisition || a.isAppraisalAcquisition)
    ) {
      expensePending = true;
    }

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
      reductionTypes: (a.reductions ?? []).map((r) => r.type),
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
