/**
 * D-79 후속 anchor (2026-11 리뷰) — 양론 반대 입장 §155① 짝의 §155①2호 연혁 사실(전입일 등).
 *
 * 반대 입장 짝(C2·C7 · C1)의 연혁 사실은 엔진 입장과 같은 폼 전역 칸을 쓴다. 엔진 입장에 짝이 없으면 화면(⑤)이 그 칸을 열지 않아
 * 사용자가 답할 수 없었고, 반대 입장 재판정은 그 사실을 모르는 채 「과세」로 나와 카드가 「두 입장의 결론이 같습니다」로 단언했다
 * (2026-11-23 실측: 서울 · 동일세대 공동상속 소수지분 · 신규 주택 2020-06 · 양도 2021-05 — 전입일을 답하면 반대 입장 비과세).
 * 엔진 입장은 같은 미답에서 「확인 필요」(`155-1-move-in-requirement-unverified`)를 낸다.
 *
 * | # | 주장 |
 * |---|---|
 * | E-1 | 전입일 미답 → 반대 입장 재판정의 확인 필요를 카드가 밝힌다(「두 입장의 결론이 같습니다」 아님) · 엔진 입장 결론 불변 |
 * | E-2 | 전입일을 답하면 → 반대 입장 비과세 · 결론 갈림(대조) |
 * | E-3 | ⑧ — 엔진 입장 짝이 없고 반대 입장 짝만 있어도 연혁 칸 모순(임차인 토글 ON · 종료일 없음)을 막는다(⑤와 같은 짝) |
 * | E-4 | 쟁점 없는 단순 일시적 2주택은 종전 그대로 — 엔진 입장 확인 필요 · 반대 입장 키 없음 |
 */
import { describe, it, expect, vi } from "vitest";
import {
  observeCase,
  buildCaseForm,
  type RulingCase,
} from "./one-house-rulings/harness";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";
import { judgmentEraFactsNewHouse } from "@/lib/calc/one-house-judgment-new-house";

const C2 = "155-3-same-household-co-inherited-minority";
const SEOUL = "1168010100";
const inh = (id: string, d: string) => ({
  id,
  region: "capital",
  regionCode: SEOUL,
  acquisitionDate: d,
  isInherited: true,
  inheritedDate: d,
  isCoInherited: true,
  decedentSameHouseholdAtInheritance: true,
});
const N = (d: string) => ({
  id: "n",
  region: "capital",
  regionCode: SEOUL,
  acquisitionDate: d,
  acquisitionOrigin: "general",
});
const mk = (rows: object[], extra: object = {}): RulingCase =>
  ({
    id: "era",
    docNo: "-",
    docDate: "-",
    basis: "era",
    today: "2021-05-02",
    summary: "-",
    bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: "2021-05-01",
      contractTotalPrice: "500000000",
      asset: {
        assetKind: "housing",
        acquisitionDate: "2015-01-01",
        regionCode: SEOUL,
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: "48",
      },
      houses: rows,
      ...extra,
    },
  }) as unknown as RulingCase;
/** 엔진 입장(A): 동일세대 소수지분 m1이 주택 수에 남아 나중 취득 행이 2채 — 짝 없음. 반대 입장(B): m1을 빼고 S·N 짝. */
const C2_SEOUL = (extra: object = {}) =>
  mk([inh("m1", "2019-03-01"), N("2020-06-01")], extra);

async function issue(c: RulingCase) {
  const r = await observeCase(c);
  expect(r.validationErrors).toEqual([]);
  expect(r.status).toBe(200);
  return r;
}
async function card(c: RulingCase) {
  const { POST } = await import("@/app/api/calc/one-house-exemption/route");
  const { NextRequest } = await import("next/server");
  const { RATE_LIMIT_BYPASS_HEADER } = await import("@/lib/api/rate-limit");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2021-05-02T03:00:00Z"));
  try {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [RATE_LIMIT_BYPASS_HEADER]: "1",
        },
        body: JSON.stringify(buildOneHouseExemptionApiBody(buildCaseForm(c))),
      }),
    );
    expect(res.status).toBe(200);
    const issues = ((await res.json()).data.contestedIssues ?? []) as {
      id: string;
      conclusionsDiffer: boolean;
      otherPositionUnresolved?: string;
    }[];
    return issues.find((i) => i.id === C2)!;
  } finally {
    vi.useRealTimers();
  }
}

describe("D-79 후속 — 반대 입장 짝의 §155①2호 연혁 사실", () => {
  it("E-1 전입일 미답 → 카드가 반대 입장의 확인 필요를 밝힌다 · 엔진 입장 결론 불변", async () => {
    const r = await issue(C2_SEOUL());
    expect(r.isExempt).toBe(false);
    expect(r.contested.find((x) => x.id === C2)).toMatchObject({
      A: "taxable",
      B: "taxable",
    });
    const c = await card(C2_SEOUL());
    expect(c.conclusionsDiffer).toBe(false);
    expect(c.otherPositionUnresolved).toBeDefined();
    expect(c.otherPositionUnresolved).toContain("확인");
    expect(c.otherPositionUnresolved).toContain("전입");
  });

  it("E-2 전입일을 답하면 → 반대 입장 비과세 · 결론 갈림(대조)", async () => {
    const r = await issue(C2_SEOUL({ newHouseMoveInDate: "2021-01-10" }));
    expect(r.contested.find((x) => x.id === C2)).toMatchObject({
      A: "taxable",
      B: "exempt",
    });
  });

  it("E-3 ⑧ — 반대 입장 짝만 있어도 연혁 칸 모순을 막는다 · 그 짝이 연혁 칸의 짝이다", () => {
    const form = buildCaseForm(C2_SEOUL({ newHouseExistingTenant: true }));
    expect(judgmentEraFactsNewHouse(form as never)).toMatchObject({
      newHouseRowId: "n",
      contested: true,
    });
    const errors = validateStep2(form as never);
    expect(errors.some((e) => e.field === "newHouseTenantLeaseEndDate")).toBe(
      true,
    );
  });

  it("E-4 쟁점 없는 단순 일시적 2주택 → 엔진 입장 확인 필요 · 연혁 칸의 짝은 엔진 입장 짝", async () => {
    const c = mk([N("2020-06-01")]);
    const r = await issue(c);
    expect(r.undetermined).toContain("155-1-move-in-requirement-unverified");
    expect(r.contested).toEqual([]);
    expect(judgmentEraFactsNewHouse(buildCaseForm(c) as never)).toMatchObject({
      newHouseRowId: "n",
      contested: false,
    });
  });
});
