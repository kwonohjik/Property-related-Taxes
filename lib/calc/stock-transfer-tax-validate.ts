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
 *   - isFraudulent ?? false
 *   - isInternationalTransaction ?? false
 *   - realEstateGroupBasicDeductionUsed ?? 0
 *
 * 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback).
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

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

// ============================================================
// Step별 validation (마법사 단계 진입 전 검증)
// ============================================================

/**
 * Step 1 검증 — 시장·대주주·취득원인·일자·수량
 */
export function validateStep1(form: StockTransferFormData): StockValidationError[] {
  const errors: StockValidationError[] = [];

  // 시장 분류 필수
  if (!form.marketType) {
    errors.push({ field: "marketType", message: "시장 유형을 선택하세요", severity: "error" });
  }

  // 외국법인 차단
  if ((form.marketType as string) === "out_of_scope_foreign") {
    errors.push({
      field: "marketType",
      message: "해외주식(§94①3 다목)은 별도 도메인입니다. 이 계산기는 국내주식만 지원합니다.",
      severity: "error",
    });
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
  if (acquisitionCause === "merger_split" && isEmpty(form.preMergerAcquisitionDate)) {
    errors.push({
      field: "preMergerAcquisitionDate",
      message: "합병·분할의 경우 종전 주식 취득일을 입력하세요 (§104②3)",
      severity: "error",
    });
  }

  // 3년 누적 양도 비율 > 1 금지
  const cumRatio = parseF(form.cumulativeTransferRatio);
  if (form.cumulativeTransferRatio && cumRatio > 1) {
    errors.push({
      field: "cumulativeTransferRatio",
      message: "3년 누적 양도 비율은 100%를 초과할 수 없습니다",
      severity: "error",
    });
  }

  return errors;
}

/**
 * Step 2 검증 — 양도가액·취득가액·환산 입력
 */
export function validateStep2(form: StockTransferFormData): StockValidationError[] {
  const errors: StockValidationError[] = [];

  // 3중 패턴 fallback
  const transferPriceMode = form.transferPriceMode || "actual";
  const acquisitionMode = form.acquisitionMode || "actual";
  const lotsMode = form.lotsMode || "single";

  // 분할 모드 호환성 (Plan v2.2 — UI 사전 차단 외 이중 검증)
  if (lotsMode === "split") {
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
    // perShareTransferPrice·perShareAcquisitionPrice 필수 검증은 lot 단위로 처리됨 (validateStep1)
    return errors;
  }

  // ── 양도가액 (single 모드) ──
  if (transferPriceMode === "actual") {
    const actualMode = form.transferActualInputMode || "per_share";  // 3중 패턴 default
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
    const acqInputMode = form.acquisitionActualInputMode || "per_share";  // 3중 패턴 default
    if (acqInputMode === "lots") {
      // ── lots-only 모드 검증 ──
      if (!form.acquisitionLots || form.acquisitionLots.length === 0) {
        errors.push({
          field: "acquisitionLots",
          message: "취득가액 다건 입력 모드: 매수 lot을 1행 이상 입력하세요",
          severity: "error",
        });
      } else {
        // lot별 필드 검증
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
          if (lot.acquisitionCause === "inheritance" && isEmpty(lot.decedentAcquisitionDate)) {
            errors.push({ field: `acquisitionLots[${i}].decedentAcquisitionDate`, message: `매수 lot #${i + 1} (상속): 피상속인 취득일을 입력하세요 (§104②1)`, severity: "error" });
          }
          if (lot.acquisitionCause === "merger_split" && isEmpty(lot.preMergerAcquisitionDate)) {
            errors.push({ field: `acquisitionLots[${i}].preMergerAcquisitionDate`, message: `매수 lot #${i + 1} (합병·분할): 종전 주식 취득일을 입력하세요 (§104②3)`, severity: "error" });
          }
        });
        // 양도 주식수 ≤ 매수 lot 합계
        const totalAcqLots = form.acquisitionLots.reduce((s, l) => s + parseI(l.shareCount), 0);
        const transferShareCount = parseI(form.shareCount);
        if (transferShareCount > totalAcqLots) {
          errors.push({
            field: "acquisitionLots",
            message: `양도 주식수(${transferShareCount})가 매수 lot 합계(${totalAcqLots})를 초과합니다. 매수 lot을 추가하거나 양도 주식수를 줄이세요.`,
            severity: "error",
          });
        }
      }
      // (total + lots 조합 차단 폐기) — 2026-05-18 사용자 요청.
      // API 변환에서 perShareTransferPrice 역산 처리. UI 안내 카드로 잔돈 오차 사전 고지.
      // specific 차단
      if (form.costAllocationMethod === "specific") {
        errors.push({
          field: "costAllocationMethod",
          message: "취득 다건 입력 모드에서는 개별법(specific)을 지원하지 않습니다",
          severity: "error",
        });
      }
    } else {
      // per_share 모드 (기존 검증)
      if (isEmpty(form.perShareAcquisitionPrice) || parseI(form.perShareAcquisitionPrice) < 0) {
        errors.push({ field: "perShareAcquisitionPrice", message: "1주당 취득가액을 입력하세요", severity: "error" });
      }
    }
  } else if (acquisitionMode === "estimated") {
    // 상장 환산 — 양도일 직전 1개월 평균 필수
    const isListed = ["kospi", "kosdaq", "konex"].includes(form.marketType);
    if (isListed) {
      if (isEmpty(form.transferDatePriceAvg1Month)) {
        errors.push({
          field: "transferDatePriceAvg1Month",
          message: "양도일 직전 1개월 종가 평균을 입력하세요 (§99①3)",
          severity: "error",
        });
      }
      // 취득 후 상장 ON 시 — 모드별 매트릭스 (Round 4 H-03·H-07)
      if (form.acquiredBeforeListing) {
        const mode = form.unlistedDetailMode || "simple";

        // 모드 공통 — 상장일 필수
        if (isEmpty(form.listingDate)) {
          errors.push({ field: "listingDate", message: "상장일을 입력하세요 (소령 §165⑤)", severity: "error" });
        }

        // Round 4 H-03 — tradingHalt × acquiredBeforeListing × mode≠simple 조합 차단
        if (form.tradingHaltAtTransfer && mode !== "simple") {
          errors.push({
            field: "tradingHaltAtTransfer",
            message: "거래정지 + 취득 후 상장 상세 입력 조합은 후속 PR 예정입니다. simple 모드를 사용하거나 거래정지 토글을 해제하세요.",
            severity: "error",
          });
        }

        if (mode === "simple") {
          // 4 결과값 직접 입력
          if (isEmpty(form.listingDatePriceAvg1Month)) errors.push({ field: "listingDatePriceAvg1Month", message: "상장일 이후 1개월 종가평균을 입력하세요", severity: "error" });
          if (isEmpty(form.listingYearNetIncomePerShare)) errors.push({ field: "listingYearNetIncomePerShare", message: "상장연도 1주당 순손익가치를 입력하세요", severity: "error" });
          if (isEmpty(form.listingYearNetAssetPerShare)) errors.push({ field: "listingYearNetAssetPerShare", message: "상장연도 1주당 순자산가치를 입력하세요", severity: "error" });
          if (isEmpty(form.acquisitionYearNetIncomePerShare)) errors.push({ field: "acquisitionYearNetIncomePerShare", message: "취득연도 1주당 순손익가치를 입력하세요", severity: "error" });
          if (isEmpty(form.acquisitionYearNetAssetPerShare)) errors.push({ field: "acquisitionYearNetAssetPerShare", message: "취득연도 1주당 순자산가치를 입력하세요", severity: "error" });
        } else {
          // listing_only / full — 종가 표 + 상장 18필드 필수
          const hasClosingData = form.listingPriceClosing.some((s) => !isEmpty(s));
          if (!hasClosingData) {
            errors.push({ field: "listingPriceClosing", message: "상장일 이후 1개월 종가를 1셀 이상 입력하세요", severity: "error" });
          }
          if (isEmpty(form.niShareCountListing)) {
            errors.push({ field: "niShareCountListing", message: "상장연도 사업연도말 주식수를 입력하세요", severity: "error" });
          }
          if (isEmpty(form.naAssetTotalRow1Listing)) {
            errors.push({ field: "naAssetTotalRow1Listing", message: "상장연도 자산총계를 입력하세요", severity: "error" });
          }
          if (isEmpty(form.naLiabTotalRow8Listing)) {
            errors.push({ field: "naLiabTotalRow8Listing", message: "상장연도 부채총계를 입력하세요", severity: "error" });
          }
          if (isEmpty(form.naShareCountListing)) {
            errors.push({ field: "naShareCountListing", message: "상장연도 순자산 주식수를 입력하세요", severity: "error" });
          }

          if (mode === "listing_only") {
            // 취득연도는 직접 4 필드
            if (isEmpty(form.acquisitionYearNetIncomePerShare)) errors.push({ field: "acquisitionYearNetIncomePerShare", message: "취득연도 1주당 순손익가치를 직접 입력하세요", severity: "error" });
            if (isEmpty(form.acquisitionYearNetAssetPerShare)) errors.push({ field: "acquisitionYearNetAssetPerShare", message: "취득연도 1주당 순자산가치를 직접 입력하세요", severity: "error" });
          } else {
            // full — 취득연도 결산서 필수
            if (isEmpty(form.niShareCountAcq)) {
              errors.push({ field: "niShareCountAcq", message: "취득연도 사업연도말 주식수를 입력하세요", severity: "error" });
            }
            if (isEmpty(form.naAssetTotalRow1Acq)) {
              errors.push({ field: "naAssetTotalRow1Acq", message: "취득연도 자산총계를 입력하세요", severity: "error" });
            }
            if (isEmpty(form.naLiabTotalRow8Acq)) {
              errors.push({ field: "naLiabTotalRow8Acq", message: "취득연도 부채총계를 입력하세요", severity: "error" });
            }
            if (isEmpty(form.naShareCountAcq)) {
              errors.push({ field: "naShareCountAcq", message: "취득연도 순자산 주식수를 입력하세요", severity: "error" });
            }
          }
        }
      }
    } else {
      // 비상장 보충적 평가
      if (isEmpty(form.transferYearNetIncomePerShare)) {
        errors.push({
          field: "transferYearNetIncomePerShare",
          message: "양도연도 1주당 순손익가치를 입력하세요 (소령 §165⑤)",
          severity: "error",
        });
      }
      if (isEmpty(form.transferYearNetAssetPerShare)) {
        errors.push({
          field: "transferYearNetAssetPerShare",
          message: "양도연도 1주당 순자산가치를 입력하세요",
          severity: "error",
        });
      }
    }
  } else if (acquisitionMode === "face_value") {
    // 장부분실 ↔ 액면가 동시 강제 (3중 패턴: bookLost ?? false)
    if (!form.bookLost) {
      errors.push({
        field: "bookLost",
        message: "액면가 모드는 장부분실(§99①4) 확인이 필수입니다",
        severity: "error",
      });
    }
    if (isEmpty(form.faceValuePerShare) || parseI(form.faceValuePerShare) <= 0) {
      errors.push({ field: "faceValuePerShare", message: "1주당 액면가를 입력하세요", severity: "error" });
    }
  } else if (acquisitionMode === "sale_case") {
    // 매매사례가액 — 상장 시장에서는 불가 (8차 추가)
    const isListed = ["kospi", "kosdaq", "konex"].includes(form.marketType);
    if (isListed) {
      errors.push({
        field: "acquisitionMode",
        message: "매매사례가액은 비상장주식에만 적용 가능합니다 (상장주식 선택 불가)",
        severity: "error",
      });
    }
    if (isEmpty(form.perShareAcquisitionPrice)) {
      errors.push({ field: "perShareAcquisitionPrice", message: "1주당 매매사례가액을 입력하세요", severity: "error" });
    }
  }

  // 장부분실 단독 선언 금지 (액면가 모드와 세트)
  if (form.bookLost && acquisitionMode !== "face_value") {
    errors.push({
      field: "bookLost",
      message: "장부분실은 취득가액 모드 '액면가'와 함께 사용해야 합니다 (§99①4)",
      severity: "warning",
    });
  }

  return errors;
}

/**
 * Step 3 검증 — 필요경비·신고
 */
export function validateStep3(form: StockTransferFormData): StockValidationError[] {
  const errors: StockValidationError[] = [];

  // 3중 패턴 fallback
  const acquisitionMode = form.acquisitionMode || "actual";
  const expenseMode = form.expenseMode || "actual";

  // 개산공제 모드 경고 — 환산/액면가 아닌 경우
  if (expenseMode === "estimated" && !["estimated", "face_value"].includes(acquisitionMode)) {
    errors.push({
      field: "expenseMode",
      message: "개산공제(§163⑥)는 환산취득가액 또는 액면가 모드에서 주로 사용됩니다",
      severity: "warning",
    });
  }

  // 신고일 필수
  if (isEmpty(form.filingDate)) {
    errors.push({ field: "filingDate", message: "신고일을 입력하세요", severity: "error" });
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
