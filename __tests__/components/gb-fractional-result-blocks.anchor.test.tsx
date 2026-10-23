/**
 * 지분 분할 취득(축 B) 일반건물 — 결과 카드 §100③·§163⑨·①②③ 블록 (2026-10-23)
 *
 * 계획서: `docs/00-pm/gb-fractional-result-blocks.plan.md` (Q-1 a 물건 전체 판정 한 번 · Q-2 a 블록 하나·지분별 행 · Q-3 a 지분별 ①②③).
 * 폼 → ④ → route POST(mock 세율) → `BundledAllocationCard` 렌더.
 *
 * - 종전: 실가 지분은 두 블록이 통째로 없었고, 환산 지분은 **첫 지분 재료**로 떴다(§100③ 금액이 지분 몫 · 지분 순서만 바꿔도 §163⑨가 사라짐).
 * - §100③은 계약서 기재액(지분 합)으로 한 번 · 지분 판정이 30% 경계에서 갈리면 지분별 판정을 그대로 그린다(D-2 🔴).
 * - §163⑨는 상속 지분의 행만 그 지분 카드 값·그 지분 라벨로 · ①②③은 지분마다 블록 하나.
 * - 결정세액 불변(표시 echo만) · 수정신고 판별 `"general-building"` 유지.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calc/transfer-tax",
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { classifyAmendableTransfer } from "@/lib/calc/transfer-amendment-entry";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { GB_SAMPLES, T, asset, form, run, type RunResult } from "./_helpers/gb-bundled-blocks-fixtures";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

const BUY = GB_SAMPLES["S100-act"][0][0];
const EST_SPLIT = GB_SAMPLES["S100-est"][0];
const INH = GB_SAMPLES.INH[0][0];
/** 토지 상속(실가) + 건물 매매(환산) — 환산 경로의 상속 지분. */
const INH_C2 = GB_SAMPLES["INH-C2"][0];
const PRE = GB_SAMPLES.PRE[0];
const PURCHASE_ACT: Partial<AssetForm> = {
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2005-05-01", acquisitionDate: "2010-05-01", landAcqMode: "actual", buildingAcqMode: "actual",
  landAcquisitionPrice: "400000000", buildingAcquisitionPrice: "200000000",
};
const PURCHASE_EST: Partial<AssetForm> = {
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false,
  landAcquisitionDate: "2010-05-01", acquisitionDate: "2010-05-01", landAcqMode: "estimated", buildingAcqMode: "estimated", useEstimatedAcquisition: true,
};
const r = (n: string, d = "100") => ({ ownershipNumerator: n, ownershipDenominator: d });

/** [시료, 총양도가, 지분별 덮어쓰기, 결정세액(변경 전 실측 — 표시 echo만 바뀌므로 불변)] */
type Case = [number, Partial<AssetForm>[][], number];
const CASES = {
  A1: [T, [[BUY, r("50")], [BUY, r("50"), { acquisitionDate: "2012-05-01" }]], 257_850_000],
  "A1'": [T, [[BUY, r("60")], [BUY, r("40"), { acquisitionDate: "2012-05-01" }]], 257_682_000],
  A2: [925_000_000, [[...EST_SPLIT, r("50")], [...EST_SPLIT, r("50"), { acquisitionDate: "2003-05-01" }]], 153_927_732],
  I1: [T, [[INH, r("50")], [INH, r("50")]], 301_110_000],
  I2: [T, [[INH, r("50")], [INH, PURCHASE_ACT, r("50")]], 279_060_000],
  I3: [T, [[INH, PURCHASE_ACT, r("50")], [INH, r("50")]], 279_060_000],
  I4: [T, [[...INH_C2, r("50")], [...INH_C2, r("50")]], 293_104_038],
  I5: [1_620_000_000, [[...PRE, r("50")], [...PRE, r("50")]], 314_470_229],
  I6: [T, [[...INH_C2, r("50")], [...INH_C2, PURCHASE_EST, r("50")]], 301_598_298],
  I7: [T, [[...INH_C2, PURCHASE_EST, r("50")], [...INH_C2, r("50")]], 301_598_298],
  I8: [T, [[INH, r("50")], [INH, PURCHASE_EST, r("50")]], 305_601_279],
} satisfies Record<string, Case>;
type CaseName = keyof typeof CASES;

async function runCase(name: CaseName): Promise<{ res: RunResult; f: TransferFormData }> {
  const [price, shares] = CASES[name];
  const f = form(price, shares.map((s, i) => asset(i + 1, ...s)));
  const res = await run(f);
  expect(res.status, name).toBe(200);
  return { res, f };
}
const renderCard = ({ res, f }: { res: RunResult; f: TransferFormData }) =>
  render(<BundledAllocationCard apportionment={res.apportionment} aggregated={res.aggregated} formData={f} />);
