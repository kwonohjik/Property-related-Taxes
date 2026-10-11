/**
 * X3-5 anchor — §155의2② 장기저당담보주택 동거봉양 합가: 「먼저 양도하는 주택」은 법정 요건이다.
 * 칩을 선언했는데 이 요건이 없어 불성립하면 그 사유(확인 필요)가 남아야 하고, 합가일을 비운 세대도 선언할 수 있어야 한다.
 *
 * 법령: 「소득세법 시행령」 제155조의2제2항 — 「…동거봉양하기 위하여 세대를 합침으로써 1세대가 2주택을 소유하게 되는 경우
 *   **먼저 양도하는 주택**에 대하여는 국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항의 규정을 적용하되,
 *   장기저당담보주택은 거주기간의 제한을 받지 아니한다」(MST 290841 시행 2026-10-01 원문 확인). 기한은 없다.
 */
import { describe, it, expect } from "vitest";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";

const base = {
  isOneHousehold: true,
  transferDate: "2025-05-01",
  contractTotalPrice: "900000000",
  asset: { assetKind: "housing", acquisitionDate: "2015-01-01", residenceInputMode: "direct", residencePeriodMonthsAsset: "24" },
  houses: [{ id: "parent", region: "capital", acquisitionDate: "2005-01-01" }],
  longTermMortgageSpecial: true,
  longTermMortgageContractDate: "2020-01-01",
  longTermMortgageBorrowerAge: "70",
  longTermMortgageContractYears: "15",
  longTermMortgageMaturityLumpSum: true,
  longTermMortgageTransferredBeforeMaturity: false,
  longTermMortgageIsTransferredHouseMortgaged: false,
  longTermMortgageParentalCareMerge: true,
};
const ID = "155-2-2-long-term-mortgage-merge";
const run = (over: Record<string, unknown> = {}) => observeRaw(mkCase("2025-05-10", { ...base, ...over }));
const unmetOf = (r: Awaited<ReturnType<typeof run>>) =>
  (r.j.unmetExceptions ?? []).find((u: { id: string }) => u.id === ID) as { reasons: string[] } | undefined;

describe("X3-5 — §155의2② 칩 선언이 흔적 없이 사라지지 않는다", () => {
  it("칩 ON + 먼저 양도 미선언 → 과세 · §155의2② 불성립 사유에 「확인 필요」", async () => {
    const r = await run();
    expect(r.issues.filter((x) => x.startsWith("error"))).toEqual([]);
    expect(r.j.isExempt).toBe(false);
    expect(unmetOf(r)?.reasons.join("\n")).toContain("확인 필요");
    expect(unmetOf(r)?.reasons.join("\n")).toContain("먼저 양도");
  });

  it("긍정 짝 — 칩 ON + 먼저 양도 선언(합가일 없이) → 비과세 · 155-2-2 적용 · 사유 없음", async () => {
    const r = await run({ isFirstTransferredInMerge: true });
    expect(r.j.isExempt).toBe(true);
    expect(r.j.appliedExceptions.map((e: { id: string }) => e.id)).toContain(ID);
    expect(unmetOf(r)).toBeUndefined();
  });

  it("칩 OFF는 흔적이 없다(선언하지 않은 특례는 말하지 않는다)", async () => {
    const r = await run({ longTermMortgageParentalCareMerge: false });
    expect(unmetOf(r)).toBeUndefined();
  });

  it("계약 요건 미충족(만기 전 양도) + 먼저 양도 선언 → §155의2③ 사유", async () => {
    const r = await run({ isFirstTransferredInMerge: true, longTermMortgageTransferredBeforeMaturity: true });
    expect(r.j.isExempt).toBe(false);
    expect(unmetOf(r)?.reasons.join("\n")).toContain("§155의2③");
  });

  it("④ — 칩이 꺼져 있고 합가일도 없으면 숨은 「먼저 양도」 값은 엔진에 보내지 않는다", async () => {
    const r = await run({ isFirstTransferredInMerge: true, longTermMortgageParentalCareMerge: false });
    expect((r.body as Record<string, unknown>).isFirstTransferredInMerge).toBeUndefined();
  });
  it("④ — 칩이 켜져 있으면 합가일 없이도 「먼저 양도」를 보낸다", async () => {
    const r = await run({ isFirstTransferredInMerge: true });
    expect((r.body as Record<string, unknown>).isFirstTransferredInMerge).toBe(true);
  });
});
