/**
 * 주식 양도소득세 Validation (14지점 ⑧)
 *
 * UI 통과 ↔ validate 차단 모순 방지:
 *   API 변환·UI에서 적용하는 fallback과 동일 fallback을 여기서도 적용.
 *
 * 3중 패턴 적용 (feedback_validation_sync_8th_point):
 *   - acquisitionMode || "actual"
 *   - transferPriceMode || "actual"
 *   - acquisitionCause || "purchase"
 *   - filingType || "preliminary"
 *   - acquiredBeforeListing ?? false
 *   - tradingHaltAtTransfer ?? false
 *   - isVentureCompany ?? false
 *   - isKOTCTrading ?? false
 *   - isLargestShareholderGroup ?? false
 *   - bookLost ?? false
 *   - isElectronicFiling ?? false
 *   - filingViolation || "none"
 *   - isFraudulent ?? false
 *   - isInternationalTransaction ?? false
 *   - realEstateGroupBasicDeductionUsed ?? 0
 *
 * 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback).
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import {
  validateStep1Foreign,
  validateStep2Foreign,
  validateStep3Foreign,
} from "./stock-transfer-tax-validate-foreign";
import {
  validateStep1ExitTax,
  validateStep2ExitTax,
  validateStep3ExitTax,
} from "./stock-transfer-tax-validate-exit";
import { validateStep2Domestic } from "./stock-transfer-tax-validate-step2";

export interface StockValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

function parseF(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseI(s: string): number {
  const n = parseInt(s.replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

function isEmpty(s: string | undefined): boolean {
  return !s || s.trim() === "";
}

/** 통화 문자열("1,000,000") → 숫자. 빈값·비수치는 0 */
function amountOf(s: string | undefined): number {
  const n = Number((s ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// ============================================================
// Step별 validation (마법사 단계 진입 전 검증)
// ============================================================

/**
 * Step 1 검증 — 시장·대주주·취득원인·일자·수량
 */
export function validateStep1(form: StockTransferFormData): StockValidationError[] {
  const errors: StockValidationError[] = [];

  // 종목명 필수 (저장·이력·신고서 표시용 메타데이터)
  if (isEmpty(form.securityName)) {
    errors.push({ field: "securityName", message: "종목명을 입력하세요", severity: "error" });
  }

  // 시장 분류 필수
  if (!form.marketType) {
    errors.push({ field: "marketType", message: "시장 유형을 선택하세요", severity: "error" });
  }

  // 외국법인 차단 (레거시 enum 값 — 현재는 foreign_stock 사용)
  if ((form.marketType as string) === "out_of_scope_foreign") {
    errors.push({
      field: "marketType",
      message: "해외주식(§94①3 다목)은 별도 도메인입니다. 이 계산기는 국내주식만 지원합니다.",
      severity: "error",
    });
  }

  // PR-4A 해외주식 전용 Step1 검증 (validate-foreign.ts 분리)
  if (form.marketType === "foreign_stock") {
    errors.push(...validateStep1Foreign(form));
    // 해외주식은 대주주·기타자산·lot 분기 검증 스킵 (별도 도메인)
    return errors;
  }

  // PR-4B 국외전출세 전용 Step1 검증 (validate-exit.ts 분리)
  if (form.marketType === "exit_tax") {
    errors.push(...validateStep1ExitTax(form));
    // 국외전출세는 국내 대주주·기타자산·lot 분기 검증 스킵 (별도 도메인)
    return errors;
  }

  // 기타자산: 과점주주 or 부동산과다보유 최소 1개 필수
  if (form.marketType === "other_asset") {
    if (!form.isQualifyingBlockShareholder && !form.isHeavyRealEstateForRate) {
      errors.push({
        field: "otherAsset",
        message: "기타자산은 §94①4 다목(과점주주) 또는 라목(부동산과다보유법인) 중 하나 이상 해당해야 합니다",
        severity: "error",
      });
    }
  }

  // 대주주 판정 기준일 — 판정 대상 시장에서 필수 (시행령 §157④ "직전 사업연도 종료일 현재")
  // FieldCard는 이미 required로 표시하고 있었으나 검증이 없어 표시/검증이 어긋나 있었다.
  // 미입력을 통과시키면 API가 오늘 날짜로 채워 과거 양도 건에 현재 임계를 적용한다.
  if (
    form.marketType === "kospi" ||
    form.marketType === "kosdaq" ||
    form.marketType === "konex" ||
    form.marketType === "unlisted"
  ) {
    if (isEmpty(form.priorYearEndDate)) {
      errors.push({
        field: "priorYearEndDate",
        message: "대주주 판정 기준일(직전 사업연도 종료일)을 입력하세요 (시행령 §157④)",
        severity: "error",
      });
    }
  }

  // 대주주 판정 — 지분·시총 최소 1개 입력 필요
  if (form.isMajorShareholder) {
    const hasAny =
      parseF(form.selfShareRatio) > 0 ||
      parseI(form.selfMarketCap) > 0 ||
      parseF(form.combinedShareRatio) > 0 ||
      parseI(form.combinedMarketCap) > 0;
    if (!hasAny) {
      errors.push({
        field: "majorShareholder",
        message: "대주주인 경우 지분율 또는 시가총액을 1개 이상 입력하세요 (시행령 §157)",
        severity: "error",
      });
    }
  }

  // F-15·F-16 (2026-05-19) — 대차/사모펀드 자동 가산 입력 검증 (비음수 정수)
  const lentRaw = form.lentSharesCount?.trim();
  if (lentRaw && lentRaw !== "" && lentRaw !== "0") {
    const lent = parseI(form.lentSharesCount);
    if (!Number.isFinite(lent) || lent < 0) {
      errors.push({
        field: "lentSharesCount",
        message: "대차주식 수는 0 이상 정수여야 합니다 (시행령 §157 2013.2.15.~)",
        severity: "error",
      });
    }
  }
  const pefRaw = form.pefIndirectSharesCount?.trim();
  if (pefRaw && pefRaw !== "" && pefRaw !== "0") {
    const pef = parseI(form.pefIndirectSharesCount);
    if (!Number.isFinite(pef) || pef < 0) {
      errors.push({
        field: "pefIndirectSharesCount",
        message: "사모펀드 간접소유 주식 수는 0 이상 정수여야 합니다 (시행령 §157 2013.2.15.~)",
        severity: "error",
      });
    }
  }

  // F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 override 검증
  // basis 가 default 가 아니면 override 일자 필수
  if (form.judgmentBasis && form.judgmentBasis !== "default") {
    if (!form.judgmentDateOverride || !/^\d{4}-\d{2}-\d{2}$/.test(form.judgmentDateOverride)) {
      errors.push({
        field: "judgmentDateOverride",
        message:
          "특수 판정 사유(합병/분할/신설법인)를 선택한 경우 기준일자가 필요합니다 " +
          "(합병등기일·분할등기일·설립등기일 등)",
        severity: "error",
      });
    }
  }
  // override 일자만 입력하고 basis 가 default 이면 효과 없음 — 경고
  if (form.judgmentDateOverride && (!form.judgmentBasis || form.judgmentBasis === "default")) {
    errors.push({
      field: "judgmentBasis",
      message: "판정 기준일 override 일자를 사용하려면 사유(합병/분할/신설법인)를 선택하세요",
      severity: "warning",
    });
  }

  // 분할 매수·분할 양도 모드 분기 (Plan v2.2) — 폼-전역 acquisitionDate/transferDate는 single 한정
  const lotsMode = form.lotsMode || "single";

  if (lotsMode === "single") {
    // 취득일 필수
    if (isEmpty(form.acquisitionDate)) {
      errors.push({ field: "acquisitionDate", message: "취득일을 입력하세요", severity: "error" });
    }
    // 양도일 필수
    if (isEmpty(form.transferDate)) {
      errors.push({ field: "transferDate", message: "양도일을 입력하세요", severity: "error" });
    }
    // 양도일 < 취득일 — 음수 보유기간
    if (!isEmpty(form.acquisitionDate) && !isEmpty(form.transferDate)) {
      const acqDate = new Date(form.acquisitionDate);
      const trnDate = new Date(form.transferDate);
      if (trnDate < acqDate) {
        errors.push({
          field: "transferDate",
          message: "양도일이 취득일보다 이전입니다. 일자를 확인하세요",
          severity: "error",
        });
      }
    }
  }

  // 주식수 필수 검증 — single 모드 한정 (split 모드는 lot 배열로 대체)
  if (lotsMode === "single") {
    if (isEmpty(form.shareCount) || parseI(form.shareCount) <= 0) {
      errors.push({ field: "shareCount", message: "양도 주식수를 입력하세요", severity: "error" });
    }
  } else {
    // split 모드 검증
    if (!form.acquisitionLots || form.acquisitionLots.length === 0) {
      errors.push({ field: "acquisitionLots", message: "매수 lot을 1행 이상 입력하세요", severity: "error" });
    }
    if (!form.transferLots || form.transferLots.length === 0) {
      errors.push({ field: "transferLots", message: "매도 lot을 1행 이상 입력하세요", severity: "error" });
    }
    // lot별 검증
    (form.acquisitionLots || []).forEach((lot, i) => {
      if (isEmpty(lot.acquisitionDate)) {
        errors.push({ field: `acquisitionLots[${i}].acquisitionDate`, message: `매수 lot #${i + 1}의 취득일을 입력하세요`, severity: "error" });
      }
      if (parseI(lot.shareCount) <= 0) {
        errors.push({ field: `acquisitionLots[${i}].shareCount`, message: `매수 lot #${i + 1}의 주식수는 0보다 커야 합니다`, severity: "error" });
      }
      if (parseI(lot.perShareAcquisitionPrice) <= 0) {
        errors.push({ field: `acquisitionLots[${i}].perShareAcquisitionPrice`, message: `매수 lot #${i + 1}의 1주당 단가는 0보다 커야 합니다 (C-22)`, severity: "error" });
      }
      if (lot.acquisitionCause === "inheritance" && isEmpty(lot.decedentAcquisitionDate)) {
        errors.push({ field: `acquisitionLots[${i}].decedentAcquisitionDate`, message: `매수 lot #${i + 1} (상속): 피상속인 취득일을 입력하세요 (§104②1)`, severity: "error" });
      }
      if (lot.acquisitionCause === "carryover_gift" && isEmpty(lot.donorAcquisitionDate)) {
        errors.push({ field: `acquisitionLots[${i}].donorAcquisitionDate`, message: `매수 lot #${i + 1} (이월과세): 증여자 취득일을 입력하세요 (§104②2)`, severity: "error" });
      }
      // §97의2① 본문 요건 — 미선택이면 엔진이 「배제하지 않음」으로 흘려보낸다(단건과 같은 규약).
      if (lot.acquisitionCause === "carryover_gift" && isEmpty(lot.donorRelation)) {
        errors.push({ field: `acquisitionLots[${i}].donorRelation`, message: `매수 lot #${i + 1} (이월과세): 증여자와의 관계를 선택하세요 (§97의2① 본문)`, severity: "error" });
      }
      // 승계 효과가 0이면 ②3호로 배제된다 — 차단이 아니라 경고다.
      if (lot.acquisitionCause === "carryover_gift" && isEmpty(lot.donorAcquisitionPrice)) {
        errors.push({ field: `acquisitionLots[${i}].donorAcquisitionPrice`, message: `매수 lot #${i + 1} (이월과세): 증여자 취득가액이 없으면 취득가액이 승계되지 않습니다 (§97의2①1호)`, severity: "warning" });
      }
      /**
       * ①3호 증여세는 **산출세액과 과세가액이 짝**이다 — 영 §163의2②가 둘의 비율로 안분하므로
       * 한쪽만 있으면 계산되지 않고 조용히 0이 된다(단건 축의 안분 3종 짝 규칙과 같다).
       * 분자(양도한 자산가액)는 엔진이 매도 주식수 × 증여 당시 평가액으로 구한다.
       */
      if (lot.acquisitionCause === "carryover_gift") {
        const hasGiftTax = parseI(lot.donorGiftTaxAmount ?? "") > 0;
        const hasGiftBase = parseI(lot.donorGiftTaxableValue ?? "") > 0;
        if (hasGiftTax !== hasGiftBase) {
          errors.push({
            field: `acquisitionLots[${i}].donorGiftTaxableValue`,
            message: `매수 lot #${i + 1} (이월과세): 증여세 산출세액과 과세가액을 함께 입력하세요 (영 §163의2② 안분)`,
            severity: "error",
          });
        }
      }
      if (lot.acquisitionCause === "merger_split" && isEmpty(lot.preMergerAcquisitionDate)) {
        errors.push({ field: `acquisitionLots[${i}].preMergerAcquisitionDate`, message: `매수 lot #${i + 1} (합병·분할): 종전 주식 취득일을 입력하세요 (§104②3)`, severity: "error" });
      }
    });
    (form.transferLots || []).forEach((lot, i) => {
      if (isEmpty(lot.transferDate)) {
        errors.push({ field: `transferLots[${i}].transferDate`, message: `매도 lot #${i + 1}의 양도일을 입력하세요`, severity: "error" });
      }
      if (parseI(lot.shareCount) <= 0) {
        errors.push({ field: `transferLots[${i}].shareCount`, message: `매도 lot #${i + 1}의 주식수는 0보다 커야 합니다`, severity: "error" });
      }
      if (parseI(lot.perShareTransferPrice) <= 0) {
        errors.push({ field: `transferLots[${i}].perShareTransferPrice`, message: `매도 lot #${i + 1}의 1주당 단가는 0보다 커야 합니다 (C-23)`, severity: "error" });
      }
    });
    // 매도 ≤ 매수
    const totalAcq = (form.acquisitionLots || []).reduce((s, l) => s + parseI(l.shareCount), 0);
    const totalTrn = (form.transferLots || []).reduce((s, l) => s + parseI(l.shareCount), 0);
    if (totalTrn > totalAcq) {
      errors.push({ field: "transferLots", message: `총 매도 수량(${totalTrn})이 총 매수 수량(${totalAcq})을 초과합니다`, severity: "error" });
    }
    // specific 매칭 검증
    const costMethod = form.costAllocationMethod || "fifo";
    if (costMethod === "specific") {
      (form.transferLots || []).forEach((trn, i) => {
        const matchedSum = (form.specificMatchings || [])
          .filter((m) => m.transferLotId === trn.id)
          .reduce((s, m) => s + parseI(m.shareCount), 0);
        if (matchedSum !== parseI(trn.shareCount)) {
          errors.push({
            field: `specificMatchings`,
            message: `매도 lot #${i + 1}의 매칭 합계(${matchedSum})가 매도 수량(${trn.shareCount})과 다릅니다 (C-20)`,
            severity: "error",
          });
        }
      });
      (form.acquisitionLots || []).forEach((acq, i) => {
        const matchedSum = (form.specificMatchings || [])
          .filter((m) => m.acquisitionLotId === acq.id)
          .reduce((s, m) => s + parseI(m.shareCount), 0);
        if (matchedSum > parseI(acq.shareCount)) {
          errors.push({
            field: `specificMatchings`,
            message: `매수 lot #${i + 1}에 매칭된 합계(${matchedSum})가 lot 수량(${acq.shareCount})을 초과합니다 (C-20b)`,
            severity: "error",
          });
        }
      });
    }
  }

  // 발행주식총수 필수
  if (isEmpty(form.totalIssuedShares) || parseI(form.totalIssuedShares) <= 0) {
    errors.push({ field: "totalIssuedShares", message: "발행주식 총수를 입력하세요", severity: "error" });
  }

  // 지분율 입력 모드 — shares 모드 시 분자 필수 + 분자 ≤ 분모 (3중 패턴: mode || "direct")
  const selfMode = form.selfShareRatioMode || "direct";
  if (selfMode === "shares") {
    if (isEmpty(form.selfOwnedShares) || parseI(form.selfOwnedShares) < 0) {
      errors.push({
        field: "selfOwnedShares",
        message: "본인 보유 주식수를 입력하세요",
        severity: "error",
      });
    } else if (
      !isEmpty(form.totalIssuedShares) &&
      parseI(form.selfOwnedShares) > parseI(form.totalIssuedShares)
    ) {
      errors.push({
        field: "selfOwnedShares",
        message: "본인 보유 주식수가 총 발행주식수를 초과합니다",
        severity: "error",
      });
    }
  }
  const combinedMode = form.combinedShareRatioMode || "direct";
  if (form.isLargestShareholderGroup && combinedMode === "shares") {
    if (isEmpty(form.combinedOwnedShares) || parseI(form.combinedOwnedShares) < 0) {
      errors.push({
        field: "combinedOwnedShares",
        message: "본인+특수관계인 합산 보유 주식수를 입력하세요",
        severity: "error",
      });
    } else if (
      !isEmpty(form.totalIssuedShares) &&
      parseI(form.combinedOwnedShares) > parseI(form.totalIssuedShares)
    ) {
      errors.push({
        field: "combinedOwnedShares",
        message: "합산 보유 주식수가 총 발행주식수를 초과합니다",
        severity: "error",
      });
    }
  }

  // 취득원인 보조 일자 검증 (3중 패턴: acquisitionCause || "purchase")
  const acquisitionCause = form.acquisitionCause || "purchase";
  if (acquisitionCause === "inheritance" && isEmpty(form.decedentAcquisitionDate)) {
    errors.push({
      field: "decedentAcquisitionDate",
      message: "상속의 경우 피상속인 취득일을 입력하세요 (§104②1 — 단기 30% 기산점)",
      severity: "error",
    });
  }
  if (acquisitionCause === "carryover_gift") {
    if (isEmpty(form.donorAcquisitionDate)) {
      errors.push({
        field: "donorAcquisitionDate",
        message: "이월과세(증여)의 경우 증여자 취득일을 입력하세요 (§104②2 — 단기 30% 기산점)",
        severity: "error",
      });
    }
    /**
     * §97의2① **본문 요건**이라 필수다 — 배우자·직계존비속이 아니면 애초에 대상이 아니고,
     * 사망 여부에 따라 적용이 갈린다. 미선택이면 엔진이 「배제하지 않음」으로 흘려보내므로
     * 여기서 막지 않으면 사용자가 모른 채 적용받는다.
     */
    if (isEmpty(form.donorRelation)) {
      errors.push({
        field: "donorRelation",
        message: "이월과세(증여)의 경우 증여자와의 관계를 선택하세요 (§97의2① 본문)",
        severity: "error",
      });
    }
    /**
     * ⚠️ **취득가액·증여세는 필수가 아니다** — 증여자 실지거래가액을 확인할 수 없으면
     * §97①1호 **나목**(환산)으로 가고, 증여세가 없을 수도 있다. API zod도 전부 optional이라
     * 두 계층 기준이 같다(⑧⑩ 정합 — 한쪽만 조이면 「UI 통과 → API 400」이 된다).
     *
     * 다만 **둘 다 비면 승계 효과가 0**이라 §97의2②3호로 배제되는 것이 보통이다.
     * 그 사실은 결과 카드가 알린다(사전 차단하지 않는다 — 법 근거 없이 입력을 막지 않는다).
     */
    const hasDonorBasis =
      !isEmpty(form.donorAcquisitionPrice) || !isEmpty(form.donorAcquisitionStdPrice);
    if (!hasDonorBasis) {
      errors.push({
        field: "donorAcquisitionPrice",
        message:
          "증여자 취득가액 또는 증여자 취득 당시 기준시가 중 하나를 입력하세요 " +
          "(§97의2①1호 — 없으면 취득가액이 승계되지 않아 이월과세가 배제됩니다)",
        severity: "warning",
      });
    }
    // 영 §163의2② 안분 — 증여세를 넣었으면 분자·분모가 함께 있어야 계산된다.
    if (!isEmpty(form.giftTaxAmount)) {
      if (isEmpty(form.transferredAssetValue) || isEmpty(form.giftTaxableValue)) {
        errors.push({
          field: "giftTaxableValue",
          message:
            "증여세 산출세액을 입력했다면 양도한 해당 자산가액과 증여세 과세가액도 입력하세요 " +
            "(영 §163의2② 안분 분자·분모)",
          severity: "error",
        });
      }
    }
  }
  if (acquisitionCause === "merger_split" && isEmpty(form.preMergerAcquisitionDate)) {
    errors.push({
      field: "preMergerAcquisitionDate",
      message: "합병·분할의 경우 종전 주식 취득일을 입력하세요 (§104②3)",
      severity: "error",
    });
  }

  // 3년 누적 양도 비율 > 100 금지 (UI는 % 단위, "100" = 100%)
  const cumRatio = parseF(form.cumulativeTransferRatio);
  if (form.cumulativeTransferRatio && cumRatio > 100) {
    errors.push({
      field: "cumulativeTransferRatio",
      message: "3년 누적 양도 비율은 100%를 초과할 수 없습니다",
      severity: "error",
    });
  }

  // §104①9호 비사업용토지 가액 비율 > 100 금지 (Zod가 0~1 소수로 max(1)을 걸므로 UI에서도 동일 상한)
  // ⚠️ **미입력은 오류가 아니다** — 9호 미해당으로 흐른다(법 근거 없이 불리 적용 금지).
  //    API·엔진도 같은 fallback이라 3중이 일치한다(memory `mirror-pattern`).
  // ⚠️ `parseF`는 `s.replace`를 부르므로 **가드를 먼저** 건다 — 이 필드는 신규라
  //   normalize를 거치지 않은 폼(레거시 sessionStorage·테스트 픽스처)에서 `undefined`일 수 있다.
  //   (형제 `cumulativeTransferRatio`는 선행 필드라 항상 존재해 가드 순서가 문제되지 않았다.)
  if (form.nblRatioOfCorpAssets && parseF(form.nblRatioOfCorpAssets) > 100) {
    errors.push({
      field: "nblRatioOfCorpAssets",
      message: "비사업용토지 가액 비율은 100%를 초과할 수 없습니다",
      severity: "error",
    });
  }

  return errors;
}

/**
 * Step 2 검증 — 양도가액·취득가액·환산 입력
 */
export function validateStep2(form: StockTransferFormData): StockValidationError[] {
  // PR-4A 해외주식 → validate-foreign.ts (800줄 정책 분리)
  if (form.marketType === "foreign_stock") return validateStep2Foreign(form);
  // PR-4B 국외전출세 → validate-exit.ts (800줄 정책 분리)
  if (form.marketType === "exit_tax") return validateStep2ExitTax(form);
  // 국내주식 본체 → validate-step2.ts (800줄 정책 분리)
  return validateStep2Domestic(form);
}

/**
 * Step 3 검증 — 필요경비·신고
 */
export function validateStep3(form: StockTransferFormData): StockValidationError[] {
  // PR-4A 해외주식 → validate-foreign.ts
  if (form.marketType === "foreign_stock") return validateStep3Foreign(form);
  // PR-4B 국외전출세 → validate-exit.ts
  if (form.marketType === "exit_tax") return validateStep3ExitTax(form);

  const errors: StockValidationError[] = [];

  // 3중 패턴 fallback. 소령 §163⑥4 — expenseMode는 acquisitionMode에서 자동 도출.
  const acquisitionMode = form.acquisitionMode || "actual";
  const isEstimatedAcq =
    acquisitionMode === "estimated" ||
    acquisitionMode === "sale_case" ||
    acquisitionMode === "face_value";
  const expenseMode: "actual" | "estimated" = isEstimatedAcq ? "estimated" : "actual";

  // 신고일 필수
  if (isEmpty(form.filingDate)) {
    errors.push({ field: "filingDate", message: "신고일을 입력하세요", severity: "error" });
  }

  // 부정행위·국제거래 가산세는 신고 위반이 전제 (Zod refine과 3중 동기 — 14지점 ⑧)
  const filingViolation = form.filingViolation || "none";
  if (filingViolation === "none" && (form.isFraudulent || form.isInternationalTransaction)) {
    errors.push({
      field: "filingViolation",
      message: "부정행위·국제거래 가산세는 신고 위반(과소신고 또는 무신고)이 전제됩니다. 신고 위반 여부를 선택하세요.",
      severity: "error",
    });
  }

  /**
   * 납부지연가산세(국세기본법 §47조의4①1호)는 **미납세액과 법정납부기한이 둘 다** 있어야
   * 계산된다 — 경과일수를 기한 다음 날부터 세기 때문이다. 기한 없이 미납세액만 넣으면
   * 엔진이 **조용히 0을 반환**하므로, 「입력했는데 안 잡힌다」가 되지 않게 여기서 막는다
   * (자동 fallback 금지 — 미입력은 검증 오류로 차단).
   */
  if (amountOf(form.unpaidTax) > 0 && isEmpty(form.paymentDeadline)) {
    errors.push({
      field: "paymentDeadline",
      message: "납부지연가산세를 계산하려면 법정납부기한을 입력하세요 (경과일수 기산점입니다).",
      severity: "error",
    });
  }

  return errors;
}

/**
 * 전체 단계 통합 검증 (계산 실행 전)
 */
export function validateAllSteps(form: StockTransferFormData): StockValidationError[] {
  return [
    ...validateStep1(form),
    ...validateStep2(form),
    ...validateStep3(form),
  ];
}

/**
 * ⑧ 다종목 — **확정한 종목 전부**를 계산 전에 검증한다.
 *
 * ## 왜 필요한가 (V-3 실측 2026-08-27)
 *
 * 종목 확정 게이트는 **종목명·시장 2개**뿐이다(사용자가 종목을 오가며 채우는 흐름을 막지
 * 않으려는 의도적 설계). 문제는 그 뒤였다 — 불완전한 종목이 목록에 남은 채 계산하면:
 *
 *   1. `buildStockTransferApiBody` 가 나머지를 기본값으로 채워 **Zod 가 통과**하고,
 *   2. 엔진에서 `transferDate.getTime is not a function` 으로 **터진다**(500).
 *
 * 사용자에게는 그냥 「계산 오류」라 **어느 종목이 문제인지 알 길이 없다**. 종목이 5건이면
 * 하나씩 지워 보는 수밖에 없다.
 *
 * ⇒ 계산 전에 **순번과 종목명으로 지목**해 막는다. 종목당 **첫 오류만** 보고한다 —
 *   한 종목이 오류 10건을 쏟으면 목록이 읽히지 않는다.
 *
 * ⚠️ 서버 방어는 별개다 — `stockTransferInputSchema` 의 날짜 칸이 빈 문자열을 거부한다(⑫).
 *   클라이언트 검증만 두면 API 를 직접 호출하는 경로가 그대로 500 을 만든다.
 */
export function validateFilingItems(
  forms: StockTransferFormData[],
): StockValidationError[] {
  const errors: StockValidationError[] = [];
  forms.forEach((form, i) => {
    const first = validateAllSteps(form).find((e) => e.severity === "error");
    if (!first) return;
    const label = form.securityName?.trim()
      ? `${i + 1}번째 종목 「${form.securityName.trim()}」`
      : `${i + 1}번째 종목`;
    errors.push({
      field: first.field,
      message: `${label}: ${first.message}`,
      severity: "error",
    });
  });
  return errors;
}

/**
 * 특정 step의 에러 개수 (StepIndicator 배지용)
 */
export function getStepErrorCount(form: StockTransferFormData, step: number): number {
  switch (step) {
    case 0: return validateStep1(form).filter((e) => e.severity === "error").length;
    case 1: return validateStep2(form).filter((e) => e.severity === "error").length;
    case 2: return validateStep3(form).filter((e) => e.severity === "error").length;
    default: return 0;
  }
}
