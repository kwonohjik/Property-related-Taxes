/**
 * 증여의제 — 엔진이 필요로 하는데 ⑫가 비워 두게 두던 값 (2026-09-30 Zod↔엔진 필수 점검 2차 · #19~#32).
 *
 * 비우면 400이 아니라 200 + 조용한 0·다른 값이었다. ⑧(`gift-deemed-validate*.ts`)은 모두 이미 요구한다.
 * 각 행: 🟢 값이 있으면 200 + 종전과 같은 증여재산가액 / 🔴 비우면 400 + 정확한 경로.
 * 「종전」은 수정 전 route에 같은 body를 보낸 실측값(200)이다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/gift-deemed/route";

type B = Record<string, unknown>;
async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/gift-deemed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}
const paths = (json: { issues?: { path: string[] }[] }) => (json.issues ?? []).map((i) => i.path.join("."));
const w = (o: B, ...keys: string[]) => {
  const c = { ...o };
  for (const k of keys) delete c[k];
  return c;
};

/** [설명, body, 기대 경로, 종전(200) 증여재산가액] */
type Miss = [string, B, string, number];
interface Case {
  id: string;
  title: string;
  base: B;
  value: number;
  misses: Miss[];
}

async function runCase(c: Case) {
  const ok = await post(c.base);
  expect(ok.status, JSON.stringify(ok.json).slice(0, 400)).toBe(200);
  expect(ok.json.result.deemedGiftValue).toBe(c.value);
  for (const [desc, body, path] of c.misses) {
    const r = await post(body);
    expect(r.status, `${desc}: ${JSON.stringify(r.json).slice(0, 300)}`).toBe(400);
    expect(paths(r.json), desc).toContain(path);
  }
}

// ── 공통 픽스처 ──
const MERGER_DIRECT = { type: "merger", caseType: "stock", mergedPriceMode: "direct", overvaluedSharePrice: 10000, exchangedShares: 100000, majorShares: 20000, mergedSharePrice: 45000, preMergerShares: 200000 };
const MERGER_AUTO = { ...w(MERGER_DIRECT, "mergedSharePrice"), mergedPriceMode: "auto", underSharePrice: 100000, underPreShares: 100000, postMergerTotalShares: 300000 };
const MERGER_NON_STOCK = { type: "merger", caseType: "non_stock", overvaluedSharePrice: 1000, majorShares: 100000, faceValue: 5000 };
const MERGER_SPLIT = { ...MERGER_DIRECT, isSplitMerger: true, splitValuationMode: "net_asset_ratio", splitCompanyPreSharePrice: 20000, splitBusinessNetAsset: 5e9, splitCompanyNetAsset: 1e10, overvaluedSharePrice: 0 };
const MX_SH = { overvalued: [{ id: "a", name: "a", shares: 200000 }], undervalued: [{ id: "b", name: "b", shares: 100000 }], exchangeRatio: { numer: 1, denom: 2 } };
const MERGER_MATRIX = { type: "merger", caseType: "stock", overvaluedSharePrice: 10000, majorShares: 0, mergedPriceMode: "auto", underSharePrice: 100000, underPreShares: 100000, postMergerTotalShares: 200000, preMergerShares: 200000, exchangedShares: 0, shareholders: MX_SH };

const CD_LOW = { type: "capital_decrease", caseType: "low", sharePrice: 20000, redemptionPrice: 5000, totalRedeemedShares: 100000, majorPostRatio: { numer: 5000, denom: 10000 }, relatedRedeemedShares: 50000 };
const CD_HIGH = { type: "capital_decrease", caseType: "high", sharePrice: 3000, redemptionPrice: 20000, ownRedeemedShares: 50000, faceValue: 5000 };
const CD_R1 = { id: "a", name: "a", preShares: 60000, redeemedShares: 0, relationGroup: "g1" };
const CD_R2 = { id: "b", name: "b", preShares: 40000, redeemedShares: 20000, redemptionPricePerShare: 5000, relationGroup: "g1" };
const CD_MULTI = { type: "capital_decrease", sharePrice: 20000, preTotalShares: 100000, shareholders: [CD_R1, CD_R2] };

const CB_CONV = { type: "convertible_bond", caseType: "conversion", bondMarketValue: 1e9, preConvPrice: 20000, preConvShares: 100000, conversionPrice: 5000, increasedShares: 50000, creditedShares: 50000, interestLoss: 0, acquisitionGainPrior: 0 };
const CB_REV = { type: "convertible_bond", caseType: "conversion_reverse", bondMarketValue: 1e9, preConvPrice: 5000, preConvShares: 100000, conversionPrice: 20000, increasedShares: 50000, relatedPreRatio: { numer: 5000, denom: 10000 } };
const CB_TRANSFER = { type: "convertible_bond", caseType: "transfer", bondMarketValue: 1e9, transferPrice: 1.5e9 };
const CB_ACQ = { type: "convertible_bond", caseType: "acquisition", bondMarketValue: 1e9, acquisitionPrice: 5e8 };

