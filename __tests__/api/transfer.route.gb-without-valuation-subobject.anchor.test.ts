/**
 * anchor — 일반건물이 `generalBuildingValuation` 서브객체 없이 도착하면 ⑫ 가 400 으로 막는다
 * (계획서 `docs/00-pm/gb-without-valuation-subobject.plan.md` Q-1 a·Q-2 a — `refineGbValuationPresent`)
 *
 * 수정 전(PR #2721 시점)에는 막지 않고 일반 경로로 계산했다 — 아래 `수정 전` 값이 그 침묵 세액이다.
 *
 * 컴패니언 상속·증여 × 추계 36셀(`gb-companion-required-refines-parity.plan.md` §10)을 측정하다 나온 상위 계열이다.
 *   · ④ 는 비-실가 파트의 취득시 기준시가가 비면 서브객체를 **통째로 생략**한다(`transfer-tax-api-gb.ts:364-366` — ⑧ 이 같은 입력을 막는다).
 *   · route 는 `propertyType === "general_building" && generalBuildingValuation` 일 때만 일반건물 엔진을 탄다(`route.ts:288`) — 없으면 일반 경로.
 *   · 스키마 주석(`transfer-tax-building-schemas.ts:136` 「일반건물 시 필수」)은 강제 코드가 아니다.
 * 수정 전: 서브객체 없는 일반건물은 주 자산·컴패니언 모두 200 + **다른 세액**이 나올 수 있었다(상속 실가 392,385,000 → 439,635,000).
 * 안전의 근거(수정 시 새 막다른 길이 없다): **⑧ 이 통과하는 일반건물은 항상 서브객체를 보낸다**(RS-1, 축소 격자 86셀).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody, newForm } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const BASE: Partial<AssetForm> = {
  assetKind: "general_building", addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: "1600000000",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false,
  acquisitionDate: "2010-05-01", useEstimatedAcquisition: false,
};
const gbAsset = (id: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, BASE, ...over) as AssetForm;
const landAsset = (id: number) =>
  ({
    ...makeDefaultAsset(id), addressJibun: "서울 강남구 테스트동 2-2", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2012-01-01",
    acquisitionArea: "100", transferArea: "100", landNature: "standalone", standardPriceAtAcq: "100000000", standardPriceAtTransfer: "200000000",
    actualSalePrice: "400000000", fixedAcquisitionPrice: "100000000",
  }) as unknown as AssetForm;
const bundle = (assets: AssetForm[]): TransferFormData => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", assets, assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000" });
  return f as unknown as TransferFormData;
};
type Role = "컴패니언" | "주 자산";
const ROLES: Role[] = ["컴패니언", "주 자산"];
const BG = {
  transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAcquisitionMethod: "converted",
} as unknown as Partial<AssetForm>;
const CAUSES: [string, Partial<AssetForm>][] = [
  ["매매", {}],
  ["건물신축", { gbBuildingAcquisitionCause: "newConstruction" }],
  ["부담부증여", BG],
  ["증여", { acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift" }],
  ["상속", { acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", landAcquisitionDate: "1988-05-01", acquisitionDate: "1988-05-01", decedentAcquisitionDate: "1970-01-01", publishedValueAtInheritance: "300000000", gbBuildingInheritedValue: "100000000" }],
];
const MODES: [string, Partial<AssetForm>][] = [["실가", {}], ["감정", { isAppraisalAcquisition: true }], ["매매사례", { isSalesCaseAcquisition: true }], ["환산", { useEstimatedAcquisition: true }]];
const pm = (m: Partial<AssetForm>) => (m.useEstimatedAcquisition ? "estimated" : m.isAppraisalAcquisition ? "appraisal" : m.isSalesCaseAcquisition ? "salesCase" : "actual");
function cell(cp: Partial<AssetForm>, mp: Partial<AssetForm>, sep: boolean, std: boolean, price = true): Partial<AssetForm> {
  const o: Partial<AssetForm> = { ...cp, ...mp, hasSeperateLandAcquisitionDate: sep };
  if (sep)
    Object.assign(o, { landAcquisitionDate: "2005-05-01", acquisitionDate: o.acquisitionDate ?? "2010-05-01", landAcqMode: pm(mp), buildingAcqMode: pm(mp),
      landAcquisitionPrice: price ? "400000000" : "", buildingAcquisitionPrice: price ? "200000000" : "", landSalesCaseValue: price ? "400000000" : "", buildingSalesCaseValue: price ? "200000000" : "" });
  else Object.assign(o, { fixedAcquisitionPrice: price ? "600000000" : "", similarSalesValue: price ? "600000000" : "" });
  if (!std) Object.assign(o, { gbAcqLandPricePerSqm: "", gbAcqBuildingValue: "" });
  return o;
}
const form = (role: Role, over: Partial<AssetForm>, bg = false) => {
  const gb = gbAsset(role === "컴패니언" ? 2 : 1, over);
  const other = bg ? gbAsset(role === "컴패니언" ? 1 : 2, over) : landAsset(role === "컴패니언" ? 1 : 2);
  return bundle(role === "컴패니언" ? [other, gb] : [gb, other]);
};
const post = async (b: unknown) => {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(b) }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  return { status: res.status, tax: res.status === 200 ? (j.data.aggregated.calculatedTax as number) : undefined };
};
/** 같은 입력을 서브객체 포함/제거 두 번 보낸다. */
async function withAndWithout(role: Role, over: Partial<AssetForm>) {
  const f = form(role, over);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = (await captureBody(f)) as any;
  const tgt = () => (role === "컴패니언" ? b.companionAssets[0] : b);
  const hadGbv = !!tgt().generalBuildingValuation;
  const blocked8 = allIssues(f).length > 0;
  const withGbv = await post(b);
  delete tgt().generalBuildingValuation;
  const without = await post(b);
  return { hadGbv, blocked8, withGbv, without };
}

