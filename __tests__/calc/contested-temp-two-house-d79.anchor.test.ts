/**
 * D-79 안 A anchor (2026-11 리뷰) — 판정 메뉴 양론 C2·C7 반대 입장이 §155① 짝을 그 입장의 제외 결과로 다시 도출한다.
 *
 * 「일반주택보다 나중에 상속한 소수지분 + 신규주택」은 엔진 입장(A)에서 나중 취득 행이 2채 이상이라 짝이 없다. 종전에는 반대 입장(B) 입력이
 * 그 「짝 없음」을 그대로 실어 B도 과세 — 「두 입장의 결론이 같습니다」로 단언했다. ④가 반대 입장이 빼는 행까지 빼고 짝을 다시 도출해
 * `contestedTemporaryTwoHouse`로 싣고, 엔진은 C2·C7 반대 입장 입력에만 그 짝을 쓴다.
 *
 * 근거: 서면-2015-부동산-0345(2015.05.14.) 회신 2 「「소득세법 시행령」제155조 제1항에 따른 일시적 2주택 특례를 적용할 때에도 위 1.에 따른
 *   상속주택 소수지분은 해당 거주자의 주택으로 보지 아니하는 것입니다」(사실관계: A 2003.10. 취득 → B 별도세대 공동상속 소수지분 2006.10. →
 *   C 분양 2012.7. — KoreanLaw MCP 원문 2026-11-21).
 *
 * | # | 주장 |
 * |---|---|
 * | P-1 | C7(2016 양도 · 별도세대 소수지분 2채) — A 과세 / B 비과세 · 결론 갈림 · 배지 「해석이 갈림」 |
 * | P-2 | C2(동일세대 소수지분) — 2016·2024 양도 모두 A 과세 / B 비과세 · 갈림 |
 * | P-3 | 0345 원형(별도세대)은 엔진 입장 비과세 · 동일세대 변형은 C2 갈림 |
 * | P-4 | 엔진 입장 결론·미충족 특례는 바뀌지 않는다(A 불변) · 안전망 문장 없음 |
 * | P-5 | ⑧ — 반대 입장 짝의 신규 주택 행도 취득 경위를 요구(다른 입장 문구) · ④ 본문에 짝(newHouseRowId) |
 * | P-6 | 대조 — 소수지분을 먼저 상속하면 종전처럼 갈림 · 쟁점 없는 세대는 키를 싣지 않는다 · 키 없는 직접 API는 종전 안전망 |
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { oneHouseVerdictOf } from "@/lib/calc/one-house-judgment-verdict";
import { observeCase, buildCaseForm, type RulingCase } from "./one-house-rulings/harness";

const inh = (id: string, d: string, same: boolean) => ({
  id, region: "non_capital", acquisitionDate: d, isInherited: true, inheritedDate: d, isCoInherited: true,
  ...(same ? { decedentSameHouseholdAtInheritance: true } : { decedentHouseholdSeparate: true }),
});
const N = (d: string, origin = true) => ({ id: "n", region: "non_capital", acquisitionDate: d, ...(origin ? { acquisitionOrigin: "general" } : {}) });
const mk = (sell: string, transfer: string, rows: object[]): RulingCase => ({
  id: "d79", docNo: "-", docDate: "-", basis: "current", today: "2026-11-21", summary: "-", bucket: "match",
  form: {
    isOneHousehold: true, transferDate: transfer, contractTotalPrice: "500000000", wasRegulatedAtAcquisition: false,
    asset: { assetKind: "housing", acquisitionDate: sell, residenceInputMode: "direct", residencePeriodMonthsAsset: "24" },
    houses: rows,
  } as never,
});
const C7 = (origin = true) => mk("2012-11-21", "2016-05-01", [inh("m1", "2013-03-01", false), inh("m2", "2013-06-01", false), N("2015-03-01", origin)]);
const C2_2016 = mk("2012-11-21", "2016-05-01", [inh("m1", "2013-03-01", true), N("2015-03-01")]);
const C2_2024 = mk("2018-03-01", "2024-06-01", [inh("m1", "2020-03-01", true), N("2022-03-01")]);
const E0345 = (same: boolean) => mk("2003-10-01", "2014-06-01", [inh("b", "2006-10-01", same), N("2012-07-01")]);
const CTRL_BEFORE = mk("2012-11-21", "2016-05-01", [inh("m1", "2011-03-01", true), N("2015-03-01")]);

type Issue = { id: string; conclusionsDiffer: boolean; otherPositionUnresolved?: string; positions: { verdict: string }[] };
async function post(body: unknown) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-21T03:00:00Z"));
  try {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(body),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    return { judgment: data.judgment, issues: (data.contestedIssues ?? []) as Issue[] };
  } finally {
    vi.useRealTimers();
  }
}
const bodyOf = (c: RulingCase) => buildOneHouseExemptionApiBody(buildCaseForm(c)) as Record<string, unknown>;

async function expectSplit(c: RulingCase, id: string) {
  const o = await observeCase(c);
  expect(o.validationErrors).toEqual([]);
  expect(o.contested).toEqual([expect.objectContaining({ id, A: "taxable", B: "exempt" })]);
  const { judgment, issues } = await post(bodyOf(c));
  expect(issues[0].conclusionsDiffer).toBe(true);
  expect(issues[0].otherPositionUnresolved).toBeUndefined();
  expect(oneHouseVerdictOf(judgment, undefined, issues).label).toBe("해석이 갈림");
  return o;
}

describe("D-79 안 A — 반대 입장 §155① 짝 재도출", () => {
  it("[P-1] C7 2016 · 별도세대 소수지분 2채 + 신규 → A 과세 / B 비과세 · 해석이 갈림", async () => {
    await expectSplit(C7(), "155-3-co-inherited-minority-before-ranking-clause");
  });

  it.each([
    ["2016 양도", C2_2016],
    ["2024 양도(현행)", C2_2024],
  ])("[P-2] C2 %s · 동일세대 소수지분 + 신규 → A 과세 / B 비과세 · 해석이 갈림", async (_l, c) => {
    await expectSplit(c, "155-3-same-household-co-inherited-minority");
  });

  it("[P-3] 0345 원형(별도세대 소수지분)은 엔진 입장 비과세 · 동일세대 변형은 C2 갈림", async () => {
    const o = await observeCase(E0345(false));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.contested).toEqual([]);
    await expectSplit(E0345(true), "155-3-same-household-co-inherited-minority");
  });

  it("[P-4] 엔진 입장(A) 결론·미충족 특례는 그대로 — 반대 입장 짝은 판정 결론에 닿지 않는다", async () => {
    for (const c of [C7(), C2_2016, C2_2024]) {
      const o = await observeCase(c);
      expect(o.isExempt).toBe(false);
      expect(o.unmetExceptions).toEqual(["155-2-inherited-house"]);
      const body = bodyOf(c);
      expect(body.temporaryTwoHouse).toBeUndefined(); // 엔진 입장 짝은 여전히 없다
    }
  });

  it("[P-5] ⑧ 반대 입장 짝의 신규 주택 행 경위 미답 → 다른 입장 문구로 막는다 · ④ 본문에 그 행의 짝", async () => {
    const o = await observeCase(C7(false));
    expect(o.validationErrors).toEqual([
      expect.stringMatching(/^houses\.2\.acquisitionOrigin: 보유 주택 3: 해석이 갈리는 쟁점의 다른 입장에서는 일시적 2주택의 신규 주택이 되는 주택입니다/),
    ]);
    const pair = bodyOf(C7()).contestedTemporaryTwoHouse as Record<string, unknown>;
    expect(pair).toMatchObject({ previousAcquisitionDate: "2012-11-21", newAcquisitionDate: "2015-03-01", newHouseRowId: "n" });
  });

  it("[P-6] 대조 — 먼저 상속한 소수지분은 종전처럼 갈림 · 쟁점 없으면 키 없음 · 키 없는 직접 API는 종전 안전망", async () => {
    await expectSplit(CTRL_BEFORE, "155-3-same-household-co-inherited-minority");
    expect("contestedTemporaryTwoHouse" in bodyOf(mk("2012-11-21", "2016-05-01", [N("2015-03-01")]))).toBe(false);
    const legacy = bodyOf(C7());
    delete legacy.contestedTemporaryTwoHouse;
    const { issues } = await post(legacy);
    expect(issues[0].conclusionsDiffer).toBe(false);
    expect(issues[0].otherPositionUnresolved).toContain("확인이 필요합니다");
  });
});
