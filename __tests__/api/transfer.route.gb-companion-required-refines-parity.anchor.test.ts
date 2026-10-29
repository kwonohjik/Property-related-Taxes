/**
 * anchor — 함께 양도 컴패니언 일반건물도 주 자산과 같은 ⑫ `refineGbPropertyRequired`(I3·X1·Z4·Z5·C1~C4)를 받는다
 * (계획서 `docs/00-pm/gb-companion-required-refines-parity.plan.md` Q-1 a)
 *
 * 수정 후: ⑧이 막는 입력을 API 로 직접 보내면 주 자산·컴패니언 **모두 400** 이다(`BLOCKED` 의 값은 수정 전 컴패니언 침묵 세액 — 회귀 방지 기록).
 * 수정 전(PR #2719 시점): **주 자산 위치는 400**, **컴패니언 위치는 200 + 침묵 값**이었다.
 *   · I3 분리 OFF 실가 — 일괄 취득가액 비움 → 취득가액 0 으로 계산(534,135,000 ≈ 1,000원 입력 534,134,685)
 *   · X1 증축 — 일괄 취득가액 비움 → 517,679,315 (6억이면 332,371,361)
 *   · Z4 — 취득시 토지 공시지가 비움 → 309,719,896 (있으면 347,730,000)
 *   · Z5 — 취득시 건물기준시가 비움 → 347,730,000 (이 시료는 토지·건물 취득일이 같아 세액이 같다 — 안분 비율만 기운다)
 *   · C — 이월과세 선언 + 이월과세 입력 없음 → 선언이 조용히 사라진다(347,730,000 = 선언 없는 세액)
 * 같은 입력의 주 자산은 모두 400 이었다.
 *
 * 변하지 않는 것: ⑧ 이 통과하는 입력은 두 위치 모두 200 (대조 셀), 부담부증여 묶음은 비워도 200.
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
const forms = (role: Role, gb: AssetForm): TransferFormData => bundle(role === "컴패니언" ? [landAsset(1), gb] : [gb, landAsset(2)]);

/** 본문을 만든 뒤 일반건물 서브객체에 patch 를 덮어 보낸다 — ④ 가 만들 수 없는 입력(이월과세 선언만 있고 입력 없음)을 직접 보낸다. */
async function run(role: Role, over: Partial<AssetForm>, gbvPatch: Record<string, unknown> = {}) {
  const form = forms(role, gbAsset(role === "컴패니언" ? 2 : 1, over));
  const issues8 = allIssues(form).map((x) => x.split(":")[1]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await captureBody(form)) as any;
  const tgt = role === "컴패니언" ? body.companionAssets[0] : body;
  Object.assign(tgt.generalBuildingValuation, gbvPatch);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  return { status: res.status, tax: res.status === 200 ? (j.data.aggregated.calculatedTax as number) : undefined, blocked8: issues8.length > 0, issues8 };
}

const EXT: Partial<AssetForm> = {
  gbHasExtension: true, gbExtensionDate: "2018-05-01", gbExtensionArea: "50", gbExtensionAcquisitionMode: "actual", gbExtensionAcquisitionCause: "purchase",
  gbExtensionActualAcquisitionPrice: "50000000", gbTransferExtensionBuildingStdPrice: "40000000", gbAcquisitionExtensionBuildingStdPrice: "30000000",
} as Partial<AssetForm>;
const BG = {
  transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAcquisitionMethod: "converted",
} as unknown as Partial<AssetForm>;

