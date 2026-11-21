/**
 * I-26 표 C 묶음 — 거주·연혁·날짜 고지(신도시 소재 · 사업인정 고시일 · 용도변경 경과규정 · 공휴일 표 · 화성 열흘 · §154⑧2호 · 거주 구간 통산).
 *
 * 거주 고지 게이트(`residenceDecides`)는 보유 미달 1주택(PD-15)을 일부러 고지 유지로 두므로(`era-notice-relevance.ts` `residenceDecidesConclusion`),
 * 결론 불변 셀은 「보유 미달」이 아니라 거주와 무관하게 과세가 정해지는 3주택으로 둔다.
 */
import type { EraContractRow } from "./contract";

const D = (s: string) => new Date(s);

/** 2007 양도 · 2000 취득 · 주소 없음 · 거주 0 — 2011.6.2. 이전 양도분 서울·신도시 거주 2년 요건 */
const capitalNewTown = { transferDate: D("2007-05-01"), acquisitionDate: D("2000-01-01"), residencePeriodMonths: 0 };

/** 공익사업 수용 단서 · 고시일 공란 · 보유 9개월(단서가 없으면 보유 미달) */
const expropriation = {
  acquisitionDate: D("2023-09-01"),
  transferDate: D("2024-06-01"),
  residencePeriodMonths: 0,
  oneHouseExemptionProviso: { reason: "expropriation" as const, expropriationDate: D("2024-06-01") },
};

/** 오피스텔 2015 취득 → 2021-06-01 주거용 전환(김포 지정 기간) · 거주 0 · 2025 양도 (#35 anchor S35-1) */
const usageConversion = {
  transferPrice: 1_000_000_000,
  acquisitionPrice: 600_000_000,
  acquisitionDate: D("2015-06-01"),
  transferDate: D("2025-06-01"),
  residencePeriodMonths: 0,
  regionCode: "4157010100",
  nonHousingToHousingConversion: { residentialUseStartDate: D("2021-06-01"), residenceMonthsTrimmed: 0 },
};

/** 화성 효행구 2020-06-25 취득(지정 시작 열흘 안) · 거주 0 */
const hwaseong = {
  regionCode: "4159325021",
  acquisitionDate: D("2020-06-25"),
  transferDate: D("2024-06-25"),
  residencePeriodMonths: 0,
};

/** 취득 2019-01-01 · 비거주 2019-11-01~2022-03-15 · 그 주택에 거주한 채 거주자 전환 (PR-12 anchor I-31) */
const nonResident = {
  acquisitionDate: D("2019-01-01"),
  residencePeriodMonths: 0,
  nonResidentHoldingPeriod: { startDate: D("2019-11-01"), endDate: D("2022-03-15"), residedAtConversion: true },
};

/** 2022-01-01부터 875일을 다음 날 이어진 10구간으로 — 구간별 완성 개월 합 20, 날수로 이어 붙이면 28 (I-07 anchor I-25) */
const tenIntervals = [
  ["2022-01-01", "2022-03-28"],
  ["2022-03-29", "2022-06-24"],
  ["2022-06-25", "2022-09-19"],
  ["2022-09-20", "2022-12-16"],
  ["2022-12-17", "2023-03-13"],
  ["2023-03-14", "2023-06-09"],
  ["2023-06-10", "2023-09-04"],
  ["2023-09-05", "2023-12-01"],
  ["2023-12-02", "2024-02-26"],
  ["2024-02-27", "2024-05-24"],
].map(([s, e]) => ({ start: D(s), end: D(e) }));
const intervals = {
  acquisitionDate: D("2021-06-01"),
  transferDate: D("2025-06-01"),
  wasRegulatedAtAcquisition: true,
  residencePeriodMonths: 20,
  residenceIntervals: tenIntervals,
};

/** §155① 일시적 2주택 — 신규 2025-06-01 취득(비조정 → 3년 말일 2028-06-01, 2028년 = 예정 공휴일 해) · 양도 2028-06-04 */
const holidayTwoHouse = (previousAcquisition: string) => ({
  householdHousingCount: 2,
  acquisitionDate: D(previousAcquisition),
  transferDate: D("2028-06-04"),
  residencePeriodMonths: 0,
  temporaryTwoHouse: {
    previousAcquisitionDate: D(previousAcquisition),
    newAcquisitionDate: D("2025-06-01"),
    previousHouseRegulatedAtNewAcquisition: false,
    newHouseRegulatedAtAcquisition: false,
  },
});

