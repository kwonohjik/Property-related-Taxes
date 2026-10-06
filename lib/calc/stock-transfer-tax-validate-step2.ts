/**
 * 주식 양도소득세 — Step 2 국내주식 전용 Validation (800줄 정책 분리)
 *
 * stock-transfer-tax-validate.ts에서 validateStep2 국내주식 본체를 추출.
 * 해외주식(foreign_stock)은 validate-foreign.ts로 분리됨.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockValidationError } from "./stock-transfer-tax-validate";
import { BONUS_UNTAXED_BLOCK_MESSAGE } from "./stock-acquisition-cause";
import { BONUS_TAXED_ACTUAL_ONLY_MESSAGE } from "./stock-acquisition-cause";
import { isBonusTaxedEstimationBlocked } from "./stock-acquisition-cause";
import { isBonusTaxedPreDeemedFaceValueMissing } from "./stock-acquisition-cause";
import { BONUS_TAXED_PRE_DEEMED_FACE_VALUE_REQUIRED_MESSAGE } from "./stock-acquisition-cause";
// 엔진 단일 진실 — 평가액 동일 판정 재구현 금지 (dual-truth 회피)
//
// ⚠️ **`calcUnlistedPerShareWeighted`(본칙 가중평균)를 쓰면 안 된다** — 엔진은 「제4항에 따른
//    평가액」(단서 80% 하한 + 연혁 게이팅 포함)으로 동일 여부를 판정한다. 본칙만 비교하면
//    하한이 발동하는 입력에서 **엔진은 「같다」, validate는 「다르다」**가 되어 사용자에게
//    "토글을 해제하세요"라는 거짓 경고가 뜬다.
import { isDonorConversionForm } from "./stock-transfer-tax-api-carryover";
import { isPreDeemedPurchaseForm } from "./stock-transfer-section94-4-form";
import { isBookLostAtAcquisitionForm } from "./stock-transfer-section94-4-form";
import { isBeforePpiSeries, PRE_DEEMED_PPI_RATIO_REQUIRED_MESSAGE } from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-acquisition";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";
import {
  isGiftLikeEstimationBlocked,
  GIFT_LIKE_ESTIMATION_BLOCKED_MESSAGE,
} from "@/lib/tax-engine/stock-transfer/gift-acquisition-163-9";
import { calcSection165_4Value } from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";
import { isSection165_4EraUnsupported } from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";
import { netIncomeSkipBySide } from "@/lib/tax-engine/stock-transfer/unlisted-flat-adapter";
// §165④1호 괄호(2:3) 대상 법인 — 엔진과 같은 leaf(사용자 신고 · 다목 50% · 라목)
import { isReversalCorpForm } from "./stock-transfer-section94-4-form";
import {
  isTradingHaltMarketScopeViolation,
  TRADING_HALT_MARKET_SCOPE_MESSAGE,
} from "@/lib/tax-engine/stock-transfer/trading-halt-market-scope";
// ② 종가평균 파생 단일 진실 — 미리보기·API 변환과 **같은 함수**를 쓴다.
// 여기서 다시 구현하면 「화면은 통과, 서버는 0」 같은 갈림이 생긴다.
import { resolveListingClosingAvg } from "@/lib/tax-engine/stock-transfer/post-listing-flat-adapter";
// 필수 키 집합은 ⑫(`stock-transfer-tax-refines.ts`)와 공용 술어 — 한쪽만 고치면 3중 패턴이 깨진다.
import {
  requiredUnlistedValuationKeys,
  missingLotCauseKeys,
  lotCauseMessage,
} from "./stock-transfer-required-inputs";
// 비상장 보충적 평가 검증군 + 공용 파서 — 800줄 정책 분리(동작 변경 없음)
import {
  isEmpty,
  parseTransferDate,
  parseF,
  parseI,
  validateUnlistedValuationFields,
  validateAcquisitionSideUnlistedFields,
  validateSection165_4Era,
  SIMPLE_FIELD_MESSAGE,
} from "./stock-transfer-tax-validate-unlisted";



/**
 * 환산 분모 — 양도일 이전 1개월 종가평균 (§99①3 · 영 §176의2②1호).
 * 수증자 환산(`estimated`)과 이월과세 증여자 환산이 **같은 검증**을 쓴다(분모는 이월과세와 무관).
 */
