/**
 * 대조 anchor — 클라이언트 §71의2① 후보 제외(`popDeclineCountExcludedHouseIds`) ↔ 엔진 STEP 0.9(`resolveExemptionHouseCountExclusions`) (결정 #42 후속).
 *
 * 클라이언트는 같은 평가기(`resolvePopulationDecline71_2`)를 부르지만 **입력을 따로 만든다** — 그 입력이 엔진과 다르면 엔진이 빼지 않는 행을
 * §155① 신규 주택 후보·§154① 단서 게이트의 「제외 후 주택 수」에서 빼게 된다. 계산기 ④ 본문 → route → 엔진 결과
 * (`specialHouseExclusionDetail`의 §71의2 적격 행)와 클라이언트 집합을 같은 폼으로 맞대어 본다.
 *
 * | # | 축 | 클라이언트(수정 전) | 엔진 |
 * |---|---|---|---|
 * | PD-1 | 양성 2채(양도 + 평창) | {p} | {p} |
 * | PD-2 | 모름 | {} | {} |
 * | PD-3 | 3채 — 남는 주택 2채 | {} | {} |
 * | PD-4 | §155② 상속주택 제외가 함께 있다(겹침) | {} | {} |
 * | PD-5 | 인구감소지역주택 취득 전 조합원입주권 보유 | {} | {} |
 * | PD-6 | 1세대가 아니다(`isOneHousehold=false`) | **{p}** | {} — 엔진은 평가하지 않는다 |
 * | PD-7 | OH-34 레거시 스칼라 3(명부는 2채) | **{p}** | {} — 엔진은 ④의 스칼라 3을 받는다 |
 * | PD-8 | OH-34 레거시 스칼라 1 → §154① 단서 게이트의 제외 후 주택 수 | **0** | 1 |
 *
 * 입주권 양도(§89①4호)는 계산기 경로가 아직 연결되지 않아(질문 블록 숨김 · #42 남은 항목) 이 대조에서 뺐다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import {
  popDeclineCountExcludedHouseIds,
  inheritedCountExcludedHouseIds,
} from "@/lib/calc/temp-two-house-candidate-exclusion";
import { eligibleCountExcludedHouseIds } from "@/lib/calc/house-count-exclusion-rows";
import { resolveExemptionHousingCount } from "@/lib/calc/exemption-house-count";
import { POP_DECLINE_71_2_ARTICLE } from "@/lib/tax-engine/transfer-reductions/population-decline-71-2";

const PYEONGCHANG = "5176025021"; // 강원 평창군 — 인구감소지역(수도권 밖)
const NOWON = "1135010500";

const row = (over: Record<string, unknown>) => ({
  region: "non_capital",
  officialPrice: "200000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  acquisitionOrigin: "general",
  ...over,
});

/** 노원 주택(2015 취득 · 8억) 양도 + 평창 인구감소지역주택(2024-03-01 · 기준시가 2억) — 사실은 모두 답했다. */
function form(
  extraRows: Record<string, unknown>[] = [],
  pop: Record<string, unknown> = {},
  over: Record<string, unknown> = {},
) {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-06-15";
  f.isOneHousehold = true;
  f.contractTotalPrice = "800000000";
  f.householdNoPresaleRightsConfirmed = true;
  f.householdNoOtherHousesConfirmed = true;
  f.residencePeriodMonths = "60";
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-15",
    actualSalePrice: "800000000",
    fixedAcquisitionPrice: "500000000",
    addressJibun: "x",
    regionCode: NOWON,
    residenceInputMode: "direct",
    residencePeriods: [],
    residencePeriodMonthsAsset: "60",
  });
  f.houses = [
    row({
      id: "p",
      regionCode: PYEONGCHANG,
      acquisitionDate: "2024-03-01",
      acquisitionOfficialPrice: "200000000",
      popDeclSoleAtAcquisition: "yes",
      popDeclAcquiredByGift: "no",
      ...pop,
    }),
    ...extraRows.map(row),
  ] as never;
  Object.assign(f, over);
  return f;
}
type Form = ReturnType<typeof form>;