export const ROWS_C: EraContractRow[] = [
  {
    id: "154-1-capital-newtown-location-unverified",
    decides: { input: capitalNewTown },
    decidesWhy: "2007 양도 1주택·주소 없음·거주 0 — 신도시 지구 밖이면 거주요건이 없어 비과세로 바뀐다",
    silent: { input: { ...capitalNewTown, householdHousingCount: 3 } },
    silentWhy: "같은 주소 미입력이지만 3주택이라 거주요건과 무관하게 과세(residenceDecides 거짓)",
  },
  {
    id: "154-1-expropriation-notice-date-unverified",
    decides: { input: expropriation },
    decidesWhy: "수용 단서·고시일 공란·보유 9개월 — 고시일이 취득 전이면 단서가 서서 비과세로 바뀐다",
    silent: { input: { ...expropriation, householdHousingCount: 3 } },
    silentWhy: "같은 고시일 공란이지만 3주택이라 단서가 서도 과세(고시일 앞·뒤 두 반사실 결론이 같다)",
  },
  {
    id: "154-1-usage-conversion-transition-unverified",
    decides: { input: usageConversion },
    decidesWhy: "2015 비주택 취득·2021 지정 중 주거용 전환·거주 0 — 원취득일로 읽으면 거주요건이 없어 비과세로 바뀐다",
    silent: { input: { ...usageConversion, householdHousingCount: 3 } },
    silentWhy: "같은 용도변경 독법이지만 3주택이라 거주요건과 무관하게 과세(#35 anchor S35-10과 같은 짝)",
  },
  {
    id: "civil-161-holiday-table-uncovered",
    decides: { input: holidayTwoHouse("2022-01-01") },
    decidesWhy: "일시적 2주택 처분기한 말일 2028-06-01(예정 공휴일 해) 사흘 뒤 양도 — 임시공휴일로 기한이 늘면 비과세로 바뀐다",
    silent: { input: holidayTwoHouse("2025-01-01") },
    silentWhy:
      "같은 말일·같은 양도일인데 종전 취득 뒤 1년 안에 신규 취득(§155① 1년 요건 미충족)이라 기한을 지켰다고 봐도 과세 " +
      "(I-26에서 고친 게이트 — 종전에는 말일과 양도일의 거리만 봤다)",
  },
  {
    id: "regulated-hwaseong-announcement-window-unverified",
    decides: { input: hwaseong },
    decidesWhy: "화성 효행구 2020-06-25 취득·거주 0 — 정정공고일(6.29.)로 읽으면 취득 당시 비조정이라 거주요건이 없어 비과세로 바뀐다",
    silent: { input: { ...hwaseong, householdHousingCount: 3 } },
    silentWhy: "같은 열흘 안 취득이지만 3주택이라 거주요건과 무관하게 과세(보유 미달 1주택은 PD-15로 고지 유지라 쓰지 않는다)",
  },
  {
    id: "154-8-2-holding-count-start-unverified",
    decides: { input: { ...nonResident, transferDate: D("2022-09-01") } },
    decidesWhy: "2022-09-01 양도 — 거주자 보유만으론 2년 미달이라 비거주 기간만으로 3년을 세면(통산 불성립) 과세로 바뀐다",
    silent: { input: { ...nonResident, transferDate: D("2023-06-01") } },
    silentWhy: "같은 두 독법 분기 입력이지만 2023-06-01 양도는 거주자 보유만으로 2년을 채워 어느 독법이든 비과세",
  },
  {
    id: "154-1-residence-interval-consolidation-unverified",
    decides: { input: intervals },
    decidesWhy: "취득 당시 조정 1주택·10구간 거주 20개월 과세 — 날수로 이어 붙이면 28개월이라 비과세로 바뀐다",
    silent: { input: { ...intervals, householdHousingCount: 3 } },
    silentWhy: "같은 10구간이지만 3주택이라 28개월로 세어도 과세(residenceConsolidationDecides 거짓)",
  },
];
