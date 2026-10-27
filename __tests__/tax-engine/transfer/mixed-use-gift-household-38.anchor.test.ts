/**
 * 결정 #38 후속 anchor — 겸용주택을 증여받은 경우 「증여자와 계속 같은 세대」 사실(`giftHouseholdBasis`)이 겸용 엔진의
 * §154① 판정에 **단건과 같은 leaf**로 들어가는가 (엔진 직접 호출 · mock 세율).
 *
 * 종전: `judgeMixedUseOneHouseExemption`의 `exemptionReqInput`이 `giftHouseholdBasis`를 받지 않아 건물 취득일(증여일)로만 기산했다 —
 *   같은 세대 「예」·「아니오」가 같은 세액이었다(route anchor GC-5c 305,678,570).
 *
 * 사실관계: 증여자 2000-01-01 취득 → 2023-09-01 증여(토지·건물 함께) → 2024-06-01 양도 · 1세대 1주택 · 거주 0.
 * 겸용 픽스처는 사례14(주택 연면적 < 상가 연면적 → 영 §154③ 단서: 주택분만 주택)라 주택분/상가분이 갈린다.
 *
 * | # | 축 | 확인 |
 * |---|---|---|
 * | MG-1 | §154① 보유 통산 | 같은 세대 확인 → 주택분 비과세(상가분은 과세 그대로) · 아니오 → 과세 |
 * | MG-2 | 「취득 당시」 조정대상지역(강남·마포) | 세대 보유 시작일 2018(지정 중) → 거주요건 → 과세 · 2000(지정 전) → 비과세 · 거울상(시작일 지정 중·증여일 해제 후) → 비과세 |
 * | MG-3 | D4-05 §99의4 일반주택 취득일 | 농어촌주택(2010 취득) 앞의 일반주택 — 통산 시 세대 보유 시작일(2000) → 주택 수 제외 성립 |
 * | MG-4 | 단건 parity | 같은 사실의 단건 주택과 비과세 결론·세대 고지 유무가 같다 |
 * | MG-5 | 장특·세율 | 통산해도 주택분 장특 보유연수는 증여일 기준(0년) — 단건과 같다 |
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax } from "../_helpers/mixed-use-identity-std";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { GiftHouseholdBasis } from "@/lib/tax-engine/one-house/gift-household-basis";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const DONOR = D("2000-01-01");
const GIFT = D("2023-09-01");
const TRANSFER = D("2024-06-01");
const PRICE = 1_000_000_000; // 12억 이하 — 비과세면 주택분 전액 비과세
const GANGNAM = "1168010100"; // 서울 강남구 역삼동 — 2017-08-03 지정 · 미해제
const MAPO = "1144010100"; // 서울 마포구 — 2017-08-03 지정 · 2023-09-01(증여일)에는 해제(실측 `isRegulatedByBjdCode`)

const YES = (start = DONOR): GiftHouseholdBasis => ({
  giftDate: GIFT,
  donorAcquisitionDate: DONOR,
  continuousSameHousehold: true,
  householdHoldingStartDate: start,
});
const NO: GiftHouseholdBasis = { giftDate: GIFT, donorAcquisitionDate: DONOR, continuousSameHousehold: false };
const UNKNOWN: GiftHouseholdBasis = { giftDate: GIFT, donorAcquisitionDate: DONOR };

/** §99의4 농어촌주택 — 2010 취득(세대 보유 시작일 2000 뒤 · 증여일 2023 앞). E-14i와 같은 형태. */
const RURAL_2010 = {
  type: "new_99_4_rural" as const,
  ruralHouseAcquisitionDate: D("2010-05-01"),
  ruralHouseStdPrice: 200_000_000,
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};

