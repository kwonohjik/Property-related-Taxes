/**
 * 양도시 감정평가가액 «한쪽만 입력» · 「감정평가」 모드 + 금액 없음(V8-b) — ⑧↔⑫ 정합 (T-B1~T-B6).
 *
 * 쟁점: ⑧ V8(split `transfer-tax-validate-split-sale-std.ts` · 일반건물 `transfer-tax-validate-gb-sale.ts`)은 감정평가가액을 한쪽만 입력하면 막는데,
 * ⑫ Zod는 «양쪽일 때만» 분기하고 한쪽만·V8-b는 검사하지 않아 «화면은 막고 서버는 200»인 비대칭이 있었다(split 864셀 중 126셀 · V8-b 96셀 중 24셀 · 일반건물 384셀 중 48셀).
 * 엔진은 한쪽만 입력된 값을 쓰지 않고(`usableAppraisal` 불충분 → 기준시가 안분으로 후퇴) 일괄양도에서는 결과에 흔적도 남지 않아, 사용자는 입력이 폐기된 사실을 모른다
 * (자동 fallback 금지) — 그래서 ⑫를 ⑧에 맞춰 조였다. 겸용 ⑫(`appraisalOne`)는 이미 같은 짝 검사를 한다(선례).
 *
 * 기대값의 정본은 ⑫ route 응답(status·fieldErrors)이고, ⑧은 `collectStepIssues` 0·1단계 차단 여부다 — 같은 폼으로 나란히 돌린다.
 * 계획서: docs/00-pm/gb-and-one-side-appraisal-fe8-12-parity.plan.md
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { cAsset, cForm, bodyOf, routeOf, issuesOf } from "@/__tests__/calc/_helpers/split-carryover-c-form";
import { runMulti } from "@/__tests__/calc/_helpers/single-multi-route-parity";
import { partialAppraisal, usableAppraisal } from "@/lib/tax-engine/sale-split-apportion-basis";
import { generalBuildingShareSchema } from "@/lib/api/transfer-tax-building-schemas";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Std = "none" | "both" | "landOnly" | "bldOnly";
type App = "none" | "both" | "landOnly" | "bldOnly";
const LAND_APP = "landAppraisalAtTransfer";
const BLD_APP = "buildingAppraisalAtTransfer";
const DATES = ["2015-12-31", "2016-01-01", "2025-06-30"] as const;

const filingOf = (td: string) => (td < "2016" ? "2016-02-29" : td < "2026" ? "2026-02-28" : "2026-12-31");

/** 주택 split(토지·건물 취득일 다름) 자산 시드. */
const splitAsset = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2005-06-01",
    landAcquisitionDate: "2003-06-01",
    hasSeperateLandAcquisitionDate: true,
    actualSalePrice: "1,500,000,000",
    standardPricePerSqmAtAcq: "1,000,000",
    acquisitionArea: "100",
    buildingStandardPriceAtAcq: "100,000,000",
    landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "250,000,000",
    ...over,
  }) as never;

function stdOver(std: Std): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (std === "both" || std === "landOnly") o.landStandardPriceAtTransfer = "900,000,000";
  if (std === "both" || std === "bldOnly") o.buildingStandardPriceAtTransfer = "600,000,000";
  return o;
}
function appOver(app: App): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (app === "both" || app === "landOnly") o[LAND_APP] = "1,100,000,000";
  if (app === "both" || app === "bldOnly") o[BLD_APP] = "400,000,000";
  return o;
}

const splitForm = (td: string, over: Record<string, unknown>): TransferFormData =>
  cForm({ transferDate: td, filingDate: filingOf(td), contractTotalPrice: "1500000000" } as never, splitAsset(over));

/** ⑧ 차단 여부 + ⑫ 상태·오류 키를 같은 폼으로 얻는다. */
async function both(form: TransferFormData) {
  const i8 = issuesOf(form);
  const r = await routeOf(POST as never, await bodyOf(form));
  return { blocked8: i8.length > 0, i8, st12: r.status, keys12: Object.keys(r.fieldErrors), json: r.json };
}

// ── 일반건물 시드 ────────────────────────────────────────────────────────────
const gbAsset = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    addressJibun: "서울 강남구 테스트동 1-1",
    acquisitionCause: "purchase",
    acquisitionDate: "2005-03-01",
    landAcquisitionDate: "1999-05-24",
    hasSeperateLandAcquisitionDate: true,
    gbBuildingAcquisitionCause: "purchase",
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "90.48",
    gbZoneType: "commercial",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbAcqLandPricePerSqm: "1500000",
    gbAcqBuildingValue: "28144700",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "400000000",
    ownershipNumerator: "100",
    ownershipDenominator: "100",
    ...over,
  }) as never;

