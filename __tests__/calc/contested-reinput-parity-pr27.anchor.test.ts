/**
 * PR-27 anchor (2026-11 리뷰) — 판정 메뉴 양론(해석이 갈리는 쟁점) 반대 입장 재판정 입력의 정합.
 *
 * | # | 결함 | 주장 |
 * |---|---|---|
 * | D-79 | 반대 입장이 §155① 짝을 다시 만들지 않음 | 최소 안전망 — 그 짝이 결론을 가를 수 있는 모양이면 「결론 같음」 대신 확인 필요(완전 수정 안 A는 별건) |
 * | D-87 | C7 감지가 STEP 0.95 결과를 받지 못함 | 조특법(§99의4)으로 이미 뺀 소수지분을 C7 대상으로 세지 않는다 · 반대 입력에서 행 연결 선언도 걷는다 |
 * | D-88 | 쟁점을 하나씩만 뒤집음 | 2017.2.3. 전 양도에서 C2·C7이 겹치면 두 반대 입장을 함께 적용하고 그 사실을 밝힌다 |
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
const inh = (id: string, acq: string, same: boolean, extra: Record<string, unknown> = {}) => ({
  id, region: "non_capital", acquisitionDate: acq, isInherited: true, inheritedDate: acq, isCoInherited: true, isLargestCoInheritedShareholder: false,
  decedentSameHouseholdAtInheritance: same, decedentHouseholdSeparate: !same, acquisitionOrigin: "general", ...extra });
const mk = (transfer: string, acq: string, houses: unknown[]): RulingCase => ({ id: "p", docNo: "-", docDate: "-", basis: "era", today: transfer, summary: "-", bucket: "match",
  form: { isOneHousehold: true, transferDate: transfer, contractTotalPrice: "500000000", asset: { assetKind: "housing", acquisitionDate: acq, regionCode: "2714000000" }, houses } as never });
const R994 = { countExclusion: { kind: "reduction", reduction: { type: "new_99_4_rural", ruralHouseAcquisitionDate: "", ruralHouseStdPrice: "60000000", isRegisteredHanok: false, adjacentArea994: "no", ruralLandAreaSqm994: "330", ruralHouseType994: "other", ruralHouseFloorAreaSqm994: "100", meetsLocationRequirement: true } } };
async function issues(c: RulingCase) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
  try {
    const form = buildCaseForm(c);
    const ve = validateAllSteps(form).filter((e) => e.severity === "error");
    const res = await POST(new NextRequest("http://localhost/api/calc/one-house-exemption", { method: "POST", headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(buildOneHouseExemptionApiBody(form)) }));
    const d = (await res.json()).data;
    type I = { id: string; positions: { verdict: string; summary: string }[]; conclusionsDiffer: boolean; otherPositionUnresolved?: string; houseIds: string[] };
    return { ve, isExempt: d.judgment.isExempt as boolean, list: (d.contestedIssues ?? []) as I[] };
  } finally {
    vi.useRealTimers();
  }
}
const C7 = "155-3-co-inherited-minority-before-ranking-clause";
const C2 = "155-3-same-household-co-inherited-minority";

describe("D-79 최소 안전망 — 반대 입장의 §155① 짝을 다시 만들지 않으면 「결론 같음」을 단정하지 않는다", () => {
  it("C7 · 2016-05-01 · 일반 S + 별도세대 소수지분 m1·m2(S보다 나중) + 신규 N → 확인 필요 안내", async () => {
    const o = await issues(mk("2016-05-01", "2012-11-21", [inh("m1", "2013-03-01", false), inh("m2", "2013-06-01", false), { id: "n", region: "non_capital", acquisitionDate: "2015-03-01", acquisitionOrigin: "general" }]));
    expect(o.ve).toEqual([]);
    const i = o.list.find((x) => x.id === C7)!;
    expect(i.conclusionsDiffer).toBe(false);
    expect(i.otherPositionUnresolved).toContain("확인이 필요합니다");
  });
  it("대조 — 신규 주택이 없으면 안내 없이 결론 그대로", async () => {
    const o = await issues(mk("2016-05-01", "2012-11-21", [inh("m1", "2013-03-01", false), inh("m2", "2013-06-01", false)]));
    const i = o.list.find((x) => x.id === C7)!;
    expect(i.otherPositionUnresolved).toBeUndefined();
  });
});

describe("D-87 C7 감지가 STEP 0.95 정본 결과(echo)를 받는다", () => {
  it("§99의4로 이미 뺀 소수지분 m1 + 다른 소수지분 m2 → 본 판정 비과세 · C7 카드 없음(종전: A 비과세 / B 과세)", async () => {
    const o = await issues(mk("2016-05-01", "2012-11-21", [inh("m1", "2013-03-01", false, R994), inh("m2", "2013-06-01", false)]));
    expect(o.ve).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.list.map((x) => x.id)).not.toContain(C7);
  });
});

describe("D-88 2017.2.3. 전 C2·C7 겹침 — 반대 입장을 함께 적용", () => {
  it("동일세대 소수지분 m1 + 별도세대 소수지분 m2 · 2016-12-01 → C2 B 비과세 · 결론 갈림 · 보충 문장", async () => {
    const o = await issues(mk("2016-12-01", "2010-11-21", [inh("m1", "2013-03-01", true), inh("m2", "2013-06-01", false)]));
    expect(o.ve).toEqual([]);
    const i = o.list.find((x) => x.id === C2)!;
    expect(i.positions[1].verdict).toBe("exempt");
    expect(i.conclusionsDiffer).toBe(true);
    expect(i.positions[1].summary).toContain("한 사건에 함께 나온 결정은 확인하지 못했습니다");
  });
  it("대조 — 2018-05-01 양도(개정 뒤)는 겹쳐 적용하지 않는다", async () => {
    const o = await issues(mk("2018-05-01", "2010-11-21", [inh("m1", "2013-03-01", true), inh("m2", "2013-06-01", false)]));
    const i = o.list.find((x) => x.id === C2);
    expect(i?.positions[1].summary ?? "").not.toContain("한 사건에 함께 나온 결정은 확인하지 못했습니다");
  });
});