function mixed(over: Partial<MixedUseAssetInput>) {
  return calcMixedUseTransferTax(
    PRICE,
    TRANSFER,
    {
      ...mixedUseCase14(),
      landAcquisitionDate: GIFT,
      buildingAcquisitionDate: GIFT,
      residencePeriodYears: 0,
      isOneHousehold: true,
      isOneHouseExempt: true,
      householdHousingCountForExclusion: 1,
      ...over,
    } as MixedUseAssetInput,
    rates,
  );
}
const mixedExempt = (r: ReturnType<typeof mixed>) => r.calculationRoute.highValueRule === "below_threshold_exempt";

/** 같은 사실의 단건(비겸용) 주택 — 증여 취득. */
function single(over: Parameters<typeof baseTransferInput>[0]) {
  return calculateTransferTax(
    baseTransferInput({
      transferPrice: 500_000_000,
      transferDate: TRANSFER,
      acquisitionDate: GIFT,
      acquisitionCause: "gift",
      residencePeriodMonths: 0,
      ...over,
    }),
    rates,
  );
}

const CONSOLIDATION_NOTICE = "증여자와 계속 같은 세대였다는 입력에 따라";
const UNCONFIRMED_NOTICE = "증여자와 증여일부터 양도일까지 계속 같은 세대였는지";
const hasNotice = (w: string[] | undefined, head: string) => (w ?? []).some((x) => x.startsWith(head));

describe("MG-1 겸용 §154① 보유 — 세대 통산이 결과에 반영된다", () => {
  it("[MG-1a] 같은 세대 확인(시작일 2000) → 주택분 비과세 · 상가분은 과세 그대로", () => {
    const r = mixed({ giftHouseholdBasis: YES() });
    expect(mixedExempt(r)).toBe(true);
    expect(r.housingPart.incomeAmount).toBe(0);
    expect(r.commercialPart.incomeAmount).toBeGreaterThan(0);
    expect(hasNotice(r.warnings, CONSOLIDATION_NOTICE)).toBe(true);
  });

  it("[MG-1b] 별도세대(아니오) → 증여일 기산 0년 9개월 → 과세 · 고지 없음", () => {
    const r = mixed({ giftHouseholdBasis: NO });
    expect(mixedExempt(r)).toBe(false);
    expect(r.housingPart.incomeAmount).toBeGreaterThan(0);
    expect(hasNotice(r.warnings, CONSOLIDATION_NOTICE)).toBe(false);
    expect((r.warnings ?? []).some((w) => w.startsWith("건물 보유기간 0년 9개월"))).toBe(true);
  });

  it("[MG-1c] 미확인 → 증여일 기산(유리하게 읽지 않는다) + 미확인 고지 · 미전달(종전 API)은 고지 없이 과세", () => {
    const r = mixed({ giftHouseholdBasis: UNKNOWN });
    expect(mixedExempt(r)).toBe(false);
    expect(hasNotice(r.warnings, UNCONFIRMED_NOTICE)).toBe(true);
    const legacy = mixed({});
    expect(mixedExempt(legacy)).toBe(false);
    expect(legacy.total.determinedTax).toBe(mixed({ giftHouseholdBasis: NO }).total.determinedTax);
  });

  it("[MG-1d] 같은 세대라도 「예」 뒤 요건 미충족이면 경고가 세대 통산 보유기간을 적는다(건물 보유기간 아님)", () => {
    const r = mixed({ giftHouseholdBasis: YES(D("2018-01-01")), regionCode: GANGNAM });
    expect(mixedExempt(r)).toBe(false);
    expect((r.warnings ?? []).some((w) => w.startsWith("세대 통산 보유기간 6년 5개월"))).toBe(true);
  });
});

