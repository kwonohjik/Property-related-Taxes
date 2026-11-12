/**
 * 부담부증여 이월과세 「당초 증여자」 필수 칸 판정 — `transfer-tax-validate-bg.ts`에서 분리(800줄 정책 · 소유자 분리 PR-3).
 * 판정 내용은 분리 전과 같다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { bgCoDonorNeedsStdPrice } from "./burdened-gift-acq-std-price";
import { bgCollateralForcesStdAcq } from "./burdened-gift-collateral-win";
import { BG_PRESUMED_LABEL, bgPresumedInputKind, isBgPresumedMethod } from "./burdened-gift-presumed-acquisition";
import { bgCarryoverParts } from "./bg-carryover-parts";
import { bgHouseSplitActive } from "./bg-house-split";
import type { IssueField } from "./transfer-tax-validate-field";

/**
 * 이월과세 「당초 증여자」 한 벌 중 **모드별 필수 칸이 비었는지** 판정한다 (D-7b).
 *
 * ## ⚠️ 엔진과 **같은 규칙**이어야 한다
 *
 * 판정 기준은 `lib/tax-engine/transfer-tax-carryover-burdened-gift.ts`의
 * `describeRequiredDonorFields()`와 1:1로 맞춰져 있다. 어긋나면 「UI는 통과시키는데 엔진이
 * throw」하거나 그 반대가 된다(메모리 `feedback_validation_sync_8th_point`).
 *
 * ⚠️ **0은 미입력이 아니다.** 건물이 없는 토지 자산은 건물 기준시가를 `0`으로 명시해야 하고,
 *    그때 `parseAmount("0")`은 0을 돌려준다. 그래서 판정은 **빈 문자열 검사**로 한다
 *    (`parseAmount(v) > 0`으로 쓰면 사용자가 넣은 0이 미입력으로 둔갑한다).
 *
 * @returns 비어 있는 항목의 한국어 라벨 | null (전부 채워짐)
 */
