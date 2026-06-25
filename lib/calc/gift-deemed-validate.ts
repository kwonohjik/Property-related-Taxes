/**
 * 증여로 보는 경우 — 입력 검증 (⑧ 동기화). Zod superRefine과 동일 fallback.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { DeemedFormState, EdShareholderRow } from "@/components/calc/deemed-gift/shared";

export function validateDeemedInput(form: DeemedFormState): string | null {
  // 신탁이익(§33)은 공통 증여일 대신 원본·수익 증여시기를 분리 입력(§25①) → 공통 giftDate 검사 skip
  if (form.type !== "trust_benefit" && !form.giftDate) return "증여일을 입력하세요";
  if (!form.type) return "증여로 보는 경우 유형을 선택하세요";

  switch (form.type) {
    case "trust_benefit": {
      if (parseAmount(form.tbPropertyValue) <= 0) return "신탁재산(원본) 가액을 입력하세요";
      if (form.tbBeneficiaryType !== "diff_principal" && !form.tbIncomeGiftDate)
        return "수익권 증여시기를 입력하세요";
      if (form.tbBeneficiaryType !== "diff_income" && !form.tbPrincipalGiftDate)
        return "원본권 증여시기를 입력하세요";
      if (form.tbAnnuityType === "finite" && parseDecimal(form.tbInstallments) <= 0)
        return "수익 분할 횟수를 입력하세요";
      if (
        form.tbAnnuityType === "lifetime" &&
        parseDecimal(form.tbExpectedRemainingYears) <= 0 &&
        (!form.tbBeneficiaryGender || parseDecimal(form.tbBeneficiaryAge) <= 0)
      )
        return "종신정기금은 성별·연령 또는 기대여명을 입력하세요";
      break;
    }
    case "insurance":
      if (parseAmount(form.insTotalPremium) <= 0) return "납부보험료 총액을 입력하세요";
      if (parseAmount(form.insRelevantPremium) > parseAmount(form.insTotalPremium))
        return "관련 보험료가 총 납부보험료를 초과할 수 없습니다 (§34①)";
      break;
    case "bargain_transfer":
      if (parseAmount(form.bargMarketValue) <= 0) return "시가를 입력하세요";
      break;
    case "debt_forgiveness":
      if (parseAmount(form.debtForgiven) <= 0) return "면제·인수·변제 채무액을 입력하세요";
      break;
    case "free_realestate":
      if (form.freePeriods !== undefined) {
        // 다기간 모드 — 빈 배열 차단(자동 fallback 금지) + 각 window 필수값
        if (form.freePeriods.length === 0) return "기간을 1개 이상 추가하세요 (5년/1년 초과 다기간)";
        for (const [i, p] of form.freePeriods.entries()) {
          if (!p.startDate) return `${i + 1}번째 기간의 개시일을 입력하세요`;
          if (parseAmount(p.value) <= 0)
            return `${i + 1}번째 기간의 ${form.freeSubType === "free_use" ? "부동산 가액" : "차입금"}을 입력하세요`;
        }
      } else {
        if (form.freeSubType === "free_use" && parseAmount(form.freePropertyValue) <= 0)
          return "부동산 가액을 입력하세요";
        if (form.freeSubType === "collateral" && parseAmount(form.freeLoanAmount) <= 0)
          return "차입금을 입력하세요";
      }
      // 경정청구(무상사용·담보 공통) — 필수값
      if (form.freeRectOn) {
        if (parseAmount(form.freeRectTax) <= 0) return "경정청구: 증여세 산출세액을 입력하세요";
        if (!form.freeRectGiftDate) return "경정청구: 당초 증여일을 입력하세요";
        if (!form.freeRectTermDate) return "경정청구: 중단사유 발생일을 입력하세요";
      }
      break;
    case "free_loan":
      // §43² 다건 합산 모드 (loanLoans 토글 ON) — 빈 배열 차단(자동 fallback 금지) + 각 건 필수값
      if (form.loanLoans !== undefined) {
        if (form.loanLoans.length === 0) return "대출 건을 1건 이상 추가하세요";
        for (const [i, item] of form.loanLoans.entries()) {
          if (!item.loanDate) return `${i + 1}번째 대출의 대출일을 입력하세요`;
          if (parseAmount(item.amount) <= 0) return `${i + 1}번째 대출의 대출금액을 입력하세요`;
        }
        break;
      }
      // 단건 모드
      if (parseAmount(form.loanAmount) <= 0) return "대출금액을 입력하세요";
      // §41의4② 기간 입력 시 — 양끝 모두 필수 + start ≤ end (한쪽만 입력 차단, 자동 fallback 금지)
      if (form.loanStartDate || form.loanEndDate) {
        if (!form.loanStartDate) return "대출 시작일을 입력하세요";
        if (!form.loanEndDate) return "대출 종료일을 입력하세요";
        if (form.loanStartDate > form.loanEndDate) return "대출 종료일이 시작일보다 앞설 수 없습니다";
      }
      break;
    case "merger": {
      if (form.mrgCaseType === "non_stock") {
        if (parseAmount(form.mrgFaceValue) <= 0) return "액면가액을 입력하세요";
        if (parseAmount(form.mrgOvervaluedPrice) <= 0) return "합병당사법인 1주당 평가가액을 입력하세요";
        break;
      }
      // §28⑦ 분할합병(순자산비율)이면 과대평가 1주평가 대신 분할 3필드 필수
      const splitNet = form.mrgIsSplitMerger && form.mrgSplitMode === "net_asset_ratio";
      if (splitNet) {
        if (parseAmount(form.mrgSplitPrePrice) <= 0) return "분할법인 분할직전 1주당 평가가액을 입력하세요";
        if (parseAmount(form.mrgSplitBusinessNetAsset) <= 0) return "분할사업부문 순자산가액을 입력하세요";
        if (parseAmount(form.mrgSplitCompanyNetAsset) <= 0) return "분할법인 순자산가액을 입력하세요";
      } else if (parseAmount(form.mrgOvervaluedPrice) <= 0) {
        return "과대평가법인 1주당 평가가액을 입력하세요";
      }
      if (form.mrgUseShareholders) {
        // Phase B 주주 매트릭스 — auto 평가 + 주주 배열 필수
        if (parseAmount(form.mrgUnderSharePrice) <= 0) return "과소평가법인 1주당 평가가액을 입력하세요";
        if (parseAmount(form.mrgPostMergerTotalShares) <= 0) return "합병 후 존속법인 주식수를 입력하세요";
        if (parseAmount(form.mrgExchangeNumer) <= 0 || parseAmount(form.mrgExchangeDenom) <= 0)
          return "교부 환산비를 입력하세요";
        if (form.mrgOverShareholders.filter((s) => s.name.trim() && parseAmount(s.shares) > 0).length === 0)
          return "과대평가(이익측)법인 주주를 1명 이상 입력하세요";
        if (form.mrgUnderShareholders.filter((s) => s.name.trim() && parseAmount(s.shares) > 0).length === 0)
          return "과소평가(증여자측)법인 주주를 1명 이상 입력하세요";
      } else {
        if (parseAmount(form.mrgExchangedShares) <= 0) return "교부받은 주식수를 입력하세요";
        if (form.mrgMergedPriceMode === "auto") {
          // §28⑤ 단순평균액 — 자동추정 금지, 명시 입력 필수
          if (parseAmount(form.mrgUnderSharePrice) <= 0) return "과소평가법인 1주당 평가가액을 입력하세요";
          if (parseAmount(form.mrgPreShares) <= 0) return "과대평가법인 합병 전 주식수를 입력하세요";
          if (parseAmount(form.mrgUnderPreShares) <= 0) return "과소평가법인 합병 전 주식수를 입력하세요";
          if (parseAmount(form.mrgPostMergerTotalShares) <= 0) return "합병 후 존속법인 주식수를 입력하세요";
          if (form.mrgIsListed && parseAmount(form.mrgListedPostAvgPrice) <= 0)
            return "합병등기일 후 2개월 종가평균을 입력하세요";
        } else if (parseAmount(form.mrgMergedPrice) <= 0) {
          return "합병 후 1주당 평가가액을 입력하세요";
        }
      }
      break;
    }
    case "capital_increase":
      if (parseAmount(form.ciPrePrice) <= 0) return "증자 전 1주당 평가가액을 입력하세요";
      if (parseAmount(form.ciPreShares) <= 0) return "증자 전 발행주식총수를 입력하세요";
      if (form.ciDirection === "high" && form.ciSubType !== "forfeited_realloc") {
        if (parseAmount(form.ciRatioDenomShares) <= 0) return "분모 신주수를 입력하세요";
      }
      break;
    case "capital_increase_allocation": {
      if (parseAmount(form.ciAllocPrePrice) <= 0) return "증자 전 1주당 평가가액을 입력하세요";
      if (parseAmount(form.ciAllocNewPrice) <= 0) return "신주 1주당 인수가액을 입력하세요";
      const rows = form.ciAllocRows;
      if (rows.length < 2) return "주주를 2명 이상 입력하세요";
      if (rows.some((r) => !r.name.trim())) return "각 주주의 이름을 입력하세요";
      if (rows.every((r) => parseAmount(r.subscribedShares) <= 0)) return "신주를 인수한 주주가 1명 이상 필요합니다";
      const ids = new Set(rows.map((r) => r.id));
      if (rows.some((r) => r.relatedTo.some((rid) => !ids.has(rid))))
        return "특수관계인 선택이 올바르지 않습니다";
      break;
    }
    case "capital_decrease":
      if (form.cdMode === "multi") {
        if (parseAmount(form.cdSharePrice) <= 0) return "감자주식 1주당 평가액을 입력하세요";
        if (parseAmount(form.cdPreTotalShares) <= 0) return "감자 전 발행주식총수를 입력하세요";
        if (form.cdShareholders.length < 2) return "주주를 2명 이상 입력하세요";
        for (const [i, row] of form.cdShareholders.entries()) {
          const n = i + 1;
          if (!row.name.trim()) return `${n}번째 주주 이름을 입력하세요`;
          if (parseAmount(row.preShares) <= 0) return `${n}번째 주주의 감자 전 주식수를 입력하세요`;
          if (parseAmount(row.redeemedShares) > 0 && parseAmount(row.redemptionPrice) <= 0)
            return `${n}번째 주주는 감자주주이므로 소각대가를 입력하세요`;
          // 자동 안분 fallback 금지: 특수관계 그룹 미입력 차단
          if (!row.relationGroup.trim())
            return `${n}번째 주주의 특수관계 그룹을 입력하세요 (비특수관계면 별도 구분값 입력)`;
        }
        const totalPre = form.cdShareholders.reduce((s, r) => s + parseAmount(r.preShares), 0);
        if (totalPre > parseAmount(form.cdPreTotalShares))
          return "주주별 감자 전 주식수 합계가 발행주식총수를 초과합니다";
      } else {
        if (parseAmount(form.cdSharePrice) <= 0) return "감자주식 1주당 평가액을 입력하세요";
        if (form.cdCaseType === "high") {
          if (parseAmount(form.cdOwnRedeemedShares) <= 0) return "해당 주주등 감자 주식수를 입력하세요";
        } else {
          if (parseAmount(form.cdTotalShares) <= 0) return "총감자 주식수를 입력하세요";
        }
      }
      break;
    case "contribution":
      if (parseAmount(form.conPrePrice) <= 0) return "현물출자 전 1주당 평가가액을 입력하세요";
      if (parseAmount(form.conPreShares) <= 0) return "현물출자 전 발행주식총수를 입력하세요";
      // 당사자 명부 roster 3-state 검증 (자동 안분 fallback 금지)
      if (form.conParties !== undefined) {
        // ON 빈 배열 — 최소 1명 필요
        if (form.conParties.length === 0)
          return `${form.conCaseType === "high" ? "수증자" : "증여자"}를 1명 이상 추가하세요`;
        // 각 행: 주식수 > 0 필수
        for (const [i, p] of form.conParties.entries()) {
          if (parseAmount(p.shares) <= 0)
            return `${i + 1}번째 ${form.conCaseType === "high" ? "수증자" : "증여자"}의 주식수를 입력하세요`;
        }
        // 합계 주식수 > 기준 주식수 차단
        const sumShares = form.conParties.reduce((acc, p) => acc + parseAmount(p.shares), 0);
        const baseShares = parseAmount(form.conPreShares);
        if (baseShares > 0 && sumShares > baseShares)
          return "당사자 주식수 합계가 현물출자 전 발행주식총수를 초과합니다";
      }
      break;
    case "convertible_stock":
      if (parseAmount(form.csConvPrePrice) <= 0) return "전환 시점 증자 전 1주당 평가가액을 입력하세요";
      if (parseAmount(form.csConvPreShares) <= 0) return "전환 시점 증자 전 발행주식총수를 입력하세요";
      if (parseAmount(form.csIssuePrePrice) <= 0) return "발행 시점 증자 전 1주당 평가가액을 입력하세요";
      if (parseAmount(form.csIssuePreShares) <= 0) return "발행 시점 증자 전 발행주식총수를 입력하세요";
      break;
    case "acquisition_fund_presumption":
      if (parseAmount(form.afAcquisitionValue) <= 0)
        return form.afSubType === "debt_repayment" ? "채무상환금액을 입력하세요" : "취득재산가액을 입력하세요";
      break;
    case "nominee_trust":
      if (form.ntValuationMode === "per_share") {
        if (parseAmount(form.ntPerSharePrice) <= 0) return "1주당 평가액(명의개서일 §63)을 입력하세요";
        if (parseAmount(form.ntNewShares) <= 0) return "명의신탁 신주 수를 입력하세요";
      } else if (parseAmount(form.ntPropertyValue) <= 0) {
        return "명의신탁 재산 가액을 입력하세요";
      }
      break;
    case "excess_dividend": {
      // ⑧ F1: 주주 목록 필수 — 엔진 요구사항 동기화 (API fallback: edShareholders ?? [])
      const edRows: EdShareholderRow[] = form.edShareholders ?? [];
      if (edRows.length === 0) return "주주를 1명 이상 추가하세요";

      // ⑧ F2: 최대주주등 최소 1명
      const hasMajor = edRows.some((r) => r.role === "major_shareholder");
      if (!hasMajor) return "최대주주등(배당 포기·과소수령) 주주를 1명 이상 지정하세요";

      // ⑧ F3: 특수관계인(수증자) 최소 1명
      const hasRelated = edRows.some((r) => r.role === "related_party");
      if (!hasRelated) return "초과배당을 수령한 특수관계인 주주를 1명 이상 지정하세요";

      // ⑧ F4: 각 행 — 지분율 > 0, 실수령 배당금 >= 0
      for (const [i, row] of edRows.entries()) {
        if (parseDecimal(row.ownershipRatioPctStr) <= 0)
          return `${i + 1}번째 주주의 지분율을 입력하세요 (0 초과)`;
        if (parseAmount(row.actualDividendStr) < 0)
          return `${i + 1}번째 주주의 실수령 배당금은 0 이상이어야 합니다`;
      }

      // ⑧ F5: 소득세 모드는 INITIAL "undetermined"로 store·display·api·validate 4자 일치
      // (feedback_store_default_vs_ui_display_fallback — display fallback과 모순되는 명시 선택 강제는 금지)

      // ⑧ F6: 모드별 조건부 필드
      if (form.edIncomeTaxMode === "separate" && parseAmount(form.edSeparateTaxAmount) < 0)
        return "분리과세 소득세액은 0 이상이어야 합니다";
      if (form.edIncomeTaxMode === "comprehensive" && parseAmount(form.edComprehensiveTaxBase) <= 0)
        return "종합과세 과세표준을 입력하세요 (양수여야 합니다)";

      // ⑧ F7: 정산 모드 — 실제 소득세 필수 (0은 유효)
      if (form.edSettlementMode && form.edActualIncomeTax === "")
        return "정산용 실제 소득세액을 입력하세요 (납부 0원이면 0 입력)";

      break;
    }
    case "listing_gain":
      if (parseAmount(form.lgSettlementPrice) <= 0) return "정산기준일 1주당 평가가액을 입력하세요";
      if (parseAmount(form.lgShares) <= 0) return "증여·유상취득 주식수를 입력하세요";
      break;
    case "property_service_use":
      if (parseAmount(form.psuMarketValue) <= 0) return form.psuSubType === "free_use" ? "시가 상당액을 입력하세요" : "시가를 입력하세요";
      break;
    case "org_change":
      if (parseAmount(form.ocBaseValue) <= 0) return "변동 전 해당 재산가액을 입력하세요";
      if (form.ocSubType === "share_change" && parseAmount(form.ocPostPerShare) <= 0) return "변동 후 1주당 가액을 입력하세요";
      break;
    case "value_increase":
      if (parseAmount(form.viCurrentValue) <= 0) return "사유발생일 현재 재산가액을 입력하세요";
      break;
    case "specific_corp":
      if (parseAmount(form.scTransactionBenefit) <= 0) return "거래이익을 입력하세요";
      break;
    case "convertible_bond":
      if (form.cbCaseType === "conversion" || form.cbCaseType === "conversion_reverse") {
        if (parseAmount(form.cbPreConvPrice) <= 0) return "전환등 전 1주당 평가가액을 입력하세요";
        if (parseAmount(form.cbConversionPrice) <= 0) return "1주당 전환가액등을 입력하세요";
        if (parseAmount(form.cbIncreasedShares) <= 0) return "전환등 증가주식수를 입력하세요";
        // 상장 Min/Max 단서 — 종가평균 필요. creditedShares는 non-required(미입력=증가주식수)
        if (form.cbIsListed && parseAmount(form.cbListedMarketAvg) <= 0) return "전환일 전후 2개월 종가평균을 입력하세요";
      }
      if (form.cbCaseType === "conversion") {
        if (form.cbAutoExcess) {
          if (parseAmount(form.cbSubscribedShares) <= 0) return "인수(전환) 주식수를 입력하세요";
          if (parseAmount(form.cbTotalSubscribable) <= 0) return "총인수가능주식수를 입력하세요";
          if (parseDecimal(form.cbOwnPreRatioPct) <= 0) return "본인 전환전 지분율을 입력하세요";
        }
        if (form.cbAutoInterestLoss) {
          if (parseAmount(form.cbBondMaturity) <= 0) return "만기상환금액을 입력하세요";
          if (parseDecimal(form.cbCouponRatePct) <= 0) return "사채발행이율을 입력하세요";
          if (parseDecimal(form.cbPvFactorAppr) <= 0) return "적정할인율 현가계수를 입력하세요";
          if (parseDecimal(form.cbAnnuityFactorAppr) <= 0) return "적정할인율 연금현가계수를 입력하세요";
        }
      }
      if (form.cbCaseType === "conversion_reverse") {
        if (parseDecimal(form.cbRelatedPreRatioPct) <= 0) return "특수관계인 전환 전 지분비율을 입력하세요";
      }
      if (form.cbCaseType === "transfer") {
        if (parseAmount(form.cbMarketValue) <= 0) return "전환사채등 시가를 입력하세요";
        if (parseAmount(form.cbTransferPrice) <= 0) return "양도가액을 입력하세요";
      }
      if (form.cbCaseType === "acquisition") {
        if (parseAmount(form.cbMarketValue) <= 0) return "전환사채등 시가를 입력하세요";
      }
      break;
  }
  return null;
}