const TB = { type: "trust_benefit", beneficiaryType: "same", trustPropertyValue: 1e9, withholdingRate: { numer: 1540, denom: 10000 }, incomeAnnuityType: "finite", installments: 10, incomeGiftDate: "2024-06-01", principalGiftDate: "2024-06-01" };
const TB_LIFE = { ...w(TB, "installments"), incomeAnnuityType: "lifetime", expectedRemainingYears: 20 };

const ED_SH = [
  { id: "m", role: "major_shareholder", ownershipRatio: { numer: 6000, denom: 10000 }, actualDividend: 0 },
  { id: "r", role: "related_party", ownershipRatio: { numer: 4000, denom: 10000 }, actualDividend: 1e9 },
];
const ED = { type: "excess_dividend", shareholders: ED_SH, dividendDate: "2024-06-01", incomeTaxMode: "comprehensive", comprehensiveTaxBase: 2e9 };

const SC = { type: "specific_corp", transactionBenefit: 1e9, corporateTax: 0, ownershipRatio: { numer: 5000, denom: 10000 }, counterparty: "ruling_shareholder", transactionType: "gratuitous", transactionDate: "2024-06-01" };
const SC_AUTO = { ...w(SC, "corporateTax"), annualIncome: 5e9, corporateTaxComputed: 1e9 };
const SC_PRICE = { ...SC, transactionType: "low_price", marketValue: 2e9, consideration: 1e9, transactionBenefit: 0 };
const scSh = (id: string, shares: number, isDonor: boolean, relation: string) => ({ id, name: id, relation, shares, totalShares: 10000, isDonor, isRelated: true });
const SC_ROSTER = { ...w(SC, "ownershipRatio"), shareholders: [scSh("f", 5000, true, "self"), scSh("c", 5000, false, "lineal_descendant")] };

const RC_SH = [
  { id: "s1", name: "a", relation: "self", directRatio: { numer: 5000, denom: 10000 }, isCorporate: false },
  { id: "s2", name: "b", relation: "other", directRatio: { numer: 5000, denom: 10000 }, isCorporate: false },
];
const RC = { type: "related_corp", fiscalYearEndDate: "2024-12-31", enterpriseSize: "large", totalSales: 1e11, preTaxAdjOperatingIncome: 1e10, taxableIncome: 1e10, corporateTaxNet: 2e9, shareholders: RC_SH, intermediaryCorps: [], salesPartners: [{ id: "p1", name: "x", salesAmount: 1e11, isRelated: true }] };
const RC_CORP = {
  ...RC,
  shareholders: [
    { id: "s1", name: "a", relation: "self", directRatio: { numer: 3000, denom: 10000 }, isCorporate: false },
    { id: "A", name: "A법인", relation: "other", directRatio: { numer: 5000, denom: 10000 }, isCorporate: true },
    { id: "s2", name: "b", relation: "other", directRatio: { numer: 2000, denom: 10000 }, isCorporate: false },
  ],
  intermediaryCorps: [{ corpShareholderId: "A", stakeInBeneficiary: { numer: 5000, denom: 10000 }, distributableProfit: 5e9, owners: [{ individualId: "s1", ratio: { numer: 8000, denom: 10000 }, dividendIncome: 1e8 }] }],
};
const ED_SETTLE = { type: "excess_dividend", shareholders: ED_SH, dividendDate: "2024-06-01", incomeTaxMode: "separate", separateIncomeTax: 1.4e8, actualIncomeTax: 1e8, giftTaxContext: { donorRelationship: "lineal_ascendant_adult" } };
const RC_DIV = { ...RC, distributableProfit: 5e9, shareholders: [{ ...RC_SH[0], dividendFromBeneficiary: 1e8 }, RC_SH[1]] };

