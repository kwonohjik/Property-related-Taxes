/**
 * anchor — 함께 양도 컴패니언 일반건물에는 주 자산 ⑫ `refineGbPropertyRequired`(I3·X1·Z4·Z5·C1~C4)가 걸려 있지 않다
 * (계획서 `docs/00-pm/gb-companion-required-refines-parity.plan.md`)
 *
 * 현행 고정(수정 전): ⑧이 막는 입력을 API 로 직접 보내면 **주 자산 위치는 400**, **컴패니언 위치는 200 + 침묵 값**이다.
 *   · I3 분리 OFF 실가 — 일괄 취득가액 비움 → 취득가액 0 으로 계산(534,135,000 ≈ 1,000원 입력 534,134,685)
 *   · X1 증축 — 일괄 취득가액 비움 → 517,679,315 (6억이면 332,371,361)
 *   · Z4 — 취득시 토지 공시지가 비움 → 309,719,896 (있으면 347,730,000)
 *   · Z5 — 취득시 건물기준시가 비움 → 347,730,000 (이 시료는 토지·건물 취득일이 같아 세액이 같다 — 안분 비율만 기운다)
 *   · C — 이월과세 선언 + 이월과세 입력 없음 → 선언이 조용히 사라진다(347,730,000 = 선언 없는 세액)
 * 같은 입력의 주 자산은 모두 400. 수정 후에는 컴패니언 행이 400 으로 뒤집힌다(그때 이 파일의 `COMPANION_NOW` 를 400 으로 바꾼다).
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

/** [이름, 자산 변형, 일반건물 서브객체 patch, 컴패니언 현행 [상태, 세액], ⑧ 차단 여부] — 주 자산 위치는 항상 400(차단 셀) */
const BLOCKED: [string, Partial<AssetForm>, Record<string, unknown>, [number, number], boolean][] = [
  ["I3 분리 OFF 실가 · 일괄 취득가액 비움", { fixedAcquisitionPrice: "" }, {}, [200, 534_135_000], true],
  ["X1 증축 · 일괄 취득가액 비움", { ...EXT, fixedAcquisitionPrice: "" }, {}, [200, 517_679_315], true],
  ["Z4 실가 6억 · 취득시 토지 공시지가 비움", { fixedAcquisitionPrice: "600000000", gbAcqLandPricePerSqm: "" }, {}, [200, 309_719_896], true],
  ["Z5 실가 6억 · 취득시 건물기준시가 비움", { fixedAcquisitionPrice: "600000000", gbAcqBuildingValue: "" }, {}, [200, 347_730_000], true],
  ["C 토지 이월과세 선언 · 입력 없음", { fixedAcquisitionPrice: "600000000" }, { landAcquisitionCause: "carryover_gift" }, [200, 347_730_000], false],
  ["C 건물 이월과세 선언 · 입력 없음", { fixedAcquisitionPrice: "600000000" }, { buildingAcquisitionCause: "carryover_gift" }, [200, 347_730_000], false],
];
/** 컴패니언 위치가 현행에서 막지 못하는 셀 — 수정 후에는 모두 400 이어야 한다. 이 값만 바꾼다. */
const COMPANION_NOW = (c: [number, number]) => c;

describe("RP-1 컴패니언 일반건물 — 주 자산 ⑫ 보호가 없다 (현행 고정)", () => {
  it.each(BLOCKED)("주 자산 위치 · %s → 400", async (_n, over, patch) => {
    const r = await run("주 자산", over, patch);
    expect(r.status).toBe(400);
  });
  it.each(BLOCKED)("컴패니언 위치 · %s → 현행 200 + 침묵 세액", async (_n, over, patch, now, blocked8) => {
    const r = await run("컴패니언", over, patch);
    expect([r.status, r.tax]).toEqual(COMPANION_NOW(now));
    expect(r.blocked8).toBe(blocked8);
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
  it("I1 두 파트 상속 · 평가액 비움 — 두 위치 모두 200 (⑧ 은 막는다 · 주 자산 보호도 이 입력에서는 작동하지 않는다: 별건)", async () => {
    const INH: Partial<AssetForm> = {
      acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", landAcquisitionDate: "1988-05-01", acquisitionDate: "1988-05-01", decedentAcquisitionDate: "1970-01-01",
      landAcqMode: "actual", buildingAcqMode: "actual", publishedValueAtInheritance: "", gbBuildingInheritedValue: "100000000",
    } as Partial<AssetForm>;
    const out: [number, number | undefined, boolean][] = [];
    for (const role of ["컴패니언", "주 자산"] as const) {
      const r = await run(role, INH);
      out.push([r.status, r.tax, r.blocked8]);
    }
    expect(out).toEqual([[200, 422_310_000, true], [200, 422_310_000, true]]);
  });
});
