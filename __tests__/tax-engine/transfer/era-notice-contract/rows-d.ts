/**
 * I-26 표 D — 상속(§155② D17 재상속 · 2010.2.18. 전 동거봉양) · 농어촌(§155⑦3호 귀농) · §155① 신규 주택 취득 경위 · 조특법 §71의2①.
 *
 * 셀 입력은 판정 엔진(`checkExemption`) 직접 호출이 받는 모양이다 — 상속주택을 뺀 뒤의 주택 수(판정 메뉴 route가 뺀 값)와
 * 계산기 STEP 0.9가 명부에서 도출해 싣는 echo(`popDecline71_2Unconfirmed`)를 그대로 싣는다.
 */
import type { EraContractRow } from "./contract";
import { resolveExemptionHouseCountExclusions } from "@/lib/tax-engine/transfer-tax-house-exclusion-step";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeHouseInfo } from "../../_helpers/mock-rates";

const D = (s: string) => new Date(s);

/**
 * 상속주택 제외(STEP 0.95)는 계산기가 원래 주택 수에서 스스로 빼고(`transfer-tax-house-exclusion-step.ts` `exemptionJudgeInput.householdHousingCount`),
 * 판정 엔진 직접 호출은 뺀 뒤의 수를 받는다 — 한 입력으로 두 경로를 같은 판정에 세울 수 없다.
 */
/** 판정 엔진 직접 호출은 상속주택을 뺀 뒤의 주택 수(1)를, 계산기는 원래 주택 수(2)를 받아 STEP 0.95로 스스로 뺀다 — 계산기 대조에만 2로 둔다. */
const INHERITED_CALC_INPUT: Partial<TransferTaxInput> = { householdHousingCount: 2 };

/** D17 재상속 — 별도세대에서 받은 상속주택을 동일세대원이 다시 상속(재상속일 2020-05-15). 일반주택 취득일이 2013-02-15 이후라 괄호가 걸린다. */
const reInherited = (acq: string, over: Partial<TransferTaxInput> = {}): Partial<TransferTaxInput> => ({
  acquisitionDate: D(acq),
  transferDate: D("2026-06-15"),
  householdHousingCount: 1, // 상속주택을 뺀 뒤의 수
  residencePeriodMonths: 0,
  sellingHouseId: "S",
  houses: [
    makeHouseInfo("S", { acquisitionDate: D(acq) }),
    makeHouseInfo("A", {
      isInherited: true,
      isCoInherited: false,
      inheritedDate: D("2020-05-15"),
      acquisitionDate: D("1982-06-15"),
      decedentSameHouseholdAtInheritance: true,
      reInheritedFromSeparateHousehold: true,
    }),
  ],
  ...over,
});

/** 2010.2.18. 전 양도(2009-12-01) — 동일세대 상속이지만 동거봉양 합가 전부터 보유한 주택(단서의 예외). 그 시기에는 「상속개시 당시 보유」 괄호가 없다. */
const pre2010ParentalCare = (acq: string): Partial<TransferTaxInput> => ({
  acquisitionDate: D(acq),
  transferDate: D("2009-12-01"),
  householdHousingCount: 1, // 상속주택을 뺀 뒤의 수
  residencePeriodMonths: 60,
  sellingHouseId: "S",
  houses: [
    makeHouseInfo("S", { acquisitionDate: D(acq) }),
    makeHouseInfo("A", {
      isInherited: true,
      isCoInherited: false,
      inheritedDate: D("2008-05-15"),
      acquisitionDate: D("1982-06-15"),
      decedentSameHouseholdAtInheritance: true,
      parentalCareMergeInheritedHouse: true,
    }),
  ],
});

type Rural = NonNullable<TransferTaxInput["ruralHouse"]>;
/** §155⑦3호 귀농주택 — ⑩4호 가목 본인 · ⑪ 없음 · 귀농 전 취득 일반주택 (rural-return-to-farm-facts.anchor 기본 사실) */
const returnToFarm = (rural: Partial<Rural>, over: Partial<TransferTaxInput> = {}): Partial<TransferTaxInput> => ({
  acquisitionDate: D("2021-09-15"),
  transferDate: D("2026-11-16"),
  householdHousingCount: 2,
  residencePeriodMonths: 0,
  ruralHouse: {
    kind: "return_to_farm",
    isOutsideCapitalEupMyeon: true,
    acquisitionDate: D("2023-05-15"),
    isHighPriceAtAcquisition: false,
    landAreaSqm: 500,
    wholeHouseholdMoved: true,
    farmlandBasis: "ga",
    farmlandHolder: "self",
    priorReturnFarmExemption: "none",
    generalHouseAcquiredBeforeReturn: "yes",
    ...rural,
  },
  ...over,
});
/** 990㎡ 표기 시기 축 — 귀농주택 2006-05-15 취득 가목(2007-02-28 전). 2016-02-17 전 취득이라 종전 ⑩1호 연고지를 「예」로 둔다(D-85). */
const farm990 = (over: Partial<TransferTaxInput> = {}) =>
  returnToFarm({ acquisitionDate: D("2006-05-15"), hometownLocated: "yes" }, { acquisitionDate: D("2001-09-15"), ...over });