const CI_LOW = { type: "capital_increase", direction: "low", subType: "forfeited_realloc", preIssuePrice: 20000, preIssueShares: 100000, newSharePrice: 5000, issuedShares: 50000, forfeitedShares: 30000, giftDate: "2024-06-01" };
const CI_HIGH = { ...CI_LOW, direction: "high", subType: "third_party", preIssuePrice: 5000, newSharePrice: 20000, relatedAcquiredShares: 10000, ratioDenomShares: 20000 };
const CI_NR = { ...CI_LOW, subType: "no_realloc", equalIssueShares: 60000, relatedAcquiredShares: 10000, postIssueSubscriberRatio: { numer: 50000, denom: 150000 } };
const CI_DPO = { type: "capital_increase", direction: "low", subType: "third_party", preIssuePrice: 20000, preIssueShares: 100000, newSharePrice: 5000, issuedShares: 50000, forfeitedShares: 30000, allocationMethod: "deemed_public_offering", isListed: true, listedMarketAvg: 15000, giftDate: "2015-06-01" };
const csLeg = (d: string) => ({ direction: "low", subType: "forfeited_realloc", preIssuePrice: 20000, preIssueShares: 100000, newSharePrice: 5000, issuedShares: 50000, forfeitedShares: 30000, giftDate: d });
const CS = { type: "convertible_stock", atConversion: csLeg("2024-06-01"), atIssuance: { ...csLeg("2020-01-01"), preIssuePrice: 8000 } };
const csHi = (d: string) => ({ ...csLeg(d), direction: "high", subType: "third_party", preIssuePrice: 5000, newSharePrice: 20000, relatedAcquiredShares: 10000, ratioDenomShares: 20000 });
const CS_HIGH = { type: "convertible_stock", atConversion: csHi("2024-06-01"), atIssuance: { ...csHi("2020-01-01"), newSharePrice: 8000 } };
const CON_LOW = { type: "contribution", caseType: "low", preContribPrice: 20000, preContribShares: 100000, newSharePrice: 5000, contributedShares: 50000, allocatedShares: 50000 };
const CON_HIGH = { type: "contribution", caseType: "high", preContribPrice: 10000, preContribShares: 100000, newSharePrice: 30000, contributedShares: 50000, allocatedShares: 50000, relatedRatio: { numer: 5000, denom: 10000 } };
const CON_HIGH_P = { ...w(CON_HIGH, "relatedRatio"), parties: [{ name: "a", preShares: 50000, relation: "father" }] };

const SAME_MERGER = { ...MERGER_NON_STOCK, majorShares: 50000, giftDate: "2024-06-01", priorSameClauseGains: [{ date: "2024-01-01", gain: 2e8 }] };
const SAME_PSU = { type: "property_service_use", subType: "free_use", marketValue: 6e6, giftDate: "2024-06-01", priorSameClauseGains: [{ date: "2024-01-01", gain: 6e6 }] };
const SC_PRIOR = { ...SC, transactionBenefit: 1.2e8, priorTransactions: [{ date: "2024-01-01", benefit: 1.2e8 }] };

const FL = { type: "free_loan", loanAmount: 1e9, actualInterestPaid: 0, appropriateRate: { numer: 460, denom: 10000 }, isRelatedParty: true, loanStartDate: "2024-01-01", loanEndDate: "2026-12-31" };
const FR_USE = { type: "free_realestate", subType: "free_use", isRelatedParty: true, periods: [{ startDate: "2019-01-01", propertyValue: 2e9 }] };
const FR_COLL = { type: "free_realestate", subType: "collateral", isRelatedParty: true, periods: [{ startDate: "2019-01-01", loanAmount: 2e9, actualInterestPaid: 0 }] };
const FR_RECT = { type: "free_realestate", subType: "free_use", isRelatedParty: true, propertyValue: 2e9, rectification: { giftTaxCalculated: 1e8, giftDate: "2020-01-01", terminationDate: "2022-01-01" } };