describe("MG-2 「취득 당시」 조정대상지역 — 세대 보유 시작일과 증여일을 함께 본다(강남)", () => {
  it("[MG-2a] 시작일 2018-01-01(지정 중)·증여일(지정 중) → 거주 2년 요건 → 거주 0 → 과세", () => {
    expect(mixedExempt(mixed({ giftHouseholdBasis: YES(D("2018-01-01")), regionCode: GANGNAM }))).toBe(false);
  });
  it("[MG-2b] 시작일 2000-01-01(지정 전) → 거주요건 없음 → 비과세(짝)", () => {
    expect(mixedExempt(mixed({ giftHouseholdBasis: YES(), regionCode: GANGNAM }))).toBe(true);
  });
  it("[MG-2c] 거울상 — 시작일 2018-01-01(지정 중)·증여일(해제 후, 마포) → 둘 다 지정 중이 아니므로 거주요건 없음 → 비과세 + 통산 고지", () => {
    // 시작일만 보는 판정(strict)이나 어느 하나라도(any)로 읽으면 거주요건이 붙어 과세된다 — 겸용 배선이 all 모드를 지키는지 본다.
    const r = mixed({ giftHouseholdBasis: YES(D("2018-01-01")), regionCode: MAPO });
    expect(mixedExempt(r)).toBe(true);
    expect(hasNotice(r.warnings, CONSOLIDATION_NOTICE)).toBe(true);
  });
});

describe("MG-3 D4-05 §99의4 「그 주택 취득 전에 보유하던」 일반주택 취득일 — 단건과 같은 leaf", () => {
  const over = (b: GiftHouseholdBasis) => ({
    giftHouseholdBasis: b,
    householdHousingCountForExclusion: 2,
    isOneHouseExempt: false,
    reductions: [RURAL_2010] as MixedUseAssetInput["reductions"],
  });
  it("[MG-3a] 같은 세대(시작일 2000) → 일반주택이 농어촌주택(2010)보다 먼저 → 제외 성립 → 비과세", () => {
    const r = mixed(over(YES()));
    expect(r.new994Detail?.isEligible).toBe(true);
    expect(mixedExempt(r)).toBe(true);
  });
  it("[MG-3b] 별도세대 → 일반주택 취득일 = 증여일(2023) → 제외 불성립 → 2주택 과세(짝)", () => {
    const r = mixed(over(NO));
    expect(r.new994Detail?.isEligible).toBe(false);
    expect(mixedExempt(r)).toBe(false);
  });
});

describe("MG-4 단건(비겸용) parity — 같은 사실이면 주택 부분 판정·세대 고지가 같다", () => {
  const cases: [string, Partial<MixedUseAssetInput>, Parameters<typeof baseTransferInput>[0]][] = [
    ["예·2000", { giftHouseholdBasis: YES() }, { giftHouseholdBasis: YES() }],
    ["아니오", { giftHouseholdBasis: NO }, { giftHouseholdBasis: NO }],
    ["미확인", { giftHouseholdBasis: UNKNOWN }, { giftHouseholdBasis: UNKNOWN }],
    ["예·2018·강남", { giftHouseholdBasis: YES(D("2018-01-01")), regionCode: GANGNAM }, { giftHouseholdBasis: YES(D("2018-01-01")), regionCode: GANGNAM }],
    ["예·2000·강남", { giftHouseholdBasis: YES(), regionCode: GANGNAM }, { giftHouseholdBasis: YES(), regionCode: GANGNAM }],
    ["예·2018·마포(거울상)", { giftHouseholdBasis: YES(D("2018-01-01")), regionCode: MAPO }, { giftHouseholdBasis: YES(D("2018-01-01")), regionCode: MAPO }],
    [
      "예·2000·§99의4",
      { giftHouseholdBasis: YES(), householdHousingCountForExclusion: 2, isOneHouseExempt: false, reductions: [RURAL_2010] as MixedUseAssetInput["reductions"] },
      { giftHouseholdBasis: YES(), householdHousingCount: 2, reductions: [RURAL_2010] as never },
    ],
    [
      "아니오·§99의4",
      { giftHouseholdBasis: NO, householdHousingCountForExclusion: 2, isOneHouseExempt: false, reductions: [RURAL_2010] as MixedUseAssetInput["reductions"] },
      { giftHouseholdBasis: NO, householdHousingCount: 2, reductions: [RURAL_2010] as never },
    ],
  ];
  it.each(cases)("[MG-4] %s", (_label, m, s) => {
    const mr = mixed(m);
    const sr = single(s);
    expect(mixedExempt(mr)).toBe(sr.isExempt);
    expect(hasNotice(mr.warnings, CONSOLIDATION_NOTICE)).toBe(hasNotice(sr.warnings, CONSOLIDATION_NOTICE));
    expect(hasNotice(mr.warnings, UNCONFIRMED_NOTICE)).toBe(hasNotice(sr.warnings, UNCONFIRMED_NOTICE));
  });
});