function validateTransferStdAvg(form: StockTransferFormData, errors: StockValidationError[]): void {
  const transferAvg = parseI(form.transferDatePriceAvg1Month);
  // S3: `transferStdInputMode`는 **더 이상 축 전용이 아니다** — 「양도 당시 기준시가」
  //   블록이 4갈래 위에 항상 있어 어느 모드에서도 되돌릴 수 있다(F-10 dead-end 구조 해소).
  //   anchor: __tests__/calc/stock-std-input-mode-axis.anchor.test.ts
  const mode = form.transferStdInputMode || "direct";
  if (mode === "direct") {
    if (isEmpty(form.transferDatePriceAvg1Month) || transferAvg <= 0) {
      errors.push({
        field: "transferDatePriceAvg1Month",
        message: `양도일 이전 1개월 종가 평균을 직접 입력하세요 (환산취득가액 분모 — ${STOCK.ENFORCEMENT_DECREE_176_2_2_1_CONVERSION} · '일자별 입력' 모드 사용 가능)`,
        severity: "error",
      });
    }
  } else {
    const hasAnyClose = form.transferPriceClosing?.some((s) => !isEmpty(s) && parseI(s) > 0);
    if (!hasAnyClose) {
      errors.push({
        field: "transferPriceClosing",
        message: `일자별 입력 모드: 양도일 이전 1개월 거래일 종가를 1셀 이상 입력하세요 (환산취득가액 분모 자동 산정용 — ${STOCK.ENFORCEMENT_DECREE_176_2_2_1_CONVERSION})`,
        severity: "error",
      });
    }
    if (transferAvg <= 0) {
      errors.push({
        field: "transferDatePriceAvg1Month",
        message: "일자별 입력에서 자동 평균 산정 실패 — 종가 값을 확인하세요",
        severity: "error",
      });
    }
  }
}

/**
 * Step 2 국내주식 검증 본체 — 양도가액·취득가액·환산 입력
 * (해외주식 분기는 호출 전 제거됨)
 */
