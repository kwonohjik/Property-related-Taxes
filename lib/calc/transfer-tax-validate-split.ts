/**
 * 토지/건물 분리 직접 입력(§166⑥) — 입력 합이 총액을 초과하는지 검증.
 *
 * 계획서: docs/02-design/features/land-building-split-mode-gating-and-salescase-drift.plan.md (Phase B)
 *
 * 엔진 `splitPair`는 한쪽만 입력되면 반대쪽을 **잔액**(총액 − 입력값)으로 도출한다.
 * 입력값이 총액을 넘으면 잔액이 음수가 되는데, 엔진은 clamp하지 않는다(조용한 오답 방지).
 * → 그 모순 입력을 여기서 차단한다.
 *
 * 판정식은 엔진에서 import한 `isSplitPairOverflow` 단일 소스 — validate가 규칙을 재구현하면
 * "UI 통과 ↔ validate 차단" 모순(⑧ 규칙)이 재발한다.
 *
 * ⚠️ **범위 한정**: 총액(엔진 transferPrice·acquisitionPrice)의 폼 매핑은 다분기다
 * (지분 안분·재개발·부담부증여·다필지 — `transfer-tax-api.ts:189-215`). validate에서 그 분기를
 * 재현하면 dual-truth가 되므로, **총액이 자산 필드와 1:1인 단순 경로에서만** 검증한다.
 * 그 외 경로는 미검증(엔진이 음수를 그대로 노출 — 눈에 띄는 이상값).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { isSplitPairOverflow } from "@/lib/tax-engine/transfer-tax-split-gain";
import { getOwnershipRatio } from "./transfer-tax-api-helpers";
import { effectivePartAcqMode } from "./transfer-tax-split-acq-mode";
import { isSeparateAcquisition } from "./transfer-tax-split-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 빈 문자열·0 → undefined (API 변환 `parseAmount(...) || undefined`과 동일 규약) */
function opt(v: string | undefined): number | undefined {
  const n = parseAmount(v ?? "");
  return n > 0 ? n : undefined;
}

/**
 * V1·V2 — 별개 취득 자산의 파트별 취득가액 필수 검증.
 *
 * 토지·건물을 서로 다른 시점에 취득했다면 취득가액은 파트별로 실재하며, 총액에서 잔액을
 * 도출하거나 기준시가 비율로 안분할 법적 근거가 없다(소득세법 §97①1호·§114⑦, 소득령 §176의2③).
 * 엔진이 미입력을 차단하므로(파트별 완결) 여기서 같은 조건을 필드 오류로 먼저 알린다.
 *
 * 환산(estimated)은 총액 미참조 구조(양도가 × 기준시가 비율)라 대상이 아니다.
 * 비소유 파트(`selfOwns≠both`)도 대상이 아니다 — 그 파트의 양도차익은 버려진다.
 */
function validateSeparateAcqParts(asset: AssetForm, label: string): string | null {
  const selfOwns = asset.selfOwns ?? "both";
  const parts = [
    {
      owned: selfOwns !== "building_only",
      name: "토지",
      mode: effectivePartAcqMode(asset.landAcqMode, asset),
      price: asset.landAcquisitionPrice,
      salesCase: asset.landSalesCaseValue,
    },
    {
      owned: selfOwns !== "land_only",
      name: "건물",
      mode: effectivePartAcqMode(asset.buildingAcqMode, asset),
      price: asset.buildingAcquisitionPrice,
      salesCase: asset.buildingSalesCaseValue,
    },
  ];

  for (const p of parts) {
    if (!p.owned) continue;
    if (p.mode === "actual" || p.mode === "appraisal") {
      if (opt(p.price) == null) {
        const what = p.mode === "appraisal" ? "감정가액" : "취득가액";
        return `${label}: ${p.name} ${what}을 입력하세요 — 토지·건물 취득시기가 다르면 나머지 금액에서 자동 계산되지 않습니다(소득세법 §97①1호·§114⑦).`;
      }
    } else if (p.mode === "salesCase") {
      if (opt(p.salesCase) == null) {
        return `${label}: ${p.name} 매매사례가액을 입력하세요 — 매매사례 탐색 기간이 파트별 취득일 전후 3개월로 서로 달라 총액을 안분할 수 없습니다(소득령 §176의2③1호).`;
      }
    }
  }
  return null;
}

/**
 * 분리 직접 입력 초과 검증. 오류 메시지 또는 null.
 *
 * 검증 대상 게이트 — UI가 양도가액 직접입력 칸을 노출하는 조건과 동일:
 *   `hasSeperateLandAcquisitionDate && saleSplitMode === "actual"`
 */
