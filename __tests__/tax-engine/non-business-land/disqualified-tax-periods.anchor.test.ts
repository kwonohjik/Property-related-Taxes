/**
 * anchor — 조특령 §66⑭ 결격 과세기간의 자경기간 제외 (E2-09)
 *
 * ## 근거 체인 (본문 실측)
 *
 * 「소득세법 시행령」 §168의8② 후단(mst=286211):
 * > 이 경우 자경한 기간의 판정에 관하여는 「조세특례제한법 시행령」 제66조제14항을 준용한다.
 *
 * 「조세특례제한법 시행령」 §66⑭(mst=287181): 사업소득금액 + 총급여액 ≥ 3,700만원(1호)이거나
 * 사업소득 총수입금액이 「소득세법 시행령」 §208⑤2호 각 목 이상(2호)인 **과세기간**은
 * 「경작한 기간에서 제외한다」.
 *
 * 「소득세법」 §5①: 과세기간 = 1월 1일 ~ 12월 31일.
 *
 * ## 이 anchor가 증명하는 것
 *
 * **연수(count)로는 계산할 수 없다.** §168의6 기간기준은 「양도일 직전 5년 중 2년 초과」·
 * 「직전 3년 중 1년 초과」·「소유기간 40% 초과」의 AND 구조라, **같은 개수의 결격 과세기간이라도
 * 어느 해인지에 따라 판정이 정반대로 갈린다**. 같은 §66⑭를 §69 감면 경로는 연수 차감으로
 * 구현하지만(`self-farming-reduction.ts`), 그쪽은 자경기간 자체가 스칼라라 그것으로 족하다.
 */
import { describe, it, expect } from "vitest";
import { judgeFarmland } from "@/lib/tax-engine/non-business-land/farmland";
import {
  excludeDisqualifiedTaxPeriods,
  parseTaxPeriodYears,
  taxPeriodInterval,
} from "@/lib/tax-engine/non-business-land/disqualified-tax-periods";
import { subtractPeriods } from "@/lib/tax-engine/non-business-land/utils/period-math";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);

/** 취득 2014-01-01 · 양도 2024-06-01 · 전 기간 재촌·자경 → 결격 없으면 사업용 */
function base(partial: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "farmland",
    landArea: 1000,
    zoneType: "agriculture_forest",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-06-01"),
    farmingSelf: true,
    landLocation: { sigunguCode: "11680" },
    ownerLocation: { sigunguCode: "11680" },
    ownerProfile: {
      residenceHistories: [
        {
          sidoName: "서울",
          sigunguName: "강남구",
          sigunguCode: "11680",
          startDate: d("2014-01-01"),
          endDate: d("2024-06-01"),
          hasResidentRegistration: true,
        },
      ],
    },
    businessUsePeriods: [{ startDate: d("2014-01-02"), endDate: d("2024-06-01"), usageType: "자경" }],
    gracePeriods: [],
    ...partial,
  };
}

describe("[E2-09] 파서 — 형식 오류를 조용히 버리지 않는다", () => {
  it("쉼표·공백 혼용을 모두 받는다", () => {
    expect(parseTaxPeriodYears("2019, 2020 2021").years).toEqual([2019, 2020, 2021]);
  });

  it("중복은 제거하고 오름차순으로 정렬한다", () => {
    expect(parseTaxPeriodYears("2021,2019,2021").years).toEqual([2019, 2021]);
  });

  it("4자리 정수가 아닌 토큰은 invalid로 돌려준다 (⑧이 차단할 근거)", () => {
    const r = parseTaxPeriodYears("2019, 20, 이천이십, 2020년");
    expect(r.years).toEqual([2019]);
    expect(r.invalid).toEqual(["20", "이천이십", "2020년"]);
  });

  it("빈 문자열은 아무것도 만들지 않는다", () => {
    expect(parseTaxPeriodYears("").years).toEqual([]);
    expect(parseTaxPeriodYears(undefined).invalid).toEqual([]);
  });
});

describe("[E2-09] 과세기간 = 달력연도 (「소득세법」 §5①)", () => {
  it("2020년 → [2020-01-01, 2021-01-01)", () => {
    const i = taxPeriodInterval(2020);
    expect(i.start.toISOString().slice(0, 10)).toBe("2020-01-01");
    expect(i.end.toISOString().slice(0, 10)).toBe("2021-01-01");
  });

  it("윤년(366일)도 그대로 한 과세기간이다", () => {
    const i = taxPeriodInterval(2020);
    expect((i.end.getTime() - i.start.getTime()) / 86_400_000).toBe(366);
  });
});

