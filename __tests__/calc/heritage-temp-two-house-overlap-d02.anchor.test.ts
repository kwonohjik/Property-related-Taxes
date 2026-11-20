/**
 * D-02 anchor — §155⑥1호 문화유산 주택 + 일반주택 + 신규 주택 3주택에서 종전 일반주택을 신규 취득일부터 3년 안에 양도하면 1세대1주택으로 본다
 * (상속증여세과-212, 2013.6.13. — 「…문화재주택을 포함하여 일시적으로 3주택이 된 경우로서 … 다른 주택(C)을 취득한 날부터 3년 이내에 종전의
 * 주택(B)을 양도하는 경우 … 1세대 1주택으로 보아 같은 영 제154조 제1항을 적용」). ⑦ 농어촌주택 D3(서면4팀-3617·-977)와 같은 문형이다.
 * 종전에는 ⑥ 선언이 아무 효과를 내지 못해 선언 없는 3주택과 같은 세액(97,860,000원)이었다.
 *
 * Q-18 (b) — §155⑧ 부득이 주택이 낀 같은 모양은 정면 해석이 없어 과세를 유지하되 「2주택에만 적용」으로 단정하지 않고 확인 필요로 밝힌다.
 */
import { describe, it, expect } from "vitest";
import { observeCase, type RulingCase } from "./one-house-rulings/harness";

function menu(o: { heritageAcq?: string; newAcq: string; extra?: Record<string, unknown>[]; uoc?: boolean }): RulingCase {
  const special = o.uoc
    ? { id: "u", region: "non_capital", acquisitionDate: o.heritageAcq ?? "2000-03-01", acquisitionOrigin: "general", oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalReason: "work", unavoidableOutsideCapitalUnresolved: true }
    : { id: "a", region: "non_capital", acquisitionDate: o.heritageAcq ?? "2000-03-01", acquisitionOrigin: "general", oneHouseCulturalHeritage: true };
  return {
    id: "d02", docNo: "-", docDate: "-", basis: "current", today: "2026-06-16", summary: "d02", bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: "2026-06-15",
      contractTotalPrice: "900000000",
      asset: { assetKind: "housing", acquisitionDate: "2015-06-01", residenceInputMode: "direct", residencePeriodMonthsAsset: "24" },
      houses: [special, { id: "c", region: "non_capital", acquisitionDate: o.newAcq, acquisitionOrigin: "general" }, ...(o.extra ?? [])],
    } as unknown as RulingCase["form"],
  };
}

describe("D-02 문화유산 주택 + 일시적 2주택 3주택 (상속증여세과-212)", () => {
  it("문화유산 A(2000) → B(2015) → 신규 C(2024-04-01), B를 2026-06-15에 양도 → 비과세 · ⑥·① 함께 근거", async () => {
    const o = await observeCase(menu({ newAcq: "2024-04-01" }));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toEqual(expect.arrayContaining(["155-1-temporary-two-house", "155-6-1ho-cultural-heritage"]));
  });

  it("문화유산을 B보다 나중(2018)에 취득한 순서도 같다 — 문화유산 행은 신규 주택 후보가 아니다", async () => {
    const o = await observeCase(menu({ heritageAcq: "2018-03-01", newAcq: "2024-04-01" }));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
  });

  it("음성 짝 — 신규 취득일부터 3년을 넘겨 양도(C 2022-06-01)면 과세", async () => {
    const o = await observeCase(menu({ newAcq: "2022-06-01" }));
    expect(o.isExempt).toBe(false);
  });

  it("음성 짝 — 4주택이면 과세(겹침은 3주택까지)", async () => {
    const o = await observeCase(menu({ newAcq: "2024-04-01", extra: [{ id: "d", region: "non_capital", acquisitionDate: "2010-01-01", acquisitionOrigin: "general" }] }));
    expect(o.isExempt).toBe(false);
  });
});

describe("Q-18 (b) — §155⑧ 부득이 주택 + 일시적 2주택 3주택은 과세 유지 + 확인 필요 문구", () => {
  it("과세 · 「2주택에만 적용」 단정 대신 해석 미확인(확인 필요) 사유", async () => {
    const o = await observeCase(menu({ uoc: true, newAcq: "2024-04-01" }));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    const reasons = (o.unmetReasons["155-8-unavoidable:work"] ?? []).join(" ");
    expect(reasons).toContain("확인 필요");
    expect(reasons).not.toContain("각각 1개씩(2주택) 보유한 세대가 일반주택을 양도하는 경우에만 적용됩니다");
  });
});
