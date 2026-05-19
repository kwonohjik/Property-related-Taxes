/**
 * 주식 양도소득세 — Step 2 국내주식 전용 Validation (800줄 정책 분리)
 *
 * stock-transfer-tax-validate.ts에서 validateStep2 국내주식 본체를 추출.
 * 해외주식(foreign_stock)은 validate-foreign.ts로 분리됨.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockValidationError } from "./stock-transfer-tax-validate";

function isEmpty(s: string | undefined): boolean {
  return !s || s.trim() === "";
}

function parseF(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseI(s: string): number {
  const n = parseInt(s.replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
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
    if (form.capitalAdjustments && form.capitalAdjustments.length > 0) {
      errors.push({
        field: "capitalAdjustments",
        message: "자본조정(무상증자·감자)은 단건 모드 전용입니다 (분할 매수 + 자본조정 결합은 후속 PR)",
        severity: "error",
      });
    }
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
          if (lot.acquisitionCause === "inheritance" && isEmpty(lot.decedentAcquisitionDate)) {
            errors.push({ field: `acquisitionLots[${i}].decedentAcquisitionDate`, message: `매수 lot #${i + 1} (상속): 피상속인 취득일을 입력하세요 (§104②1)`, severity: "error" });
          }
          if (lot.acquisitionCause === "merger_split" && isEmpty(lot.preMergerAcquisitionDate)) {
            errors.push({ field: `acquisitionLots[${i}].preMergerAcquisitionDate`, message: `매수 lot #${i + 1} (합병·분할): 종전 주식 취득일을 입력하세요 (§104②3)`, severity: "error" });
          }
        });
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
      if (form.costAllocationMethod === "specific") {
        errors.push({
          field: "costAllocationMethod",
          message: "취득 다건 입력 모드에서는 개별법(specific)을 지원하지 않습니다",
          severity: "error",
        });
      }
    } else {
      if (isEmpty(form.perShareAcquisitionPrice) || parseI(form.perShareAcquisitionPrice) < 0) {
        errors.push({ field: "perShareAcquisitionPrice", message: "1주당 취득가액을 입력하세요", severity: "error" });
      }
    }
  } else if (acquisitionMode === "estimated") {
    const isListed = ["kospi", "kosdaq", "konex"].includes(form.marketType);
    if (isListed) {
      const transferAvg = parseI(form.transferDatePriceAvg1Month);
      const mode = form.transferStdInputMode || "direct";
      if (mode === "direct") {
        if (isEmpty(form.transferDatePriceAvg1Month) || transferAvg <= 0) {
          errors.push({
            field: "transferDatePriceAvg1Month",
            message: "양도일 직전 1개월 종가 평균을 직접 입력하세요 (§163⑨ 환산 분모 — '일자별 입력' 모드 사용 가능)",
            severity: "error",
          });
        }
      } else {
        const hasAnyClose = form.transferPriceClosing?.some((s) => !isEmpty(s) && parseI(s) > 0);
        if (!hasAnyClose) {
          errors.push({
            field: "transferPriceClosing",
            message: "일자별 입력 모드: 양도일 직전 1개월 거래일 종가를 1셀 이상 입력하세요 (§163⑨ 환산 분모 자동 산정용)",
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
      if (!form.acquiredBeforeListing && !form.tradingHaltAtTransfer) {
        if (isEmpty(form.acquisitionDatePriceAvg1Month)) {
          errors.push({
            field: "acquisitionDatePriceAvg1Month",
            message: "취득일 직전 1개월 종가 평균을 입력하세요 (시행령 §163⑨ 환산비율 분자)",
            severity: "error",
          });
        }
      }
      if (form.acquiredBeforeListing) {
        const detailMode = form.unlistedDetailMode || "simple";
        if (isEmpty(form.listingDate)) {
          errors.push({ field: "listingDate", message: "상장일을 입력하세요 (소령 §165⑤)", severity: "error" });
        }
        if (form.tradingHaltAtTransfer && detailMode !== "simple") {
          errors.push({
            field: "tradingHaltAtTransfer",
            message: "거래정지 + 취득 후 상장 상세 입력 조합은 후속 PR 예정입니다. simple 모드를 사용하거나 거래정지 토글을 해제하세요.",
            severity: "error",
          });
        }
        if (detailMode === "simple") {
          if (isEmpty(form.listingDatePriceAvg1Month)) errors.push({ field: "listingDatePriceAvg1Month", message: "상장일 이후 1개월 종가평균을 입력하세요", severity: "error" });
          if (isEmpty(form.listingYearNetIncomePerShare)) errors.push({ field: "listingYearNetIncomePerShare", message: "상장연도 1주당 순손익가치를 입력하세요", severity: "error" });
          if (isEmpty(form.listingYearNetAssetPerShare)) errors.push({ field: "listingYearNetAssetPerShare", message: "상장연도 1주당 순자산가치를 입력하세요", severity: "error" });
          if (isEmpty(form.acquisitionYearNetIncomePerShare)) errors.push({ field: "acquisitionYearNetIncomePerShare", message: "취득연도 1주당 순손익가치를 입력하세요", severity: "error" });
          if (isEmpty(form.acquisitionYearNetAssetPerShare)) errors.push({ field: "acquisitionYearNetAssetPerShare", message: "취득연도 1주당 순자산가치를 입력하세요", severity: "error" });
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
      }
    } else {
      // 비상장 보충적 평가
      const niSkip = (form.netAssetOnlyReason ?? "") !== "";
      const valuationMode = form.unlistedValuationMode || "simple";
      const acqFaceValueOnly = form.acqFaceValueOnly === true;
      if (acqFaceValueOnly) {
        if (isEmpty(form.acqFaceValuePerShare) || parseI(form.acqFaceValuePerShare) <= 0) {
          errors.push({ field: "acqFaceValuePerShare", message: "취득시점 액면가를 입력하세요 (§99①4 후단)", severity: "error" });
        }
      }
      if (valuationMode === "simple") {
        if (!niSkip && isEmpty(form.transferYearNetIncomePerShare)) {
          errors.push({ field: "transferYearNetIncomePerShare", message: "양도연도 1주당 순손익가치를 입력하세요 (소령 §165④)", severity: "error" });
        }
        if (isEmpty(form.transferYearNetAssetPerShare)) {
          errors.push({ field: "transferYearNetAssetPerShare", message: "양도연도 1주당 순자산가치를 입력하세요", severity: "error" });
        }
        if (!acqFaceValueOnly) {
          if (!niSkip && isEmpty(form.acquisitionYearNetIncomePerShare)) {
            errors.push({ field: "acquisitionYearNetIncomePerShare", message: "취득연도 1주당 순손익가치를 입력하세요", severity: "error" });
          }
          if (isEmpty(form.acquisitionYearNetAssetPerShare)) {
            errors.push({ field: "acquisitionYearNetAssetPerShare", message: "취득연도 1주당 순자산가치를 입력하세요", severity: "error" });
          }
        }
      } else {
        if (!niSkip) {
          if (isEmpty(form.niShareCountEUTransfer) || parseI(form.niShareCountEUTransfer) <= 0) {
            errors.push({ field: "niShareCountEUTransfer", message: "양도연도 NI 사업연도말 발행주식수 필수 (full 모드)", severity: "error" });
          }
          if (!acqFaceValueOnly && (isEmpty(form.niShareCountEUAcq) || parseI(form.niShareCountEUAcq) <= 0)) {
            errors.push({ field: "niShareCountEUAcq", message: "취득연도 NI 사업연도말 발행주식수 필수 (full 모드)", severity: "error" });
          }
        }
        if (isEmpty(form.naShareCountEUTransfer) || parseI(form.naShareCountEUTransfer) <= 0) {
          errors.push({ field: "naShareCountEUTransfer", message: "양도연도 NA 사업연도말 발행주식수 필수 (full 모드)", severity: "error" });
        }
        if (!acqFaceValueOnly && (isEmpty(form.naShareCountEUAcq) || parseI(form.naShareCountEUAcq) <= 0)) {
          errors.push({ field: "naShareCountEUAcq", message: "취득연도 NA 사업연도말 발행주식수 필수 (full 모드)", severity: "error" });
        }
      }
    }
  } else if (acquisitionMode === "face_value") {
    if (form.acqFaceValueOnly === true) {
      errors.push({
        field: "acqFaceValueOnly",
        message: "'액면가' 모드(양/취 모두)와 '사례 49'(취득만 액면가)는 동시 적용 불가. 둘 중 하나만 사용하세요.",
        severity: "error",
      });
    }
    if (!form.bookLost) {
      errors.push({ field: "bookLost", message: "액면가 모드는 장부분실(§99①4) 확인이 필수입니다", severity: "error" });
    }
    if (isEmpty(form.faceValuePerShare) || parseI(form.faceValuePerShare) <= 0) {
      errors.push({ field: "faceValuePerShare", message: "1주당 액면가를 입력하세요", severity: "error" });
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
    if (isEmpty(form.perShareAcquisitionPrice)) {
      errors.push({ field: "perShareAcquisitionPrice", message: "1주당 매매사례가액을 입력하세요", severity: "error" });
    }
  }

  // 장부분실 단독 선언 금지
  if (form.bookLost && acquisitionMode !== "face_value") {
    errors.push({
      field: "bookLost",
      message: "장부분실은 취득가액 모드 '액면가'와 함께 사용해야 합니다 (§99①4)",
      severity: "warning",
    });
  }

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
  }

  // ── R-2 자본조정 ──
  if (form.capitalAdjustments && form.capitalAdjustments.length > 0) {
    if ((form.lotsMode || "single") === "split") {
      errors.push({
        field: "capitalAdjustments",
        message: "자본조정(무상증자·감자)은 단건 모드 전용입니다 (분할 매수 + 자본조정 결합은 후속 PR)",
        severity: "error",
      });
    }
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
      } else {
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