describe("[E2-09] subtractPeriods — 반열린 구간 차집합", () => {
  it("가운데를 빼면 두 조각으로 갈린다", () => {
    const r = subtractPeriods(
      [{ start: d("2014-01-01"), end: d("2024-01-01") }],
      [taxPeriodInterval(2019)],
    );
    expect(r).toHaveLength(2);
    expect(r[0].end.toISOString().slice(0, 10)).toBe("2019-01-01");
    expect(r[1].start.toISOString().slice(0, 10)).toBe("2020-01-01");
  });

  it("연속한 결격 연도는 한 덩어리로 빠진다", () => {
    const r = subtractPeriods(
      [{ start: d("2014-01-01"), end: d("2024-01-01") }],
      [taxPeriodInterval(2019), taxPeriodInterval(2020)],
    );
    expect(r).toHaveLength(2);
    expect(r[1].start.toISOString().slice(0, 10)).toBe("2021-01-01");
  });

  it("겹치지 않는 연도는 아무것도 자르지 않는다", () => {
    const base = [{ start: d("2014-01-01"), end: d("2019-01-01") }];
    expect(subtractPeriods(base, [taxPeriodInterval(2022)])).toEqual(base);
  });
});

describe("[E2-09] excludeDisqualifiedTaxPeriods — 적용된 연도만 보고한다", () => {
  const farming = [{ start: d("2014-01-02"), end: d("2024-06-01") }];

  it("겹치는 연도만 appliedYears에 실린다", () => {
    const r = excludeDisqualifiedTaxPeriods(farming, [2019, 2030]);
    expect(r.appliedYears).toEqual([2019]);
    expect(r.removedDays).toBe(365);
  });

  it("입력이 없으면 원본을 그대로 돌려준다", () => {
    const r = excludeDisqualifiedTaxPeriods(farming, []);
    expect(r.periods).toBe(farming);
    expect(r.removedDays).toBe(0);
  });
});

/**
 * 🔑 이 블록이 「연도로 받아야 한다」의 근거다.
 *
 * 소유기간 2014-01-02 ~ 2024-06-01(§168의6 1호 · 5년 이상 버킷). 비사업용이 되려면
 * 가(직전 5년 중 730일 초과)·나(직전 3년 중 365일 초과)·다(소유기간 40% 초과)를 **모두** 충족해야 한다.
 */
describe("[E2-09] 같은 5개 과세기간이라도 어느 해인지에 따라 판정이 갈린다", () => {
  it("결격 없음 → 사업용 (대조군)", () => {
    const r = judgeFarmland(base(), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isBusiness).toBe(true);
  });

  it("직전 5개 과세기간(2019~2023) 결격 → 비사업용으로 뒤집힌다", () => {
    const r = judgeFarmland(
      base({ disqualifiedTaxPeriods: [2019, 2020, 2021, 2022, 2023] }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
  });

  it("초기 5개 과세기간(2014~2018) 결격 → 사업용 그대로 (개수는 같다)", () => {
    const r = judgeFarmland(
      base({ disqualifiedTaxPeriods: [2014, 2015, 2016, 2017, 2018] }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
  });

  it("차감 사실이 warning으로 드러난다 (조용히 깎지 않는다)", () => {
    const r = judgeFarmland(
      base({ disqualifiedTaxPeriods: [2019, 2020] }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    const w = r.warnings?.find((x) => x.includes("§66⑭"));
    expect(w).toBeDefined();
    expect(w).toContain("2019·2020년");
    expect(w).toContain("731일");
  });

  it("자경 기간과 겹치지 않는 연도를 넣으면 「차감된 것이 없다」고 알린다", () => {
    const r = judgeFarmland(
      base({ disqualifiedTaxPeriods: [1999] }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.warnings?.some((x) => x.includes("겹치지 않아"))).toBe(true);
  });

  it("자경 미영위(farmingSelf=false)면 뺄 것이 없어 warning도 없다", () => {
    const r = judgeFarmland(
      base({ farmingSelf: false, disqualifiedTaxPeriods: [2019] }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.warnings?.some((x) => x.includes("§66⑭"))).toBe(false);
  });
});