export function missingCoDonorBasisLabel(asset: AssetForm): { label: string; field: IssueField } | null {
  const filled = (v: string | undefined) => v !== undefined && v.trim() !== "";

  // K-1~K-3(기준시가 모드) · K-5(환산) — 둘 다 취득시 기준시가 두 칸을 쓴다.
  //   K-5에 전용 칸을 두지 않는 것은 환산이 **이 칸을 분자로** 자동 추종하기 때문이다(이중 진실 방지).
  // K-6/K-7 — 개산공제 base로 같은 두 칸이 필요하다(필요경비는 개산공제만).
  // 담보 승 — 두 시나리오 모두 취득시 기준시가를 읽고 당초 증여자의 매매사례가액·감정가액은 읽히지 않는다(⑤가 그 칸을 숨기고 엔진도 요구하지 않는다).
  const isPresumed =
    asset.bgValuationMode === "sangjeungbeop_market" && isBgPresumedMethod(asset.bgAcquisitionMethod) && !bgCollateralForcesStdAcq(asset);
  const needsStdPrice = bgCoDonorNeedsStdPrice(asset);
  if (isPresumed) {
    const methodLabel = BG_PRESUMED_LABEL[asset.bgAcquisitionMethod as "salesCase" | "appraisal"];
    const kind = bgPresumedInputKind(asset);
    if (kind === "total") {
      if (!filled(asset.bgCoDonorPresumedAcquisitionTotal)) return { label: methodLabel, field: "bgCoDonorPresumedAcquisitionTotal" };
    } else {
      // 두 칸이면 증여받은 파트의 칸을 모두 요구한다 — 비운 쪽은 시나리오 A 취득가액 0이다(한 파트만이면 다른 파트 칸은 화면에 없다).
      const coParts = kind === "split" ? bgCarryoverParts(asset) : { land: true, building: false };
      if (coParts.land && !filled(asset.bgCoDonorPresumedAcquisitionLand)) return { label: methodLabel, field: "bgCoDonorPresumedAcquisitionLand" };
      if (coParts.building && !filled(asset.bgCoDonorPresumedAcquisitionBuilding)) return { label: methodLabel, field: "bgCoDonorPresumedAcquisitionBuilding" };
    }
  }
  // 증여받은 파트의 칸만 요구한다 — 한 파트만이면 다른 파트 칸은 화면에 없다(⑤ · 엔진 `describeRequiredDonorFields`와 같은 조건).
  const parts = bgCarryoverParts(asset);
  if (needsStdPrice) {
    const landEmpty = parts.land && !filled(asset.bgCoDonorLandStdPriceAtAcq);
    const buildingEmpty = parts.building && !filled(asset.bgCoDonorBuildingStdPriceAtAcq);
    if (landEmpty || buildingEmpty) {
      // 입력칸 이동 — 빈 쪽(토지 먼저)
      return {
        label: parts.land && parts.building ? "취득 당시 토지·건물 기준시가" : parts.land ? "취득 당시 토지 기준시가" : "취득 당시 건물 기준시가",
        field: landEmpty ? "bgCoDonorLandStdPriceAtAcq" : "bgCoDonorBuildingStdPriceAtAcq",
      };
    }
    return null;
  }

  // K-4(시가 + 실지취득가액)
  if (asset.bgAcquisitionMethod === "actual") {
    /**
     * 🔴 토지 자산은 **토지 칸 하나로 충족**한다(2026-09-30 B1). 화면은 토지 칸만 렌더하고(건물·총액 칸 없음)
     *    건물 부분이 없는 것은 사실이다 — ④가 건물을 0으로 싣는다(`buildCarryoverDonorBasis`).
     *    종전에는 「분리 2칸 또는 총액」을 요구해 채울 칸 없는 영구 차단이었다.
     *    양도인 K-4(위 `validateBurdenedGiftAsset`)도 토지는 토지 칸만 요구한다.
     */
    // 주택·건물은 토글 C가 켜져 있을 때만 토지·건물 칸이 있고 ④가 싣는다 — 켰다 끈 뒤 남은 값으로 통과시키지 않는다(2026-10-27 실측: 통과 → 서버 400).
    const houseSplit = bgHouseSplitActive(asset);
    const partsOnScreen = (asset.assetKind !== "housing" && asset.assetKind !== "building") || houseSplit;
    const hasSplit = partsOnScreen &&
      (!parts.land || filled(asset.bgCoDonorActualAcquisitionLand)) &&
      (asset.assetKind === "land" || !parts.building || filled(asset.bgCoDonorActualAcquisitionBuilding));
    // 한 파트만이면 총액은 파트를 가를 수 없다(엔진이 거부 · Q-4) — 일반건물 화면에는 총액 칸이 없다.
    //   주택·건물 토지·건물 취득일 다름(토글 C)도 총액 칸이 없다(`validateBgHouseSplit`이 두 칸을 요구한다).
    const hasTotal = parts.land === parts.building && !houseSplit && filled(asset.bgCoDonorActualAcquisitionTotal);
    if (!hasSplit && !hasTotal) {
      // 입력칸 이동 — 화면은 자산 종류로 칸을 가른다(일반건물·토지·토지·건물 분리 주택 = 토지·건물 분리, 그 외 = 총액)
      const splitUi = asset.assetKind === "general_building" || asset.assetKind === "land" || houseSplit;
      const landEmpty = parts.land && !filled(asset.bgCoDonorActualAcquisitionLand);
      return {
        label: "실지취득가액(토지·건물 분리 또는 단일 총액)",
        // 건물 칸은 일반건물에만 렌더된다 — 토지는 토지 칸
        field: !splitUi ? "bgCoDonorActualAcquisitionTotal" : landEmpty || asset.assetKind === "land" ? "bgCoDonorActualAcquisitionLand" : "bgCoDonorActualAcquisitionBuilding",
      };
    }
    return null;
  }

  // legacy — 시가 모드인데 산정방식을 고르지 않은 경우.
  //   (K-6/K-7은 여기로 오지 않는다 — `validateBurdenedGiftAsset` (1-b)가 같은 자산을 앞에서 차단한다.)
  if (!filled(asset.bgCoDonorMarketValueAtAcquisition)) {
    return { label: "취득 당시 시가 평가액", field: "bgCoDonorMarketValueAtAcquisition" };
  }
  return null;
}