const gbForm = (td: string, over: Record<string, unknown>): TransferFormData =>
  cForm({ transferDate: td, filingDate: td < "2016" ? "2016-02-29" : "2017-02-28", contractTotalPrice: "2000000000" } as never, gbAsset(over));

function gbAppOver(app: App): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (app === "both" || app === "landOnly") o[LAND_APP] = "1,400,000,000";
  if (app === "both" || app === "bldOnly") o[BLD_APP] = "600,000,000";
  return o;
}

describe("술어 — partialAppraisal은 엔진 후퇴(usableAppraisal 불충분)와 같은 사실", () => {
  const cases: [string, { land: number; building: number } | undefined, boolean, boolean][] = [
    ["없음(undefined)", undefined, false, false],
    ["둘 다 0", { land: 0, building: 0 }, false, false],
    ["토지만", { land: 1, building: 0 }, true, false],
    ["건물만", { land: 0, building: 1 }, true, false],
    ["양쪽", { land: 1, building: 1 }, false, true],
    ["음수 섞임(토지만 양수)", { land: 5, building: -1 }, true, false],
  ];
  for (const [name, pair, partial, usable] of cases) {
    it(name, () => {
      expect(partialAppraisal(pair)).toBe(partial);
      expect(usableAppraisal(pair)).toBe(usable);
      // 불변식: 한쪽만이면 쓸 수 없고, 쓸 수 있으면 한쪽만이 아니다
      expect(partial && usable).toBe(false);
    });
  }
});

describe("T-B1 · split 864셀 — 양도일 3종 × 구분 방식 × 취득 모드 × 감정평가 4종 × 구분 기재 × 기준시가: ⑧ 차단 ⇔ ⑫ 400", () => {
  type Cell = { td: string; sm: string; lm: string; bm: string; app: App; price: string; std: Std; blocked8: boolean; st12: number; keys12: string[] };
  const cells: Cell[] = [];

  it("864셀 수집", async () => {
    for (const td of DATES)
      for (const sm of ["actual", "apportioned", "appraisal"])
        for (const [lm, bm] of [["actual", "actual"], ["estimated", "actual"], ["actual", "estimated"], ["estimated", "estimated"]])
          for (const app of ["none", "both", "landOnly", "bldOnly"] as const)
            for (const price of ["priced", "unpriced"])
              for (const std of ["none", "both", "landOnly", "bldOnly"] as const) {
                if (sm === "appraisal" && app === "none") continue; // V8-b 전용 격자(T-B5)
                if (sm === "apportioned" && price === "priced") continue; // 일괄양도는 양도가액 구분 칸이 없다
                const over: Record<string, unknown> = {
                  saleSplitMode: sm,
                  landAcqMode: lm,
                  buildingAcqMode: bm,
                  landAcquisitionPrice: lm === "actual" ? "300,000,000" : "",
                  buildingAcquisitionPrice: bm === "actual" ? "250,000,000" : "",
                  ...stdOver(std),
                  ...appOver(app),
                };
                if (price === "priced") {
                  over.landTransferPrice = "1,200,000,000";
                  over.buildingTransferPrice = "300,000,000";
                }
                const r = await both(splitForm(td, over));
                cells.push({ td, sm, lm, bm, app, price, std, blocked8: r.blocked8, st12: r.st12, keys12: r.keys12 });
              }
    expect(cells.length).toBe(864);
  }, 900_000);

  it("전 864셀: ⑧ 차단 ⇔ ⑫ 400 (양방향 정합) · 비공허", () => {
    const mismatch = cells.filter((c) => c.blocked8 !== (c.st12 === 400));
    expect(mismatch.length, JSON.stringify(mismatch.slice(0, 3))).toBe(0);
    const blocked = cells.filter((c) => c.blocked8).length;
    expect(blocked).toBeGreaterThanOrEqual(600);
    expect(cells.length - blocked).toBeGreaterThanOrEqual(170);
  });

  it("한쪽만 입력 480셀은 전부 ⑧ 차단 ∧ ⑫ 400 (수정 전 126셀이 ⑫ 200이었다)", () => {
    const one = cells.filter((c) => c.app === "landOnly" || c.app === "bldOnly");
    expect(one.length).toBe(480);
    expect(one.filter((c) => !c.blocked8)).toEqual([]);
    const leak = one.filter((c) => c.st12 !== 400);
    expect(leak.length, JSON.stringify(leak.slice(0, 3))).toBe(0);
  });

  it("T-B2 · 한쪽만 + 기준시가 양쪽(수정 전 «⑧ 차단 ∧ ⑫ 200»의 주 구간): 오류 키가 정확히 누락된 쪽 하나", () => {
    const sub = cells.filter((c) => (c.app === "landOnly" || c.app === "bldOnly") && c.std === "both");
    expect(sub.length).toBeGreaterThanOrEqual(60);
    for (const td of DATES) expect(sub.some((c) => c.td === td)).toBe(true); // 양도일 3종 모두
    for (const c of sub) {
      expect(c.st12, `${c.td}/${c.sm}/${c.app}`).toBe(400);
      expect(c.keys12, `${c.td}/${c.sm}/${c.lm}${c.bm}/${c.app}`).toEqual([c.app === "landOnly" ? BLD_APP : LAND_APP]);
    }
    expect(sub.some((c) => c.app === "landOnly")).toBe(true);
    expect(sub.some((c) => c.app === "bldOnly")).toBe(true);
  });

  it("T-B6 · 양쪽·없음은 영향 0 — 새 감정평가 키 오류는 한쪽만 입력 셀에서만 난다 · 양쪽+환산 없음은 기준시가와 무관하게 통과", () => {
    const sub = cells.filter((c) => c.app === "both" && c.lm === "actual" && c.bm === "actual");
    expect(sub.length).toBeGreaterThan(0);
    expect(sub.every((c) => !c.blocked8 && c.st12 === 200)).toBe(true);
    expect(cells.filter((c) => c.app === "both").every((c) => !c.keys12.includes(LAND_APP) && !c.keys12.includes(BLD_APP))).toBe(true);
    expect(cells.filter((c) => c.app === "none").every((c) => !c.keys12.includes(LAND_APP) && !c.keys12.includes(BLD_APP))).toBe(true);
  });
});

