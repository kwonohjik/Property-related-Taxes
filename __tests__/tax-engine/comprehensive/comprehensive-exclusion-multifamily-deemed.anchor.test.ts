/**
 * anchor — 종부령 §3①1호·2호 다가구주택, 2020.2.11. 전 세무서 사업자등록만 한 경우(T-14 · PR-1 엔진).
 *
 * 법령: 종전 §3②~④(다가구 임대사업자 의제)는 2020.2.11. 삭제 · 부칙<대통령령 제30404호> 제6조가 의제된 주택만 「종전의 규정에 따른다」.
 * §3① 요건(가격·면적·기간·5%)은 현행 규정 — 세무서 사업자등록일을 §5 등록일로 보아 기존 판정을 재사용하고(결정 ②),
 * 가격·면적은 1구=1호(§3⑥)로 본 구별 값으로 판정한다(결정 ③). 배제 금액은 주택 전체.
 *
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-multifamily-deemed.plan.md §3.1 · §4 (M1~M13)
 * 기대값은 2026-11-18 probe 실측(엔진 실행 결과) — 법문 대입 결과와 일치함을 확인한 뒤 단언.
 *
 * ⚠️ 계획서와 달라진 점: 1·2호는 2018.3.31.(국세기본법 §5로 4.2.) 단서가 세무서 등록일에도 걸리므로(결정 ②),
 * 세무서 등록일 2020.2.10.은 「성립」이 아니라 2018 단서로 불성립한다. 2020.2.11. 경계(cutoff)는 결과(불성립)가 아니라
 * 사유(DEEMED_MULTIFAMILY_REGISTERED_AFTER_CUTOFF)로 갈린다 — 아래 DM-4가 사유로 경계를 고정한다.
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion, applyAggregationExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import { COMPREHENSIVE_EXCL } from "@/lib/tax-engine/legal-codes";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";

const d = (s: string) => new Date(s);

/** 2호(민간매입) · 지방 · 세무서 2015 등록 · 과세 2025 — 지자체 등록일(2019)은 일부러 2018 단서 밖으로 둔다(무시되어야 한다) */
const BASE: RentalExclusionInput = {
  registrationType: "private_purchase_short",
  rentalRegistrationDate: d("2019-03-01"),
  businessRegistrationDate: d("2015-03-01"),
  rentalStartDate: d("2015-07-01"),
  assessedValue: 750_000_000, // 건물 전체 — 3구 합계. 건물 값으로 보면 3억(지방) 초과
  area: 150,
  location: "non_metro",
  currentRent: 1_000_000,
  isInitialContract: true,
  assessmentDate: d("2025-06-01"),
};
const U3 = [
  { label: "1층", area: 40, assessedValue: 250_000_000 },
  { label: "2층", area: 40, assessedValue: 250_000_000 },
  { label: "3층", area: 40, assessedValue: 250_000_000 },
];
const dm = (units = U3, noConversionAfterCutoff = true) => ({ units, noConversionAfterCutoff });
const run = (over: Partial<RentalExclusionInput>) => validateRentalExclusion({ ...BASE, ...over });

/** 1호(민간건설) · 4구 각 5억 · 호수 4 · 2021 과세 */
const ONE = {
  registrationType: "private_construction" as const,
  location: "metro" as const,
  qualifyingUnitCount: 4,
  assessmentDate: d("2021-06-01"),
  assessedValue: 2_000_000_000,
  area: 320,
};
const U4 = [1, 2, 3, 4].map((i) => ({ label: `${i}층`, area: 80, assessedValue: 500_000_000 }));