export function validateStep2Domestic(form: StockTransferFormData): StockValidationError[] {
  const errors: StockValidationError[] = [];

  // 3중 패턴 fallback
  const transferPriceMode = form.transferPriceMode || "actual";
  const acquisitionMode = form.acquisitionMode || "actual";
  const lotsMode = form.lotsMode || "single";

  // 분할 모드 호환성 (Plan v2.2 — UI 사전 차단 외 이중 검증)
  if (lotsMode === "split") {
    // [A-2] split + 자본조정 차단 제거 — lot별 희석 전처리로 지원.
    if (acquisitionMode !== "actual") {
      errors.push({
        field: "acquisitionMode",
        message: "분할 모드에서는 취득가 산정방법으로 실가(actual)만 지원합니다 (C-8)",
        severity: "error",
      });
    }
    if (transferPriceMode === "exchange") {
      errors.push({
        field: "transferPriceMode",
        message: "분할 모드에서는 양도가액 모드로 교환을 지원하지 않습니다",
        severity: "error",
      });
    }
    return errors;
  }

  // ── 양도가액 (single 모드) ──
  if (transferPriceMode === "actual") {
    const actualMode = form.transferActualInputMode || "total";
    if (actualMode === "total") {
      if (isEmpty(form.transferTotalPrice) || parseI(form.transferTotalPrice) <= 0) {
        errors.push({ field: "transferTotalPrice", message: "양도가액 합계를 입력하세요", severity: "error" });
      }
    } else {
      if (isEmpty(form.perShareTransferPrice) || parseI(form.perShareTransferPrice) <= 0) {
        errors.push({ field: "perShareTransferPrice", message: "1주당 양도가액을 입력하세요", severity: "error" });
      }
    }
  } else if (transferPriceMode === "exchange") {
    const prop = parseI(form.exchangePropertyValue);
    const debt = parseI(form.exchangeDebtRelief);
    const cash = parseI(form.exchangeCash);
    if (prop <= 0 && debt <= 0 && cash <= 0) {
      errors.push({
        field: "exchange",
        message: "교환 양도가액: 부동산 가액·채무면제액·현금 중 1개 이상 양수로 입력하세요",
        severity: "error",
      });
    }
  }

  // ── 취득가액 ──
  if (acquisitionMode === "actual") {
    const acqInputMode = form.acquisitionActualInputMode || "per_share";
    if (acqInputMode === "lots") {
      if (!form.acquisitionLots || form.acquisitionLots.length === 0) {
        errors.push({
          field: "acquisitionLots",
          message: "취득가액 다건 입력 모드: 매수 lot을 1행 이상 입력하세요",
          severity: "error",
        });
      } else {
        form.acquisitionLots.forEach((lot, i) => {
          if (isEmpty(lot.acquisitionDate)) {
            errors.push({ field: `acquisitionLots[${i}].acquisitionDate`, message: `매수 lot #${i + 1}의 취득일을 입력하세요`, severity: "error" });
          }
          if (parseI(lot.shareCount) <= 0) {
            errors.push({ field: `acquisitionLots[${i}].shareCount`, message: `매수 lot #${i + 1}의 주식수는 0보다 커야 합니다`, severity: "error" });
          }
          if (parseI(lot.perShareAcquisitionPrice) <= 0) {
            errors.push({ field: `acquisitionLots[${i}].perShareAcquisitionPrice`, message: `매수 lot #${i + 1}의 1주당 단가는 0보다 커야 합니다`, severity: "error" });
          }
          /**
           * 취득원인 보조 입력 — 분할(step1)·⑫와 **공용 술어**.
           * 🔴 2026-09-30(B18) 종전엔 상속·합병만 봤다. 이 모드도 같은 lot 카드(`AcquisitionLotCard`)라
           *    이월과세를 고를 수 있는데 관계·증여자 취득일·증여세 짝을 요구하지 않아, 비우면 엔진이
           *    관계를 배우자로(2,620,000), 증여자 취득일 없이 가액만 승계하고 세율은 단기(3,930,000)로 갔다.
           */
          // 의제배당 비과세 무상주는 매수 건이 아니다 — 분할(step1)과 같은 차단
          if (lot.acquisitionCause === "bonus_untaxed") {
            errors.push({ field: `acquisitionLots[${i}].acquisitionCause`, message: `매수 lot #${i + 1}: ${BONUS_UNTAXED_BLOCK_MESSAGE}`, severity: "error" });
          }
          for (const key of missingLotCauseKeys(
            lot.acquisitionCause,
            (k) => !isEmpty(lot[k]),
            (k) => parseI(lot[k] ?? "") > 0,
          )) {
            errors.push({ field: `acquisitionLots[${i}].${key}`, message: lotCauseMessage(key, i), severity: "error" });
          }
        });
        // [A-2] 자본조정(무상증자) 시 매수 수량이 희석 전이라 매도>매수가 정당 → 엔진 allocateLots 가드에 위임
        const hasCapitalAdj = !!(form.capitalAdjustments && form.capitalAdjustments.length > 0);
        const totalAcqLots = form.acquisitionLots.reduce((s, l) => s + parseI(l.shareCount), 0);
        const transferShareCount = parseI(form.shareCount);
        if (transferShareCount > totalAcqLots && !hasCapitalAdj) {
          errors.push({
            field: "acquisitionLots",
            message: `양도 주식수(${transferShareCount})가 매수 lot 합계(${totalAcqLots})를 초과합니다. 매수 lot을 추가하거나 양도 주식수를 줄이세요.`,
            severity: "error",
          });
        }
      }
      // [A-1] 개별법(specific): 합성 단일 매도에 대한 매수 lot별 배정 합계 = 양도 주식수
      if (form.costAllocationMethod === "specific") {
        // [A-2] 자본조정 시 배정·lot 수량이 희석 전/후 단위 불일치 → 매칭 무결성은 엔진 matchSpecific에 위임
        const hasCapitalAdj = !!(form.capitalAdjustments && form.capitalAdjustments.length > 0);
        const transferShareCount = parseI(form.shareCount);
        const matchSum = form.specificMatchings.reduce((s, m) => s + parseI(m.shareCount), 0);
        /**
         * ⚠️ 여기에는 자본조정 면제를 걸지 않는다 — **양변이 모두 희석 후 단위**다.
         * 배정 수량도 양도 주식수도 매도 시점의 주식이라 희석과 무관하고,
         * 부족분은 그대로 양도가액을 깎는다(엔진 합계가 matched에서 나온다 — 소득세법 §96①).
         * 단위가 갈리는 것은 **매수 lot 보유 수량과 대조하는 아래 검사**뿐이라 면제도 거기만 남긴다.
         */
        if (matchSum !== transferShareCount) {
          errors.push({
            field: "specificMatchings",
            message: `개별법: 매수 lot별 배정 합계(${matchSum})가 양도 주식수(${transferShareCount})와 일치해야 합니다`,
            severity: "error",
          });
        }
        // 매수 lot별 배정 ≤ lot 보유 수량
        if (!hasCapitalAdj) {
          form.specificMatchings.forEach((m) => {
            const lot = form.acquisitionLots.find((l) => l.id === m.acquisitionLotId);
            const alloc = parseI(m.shareCount);
            if (lot && alloc > parseI(lot.shareCount)) {
              errors.push({
                field: "specificMatchings",
                message: `개별법: 매수 lot에 배정한 수량(${alloc})이 해당 lot 보유 수량(${parseI(lot.shareCount)})을 초과합니다`,
                severity: "error",
              });
            }
          });
        }
      }
    } else if (acqInputMode === "total") {
      // ⑧ 합계 직접 입력 — 양도측(`transferTotalPrice`)과 같은 강도로 본다.
      if (isEmpty(form.acquisitionTotalPrice) || parseI(form.acquisitionTotalPrice) <= 0) {
        errors.push({ field: "acquisitionTotalPrice", message: "취득가액 합계를 입력하세요", severity: "error" });
      }
    } else {
      if (isEmpty(form.perShareAcquisitionPrice) || parseI(form.perShareAcquisitionPrice) < 0) {
        errors.push({ field: "perShareAcquisitionPrice", message: "1주당 취득가액을 입력하세요", severity: "error" });
      }
    }
  } else if (acquisitionMode === "estimated") {
    const isListed = ["kospi", "kosdaq", "konex"].includes(form.marketType);
    if (isListed) {
      // G-6: 양도일 거래정지 시 분모(1개월 종가평균)는 법령상 무효·엔진 미사용 → 검증 면제
      const stdMode = form.acquisitionStdMode;
      /**
       * 거래정지 우회(영 §165③)는 **코스닥·코넥스 전용**이다 — 단일 정본 술어에 위임한다.
       * 코스피는 거래정지 중이어도 법 §99①3(1개월 종가평균) 그대로다.
       *
       * ⑤가 코스피에서 두 옵션을 `disabled` 로 막지만, 시장을 코스닥→코스피로 바꾸면
       * `acquisitionStdMode` 가 stale 로 남아 화면상 선택이 유지된다. ⑧이 그것을 차단한다
       * (④도 같은 술어로 플래그를 끊는다 — 3중 패턴).
       */
      if (
        (stdMode === "halt_transfer" || stdMode === "halt_acquisition") &&
        isTradingHaltMarketScopeViolation(form.marketType)
      ) {
        errors.push({
          field: "acquisitionStdMode",
          message: TRADING_HALT_MARKET_SCOPE_MESSAGE,
          severity: "error",
        });
      }
      if (stdMode !== "halt_transfer") {
        validateTransferStdAvg(form, errors);
      }

      // C-6: 거래정지 우회(§165③) — 취득 후 상장이 아니면 비상장 보충 평가 필수 (자동 fallback 금지)
      // [C-2] 공유 헬퍼 — simple/full/사례49+§165⑨ 전체 모드 검증(simpleOnly 해제로 거래정지도 전체 노출)
      if (stdMode === "halt_transfer") {
        validateUnlistedValuationFields(form, errors);
      }
      // [C-1] 취득일 거래정지 — 취득측 보충 평가 필수 (양도정지 ON이면 C-6이 양·취 모두 커버 — 중복 방지)
      if (stdMode === "halt_acquisition") {
        validateAcquisitionSideUnlistedFields(form, errors);
      }
      if (stdMode === "monthly_avg") {
        // [C-1] 취득정지 시 분자(취득일 종가평균)는 법령상 무효·엔진 미사용 → 필수 면제 (G-6 패턴 mirror)
        //
        // 입력 축 direct|daily — 분모 축(`transferStdInputMode`, :302)과 **같은 형태**다.
        // ⚠️ UI가 두 조건으로 열면 ⑧도 두 조건 다 봐야 한다: daily에서 단일 칸을 요구하면
        //    표만 채운 사용자가 «막다른 길»에 갇힌다(memory `feedback_ui_gate_two_conditions_downstream_one`).
        const acqInputMode = form.acquisitionStdInputMode || "direct";
        if (acqInputMode === "direct") {
          if (isEmpty(form.acquisitionDatePriceAvg1Month)) {
            errors.push({
              field: "acquisitionDatePriceAvg1Month",
              message:
                `취득일 이전 1개월 종가 평균을 입력하세요 (환산취득가액 분자 — ${STOCK.ENFORCEMENT_DECREE_176_2_2_1_CONVERSION} · '일자별 입력' 모드 사용 가능)`,
              severity: "error",
            });
          }
        } else {
          const hasAnyClose = form.acquisitionPriceClosing?.some(
            (s) => !isEmpty(s) && parseI(s) > 0,
          );
          if (!hasAnyClose) {
            errors.push({
              field: "acquisitionPriceClosing",
              message:
                `일자별 입력 모드: 취득일 이전 1개월 거래일 종가를 1셀 이상 입력하세요 (환산취득가액 분자 자동 산정용 — ${STOCK.ENFORCEMENT_DECREE_176_2_2_1_CONVERSION})`,
              severity: "error",
            });
          }
          if (parseI(form.acquisitionDatePriceAvg1Month) <= 0) {
            errors.push({
              field: "acquisitionDatePriceAvg1Month",
              message: "일자별 입력에서 자동 평균 산정 실패 — 종가 값을 확인하세요",
              severity: "error",
            });
          }
        }
      }
      if (stdMode === "post_listing") {
        const detailMode = form.unlistedDetailMode || "simple";
        if (isEmpty(form.listingDate)) {
          errors.push({ field: "listingDate", message: "상장일을 입력하세요 (소령 §165⑤)", severity: "error" });
        }
        /*
          🔄 **S3에서 제거** — 종전에는 여기서 두 «불가 조합»을 차단했다:
            G-5     양도일 거래정지 × 취득 후 상장 (§165⑤ 전제 ↔ 상증령 §52의2③ 제외)
            C-1 M-4 취득일 거래정지 × 취득 후 상장 (취득 당시 비상장이면 개념 불성립)

          `acquisitionStdMode`가 배타적 4상태라 그 조합을 **표현할 수 없다**. 여기 남겨 두면
          도달 불가 코드가 된다(계획서 Q-2 3안).

          ⚠️ **⑫ Zod의 같은 refine은 남아 있다** — UI가 못 만들 뿐 API 직접 호출은
             만들 수 있다(`stock-transfer-tax-schema.ts:419·429`).
             그 차단은 `__tests__/calc/stock-conversion-branch-matrix.anchor.test.ts`
             MTX-XA'·XB'가 지킨다.
        */
        if (detailMode === "simple") {
          // ② 입력 축 — direct(단일 숫자) | daily(종가 표). ①(`transferStdInputMode`, :302)과 같은 형태.
          // ⚠️ daily에서 단일 숫자를 요구하면 **입력 UI 없이 차단되는 dead-end**가 된다
          //    (그 모드에서는 그 칸이 화면에 없다).
          const listingStdMode = form.listingStdInputMode || "direct";
          if (listingStdMode === "direct") {
            if (isEmpty(form.listingDatePriceAvg1Month)) {
              errors.push({
                field: "listingDatePriceAvg1Month",
                message: "상장일 이후 1개월 종가평균을 입력하세요 (소령 §165⑤ 계산식 첫 항 — '일자별 입력' 모드 사용 가능)",
                severity: "error",
              });
            }
          } else {
            const hasAnyClose = form.listingPriceClosing?.some((s) => !isEmpty(s) && parseI(s) > 0);
            if (!hasAnyClose) {
              errors.push({
                field: "listingPriceClosing",
                message: "일자별 입력 모드: 상장일 이후 1개월 거래일 종가를 1셀 이상 입력하세요 (소령 §165⑤ 계산식 첫 항 자동 산정용)",
                severity: "error",
              });
            } else if (resolveListingClosingAvg(form) <= 0) {
              errors.push({
                field: "listingPriceClosing",
                message: "일자별 입력에서 자동 평균 산정 실패 — 종가 값을 확인하세요",
                severity: "error",
              });
            }
          }

          // 간이 모드 «안»의 하위 축 — 결과값 직접 입력 ↔ 순액에서 계산.
          //
          // 🔴 모드를 갈라야 한다. amounts 모드에서 파생 4필드만 검사하면
          //    「원천값은 다 넣었는데 주식수 오타로 파생이 0 → 입력칸은 찼는데 차단」이 되고,
          //    원천값을 아예 안 보면 「빈 값으로 통과」한다.
          //    (같은 형태의 direct/daily 분기가 위 transferStdInputMode에 이미 있다 — :302)
          const valueMode = form.simpleValueInputMode || "direct";
          if (valueMode === "amounts") {
            // 원천 3필드는 필수. **영업권은 선택**이다 — 해당 없는 법인이 다수다.
            const axes = [
              {
                label: "상장연도",
                ni: { field: "listingYearNetIncomeAmount", value: form.listingYearNetIncomeAmount },
                sc: { field: "listingYearShareCount", value: form.listingYearShareCount },
                na: { field: "listingYearNetAssetAmount", value: form.listingYearNetAssetAmount },
                derivedNi: form.listingYearNetIncomePerShare,
                derivedNa: form.listingYearNetAssetPerShare,
              },
              {
                label: "취득연도",
                ni: { field: "acquisitionYearNetIncomeAmount", value: form.acquisitionYearNetIncomeAmount },
                sc: { field: "acquisitionYearShareCount", value: form.acquisitionYearShareCount },
                na: { field: "acquisitionYearNetAssetAmount", value: form.acquisitionYearNetAssetAmount },
                derivedNi: form.acquisitionYearNetIncomePerShare,
                derivedNa: form.acquisitionYearNetAssetPerShare,
              },
            ] as const;
            for (const ax of axes) {
              if (isEmpty(ax.ni.value)) errors.push({ field: ax.ni.field, message: `${ax.label} 순손익액을 입력하세요 (§165④1 가목)`, severity: "error" });
              if (isEmpty(ax.sc.value) || parseI(ax.sc.value) <= 0) errors.push({ field: ax.sc.field, message: `${ax.label} 발행주식총수를 입력하세요 (1주당 가치의 분모)`, severity: "error" });
              if (isEmpty(ax.na.value)) errors.push({ field: ax.na.field, message: `${ax.label} 순자산가액(영업권 포함 전)을 입력하세요 (§165④1 나목)`, severity: "error" });
              // 원천값이 다 찼는데 파생이 비어 있으면 산정이 실패한 것이다 — 조용히 넘기지 않는다.
              if (!isEmpty(ax.ni.value) && !isEmpty(ax.sc.value) && isEmpty(ax.derivedNi)) {
                errors.push({ field: ax.ni.field, message: `${ax.label} 1주당 순손익가치 자동 산정 실패 — 순손익액·발행주식총수를 확인하세요`, severity: "error" });
              }
              if (!isEmpty(ax.na.value) && !isEmpty(ax.sc.value) && isEmpty(ax.derivedNa)) {
                errors.push({ field: ax.na.field, message: `${ax.label} 1주당 순자산가치 자동 산정 실패 — 순자산가액·발행주식총수를 확인하세요`, severity: "error" });
              }
            }
          } else {
            if (isEmpty(form.listingYearNetIncomePerShare)) errors.push({ field: "listingYearNetIncomePerShare", message: "상장연도 1주당 순손익가치를 입력하세요", severity: "error" });
            if (isEmpty(form.listingYearNetAssetPerShare)) errors.push({ field: "listingYearNetAssetPerShare", message: "상장연도 1주당 순자산가치를 입력하세요", severity: "error" });
            if (isEmpty(form.acquisitionYearNetIncomePerShare)) errors.push({ field: "acquisitionYearNetIncomePerShare", message: "취득연도 1주당 순손익가치를 입력하세요", severity: "error" });
            if (isEmpty(form.acquisitionYearNetAssetPerShare)) errors.push({ field: "acquisitionYearNetAssetPerShare", message: "취득연도 1주당 순자산가치를 입력하세요", severity: "error" });
          }
        } else {
          const hasClosingData = form.listingPriceClosing.some((s) => !isEmpty(s));
          if (!hasClosingData) {
            errors.push({ field: "listingPriceClosing", message: "상장일 이후 1개월 종가를 1셀 이상 입력하세요", severity: "error" });
          }
          if (isEmpty(form.niShareCountListing)) errors.push({ field: "niShareCountListing", message: "상장연도 사업연도말 주식수를 입력하세요", severity: "error" });
          if (isEmpty(form.naAssetTotalRow1Listing)) errors.push({ field: "naAssetTotalRow1Listing", message: "상장연도 자산총계를 입력하세요", severity: "error" });
          if (isEmpty(form.naLiabTotalRow8Listing)) errors.push({ field: "naLiabTotalRow8Listing", message: "상장연도 부채총계를 입력하세요", severity: "error" });
          if (isEmpty(form.naShareCountListing)) errors.push({ field: "naShareCountListing", message: "상장연도 순자산 주식수를 입력하세요", severity: "error" });
          if (detailMode === "listing_only") {
            if (isEmpty(form.acquisitionYearNetIncomePerShare)) errors.push({ field: "acquisitionYearNetIncomePerShare", message: "취득연도 1주당 순손익가치를 직접 입력하세요", severity: "error" });
            if (isEmpty(form.acquisitionYearNetAssetPerShare)) errors.push({ field: "acquisitionYearNetAssetPerShare", message: "취득연도 1주당 순자산가치를 직접 입력하세요", severity: "error" });
          } else {
            if (isEmpty(form.niShareCountAcq)) errors.push({ field: "niShareCountAcq", message: "취득연도 사업연도말 주식수를 입력하세요", severity: "error" });
            if (isEmpty(form.naAssetTotalRow1Acq)) errors.push({ field: "naAssetTotalRow1Acq", message: "취득연도 자산총계를 입력하세요", severity: "error" });
            if (isEmpty(form.naLiabTotalRow8Acq)) errors.push({ field: "naLiabTotalRow8Acq", message: "취득연도 부채총계를 입력하세요", severity: "error" });
            if (isEmpty(form.naShareCountAcq)) errors.push({ field: "naShareCountAcq", message: "취득연도 순자산 주식수를 입력하세요", severity: "error" });
          }
        }

        // 소칙 §81④ 1호 월할 가산 — 토글 ON 시 (C-4 차단 / C-7 경고)
        if (form.monthlyAccrualToggle) {
          // C-4: 전전사업연도 평가 필수 (자동 fallback 금지 — 미입력 시 차단)
          if (isEmpty(form.prePriorYearNetIncomePerShare)) {
            errors.push({ field: "prePriorYearNetIncomePerShare", message: "전전사업연도 1주당 순손익가치를 입력하세요 (소칙 §81④ 1호 월할 가산)", severity: "error" });
          }
          if (isEmpty(form.prePriorYearNetAssetPerShare)) {
            errors.push({ field: "prePriorYearNetAssetPerShare", message: "전전사업연도 1주당 순자산가치를 입력하세요 (소칙 §81④ 1호 월할 가산)", severity: "error" });
          }
          // C-7 경고: simple 모드 평가액 상이 시 토글 무의미 (full/listing_only는 합성 산출 — 엔진 warning에 위임)
          const td5 = parseTransferDate(form.transferDate);
          if (detailMode === "simple" && td5 && !isSection165_4EraUnsupported(td5)) {
            const heavyRE = isReversalCorpForm(form);
            const listEval = calcSection165_4Value(parseF(form.listingYearNetIncomePerShare), parseF(form.listingYearNetAssetPerShare), heavyRE, td5).value;
            const acqEval = calcSection165_4Value(parseF(form.acquisitionYearNetIncomePerShare), parseF(form.acquisitionYearNetAssetPerShare), heavyRE, td5).value;
            if (listEval > 0 && listEval !== acqEval) {
              errors.push({ field: "monthlyAccrualToggle", message: "취득연도·상장연도 평가액이 달라 소칙 §81④ 월할 가산이 적용되지 않습니다. 토글을 해제하세요.", severity: "warning" });
            }
          }
        }

        // [B-5] 증자·합병 기간 조정 (상증령 §52의2②) — hasIncrease ON 시 발생일 필수 (full/listing_only)
        // simple 모드는 closing 테이블 부재 → 게이트. 자동 fallback 금지(미입력 차단).
        if (form.listingPriceHasIncrease && detailMode !== "simple") {
          if (isEmpty(form.listingPriceIncreaseDate)) {
            errors.push({ field: "listingPriceIncreaseDate", message: "증자·합병 발생일을 입력하세요 (상증령 §52의2② 기간 조정)", severity: "error" });
          }
        }
      }
    } else {
      // 비상장 보충적 평가 — [C-2] 공유 헬퍼(거래정지 우회 C-6과 dual-truth 방지)
      validateUnlistedValuationFields(form, errors);
    }
  } else if (acquisitionMode === "sale_case") {
    const isListed = ["kospi", "kosdaq", "konex"].includes(form.marketType);
    if (isListed) {
      errors.push({
        field: "acquisitionMode",
        message: "매매사례가액은 비상장주식에만 적용 가능합니다 (상장주식 선택 불가)",
        severity: "error",
      });
    }
    // 🔴 2026-09-30(B11) 종전엔 여기서 `perShareAcquisitionPrice`를 무조건 요구했다. 그런데 이 모드의
    //    화면(`MarketSampleBlock`)에는 그 칸이 없어 「1주당 취득 매매사례가액」만 채운 사용자가 막혔다
    //    (숨은 칸 요구 = 막다른 길). 필수 규칙은 아래 R-1' 「사례가액 또는 1주당 취득가액」 하나다 — ⑫와 같다.
  }

  validateSection165_4Era(form, acquisitionMode, errors);

  // ── R-1' 매매사례가액 (영§176의2③1호) ──
  if (acquisitionMode === "sale_case") {
    const isListed = ["kospi", "kosdaq", "konex"].includes(form.marketType);
    if (isListed) {
      errors.push({
        field: "acquisitionMode",
        message: "매매사례가액 모드는 비상장·기타자산 전용입니다 (영§176의2③1호 단서 — 주권상장법인 주식등 제외)",
        severity: "error",
      });
    }
    const samplePrice = parseI(form.acquisitionMarketSamplePrice);
    const legacyPrice = parseI(form.perShareAcquisitionPrice);
    if (samplePrice <= 0 && legacyPrice <= 0) {
      errors.push({
        field: "acquisitionMarketSamplePrice",
        message: "취득 매매사례 1주당 가액을 입력하세요 (또는 1주당 취득가액으로 대체)",
        severity: "error",
      });
    }
    // 개산공제 base = 취득당시 기준시가 (소득세법 §97②2호 본문 · 영 §163⑥4) — 비상장·기타자산 주식등은
    // §99①4 → 영 §165④ 보충평가라 취득연도 순손익·순자산이 필요하다. 이 칸이 없으면 필요경비가 0이 된다.
    if (!isListed) {
      validateAcquisitionSideUnlistedFields(form, errors, "매매사례가액 개산공제 기준시가 — 소령 §163⑥4·§165④");
    }
  }

  // ── 영 §176의2④2호 — 1965.01 이전 취득의 ②는 PPI 계열 밖이라 직접 입력 배율이 필요하다 (Z-1) ──
  // ⑫(`stock-transfer-tax-refines.ts`)와 같은 조건 — ②가 산정되는 입력일 때만(실가 모드 항상 · 환산·매매사례는 실가 동시 입력 시).
  if (
    isPreDeemedPurchaseForm(form) &&
    isBeforePpiSeries(form.acquisitionDate) &&
    (acquisitionMode === "actual" || parseF(form.preDeemedActualPricePerShare) > 0) &&
    !(parseF(form.preDeemedPpiRatio) > 0)
  ) {
    errors.push({ field: "preDeemedPpiRatio", message: PRE_DEEMED_PPI_RATIO_REQUIRED_MESSAGE, severity: "error" });
  }

  // ── 영 §163⑨ — 증여·상속 취득가액은 평가액(실지거래가액 의제) → 매매사례 불가 · 환산은 장부분실일 때만 (국심2007중1761) ──
  // ⑫(`stock-transfer-tax-refines.ts`)·복원 마이그레이션·엔진 B·⑤와 같은 술어.
  if (isGiftLikeEstimationBlocked(form.acquisitionCause, acquisitionMode, isBookLostAtAcquisitionForm(form))) {
    errors.push({ field: "acquisitionMode", message: GIFT_LIKE_ESTIMATION_BLOCKED_MESSAGE, severity: "error" });
  }

  // ── 과세 무상주 — 취득가액은 액면가액(법정)이라 실가 모드만 (소령 §27①1호 가목) ──
  // ⑤ 라디오·③ 복원과 같은 술어. ⑫는 원인을 모른다(④가 「매매」로 매핑) — 여기가 실질 관문이다.
  const preDeemed = isPreDeemedPurchaseForm(form);
  if (isBonusTaxedEstimationBlocked(form.acquisitionCause, acquisitionMode, preDeemed)) {
    errors.push({ field: "acquisitionMode", message: BONUS_TAXED_ACTUAL_ONLY_MESSAGE, severity: "error" });
  }
  // 의제취득일 전 과세 무상주 — 추계 모드면 ②의 액면가액 필수 (영 §176의2④ 「많은 것」 비교)
  if (isBonusTaxedPreDeemedFaceValueMissing(form.acquisitionCause, acquisitionMode, preDeemed, form.preDeemedActualPricePerShare)) {
    errors.push({ field: "preDeemedActualPricePerShare", message: BONUS_TAXED_PRE_DEEMED_FACE_VALUE_REQUIRED_MESSAGE, severity: "error" });
  }

  // ── 이월과세 증여자 기준 환산의 분모 (§97의2①1호 → §97①1호 나목) ──
  // 분모가 비면 A 취득가액이 0 → A 세액이 커져 ②3호가 A를 «채택»한다 — 조용한 과대과세라 오류로 막는다
  // (증여자 값 누락은 Phase 3 정책대로 step1 경고 — 계획서 §7.1).
  if (isDonorConversionForm(form)) {
    const listed = ["kospi", "kosdaq", "konex"].includes(form.marketType);
    const haltAtTransfer =
      form.acquisitionStdMode === "halt_transfer" && !isTradingHaltMarketScopeViolation(form.marketType);
    if (listed && !haltAtTransfer) {
      validateTransferStdAvg(form, errors);
    } else {
      for (const key of requiredUnlistedValuationKeys({
        scope: "transfer",
        niSkip: netIncomeSkipBySide(form),
        acqFaceValueOnly: false,
      })) {
        if (key === "acqFaceValuePerShare") continue;
        if (isEmpty(form[key])) {
          errors.push({
            field: key,
            message: `${SIMPLE_FIELD_MESSAGE[key]} — 이월과세 증여자 기준 환산의 분모(양도 당시 기준시가)`,
            severity: "error",
          });
        }
      }
    }
  }

  // ── R-2 자본조정 ──
  if (form.capitalAdjustments && form.capitalAdjustments.length > 0) {
    // [A-2] split 차단 제거 (단일·분할 공통). 분할은 lot별 희석 전처리로 지원.
    const isSplit = (form.lotsMode || "single") === "split";
    const acqDateStr = form.acquisitionDate;
    const trnDateStr = form.transferDate;
    form.capitalAdjustments.forEach((adj, idx) => {
      const ratio = parseF(adj.ratio);
      if (ratio <= 0) {
        errors.push({ field: `capitalAdjustments[${idx}].ratio`, message: `자본조정 #${idx + 1}: 비율은 0보다 커야 합니다`, severity: "error" });
      }
      if ((adj.type === "reduction_proportional" || adj.type === "reduction_capital_return") && ratio >= 1) {
        errors.push({ field: `capitalAdjustments[${idx}].ratio`, message: `자본조정 #${idx + 1}: 감자비율은 1 미만이어야 합니다 (100% 감자는 청산)`, severity: "error" });
      }
      if (adj.type.startsWith("bonus_") && ratio > 10) {
        errors.push({ field: `capitalAdjustments[${idx}].ratio`, message: `자본조정 #${idx + 1}: 무상증자 배정비율 10 초과 — 입력 확인 권장`, severity: "warning" });
      }
      if (isEmpty(adj.eventDate)) {
        errors.push({ field: `capitalAdjustments[${idx}].eventDate`, message: `자본조정 #${idx + 1}: 발생일을 입력하세요`, severity: "error" });
      } else if (!isSplit) {
        // [A-2 STEP13-17] 폼-전역 취득일·양도일 대비 검증은 단일 모드 전용.
        //   분할 모드는 lot별 취득일이라 글로벌 날짜 비교 부적합 → 엔진이 lot별 skip-with-warning 처리.
        if (!isEmpty(acqDateStr) && adj.eventDate <= acqDateStr) {
          errors.push({ field: `capitalAdjustments[${idx}].eventDate`, message: `자본조정 #${idx + 1}: 발생일이 취득일 이전입니다 — 종전 보유자에게만 영향`, severity: "error" });
        }
        if (!isEmpty(trnDateStr) && adj.eventDate > trnDateStr) {
          errors.push({ field: `capitalAdjustments[${idx}].eventDate`, message: `자본조정 #${idx + 1}: 발생일이 양도일 이후입니다 — 본 양도 산정에 미반영`, severity: "error" });
        }
      }
    });
  }

  return errors;
}
