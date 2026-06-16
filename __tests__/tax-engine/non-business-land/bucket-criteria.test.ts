/**
 * 갭 3d — §168조의6 소유기간 버킷별 가·나·다 AND 판정 anchor
 *
 * 구 meetsPeriodCriteria는 "사업용 테스트 OR"(직전3년≥730 OR 직전5년≥1095 OR 비율≥0.6)로
 * 단순화돼 (1) 1호 경계 off-by-one, (2) 2호/3호 단기버킷 미반영 오판을 냈다.
 * 본 anchor는 §168조의6 본문(KoreanLaw MST 286211)에 따른 버킷별 가·나·다 AND 판정을 고정.
 *
 * 핵심: 비사업용 기간 = 가·나·다(또는 가·나) 모두 충족 → isBusiness = NOT(가 AND 나 AND 다).
 */
import { describe, it, expect } from "vitest";
import { meetsPeriodCriteria } from "@/lib/tax-engine/non-business-land/period-criteria";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import { addDays } from "date-fns";

const d = (iso: string) => new Date(iso);
const R = DEFAULT_NON_BUSINESS_LAND_RULES;

describe("갭 3d — §168조의6 버킷별 판정 anchor", () => {
  // [Pre-Do] 1호 경계 off-by-one — 구 코드는 직전5년 사업 1095일을 사업용으로 오판.
  // 보유 7년(2555일, 버킷1). 직전5년 창(1826일) 내 사업 정확히 1095일.
  // 가: 직전5년 비사업 731일>730 ✓ / 나: 직전3년 비사업 731일>365 ✓ / 다: 전체 비사업 1460일>40%(1022) ✓
  // → 가·나·다 모두 충족 → 비사업용(meets=false). 구 고정상수 DAYS_3Y=1095는 윤년 가변 창길이 미반영.
  it("AT-BUCKET1-OFFBYONE: 보유 7년·직전5년 사업 정확히 1095일 → 비사업용", () => {
    const r = meetsPeriodCriteria(
      [{ start: d("2015-01-01"), end: addDays(d("2015-01-01"), 1095) }],
      d("2013-01-01"),
      d("2020-01-01"),
      "other_land",
      R,
    );
    expect(r.ownershipBucket).toBe(1);
    expect(r.meets).toBe(false);
  });

  // 2호(3~5년) 단기버킷 — 구 코드는 직전3년 사업 730일(2년)만으로 사업용 오판.
  // 보유 4.15년(1516일, 버킷2). 사업 직전3년 730일·전체 48%.
  // 가: 전체 비사업 786일>(1516−1095=421) ✓ / 나: 직전3년 비사업 366일>365 ✓ / 다: 786일>40%(606) ✓
  // → 모두 충족 → 비사업용. 구 코드는 가목(소유−3년)·다목(전체40%)을 무시.
  it("AT-BUCKET2-SHORT: 보유 4.15년·직전3년 사업 730일·전체 48% → 비사업용", () => {
    const r = meetsPeriodCriteria(
      [
        { start: d("2016-05-11"), end: d("2018-05-11") },
        { start: d("2017-09-15"), end: d("2018-05-07") },
      ],
      d("2014-12-10"),
      addDays(d("2014-12-10"), 1517), // 초일불산입(getOwnershipStart=취득+1) → 보유 1516일
      "other_land",
      R,
    );
    expect(r.ownershipBucket).toBe(2);
    expect(r.meets).toBe(false);
  });

  // 2호 가목 미충족 사례 — 사업용 충분 시 사업용 유지(회귀 보호).
  // 보유 4년(버킷2), 사업 전체(full) → 비사업 0일 → 가·나·다 모두 미충족 → 사업용.
  it("AT-BUCKET2-BIZ: 보유 4년·전기간 사업 → 사업용", () => {
    const r = meetsPeriodCriteria(
      [{ start: d("2016-01-01"), end: d("2020-01-01") }],
      d("2016-01-01"),
      d("2020-01-01"),
      "other_land",
      R,
    );
    expect(r.ownershipBucket).toBe(2);
    expect(r.meets).toBe(true);
  });

  // 3호 단서 — 소유 2년 미만이면 가목 미적용, 나목(40%)만 판정.
  // 보유 약 1.5년(버킷3), 사업 0일 → 나목(전체 비사업>40%) 충족 → 비사업용.
  it("AT-BUCKET3-PROVISO: 보유 1.5년·사업 0일 → 비사업용(나목만 적용)", () => {
    const r = meetsPeriodCriteria(
      [],
      d("2022-01-01"),
      d("2023-07-01"), // 약 546일 < 730 → 가목 미적용
      "other_land",
      R,
    );
    expect(r.ownershipBucket).toBe(3);
    expect(r.meets).toBe(false);
  });

  // 3호 단서 — 소유 2년 미만·사업 충분(전체 80%) → 나목 미충족 → 사업용.
  it("AT-BUCKET3-PROVISO-BIZ: 보유 1.5년·사업 80% → 사업용(나목 미충족)", () => {
    const r = meetsPeriodCriteria(
      [{ start: d("2022-01-02"), end: addDays(d("2022-01-02"), 440) }], // 약 80% 사업
      d("2022-01-01"),
      d("2023-07-01"),
      "other_land",
      R,
    );
    expect(r.ownershipBucket).toBe(3);
    expect(r.meets).toBe(true);
  });
});