const flat = (el: HTMLElement) => (el.textContent ?? "").replace(/\s+/g, " ");
/** §163⑨ 블록의 행 텍스트 — 「자산 N (지분 x%) 토지분 취득가액(라벨)금액」. */
const inheritRows = () => {
  const head = screen.queryByText("상속 취득가액 직접 산정 — 소득세법 시행령 §163⑨");
  if (!head) return null;
  return [...(head.parentElement as HTMLElement).querySelectorAll("li")].map(flat);
};

describe("축 B §100③ — 물건 전체(계약서 기재액) 판정 한 번 (Q-1 a)", () => {
  it.each([
    ["A1", { land: 1_300_000_000, building: 300_000_000 }],
    ["A1'", { land: 1_300_000_000, building: 300_000_000 }],
    ["A2", { land: 900_000_000, building: 25_000_000 }],
  ] as const)("%s → 구분 기재 가액이 사용자가 적은 계약서 금액 · 블록 1개", async (name, declared) => {
    const c = await runCase(name);
    const j = c.res.aggregated.generalBuildingValuationDetail!.saleSplitJudgment!;
    expect(j.declared).toEqual(declared);
    expect(j.applied).toEqual(declared);
    expect(j.deemedUnclear).toBe(false);
    // 이탈률·결론은 단건 100%와 같다(§1 실측: A1 12bp·55bp · A2 52bp·2330bp).
    expect([j.landDeviationBp, j.buildingDeviationBp]).toEqual(name === "A2" ? [52, 2330] : [12, 55]);
    // 안분 가액 = 지분 안분값의 합(그 지분 계산에 실제로 쓴 값).
    const shares = Object.values(c.res.aggregated.generalBuildingValuationDetail!.shareBlockEcho!);
    expect(j.apportioned!.land).toBe(shares.reduce((s, e) => s + e.saleSplitJudgment!.apportioned!.land, 0));
    renderCard(c);
    expect(screen.getAllByText("구분 기재 가액")).toHaveLength(1);
    expect(screen.queryByTestId("gb-sale-split-share-0")).toBeNull();
    const amount = declared.land.toLocaleString("ko-KR");
    expect(screen.getAllByText(amount).length).toBeGreaterThan(0);
  });

  it("30% 경계에서 지분 판정이 갈리면 물건 전체 판정을 싣지 않고 지분별 판정을 그린다(D-2 🔴)", async () => {
    // 실측(2026-10-23): 지분 1/3 + 2/3, 토지 1,212,167,734 · 건물 387,832,266 — 지분 1은 30% 미만, 지분 2는 불분명.
    const land = 1_212_167_734;
    const split = { landTransferPrice: String(land), buildingTransferPrice: String(T - land) };
    const f = form(T, [
      asset(1, BUY, split, r("1", "3")),
      asset(2, BUY, split, r("2", "3"), { acquisitionDate: "2012-05-01" }),
    ]);
    const res = await run(f);
    expect(res.status).toBe(200);
    const d = res.aggregated.generalBuildingValuationDetail!;
    expect(d.saleSplitJudgment).toBeUndefined();
    expect(d.shareBlockEcho!["0"].saleSplitJudgment!.deemedUnclear).toBe(false);
    expect(d.shareBlockEcho!["1"].saleSplitJudgment!.deemedUnclear).toBe(true);
    renderCard({ res, f });
    expect(flat(screen.getByTestId("gb-sale-split-share-0"))).toMatch(/^자산 1 \(지분 33\.33%\)구분 기재 가액이 안분가액과 30% 미만/);
    expect(flat(screen.getByTestId("gb-sale-split-share-1"))).toMatch(/^자산 2 \(지분 66\.67%\)/);
    expect(flat(screen.getByTestId("gb-sale-split-share-1"))).not.toContain("30% 미만 차이로 그대로 적용");
  });
});

