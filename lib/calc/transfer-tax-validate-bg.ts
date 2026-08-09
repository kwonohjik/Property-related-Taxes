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
   * (1-b) 🔴 **이월과세(증여) 취득원인과는 함께 쓸 수 없다** (2026-08-08 · 계획서 §10-6).
   *
   * ## 무엇이 문제였나
   *
   * 두 스텝이 **함께 돈다** — STEP 0.475(이월과세)가 `workingInput`을 §97의2 시나리오로 바꾼 뒤,
   * STEP 0.48(부담부증여)이 `transferPrice`·`acquisitionPrice`·`expenses`를 §159 안분값으로
   * **덮어쓴다**(`transfer-tax-burdened-gift-step.ts`). ⇒ 이월과세 입력은 계산에 도달하지 않는다.
   *
   * 실측(2026 양도 · 채무 5억): 부담부증여 단독 **71,260,000**과 이월과세를 켠 값이 **완전히 같다**.
   * 증여자 취득가액을 1억↔7억으로 흔들어도 불변이다 — 대조군인 「이월과세만」에서는
   * 204,930,000 ↔ 93,110,000으로 크게 반응하므로, 무반응은 픽스처 탓이 아니다.
   *
   * 그런데 ⑧ validate는 그 무시되는 값을 **요구**한다(`transfer-tax-validate-asset.ts`
   * carryover 블록 (c)(d) — 증여 당시 평가액·증여자 취득가액). 「요구하는데 무시」다.
   *
   * ## 왜 차단이고, 왜 세액은 그대로인가
   *
   * 취득원인을 무엇으로 고르든 §159가 취득가액을 정하므로 **결과가 같다** — 실측으로
   * 매매(미선택)·증여·상속·이월과세 **네 경우 모두 71,260,000**이다. ⇒ 「증여」로 안내해도
   * 사용자가 얻는 답은 동일하고, 차단으로 잃는 것이 없다.
   *
   * ⚠️ **이것은 「§97의2가 부담부증여에 적용되지 않는다」는 판정이 아니다.** 그 판정은 아직
   *    서 있지 않다 — 「소득세법 시행령」 제159조 제1항 제1호의 **A**는 「법 제97조제1항제1호에
   *    따른 가액」이고, 「소득세법」 제97조의2 제1항 제1호는 바로 그 「제97조제1항제1호에 따른
   *    금액」을 증여자의 취득 당시 가액으로 치환한다 ⇒ **법문상으로는 연결된다**.
   *    국세청 해석 2건(2006-10-30 · 2006-11-02, 「부담부증여로 취득한 자산 중 양도로 보는 부분의
   *    배우자 이월과세 적용여부」)이 존재하나 **본문을 확인하지 못했다**(법제처 API 미제공 ·
   *    taxlaw.nts.go.kr는 JS 렌더). 근거 미확인 상태에서 세액을 바꾸지 않는다
   *    (memory `feedback_unverified_authority_blocks_tax_change`).
   *    ⇒ 차단은 **현행 동작(미적용)을 유지하면서** 침묵을 없애는 조치다.
   */
  /**
   * 🔴 **차단 사유 정정 (2026-08-09)** — 종전 문구는 「취득원인을 「증여」로 선택하세요 —
   *    **세액은 동일합니다**」였다. 그 안내가 **틀렸다**.
   *
   * **국세청 재산세과-1059(2009.12.18.)**가 정면으로 답한다:
   *   「거주자가 배우자로부터 부동산을 증여받은 후 (기간 내에) 다시 그 배우자에게 증여받은 부동산을
   *     **부담부증여**하는 경우로서 「소득세법 시행령」 **제159조 제1호에 따른 취득가액 산정 시**
   *     「소득세법」 제97조 제1항 제1호에 따른 가액에 배우자 **이월과세 규정이 적용되는 것임**」
   *   (질의 사실관계: 1972년 A 취득 → 2007년 A→B 증여 → 2009년 B→A 부담부증여)
   *
   * ⇒ 이월과세가 적용되면 §159①1호 **A의 기준 시점이 「양도인의 취득 당시」에서
   *   「원증여자의 취득 당시」로 옮겨진다**. 따라서 취득원인을 「증여」로 바꾸면 **세액이 달라진다**.
   *
   * ⚠️ **조문 드리프트 없음 확인**: 당시 §97④ 「취득당시 제1항제1호 각 목의 어느 하나의 금액」 →
   *    현행 §97의2①1호 「취득할 당시의 제97조제1항제1호에 따른 금액」. 치환 구조 동일(기간만 5년→10년).
   *    §159①1호 A = 「법 제97조제1항제1호에 따른 가액」도 그대로다.
   *
   * **그래도 차단은 유지한다** — 엔진이 아직 지원하지 않기 때문이다. §159의 A는
   * `burdenedGiftInfo`의 4개 모드(기준시가·실지취득가·환산·legacy)에서 오고 **전부 사용자 입력**이라,
   * 「원증여자 취득 당시」 값으로 바꾸려면 입력 의미 재정의·UI·§97의2②3호 세액비교·증여세
   * 필요경비 산입까지 함께 설계해야 한다. 지원 전에 계산을 열면 **틀린 답**이 나온다.
   *
   * 설계: `docs/02-design/features/burdened-gift-carryover-159-97-2.plan.md`
   */
  if (asset.acquisitionCause === "carryover_gift") {
    return `${label}: 부담부증여 + 「이월과세(증여)」 조합은 아직 지원하지 않습니다. 국세청 해석(재산세과-1059)에 따르면 이 경우 소득세법 시행령 §159①1호의 취득가액 산정에 이월과세가 적용되어 원증여자의 취득 당시 가액을 써야 하는데, 현재 계산기는 이를 반영하지 못합니다. 세무 대리인과 상담하세요.`;
  }

  // (2) 평가 모드 선택 필수
  if (!asset.bgValuationMode) {
    return `${label}: 부담부증여 평가 유형(상증법 기준시가·시가)을 선택하세요.`;
  }

  // (3) 인수 채무 입력 필수
  const lending = parseAmount(asset.bgLendingDepositTotal) || 0;
  const mortgage = parseAmount(asset.bgMortgageDebtAmount) || 0;
  const assumedDebt = lending + mortgage;
  if (assumedDebt <= 0) {
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
