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

// ── 4. §155의2 · §155의3 입력 경로 (P4-2b-0) ──────────────────────────
/**
 * 🔴 **P3는 엔진만 만들었고 입력 경로가 없었다** — 판정은 구현돼 있는데 Zod 스키마에 필드가
 *    없어 본문에 실어도 **침묵 strip**됐고, `engine-input.ts`에도 매핑이 없어 엔진에 도달할
 *    길이 아예 없었다(`transfer.types.ts:607` 「UI 입력 경로는 P4에서 만든다」).
 *    ⇒ 여기 anchor는 **⑫ Zod → ⑭ Route 매핑 → 엔진**의 관통을 고정한다.
 *    leaf 직접 호출 테스트(`one-house-155-2-155-3-special.anchor.test.ts`)는 이 층을 건너뛰므로
 *    같은 것을 증명하지 못한다(`feedback_leaf_anchor_skips_zod_layer`).
 *
 * 🔑 관측 지점은 **비과세 여부** 하나로 고정한다 — 둘 다 「거주요건 **면제**」라 거주요건이
 *    실제로 걸리는 시료가 아니면 필드를 통째로 빼도 결과가 같다(구별력 0).
 *    ⇒ `RESIDENCE_BINDS`(취득 당시 조정지역 + 거주 0개월)에서만 갈린다. 각 테스트에 **음성 짝**을 붙인다.
 */
const RESIDENCE_BINDS = { wasRegulatedAtAcquisition: true, residencePeriodMonths: 0 };

/** §155의2 요건을 모두 갖춘 본문 조각 — leaf anchor의 `MORTGAGE_OK`와 같은 값(ISO 문자열 형태). */
const MORTGAGE_OK_BODY = {
  contractDate: "2016-01-01",
  borrowerAgeAtContract: 60,
  contractYears: 10,
  maturityLumpSumRepayment: true,
  transferredBeforeMaturity: false,
  isTransferredHouseMortgaged: true,
};

/** §155의3 요건을 모두 갖춘 본문 조각. */
const WIN_WIN_OK_BODY = {
  winWinContractDate: "2022-03-01",
  increaseRatePct: 5,
  priorLeaseMonths: 18,
  winWinLeaseMonths: 24,
};

describe("P4-2b-0 — §155의2 장기저당담보주택 입력 경로", () => {
  it("[LM-1] 음성 짝 — 필드가 없으면 조정지역 취득·거주 0년은 **과세**다", async () => {
    const { json } = await post(RESIDENCE_BINDS);
    expect(json.data.judgment.isExempt).toBe(false);
  });

  it("[LM-2] 같은 시료에 §155의2 사실을 실으면 거주요건이 면제돼 **비과세**", async () => {
    const { json } = await post({ ...RESIDENCE_BINDS, longTermMortgageHouse: MORTGAGE_OK_BODY });
    expect(json.data.judgment.isExempt).toBe(true);
  });

  it("[LM-3] ③ 계약기간 만료 **이전** 양도면 ①② 부적용 — boolean이 그대로 관통한다", async () => {
    const { json } = await post({
      ...RESIDENCE_BINDS,
      longTermMortgageHouse: { ...MORTGAGE_OK_BODY, transferredBeforeMaturity: true },
    });
    expect(json.data.judgment.isExempt).toBe(false);
  });

  it("[LM-4] ①1호 60세 — 59세 불성립 / 60세 성립 (number가 관통한다 · 지정값 ±1 동등성)", async () => {
    const at = async (borrowerAgeAtContract: number) =>
      (
        await post({
          ...RESIDENCE_BINDS,
          longTermMortgageHouse: { ...MORTGAGE_OK_BODY, borrowerAgeAtContract },
        })
      ).json.data.judgment.isExempt;
    expect(await at(59)).toBe(false);
    expect(await at(60)).toBe(true);
  });

  /**
   * ⚠️ `contractDate`의 Date 변환은 **관측할 수 없다** — 엔진이 이 필드를 읽지 않기 때문이다
   *    (60세 판정은 `borrowerAgeAtContract` 숫자로 받는다. `lib/tax-engine/` 전수 grep 0건).
   *    변환을 지우는 뮤테이션은 **살아남는다**. 단언을 만들어 죽은 것처럼 보이게 하지 않는다
   *    (`feedback_mutation_zero_discrimination_is_not_proof`). 변환은 엔진 타입이 `Date`를
   *    요구하므로 유지하되, 안전망은 **타입체커**이지 이 테스트가 아니다.
   */
  it("[LM-5] Zod 형상 위반은 400 — 요건 판정은 엔진 몫이지만 형상은 route가 막는다", async () => {
    const { status, json } = await post({
      longTermMortgageHouse: { ...MORTGAGE_OK_BODY, contractDate: "not-a-date" },
    });
    expect(status).toBe(400);
    expect(json.error.fieldErrors["longTermMortgageHouse.contractDate"]).toBeDefined();
  });
});

describe("P4-2b-0 — §155의3 상생임대주택 입력 경로", () => {
  it("[WW-1] 요건 충족 사실을 실으면 거주요건이 면제돼 **비과세** (음성 짝은 LM-1)", async () => {
    const { json } = await post({ ...RESIDENCE_BINDS, winWinRentalHouse: WIN_WIN_OK_BODY });
    expect(json.data.judgment.isExempt).toBe(true);
  });

  it("[WW-2] ①2호 직전임대차 1년 6개월 — 17개월 불성립 / 18개월 성립", async () => {
    const at = async (priorLeaseMonths: number) =>
      (
        await post({
          ...RESIDENCE_BINDS,
          winWinRentalHouse: { ...WIN_WIN_OK_BODY, priorLeaseMonths },
        })
      ).json.data.judgment.isExempt;
    expect(await at(17)).toBe(false);
    expect(await at(18)).toBe(true);
  });

  /**
   * 🔑 **이것이 Date 변환의 관측 지점이다.** `qualifiesWinWinRental`은
   *    `winWinContractDate >= WIN_WIN_CONTRACT_START`로 **Date끼리 비교**한다
   *    (`transfer-tax-exemption-requirements.ts:189`). 변환이 빠져 string이 들어오면
   *    관계 연산자가 양쪽을 number로 강제해 `NaN >= number` → **항상 false**가 되므로
   *    WW-1·WW-2·WW-3이 **동시에** 깨진다. 경계 ±1일은 그 위에 창(window) 판정까지 고정한다.
   */
  it("[WW-3] ①1호 체결일 창 — 2021-12-19 불성립 / 2021-12-20 성립", async () => {
    const at = async (winWinContractDate: string) =>
      (
        await post({
          ...RESIDENCE_BINDS,
          winWinRentalHouse: { ...WIN_WIN_OK_BODY, winWinContractDate },
        })
      ).json.data.judgment.isExempt;
    expect(await at("2021-12-19")).toBe(false);
    expect(await at("2021-12-20")).toBe(true);
  });

  it("[WW-4] ①1호 증가율 5% 초과는 불성립 — 인하(음수) 계약은 Zod가 막지 않는다", async () => {
    const at = async (increaseRatePct: number) =>
      await post({ ...RESIDENCE_BINDS, winWinRentalHouse: { ...WIN_WIN_OK_BODY, increaseRatePct } });
    expect((await at(5.1)).json.data.judgment.isExempt).toBe(false);
    const cut = await at(-3);
    expect(cut.status).toBe(200);
    expect(cut.json.data.judgment.isExempt).toBe(true);
  });
});