describe("T-B5 · V8-b — 「감정평가」 모드 + 감정평가 금액 없음(split 96셀): ⑧ 차단 ⇔ ⑫ 400", () => {
  it("96셀 전수 + 오류 키 landAppraisalAtTransfer", async () => {
    type C = { td: string; lm: string; bm: string; price: string; std: Std; blocked8: boolean; st12: number; keys12: string[] };
    const cells: C[] = [];
    for (const td of DATES)
      for (const [lm, bm] of [["actual", "actual"], ["estimated", "actual"], ["actual", "estimated"], ["estimated", "estimated"]])
        for (const price of ["priced", "unpriced"])
          for (const std of ["none", "both", "landOnly", "bldOnly"] as const) {
            const over: Record<string, unknown> = {
              saleSplitMode: "appraisal",
              landAcqMode: lm,
              buildingAcqMode: bm,
              landAcquisitionPrice: lm === "actual" ? "300,000,000" : "",
              buildingAcquisitionPrice: bm === "actual" ? "250,000,000" : "",
              ...stdOver(std),
            };
            if (price === "priced") {
              over.landTransferPrice = "1,200,000,000";
              over.buildingTransferPrice = "300,000,000";
            }
            const r = await both(splitForm(td, over));
            cells.push({ td, lm, bm, price, std, blocked8: r.blocked8, st12: r.st12, keys12: r.keys12 });
          }
    expect(cells.length).toBe(96);
    expect(cells.filter((c) => !c.blocked8)).toEqual([]); // ⑧은 96/96 차단
    const leak = cells.filter((c) => c.st12 !== 400);
    expect(leak.length, JSON.stringify(leak.slice(0, 3))).toBe(0);
    expect(cells.every((c) => c.keys12.includes(LAND_APP))).toBe(true);
  }, 600_000);

  it("saleSplitMode가 «appraisal»이 아니면 금액이 없어도 ⑫ 거울은 걸리지 않는다(actual·apportioned)", async () => {
    for (const sm of ["actual", "apportioned"]) {
      const over: Record<string, unknown> = { saleSplitMode: sm, landAcqMode: "actual", buildingAcqMode: "actual", ...stdOver("both") };
      if (sm === "actual") Object.assign(over, { landTransferPrice: "1,200,000,000", buildingTransferPrice: "300,000,000" });
      const r = await both(splitForm("2025-06-30", over));
      expect(r.st12, `${sm} ${JSON.stringify(r.keys12)}`).toBe(200);
      expect(r.blocked8).toBe(false);
    }
  });
});

