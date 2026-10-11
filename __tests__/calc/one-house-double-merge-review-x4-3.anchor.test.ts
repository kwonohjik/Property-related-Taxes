/**
 * X4-3 anchor — D4 이중 합가의 검토표·pending/unmet이 엔진 정본(resolveDoubleMergeDeeming)과 같은 구성·기한을 말한다.
 * D4 성립·역순 인정·「먼저 합친 날부터 그 합가의 연수」 기한은 기존 엔진 결정(2026-10-09) — 여기선 표시 정합만 단언.
 */
import { describe, it, expect } from "vitest";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";

const fwd = {
  isOneHousehold: true, transferDate: "2026-04-10", contractTotalPrice: "800000000",
  marriageDate: "2019-03-01", parentalCareMergeDate: "2020-01-15", isFirstTransferredInMerge: true,
  asset: { assetKind: "housing", acquisitionDate: "2015-04-01" },
  houses: [
    { id: "spouse", region: "capital", acquisitionDate: "2014-02-01", mergeOrigin: "counterpart_side" },
    { id: "parents", region: "capital", acquisitionDate: "2005-01-01", mergeOrigin: "second_merge_side" },
  ],
};
const rev = (transferDate: string) => ({
  isOneHousehold: true, transferDate, contractTotalPrice: "800000000",
  marriageDate: "2019-06-01", parentalCareMergeDate: "2017-01-10", isFirstTransferredInMerge: true,
  asset: { assetKind: "housing", acquisitionDate: "2015-04-01" },
  houses: [
    { id: "parents", region: "capital", acquisitionDate: "2005-01-01", mergeOrigin: "counterpart_side" },
    { id: "spouse", region: "capital", acquisitionDate: "2014-02-01", mergeOrigin: "second_merge_side" },
  ],
});
type Item = { id: string; status: string; facts: { label: string; value: string }[] };
const item = (j: { requirementReview?: { items: Item[] } }, id: string) => j.requirementReview?.items.find((x) => x.id === id);

describe("X4-3 — D4 검토표·고지 정합", () => {
  it("(1) 정방향 D4 비과세면 검토표 구성 행이 미충족이 아니다", async () => {
    const r = await observeRaw(mkCase("2026-10-06", fwd));
    expect(r.j.isExempt).toBe(true);
    expect(item(r.j, "merge-composition")?.status).not.toBe("unmet");
  });
  it("(2) 역순 기한 초과(2027-03-01): 검토표 기한은 동거봉양 합가일+10년(2027-01-11)·미충족, 불성립 고지가 하나는 있다", async () => {
    const r = await observeRaw(mkCase("2026-10-10", rev("2027-03-01")));
    expect(r.j.isExempt).toBe(false);
    const w = item(r.j, "merge-window");
    expect(w?.facts.find((f) => f.label === "기한")?.value).toBe("2027-01-11");
    expect(w?.status).toBe("unmet");
    expect(r.j.pending.length + r.j.unmetExceptions.length).toBeGreaterThan(0);
  });
  it("(2c) 역순 기한 안(2027-01-08): 검토표 기한 2027-01-11", async () => {
    const r = await observeRaw(mkCase("2026-10-10", rev("2027-01-08")));
    expect(r.j.isExempt).toBe(true);
    expect(item(r.j, "merge-window")?.facts.find((f) => f.label === "기한")?.value).toBe("2027-01-11");
  });

  it("(2) 역순 기한 초과 과세에는 합가 축 기한(pending)이 먼저 합친 날 기준으로 안내된다", async () => {
    const r = await observeRaw(mkCase("2026-10-10", rev("2027-03-01")));
    const p = r.j.pending.find((x: { id: string }) => x.id === "155-4-parental-care-merge");
    expect(p).toBeDefined();
    expect(String(p.deadline).slice(0, 10)).toBe("2027-01-11");
  });
  it("경계 — 역순 양도 2027-01-11 비과세 · 2027-01-12 과세(엔진 기한과 검토표가 같은 날)", async () => {
    expect((await observeRaw(mkCase("2026-10-10", rev("2027-01-11")))).j.isExempt).toBe(true);
    expect((await observeRaw(mkCase("2026-10-10", rev("2027-01-12")))).j.isExempt).toBe(false);
  });
  it("긍정 짝 — 단일 동거봉양 2주택(C3)의 검토표 구성 행은 충족 · 기한 행은 2027-01-11(종전 그대로)", async () => {
    const c3 = {
      isOneHousehold: true, transferDate: "2027-03-01", contractTotalPrice: "800000000",
      parentalCareMergeDate: "2017-01-10", isFirstTransferredInMerge: true,
      asset: { assetKind: "housing", acquisitionDate: "2015-04-01" },
      houses: [{ id: "parents", region: "capital", acquisitionDate: "2005-01-01", mergeOrigin: "counterpart_side" }],
    };
    const r = await observeRaw(mkCase("2026-10-10", c3));
    expect(item(r.j, "merge-composition")?.status).toBe("met");
    expect(item(r.j, "merge-window")?.facts.find((f) => f.label === "기한")?.value).toBe("2027-01-11");
  });
  it("정방향 D4 기한 초과(혼인 2014 · 동거봉양 2015 · 양도 2025-06-01): 검토표 기한은 혼인일 기준(종전 그대로 맞는 값)", async () => {
    const f = { ...fwd, marriageDate: "2014-03-04", parentalCareMergeDate: "2015-01-15", transferDate: "2025-06-01" };
    const r = await observeRaw(mkCase("2026-10-10", f));
    expect(r.j.isExempt).toBe(false);
    expect(item(r.j, "merge-composition")?.status).not.toBe("unmet");
    expect(item(r.j, "merge-window")?.status).toBe("unmet");
  });
});
