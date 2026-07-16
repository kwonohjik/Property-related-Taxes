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
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 빈 문자열·0 → undefined (API 변환 `parseAmount(...) || undefined`과 동일 규약) */
function opt(v: string | undefined): number | undefined {
  const n = parseAmount(v ?? "");
  return n > 0 ? n : undefined;
}

/**
 * 분리 직접 입력 초과 검증. 오류 메시지 또는 null.
 *
 * 검증 대상 게이트 — UI가 분리 칸을 노출하는 조건과 동일:
 *   `hasSeperateLandAcquisitionDate && landSplitMode === "actual"`
 */
export function validateSplitDirectInputs(asset: AssetForm, label: string): string | null {
  if (!asset.hasSeperateLandAcquisitionDate) return null;
  if (asset.landSplitMode !== "actual") return null;

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
  const isEstimated = asset.useEstimatedAcquisition === true;
  const isSalesCase = asset.isSalesCaseAcquisition === true;
  if (!skipTotals && !isEstimated && !isSalesCase) {
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
