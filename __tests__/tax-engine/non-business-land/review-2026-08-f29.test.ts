/**
 * anchor — F29 · 유예기간(§168조의14①)은 사업용 사용기간과 **합집합**이다 (산술 합산 아님)
 *
 * # 결함 (정정 전)
 *
 * `period-criteria.ts`는 사업용 사용기간을 `mergeOverlappingPeriods`로 합집합을 만들면서,
 * 유예기간만은 `calculateGraceDaysInWindow`가 낸 **일수**를 `+=`로 더했다. 두 기간이 겹치면
 * 같은 날이 두 번 계산되고, 창 길이 min-clip이 오히려 "창을 꽉 채운 것"으로 만들어
 * 그 창의 비사업용 일수를 0으로 만든다.
 *
 * §168조의14①은 유예기간을 "사업용에 사용한 기간으로 **본다**"는 **의제**다 — 별도 일수를
 * 덧붙이는 규정이 아니므로 합집합이어야 한다. 겹침은 예외적 입력이 아니다:
 * 시행규칙 §83조의5① 5·6호는 기산일이 **취득일**이라(`grace-reason-period.ts`)
 * 취득 직후부터 자경한 농지는 **구조적으로 항상** 겹친다.
 *
 * > ⚠️ 정정 전 기존 테스트는 하나도 깨지지 않았다(NBL 377건 GREEN). 겹치는 입력을 단언하는
 * > 테스트가 `qa-integration.test.ts:487`(QA-101) 하나뿐인데 그 단언이 `toBeDefined()`·
 * > `typeof === "boolean"`이라 어떤 값이든 통과한다 ⇒ **안전망 부재의 증거**이지
 * > 종전 동작을 의도로 고정한 증거가 아니다. 아래 anchor가 유일한 도달 증명이다.
 *
 * # 시나리오 (전건 엔진 실측값)
 *
 * 농지 · 2014-01-01 취득 → 2024-01-01 양도(소유 3,651일) · 재촌 전 기간 ·
 * 자경 2022-07-01~2024-01-01(549일).
 */
import { describe, it, expect } from "vitest";
import { meetsPeriodCriteria } from "@/lib/tax-engine/non-business-land/period-criteria";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type {
  DateInterval,
  GracePeriod,
  NonBusinessLandInput,
} from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const d = (iso: string) => new Date(iso);

/** 자경(=사업용 사용) 549일 */
const SELF_FARMING: DateInterval[] = [{ start: d("2022-07-01"), end: d("2024-01-01") }];

const grace = (start: string, end: string): GracePeriod[] => [
  { reasonCode: "demolition", startDate: d(start), endDate: d(end) },
];

const run = (g?: GracePeriod[]) =>
  meetsPeriodCriteria(SELF_FARMING, d("2014-01-01"), d("2024-01-01"), "farmland", R, g);

describe("F29 · 유예기간 × 사업용 사용기간 = 합집합", () => {
  it("F29-1: 🔴 완전히 겹치는 유예기간은 사업용 일수를 늘리지 않는다 (정정 전 549→1,098 이중계산)", () => {
    // 9호 건축물 멸실 2022-07-01 → 자동 +5년(2027-07-01). 자경 구간을 통째로 덮는다.
    const r = run(grace("2022-07-01", "2027-07-01"));
    expect(r.effectiveBusinessDays).toBe(549); // 정정 전 1,098
    expect(r.gracePeriodDays).toBe(0); // 합집합 증가분 = 0 (정정 전 549)
    expect(r.bizInLast3).toBe(549); // 정정 전 1,095 (창 길이로 min-clip → 비사업용 0일)
    expect(r.bizInLast5).toBe(549); // 정정 전 1,098
    // 판정 자체가 뒤집혔던 지점 — 유예기간이 없을 때와 같은 결론이어야 한다.
    expect(r.meets).toBe(false); // 정정 전 true(사업용)
  });

  it("F29-2: 대조군 — 유예기간이 없으면 F29-1과 완전히 같다", () => {
    const r = run();
    expect(r.effectiveBusinessDays).toBe(549);
    expect(r.gracePeriodDays).toBe(0);
    expect(r.meets).toBe(false);
  });

  it("F29-3: 부분 겹침은 겹치지 않는 몫만 가산된다 (2021-07-01~2023-01-01 → +365일)", () => {
    // 유예 549일 중 자경과 겹치지 않는 2021-07-01~2022-07-01(365일)만 늘어난다.
    const r = run(grace("2021-07-01", "2023-01-01"));
    expect(r.effectiveBusinessDays).toBe(914); // 정정 전 1,098
    expect(r.gracePeriodDays).toBe(365); // 정정 전 549
    expect(r.bizInLast3).toBe(914); // 정정 전 1,095(min-clip)
    expect(r.meets).toBe(true); // 직전3년 비사업 181일 ≤ 365 → 나목 미충족 → 사업용
  });

  it("F29-4: 🛡️ 겹치지 않는 유예기간은 종전 그대로 전량 가산된다 (과잉교정 방지)", () => {
    // 이 단언이 깨지면 「유예기간을 아예 안 세는」 방향으로 잘못 고친 것이다.
    const r = run(grace("2018-01-01", "2019-01-01"));
    expect(r.effectiveBusinessDays).toBe(914); // 549 + 365
    expect(r.gracePeriodDays).toBe(365);
    expect(r.bizInLast3).toBe(549); // 직전 3년 창 밖 — 창별 일수는 늘지 않는다
    expect(r.bizInLast5).toBe(549);
    expect(r.meets).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
const nblInput = (gracePeriods: GracePeriod[]): NonBusinessLandInput =>
  ({
    landType: "farmland",
    landArea: 1000,
    zoneType: "agriculture_forest", // 도시지역 밖 — 편입유예 경로를 타지 않게 한다
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    farmingSelf: true,
    businessUsePeriods: [
      { startDate: d("2022-07-01"), endDate: d("2024-01-01"), usageType: "self_farming" },
    ],
    gracePeriods,
    farmerResidenceDistance: 5, // 재촌 fallback (전 보유기간)
  }) as unknown as NonBusinessLandInput;

describe("F29 · judge·세액까지 전파된다", () => {
  it("F29-5: judgeNonBusinessLand — 겹치는 유예기간으로 사업용이 되지 않는다", () => {
    const r = judgeNonBusinessLand(nblInput(grace("2022-07-01", "2027-07-01")), R);
    expect(r.isNonBusinessLand).toBe(true); // 정정 전 false
    expect(r.effectiveBusinessDays).toBe(549); // 정정 전 1,098
    expect(r.gracePeriodDays).toBe(0); // 정정 전 549
  });

  it("F29-6: 세액 — 양도 10억·취득 3억 토지 261,240,000원 (정정 전 204,090,000원)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        transferPrice: 1_000_000_000,
        acquisitionPrice: 300_000_000,
        acquisitionDate: d("2014-01-01"),
        transferDate: d("2024-01-01"),
        isOneHousehold: false,
        nonBusinessLandDetails: nblInput(grace("2022-07-01", "2027-07-01")),
      }),
      makeMockRates(),
    );
    expect(r.calculatedTax).toBe(261_240_000); // 정정 전 204,090,000 (차 57,150,000 과소)
    expect(r.surchargeType).toBe("non_business_land");
    expect(r.surchargeRate).toBe(0.1);
  });
});