const CASES: Case[] = [
  // #19 §43② 선행 이익 합산의 기준일
  { id: "#19", title: "합병 §43² 선행 이익 — 증여일", base: SAME_MERGER, value: 200_000_000, misses: [["증여일 없음 (합산 누락)", w(SAME_MERGER, "giftDate"), "giftDate", 0]] },
  { id: "#19", title: "재산사용 §43² 선행 이익 — 증여일", base: SAME_PSU, value: 6_000_000, misses: [["증여일 없음 (합산 누락)", w(SAME_PSU, "giftDate"), "giftDate", 0]] },
  // #20 행위시법 기준일
  { id: "#20", title: "특정법인 거래일", base: SC_PRIOR, value: 120_000_000, misses: [["거래일 없음 (선행거래 합산·구법 판정 누락)", w(SC_PRIOR, "transactionDate"), "transactionDate", 0]] },
  { id: "#20", title: "증자 증여일 (§29③ 간주모집 2016.2.5 전 제외)", base: CI_DPO, value: 0, misses: [["증여일 없음 (제외 판정 누락)", w(CI_DPO, "giftDate"), "giftDate", 300_000_000]] },
  { id: "#20", title: "전환주식 발행일·전환일", base: CS, value: 240_000_000, misses: [
    ["발행일 없음 (부칙 §5② 2017 전 판정 누락)", { ...CS, atIssuance: w(CS.atIssuance, "giftDate") }, "atIssuance.giftDate", 240_000_000],
    ["전환일 없음", { ...CS, atConversion: w(CS.atConversion, "giftDate") }, "atConversion.giftDate", 240_000_000],
  ] },
  { id: "#20", title: "일감몰아주기 사업연도 종료일 (구법 ~2017 판정)", base: RC, value: 3_800_000_000, misses: [["종료일 없음", w(RC, "fiscalYearEndDate"), "fiscalYearEndDate", 3_800_000_000]] },
  // #21 특정법인 거래상대방
  { id: "#21", title: "특정법인 거래상대방", base: SC, value: 500_000_000, misses: [["상대방 없음 (판정 보류로 과세)", w(SC, "counterparty"), "counterparty", 500_000_000]] },
  // #22 특정법인 거래 입력
  { id: "#22", title: "특정법인 1호 거래이익", base: SC, value: 500_000_000, misses: [["거래이익 0", { ...SC, transactionBenefit: 0 }, "transactionBenefit", 0]] },
  { id: "#22", title: "특정법인 2호 시가·대가", base: SC_PRICE, value: 500_000_000, misses: [
    ["시가 없음", w(SC_PRICE, "marketValue"), "marketValue", 0],
    ["대가 없음", w(SC_PRICE, "consideration"), "consideration", 1_000_000_000],
  ] },
  { id: "#22", title: "특정법인 법인세 자동 안분", base: SC_AUTO, value: 400_000_000, misses: [
    ["소득금액 없음", w(SC_AUTO, "annualIncome"), "annualIncome", 500_000_000],
    ["산출세액 없음", w(SC_AUTO, "corporateTaxComputed"), "corporateTaxComputed", 500_000_000],
  ] },
  { id: "#22", title: "특정법인 명부 주식수·발행주식총수", base: SC_ROSTER, value: 500_000_000, misses: [
    ["수증자 주식수 0", { ...SC_ROSTER, shareholders: [SC_ROSTER.shareholders[0], { ...SC_ROSTER.shareholders[1], shares: 0 }] }, "shareholders.1.shares", 0],
    ["발행주식총수 0", { ...SC_ROSTER, shareholders: SC_ROSTER.shareholders.map((s) => ({ ...s, totalShares: 0 })) }, "shareholders.0.totalShares", 0],
  ] },
  // #23 일감몰아주기
  { id: "#23", title: "일감몰아주기 주주 2명·배당가능이익", base: RC_DIV, value: 3_648_000_000, misses: [
    ["배당가능이익 없음 (공제 소멸)", w(RC_DIV, "distributableProfit"), "distributableProfit", 3_800_000_000],
    ["주주 1명", { ...RC, shareholders: [{ ...RC_SH[0], directRatio: { numer: 10000, denom: 10000 } }] }, "shareholders", 7_600_000_000],
  ] },
  { id: "#23", title: "일감몰아주기 간접출자법인 배당가능이익(§34의3⑮2호)", base: RC_CORP, value: 5_244_000_000, misses: [
    ["간접출자법인 배당가능이익 없음 (공제 소멸)", { ...RC_CORP, intermediaryCorps: [{ ...RC_CORP.intermediaryCorps[0], distributableProfit: undefined }] }, "intermediaryCorps.0.distributableProfit", 5_320_000_000],
  ] },
  // #24 합병
  { id: "#24", title: "합병 단일 직접 평가", base: MERGER_DIRECT, value: 500_000_000, misses: [
    ["합병 후 1주당 평가가액 없음", w(MERGER_DIRECT, "mergedSharePrice"), "mergedSharePrice", 0],
    ["과대평가 1주평가 0", { ...MERGER_DIRECT, overvaluedSharePrice: 0 }, "overvaluedSharePrice", 900_000_000],
    ["대주주등 주식수 0", { ...MERGER_DIRECT, majorShares: 0 }, "majorShares", 0],
  ] },
  { id: "#24", title: "합병 단일 자동 평가(§28⑤)", base: MERGER_AUTO, value: 400_000_000, misses: [
    ["과소평가 1주평가 없음", w(MERGER_AUTO, "underSharePrice"), "underSharePrice", 0],
    ["과소평가 합병 전 주식수 없음", w(MERGER_AUTO, "underPreShares"), "underPreShares", 0],
    ["합병 후 주식수 없음", w(MERGER_AUTO, "postMergerTotalShares"), "postMergerTotalShares", 0],
    ["상장인데 종가평균 없음", { ...MERGER_AUTO, isListed: true }, "listedPostAvgPrice", 400_000_000],
  ] },
  { id: "#24", title: "합병 주식 외 재산", base: MERGER_NON_STOCK, value: 400_000_000, misses: [
    ["액면가액 없음", w(MERGER_NON_STOCK, "faceValue"), "faceValue", 0],
    ["1주평가 0", { ...MERGER_NON_STOCK, overvaluedSharePrice: 0 }, "overvaluedSharePrice", 500_000_000],
    ["대주주등 주식수 0", { ...MERGER_NON_STOCK, majorShares: 0 }, "majorShares", 0],
  ] },
  { id: "#24", title: "분할합병 순자산비율(§28⑦)", base: MERGER_SPLIT, value: 500_000_000, misses: [
    ["분할직전 1주평가 없음", w(MERGER_SPLIT, "splitCompanyPreSharePrice"), "splitCompanyPreSharePrice", 900_000_000],
    ["분할사업부문 순자산 없음", w(MERGER_SPLIT, "splitBusinessNetAsset"), "splitBusinessNetAsset", 900_000_000],
    ["분할법인 순자산 없음", w(MERGER_SPLIT, "splitCompanyNetAsset"), "splitCompanyNetAsset", 900_000_000],
  ] },
  { id: "#24", title: "합병 주주 매트릭스", base: MERGER_MATRIX, value: 4_000_000_000, misses: [
    ["과소평가 1주평가 없음", w(MERGER_MATRIX, "underSharePrice"), "underSharePrice", 0],
    ["합병 후 주식수 없음", w(MERGER_MATRIX, "postMergerTotalShares"), "postMergerTotalShares", 0],
    ["교부 환산비 0", { ...MERGER_MATRIX, shareholders: { ...MX_SH, exchangeRatio: { numer: 0, denom: 2 } } }, "shareholders.exchangeRatio", 0],
    ["이익측 주주 없음", { ...MERGER_MATRIX, shareholders: { ...MX_SH, overvalued: [] } }, "shareholders.overvalued", 0],
    ["증여자측 주주 없음 (증여자별 안분 소실)", { ...MERGER_MATRIX, shareholders: { ...MX_SH, undervalued: [] } }, "shareholders.undervalued", 4_000_000_000],
  ] },
  // #25 감자
  { id: "#25", title: "감자 저가(§29의2①1호)", base: CD_LOW, value: 375_000_000, misses: [
    ["1주당 평가액 0", { ...CD_LOW, sharePrice: 0 }, "sharePrice", 0],
    ["대주주등 감자후 지분비율 없음", w(CD_LOW, "majorPostRatio"), "majorPostRatio", 0],
    ["특수관계인 감자 주식수 없음", w(CD_LOW, "relatedRedeemedShares"), "relatedRedeemedShares", 0],
    ["총감자 주식수 없음 (산출근거 행 0)", w(CD_LOW, "totalRedeemedShares"), "totalRedeemedShares", 375_000_000],
  ] },
  { id: "#25", title: "감자 고가(§29의2①2호)", base: CD_HIGH, value: 850_000_000, misses: [
    ["1주당 평가액 0", { ...CD_HIGH, sharePrice: 0 }, "sharePrice", 1_000_000_000],
    ["감자 주식수 없음", w(CD_HIGH, "ownRedeemedShares"), "ownRedeemedShares", 0],
    ["액면가액 없음 (액면 게이트 불발)", w(CD_HIGH, "faceValue"), "faceValue", 0],
  ] },
  { id: "#25", title: "감자 불균등 명부", base: CD_MULTI, value: 225_000_000, misses: [
    ["감자 전 발행주식총수 없음", w(CD_MULTI, "preTotalShares"), "preTotalShares", 0],
    ["주주 1명", { ...CD_MULTI, shareholders: [CD_R2] }, "shareholders", 0],
    ["감자주주 소각대가 없음", { ...CD_MULTI, shareholders: [CD_R1, w(CD_R2, "redemptionPricePerShare")] }, "shareholders.1.redemptionPricePerShare", 300_000_000],
    ["특수관계 그룹 없음", { ...CD_MULTI, shareholders: [CD_R1, w(CD_R2, "relationGroup")] }, "shareholders.1.relationGroup", 0],
    ["감자 전 주식수 0", { ...CD_MULTI, shareholders: [{ ...CD_R1, preShares: 0 }, CD_R2] }, "shareholders.0.preShares", 0],
  ] },
  // #26 전환사채
  { id: "#26", title: "전환사채 주식전환(가~다목)", base: CB_CONV, value: 500_000_000, misses: [
    ["전환 전 1주평가 없음", w(CB_CONV, "preConvPrice"), "preConvPrice", 0],
    ["전환가액 없음", w(CB_CONV, "conversionPrice"), "conversionPrice", 666_650_000],
    ["증가주식수 없음", w(CB_CONV, "increasedShares"), "increasedShares", 750_000_000],
    ["상장인데 종가평균 없음", { ...CB_CONV, isListed: true }, "listedMarketAvg", 500_000_000],
  ] },
  { id: "#26", title: "전환사채 주식전환(라목)", base: CB_REV, value: 250_000_000, misses: [
    ["특수관계인 전환 전 지분비율 없음", w(CB_REV, "relatedPreRatio"), "relatedPreRatio", 0],
    ["전환 전 1주평가 0", { ...CB_REV, preConvPrice: 0 }, "preConvPrice", 333_350_000],
  ] },
  { id: "#26", title: "전환사채 양도·인수", base: CB_TRANSFER, value: 500_000_000, misses: [
    ["양도가액 없음", w(CB_TRANSFER, "transferPrice"), "transferPrice", 0],
    ["시가 0", { ...CB_TRANSFER, bondMarketValue: 0 }, "bondMarketValue", 1_500_000_000],
    ["인수 — 시가 0", { ...CB_ACQ, bondMarketValue: 0 }, "bondMarketValue", 0],
  ] },
  // #27 조직변경
  { id: "#27", title: "조직변경 지분 변동", base: { type: "org_change", subType: "share_change", baseValue: 1e9, preShares: 1000, postShares: 5000, postPerSharePrice: 50000 }, value: 0, misses: [
    ["변동 전 재산가액 0 (기준금액 0 → 과세)", { type: "org_change", subType: "share_change", baseValue: 0, preShares: 1000, postShares: 5000, postPerSharePrice: 50000 }, "baseValue", 200_000_000],
    ["변동 후 1주당 가액 없음", { type: "org_change", subType: "share_change", baseValue: 1e9, preShares: 1000, postShares: 11000 }, "postPerSharePrice", 0],
  ] },
  // #28 신탁
  { id: "#28", title: "신탁이익 유기정기금", base: TB, value: 1_222_991_440, misses: [
    ["분할 횟수 없음", w(TB, "installments"), "installments", 1_000_000_000],
    ["원본 가액 0", { ...TB, trustPropertyValue: 0 }, "trustPropertyValue", 0],
    ["수익권 증여시기 없음 (이관 증여일 공란)", w(TB, "incomeGiftDate"), "incomeGiftDate", 1_222_991_440],
    ["원본권 증여시기 없음 (이관 증여일 공란)", w(TB, "principalGiftDate"), "principalGiftDate", 1_222_991_440],
  ] },
  { id: "#28", title: "신탁이익 종신정기금", base: TB_LIFE, value: 1_388_918_013, misses: [
    ["기대여명·성별·연령 없음", w(TB_LIFE, "expectedRemainingYears"), "expectedRemainingYears", 1_000_000_000],
    ["성별만", { ...w(TB_LIFE, "expectedRemainingYears"), beneficiaryGender: "male" }, "expectedRemainingYears", 1_000_000_000],
  ] },
  // #29 초과배당
  { id: "#29", title: "초과배당 주주·종합과세", base: ED, value: 330_000_000, misses: [
    ["종합과세 과세표준 없음", w(ED, "comprehensiveTaxBase"), "comprehensiveTaxBase", 383_400_000],
    ["최대주주 없음", { ...ED, shareholders: [ED_SH[1]] }, "shareholders", 0],
    ["특수관계인 없음", { ...ED, shareholders: [ED_SH[0]] }, "shareholders", 0],
    ["지분율 0 행", { ...ED, shareholders: [ED_SH[0], { ...ED_SH[1], ownershipRatio: { numer: 0, denom: 10000 } }] }, "shareholders.1.ownershipRatio", 550_000_000],
  ] },
  { id: "#29", title: "초과배당 정산(§41의2③) — 증여자 관계", base: ED_SETTLE, value: 460_000_000, misses: [
    ["관계 없음 (정산 결과 소실 — 가액은 같다)", w(ED_SETTLE, "giftTaxContext"), "giftTaxContext", 460_000_000],
  ] },
  // #30 상장차익
  { id: "#30", title: "상장차익", base: { type: "listing_gain", settlementPerSharePrice: 50000, perShareAcqValue: 10000, perShareCorpGrowth: 5000, shares: 100000, corpGrowthAuto: { totalNetIncomePerShare: 12000, monthsBusinessStartToListingPrevDay: 24, monthsAcqToSettlement: 12 } }, value: 3_400_000_000, misses: [
    ["정산기준일 평가가액 0", { type: "listing_gain", settlementPerSharePrice: 0, perShareAcqValue: 10000, perShareCorpGrowth: 5000, shares: 100000 }, "settlementPerSharePrice", 0],
    ["주식수 0", { type: "listing_gain", settlementPerSharePrice: 50000, perShareAcqValue: 10000, perShareCorpGrowth: 5000, shares: 0 }, "shares", 0],
    ["월수(분모) 0", { type: "listing_gain", settlementPerSharePrice: 50000, perShareAcqValue: 10000, perShareCorpGrowth: 5000, shares: 100000, corpGrowthAuto: { totalNetIncomePerShare: 12000, monthsBusinessStartToListingPrevDay: 0, monthsAcqToSettlement: 12 } }, "corpGrowthAuto.monthsBusinessStartToListingPrevDay", 0],
    ["월수(곱수) 0", { type: "listing_gain", settlementPerSharePrice: 50000, perShareAcqValue: 10000, perShareCorpGrowth: 5000, shares: 100000, corpGrowthAuto: { totalNetIncomePerShare: 12000, monthsBusinessStartToListingPrevDay: 24, monthsAcqToSettlement: 0 } }, "corpGrowthAuto.monthsAcqToSettlement", 3_950_000_000],
  ] },
  // #31 증자·전환주식·현물출자
  { id: "#31", title: "증자 저가 실권주 재배정", base: CI_LOW, value: 300_000_000, misses: [["배정 신주수 0", { ...CI_LOW, forfeitedShares: 0 }, "forfeitedShares", 0]] },
  { id: "#31", title: "증자 고가 비율 인자", base: CI_HIGH, value: 150_000_000, misses: [
    ["분모 신주수 없음", w(CI_HIGH, "ratioDenomShares"), "ratioDenomShares", 0],
    ["특수관계인 인수 신주수 없음", w(CI_HIGH, "relatedAcquiredShares"), "relatedAcquiredShares", 0],
  ] },
  { id: "#31", title: "증자 저가 나목 비율 인자", base: CI_NR, value: 31_246_875, misses: [
    ["균등증자 가정 증가주식수 없음", w(CI_NR, "equalIssueShares"), "equalIssueShares", 33_330_000],
    ["특수관계인 실권주수 없음", w(CI_NR, "relatedAcquiredShares"), "relatedAcquiredShares", 281_250_000],
    ["증자 후 지분비율 없음", w(CI_NR, "postIssueSubscriberRatio"), "postIssueSubscriberRatio", 281_250_000],
  ] },
  { id: "#31", title: "전환주식 고가 비율 인자", base: CS_HIGH, value: 120_000_000, misses: [
    ["전환 시점 분모 없음", { ...CS_HIGH, atConversion: w(CS_HIGH.atConversion, "ratioDenomShares") }, "atConversion.ratioDenomShares", 0],
    ["발행 시점 분모 없음", { ...CS_HIGH, atIssuance: w(CS_HIGH.atIssuance, "ratioDenomShares") }, "atIssuance.ratioDenomShares", 150_000_000],
    ["전환 시점 분자 없음", { ...CS_HIGH, atConversion: w(CS_HIGH.atConversion, "relatedAcquiredShares") }, "atConversion.relatedAcquiredShares", 0],
  ] },
  { id: "#31", title: "현물출자 저가 수량", base: CON_LOW, value: 500_000_000, misses: [
    ["현물출자 주식수 0", { ...CON_LOW, contributedShares: 0 }, "contributedShares", 750_000_000],
    ["배정 신주수 0", { ...CON_LOW, allocatedShares: 0 }, "allocatedShares", 0],
  ] },
  { id: "#31", title: "현물출자 고가 지분비율·명부", base: CON_HIGH, value: 333_350_000, misses: [
    ["지분비율 없음 (명부 없음)", w(CON_HIGH, "relatedRatio"), "relatedRatio", 0],
    ["명부 관계 없음 (이관 탈락)", { ...CON_HIGH_P, parties: [{ name: "a", preShares: 50000 }] }, "parties.0.relation", 333_350_000],
    ["명부 주식수 0", { ...CON_HIGH_P, parties: [{ name: "a", preShares: 0, relation: "father" }] }, "parties.0.preShares", 0],
  ] },
  // #32 기타
  { id: "#32", title: "재산사용·가치증가", base: { type: "property_service_use", subType: "low_price", marketValue: 1e9, consideration: 5e8 }, value: 500_000_000, misses: [
    ["재산사용 시가 0", { type: "property_service_use", subType: "low_price", marketValue: 0, consideration: 5e8 }, "marketValue", 0],
    ["가치증가 현재가액 0", { type: "value_increase", currentValue: 0, acquisitionCost: 5e8, normalIncrease: 1e8, contribution: 1e8 }, "currentValue", 0],
  ] },
  { id: "#32", title: "금전 무상대출 §41의4② 기간", base: FL, value: 46_000_000, misses: [
    ["종료일만 없음 (기간 무시)", w(FL, "loanEndDate"), "loanEndDate", 46_000_000],
    ["시작일만 없음 (기간 무시)", w(FL, "loanStartDate"), "loanStartDate", 46_000_000],
    ["시작일 > 종료일", { ...FL, loanStartDate: "2027-01-01" }, "loanEndDate", 0],
  ] },
  { id: "#32", title: "부동산 무상사용 다기간", base: FR_USE, value: 151_631_469, misses: [["기간 부동산 가액 없음", { ...FR_USE, periods: [{ startDate: "2019-01-01" }] }, "periods.0.propertyValue", 0]] },
  { id: "#32", title: "부동산 무상담보 다기간", base: FR_COLL, value: 92_000_000, misses: [["기간 차입금 없음", { ...FR_COLL, periods: [{ startDate: "2019-01-01" }] }, "periods.0.loanAmount", 0]] },
  { id: "#32", title: "부동산 무상사용 경정청구", base: FR_RECT, value: 151_631_469, misses: [["산출세액 0 (환급세액 0)", { ...FR_RECT, rectification: { ...FR_RECT.rectification, giftTaxCalculated: 0 } }, "rectification.giftTaxCalculated", 151_631_469]] },
];

