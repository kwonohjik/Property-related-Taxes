/**
 * 부담부증여(burdened gift) 자산-수준 validation.
 *
 * transfer-tax-validate.ts 800줄 정책으로 분리 (2026-05-12 Phase 3 후속).
 *
 * 책임:
 *  (1) propertyType 지원 범위 (housing·land·building·general_building·commercial_building)
 *  (2) 평가 모드 선택 필수
 *  (3) 인수 채무 입력 필수 (보증금 + 차입금 ≥ 1)
 *  (4) 시가 모드 — 양도시·취득시 시가 평가액 필수, B/C > 1 차단 (상증법 §47③)
 *  (5) Phase 3 — donorRelation 필수 (silent default 회피)
 *  (6) Phase 3 — 사전증여 행 부분 입력 차단 (silent drop 회피)
 *
 * 기준시가 모드 B/C > 1 검사는 엔진 `assertBurdenedGiftEligible()`에서 fail-fast.
 *
 * 호환성: 레거시 `acquisitionCause === "burdened_gift"`는 normalize에서 transferType로 이전.
 *
 * @returns 차단 메시지 (검증 실패 시) | null (통과)
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { getOwnershipRatio } from "./transfer-tax-api-helpers";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { needsBgAcqStdPriceInput, resolveBgAcqStdPrice } from "./burdened-gift-acq-std-price";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const SUPPORTED_KINDS = [
  "housing",
  "land",
  "building",
  "general_building",
  "commercial_building",
];

export function validateBurdenedGiftAsset(
  asset: AssetForm,
  label: string,
  /**
   * 컴패니언(다른 물건) 함께 부담부증여 — **증여계약 전체의 인수 채무 합계**.
   *
   * 🔑 이 축에서는 **채무가 0인 자산이 정상**이다. 근저당이 물건 하나에만 설정된 채로
   *    두 물건을 함께 부담부증여하면 다른 물건의 입력 채무는 0이지만, 소령 §159①의 B/C는
   *    **증여계약 단위**라 그 물건도 양도가액을 갖는다(④가 자산가액 비율로 재배분한다).
   *    자산별로 「채무 > 0」을 요구하면 그 조합이 통째로 막힌다.
   *
   * ⇒ 이 값이 주어지면 (3) 필수 검사를 **신고 단위 합계**로 판정한다. 단건·축 B에서는
   *   undefined이므로 종전 자산별 판정이 그대로다.
   */
  contractAssumedDebtTotal?: number,
): string | null {
  const isBurdenedGift =
    asset.transferType === "burdened_gift" ||
    asset.acquisitionCause === "burdened_gift";
  if (!isBurdenedGift) return null;

  // (1) F-3 (2026-05-12): commercial_building 확장
  if (!SUPPORTED_KINDS.includes(asset.assetKind)) {
    return `${label}: 부담부증여는 주택·토지·건물·일반건물·상업용건물·오피스텔 자산에서만 지원됩니다 (현재: ${asset.assetKind}).`;
  }

  /**
   * (1-b) ✅ **이월과세(증여) 조합 지원 개시** (2026-08-10 D-7b) — 종전 차단을 **해제한다**.
   *
   * ## 근거 — 국세청 재산세과-1059(2009.12.18.)
   *
   * > 「거주자가 배우자로부터 부동산을 증여받은 후 (기간 내에) 다시 그 배우자에게 증여받은
   * >   부동산을 **부담부증여**하는 경우로서 「소득세법 시행령」 **제159조 제1호에 따른
   * >   취득가액 산정 시** 「소득세법」 제97조 제1항 제1호에 따른 가액에 배우자
   * >   **이월과세 규정이 적용되는 것임**」
   *
   * ⇒ §159①1호 **A의 기준 시점이 「양도인의 취득 당시」 → 「당초 증여자의 취득 당시」로 옮겨진다.**
   *
   * ## 종전에 왜 막았고, 무엇이 바뀌었나
   *
   * 종전에는 §159가 `burdenedGiftInfo`에서 취득가액을 따로 구해 **이월과세 입력이 계산에
   * 도달하지 않았다**(실측: 취득원인 4종 모두 71,260,000). D-7a가 세 축을 배선했다:
   *   · 취득가액(§97의2①1호) — `carryoverDonorBasis`를 §159에 주입
   *   · 증여세 상당액(①3호)  — 채무비율 안분 후 한도(시행령 §163의2②)로 필요경비 산입
   *   · 보유기간(§95④ 단서)  — 종전부터 반영
   *
   * ## 그래서 여기서 지키는 것은 「차단」이 아니라 **「두 벌 모두 입력」**이다
   *
   * §97의2②3호 비교는 **양도인 기준**(시나리오 B)과 **당초 증여자 기준**(시나리오 A)을
   * 동시에 요구한다. ❌ 미입력 시 양도인 값으로 fallback하면 시나리오 A = B가 되어
   * §97의2가 **조용히 무력화**된다(`feedback_no_silent_apportion_fallback`).
   *
   * 설계: `docs/02-design/features/burdened-gift-carryover-159-97-2.plan.md` §5.6·§8
   */
  if (asset.acquisitionCause === "carryover_gift") {
    const missing = missingCoDonorBasisLabel(asset);
    if (missing) {
      return `${label}: 이월과세가 적용되므로 「당초 증여자」(= 양도인에게 이 자산을 증여한 사람)의 ${missing}을(를) 입력하세요. 소득세법 제97조의2 제1항 제1호가 취득가액을 당초 증여자의 취득 당시 금액으로 정하는데, 부담부증여의 취득가액은 같은 법 시행령 제159조 제1항 제1호가 양도인 기준으로 따로 산정하므로 두 값이 모두 필요합니다(같은 조 제2항 제3호의 세액 비교).`;
    }

    /**
     * ⚠️ 엔진 `assertCarryoverDonorBasis`의 throw는 **둘**이다. 위 「당초 증여자 필드 미입력」
     *    외에 `ct.useEstimatedAcquisition === true`도 fail-fast로 막는다
     *    (`transfer-tax-carryover-burdened-gift.ts:99~106`). ⑧이 그 한 쪽만 미러하고 있어,
     *    「환산취득가 사용」을 켠 사용자는 ⑧이 오히려 환산 모드 선택·취득시 기준시가 입력을 요구한
     *    끝에 통과하고(⑫ Zod도 통과 — 실측) 제출 시점에 **HTTP 500 배너**를 받았다.
     *    인라인 필드 오류로 앞당긴다.
     *
     * 🔴 **UI 토글을 숨기지 않는 이유**: 일반양도 상태에서 토글을 켠 뒤 양도 형태를 부담부증여로
     *    바꾸면 store에 `carryover.useEstimatedAcquisition = true`가 남는데, 그 상태에서 토글을
     *    숨기면 **플래그를 끌 유일한 입력 경로가 사라져** 500이 영구화된다
     *    (`feedback_ui_gate_removes_sole_input_path`). ⑧ 차단만 둔다.
     *
     * ⚠️ 검사 순서는 위 `missingCoDonorBasisLabel`보다 **뒤**여야 한다. 앞에 두면 지원되는
     *    조합(환산 OFF)에서 「당초 증여자 입력 요구」를 가로챈다
     *    (`transfer-tax-validate-gb-carryover.ts:60`에 같은 유형의 정정 이력이 남아 있다).
     */
    if (asset.carryover?.useEstimatedAcquisition) {
      return `${label}: 부담부증여에서는 이월과세 취득가액을 환산으로 구할 수 없습니다. 취득가액은 소득세법 시행령 제159조 제1항 제1호가 정하므로, 「환산취득가 사용」을 끄고 당초 증여자의 취득 당시 실지거래가액을 입력하거나, 환산이 필요하면 부담부증여 평가 유형을 「시가」 + 취득가액 산정방식 「환산취득가액」으로 선택하세요.`;
    }
  }

  // (2) 평가 모드 선택 필수
  if (!asset.bgValuationMode) {
    return `${label}: 부담부증여 평가 유형(상증법 기준시가·시가)을 선택하세요.`;
  }

  // (3) 인수 채무 입력 필수
  const lending = parseAmount(asset.bgLendingDepositTotal) || 0;
  const mortgage = parseAmount(asset.bgMortgageDebtAmount) || 0;
  const assumedDebt = lending + mortgage;
  if (contractAssumedDebtTotal !== undefined) {
    if (contractAssumedDebtTotal <= 0) {
      return `${label}: 부담부증여 인수 채무액(임대보증금 + 담보차입금)을 입력하세요. 여러 물건을 함께 부담부증여하는 경우 채무가 설정된 물건에만 입력하면 됩니다.`;
    }
  } else if (assumedDebt <= 0) {
    return `${label}: 부담부증여 인수 채무액(임대보증금 + 담보차입금)을 입력하세요.`;
  }

  // (4) 시가 모드 — 양도시 시가 + 취득가액 산정방식(K-4/K-5) + B/C>1 차단 (§100①·§159①1호 본문)
  if (asset.bgValuationMode === "sangjeungbeop_market") {
    if (!parseAmount(asset.bgMarketValueAtTransfer)) {
      return `${label}: 부담부증여 시가 모드 — 양도시 시가 평가액을 입력하세요.`;
    }
    // 취득가액 산정방식별 필수 입력 (H-5: bgMarketValueAtAcquisition 무조건 차단 제거)
    const acqMethod = asset.bgAcquisitionMethod || "";
    if (acqMethod === "actual") {
      // K-4 실지취득가액 안분 — 자산별 실지취득가 필수 (자동 안분 fallback 금지)
      if (asset.assetKind === "general_building") {
        if (
          !parseAmount(asset.bgActualAcquisitionLand) &&
          !parseAmount(asset.bgActualAcquisitionBuilding)
        ) {
          return `${label}: 부담부증여 실지취득가액 안분 — 토지 또는 건물의 실지취득가액을 입력하세요 (§97①1호가목).`;
        }
      } else if (asset.assetKind === "land") {
        if (!parseAmount(asset.bgActualAcquisitionLand)) {
          return `${label}: 부담부증여 실지취득가액 안분 — 토지 실지취득가액을 입력하세요.`;
        }
      } else if (!parseAmount(asset.bgActualAcquisitionTotal)) {
        return `${label}: 부담부증여 실지취득가액 안분 — 실지취득가액을 입력하세요.`;
      }
    } else if (acqMethod === "converted") {
      // K-5 환산취득가액 — 취득·양도시 기준시가 필수. general_building은 (5-b)에서 별도 검사.
      if (asset.assetKind !== "general_building" && asset.assetKind !== "land") {
        if (
          !parseAmount(asset.standardPriceAtTransfer) ||
          !parseAmount(asset.standardPriceAtAcq)
        ) {
          return `${label}: 부담부증여 환산취득가액 — 양도시·취득시 기준시가를 입력하세요 (소령 §176의2②2호).`;
        }
      }
    } else {
      // 미지정: 취득가액 산정방식 선택 강제 (시가 모드 입력 미완성 — collectStepIssues 단계 차단)
      return `${label}: 부담부증여 시가 모드 — 취득가액 산정방식(실지취득가액·환산취득가액)을 선택하세요 (소득세법 §100①).`;
    }
    // B/C > 1 차단 (C = bgMarketValueAtTransfer)
    //
    // ⚠️ 지분 모드: 엔진이 §159의 C를 **지분분**으로 축소하므로(`scaleBurdenedGiftInfo`)
    //    여기서도 같은 스케일로 비교해야 한다. 물건 전체 시가로 비교하면 UI는 통과하는데
    //    엔진이 EXCESS_BURDENED_GIFT로 죽는 "UI 통과 ↔ 엔진 차단" 모순이 된다.
    //    채무는 사용자가 **해당 지분 인수분**을 입력하므로 스케일하지 않는다.
    const ratio = getOwnershipRatio(asset);
    const marketWhole = parseAmount(asset.bgMarketValueAtTransfer) || 0;
    const giftValuationMarket = ratio < 1 ? applyRatio(marketWhole, ratio) : marketWhole;
    if (giftValuationMarket > 0 && assumedDebt > giftValuationMarket) {
      const scaleNote =
        ratio < 1
          ? ` (지분 ${asset.ownershipNumerator}/${asset.ownershipDenominator} 해당분 — 물건 전체 ${marketWhole.toLocaleString()}원)`
          : "";
      return `${label}: 채무액(${assumedDebt.toLocaleString()}원)이 증여가액(${giftValuationMarket.toLocaleString()}원)${scaleNote}을 초과합니다. 부담부증여로는 성립하지 않습니다(상증법 §47③ 검토 필요). 양도 형태를 "일반 양도"로 변경하거나 평가액·채무액을 재확인하세요.`;
    }
  }
  // 기준시가 모드의 B/C > 1 검사는 엔진에서 fail-fast (giftValuation = Max(보충적·담보·임대) 산정 후).

  // (5) Phase 3 — donorRelation 필수
  if (!asset.bgDonorRelation) {
    return `${label}: 부담부증여 — 증여자-수증자 관계를 선택하세요 (상증법 §53 증여재산공제 산정).`;
  }

  // (5-b) 일반건물(general_building) 부담부증여 — §159①1호 환산용 취득시 기준시가 필수
  // §159①1호 단서(양도가액을 §99 기준시가로 산정 시 취득가액도 기준시가)에 따라
  // 사용자가 실거래가를 입력했더라도 취득시 기준시가가 산식 입력으로 필요.
  if (asset.assetKind === "general_building") {
    if (!parseAmount(asset.gbAcqLandPricePerSqm)) {
      return `${label}: 부담부증여 — 취득시 토지 ㎡당 공시지가를 입력하세요 (소령 §159①1호 환산).`;
    }
    if (!parseAmount(asset.gbAcqBuildingValue)) {
      return `${label}: 부담부증여 — 취득시 건물 기준시가를 입력하세요 (소령 §159①1호 환산).`;
    }
  }

  /**
   * (5-c) 기준시가 모드 — **취득시 기준시가 필수** (2026-08-12 신설 · O-1).
   *
   * §159①1호 A괄호의 취득가액은 「취득시 기준시가 × 채무비율」이다. 이 값이 0이면 취득가액도
   * 0이 되어 양도차익이 통째로 부풀지만(실측 257,500,000원 과대), 종전에는 **입력 화면도
   * validate도 없어** 아무도 알려주지 않았다. 자동 fallback은 금지이므로(루트 CLAUDE.md
   * 「미입력은 검증 오류로 차단」) 여기서 막는다.
   *
   * ⚠️ 게이트·값 해석은 **UI(⑤)와 같은 함수**를 쓴다 — 술어가 갈리면 「칸은 뜨는데 계산은
   *    막힌다」가 된다. `general_building`은 (5-b)가 gb* 축으로 따로 검사한다.
   */
  if (needsBgAcqStdPriceInput(asset) && resolveBgAcqStdPrice(asset) <= 0) {
    return asset.assetKind === "land"
      ? `${label}: 부담부증여 기준시가 모드 — 취득시 기준시가(또는 취득 당시 ㎡당 공시지가 + 면적)를 입력하세요. 취득가액 = 취득시 기준시가 × 채무비율입니다 (소득세법 시행령 제159조 제1항 제1호).`
      : `${label}: 부담부증여 기준시가 모드 — 「② 양도정보」의 취득시 기준시가를 입력하세요. 취득가액 = 취득시 기준시가 × 채무비율이므로, 미입력 시 취득가액이 0으로 계산됩니다 (소득세법 시행령 제159조 제1항 제1호).`;
  }

  // (6) Phase 3 — 사전증여 행별 부분 입력 검증
  const priorGifts = asset.bgPriorGifts ?? [];
  for (let i = 0; i < priorGifts.length; i++) {
    const row = priorGifts[i];
    const hasDate = !!row.giftDate;
    const amount = parseAmount(row.giftAmount) || 0;
    if (hasDate && amount <= 0) {
      return `${label}: 사전증여 #${i + 1} — 증여일이 입력되었으나 증여재산가액이 0입니다. 가액을 입력하거나 행을 삭제하세요.`;
    }
    if (!hasDate && amount > 0) {
      return `${label}: 사전증여 #${i + 1} — 증여재산가액이 입력되었으나 증여일이 비어있습니다.`;
    }
    // §58 Phase A — 유효 사전증여 행은 당시 산출세액·과세표준 입력 필수 (미입력 시 공제 누락·이중과세)
    if (hasDate && amount > 0) {
      if ((parseAmount(row.computedTax) || 0) <= 0) {
        return `${label}: 사전증여 #${i + 1} — §58 기납부세액공제 적용을 위해 당시 산출세액을 입력하세요.`;
      }
      if ((parseAmount(row.giftTaxBase) || 0) <= 0) {
        return `${label}: 사전증여 #${i + 1} — §58 한도 산정을 위해 당시 과세표준을 입력하세요.`;
      }
    }
  }

  return null;
}

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
function missingCoDonorBasisLabel(asset: AssetForm): string | null {
  const filled = (v: string | undefined) => v !== undefined && v.trim() !== "";

  // K-1~K-3(기준시가 모드) · K-5(환산) — 둘 다 취득시 기준시가 두 칸을 쓴다.
  //   K-5에 전용 칸을 두지 않는 것은 환산이 **이 칸을 분자로** 자동 추종하기 때문이다(이중 진실 방지).
  const needsStdPrice =
    asset.bgValuationMode === "sangjeungbeop_standard" ||
    asset.bgAcquisitionMethod === "converted";
  if (needsStdPrice) {
    if (!filled(asset.bgCoDonorLandStdPriceAtAcq) || !filled(asset.bgCoDonorBuildingStdPriceAtAcq)) {
      return "취득 당시 토지·건물 기준시가";
    }
    return null;
  }

  // K-4(시가 + 실지취득가액)
  if (asset.bgAcquisitionMethod === "actual") {
    const hasSplit =
      filled(asset.bgCoDonorActualAcquisitionLand) &&
      filled(asset.bgCoDonorActualAcquisitionBuilding);
    const hasTotal = filled(asset.bgCoDonorActualAcquisitionTotal);
    if (!hasSplit && !hasTotal) return "실지취득가액(토지·건물 분리 또는 단일 총액)";
    return null;
  }

  // legacy — 시가 모드인데 산정방식을 고르지 않은 경우.
  if (!filled(asset.bgCoDonorMarketValueAtAcquisition)) {
    return "취득 당시 시가 평가액";
  }
  return null;
}