/** [이름, 자산 변형, 일반건물 서브객체 patch, 수정 전 컴패니언 침묵 [상태, 세액], ⑧ 차단 여부] — 주 자산 위치는 항상 400(차단 셀) */
const BLOCKED: [string, Partial<AssetForm>, Record<string, unknown>, [number, number], boolean][] = [
  ["I3 분리 OFF 실가 · 일괄 취득가액 비움", { fixedAcquisitionPrice: "" }, {}, [200, 534_135_000], true],
  ["X1 증축 · 일괄 취득가액 비움", { ...EXT, fixedAcquisitionPrice: "" }, {}, [200, 517_679_315], true],
  ["Z4 실가 6억 · 취득시 토지 공시지가 비움", { fixedAcquisitionPrice: "600000000", gbAcqLandPricePerSqm: "" }, {}, [200, 309_719_896], true],
  ["Z5 실가 6억 · 취득시 건물기준시가 비움", { fixedAcquisitionPrice: "600000000", gbAcqBuildingValue: "" }, {}, [200, 347_730_000], true],
  ["C 토지 이월과세 선언 · 입력 없음", { fixedAcquisitionPrice: "600000000" }, { landAcquisitionCause: "carryover_gift" }, [200, 347_730_000], false],
  ["C 건물 이월과세 선언 · 입력 없음", { fixedAcquisitionPrice: "600000000" }, { buildingAcquisitionCause: "carryover_gift" }, [200, 347_730_000], false],
];
describe("RP-1 컴패니언 일반건물 — 주 자산과 같은 ⑫ 보호를 받는다", () => {
  it.each(BLOCKED)("주 자산 위치 · %s → 400", async (_n, over, patch) => {
    const r = await run("주 자산", over, patch);
    expect(r.status).toBe(400);
  });
  it.each(BLOCKED)("컴패니언 위치 · %s → 400 (수정 전 침묵 세액은 위 주석)", async (_n, over, patch, _before, blocked8) => {
    const r = await run("컴패니언", over, patch);
    expect([r.status, r.tax]).toEqual([400, undefined]);
    expect(r.blocked8).toBe(blocked8);
  });
  it("I3 이슈는 사용자가 고칠 수 있는 칸(`companionAssets.0.fixedAcquisitionPrice`)을 가리킨다 (Q-2 a)", async () => {
    const form = forms("컴패니언", gbAsset(2, { fixedAcquisitionPrice: "" }));
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(form)) }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j = (await res.json()) as any;
    expect(Object.keys(j.error.fieldErrors)).toContain("companionAssets.0.fixedAcquisitionPrice");
  });
});

describe("RP-2 ⑧ 이 통과하는 대조 셀은 두 위치 모두 200 이고 세액이 같다", () => {
  const CONTROLS: [string, Partial<AssetForm>, number][] = [
    ["분리 OFF 실가 6억", { fixedAcquisitionPrice: "600000000" }, 347_730_000],
    ["분리 OFF 환산(일괄 취득가액 불필요)", { useEstimatedAcquisition: true }, 402_009_169],
    ["증축 · 일괄 6억", { ...EXT, fixedAcquisitionPrice: "600000000" }, 332_371_361],
  ];
  it.each(CONTROLS)("%s", async (_n, over, tax) => {
    for (const role of ["컴패니언", "주 자산"] as const) {
      const r = await run(role, over);
      expect([r.status, r.tax, r.blocked8]).toEqual([200, tax, false]);
    }
  });
  it("부담부증여 묶음은 일괄 취득가액을 비워도 200 (§159 가 정한다 — 수정 후에도 면제 유지)", async () => {
    const a = gbAsset(1, BG, { fixedAcquisitionPrice: "" });
    const b = gbAsset(2, BG, { fixedAcquisitionPrice: "" });
    const f = bundle([a, b]);
    expect(allIssues(f)).toEqual([]);
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(f)) }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j = (await res.json()) as any;
    expect([res.status, j.data.aggregated.calculatedTax]).toEqual([200, 178_762_436]);
  });
});

describe("RP-3 이미 대칭인 셀 — 건드릴 필요 없다", () => {
  it("Z4+Z5 둘 다 비움 · 감정가액 비움 → 두 위치 모두 400", async () => {
    for (const role of ["컴패니언", "주 자산"] as const) {
      expect((await run(role, { fixedAcquisitionPrice: "600000000", gbAcqLandPricePerSqm: "", gbAcqBuildingValue: "" })).status).toBe(400);
      expect((await run(role, { isAppraisalAcquisition: true, fixedAcquisitionPrice: "" })).status).toBe(400);
    }
  });
  it("I1 두 파트 상속 · 평가액 비움 — 두 위치 모두 400 (⑧ 도 막는다 · 종전 200 · 422,310,000 은 ④ 가 §164 가액으로 메운 것 — `gb-sec164-substitutes-blank-reported.plan.md`)", async () => {
    const INH: Partial<AssetForm> = {
      acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", landAcquisitionDate: "1988-05-01", acquisitionDate: "1988-05-01", decedentAcquisitionDate: "1970-01-01",
      landAcqMode: "actual", buildingAcqMode: "actual", publishedValueAtInheritance: "", gbBuildingInheritedValue: "100000000",
    } as Partial<AssetForm>;
    const out: [number, number | undefined, boolean][] = [];
    for (const role of ["컴패니언", "주 자산"] as const) {
      const r = await run(role, INH);
      out.push([r.status, r.tax, r.blocked8]);
    }
    expect(out).toEqual([[400, undefined, true], [400, undefined, true]]);
  });
});