describe("T-14 의제 다가구 — 성립 (구별 판정)", () => {
  it("DM-1 ★ M1 2호·지방·세무서 2015·3구 각 2.5억(3억 이하)·전환 없음 → 성립 + 근거 경고, 건물 값 7.5억·지자체 2019는 무시", () => {
    const r = run({ deemedMultiFamily: dm() });
    expect(r.isExcluded).toBe(true);
    expect(r.reason).toBe(COMPREHENSIVE_EXCL.PRIVATE_PURCHASE_RENTAL_SHORT);
    expect(r.failReasons).toBeUndefined();
    expect(r.warnings).toEqual([COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_BASIS]);
  });

  it("DM-1b 배제 금액은 주택 전체(all-or-nothing) — 건물 공시가격 7.5억 전액", () => {
    const res = applyAggregationExclusion(
      [
        {
          propertyId: "p1",
          assessedValue: 750_000_000,
          area: 150,
          location: "non_metro",
          exclusionType: "private_purchase_rental_short",
          rentalInfo: { ...BASE, deemedMultiFamily: dm() },
        },
      ],
      d("2025-06-01"),
    );
    expect(res.propertyResults[0].isExcluded).toBe(true);
    expect(res.propertyResults[0].excludedValue).toBe(750_000_000);
    expect(res.totalExcludedValue).toBe(750_000_000);
  });

  it("DM-2 ★ M5 1호·4구 각 5억·호수 4·2021 과세 → 성립(6억 연혁 cap) — 건물 20억·320㎡로는 불성립이던 입력", () => {
    expect(run({ ...ONE }).isExcluded).toBe(false); // 대조: deemed 없으면 건물 값으로 판정 → 가격·면적 초과
    const r = run({ ...ONE, deemedMultiFamily: dm(U4) });
    expect(r.isExcluded).toBe(true);
    expect(r.reason).toBe(COMPREHENSIVE_EXCL.PRIVATE_CONSTRUCTION_RENTAL);
  });

  it("DM-2b 1호 2021 과세 — 구별 5.5억은 6억 이하 성립 · 6.5억은 6억 초과 불성립(6억 사유 동반)", () => {
    const at = (v: number) => run({ ...ONE, deemedMultiFamily: dm([{ ...U4[0], assessedValue: v }, U4[1], U4[2], U4[3]]) });
    expect(at(550_000_000).isExcluded).toBe(true);
    const over = at(650_000_000);
    expect(over.isExcluded).toBe(false);
    expect(over.failReasons).toContain(COMPREHENSIVE_EXCL.PRICE_EXCEEDED);
    expect(over.failReasons).toContain(COMPREHENSIVE_EXCL.BUILT_PRICE_CAP_6EOK_PRE_20210217);
  });

  it("DM-2c 2호 수도권은 구별 6억 상한 — 5.5억 성립 · 6.5억 불성립", () => {
    const at = (v: number) =>
      run({ location: "metro", deemedMultiFamily: dm([{ label: "a", area: 40, assessedValue: 550_000_000 }, { label: "b", area: 40, assessedValue: v }]) });
    expect(at(550_000_000).isExcluded).toBe(true);
    expect(at(650_000_000).isExcluded).toBe(false);
  });

  it("DM-2d 2호는 면적 제한이 없다 — 구 면적 300㎡도 성립(1호만 149㎡)", () => {
    expect(run({ deemedMultiFamily: dm([{ label: "1층", area: 300, assessedValue: 250_000_000 }]) }).isExcluded).toBe(true);
  });
});

