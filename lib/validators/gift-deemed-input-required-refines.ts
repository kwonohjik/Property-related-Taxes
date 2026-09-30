/**
 * 증여로 보는 경우 ⑫ — 엔진이 필요로 하는데 스키마가 비워 두게 두던 값 (2026-09-30 Zod↔엔진 필수 점검 2차 · #19~#32).
 *
 * 비우면 400이 아니라 **200 + 조용한 0·다른 값**이었다(엔진이 `?? 0`·기본 분기로 읽는다).
 * ⑧(`lib/calc/gift-deemed-validate.ts`·`-phase3.ts`)은 모두 이미 요구한다 — 여기의 조건은 그 **거울**이다.
 * 화면은 ④가 빈 칸도 0으로 싣기 때문에 ⑧의 `parseAmount(x) <= 0`은 와이어의 `!(x > 0)`과 같다.
 * ⑧이 공란만 막고 0을 허용하는 칸(증자 전 가액·인수가 등)은 여기서도 막지 않는다.
 *
 * discriminatedUnion 브랜치에는 superRefine을 걸 수 없어 union 전체의 superRefine이 이 함수를 부른다.
 */
import { z } from "zod";
import type { DeemedGiftUnionData } from "./gift-deemed-input";
import {
  bondNeedsConversionInputs,
  convertibleStockNeedsRatioInputs,
  mergerSplitUsesNetAssetRatio,
  trustLifetimeInputsComplete,
  trustNeedsIncomeGiftDate,
  trustNeedsPrincipalGiftDate,
} from "./gift-deemed-required-gates";

type Path = (string | number)[];
const pos = (v: number | undefined | null): boolean => v != null && v > 0;