describe("RS-1 ⑧ 이 통과하는 일반건물은 항상 서브객체를 보낸다 — 수정 시 새 막다른 길이 없다는 근거", () => {
  it("축소 격자 320셀: ⑧ 통과 86셀 모두 서브객체 있음", async () => {
    let n = 0; let pass8 = 0; const missing: string[] = [];
    for (const role of ROLES) for (const [cn, cp] of CAUSES) for (const sep of [false, true]) for (const [mn, mp] of MODES) for (const price of [true, false]) for (const std of [true, false]) {
      const f = form(role, cell(cp, mp, sep, std, price), cn === "부담부증여");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = (await captureBody(f)) as any;
      const has = !!(role === "컴패니언" ? b.companionAssets?.[0]?.generalBuildingValuation : b.generalBuildingValuation);
      n++;
      if (allIssues(f).length === 0) { pass8++; if (!has) missing.push(`${role}|${cn}|${sep}|${mn}|${price}|${std}`); }
    }
    expect([n, pass8, missing]).toEqual([320, 86, []]);
  }, 120_000);
});

describe("RS-2 서브객체 없는 ⑧ 차단 셀 — 주 자산·컴패니언 모두 전부 400", () => {
  it("96셀 전부 400 (수정 전: 200 이 49셀 — 주 자산 22 · 컴패니언 27)", async () => {
    const tally: Record<string, number> = {};
    for (const role of ROLES) for (const [cn, cp] of CAUSES) for (const sep of [false, true]) for (const [mn, mp] of MODES) for (const price of [true, false]) for (const std of [true, false]) {
      const over = cell(cp, mp, sep, std, price);
      const f = form(role, over, cn === "부담부증여");
      if (allIssues(f).length === 0) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = (await captureBody(f)) as any;
      if (role === "컴패니언" ? b.companionAssets?.[0]?.generalBuildingValuation : b.generalBuildingValuation) continue;
      const r = await post(b);
      tally[`${role}|${r.status}`] = (tally[`${role}|${r.status}`] ?? 0) + 1;
    }
    expect(tally).toEqual({ "컴패니언|400": 48, "주 자산|400": 48 });
  }, 120_000);
});