/**
 * RP-4 격자 — 컴패니언 일반건물 ⑧↔⑫ 정합 (계획서 §6). 수정 전후 1,280셀(컴패니언·주 자산 × 취득원인 5 × 분리 2 × 취득방식 4 × 증축 × 자본적지출 × 가액 × 기준시가)을 대조해
 * 상태가 바뀐 셀 20개가 전부 「컴패니언 · ⑧ 차단 · 200→400」(매매·건물신축 실가, 가액 비움)이고 ⑧ 통과 셀은 한 개도 바뀌지 않았다. 여기서는 컴패니언 320셀로 그 불변식을 고정한다.
 */
describe("RP-4 컴패니언 격자 — ⑧ 통과 ⇒ ⑫ 200 · 이 함수가 맡는 차단 셀 ⇒ 400", () => {
  const CAUSES: [string, Partial<AssetForm>][] = [
    ["매매", {}],
    ["증여", { acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift" }],
    ["상속", { acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", landAcquisitionDate: "1988-05-01", acquisitionDate: "1988-05-01", decedentAcquisitionDate: "1970-01-01", publishedValueAtInheritance: "300000000", gbBuildingInheritedValue: "100000000" }],
    ["건물신축", { gbBuildingAcquisitionCause: "newConstruction" }],
    ["부담부증여", BG],
  ];
  const MODES: [string, Partial<AssetForm>][] = [["실가", {}], ["감정", { isAppraisalAcquisition: true }], ["매매사례", { isSalesCaseAcquisition: true }], ["환산", { useEstimatedAcquisition: true }]];
  const partMode = (m: Partial<AssetForm>) => (m.useEstimatedAcquisition ? "estimated" : m.isAppraisalAcquisition ? "appraisal" : m.isSalesCaseAcquisition ? "salesCase" : "actual");
  it("320셀", async () => {
    let n = 0;
    const violations: string[] = [];
    for (const [cn, cp] of CAUSES) for (const sep of [false, true]) for (const [mn, mp] of MODES) for (const ext of [false, true]) for (const price of [true, false]) for (const std of [true, false]) {
      const o: Partial<AssetForm> = { ...cp, ...mp, hasSeperateLandAcquisitionDate: sep };
      if (sep) Object.assign(o, { landAcquisitionDate: "2005-05-01", acquisitionDate: o.acquisitionDate ?? "2010-05-01", landAcqMode: partMode(mp), buildingAcqMode: partMode(mp), landAcquisitionPrice: price ? "400000000" : "", buildingAcquisitionPrice: price ? "200000000" : "", landSalesCaseValue: price ? "400000000" : "", buildingSalesCaseValue: price ? "200000000" : "" });
      else Object.assign(o, { fixedAcquisitionPrice: price ? "600000000" : "", similarSalesValue: price ? "600000000" : "" });
      if (ext) Object.assign(o, EXT);
      if (!std) Object.assign(o, { gbAcqLandPricePerSqm: "", gbAcqBuildingValue: "" });
      const gb = gbAsset(2, o);
      const other = cn === "부담부증여" ? gbAsset(1, o) : landAsset(1);
      const f = bundle([other, gb]);
      const blocked8 = allIssues(f).length > 0;
      const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(f)) }));
      const name = `${cn}|${sep ? "ON" : "OFF"}|${mn}|ext${+ext}|price${+price}|std${+std}`;
      if (!blocked8 && res.status !== 200) violations.push(`⑧통과인데 ${res.status}: ${name}`);
      // 이 함수가 맡는 셀: 매매·건물신축 · 실가 · 가액 비움 · 기준시가 있음 → ⑧ 차단이고 ⑫ 도 400
      if ((cn === "매매" || cn === "건물신축") && mn === "실가" && !price && std && (!blocked8 || res.status !== 400)) violations.push(`가액 비움 셀이 ⑫ 에서 안 막힘 ${res.status}: ${name}`);
      n++;
    }
    expect(n).toBe(320);
    expect(violations).toEqual([]);
  }, 120_000);
});