describe("T-14 의제 다가구 — 불성립", () => {
  it("DM-3 ★ M2 한 구 3.5억(3억 초과) → 불성립(가격) + 일부 배제 미지원 확인 필요 + 요건 못 갖춘 구 표시", () => {
    const r = run({ deemedMultiFamily: dm([U3[0], U3[1], { label: "3층", area: 40, assessedValue: 350_000_000 }]) });
    expect(r.isExcluded).toBe(false);
    expect(r.reason).toBe(COMPREHENSIVE_EXCL.PRICE_EXCEEDED);
    expect(r.failReasons).toContain(COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_PARTIAL_UNSUPPORTED);
    expect(r.failReasons).toContain(`${COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_FAILED_UNITS_PREFIX}: 3층`);
    // 사유 중복 없음 · 통과한 1·2층은 말머리에 안 나온다
    expect(new Set(r.failReasons).size).toBe(r.failReasons?.length);
  });

  it("DM-3b 3구 모두 초과해도 가격 사유는 한 번 — 구 목록은 모두 나온다", () => {
    const over = U3.map((u) => ({ ...u, assessedValue: 350_000_000 }));
    const r = run({ deemedMultiFamily: dm(over) });
    expect(r.failReasons?.filter((x) => x === COMPREHENSIVE_EXCL.PRICE_EXCEEDED)).toHaveLength(1);
    expect(r.failReasons).toContain(`${COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_FAILED_UNITS_PREFIX}: 1층, 2층, 3층`);
  });

  it("DM-4 ★ M3 세무서 2019-05-01 → 2018.3.31. 단서 불성립(결정 ②) · 경계는 4.2.(국세기본법 §5)", () => {
    const r = run({ businessRegistrationDate: d("2019-05-01"), deemedMultiFamily: dm() });
    expect(r.isExcluded).toBe(false);
    expect(r.failReasons).toEqual([
      COMPREHENSIVE_EXCL.REGISTERED_AFTER_2018_03_31,
      COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_REG_CAP_2018_CONFIRM,
    ]);
    // 지자체 날짜(2019-03-01)가 아니라 세무서 등록일로 정규화한다 — 4.2.는 성립, 4.3.은 불성립
    expect(run({ businessRegistrationDate: d("2018-04-02"), deemedMultiFamily: dm() }).isExcluded).toBe(true);
    expect(run({ businessRegistrationDate: d("2018-04-03"), deemedMultiFamily: dm() }).isExcluded).toBe(false);
  });

  it("DM-5 ★ cutoff 경계 — 세무서 2020-02-11 이후는 단독 사유 REGISTERED_AFTER_CUTOFF · 2020-02-10은 그 사유 없음(2018 단서로 불성립)", () => {
    const after = run({ businessRegistrationDate: d("2020-02-11"), deemedMultiFamily: dm() });
    expect(after.isExcluded).toBe(false);
    expect(after.failReasons).toEqual([COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_REGISTERED_AFTER_CUTOFF]);
    expect(run({ businessRegistrationDate: d("2020-03-01"), deemedMultiFamily: dm() }).reason).toBe(
      COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_REGISTERED_AFTER_CUTOFF,
    );
    const before = run({ businessRegistrationDate: d("2020-02-10"), deemedMultiFamily: dm() });
    expect(before.isExcluded).toBe(false);
    expect(before.failReasons).not.toContain(COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_REGISTERED_AFTER_CUTOFF);
    expect(before.failReasons).toEqual([
      COMPREHENSIVE_EXCL.REGISTERED_AFTER_2018_03_31,
      COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_REG_CAP_2018_CONFIRM,
    ]);
  });

  it("DM-6 ★ M6 1호 한 구 160㎡ → 불성립(면적 149㎡) + 일부 배제 미지원 확인 필요", () => {
    const r = run({ ...ONE, deemedMultiFamily: dm([U4[0], U4[1], U4[2], { label: "4층", area: 160, assessedValue: 500_000_000 }]) });
    expect(r.isExcluded).toBe(false);
    expect(r.reason).toBe(COMPREHENSIVE_EXCL.AREA_EXCEEDED_149);
    expect(r.failReasons).toContain(COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_PARTIAL_UNSUPPORTED);
    expect(r.failReasons).toContain(`${COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_FAILED_UNITS_PREFIX}: 4층`);
    // 149㎡ 경계 — 정확히 149는 성립
    expect(run({ ...ONE, deemedMultiFamily: dm([{ ...U4[0], area: 149 }, U4[1], U4[2], U4[3]]) }).isExcluded).toBe(true);
  });

  it("DM-7 ★ M7 2020.2.11. 이후 임대로 바꾼 호실이 있다(아니오) → 불성립 + 확인 필요", () => {
    const r = run({ deemedMultiFamily: dm(U3, false) });
    expect(r.isExcluded).toBe(false);
    expect(r.failReasons).toEqual([COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_UNIT_CONVERTED_AFTER_CUTOFF]);
  });

  it("DM-7b 전환 질문이 true가 아니면(모름) 불성립 — 「모름」은 혜택 불성립", () => {
    const r = run({ deemedMultiFamily: { units: U3, noConversionAfterCutoff: undefined as unknown as boolean } });
    expect(r.isExcluded).toBe(false);
    expect(r.failReasons).toContain(COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_UNIT_CONVERTED_AFTER_CUTOFF);
  });

  it("DM-8 ★ M13 2020.2.11. 이후 갱신 계약 5% 초과(6%) → 현행 5% 판정대로 불성립(부칙 제3조) · 3%는 성립", () => {
    const at = (cur: number) =>
      run({ isInitialContract: false, previousRent: 1_000_000, currentRent: cur, deemedMultiFamily: dm() });
    const bad = at(1_060_000);
    expect(bad.isExcluded).toBe(false);
    expect(bad.failReasons).toEqual([COMPREHENSIVE_EXCL.RENT_INCREASE_EXCEEDED]);
    expect(at(1_030_000).isExcluded).toBe(true);
  });

  it("DM-8b 가격 초과 + 5% 초과가 함께면 사유 둘 다 · 중복 없음", () => {
    const r = run({
      isInitialContract: false,
      previousRent: 1_000_000,
      currentRent: 1_060_000,
      deemedMultiFamily: dm([{ label: "1층", area: 40, assessedValue: 350_000_000 }]),
    });
    expect(r.failReasons).toContain(COMPREHENSIVE_EXCL.RENT_INCREASE_EXCEEDED);
    expect(r.failReasons).toContain(COMPREHENSIVE_EXCL.PRICE_EXCEEDED);
    expect(new Set(r.failReasons).size).toBe(r.failReasons?.length);
  });

  it("DM-9 1호 「2호 이상」은 기존 호수 판정 그대로 — 호수 미입력·1호는 불성립", () => {
    expect(run({ ...ONE, qualifyingUnitCount: undefined, deemedMultiFamily: dm(U4) }).failReasons).toEqual([
      COMPREHENSIVE_EXCL.TWO_PLUS_UNITS_UNKNOWN,
    ]);
    expect(run({ ...ONE, qualifyingUnitCount: 1, deemedMultiFamily: dm(U4) }).failReasons).toEqual([
      COMPREHENSIVE_EXCL.TWO_PLUS_UNITS_UNDER_2,
    ]);
  });
});

