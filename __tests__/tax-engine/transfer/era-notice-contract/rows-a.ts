/**
 * I-26 표 — 묶음 A(증여 세대 고지 6종 · §154⑤ 단서 재기산 · 삭제 전 §154①4호 · §154⑫ 공동상속 · §155의3 상생임대 종료일).
 *
 * 증여 고지 공통 시료: 증여자 2010-03-01 취득 → 2025-06-01 증여(9억 · 비조정 · 거주 0) → 2026-02-16 양도. 증여일부터 세면 보유 2년 미달(과세),
 * 증여자 세대 보유를 통산하면 비과세 — 세대 사실이 결론을 가른다. 결론 불변 셀은 같은 세대 사실을 두고 3주택(특례 없음)으로 과세가 정해진 판정이다.
 */
import type { EraContractRow } from "./contract";
import type { GiftHouseholdBasis } from "@/lib/tax-engine/one-house/gift-household-basis";

const D = (s: string) => new Date(s);

/** 증여 고지 공통 입력 — 증여일부터 보유 8개월(과세) · 통산하면 15년 넘게 보유(비과세) */
const GIFT = {
  acquisitionCause: "gift" as const,
  acquisitionDate: D("2025-06-01"),
  transferDate: D("2026-02-16"),
  transferPrice: 900_000_000,
  residencePeriodMonths: 0,
};
const giftBasis = (o: Partial<GiftHouseholdBasis> = {}): GiftHouseholdBasis => ({ giftDate: D("2025-06-01"), donorAcquisitionDate: D("2010-03-01"), ...o });

/** 증여 전 동일세대 거주 시료 — 2018-01-01 증여자 취득 · 2019-03-01 세대 보유 시작(합가) · 2022-06-01 증여 · 취득 당시 조정 · 거주 0 */
const PRIOR = {
  acquisitionCause: "gift" as const,
  acquisitionDate: D("2022-06-01"),
  transferDate: D("2025-02-16"),
  transferPrice: 900_000_000,
  residencePeriodMonths: 0,
  wasRegulatedAtAcquisition: true,
  giftHouseholdBasis: {
    giftDate: D("2022-06-01"),
    donorAcquisitionDate: D("2018-01-01"),
    continuousSameHousehold: true,
    householdHoldingStartDate: D("2019-03-01"),
  },
};

/** 상생임대 시료 — 종료일 미입력 · 2028-03-01 양도(종료일 필수 구간) · 취득 당시 조정 · 거주 0 */
const WIN_WIN = {
  transferDate: D("2028-03-01"),
  acquisitionDate: D("2022-06-15"),
  wasRegulatedAtAcquisition: true,
  residencePeriodMonths: 0,
  winWinRentalHouse: { winWinContractDate: D("2023-01-10"), increaseRatePct: 5, priorLeaseMonths: 24, winWinLeaseMonths: 24 },
};