describe("MG-5 장특·세율 보유기간은 증여일 기준 — 통산은 §154① 판정과 표2 대상 판정에만", () => {
  it("[MG-5] 고가 겸용(50억) · 같은 세대 → 12억 초과분 안분 과세 · 주택분 장특 보유연수 0년(증여일 기산) · 표1", () => {
    const hi = (b: GiftHouseholdBasis) =>
      calcMixedUseTransferTax(
        5_000_000_000,
        TRANSFER,
        {
          ...mixedUseCase14(),
          landAcquisitionDate: GIFT,
          buildingAcquisitionDate: GIFT,
          residencePeriodYears: 0,
          isOneHousehold: true,
          isOneHouseExempt: true,
          householdHousingCountForExclusion: 1,
          giftHouseholdBasis: b,
        } as MixedUseAssetInput,
        rates,
      );
    const yes = hi(YES());
    expect(yes.calculationRoute.highValueRule).toBe("above_threshold_prorated");
    expect(yes.housingPart.holdingYears).toBe(0);
    expect(yes.housingPart.longTermDeductionTable).toBe(1);
    expect(yes.housingPart.longTermDeductionAmount).toBe(0);
    expect(hi(NO).calculationRoute.highValueRule).toBe("non_one_house_full_taxation"); // 짝 — 통산이 비과세 판정은 바꾼다
  });
});

describe("MG-6 증여 전 동일세대 거주 개월(결정 #38-7) — 겸용도 같은 leaf로 §154① 거주요건에 통산한다", () => {
  // 세대 보유 시작일 2018-01-01(지정 중) · 증여일 2023-09-01(강남은 지정 중) → 거주요건 · 거주 0 → 과세. 증여 전 거주 24개월을 통산하면 비과세.
  const yes = (months: number | undefined): GiftHouseholdBasis => ({ ...YES(D("2018-01-01")), priorHouseholdResidenceMonths: months });
  const PRIOR_NOTICE = "증여 전 동일세대 거주기간";
  it("[MG-6a] 24개월 → 주택분 비과세(경계 23개월은 과세) + 통산 확인 필요 고지(정면 해석 미확보)", () => {
    const at = (m: number | undefined) => mixed({ giftHouseholdBasis: yes(m), regionCode: GANGNAM });
    expect(mixedExempt(at(23))).toBe(false);
    const r = at(24);
    expect(mixedExempt(r)).toBe(true);
    expect((r.warnings ?? []).some((w) => w.includes(PRIOR_NOTICE) && w.includes("정면으로 다룬 해석은 확인하지 못했습니다"))).toBe(true);
  });
  it("[MG-6b] 미답 → 통산하지 않고 과세 + 「거주했다면 달라진다」 고지 · 입력 0은 고지 없음(짝)", () => {
    const blank = mixed({ giftHouseholdBasis: yes(undefined), regionCode: GANGNAM });
    expect(mixedExempt(blank)).toBe(false);
    expect((blank.warnings ?? []).some((w) => w.includes("입력되지 않아"))).toBe(true);
    const zero = mixed({ giftHouseholdBasis: yes(0), regionCode: GANGNAM });
    expect(mixedExempt(zero)).toBe(false);
    expect((zero.warnings ?? []).some((w) => w.includes("입력되지 않아") || w.includes(PRIOR_NOTICE))).toBe(false);
  });
  it("[MG-6d] 결론을 가르지 않으면 고지하지 않는다 — 12개월 통산은 거주 12개월이라 어느 쪽이든 과세 · 입력이 없어도 상한(68개월)을 가정하면 비과세로 바뀌므로 고지(짝)", () => {
    const twelve = mixed({ giftHouseholdBasis: yes(12), regionCode: GANGNAM });
    expect(mixedExempt(twelve)).toBe(false);
    expect((twelve.warnings ?? []).some((w) => w.includes(PRIOR_NOTICE))).toBe(false);
    const blank = mixed({ giftHouseholdBasis: yes(undefined), regionCode: GANGNAM });
    expect((blank.warnings ?? []).some((w) => w.includes("입력되지 않아"))).toBe(true);
  });
  it("[MG-6c] 단건 parity — 같은 사실의 단건 주택과 비과세 결론이 같다 · 계속 같은 세대가 아니면 개월은 쓰이지 않는다(짝)", () => {
    for (const m of [23, 24]) {
      const mr = mixed({ giftHouseholdBasis: yes(m), regionCode: GANGNAM });
      const sr = single({ giftHouseholdBasis: yes(m), regionCode: GANGNAM });
      expect(mixedExempt(mr), `months ${m}`).toBe(sr.isExempt);
    }
    const separate = mixed({ giftHouseholdBasis: { ...NO, priorHouseholdResidenceMonths: 24 }, regionCode: GANGNAM });
    expect(mixedExempt(separate)).toBe(false);
  });
});