describe("T-B3 · 다건 route · 컴패니언 · 파트 이월과세 C — 같은 400이 닿는다", () => {
  it("다건 route: 한쪽만 입력 1건 → 400, 양쪽이면 200", async () => {
    const ok = splitForm("2025-06-30", { saleSplitMode: "appraisal", landAcqMode: "actual", buildingAcqMode: "actual", ...stdOver("both"), ...appOver("both") });
    const one = splitForm("2025-06-30", { saleSplitMode: "appraisal", landAcqMode: "actual", buildingAcqMode: "actual", ...stdOver("both"), ...appOver("landOnly") });
    expect(issuesOf(one).length).toBeGreaterThan(0);
    expect(issuesOf(ok).length).toBe(0);
    const mOk = await runMulti([ok]);
    expect(mOk.status, JSON.stringify((mOk.json as { error?: unknown }).error)).toBe(200);
    const mOne = await runMulti([one]);
    expect(mOne.status).toBe(400);
    expect(JSON.stringify(mOne.json)).toContain(BLD_APP);
  });

  it("컴패니언(함께 양도) split 자산: 한쪽만 입력 → ⑧ 차단 ∧ ⑫ 400 · key가 companionAssets.0.*", async () => {
    const plain = {
      ...makeDefaultAsset(1),
      addressJibun: "서울 강남구 테스트동 9-9",
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2008-03-02",
      fixedAcquisitionPrice: "300,000,000",
      actualSalePrice: "400,000,000",
    } as never;
    const mk = (app: App) => {
      const comp = splitAsset({ saleSplitMode: "apportioned", landAcqMode: "actual", buildingAcqMode: "actual", fixedAcquisitionPrice: "550,000,000", ...stdOver("both"), ...appOver(app) });
      return cForm({ transferDate: "2025-06-30", filingDate: "2026-02-28", assets: [plain, comp], contractTotalPrice: "1900000000", bundledSaleMode: "actual" } as never, plain);
    };
    const okR = await both(mk("both"));
    expect(okR.i8.length).toBe(0);
    expect(okR.st12, JSON.stringify(okR.keys12)).toBe(200);
    for (const [app, missing] of [["landOnly", BLD_APP], ["bldOnly", LAND_APP]] as const) {
      const r = await both(mk(app));
      expect(r.blocked8, app).toBe(true);
      expect(r.st12, app).toBe(400);
      expect(r.keys12, app).toContain(`companionAssets.0.${missing}`);
    }
  });

  it("파트 이월과세 C(증여자 환산 없음): 한쪽만 입력 → ⑧ 차단 ∧ ⑫ 400, 양쪽이면 둘 다 통과", async () => {
    for (const [app, blocked] of [["both", false], ["none", false], ["landOnly", true], ["bldOnly", true]] as const) {
      const over: Record<string, unknown> = {};
      if (app === "both" || app === "landOnly") over[LAND_APP] = "700,000,000";
      if (app === "both" || app === "bldOnly") over[BLD_APP] = "500,000,000";
      const r = await both(cForm({ transferDate: "2025-06-30", filingDate: "2025-08-31" } as never, cAsset(over)));
      expect(r.blocked8, `⑧ ${app}`).toBe(blocked);
      expect(r.st12 === 400, `⑫ ${app} ${r.st12} ${JSON.stringify(r.keys12)}`).toBe(blocked);
    }
  });
});

