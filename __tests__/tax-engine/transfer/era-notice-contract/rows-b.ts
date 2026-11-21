/**
 * I-26 표 — B군(§155① 일시적 2주택 축 · `one-house/era-undetermined-temp-two-house.ts`).
 *
 * 셀 출처: 조정 여부·가목 전입 `temporary-two-house-regulated-move-in-a2b` R7·M2 · 2002 경과조치 `one-house-era-deadlines-d13-d14-d15` D14 ·
 * 공고일 표 `temporary-two-house-announcement-table-missing-l7`·`-conclusion-only-s07-9`(두 시료는 공고일 표를 vi.mock으로 지운다) ·
 * ⑱ 방법 `temp-two-house-pending-notices-j4-j6` J-6 · 합가 D8 짝 `__tests__/calc/temp-two-house-d8-one-year-waiver-j3`(판정 메뉴 경로가
 * 엔진에 넘기는 입력을 캡처해 결론과 무관한 칸을 뺐다) · ⑯ `temporary-two-house-155-16-region-unit`·`-capital-gunwi-pr5`.
 * 침묵 셀은 모두 수집기를 게이트 없이(`relevance` 생략) 부르면 고지가 나오는 입력이다(전제 사실은 그대로 — 실측).
 */
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { EraContractRow } from "./contract";

const d = (s: string) => new Date(s);
type TT = NonNullable<TransferTaxInput["temporaryTwoHouse"]>;

/** 종전 = 양도 주택(취득일 같음) · 2주택 · 거주 0. */
const twoHouse = (prevAcq: string, newAcq: string, transfer: string, tt: Partial<TT> = {}, over: Partial<TransferTaxInput> = {}) => ({
  householdHousingCount: 2,
  acquisitionDate: d(prevAcq),
  transferDate: d(transfer),
  residencePeriodMonths: 0,
  temporaryTwoHouse: { previousAcquisitionDate: d(prevAcq), newAcquisitionDate: d(newAcq), ...tt },
  ...over,
});

/** 종전주택 취득 당시 조정대상지역(선언) · 거주 0 — §154① 거주 2년 미달로 어느 독법이든 과세. */
const residenceFails: Partial<TransferTaxInput> = { wasRegulatedAtAcquisition: true, residencePeriodMonths: 0 };
const BOTH_DECLARED: Partial<TT> = { previousHouseRegulatedAtNewAcquisition: true, newHouseRegulatedAtAcquisition: true };

const NAJU = "1217000000";
const GWANGJU_BUK = "1230000000";
const DAEGU_DONG = "2714000000";
const SUWON_YEONGTONG = "4111710300";
const GUMI = "4719000000";

/** 합가 D8 — A 양도 · 상대 쪽 짝 B(2021-06-01) → C(2022-04-19) 1년 안 · A 3호(부득이) · 판정 메뉴가 넘기는 엔진 입력. */
const d8 = (over: Partial<TransferTaxInput> = {}): Partial<TransferTaxInput> => ({
  acquisitionDate: d("2018-02-22"),
  transferDate: d("2025-03-19"),
  transferPrice: 800_000_000,
  householdHousingCount: 3,
  marriageMerge: { marriageDate: d("2022-11-23") },
  isFirstTransferredInMerge: true,
  residencePeriodMonths: 24,
  oneHouseExemptionProviso: { reason: "unavoidable" },
  temporaryTwoHouse: {
    previousAcquisitionDate: d("2021-06-01"),
    newAcquisitionDate: d("2022-04-19"),
    previousHouseIsRosterRow: true,
    newHouseRowId: "c",
    newHouseOrigin: { kind: "general" },
  },
  houses: [
    { id: "selling", region: "capital", acquisitionDate: d("2018-02-22"), officialPrice: 0, isInherited: false, isLongTermRental: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false },
    { id: "b", region: "non_capital", acquisitionDate: d("2021-06-01"), officialPrice: 300_000_000, isInherited: false, isLongTermRental: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false, mergeOrigin: "counterpart_side" },
    { id: "c", region: "non_capital", acquisitionDate: d("2022-04-19"), officialPrice: 300_000_000, isInherited: false, isLongTermRental: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false, mergeOrigin: "counterpart_side" },
  ],
  sellingHouseId: "selling",
  ...over,
} as Partial<TransferTaxInput>);

