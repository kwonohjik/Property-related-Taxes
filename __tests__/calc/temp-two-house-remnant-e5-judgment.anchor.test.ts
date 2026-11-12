/**
 * anchor — 판정 메뉴 경로(④ → route → 엔진)와 ⑤ 판정 카드가 §155① 후단(E-5)을 같은 결론으로 본다.
 * 입력은 §154① 단서 「수용」 칸(수용일·사업인정 고시일)을 재사용한다(사용자 결정 2026-11-12). 엔진 연혁은
 * `__tests__/tax-engine/transfer/temporary-two-house-remnant-155-1-e5.anchor.test.ts`가 고정한다.
 *
 * 시료: 종전(양도) 주택 2010-01-01 · 신규 주택(명부 행) 2019-01-01 → 처분기한 2022-01-03 · 일부 수용 2021-06-01 · 잔존 양도 2024-06-01.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";
import { buildCaseForm } from "./one-house-rulings/harness";
import { judgmentDerivedNewHouse, judgmentTempTwoHouseVerdict } from "@/lib/calc/one-house-judgment-temp-two-house";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date("2024-06-01")) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

const form = (extra: Record<string, unknown>) => ({
  isOneHousehold: true,
  isRegulatedArea: false,
  transferDate: "2024-06-01",
  contractTotalPrice: "500000000",
  asset: { assetKind: "housing", acquisitionDate: "2010-01-01" },
  houses: [{ id: "new", acquisitionOrigin: "general", region: "non_capital", acquisitionDate: "2019-01-01" }],
  ...extra,
});
const EXPROPRIATED = {
  provisoReason: "expropriation",
  provisoExpropriationDate: "2021-06-01",
  provisoBusinessApprovalDate: "2015-01-01",
};
const card = (extra: Record<string, unknown>) => {
  const f = buildCaseForm(mkCase("2026-11-13", form(extra)));
  return judgmentTempTwoHouseVerdict(f, judgmentDerivedNewHouse(f)) as unknown as { status: string; remnantApplied?: boolean };
};

describe("E-5 판정 메뉴 — 일부 수용 뒤 잔존 주택 양도", () => {
  it("수용일이 기한 안 → route 비과세 · 카드 충족(수용일 기준 표시)", async () => {
    const r = await observeRaw(mkCase("2026-11-13", form(EXPROPRIATED)));
    expect(r.issues.filter((x) => x.startsWith("error"))).toEqual([]);
    expect(r.j.isExempt).toBe(true);
    const c = card(EXPROPRIATED);
    expect(c.status).toBe("eligible");
    expect(c.remnantApplied).toBe(true);
  });

  it("대조: 수용 단서 없음 → route 과세 · 카드 미충족", async () => {
    const r = await observeRaw(mkCase("2026-11-13", form({})));
    expect(r.j.isExempt).toBe(false);
    expect(card({}).status).toBe("ineligible");
  });
});