describe("T-B4 · 일반건물 384셀 — 양도일 2 × 취득(실가/환산) × 양도가액 3종 × 감정평가 4종 × 기준시가 4종 × 양도비 2: ⑧ 차단 ⇔ ⑫ 400", () => {
  type Cell = { td: string; acq: string; sale: string; app: App; std: Std; exp: string; blocked8: boolean; st12: number; keys12: string[] };
  const cells: Cell[] = [];

  it("384셀 수집 (⑫ 판정은 기준시가 결측 body를 직접 만들어 route에 보낸다 — ④는 기준시가 결측 시 payload를 drop한다)", async () => {
    for (const td of ["2015-12-31", "2016-01-01"])
      for (const acq of ["actual", "estimated"])
        for (const sale of ["actualPriced", "apportioned", "appraisal"])
          for (const app of ["none", "both", "landOnly", "bldOnly"] as const)
            for (const std of ["none", "both", "landOnly", "bldOnly"] as Std[])
              for (const exp of ["0", "5,000,000"]) {
                const over: Record<string, unknown> = { transferExpense: exp, ...gbAppOver(app) };
                if (acq === "estimated")
                  Object.assign(over, { landAcqMode: "estimated", buildingAcqMode: "estimated", useEstimatedAcquisition: true, landAcquisitionPrice: "", buildingAcquisitionPrice: "" });
                over.saleSplitMode = sale === "actualPriced" ? "actual" : sale;
                if (sale === "actualPriced") {
                  over.landTransferPrice = "1,500,000,000";
                  over.buildingTransferPrice = "500,000,000";
                }
                over.gbTransferLandPricePerSqm = std === "both" || std === "landOnly" ? "10830000" : "";
                over.gbTransferBuildingValue = std === "both" || std === "bldOnly" ? "20629440" : "";
                const form = gbForm(td, over);
                let blocked8 = false;
                try {
                  blocked8 = issuesOf(form).length > 0;
                } catch {
                  blocked8 = true;
                }
                // ⑫: 기준시가를 모두 채운 폼의 body에서 결측 기준시가 키만 지운다
                const full = await bodyOf(gbForm(td, { ...over, gbTransferLandPricePerSqm: "10830000", gbTransferBuildingValue: "20629440" }));
                const gbv = { ...(full.generalBuildingValuation as Record<string, unknown>) };
                if (std === "none" || std === "bldOnly") delete gbv.transferLandPricePerSqm;
                if (std === "none" || std === "landOnly") delete gbv.transferBuildingStdPrice;
                const r = await routeOf(POST as never, { ...full, generalBuildingValuation: gbv });
                cells.push({ td, acq, sale, app, std, exp, blocked8, st12: r.status, keys12: Object.keys(r.fieldErrors) });
              }
    expect(cells.length).toBe(384);
  }, 900_000);

  it("전 384셀: ⑧ 차단 ⇔ ⑫ 400 · 비공허 (통과 ∧ 200 = 48 · 차단 ∧ 400 = 336)", () => {
    const mismatch = cells.filter((c) => c.blocked8 !== (c.st12 === 400));
    expect(mismatch.length, JSON.stringify(mismatch.slice(0, 3))).toBe(0);
    const blocked = cells.filter((c) => c.blocked8).length;
    expect(cells.length - blocked).toBe(48);
    expect(blocked).toBe(336);
  });

  it("한쪽만 입력 + 기준시가 양쪽 48셀: ⑫ 400이고 키가 generalBuildingValuation.<누락 쪽> 하나", () => {
    const sub = cells.filter((c) => (c.app === "landOnly" || c.app === "bldOnly") && c.std === "both");
    expect(sub.length).toBe(48);
    for (const c of sub) {
      expect(c.st12, `${c.td}/${c.acq}/${c.sale}/${c.app}`).toBe(400);
      expect(c.keys12, `${c.td}/${c.acq}/${c.sale}/${c.app}`).toEqual([`generalBuildingValuation.${c.app === "landOnly" ? BLD_APP : LAND_APP}`]);
    }
  });

  it("일반건물 지분 카드(generalBuildingShareSchema): 한쪽만 → valuation.<누락 쪽> issue, 양쪽·없음은 이 사유 없음", async () => {
    const full = await bodyOf(gbForm("2025-06-30", { saleSplitMode: "apportioned", ...gbAppOver("both") }));
    const base = full.generalBuildingValuation as Record<string, unknown>;
    const mkShare = (valuation: Record<string, unknown>) => ({ shareId: "s1", shareLabel: "지분1", ownershipRatio: 1, acquisitionDate: "1999-05-24", valuation });
    const strip = (keys: string[]) => {
      const v = { ...base };
      for (const k of keys) delete v[k];
      return v;
    };
    const keysOf = (valuation: Record<string, unknown>) => {
      const r = generalBuildingShareSchema.safeParse(mkShare(valuation));
      return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    };
    expect(keysOf(strip([BLD_APP]))).toContain(`valuation.${BLD_APP}`);
    expect(keysOf(strip([LAND_APP]))).toContain(`valuation.${LAND_APP}`);
    expect(keysOf(strip([]))).not.toContain(`valuation.${BLD_APP}`);
    expect(keysOf(strip([LAND_APP, BLD_APP]))).not.toContain(`valuation.${LAND_APP}`);
  });
});
