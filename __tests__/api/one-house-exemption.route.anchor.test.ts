/**
 * P4-2a 앵커 — `POST /api/calc/one-house-exemption` (판정 메뉴 배관)
 *
 * 계획서 `docs/00-pm/one-house-exemption-automation.plan.md` §5.2 · G-1 · D-3.
 *
 * ## 이 route가 존재하는 이유 — 계산기와 **다른 세 가지**만 본다
 *
 *   1. 세액을 계산하지 않는다(판정까지만).
 *   2. 🔴 **주택 수를 명부에서 도출**한다 — 본문이 보낸 `householdHousingCount`를 **믿지 않는다**.
 *      판정 메뉴에는 그 위젯이 없고(G-1 「명부가 정본」), 믿으면 조작된 본문으로 판정이 흔들린다.
 *   3. 주택 수 산정 명세(`houseCount`)를 함께 낸다.
 *
 * 나머지(Zod 스키마·엔진 input 조립·주택수 제외·판정)는 **계산기와 같은 함수**를 부른다 —
 * 그 「같음」이 D-1의 배관 판이라, 여기서 갈라지면 두 화면이 다른 답을 낸다.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import {
  deriveHouseholdHousingCount,
  buildOneHouseCountBreakdown,
} from "@/lib/tax-engine/one-house/house-count";
import { resolveInheritedHouseExclusion } from "@/lib/tax-engine/transfer-inheritance-exclusion";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";

// ── route 호출 헬퍼 ──────────────────────────────────────────────────
/** Zod(`propertySchema`) 필수 필드 기본값 — 각 테스트는 관심 축만 덮어쓴다. */
const BASE = {
  propertyType: "housing",
  transferDate: "2024-06-01",
  acquisitionDate: "2019-06-01",
  transferPrice: 1_000_000_000,
  acquisitionPrice: 300_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  householdHousingCount: 1,
  residencePeriodMonths: 60,
  annualBasicDeductionUsed: 0,
  reductions: [],
} as const;

async function post(over: Record<string, unknown> = {}) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ratelimit-bypass": "1" },
      body: JSON.stringify({ ...BASE, ...over }),
    }),
  );
  return { status: res.status, json: await res.json() };
}

/** 엔진 형태의 명부 행 — API 변환 층이 붙이는 `id:"selling"` 포함 형태. */
const house = (id: string, over: Partial<HouseInfo> = {}): HouseInfo =>
  ({
    id,
    region: "capital",
    acquisitionDate: new Date("2018-01-01"),
    officialPrice: 300_000_000,
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  }) as HouseInfo;

/** route 본문에 싣는 명부 — Date가 아니라 ISO 문자열(Zod 통과 형태). */
const houseBody = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  region: "capital",
  acquisitionDate: "2018-01-01",
  officialPrice: 300_000_000,
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...over,
});

// ── 1. 주택 수 도출 (순수 함수) ───────────────────────────────────────
describe("P4-2a — 명부 → 세대 주택 수 도출 (G-1)", () => {
  it("[HC-1] 명부가 없으면 양도 대상 1채뿐이다", () => {
    expect(deriveHouseholdHousingCount(undefined)).toBe(1);
    expect(deriveHouseholdHousingCount([])).toBe(1);
  });

  it("[HC-2] 엔진 명부는 양도 대상(`selling`)을 **포함**하므로 길이가 곧 주택 수다", () => {
    expect(deriveHouseholdHousingCount([house("selling")])).toBe(1);
    expect(deriveHouseholdHousingCount([house("selling"), house("h1")])).toBe(2);
    expect(deriveHouseholdHousingCount([house("selling"), house("h1"), house("h2")])).toBe(3);
  });
});

// ── 2. 제외 명세 ─────────────────────────────────────────────────────
describe("P4-2a — 주택 수 산정 명세", () => {
  const emptyExclusions = {
    houseCountExclusion: { appliedList: [] },
    specialHouseExclusion: { entries: [], excludedCount: 0 },
  };

  it("[HC-3] 제외가 없으면 유효 주택 수 = 전체이고 명세는 빈 배열이다", () => {
    const r = buildOneHouseCountBreakdown({
      total: 2,
      ...emptyExclusions,
      inheritedExclusion: resolveInheritedHouseExclusion(undefined, undefined, undefined),
    });
    expect(r).toEqual({ total: 2, countedForExemption: 2, excluded: [] });
  });

  it("[HC-4] §155② 상속주택 제외는 **어느 행인지**까지 특정한다", () => {
    const houses = [house("selling"), house("h1", { isInherited: true })];
    const inherited = resolveInheritedHouseExclusion(houses, "selling", undefined);
    expect(inherited.excludedCount).toBe(1);

    const r = buildOneHouseCountBreakdown({ total: 2, ...emptyExclusions, inheritedExclusion: inherited });
    expect(r.countedForExemption).toBe(1);
    expect(r.excluded).toEqual([
      { houseId: "h1", label: "상속주택 — 주택 수 제외", legalBasis: "소득세법 시행령 §155②" },
    ]);
  });

  it("[HC-5] §155③ 공동상속 소수지분도 행을 특정한다 — 최대지분자는 산입", () => {
    const minority = resolveInheritedHouseExclusion(
      [house("selling"), house("h1", { isInherited: true, isCoInherited: true })],
      "selling",
      undefined,
    );
    expect(minority.excludedHouses).toEqual([{ houseId: "h1", basis: "co_inherited" }]);

    // 🔑 긍정 짝 — 최대지분자로 선언하면 제외되지 않는다(§155③ 단서).
    const largest = resolveInheritedHouseExclusion(
      [
        house("selling"),
        house("h1", {
          isInherited: true,
          isCoInherited: true,
          isLargestCoInheritedShareholder: true,
        }),
      ],
      "selling",
      undefined,
    );
    expect(largest.excludedHouses).toEqual([]);
    expect(largest.excludedCount).toBe(0);
  });

  it("[HC-5b] 🔴 최대지분자와 소수지분자가 **함께** 있으면 소수지분 쪽을 특정해야 한다", () => {
    /**
     * HC-5의 두 시료로는 `coExcludedCount === 1` 가드가 먼저 걸러 행 특정 로직에 도달하지
     * 못한다(뮤테이션 N6이 그래서 살아남았다). 최대지분 1채 + 소수지분 1채가 함께 있어야
     * 「제외는 1채인데 **어느 쪽인가**」가 비로소 갈린다.
     */
    const r = resolveInheritedHouseExclusion(
      [
        house("selling"),
        house("largest", {
          isInherited: true,
          isCoInherited: true,
          isLargestCoInheritedShareholder: true,
        }),
        house("minority", { isInherited: true, isCoInherited: true }),
      ],
      "selling",
      undefined,
    );
    expect(r.coExcludedCount).toBe(1);
    expect(r.excludedHouses).toEqual([{ houseId: "minority", basis: "co_inherited" }]);
  });

  it("[HC-6] 적격 상속주택이 2채면 선순위를 특정할 수 없어 제외 0 — 명세도 비어 있다", () => {
    const r = resolveInheritedHouseExclusion(
      [house("selling"), house("h1", { isInherited: true }), house("h2", { isInherited: true })],
      "selling",
      undefined,
    );
    expect(r.excludedCount).toBe(0);
    expect(r.excludedHouses).toEqual([]);
  });
});