describe("축 B §163⑨ — 블록 하나 · 상속 지분의 행만 (Q-2 a)", () => {
  const L = (share: string, kind: "토지분" | "건물분", label: string, amount: number) =>
    `${share} ${kind} 취득가액${label}${amount.toLocaleString("ko-KR")}`;
  const S1 = "자산 1 (지분 50%)";
  const S2 = "자산 2 (지분 50%)";
  const REP = "(상속개시일 평가액)";
  const NOT = "(상속 아님 — 종전 산정)";

  it.each([
    // 실가 지분 — 종전엔 블록이 통째로 없었다.
    ["I1", [L(S1, "토지분", REP, 150_000_000), L(S1, "건물분", REP, 75_000_000), L(S2, "토지분", REP, 150_000_000), L(S2, "건물분", REP, 75_000_000)]],
    ["I2", [L(S1, "토지분", REP, 150_000_000), L(S1, "건물분", REP, 75_000_000)]],
    ["I3", [L(S2, "토지분", REP, 150_000_000), L(S2, "건물분", REP, 75_000_000)]],
    ["I8", [L(S1, "토지분", REP, 150_000_000), L(S1, "건물분", REP, 75_000_000)]],
    // 환산 경로 — 종전엔 첫 지분 행만, 지분 이름 없이.
    ["I4", [L(S1, "토지분", REP, 150_000_000), L(S1, "건물분", NOT, 86_365_581), L(S2, "토지분", REP, 150_000_000), L(S2, "건물분", NOT, 86_365_581)]],
    // 종전 I6은 토지가 「(환산취득가액)」(지분 2 카드를 봤다) · I7은 블록이 없었다.
    ["I6", [L(S1, "토지분", REP, 150_000_000), L(S1, "건물분", NOT, 86_365_581)]],
    ["I7", [L(S2, "토지분", REP, 150_000_000), L(S2, "건물분", NOT, 86_365_581)]],
  ] as const)("%s", async (name, rows) => {
    const c = await runCase(name);
    renderCard(c);
    expect(inheritRows()).toEqual(rows);
    // 「다만 1985.1.1. 전 …」은 의제취득일 전 상속 지분이 있을 때만(I6 종전: 지분 2 매매 환산 카드로 잘못 붙었다).
    expect(screen.getByText(/상속개시일 현재/).textContent).not.toContain("1985.1.1.");
  });

  it("상속 지분이 없으면 블록이 없다 — A1", async () => {
    renderCard(await runCase("A1"));
    expect(inheritRows()).toBeNull();
  });
});

describe("축 B 의제취득일 전 ①②③ — 지분마다 블록 (Q-3 a)", () => {
  it("I5 → 지분 이름을 단 블록 2개 · §163⑨ 라벨이 그 지분 채택(③)을 따른다", async () => {
    const c = await runCase("I5");
    const echo = c.res.aggregated.generalBuildingValuationDetail!.shareBlockEcho!;
    expect(echo["0"].preDeemedAcquisition!.land!.adopted).toBe("converted");
    renderCard(c);
    for (const [key, name] of [["0", "자산 1 (지분 50%)"], ["1", "자산 2 (지분 50%)"]] as const) {
      const block = flat(screen.getByTestId(`gb-pre-deemed-acquisition-${key}`));
      expect(block).toContain(`${name} — 의제취득일(1985.1.1.) 전 상속·증여`);
      expect(block).toContain("③ 환산취득가액선택119,508,372");
    }
    expect(screen.queryByTestId("gb-pre-deemed-acquisition")).toBeNull();
    expect(inheritRows()).toEqual([
      "자산 1 (지분 50%) 토지분 취득가액(환산취득가액)119,508,372",
      "자산 1 (지분 50%) 건물분 취득가액(환산취득가액)87,445,150",
      "자산 2 (지분 50%) 토지분 취득가액(환산취득가액)119,508,372",
      "자산 2 (지분 50%) 건물분 취득가액(환산취득가액)87,445,150",
    ]);
    expect(screen.getByText(/상속개시일 현재/).textContent).toContain("다만 1985.1.1. 전 상속 파트는");
  });
});

describe("불변 — 결정세액 · 수정신고 판별 · 슬롯에 첫 지분 표지 없음", () => {
  it.each(Object.keys(CASES) as CaseName[])("%s", async (name) => {
    const { res, f } = await runCase(name);
    expect(res.aggregated.determinedTax).toBe(CASES[name][2]);
    expect(classifyAmendableTransfer({ taxType: "transfer", resultData: res.data, inputData: f } as never)).toBe("general-building");
    const d = res.aggregated.generalBuildingValuationDetail!;
    expect(d.acquisitionByInheritance).toBeUndefined();
    expect(d.buildingAcquisitionByInheritance).toBeUndefined();
    expect(d.preDeemedAcquisition).toBeUndefined();
    expect(Object.keys(d.shareBlockEcho!)).toEqual(["0", "1"]);
  });

  it("저장된 옛 결과(지분별 echo 없음)는 종전처럼 슬롯 표지로 그린다", async () => {
    const { res, f } = await runCase("I4");
    const d = res.aggregated.generalBuildingValuationDetail!;
    const old = { ...res.aggregated, generalBuildingValuationDetail: { ...d, shareBlockEcho: undefined, acquisitionByInheritance: true } };
    render(<BundledAllocationCard apportionment={res.apportionment} aggregated={old} formData={f} />);
    expect(inheritRows()).toEqual(["토지분 취득가액(상속개시일 평가액)150,000,000", "건물분 취득가액(상속 아님 — 종전 산정)86,365,581"]);
  });
});