export function validateSplitDirectInputs(asset: AssetForm, label: string): string | null {
  if (!asset.hasSeperateLandAcquisitionDate) return null;

  // ── V1·V2. 별개 취득 — 취득가액 파트별 필수 (함수 최상단 필수) ──────────────
  // 아래 §7.2 검증과 `saleSplitMode !== "actual"` early-return(:57 상당)·`skipTotals`(지분·
  // 부담부증여·재개발 제외)보다 **앞**에 둔다. 뒤에 놓으면 그 경로들이 미검증이 되어,
  // 엔진의 파트별 필수 차단(transfer-tax-split-gain.ts calcOnePart → TaxCalculationError)이
  // 필드 오류가 아니라 계산 실패로만 보인다(⑧ 규칙 — UI 통과 ↔ 엔진 차단 모순).
  //
  // 엔진 게이트와 **같은 헬퍼**로 판정한다 — 재구현하면 dual-truth가 된다.
  if (isSeparateAcquisition(asset)) {
    const partErr = validateSeparateAcqParts(asset, label);
    if (partErr) return partErr;
  }

  // §7.2 양도시 기준시가 필수 검증 (2026-07-28 사용자 확정 — feedback_no_silent_apportion_fallback):
  // apportioned(일괄양도) 안분 또는 estimated(환산) 파트는 **양도시 토지·건물 기준시가**로 안분/환산한다
  // (§166⑥→부가세령§64①1호 "양도 당시 기준시가"). 미입력 시 엔진이 취득시 비율(landRatio)로 조용히
  // 대체하나(split-gain.ts:147-150,256), 이는 사용자가 일괄양도/환산을 선택했는데 법령과 다른 결과를
  // 내는 자동 안분 fallback이므로 **여기서 차단**한다(사용자 입력 강제 — 조용한 대체 대신 명시 오류).
  // 조건부 차단이라 엔진 fallback 경로는 이 게이트로 도달이 막히고, actual/legacy 경로는 불변(⑧ 모순 없음).
  const landMode = effectivePartAcqMode(asset.landAcqMode, asset);
  const buildingMode = effectivePartAcqMode(asset.buildingAcqMode, asset);
  const needsTransferStd =
    asset.saleSplitMode === "apportioned" || landMode === "estimated" || buildingMode === "estimated";
  if (needsTransferStd) {
    const landStd = opt(asset.landStandardPriceAtTransfer);
    const buildingStd = opt(asset.buildingStandardPriceAtTransfer);
    if (landStd == null || buildingStd == null) {
      return `${label}: 일괄양도 안분·환산취득가 계산에는 토지·건물 양도시 기준시가가 필요합니다(§166⑥ 양도 당시 기준시가). 국세청 홈택스 기준시가 조회 후 입력하세요.`;
    }
  }

  if (asset.saleSplitMode !== "actual") return null;

  // ── 총액이 자산 필드와 1:1이 아닌 경로는 미검증(위 ⚠️ 참조) ──
  // 지분 판정은 API 정본(`transfer-tax-api.ts:140` primaryFractional = getOwnershipRatio(primary) < 1.0)과
  // 동일 헬퍼 재사용 — 기본 자산은 100/100이라 "필드 존재 여부"로 판정하면 항상 지분 모드가 된다.
  const skipTotals =
    asset.transferType === "burdened_gift" ||
    asset.assetKind === "redevelopment_apt" ||
    getOwnershipRatio(asset) < 1.0;

  // ① 양도가액 — 총액 = actualSalePrice (단건 자산 카드 입력)
  if (!skipTotals) {
    const totalTransfer = parseAmount(asset.actualSalePrice ?? "");
    if (totalTransfer > 0) {
      const land = opt(asset.landTransferPrice);
      const building = opt(asset.buildingTransferPrice);
      if (isSplitPairOverflow(totalTransfer, land, building)) {
        return land != null && building != null
          ? `${label}: 토지·건물 양도가액의 합이 양도가액(${totalTransfer.toLocaleString()}원)을 초과합니다.`
          : `${label}: ${land != null ? "토지" : "건물"} 양도가액이 양도가액(${totalTransfer.toLocaleString()}원)을 초과합니다 — 나머지가 음수가 됩니다.`;
      }
    }
  }

  // ② 취득가액 — 실거래가·감정가액 모드만(환산·매매사례는 총액을 사용자가 입력하지 않는다)
  // ⚠️ **별개 취득은 제외**(V4): 취득가액 축에서 잔액 규칙 자체가 폐지돼 "합 = 총액" 불변식이
  //    성립하지 않는다. 파트 합이 상단 총액과 달라도 정상이며(총액은 사후 집계일 뿐),
  //    잔존한 `fixedAcquisitionPrice`로 차단하면 정당한 입력이 막힌다.
  const isEstimated = asset.useEstimatedAcquisition === true;
  const isSalesCase = asset.isSalesCaseAcquisition === true;
  if (!skipTotals && !isEstimated && !isSalesCase && !isSeparateAcquisition(asset)) {
    const totalAcq = parseAmount(asset.fixedAcquisitionPrice ?? "");
    if (totalAcq > 0) {
      const land = opt(asset.landAcquisitionPrice);
      const building = opt(asset.buildingAcquisitionPrice);
      if (isSplitPairOverflow(totalAcq, land, building)) {
        return land != null && building != null
          ? `${label}: 토지·건물 취득가액의 합이 취득가액(${totalAcq.toLocaleString()}원)을 초과합니다.`
          : `${label}: ${land != null ? "토지" : "건물"} 취득가액이 취득가액(${totalAcq.toLocaleString()}원)을 초과합니다 — 나머지가 음수가 됩니다.`;
      }
    }
  }

  // ③ 자본적지출 — 총액은 **`directExpenses`**(엔진 `input.expenses`의 실제 소스,
  //    transfer-tax-api.ts:224-229)다. `capitalExpenditure`가 아니다 — 그걸 총액으로 보면
  //    판정식만 공유하고 **피연산자가 달라져** 단일 소스가 무효화된다(validate 통과 ↔ 엔진 음수).
  //    `directExpenses`는 deprecated(legacy 마이그레이션 전용)라 신규 입력에선 0 → 엔진도
  //    총액 0일 때 잔액 규칙을 쓰지 않고 독립 입력으로 처리하므로 모순 자체가 발생하지 않는다.
  const totalExp = parseAmount(asset.directExpenses ?? "");
  if (totalExp > 0) {
    const land = opt(asset.landDirectExpenses);
    const building = opt(asset.buildingDirectExpenses);
    if (isSplitPairOverflow(totalExp, land, building)) {
      return `${label}: 토지·건물 자본적지출이 총 자본적지출(${totalExp.toLocaleString()}원)과 맞지 않습니다.`;
    }
  }

  return null;
}