type Origin = NonNullable<NonNullable<TransferTaxInput["temporaryTwoHouse"]>["newHouseOrigin"]>;
/** §155① 일시적 2주택 — 종전주택 `prev` 취득 · 신규 주택 2025-09-15 취득(완공) · 양도 2026-06-15 (new-house-origin.anchor 기본 날짜) */
const tempTwo = (origin: Origin, prev = "2015-03-15"): Partial<TransferTaxInput> => ({
  acquisitionDate: D(prev),
  transferDate: D("2026-06-15"),
  householdHousingCount: 2,
  residencePeriodMonths: 60,
  temporaryTwoHouse: { previousAcquisitionDate: D(prev), newAcquisitionDate: D("2025-09-15"), newHouseOrigin: origin },
});
/** 종전주택 2024-08-01 취득 → 2026-06-15 양도(1년 10개월) — 보유 2년 미달로 과세가 정해진다(신규 주택은 1년 뒤 취득이라 그 요건은 충족) */
const SHORT_PREV = "2024-08-01";

const NOWON = "1135010500";
const PYEONGCHANG = "5176025021"; // 강원 평창군 — 인구감소지역(수도권 밖)
/**
 * 조특법 §71의2① — 노원 주택(양도) + 평창 인구감소지역주택(2024-03-01 취득 · 기준시가 2억) 2채(population-decline-71-2.anchor 판정 메뉴 사실).
 * 판정 엔진 직접 호출에는 계산기 STEP 0.9가 명부에서 도출하는 echo를 같은 함수로 만들어 싣는다(모름이면 빼지 않으므로 주택 수는 2 그대로).
 */
const popDecline = (p: Partial<HouseInfo>, sellAcq = "2023-06-01", transfer = "2026-11-01"): Partial<TransferTaxInput> => {
  const input: Partial<TransferTaxInput> = {
    transferPrice: 800_000_000,
    acquisitionDate: D(sellAcq),
    transferDate: D(transfer),
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    sellingHouseId: "s",
    houses: [
      makeHouseInfo("s", { region: "capital", regionCode: NOWON, acquisitionDate: D(sellAcq) }),
      makeHouseInfo("p", {
        region: "non_capital",
        regionCode: PYEONGCHANG,
        acquisitionDate: D("2024-03-01"),
        acquisitionOfficialPrice: 200_000_000,
        popDeclSoleAtAcquisition: "yes",
        popDeclAcquiredByGift: "no",
        ...p,
      }),
    ],
  };
  const echo = resolveExemptionHouseCountExclusions(baseTransferInput(input)).popDecline71_2Unconfirmed;
  return { ...input, ...(echo ? { popDecline71_2Unconfirmed: echo } : {}) };
};