describe("RS-3 유효 입력에서 서브객체만 빼면 400 이다 (수정 전에는 세액이 달라졌다)", () => {
  /** [이름, 변형, 서브객체 있음 세액, 수정 전 서브객체 제거 세액("400" = 수정 전에도 막힘)] */
  const CASES: [string, Partial<AssetForm>, number, number | "400"][] = [
    ["상속 OFF 실가", cell(CAUSES[4][1], {}, false, true), 392_385_000, 439_635_000],
    ["매매 OFF 감정", cell(CAUSES[0][1], MODES[1][1], false, true), 344_598_900, 347_730_000],
    ["매매 OFF 매매사례", cell(CAUSES[0][1], MODES[2][1], false, true), 344_598_900, 347_730_000],
    ["매매 OFF 실가 — 같다", cell(CAUSES[0][1], {}, false, true), 347_730_000, 347_730_000],
    ["매매 OFF 환산 — 막힌다(일반 refine)", cell(CAUSES[0][1], MODES[3][1], false, true), 402_009_169, "400"],
  ];
  it.each(CASES)("%s", async (_n, over, withTax, withoutTax) => {
    // 컴패니언 위치의 매매사례는 ⑧ 이 「첫 번째 자산에서만」으로 막는다(계획서 V-5) — ⑧ 통과 유효 셀이 아니므로 주 자산만 본다.
    for (const role of _n.includes("매매사례") ? (["주 자산"] as Role[]) : ROLES) {
      const r = await withAndWithout(role, over);
      expect([r.hadGbv, r.blocked8, r.withGbv.status, r.withGbv.tax]).toEqual([true, false, 200, withTax]);
      expect(withoutTax).toBeDefined(); // 수정 전 값 기록 — 수정 후에는 모두 400
      expect([r.without.status, r.without.tax]).toEqual([400, undefined]);
    }
  });
});

describe("RS-4 컴패니언 상속·증여 × 추계 36셀의 대표 — 원인은 ④ 의 서브객체 생략 (취득시 기준시가 비움) · 수정 후 전부 400", () => {
  /** [이름, 변형, 컴패니언 [상태, 세액], 주 자산 [상태, 세액]] — 모두 ⑧ 차단. 주석 값은 수정 전 */
  const CELLS: [string, Partial<AssetForm>, [number, number | undefined], [number, number | undefined]][] = [
    ["상속 OFF 감정 · 기준시가 비움", cell(CAUSES[4][1], MODES[1][1], false, false), [400, undefined], [400, undefined]], // 수정 전 200·439,635,000 / 200·439,635,000
    ["상속 OFF 환산 · 기준시가 비움", cell(CAUSES[4][1], MODES[3][1], false, false), [400, undefined], [400, undefined]], // 수정 전 컴패니언 200·439,635,000
    ["증여 OFF 환산 · 기준시가 비움", cell(CAUSES[3][1], MODES[3][1], false, false), [400, undefined], [400, undefined]], // 수정 전 컴패니언 200·347,730,000
    ["상속 OFF 감정 · 기준시가 있음 (서브객체 있음)", cell(CAUSES[4][1], MODES[1][1], false, true), [400, undefined], [400, undefined]],
  ];
  it.each(CELLS)("%s", async (_n, over, comp, main) => {
    for (const [role, want] of [["컴패니언", comp], ["주 자산", main]] as const) {
      const f = form(role, over);
      expect(allIssues(f).length).toBeGreaterThan(0);
      const r = await post(await captureBody(f));
      expect([r.status, r.tax]).toEqual(want);
    }
  });
});

describe("RS-5 단건(묶음 아님) 일반건물 — 같은 규칙을 받는다 (계획서 V-1)", () => {
  const single = (over: Partial<AssetForm>) => {
    const f = newForm() as unknown as Record<string, unknown>;
    Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", contractTotalPrice: "1600000000", assets: [gbAsset(1, over)] });
    return f as unknown as TransferFormData;
  };
  it.each([
    ["매매 OFF 실가", cell(CAUSES[0][1], {}, false, true)],
    ["상속 OFF 실가", cell(CAUSES[4][1], {}, false, true)],
  ] as [string, Partial<AssetForm>][])("%s — 서브객체 있음 200 · 제거 400 (수정 전 제거 시 200)", async (_n, over) => {
    const f = single(over);
    expect(allIssues(f)).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = (await captureBody(f)) as any;
    expect(b.generalBuildingValuation).toBeTruthy();
    expect((await post(b)).status).toBe(200);
    delete b.generalBuildingValuation;
    expect((await post(b)).status).toBe(400);
  });
});