export function refineDeemedRequired(data: DeemedGiftUnionData, ctx: z.RefinementCtx): void {
  const need = (ok: boolean, path: Path, message: string) => {
    if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  };

  // #19 §43②·영 §32의4 — 선행 이익을 합산하려면 1년 윈도의 기준일(증여일)이 있어야 한다.
  //   없으면 엔진이 합산을 건너뛴다(`sameClausePriorTotal` — giftDate == null). ⑧은 공통 증여일로 강제한다.
  //   (증자는 아래에서 증여일을 항상 요구한다 — 같은 경로에 이슈를 두 번 싣지 않는다)
  if (data.type !== "capital_increase" && "priorSameClauseGains" in data && (data.priorSameClauseGains?.length ?? 0) > 0) {
    need(data.giftDate != null, ["giftDate"], "선행 이익을 합산하려면 증여일이 필요합니다 (§43② 소급 1년)");
  }

  switch (data.type) {
    // #20 행위시법 기준일 — 없으면 시기 게이트(구법 제외·§29③ 간주모집·부칙 §5②)가 전부 건너뛰어진다
    case "capital_increase":
      need(data.giftDate != null, ["giftDate"], "증여일(증자일)이 필요합니다 — 적용 법령 판정 기준일 (§39①)");
      // #31 증자
      need(pos(data.forfeitedShares), ["forfeitedShares"], "1주당 이익에 곱할 주식수(실권주·배정 신주수)가 필요합니다 (상증령 §29②)");
      if ((data.direction ?? "low") === "high") {
        need(pos(data.ratioDenomShares), ["ratioDenomShares"], "분모 신주수가 필요합니다 (상증령 §29②3·4·5호)");
        need(pos(data.relatedAcquiredShares), ["relatedAcquiredShares"], "특수관계인이 인수한 신주수가 필요합니다 (상증령 §29②3·4·5호)");
      } else if ((data.subType ?? "forfeited_realloc") === "no_realloc") {
        need(pos(data.equalIssueShares), ["equalIssueShares"], "균등증자 가정 증가주식수가 필요합니다 (상증령 §29②2호 가목)");
        need(pos(data.relatedAcquiredShares), ["relatedAcquiredShares"], "신주인수자의 특수관계인의 실권주수가 필요합니다 (상증령 §29②2호 다목)");
        need(pos(data.postIssueSubscriberRatio?.numer), ["postIssueSubscriberRatio"], "증자 후 신주인수자 보유주식수·발행주식총수가 필요합니다 (상증령 §29②2호 다목)");
      }
      break;
    case "capital_increase_allocation":
      need(data.giftDate != null, ["giftDate"], "증여일(증자일)이 필요합니다 — 적용 법령 판정 기준일 (§39①)");
      break;
    case "convertible_stock":
      need(data.atConversion.giftDate != null, ["atConversion", "giftDate"], "전환일(증여일)이 필요합니다 (§39①3호)");
      need(data.atIssuance.giftDate != null, ["atIssuance", "giftDate"], "전환주식 발행일이 필요합니다 (상증법 법률 제14388호 부칙 §5②)");
      for (const leg of ["atConversion", "atIssuance"] as const) {
        const s = data[leg];
        if (!convertibleStockNeedsRatioInputs(s.direction ?? "low", s.subType ?? "forfeited_realloc")) continue;
        need(pos(s.ratioDenomShares), [leg, "ratioDenomShares"], "분모 신주수가 필요합니다 (상증령 §29②6호)");
        need(pos(s.relatedAcquiredShares), [leg, "relatedAcquiredShares"], "특수관계인이 인수한 신주수가 필요합니다 (상증령 §29②6호)");
      }
      break;
    case "specific_corp": {
      need(data.transactionDate != null && data.transactionDate !== "", ["transactionDate"], "거래일(증여일)이 필요합니다 (§45의5① 「거래한 날을 증여일로 하여」)");
      // #21 거래상대방 — 없으면 엔진이 「판정 보류」로 두고 그대로 과세한다(제3자 거래도 과세)
      need(data.counterparty !== undefined, ["counterparty"], "거래상대방을 선택하세요 (§45의5①)");
      // #22 거래 입력
      if (data.transactionType === "low_price" || data.transactionType === "high_price") {
        need(pos(data.marketValue), ["marketValue"], "시가가 필요합니다 (상증령 §34의5⑧)");
        need(pos(data.consideration), ["consideration"], "대가가 필요합니다 (상증령 §34의5④1호다목)");
      } else {
        need(pos(data.transactionBenefit), ["transactionBenefit"], "거래이익이 필요합니다 (§45의5①)");
      }
      // 법인세 자동 안분(직접 입력 `corporateTax`가 없을 때 엔진이 §34의5④2호로 안분한다)
      if (data.corporateTax === undefined) {
        need(pos(data.corporateTaxComputed), ["corporateTaxComputed"], "법인세 산출세액이 필요합니다 (상증령 §34의5④2호가목)");
        need(pos(data.annualIncome), ["annualIncome"], "각 사업연도 소득금액이 필요합니다 (상증령 §34의5④2호 — 분모)");
      }
      (data.shareholders ?? []).forEach((sh, i) => {
        need(sh.shares > 0, ["shareholders", i, "shares"], `주주 ${i + 1}의 주식수가 필요합니다`);
        need(sh.totalShares > 0, ["shareholders", i, "totalShares"], "발행주식 총수가 필요합니다 (§45의5① 주식보유비율의 분모)");
      });
      break;
    }
    case "related_corp": {
      // #23 §45의3③ 증여시기 = 수혜법인의 사업연도 종료일 — 구법(~2017) 판정 기준일
      need(data.fiscalYearEndDate != null && data.fiscalYearEndDate !== "", ["fiscalYearEndDate"], "수혜법인의 사업연도 종료일이 필요합니다 (§45의3③)");
      need(data.shareholders.length >= 2, ["shareholders"], "주주를 2명 이상 입력하세요");
      if (data.shareholders.some((s) => !s.isCorporate && (s.dividendFromBeneficiary ?? 0) > 0))
        need(pos(data.distributableProfit), ["distributableProfit"], "수혜법인의 배당가능이익이 필요합니다 (상증령 §34의3⑮1호 — 분모)");
      if (data.shareholders.some((s) => s.isCorporate))
        data.intermediaryCorps.forEach((c, i) => {
          if (c.owners.some((o) => (o.dividendIncome ?? 0) > 0))
            need(pos(c.distributableProfit), ["intermediaryCorps", i, "distributableProfit"], `간접출자법인 ${i + 1}의 배당가능이익이 필요합니다 (상증령 §34의3⑮2호 — 분모)`);
        });
      break;
    }
    // #24 합병 평가액·수량
    case "merger": {
      if ((data.caseType ?? "stock") === "non_stock") {
        need(pos(data.faceValue), ["faceValue"], "액면가액이 필요합니다 (상증령 §28③2호)");
        need(pos(data.overvaluedSharePrice), ["overvaluedSharePrice"], "합병당사법인 1주당 평가가액이 필요합니다 (상증령 §28③2호)");
        need(pos(data.majorShares), ["majorShares"], "대주주등 주식수가 필요합니다 (상증령 §28③2호)");
        break;
      }
      if (mergerSplitUsesNetAssetRatio(data.isSplitMerger, data.splitValuationMode)) {
        need(pos(data.splitCompanyPreSharePrice), ["splitCompanyPreSharePrice"], "분할법인 분할직전 1주당 평가가액이 필요합니다 (상증령 §28⑦)");
        need(pos(data.splitBusinessNetAsset), ["splitBusinessNetAsset"], "분할사업부문 순자산가액이 필요합니다 (상증령 §28⑦)");
        need(pos(data.splitCompanyNetAsset), ["splitCompanyNetAsset"], "분할법인 순자산가액이 필요합니다 (상증령 §28⑦)");
      } else {
        need(pos(data.overvaluedSharePrice), ["overvaluedSharePrice"], "과대평가법인 1주당 평가가액이 필요합니다 (상증령 §28③1호)");
      }
      if (data.shareholders) {
        const sh = data.shareholders;
        need(pos(data.underSharePrice), ["underSharePrice"], "과소평가법인 1주당 평가가액이 필요합니다 (상증령 §28⑤)");
        need(pos(data.postMergerTotalShares), ["postMergerTotalShares"], "합병 후 존속법인 주식수가 필요합니다 (상증령 §28⑤)");
        need(sh.exchangeRatio.numer > 0 && sh.exchangeRatio.denom > 0, ["shareholders", "exchangeRatio"], "교부 환산비가 필요합니다 (상증령 §28③1호)");
        need(sh.overvalued.some((s) => s.name.trim() !== "" && s.shares > 0), ["shareholders", "overvalued"], "과대평가(이익측)법인 주주를 1명 이상 입력하세요");
        need(sh.undervalued.some((s) => s.name.trim() !== "" && s.shares > 0), ["shareholders", "undervalued"], "과소평가(증여자측)법인 주주를 1명 이상 입력하세요");
        break;
      }
      // 단일 대주주 — 합병 전·교부 주식수는 union superRefine이 이미 요구한다
      need(pos(data.majorShares), ["majorShares"], "대주주등 주식수가 필요합니다 (상증령 §28③1호)");
      if ((data.mergedPriceMode ?? "direct") === "auto") {
        need(pos(data.underSharePrice), ["underSharePrice"], "과소평가법인 1주당 평가가액이 필요합니다 (상증령 §28⑤)");
        need(pos(data.underPreShares), ["underPreShares"], "과소평가법인 합병 전 주식수가 필요합니다 (상증령 §28⑤)");
        need(pos(data.postMergerTotalShares), ["postMergerTotalShares"], "합병 후 존속법인 주식수가 필요합니다 (상증령 §28⑤)");
        if (data.isListed) need(pos(data.listedPostAvgPrice), ["listedPostAvgPrice"], "합병등기일 후 2개월 종가평균이 필요합니다 (상증령 §28⑤ 단서)");
      } else {
        need(pos(data.mergedSharePrice), ["mergedSharePrice"], "합병 후 1주당 평가가액이 필요합니다 (상증령 §28③1호)");
      }
      break;
    }
    // #25 감자
    case "capital_decrease": {
      need(pos(data.sharePrice), ["sharePrice"], "감자주식 1주당 평가액이 필요합니다 (상증령 §29의2)");
      if (data.shareholders) {
        need(pos(data.preTotalShares), ["preTotalShares"], "감자 전 발행주식총수가 필요합니다");
        need(data.shareholders.length >= 2, ["shareholders"], "주주를 2명 이상 입력하세요");
        data.shareholders.forEach((r, i) => {
          need(r.preShares > 0, ["shareholders", i, "preShares"], `${i + 1}번째 주주의 감자 전 주식수가 필요합니다`);
          if (r.redeemedShares > 0)
            need(pos(r.redemptionPricePerShare), ["shareholders", i, "redemptionPricePerShare"], `${i + 1}번째 주주는 감자주주이므로 소각대가가 필요합니다`);
          need((r.relationGroup ?? "").trim() !== "", ["shareholders", i, "relationGroup"], `${i + 1}번째 주주의 특수관계 그룹이 필요합니다`);
        });
        break;
      }
      if ((data.caseType ?? "low") === "high") {
        need(pos(data.ownRedeemedShares), ["ownRedeemedShares"], "해당 주주등 감자 주식수가 필요합니다 (상증령 §29의2①2호)");
        need(pos(data.faceValue), ["faceValue"], "액면가액이 필요합니다 (상증령 §29의2①2호 액면 게이트)");
      } else {
        need(pos(data.totalRedeemedShares), ["totalRedeemedShares"], "총감자 주식수가 필요합니다");
        need(pos(data.majorPostRatio?.numer), ["majorPostRatio"], "대주주등 감자후 지분비율이 필요합니다 (상증령 §29의2①1호)");
        need(pos(data.relatedRedeemedShares), ["relatedRedeemedShares"], "대주주등 특수관계인 감자 주식수가 필요합니다 (상증령 §29의2①1호)");
      }
      break;
    }
    // #31 현물출자
    case "contribution":
      need(data.contributedShares > 0, ["contributedShares"], "현물출자 주식수가 필요합니다 (상증령 §29의3①)");
      need(data.allocatedShares > 0, ["allocatedShares"], "배정·인수 신주수가 필요합니다 (상증령 §29의3①)");
      if ((data.caseType ?? "low") === "high" && data.parties === undefined)
        need(data.relatedRatio !== undefined, ["relatedRatio"], "현물출자자 특수관계인 주주등 지분비율이 필요합니다 (상증령 §29의3①2호)");
      (data.parties ?? []).forEach((p, i) => {
        need(p.preShares > 0, ["parties", i, "preShares"], `${i + 1}번째 당사자의 주식수가 필요합니다`);
        need(p.relation !== undefined, ["parties", i, "relation"], `${i + 1}번째 당사자의 관계가 필요합니다 (§53·§47② 동일인 합산 단위)`);
      });
      break;
    // #26 전환사채
    case "convertible_bond": {
      const ct = data.caseType ?? "acquisition";
      if (bondNeedsConversionInputs(ct)) {
        need(pos(data.preConvPrice), ["preConvPrice"], "전환등 전 1주당 평가가액이 필요합니다 (상증령 §30⑤1)");
        need(pos(data.conversionPrice), ["conversionPrice"], "1주당 전환가액등이 필요합니다 (상증령 §30①2·3)");
        need(pos(data.increasedShares), ["increasedShares"], "전환등 증가주식수가 필요합니다 (상증령 §30⑤1)");
        if (data.isListed) need(pos(data.listedMarketAvg), ["listedMarketAvg"], "전환일 전후 2개월 종가평균이 필요합니다 (상증령 §30⑤1 단서)");
      }
      if (ct === "conversion_reverse")
        need(pos(data.relatedPreRatio?.numer), ["relatedPreRatio"], "특수관계인 전환 전 지분비율이 필요합니다 (상증령 §30①3)");
      if (ct === "transfer" || ct === "acquisition")
        need(data.bondMarketValue > 0, ["bondMarketValue"], "전환사채등 시가가 필요합니다 (상증령 §30①1·4)");
      if (ct === "transfer") need(pos(data.transferPrice), ["transferPrice"], "양도가액이 필요합니다 (상증령 §30①4)");
      break;
    }
    // #27 조직변경
    case "org_change":
      need(data.baseValue > 0, ["baseValue"], "변동 전 해당 재산가액이 필요합니다 (상증령 §32의2② — 기준금액)");
      if (data.subType === "share_change")
        need(pos(data.postPerSharePrice), ["postPerSharePrice"], "변동 후 1주당 가액이 필요합니다 (상증령 §32의2①)");
      break;
    // #28 신탁이익
    case "trust_benefit": {
      need(data.trustPropertyValue > 0, ["trustPropertyValue"], "신탁재산(원본) 가액이 필요합니다 (§33)");
      if (trustNeedsIncomeGiftDate(data.beneficiaryType))
        need(data.incomeGiftDate != null, ["incomeGiftDate"], "수익권 증여시기가 필요합니다 (§33①2호·상증령 §25①)");
      if (trustNeedsPrincipalGiftDate(data.beneficiaryType))
        need(data.principalGiftDate != null, ["principalGiftDate"], "원본권 증여시기가 필요합니다 (§33①1호·상증령 §25①)");
      const annuity = data.incomeAnnuityType ?? "finite";
      if (annuity === "finite") need(pos(data.installments), ["installments"], "수익 분할 횟수가 필요합니다 (상증령 §62 1호)");
      if (annuity === "lifetime")
        need(
          trustLifetimeInputsComplete(data.expectedRemainingYears ?? 0, data.beneficiaryGender, data.beneficiaryAge ?? 0),
          ["expectedRemainingYears"],
          "종신정기금은 기대여명 또는 성별·연령이 필요합니다 (상증령 §62 2호)",
        );
      break;
    }
    // #29 초과배당
    case "excess_dividend":
      need(data.shareholders.some((s) => s.role === "major_shareholder"), ["shareholders"], "최대주주등(배당 포기·과소수령) 주주가 1명 이상 필요합니다 (§41의2①)");
      need(data.shareholders.some((s) => s.role === "related_party"), ["shareholders"], "초과배당을 수령한 특수관계인 주주가 1명 이상 필요합니다 (§41의2①)");
      data.shareholders.forEach((s, i) => need(s.ownershipRatio.numer > 0, ["shareholders", i, "ownershipRatio"], `${i + 1}번째 주주의 지분율이 필요합니다`));
      if (data.incomeTaxMode === "comprehensive")
        need(pos(data.comprehensiveTaxBase), ["comprehensiveTaxBase"], "종합과세 과세표준이 필요합니다 (상증령 §31의2②)");
      if (data.actualIncomeTax !== undefined)
        need(data.giftTaxContext !== undefined, ["giftTaxContext"], "정산 계산에는 증여자와의 관계가 필요합니다 (§41의2③)");
      break;
    // #30 상장차익
    case "listing_gain":
      need(data.settlementPerSharePrice > 0, ["settlementPerSharePrice"], "정산기준일 1주당 평가가액이 필요합니다 (상증령 §31의3①)");
      need(data.shares > 0, ["shares"], "증여·유상취득 주식수가 필요합니다 (상증령 §31의3①)");
      if (data.corpGrowthAuto) {
        need(data.corpGrowthAuto.monthsBusinessStartToListingPrevDay > 0, ["corpGrowthAuto", "monthsBusinessStartToListingPrevDay"], "사업연도개시일~상장전일 월수가 필요합니다 (상증령 §31의3⑤)");
        need(data.corpGrowthAuto.monthsAcqToSettlement > 0, ["corpGrowthAuto", "monthsAcqToSettlement"], "증여·취득일~정산기준일 월수가 필요합니다 (상증령 §31의3⑤)");
      }
      break;
    // #32 기타
    case "property_service_use":
      need(data.marketValue > 0, ["marketValue"], "시가(시가 상당액)가 필요합니다 (§42)");
      break;
    case "value_increase":
      need(data.currentValue > 0, ["currentValue"], "사유발생일 현재 재산가액이 필요합니다 (§42의3)");
      break;
    case "free_loan":
      if (data.loanStartDate || data.loanEndDate) {
        need(!!data.loanStartDate, ["loanStartDate"], "대출 시작일이 필요합니다 (§41의4②)");
        need(!!data.loanEndDate, ["loanEndDate"], "대출 종료일이 필요합니다 (§41의4②)");
        if (data.loanStartDate && data.loanEndDate)
          need(data.loanStartDate <= data.loanEndDate, ["loanEndDate"], "대출 종료일이 시작일보다 앞설 수 없습니다");
      }
      break;
    case "free_realestate":
      (data.periods ?? []).forEach((p, i) => {
        if (data.subType === "free_use") need(pos(p.propertyValue), ["periods", i, "propertyValue"], `${i + 1}번째 기간의 부동산 가액이 필요합니다 (§37①)`);
        else need(pos(p.loanAmount), ["periods", i, "loanAmount"], `${i + 1}번째 기간의 차입금이 필요합니다 (§37②)`);
      });
      if (data.rectification)
        need(data.rectification.giftTaxCalculated > 0, ["rectification", "giftTaxCalculated"], "경정청구: 증여세 산출세액이 필요합니다 (§79②1호)");
      break;
    default:
      break;
  }
}