export const ROWS_D: EraContractRow[] = [
  {
    id: "155-2-reinheritance-reference-date-unverified",
    decides: { input: reInherited("2016-03-15") },
    decidesWhy:
      "재상속일 기준으로 상속주택이 빠져 1주택 비과세 — 최초 상속일 기준이면 일반주택이 「상속개시 당시 보유」인지가 달라져 그 비과세의 전제가 흔들린다",
    silent: { input: reInherited("2018-03-15", { wasRegulatedAtAcquisition: true }) },
    silentWhy: "같은 재상속 행이 재상속일 기준으로 빠졌지만 취득 당시 조정대상지역 · 거주 0개월로 거주요건 미달 — 기준일과 무관하게 과세(D-69 settled 게이트)",
    calcInput: INHERITED_CALC_INPUT,
  },
  {
    id: "155-2-pre2010-parental-care-exception-unverified",
    decides: { input: pre2010ParentalCare("2004-01-01") },
    decidesWhy: "동거봉양 예외를 인정해 상속주택을 빼 1주택 비과세 — 2010.2.18. 전 양도분에 예외를 인정하지 않으면 동일세대 상속이라 2주택 과세",
    silent: { input: pre2010ParentalCare("2008-12-01") },
    silentWhy: "같은 동거봉양 예외로 상속주택이 빠졌지만 일반주택 보유 1년이라 보유요건 미달 — 예외 인정 여부와 무관하게 과세(D-69 settled 게이트)",
    calcInput: INHERITED_CALC_INPUT,
  },
  {
    id: "155-7-3ho-farm-facts-unconfirmed",
    decides: { input: returnToFarm({ farmlandBasis: "unknown" }) },
    decidesWhy: "⑩4호 영농 목적 「모름」으로 귀농주택 특례 불성립 과세 — 가목으로 채우면 일반주택 비과세",
    silent: { input: returnToFarm({ farmlandBasis: "unknown", landAreaSqm: 800 }) },
    silentWhy: "같은 ⑩4호 「모름」이지만 귀농주택 대지 800㎡(⑩3호 660㎡ 초과)로 특례가 확정 불성립 — 채워도 과세(rural-return-to-farm-facts.anchor R-4 축)",
  },
  {
    id: "155-10-4-farmland-area-990-era-unverified",
    decides: { input: farm990() },
    decidesWhy: "2007.2.28. 전 취득 귀농주택(가목)의 농지 990㎡ 표기 시기를 현행으로 읽어 귀농주택 특례로 비과세 — 그 독법이 비과세의 전제",
    silent: { input: farm990({ acquisitionDate: D("2006-01-01"), transferDate: D("2007-06-01") }) },
    silentWhy: "같은 2006 취득 가목 귀농주택(특례 요건 술어는 충족)이지만 일반주택 보유 1년 5개월로 당시 §154① 보유 3년 미달 — 990㎡ 독법과 무관하게 과세(settled 게이트)",
  },
  {
    id: "155-1-new-house-origin-unconfirmed",
    decides: { input: tempTwo({ kind: "unknown" }) },
    decidesWhy: "신규 주택 취득 경위 「모름」으로 일시적 2주택 불성립 과세 — 일반 취득으로 채우면 비과세",
    silent: { input: tempTwo({ kind: "unknown" }, SHORT_PREV) },
    silentWhy: "같은 경위 「모름」이지만 종전주택 보유 1년 10개월로 보유 2년 미달 — 일반 취득으로 채워도 과세",
  },
  {
    id: "155-1-new-house-origin-uncollected",
    decides: { input: tempTwo({ kind: "not_collected" }) },
    decidesWhy: "경위를 묻지 못한 신규 주택을 취득일 그대로 일시적 2주택으로 판정해 비과세 — 권리를 종전주택 전에 샀거나 승계 3년 경과면 과세로 바뀐다",
    silent: { input: tempTwo({ kind: "not_collected" }, SHORT_PREV) },
    silentWhy: "같은 경위 미수집이지만 종전주택 보유 2년 미달로 과세가 정해져 비과세 전제가 없다(settled 게이트)",
  },
  {
    id: "155-1-presale-holding-156-3-unverified",
    decides: { input: tempTwo({ kind: "presale", rightAcquisitionDate: D("2022-01-01") }) },
    decidesWhy: "종전주택 보유 중 취득한 분양권(2022) 완공 주택을 §155① 완공일 기준으로 판정해 비과세 — §156의3②·③으로만 보면 3년 경과로 불성립",
    silent: { input: tempTwo({ kind: "presale", rightAcquisitionDate: D("2024-09-01") }, SHORT_PREV) },
    silentWhy: "같은 보유 중 분양권 갈래(§156의3 요건도 불충족)지만 종전주택 보유 2년 미달로 §155① 독법에서도 과세 — 비과세 전제가 없다(settled 게이트)",
  },
  {
    id: "71-2-pop-decline-unconfirmed",
    decides: { input: popDecline({ popDeclSoleAtAcquisition: "unknown" }) },
    decidesWhy: "인구감소지역주택 취득 당시 1채 보유 여부 「모름」으로 소유주택에서 빼지 않아 2주택 과세 — 빼면 1주택 비과세",
    silent: { input: popDecline({ popDeclSoleAtAcquisition: "unknown" }, "2024-02-01", "2024-12-01") },
    silentWhy: "같은 후보 「모름」(echo 그대로)이지만 양도 주택 보유 10개월로 보유 2년 미달 — 후보를 빼도 과세(population-decline-71-2.anchor R-5 짝)",
  },
];