export const ROWS_A: EraContractRow[] = [
  {
    id: "gift-household-continuity-unconfirmed",
    decides: { input: { ...GIFT, giftHouseholdBasis: giftBasis() } },
    decidesWhy: "같은 세대 여부 미확인 — 증여일부터 세면 보유 2년 미달 과세, 같은 세대로 통산하면 비과세",
    silent: { input: { ...GIFT, householdHousingCount: 3, giftHouseholdBasis: giftBasis() } },
    silentWhy: "같은 세대 여부 미확인 그대로 · 3주택(특례 없음)이라 통산해도 과세",
  },
  {
    id: "gift-household-consolidation-detail-unverified",
    decides: {
      input: { ...GIFT, giftHouseholdBasis: giftBasis({ continuousSameHousehold: true, householdHoldingStartDate: D("2025-01-01") }) },
    },
    decidesWhy: "통산 시작일(혼인일 2025-01-01)로 세면 보유 미달 과세, 시작일을 증여자 취득일로 보면 비과세",
    silent: {
      input: {
        ...GIFT,
        householdHousingCount: 3,
        giftHouseholdBasis: giftBasis({ continuousSameHousehold: true, householdHoldingStartDate: D("2025-01-01") }),
      },
    },
    silentWhy: "같은 통산 입력(시작일 2025-01-01) · 3주택(특례 없음)이라 시작일·별도세대 어느 쪽이든 과세",
  },
  {
    id: "gift-household-donor-deceased-unverified",
    decides: { input: { ...GIFT, giftHouseholdBasis: giftBasis({ continuousSameHousehold: true, donorDeceased: true }) } },
    decidesWhy: "증여자 사망으로 통산 없이 보유 미달 과세 — 통산하면 비과세",
    silent: {
      input: { ...GIFT, householdHousingCount: 3, giftHouseholdBasis: giftBasis({ continuousSameHousehold: true, donorDeceased: true }) },
    },
    silentWhy: "같은 증여자 사망 입력 · 3주택(특례 없음)이라 통산해도 과세",
  },
  {
    id: "gift-household-rejoined-unverified",
    decides: { input: { ...GIFT, giftHouseholdBasis: giftBasis({ continuousSameHousehold: true, rejoinedAfterDivorce: true }) } },
    decidesWhy: "이혼 후 재결합으로 통산 없이 보유 미달 과세 — 통산하면 비과세",
    silent: {
      input: {
        ...GIFT,
        householdHousingCount: 3,
        giftHouseholdBasis: giftBasis({ continuousSameHousehold: true, rejoinedAfterDivorce: true }),
      },
    },
    silentWhy: "같은 재결합 입력 · 3주택(특례 없음)이라 통산해도 과세",
  },
  {
    id: "gift-household-prior-residence-unverified",
    decides: { input: PRIOR },
    decidesWhy: "증여 전 동일세대 거주 개월 미답 — 통산 없이 거주 0이면 조정 거주요건 미달 과세, 상한(39개월) 거주했다면 비과세",
    silent: { input: { ...PRIOR, householdHousingCount: 3 } },
    silentWhy: "같은 미답(통산 성립 · 개월 미입력) · 3주택(특례 없음)이라 증여 전 거주를 채워도 과세",
  },
  {
    id: "gift-household-not-reflected-unverified",
    decides: { input: GIFT },
    decidesWhy: "증여 취득인데 세대 사실이 오지 않아 증여일부터 보유 미달 과세 — 같은 세대였다면 통산으로 비과세가 될 수 있다",
    silent: { input: { ...GIFT, householdHousingCount: 3 } },
    silentWhy:
      "세대 사실 미전달 그대로 · 3주택(특례 없음)이라 가장 유리한 통산으로도 과세(I-26에서 고친 게이트 — 종전에는 「!settled」뿐이라 고지가 나왔다)",
  },
  {
    id: "154-5-final-one-house-restart-unverified",
    decides: { input: { transferDate: D("2021-06-01"), acquisitionDate: D("2019-01-01") } },
    decidesWhy: "2021-06-01 양도 순수 1주택 · 처분 이력 미답 = 재기산(과세) — 「없음」이면 2019-01-01부터 보유 2년 충족으로 비과세",
    silent: { input: { transferDate: D("2021-06-01"), acquisitionDate: D("2020-01-01") } },
    silentWhy: "같은 처분 이력 미답 · 취득일(2020-01-01)부터 세어도 보유 2년 미달이라 「없음」이어도 과세",
  },
  {
    id: "154-1-4ho-rental-registration-unverified",
    decides: { input: { wasRegulatedAtAcquisition: true, residencePeriodMonths: 0 } },
    decidesWhy: "취득 당시 조정 1주택 · 거주 0으로 과세 — 4호 임대사업자 등록이면 거주요건 없이 비과세",
    silent: { input: { wasRegulatedAtAcquisition: true, residencePeriodMonths: 0, householdHousingCount: 2 } },
    silentWhy: "같은 4호 미선택 · 2주택(일시적 2주택 등 특례 없음)이라 4호가 성립해도 과세(rental4hoDecides 거짓)",
  },
  {
    id: "154-12-co-inherited-residence-unverified",
    decides: { input: { acquisitionCause: "inheritance", wasRegulatedAtAcquisition: true, residencePeriodMonths: 0 } },
    decidesWhy: "취득 당시 조정 상속주택 · 본인 거주 0으로 과세 — 다른 공동상속인 거주기간으로 거주요건을 채우면 비과세",
    silent: {
      input: { acquisitionCause: "inheritance", wasRegulatedAtAcquisition: true, residencePeriodMonths: 0, householdHousingCount: 3 },
    },
    silentWhy: "같은 공동상속 미확인 · 3주택(특례 없음)이라 거주요건을 채워도 과세(residenceDecides 거짓)",
  },
  {
    id: "155-3-win-win-lease-end-unverified",
    decides: { input: WIN_WIN },
    decidesWhy: "2028.1.1. 이후 양도 · 종료일 미입력으로 거주 면제 불성립 → 조정 거주 0 과세, 종료일이 있으면 면제로 비과세",
    silent: { input: { ...WIN_WIN, householdHousingCount: 3 } },
    silentWhy: "같은 종료일 미입력 · 3주택(특례 없음)이라 거주 면제가 성립해도 과세(residenceDecides 거짓)",
  },
];
