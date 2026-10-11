/**
 * S07-7 anchor — 비과세 철회(비거주자 §121② 단서 · §155⑳ 불성립 · 계산기 D12)는 **한 불변식**이다.
 * 철회 뒤에 비과세를 전제로 한 파생값(근거 조문 · 1세대1주택 의제 · 그 결론을 전제로 한 판정 보류)이 남으면 안 된다.
 *
 * 근거:
 *   - `OneHouseJudgment.legalBasis`는 「appliedExceptions·pending에서 모은다」는 파생값이다(types.ts) — 철회 뒤 applied=[]·pending=[]면 [].
 *   - 「소득세법 시행령」 §159의4 표2 「1주택(제155조 … 에 따라 1세대 1주택으로 보는 주택을 포함한다)」(MST 290841) —
 *     의제가 불성립이면 표2 대상이 아니다. 계산기 D12(H-6)의 장특 표2→표1 전환은
 *     `transfer.route.rental-residence-155-20-e14gh.anchor.test.ts` H-6이 단언한다.
 *   - 판정 보류(재기산 이력 미답 · D4 역순 이중 합가)는 비과세로 판정된 경우에만 낸다(`settled` 게이트) — 철회 뒤에는 전제가 없다.
 *
 * 결론(비과세 여부)은 바꾸지 않는다 — 회수 여부(X1-1)·중과 주택 수(G8-1)는 사용자 결정 대기다.
 */
import { describe, it, expect } from "vitest";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";
import { revokeOneHouseExemption } from "@/lib/tax-engine/one-house/revoke-exemption";
import { deriveLegalBasis } from "@/lib/tax-engine/one-house/legal-basis";
import type { RulingCase } from "./one-house-rulings/harness";
import e193 from "./one-house-rulings/cases/E193.json";
import type { OneHouseJudgment } from "@/lib/tax-engine/one-house/types";

const TMP = {
  isOneHousehold: true, transferDate: "2026-06-15", contractTotalPrice: "800000000",
  temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2024-03-01",
  asset: { assetKind: "housing", acquisitionDate: "2018-01-10", residenceInputMode: "direct", residencePeriodMonthsAsset: "24" },
  houses: [{ id: "new", acquisitionOrigin: "general", region: "capital", acquisitionDate: "2024-03-01" }],
};
const D4 = {
  isOneHousehold: true, transferDate: "2026-04-10", contractTotalPrice: "800000000",
  marriageDate: "2019-03-01", parentalCareMergeDate: "2018-06-01", parentalCareParentAge: "over_60", isFirstTransferredInMerge: true,
  asset: { assetKind: "housing", acquisitionDate: "2015-04-01" },
  houses: [
    { id: "spouse", acquisitionOrigin: "general", region: "capital", acquisitionDate: "2014-02-01", mergeOrigin: "second_merge_side" },
    { id: "parents", acquisitionOrigin: "general", region: "capital", acquisitionDate: "2005-01-01", mergeOrigin: "counterpart_side" },
  ],
};
const NR = { transferorNonResident: true };

describe("S07-7 판정 메뉴 — 비거주자 철회 뒤 파생값 정리", () => {
  it("긍정 짝 [TMP · 거주자] 비과세 — 근거 조문 · 의제가 선다(불변식은 철회에만 건다)", async () => {
    const o = await observeRaw(mkCase("2026-10-06", TMP));
    expect(o.j.isExempt).toBe(true);
    expect(o.j.legalBasis.length).toBeGreaterThan(0);
    expect(o.j.deemedOneHouseBy155).toBe(true);
  });
  it("TMP · 비거주자 → 과세 · 근거 조문 [] · 의제 없음 · 사유는 unmet로만", async () => {
    const o = await observeRaw(mkCase("2026-10-06", { ...TMP, ...NR }));
    expect(o.status).toBe(200);
    expect(o.j.isExempt).toBe(false);
    expect(o.j.appliedExceptions).toEqual([]);
    expect(o.j.legalBasis).toEqual([]);
    expect(o.j.deemedOneHouseBy155).not.toBe(true);
    expect(o.j.unmetExceptions.map((u: { id: string }) => u.id)).toContain("non-resident-121-2");
  });
  it("긍정 짝 [D4 역순 · 거주자] 비과세 — 이중 합가 확인 필요 보류가 선다", async () => {
    const o = await observeRaw(mkCase("2026-10-06", D4));
    expect(o.j.isExempt).toBe(true);
    expect(o.j.undetermined.map((u: { id: string }) => u.id)).toContain("155-4-5-double-merge-reverse-unverified");
  });
  it("D4 역순 · 비과세 철회 → 근거 조문 [] · 「1세대1주택으로 보아 판정」 보류도 거둔다", async () => {
    const o = await observeRaw(mkCase("2026-10-06", { ...D4, ...NR }));
    expect(o.j.isExempt).toBe(false);
    expect(o.j.legalBasis).toEqual([]);
    expect(o.j.deemedOneHouseBy155).not.toBe(true);
    expect(o.j.undetermined.map((u: { id: string }) => u.id)).not.toContain("155-4-5-double-merge-reverse-unverified");
  });
});

describe("S07-7 판정 메뉴 — §155⑳ 불성립 철회(rental-housing-verdict 호출부)", () => {
  it("E193-current(3중첩 불성립) → 과세 · 근거 조문 [] · 의제 없음", async () => {
    const c = (e193 as RulingCase[]).find((x) => x.id === "E193-current")!;
    const o = await observeRaw(c);
    expect(o.j.isExempt).toBe(false);
    expect(o.j.legalBasis).toEqual([]);
    expect(o.j.deemedOneHouseBy155).not.toBe(true);
  });
});

describe("S07-7 leaf — revokeOneHouseExemption은 남은 pending의 근거 조문을 지우지 않는다", () => {
  const base = {
    isExempt: true, isPartialExempt: false, exemptReason: "one_house", deemedOneHouseBy155: true,
    appliedExceptions: [{ id: "155-1-temporary-two-house", label: "일시적 2주택", legalBasis: "A" }],
    pending: [{ id: "p", kind: "transfer_by", description: "", legalBasis: "B" }],
    undetermined: [
      { id: "154-5-final-one-house-restart-unverified", reason: "r1" },
      { id: "155-4-5-double-merge-reverse-unverified", reason: "r2" },
      { id: "89-2-confirm:0", reason: "keep" },
    ],
    unmetExceptions: [], legalBasis: ["A", "B"],
  } as unknown as OneHouseJudgment;
  it("legalBasis = 남은 pending에서만 · 결론 전제 보류 2종만 제거", () => {
    const r = revokeOneHouseExemption(base);
    expect(r.legalBasis).toEqual(["B"]);
    expect(r.deemedOneHouseBy155).toBeUndefined();
    expect(r.undetermined.map((u) => u.id)).toEqual(["89-2-confirm:0"]);
  });
  it("deriveLegalBasis — 입력 순서 유지 · 중복 제거", () => {
    expect(deriveLegalBasis([{ legalBasis: "X" }, { legalBasis: "Y" }], [{ legalBasis: "X" }])).toEqual(["X", "Y"]);
  });
});