// ── 3. route end-to-end ──────────────────────────────────────────────
describe("POST /api/calc/one-house-exemption", () => {
  it("[R-1] 1주택·보유 5년 → 비과세. 판정 결과 4필드가 응답에 실린다", async () => {
    const { status, json } = await post();
    expect(status).toBe(200);
    const { judgment, houseCount } = json.data;
    expect(judgment.isExempt).toBe(true);
    // P4-1이 만든 필드가 배관을 타고 그대로 나온다
    expect(judgment.pending).toEqual([]);
    expect(judgment.undetermined).toEqual([]);
    expect(judgment.appliedExceptions).toEqual([]);
    expect(judgment.legalBasis).toEqual([]);
    expect(houseCount).toEqual({ total: 1, countedForExemption: 1, excluded: [] });
  });

  it("[R-2] 보유 2년 미달 → 과세 + 「이 날짜까지 보유」 기한이 응답에 실린다", async () => {
    const { json } = await post({ acquisitionDate: "2023-06-01" });
    expect(json.data.judgment.isExempt).toBe(false);
    expect(json.data.judgment.pending).toHaveLength(1);
    expect(json.data.judgment.pending[0].id).toBe("154-1-holding-years");
    // Date는 JSON 직렬화로 ISO 문자열이 된다 — 화면이 그대로 포맷한다.
    expect(String(json.data.judgment.pending[0].deadline).slice(0, 10)).toBe("2025-06-01");
  });

  it("[R-3] 🔴 본문의 `householdHousingCount`를 믿지 않는다 — 명부에서 도출한다", async () => {
    /**
     * 본문은 「1주택」이라 주장하지만 명부에는 양도 대상 + 다른 주택 1채가 있다.
     * 계산기라면 스칼라를 그대로 썼을 자리다(경고만 띄운다). 판정 메뉴는 **명부가 정본**이므로
     * 2주택으로 판정해 **과세**가 나와야 한다.
     */
    const { json } = await post({
      householdHousingCount: 1,
      houses: [houseBody("selling"), houseBody("h1")],
    });
    expect(json.data.houseCount.total).toBe(2);
    expect(json.data.judgment.isExempt).toBe(false);
  });

  it("[R-4] 긍정 짝 — 같은 2주택 명부에 §155② 상속주택이면 1채 제외돼 비과세", async () => {
    const { json } = await post({
      householdHousingCount: 1,
      houses: [houseBody("selling"), houseBody("h1", { isInherited: true })],
    });
    expect(json.data.houseCount).toEqual({
      total: 2,
      countedForExemption: 1,
      excluded: [
        { houseId: "h1", label: "상속주택 — 주택 수 제외", legalBasis: "소득세법 시행령 §155②" },
      ],
    });
    expect(json.data.judgment.isExempt).toBe(true);
  });

  it("[R-5] 일시적 2주택 기한 도과 → 처분기한이 응답에 실린다", async () => {
    const { json } = await post({
      houses: [houseBody("selling"), houseBody("h1")],
      temporaryTwoHouse: {
        previousAcquisitionDate: "2019-06-01",
        newAcquisitionDate: "2020-07-01",
      },
    });
    expect(json.data.judgment.isExempt).toBe(false);
    expect(json.data.judgment.pending.map((p: { id: string }) => p.id)).toEqual([
      "155-1-disposal-deadline",
    ]);
    expect(String(json.data.judgment.pending[0].deadline).slice(0, 10)).toBe("2023-07-01");
  });

  it("[R-6] 1세대 비해당 선언은 판정 대상이 아니다 — 기한도 없다", async () => {
    const { json } = await post({ isOneHousehold: false });
    expect(json.data.judgment.isExempt).toBe(false);
    expect(json.data.judgment.pending).toEqual([]);
  });

  it("[R-7] Zod 위반은 400 + fieldErrors", async () => {
    const { status, json } = await post({ transferDate: "not-a-date" });
    expect(status).toBe(400);
    expect(json.error.code).toBe("INVALID_INPUT");
    expect(Object.keys(json.error.fieldErrors ?? {}).length).toBeGreaterThan(0);
  });
});
