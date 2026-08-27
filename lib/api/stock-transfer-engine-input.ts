/**
 * ⑭ 주식 양도세 — zod 통과 payload → 엔진 input 매핑 (**단일 진실**)
 *
 * ## 왜 route.ts 밖에 있는가
 *
 * ⑭ 매핑 누락은 TypeScript 가 잡지 못한다(`as` 캐스팅이라 키가 빠져도 컴파일된다).
 * 그래서 「폼 → body → zod → coerceDates → **⑭ 매핑** → 엔진」을 통째로 태우는 anchor 가
 * 필요한데, Next.js route handler 모듈은 vitest 에서 로드가 불안정하다.
 * 순수 함수로 분리해 두면 route 와 anchor 가 **같은 매핑**을 쓰면서도 안전하다.
 *
 * 🔑 이 파일을 우회해 `coerced` 를 엔진에 바로 넘기는 테스트는 ⑭ 를 **검증하지 않는다**
 *    (실측: `unpaidTax` 매핑을 지워도 그런 테스트는 전건 통과했다).
 */
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

export function buildEngineInput(coerced: Record<string, unknown>): StockTransferInput {
  return {
    marketType: coerced.marketType as StockTransferInput["marketType"],
    isMajorShareholder: coerced.isMajorShareholder as boolean,
    selfShareRatio: coerced.selfShareRatio as number,
    selfMarketCap: coerced.selfMarketCap as number,
    isLargestShareholderGroup: coerced.isLargestShareholderGroup as boolean,
    combinedShareRatio: coerced.combinedShareRatio as number,
    combinedMarketCap: coerced.combinedMarketCap as number,
    priorYearEndDate: coerced.priorYearEndDate as Date,
    isQualifyingBlockShareholder: coerced.isQualifyingBlockShareholder as boolean,
    isHeavyRealEstateForRate: coerced.isHeavyRealEstateForRate as boolean,
    isHeavyRealEstateForValuation: coerced.isHeavyRealEstateForValuation as boolean,
    isSmallMediumEnterprise: coerced.isSmallMediumEnterprise as boolean,
    isMidsizeEnterprise: coerced.isMidsizeEnterprise as boolean,
    isListedSmallShareholder: coerced.isListedSmallShareholder as boolean,
    isVentureCompany: coerced.isVentureCompany as boolean,
    isKOTCTrading: coerced.isKOTCTrading as boolean,
    isOnMarketTransaction: coerced.isOnMarketTransaction as boolean,
    // F-15·F-16 (2026-05-19) §157 2013.2.15.~ — 대차/사모펀드 자동 가산
    lentSharesCount: coerced.lentSharesCount as number,
    pefIndirectSharesCount: coerced.pefIndirectSharesCount as number,
    // F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 override
    judgmentDateOverride: coerced.judgmentDateOverride as Date | undefined,
    judgmentBasis: coerced.judgmentBasis as "merger" | "split" | "split_new_entity" | "incorporation" | undefined,
    acquisitionDate: coerced.acquisitionDate as Date,
    transferDate: coerced.transferDate as Date,
    shareCount: coerced.shareCount as number,
    totalIssuedShares: coerced.totalIssuedShares as number,
    acquisitionCause: coerced.acquisitionCause as StockTransferInput["acquisitionCause"],
    decedentAcquisitionDate: coerced.decedentAcquisitionDate as Date | undefined,
    donorAcquisitionDate: coerced.donorAcquisitionDate as Date | undefined,
    preMergerAcquisitionDate: coerced.preMergerAcquisitionDate as Date | undefined,

    /**
     * §97의2① 이월과세 **본체(필요경비)**.
     *
     * ⚠️ **이 매핑을 빠뜨리면 zod를 통과한 값이 여기서 조용히 사라진다** — 명시 매핑이라
     *    TypeScript가 잡지 못하고(모두 optional), 폼·API·zod가 다 맞아도 **세액이 안 움직인다**
     *    (메모리 `feedback_explicit_prop_mapping_strip` ★★★).
     *    실제로 Phase 6 E2E가 이 누락을 잡아냈다 — anchor는 엔진을 직접 부르므로 못 잡는다.
     */
    donorRelation: coerced.donorRelation as StockTransferInput["donorRelation"],
    donorDeceased: coerced.donorDeceased as boolean | undefined,
    donorAcquisitionPrice: coerced.donorAcquisitionPrice as number | undefined,
    donorAcquisitionStdPrice: coerced.donorAcquisitionStdPrice as number | undefined,
    donorCapitalExpenditure: coerced.donorCapitalExpenditure as number | undefined,
    giftTaxAmount: coerced.giftTaxAmount as number | undefined,
    transferredAssetValue: coerced.transferredAssetValue as number | undefined,
    giftTaxableValue: coerced.giftTaxableValue as number | undefined,
    cumulativeTransferRatio: coerced.cumulativeTransferRatio as number | undefined,
    nblRatioOfCorpAssets: coerced.nblRatioOfCorpAssets as number | undefined,
    crossClause8TaxBase: coerced.crossClause8TaxBase as number | undefined,
    transferPriceMode: coerced.transferPriceMode as StockTransferInput["transferPriceMode"],
    transferActualInputMode: coerced.transferActualInputMode as StockTransferInput["transferActualInputMode"],
    perShareTransferPrice: coerced.perShareTransferPrice as number | undefined,
    transferTotalPrice: coerced.transferTotalPrice as number | undefined,
    exchangePropertyValue: coerced.exchangePropertyValue as number | undefined,
    exchangeDebtRelief: coerced.exchangeDebtRelief as number | undefined,
    exchangeCash: coerced.exchangeCash as number | undefined,
    acquisitionMode: coerced.acquisitionMode as StockTransferInput["acquisitionMode"],
    perShareAcquisitionPrice: coerced.perShareAcquisitionPrice as number | undefined,
    transferDatePriceAvg1Month: coerced.transferDatePriceAvg1Month as number | undefined,
    acquisitionDatePriceAvg1Month: coerced.acquisitionDatePriceAvg1Month as number | undefined,
    transferStdInputMode: coerced.transferStdInputMode as "direct" | "daily" | undefined,
    listingDate: coerced.listingDate as Date | undefined,
    listingDatePriceAvg1Month: coerced.listingDatePriceAvg1Month as number | undefined,
    acquiredBeforeListing: coerced.acquiredBeforeListing as boolean,
    postListingDetail: coerced.postListingDetail as import("@/lib/tax-engine/stock-transfer/types/stock-transfer.types").PostListingDetailInput | undefined,
    tradingHaltAtTransfer: coerced.tradingHaltAtTransfer as boolean,
    tradingHaltAtAcquisition: coerced.tradingHaltAtAcquisition as boolean | undefined,
    transferYearNetIncomePerShare: coerced.transferYearNetIncomePerShare as number | undefined,
    transferYearNetAssetPerShare: coerced.transferYearNetAssetPerShare as number | undefined,
    listingYearNetIncomePerShare: coerced.listingYearNetIncomePerShare as number | undefined,
    listingYearNetAssetPerShare: coerced.listingYearNetAssetPerShare as number | undefined,
    acquisitionYearNetIncomePerShare: coerced.acquisitionYearNetIncomePerShare as number | undefined,
    acquisitionYearNetAssetPerShare: coerced.acquisitionYearNetAssetPerShare as number | undefined,
    // 소칙 §81④ 1호 월할 가산 (전전사업연도 평가 + 직전사업연도 월수)
    prePriorYearNetIncomePerShare: coerced.prePriorYearNetIncomePerShare as number | undefined,
    prePriorYearNetAssetPerShare: coerced.prePriorYearNetAssetPerShare as number | undefined,
    priorBizYearMonths: coerced.priorBizYearMonths as number | undefined,
    // [B-4 §165⑨ 본체] 명시 매핑 필수 (⑭ silent strip 방지)
    unlistedSameBizYearToggle: coerced.unlistedSameBizYearToggle as boolean | undefined,
    bookLost: coerced.bookLost as boolean,
    faceValuePerShare: coerced.faceValuePerShare as number | undefined,
    // [사례 49] 취득시 장부분실 액면가 + 양도시 §165④ 보충 평가
    acqFaceValueOnly: coerced.acqFaceValueOnly as boolean | undefined,
    acqFaceValuePerShare: coerced.acqFaceValuePerShare as number | undefined,
    netAssetOnlyReason: coerced.netAssetOnlyReason as StockTransferInput["netAssetOnlyReason"],
    expenseMode: coerced.expenseMode as StockTransferInput["expenseMode"],
    actualExpenses: coerced.actualExpenses as number | undefined,
    filingType: coerced.filingType as StockTransferInput["filingType"],
    filingDate: coerced.filingDate as Date,
    isElectronicFiling: coerced.isElectronicFiling as boolean,
    filingViolation: coerced.filingViolation as StockTransferInput["filingViolation"],
    isFraudulent: coerced.isFraudulent as boolean,
    isInternationalTransaction: coerced.isInternationalTransaction as boolean,
    // 가산세 상세 — 국세기본법 §47조의3①「과소신고납부세액등」 차감 · §47조의4 납부지연
    originalFiledTax: coerced.originalFiledTax as number | undefined,
    priorPaidTax: coerced.priorPaidTax as number | undefined,
    interestSurcharge: coerced.interestSurcharge as number | undefined,
    fraudulentPortion: coerced.fraudulentPortion as number | undefined,
    unpaidTax: coerced.unpaidTax as number | undefined,
    paymentDeadline: coerced.paymentDeadline as Date | undefined,
    actualPaymentDate: coerced.actualPaymentDate as Date | undefined,
    // R-1' 매매사례가액
    acquisitionMarketSamplePrice: coerced.acquisitionMarketSamplePrice as number | undefined,
    acquisitionMarketSampleDate: coerced.acquisitionMarketSampleDate as Date | undefined,
    acquisitionMarketSampleCounterparty: coerced.acquisitionMarketSampleCounterparty as string | undefined,
    transferMarketSamplePrice: coerced.transferMarketSamplePrice as number | undefined,
    transferMarketSampleDate: coerced.transferMarketSampleDate as Date | undefined,
    transferMarketSampleCounterparty: coerced.transferMarketSampleCounterparty as string | undefined,
    // R-2 자본조정
    capitalAdjustments: coerced.capitalAdjustments as StockTransferInput["capitalAdjustments"],
    realEstateGroupBasicDeductionUsed: coerced.realEstateGroupBasicDeductionUsed as number,

    // ── split 모드 (분할 매수·분할 양도 + lots-only 모드 합성) ──
    // ⑭ 동기화 지점 — TypeScript 미감지
    acquisitionLots: coerced.acquisitionLots as StockTransferInput["acquisitionLots"],
    transferLots: coerced.transferLots as StockTransferInput["transferLots"],
    costAllocationMethod: coerced.costAllocationMethod as StockTransferInput["costAllocationMethod"],
    specificMatchings: coerced.specificMatchings as StockTransferInput["specificMatchings"],

    // [부담부증여 전용 ⑭] §159 개산공제 base 안분 비율 (비상장 estimated 경로 전용)
    // TypeScript 미감지 — grep 자가점검 대상 (⑭ 동기화 지점)
    burdenedGiftDebtRatio: coerced.burdenedGiftDebtRatio as number | undefined,
  };
}