/** 계산기 ④ 본문 → route → 엔진이 §71의2로 뺀 행 */
async function engineExcluded(f: Form) {
  let body: Record<string, unknown> = {};
  const realFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
  }) as never;
  try {
    await callTransferTaxAPI(f);
  } catch {
    /* 본문만 본다 */
  } finally {
    globalThis.fetch = realFetch;
  }
  const res = await SINGLE(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  expect(res.status).toBe(200);
  const json = (await res.json()) as {
    data: {
      result: {
        totalTax: number;
        specialHouseExclusionDetail?: { entries: { article: string; eligible: boolean; houseId?: string }[] };
      };
    };
  };
  const entries = json.data.result.specialHouseExclusionDetail?.entries ?? [];
  return {
    ids: entries.filter((e) => e.article === POP_DECLINE_71_2_ARTICLE && e.eligible).map((e) => e.houseId).sort(),
    householdHousingCount: body.householdHousingCount as number,
    totalTax: json.data.result.totalTax,
  };
}

/** 클라이언트 — `exemptionCountExcludedHouseIds`가 넘기는 것과 같은 「이미 빠진 행」으로 부른다. */
function clientExcluded(f: Form): string[] {
  const already = new Set([...eligibleCountExcludedHouseIds(f), ...inheritedCountExcludedHouseIds(f)]);
  return [...popDeclineCountExcludedHouseIds(f, already)].sort();
}

const CASES: [string, () => Form, string[]][] = [
  ["PD-1 양성 2채", () => form(), ["p"]],
  ["PD-2 취득 당시 1채 보유 모름", () => form([], { popDeclSoleAtAcquisition: "unknown" }), []],
  [
    "PD-3 3채 — 이 의제 뒤에도 2채가 남는다",
    () => form([{ id: "o", region: "capital", regionCode: NOWON, acquisitionDate: "2025-01-10", officialPrice: "300000000" }]),
    [],
  ],
  [
    "PD-4 §155② 상속주택 제외와 겹친다",
    () =>
      form([
        {
          id: "inh",
          region: "capital",
          regionCode: NOWON,
          acquisitionDate: "2025-01-10",
          isInherited: true,
          inheritedDate: "2025-01-10",
          isCoInherited: false,
          decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true,
          parentalCareMergeInheritedHouse: false,
        },
      ]),
    [],
  ],
  [
    "PD-5 인구감소지역주택 취득 전 조합원입주권 보유",
    () =>
      form([], {}, {
        householdNoPresaleRightsConfirmed: false,
        presaleRights: [{ id: "r1", type: "redevelopment_right", acquisitionDate: "2023-01-01", region: "capital" }],
      }),
    [],
  ],
  ["PD-6 1세대가 아니다", () => form([], {}, { isOneHousehold: false }), []],
  [
    "PD-7 OH-34 레거시 스칼라 3(명부 2채)",
    () => form([], {}, { legacyHouseCountPrecedence: true, householdHousingCount: "3" }),
    [],
  ],
];

describe("PD 클라이언트 후보 제외 = 엔진 STEP 0.9 (같은 폼)", () => {
  it.each(CASES)("%s", async (_name, make, expected) => {
    const f = make();
    const engine = await engineExcluded(f);
    expect(engine.ids).toEqual(expected);
    expect(clientExcluded(f)).toEqual(engine.ids);
  });

  it("PD-4 전제 — 상속주택 행이 실제로 §155②로 빠진다(겹침 축이 살아 있다)", () => {
    const f = CASES[3][1]();
    expect([...inheritedCountExcludedHouseIds(f)]).toEqual(["inh"]);
  });

  it("PD-8 OH-34 레거시 스칼라 1 — §154① 단서 게이트의 제외 후 주택 수가 엔진(스칼라 1 − 제외 0)과 같다 (수정 전 0)", async () => {
    const f = form([], {}, { legacyHouseCountPrecedence: true, householdHousingCount: "1" });
    const engine = await engineExcluded(f);
    expect(engine.householdHousingCount).toBe(1);
    expect(engine.ids).toEqual([]);
    expect(resolveExemptionHousingCount(f)).toBe(engine.householdHousingCount - engine.ids.length);
  });
});