describe("증여의제 ⑫ — 엔진이 필요로 하는 값 (2차 #19~#32)", () => {
  for (const c of CASES) {
    it(`${c.id} ${c.title} — 🟢 ${c.value.toLocaleString()} / 🔴 ${c.misses.map((m) => m[0]).join(" · ")}`, async () => {
      await runCase(c);
    });
  }

  it("#29 정산 — 관계가 있으면 정산 결과가 나온다 (종전 관계 없이 보내면 결과 소실)", async () => {
    const r = await post(ED_SETTLE);
    expect(r.json.result.excessDividendDetail.settlement.settlementDue).toBe(7_760_000);
  });

  it("#20 증자 cap-table 증여일 — 🟢 2015 간주모집 제외 0 / 🔴 생략 400 (종전 250,000,000 과세)", async () => {
    const rows = [
      { id: "a", name: "갑", preShares: 50000, entitledShares: 25000, subscribedShares: 50000, reallocatedShares: 25000, relatedTo: ["b"], allocationMethod: "deemed_public_offering" },
      { id: "b", name: "을", preShares: 50000, entitledShares: 25000, subscribedShares: 0, relatedTo: ["a"], allocationMethod: "deemed_public_offering" },
    ];
    const CT = { type: "capital_increase_allocation", direction: "low", giftDate: "2015-06-01", preIssuePrice: 20000, newSharePrice: 5000, isListed: true, shareholders: rows };
    const ok = await post(CT);
    expect(ok.status).toBe(200);
    expect(ok.json.result.perBeneficiary[0].total).toBe(0);
    const r = await post(w(CT, "giftDate"));
    expect(r.status).toBe(400);
    expect(paths(r.json)).toContain("giftDate");
  });

  // 판별 필드를 생략하면 ⑫는 엔진과 **같은 기본값**으로 갈래를 고른다(엔진 `?? "low"` 등). 기본값이 어긋나면
  // 긍정 짝이 엉뚱한 갈래의 필수 칸을 요구해 400이 되거나, 부정 짝이 통과한다.
  it("기본값 갈래 — 판별 필드 생략 시 엔진 기본값과 같은 갈래의 칸을 요구한다", async () => {
    const ok = async (b: B, v: number) => {
      const r = await post(b);
      expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
      expect(r.json.result.deemedGiftValue).toBe(v);
    };
    await ok(w(CI_LOW, "direction", "subType"), 300_000_000); // 증자 저가·실권주 재배정
    await ok(w(MERGER_DIRECT, "caseType", "mergedPriceMode"), 500_000_000); // 합병 주식교부·직접 평가
    await ok(w(CD_LOW, "caseType"), 375_000_000); // 감자 저가
    await ok(w(CB_ACQ, "caseType"), 500_000_000); // 전환사채 인수
    await ok(w(TB, "incomeAnnuityType"), 1_222_991_440); // 신탁 유기정기금
    const r = await post(w(TB, "incomeAnnuityType", "installments"));
    expect(r.status).toBe(400);
    expect(paths(r.json)).toContain("installments");
  });

  it("동일 조항 합산 — 증여일 없는 합병은 합산 전 값 0이었다 (종전 부재 시 윈도 미정)", async () => {
    // 긍정 짝과 부정 짝이 같은 body에서 증여일만 다르다는 것을 한 번 더 고정한다
    expect((await post(SAME_MERGER)).json.result.deemedGiftValue).toBe(200_000_000);
    expect((await post({ ...SAME_MERGER, giftDate: "2024-06-01", priorSameClauseGains: [] })).json.result.deemedGiftValue).toBe(0);
  });
});