describe("T-14 의제 다가구 — 지자체 날짜·유형·입력 방어", () => {
  it("DM-10 ★ M12 지자체 말소일·신청일이 있어도 무시(조심2022서6703) — 대조: deemed 없으면 말소로 불성립", () => {
    const over = { registrationRevokedDate: d("2019-04-01"), rentalApplicationDate: d("2019-02-01") };
    const r = run({ ...over, deemedMultiFamily: dm() });
    expect(r.isExcluded).toBe(true);
    expect(run({ ...over }).failReasons).toContain(COMPREHENSIVE_EXCL.REGISTRATION_REVOKED);
  });

  it("DM-11 유형 8호(장기일반)에 deemed → 불성립 DEEMED_MULTIFAMILY_TYPE · 1·2호 밖 유형 전부", () => {
    const r = run({ registrationType: "private_purchase_long", deemedMultiFamily: dm() });
    expect(r.isExcluded).toBe(false);
    expect(r.failReasons).toEqual([COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_TYPE]);
    for (const t of ["public_construction", "public_purchase", "existing_rental", "private_short_term_6y_purchase"] as const) {
      expect(run({ registrationType: t, deemedMultiFamily: dm() }).reason).toBe(COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_TYPE);
    }
  });

  it("DM-12 세무서 등록일 빈칸 → 일반형 사유(BUSINESS_REGISTRATION_DATE_MISSING)", () => {
    const r = run({ businessRegistrationDate: undefined, deemedMultiFamily: dm() });
    expect(r.failReasons).toEqual([COMPREHENSIVE_EXCL.BUSINESS_REGISTRATION_DATE_MISSING]);
  });

  it("DM-13 구가 없거나 공시가격 0·면적 NaN → 공허한 통과 차단(UNITS_INVALID)", () => {
    for (const units of [
      [],
      [{ label: "1층", area: 40, assessedValue: 0 }],
      [{ label: "1층", area: Number.NaN, assessedValue: 250_000_000 }],
    ]) {
      const r = run({ deemedMultiFamily: dm(units) });
      expect(r.isExcluded).toBe(false);
      expect(r.failReasons).toEqual([COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_UNITS_INVALID]);
    }
  });
});

describe("T-14 — deemedMultiFamily 없으면 기존 판정 불변", () => {
  it("DM-14 ★ 없음/undefined는 같은 결과 · 같은 입력의 건물 단위 판정 실측(2018 단서·가격·가격 판정 3사유)", () => {
    const plain = run({});
    expect(run({ deemedMultiFamily: undefined })).toEqual(plain);
    expect(plain.isExcluded).toBe(false);
    expect(plain.failReasons).toHaveLength(3);
    expect(plain.failReasons?.[0]).toBe(COMPREHENSIVE_EXCL.REGISTERED_AFTER_2018_03_31);
    expect(plain.failReasons?.[1]).toBe(COMPREHENSIVE_EXCL.PRICE_EXCEEDED);
    expect(plain.warnings).toBeUndefined();
  });

  it("DM-14b 요건을 갖춘 일반 입력은 성립 · 경고에 의제 근거 없음", () => {
    const r = run({ rentalRegistrationDate: d("2015-03-01"), assessedValue: 250_000_000 });
    expect(r.isExcluded).toBe(true);
    expect(r.warnings).toBeUndefined();
  });
});