export const ROWS_B: EraContractRow[] = [
  {
    id: "155-1-move-in-requirement-unverified",
    decides: { input: twoHouse("2015-01-01", "2020-06-01", "2021-03-01", BOTH_DECLARED) },
    decidesWhy: "2019-12-17 체제 조정→조정(선언) 1년 기한 안 양도 · 전입일 미입력 — 가목 불성립으로 과세, 신규 취득 1년 안 전입이면 비과세",
    silent: { input: twoHouse("2018-01-01", "2020-06-01", "2021-03-01", BOTH_DECLARED, residenceFails) },
    silentWhy: "같은 전입일 미입력이지만 종전주택을 조정대상지역에서 취득(2018)하고 거주 0개월 — §154① 거주 2년 미달로 전입해도 과세(moveInDecides 거짓)",
  },
  {
    id: "155-1-2002-transition-unverified",
    decides: { input: twoHouse("1995-01-01", "2002-03-29", "2003-06-01") },
    decidesWhy: "신규 2002-03-29 취득 · 2003-06-01 양도 — 2년 독법이면 비과세, 부칙 ③ 1호 본문(시행일부터 1년 = 2003-03-30)이면 과세 — 결론이 1호 단서에 달림",
    silent: { input: twoHouse("2001-06-01", "2002-03-29", "2003-06-01") },
    silentWhy: "같은 1호 단서 구간 양도인데 종전주택 보유 2년(2001-06-01~2003-06-01) 미달로 과세 — 다른 독법은 기한을 줄이기만 해 결론을 못 바꾼다(I-26에서 고친 게이트 — 비과세일 때만)",
  },
  {
    id: "155-1-regulated-at-new-acquisition-unverified",
    decides: { input: twoHouse("2015-01-01", "2020-06-01", "2021-08-01", {}, { isRegulatedArea: true }) },
    decidesWhy: "신규 취득 당시 두 주택 조정 여부 미입력 — 조정→조정 1년 독법은 기한 도과 과세, 한쪽이라도 비조정이면 3년 안이라 비과세",
    silent: { input: twoHouse("2018-01-01", "2020-06-01", "2021-08-01", {}, { isRegulatedArea: true, ...residenceFails }) },
    silentWhy: "같은 조정 여부 미입력이지만 종전주택 취득 당시 조정대상지역·거주 0개월 — §154① 거주 2년 미달로 어느 독법이든 과세(regulatedReadingDecides 거짓)",
  },
  {
    id: "155-1-regulated-announcement-date-unverified",
    decides: null,
    decidesWhy:
      "공고일 표(PRE_DESIGNATION_CONTRACT_EXCLUSION)에 지정 시작일이 빠졌을 때만 나는 고지인데 실데이터에는 빠진 시작일이 0건이다" +
      "(regulated-area-governing-designation.test.ts 커버리지 단언) — 계약은 표에서 2020-06-19를 vi.mock으로 지운 " +
      "temporary-two-house-announcement-table-missing-l7.anchor.test.ts(고지)·temporary-two-house-announcement-conclusion-only-s07-9.anchor.test.ts(P2 결론 불변 → 침묵 · P3)가 지킨다",
    silent: null,
    silentWhy: "결론 불변 셀도 같은 mock anchor(S07-9 P2 — 종전 취득 뒤 1년 안 신규 취득)가 지킨다",
  },
  {
    id: "155-18-disposal-method-unverified",
    decides: { input: twoHouse("2015-01-01", "2018-03-01", "2021-06-01", { newHouseRegulatedAtAcquisition: false, disposalDelayReason: "kamco" }) },
    decidesWhy: "⑱ kamco 사유 · 2022-02-15 전 양도 · 3년 기한 도과 — 「그 방법으로 양도」를 확인하면 기한 충족으로 비과세",
    silent: { input: twoHouse("2017-10-01", "2018-03-01", "2021-06-01", { newHouseRegulatedAtAcquisition: false, disposalDelayReason: "kamco" }) },
    silentWhy: "같은 방법 미확인이지만 종전 취득(2017-10-01) 후 1년 안 신규 취득 — 요건 A 불성립으로 방법을 확인해도 과세(disposalMethodDecides 거짓)",
  },
  {
    id: "155-1-roster-pair-one-year-waiver-unverified",
    decides: { input: d8() },
    decidesWhy: "합가 D8 상대 쪽 짝 B→C가 1년 안 · A 3호(부득이) — 짝의 1년 요건을 A의 단서로 면제하면 비과세, 면제하지 않아 과세",
    silent: {
      input: d8({
        householdHousingCount: 4,
        houses: [
          ...(d8().houses ?? []),
          { id: "d", region: "non_capital", acquisitionDate: d("2010-01-01"), officialPrice: 300_000_000, isInherited: false, isLongTermRental: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false },
        ],
      }),
    },
    silentWhy: "같은 짝·같은 단서인데 주택이 하나 더(4주택) — 면제 여부와 무관하게 과세(temporaryTwoHouseVariantsDecide 거짓)",
  },
  {
    id: "155-16-merged-special-city-unit",
    decides: {
      input: twoHouse("2019-01-01", "2022-03-02", "2026-08-03", { publicInstitutionRelocation: true, relocatedSigunguCode: NAJU, newHouseSigunguCode: GWANGJU_BUK }),
    },
    decidesWhy: "나주 → 옛 광주 북구 · 2026-08-03 양도(3년 지남·5년 안) — 옛 광주 5개 자치구를 한 시로 읽으면 연접(⑯ 5년) 비과세, 구 단위면 과세",
    silent: {
      input: twoHouse("2019-01-01", "2022-03-02", "2026-08-03", { publicInstitutionRelocation: true, relocatedSigunguCode: NAJU, newHouseSigunguCode: GWANGJU_BUK }, residenceFails),
    },
    silentWhy: "같은 통합특별시 독법 분기지만 종전주택 취득 당시 조정대상지역·거주 0개월 — §154① 거주 미달로 어느 독법이든 과세(D-68 게이트)",
  },
  {
    id: "155-16-gunwi-boundary-era",
    decides: {
      input: twoHouse("2015-01-01", "2021-01-04", "2024-06-03", { publicInstitutionRelocation: true, relocatedSigunguCode: DAEGU_DONG, newHouseSigunguCode: GUMI }, { regionCode: SUWON_YEONGTONG, residencePeriodMonths: 60 }),
    },
    decidesWhy: "대구 동구 이전 · 구미 신규(2021-01-04 · 편입 전) · 2024-06-03 양도 — 양도일 행정구역이면 연접(⑯ 5년) 비과세, 신규 취득일·부칙 제5조② 독법이면 과세",
    silent: {
      input: twoHouse("2020-03-01", "2021-03-02", "2024-06-03", { publicInstitutionRelocation: true, relocatedSigunguCode: DAEGU_DONG, newHouseSigunguCode: GUMI }, { regionCode: SUWON_YEONGTONG, residencePeriodMonths: 0 }),
    },
    silentWhy: "같은 군위 경계 분기(신규 2021-03-02 · 양도 2024-06-03)지만 종전주택(수원 영통 2020-03-01 · 조정 중 취득) 거주 0개월 — 거주 미달로 어느 독법이든 과세(D-68 게이트)",
  },
];