describe("MG-7 증여 전 동일세대 거주 개월은 표2 대상 판정(거주 2년)에 통산하고 공제율에는 쓰지 않는다 (결정 #38-9 — 사전-2025-법규재산-0506)", () => {
  // 증여 2023-09-01 → 양도 2026-10-01(보유 3년 1개월) · 50억 고가 겸용 · 본인 거주 0년. 증여 전 거주 24개월을 통산하면 거주 2년 → 표2 대상.
  const LATE = D("2026-10-01");
  const hi = (months: number | undefined) =>
    calcMixedUseTransferTax(
      5_000_000_000,
      LATE,
      {
        ...mixedUseCase14(),
        landAcquisitionDate: GIFT,
        buildingAcquisitionDate: GIFT,
        residencePeriodYears: 0,
        isOneHousehold: true,
        isOneHouseExempt: true,
        householdHousingCountForExclusion: 1,
        giftHouseholdBasis: { ...YES(D("2018-01-01")), priorHouseholdResidenceMonths: months },
      } as MixedUseAssetInput,
      rates,
    );
  it("[MG-7a] 24개월 통산 → 표2 · 보유 3년 × 4% = 12%만(거주분은 본인 거주 0이라 0) — 23개월은 표1(경계)", () => {
    const at24 = hi(24);
    expect(at24.housingPart.longTermDeductionTable).toBe(2);
    expect(at24.housingPart.holdingYears).toBe(3);
    expect(hi(23).housingPart.longTermDeductionTable).toBe(1);
    expect(hi(undefined).housingPart.longTermDeductionTable).toBe(1); // 미답은 통산하지 않는다
    expect(hi(0).housingPart.longTermDeductionTable).toBe(1);
  });
  it("[MG-7b] 공제율에 통산하지 않는다 — 증여 전 거주를 더 넣어도(36개월) 공제액은 같다(거주분 늘지 않음)", () => {
    expect(hi(36).housingPart.longTermDeductionAmount).toBe(hi(24).housingPart.longTermDeductionAmount);
    expect(hi(24).housingPart.longTermDeductionAmount).toBeGreaterThan(hi(23).housingPart.longTermDeductionAmount); // 표2 보유 4% > 표1 2%
  });
});
