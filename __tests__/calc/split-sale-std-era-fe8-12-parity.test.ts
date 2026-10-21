/**
 * 토지·건물 구분 기재(split) 양도시 기준시가 V7 — 양도일 2016.1.1. 전 ⑧↔⑫ 정합 (T-1~T-9).
 *
 * 쟁점: 양도일이 2016.1.1. 전이고 구분 기재(`saleSplitMode: "actual"`)이며 환산 파트가 없으면 ⑧(`saleStdPriceWaivedByEra`)은 양도시
 * 토지·건물 기준시가를 면제하는데, ⑫ Zod refine V7이 연혁을 보지 않고 무조건 요구해 «화면 통과 → 서버 400»이 났다.
 * 엔진은 그 구간에서 기준시가를 쓰지 않으므로(T-6) ⑫를 ⑧과 같은 술어로 좁혔다.
 *
 * 기대값의 정본은 ⑫ route 응답(status·fieldErrors)이고, ⑧은 `collectStepIssues` 0·1단계 차단 여부다 — 두 쪽을 같은 폼으로 나란히 돌린다.
 * 계획서: docs/00-pm/split-v7-pre2016-fe8-12-parity.plan.md
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

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Std = "none" | "both" | "landOnly" | "bldOnly";
const LAND_KEY = "landStandardPriceAtTransfer";
const BLD_KEY = "buildingStandardPriceAtTransfer";

/** 주택 split(토지·건물 취득일 다름) 자산 시드 — 양도시 기준시가·양도가액 구분·환산 여부는 `over`로 바꾼다. */
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
  if (std === "both" || std === "landOnly") o[LAND_KEY] = "900,000,000";
  if (std === "both" || std === "bldOnly") o[BLD_KEY] = "600,000,000";
  return o;
}

const SALE_ACTUAL = { saleSplitMode: "actual", landTransferPrice: "1,200,000,000", buildingTransferPrice: "300,000,000" };

const formOf = (td: string, over: Record<string, unknown>, filing = "2026-02-28"): TransferFormData =>
  cForm({ transferDate: td, filingDate: filing, contractTotalPrice: "1500000000" } as never, splitAsset(over));

/** ⑧ 차단 여부 + ⑫ 상태·오류 키를 같은 폼으로 얻는다. */
async function both(form: TransferFormData) {
  const i8 = issuesOf(form);
  const r = await routeOf(POST as never, await bodyOf(form));
  return { blocked8: i8.length > 0, i8, st12: r.status, keys12: Object.keys(r.fieldErrors), json: r.json };
}

const EARLY = "2015-12-31"; // §100③ 본문 시행(2016.1.1.) 전 마지막 날
const FIRST = "2016-01-01"; // 시행 첫날

describe("T-1 · 모순 3셀(양도일 2015-12-31 · 구분 기재 · 실가/실가 · 기준시가 없음/토지만/건물만) — ⑧ 통과 ∧ ⑫ 200", () => {
  for (const std of ["none", "landOnly", "bldOnly"] as const) {
    it(`기준시가 ${std}`, async () => {
      const r = await both(formOf(EARLY, { ...SALE_ACTUAL, landAcqMode: "actual", buildingAcqMode: "actual", ...stdOver(std) }, "2016-02-29"));
      expect(r.i8.length).toBe(0);
      expect(r.st12, JSON.stringify(r.keys12)).toBe(200);
    });
  }
});

describe("T-2 · 같은 입력의 경계 첫날(2016-01-01) — ⑧ 차단 ∧ ⑫ 400 + 짚는 칸", () => {
  const expectKeys: Record<string, string[]> = { none: [LAND_KEY, BLD_KEY], landOnly: [BLD_KEY], bldOnly: [LAND_KEY] };
  for (const std of ["none", "landOnly", "bldOnly"] as const) {
    it(`기준시가 ${std}`, async () => {
      const r = await both(formOf(FIRST, { ...SALE_ACTUAL, landAcqMode: "actual", buildingAcqMode: "actual", ...stdOver(std) }));
      expect(r.blocked8).toBe(true);
      expect(r.st12).toBe(400);
      expect(r.keys12.sort()).toEqual(expectKeys[std].sort());
    });
  }
});

describe("T-3 · 다건·컴패니언·파트 이월과세 C(실가) — 같은 술어가 닿는다", () => {
  it("다건 route: 같은 폼 1건이 200", async () => {
    const f = formOf(EARLY, { ...SALE_ACTUAL, landAcqMode: "actual", buildingAcqMode: "actual" }, "2016-02-29");
    expect(issuesOf(f).length).toBe(0);
    const m = await runMulti([f]);
    expect(m.status, JSON.stringify((m.json as { error?: unknown }).error)).toBe(200);
  });

  it("컴패니언(함께 양도) split 자산: ⑧ 통과 ∧ ⑫ 200 · 같은 입력 2016-01-01은 ⑫ 400이고 key가 companionAssets.0.*", async () => {
    const plain = {
      ...makeDefaultAsset(1),
      addressJibun: "서울 강남구 테스트동 9-9",
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2008-03-02",
      fixedAcquisitionPrice: "300,000,000",
      actualSalePrice: "400,000,000",
    } as never;
    const comp = splitAsset({ ...SALE_ACTUAL, landAcqMode: "actual", buildingAcqMode: "actual", fixedAcquisitionPrice: "550,000,000" });
    const mk = (td: string, filing: string) =>
      cForm({ transferDate: td, filingDate: filing, assets: [plain, comp], contractTotalPrice: "1900000000", bundledSaleMode: "actual" } as never, plain);
    const early = await both(mk(EARLY, "2016-02-29"));
    expect(early.i8.length).toBe(0);
    expect(early.st12, JSON.stringify(early.keys12)).toBe(200);
    const first = await both(mk(FIRST, "2017-02-28"));
    expect(first.blocked8).toBe(true);
    expect(first.st12).toBe(400);
    expect(first.keys12.some((k) => k.startsWith("companionAssets.0.") && k.endsWith("StandardPriceAtTransfer"))).toBe(true);
  });

  it("파트 이월과세 C(양도일 2015-09-30 · 증여자 취득가액 입력=환산 아님 · 기준시가 두 칸 비움): ⑧ 통과 ∧ ⑫ 200", async () => {
    const a = cAsset({
      [LAND_KEY]: "",
      [BLD_KEY]: "",
      landCarryover: { ...cAsset().landCarryover, donorAcquisitionDate: "1995-03-01", donorAcquisitionPrice: "50,000,000" },
      carryover: { ...cAsset().carryover, giftRegistryDate: "2012-03-01", donorAcquisitionDate: "2008-06-01" },
    });
    const r = await both(cForm({ transferDate: "2015-09-30", filingDate: "2015-11-30" } as never, a));
    expect(r.i8.length).toBe(0);
    expect(r.st12, JSON.stringify(r.keys12)).toBe(200);
  });
});

describe("T-5 · 환산 파트 반례(토지 환산 · 건물 환산 · 증여자 환산 토지/건물) × 2015-12-31 — 면제 안 됨: ⑧ 차단 ⇔ ⑫ 400", () => {
  const stds: Std[] = ["none", "landOnly", "bldOnly", "both"];

  for (const [name, over] of [
    ["토지 환산", { landAcqMode: "estimated", landAcquisitionPrice: "", buildingAcqMode: "actual" }],
    ["건물 환산", { landAcqMode: "actual", buildingAcqMode: "estimated", buildingAcquisitionPrice: "" }],
  ] as const) {
    it(`${name}: 기준시가가 하나라도 비면 둘 다 차단, 양쪽이면 둘 다 통과`, async () => {
      for (const std of stds) {
        const r = await both(formOf(EARLY, { ...SALE_ACTUAL, ...over, ...stdOver(std) }, "2016-02-29"));
        expect(r.blocked8, `${name}/${std} ⑧`).toBe(std !== "both");
        expect(r.st12 === 400, `${name}/${std} ⑫ ${r.st12}`).toBe(std !== "both");
      }
    });
  }

  for (const part of ["land", "building"] as const) {
    it(`증여자 환산(파트 이월과세 ${part === "land" ? "토지" : "건물"} 파트 환산): 기준시가 {없음·토지만·건물만}은 둘 다 차단, 양쪽이면 둘 다 통과`, async () => {
      const cases: [string, string, boolean][] = [["", "", true], ["700,000,000", "", true], ["", "500,000,000", true], ["700,000,000", "500,000,000", false]];
      const est = { partEstimated: true, donorAcquisitionPrice: "", donorStandardPriceAtAcquisition: "30,000,000" };
      for (const [ls, bs, blocked] of cases) {
        const base = cAsset();
        const a = cAsset({
          [LAND_KEY]: ls,
          [BLD_KEY]: bs,
          landCarryover: { ...base.landCarryover, donorAcquisitionDate: "1995-03-01", ...(part === "land" ? est : {}) },
          carryover: { ...base.carryover, giftRegistryDate: "2012-03-01", donorAcquisitionDate: "2008-06-01", ...(part === "building" ? est : {}) },
        });
        const r = await both(cForm({ transferDate: "2015-09-30", filingDate: "2015-11-30" } as never, a));
        expect(r.blocked8, `⑧ ${part} ${ls}/${bs}`).toBe(blocked);
        expect(r.st12 === 400, `⑫ ${part} ${ls}/${bs} ${r.st12} ${JSON.stringify(r.keys12)}`).toBe(blocked);
      }
    });
  }
});

describe("T-6 · 세액 불변 — 이 구간에서 엔진은 양도시 기준시가를 쓰지 않는다", () => {
  it("기준시가 없음 vs 양쪽 있음: totalTax 동일(상호 비교, 하드코딩 없음)", async () => {
    const mk = (std: Std) => formOf(EARLY, { ...SALE_ACTUAL, landAcqMode: "actual", buildingAcqMode: "actual", ...stdOver(std) }, "2016-02-29");
    const a = await both(mk("none"));
    const b = await both(mk("both"));
    expect(a.st12).toBe(200);
    expect(b.st12).toBe(200);
    const ta = a.json?.data?.result?.totalTax;
    const tb = b.json?.data?.result?.totalTax;
    expect(typeof ta).toBe("number");
    expect(ta).toBeGreaterThan(0);
    expect(ta).toBe(tb);
    expect(a.json?.data?.result?.splitDetail?.saleSplitJudgment?.deemedUnclear).toBe(false);
  });
});

describe("T-7 · 면제 구간에서도 구분 근거 전무는 막힌다(자동 안분 fallback 금지)", () => {
  it("구분 기재인데 파트 양도가액도 기준시가도 없음 → ⑧ 차단 ∧ ⑫ 400(landTransferPrice)", async () => {
    const r = await both(formOf(EARLY, { saleSplitMode: "actual", landAcqMode: "actual", buildingAcqMode: "actual" }, "2016-02-29"));
    expect(r.blocked8).toBe(true);
    expect(r.st12).toBe(400);
    expect(r.keys12).toContain("landTransferPrice");
  });
});

describe("T-9 · saleSplitMode 생략 직접 API — fail-closed(현행 유지)", () => {
  it("2015-12-31이어도 면제 안 됨 → ⑫ 400(양도시 기준시가 두 칸)", async () => {
    const form = formOf(EARLY, { ...SALE_ACTUAL, landAcqMode: "actual", buildingAcqMode: "actual" }, "2016-02-29");
    const body = await bodyOf(form);
    delete body.saleSplitMode;
    const r = await routeOf(POST as never, body);
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors).sort()).toEqual([BLD_KEY, LAND_KEY].sort());
  });
});

describe("T-4 · 격자 정합 — 양도일{2015-12-31, 2016-01-01} × 구분 방식 × 취득 모드 × 감정평가 × 구분 기재 × 기준시가", () => {
  type Cell = { td: string; sm: string; lm: string; bm: string; app: "noApp" | "bothApp"; price: string; std: Std; blocked8: boolean; st12: number };
  const cells: Cell[] = [];

  it("256셀 수집", async () => {
    for (const td of [EARLY, FIRST])
      for (const sm of ["actual", "apportioned", "appraisal"])
        for (const [lm, bm] of [["actual", "actual"], ["estimated", "actual"], ["actual", "estimated"], ["estimated", "estimated"]])
          for (const app of ["noApp", "bothApp"] as const)
            for (const price of ["priced", "unpriced"])
              for (const std of ["none", "both", "landOnly", "bldOnly"] as const) {
                if (sm === "appraisal" && app === "noApp") continue; // 감정평가 방식은 감정가액 양쪽이 전제
                if (sm === "apportioned" && price === "priced") continue; // 일괄양도는 양도가액 구분 칸이 없다
                const over: Record<string, unknown> = {
                  saleSplitMode: sm,
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
                if (app === "bothApp") {
                  over.landAppraisalAtTransfer = "1,100,000,000";
                  over.buildingAppraisalAtTransfer = "400,000,000";
                }
                const r = await both(formOf(td, over));
                cells.push({ td, sm, lm, bm, app, price, std, blocked8: r.blocked8, st12: r.st12 });
              }
    expect(cells.length).toBe(256);
  }, 180_000);

  it("감정평가 없음 96셀: ⑧ 차단 ⇔ ⑫ 400 (비공허)", () => {
    const sub = cells.filter((c) => c.app === "noApp");
    expect(sub.length).toBe(96);
    const mismatch = sub.filter((c) => c.blocked8 !== (c.st12 === 400));
    expect(mismatch, JSON.stringify(mismatch.slice(0, 3))).toEqual([]);
    const blocked = sub.filter((c) => c.blocked8).length;
    const passed = sub.length - blocked;
    expect(blocked).toBeGreaterThanOrEqual(60);
    expect(passed).toBeGreaterThanOrEqual(20);
    // 면제로 새로 통과하는 셀: 2015-12-31 · 구분 기재 · 실가/실가 · 기준시가가 완전하지 않은데 ⑧·⑫ 모두 통과
    const waivedPass = sub.filter((c) => c.td === EARLY && c.sm === "actual" && c.lm === "actual" && c.bm === "actual" && c.std !== "both" && !c.blocked8 && c.st12 === 200);
    expect(waivedPass.length).toBeGreaterThanOrEqual(3);
  });

  it("전 256셀: ⑧ 통과 ∧ ⑫ 400 모순 0 (⑫ 400 ⇒ ⑧ 차단)", () => {
    const contradictions = cells.filter((c) => !c.blocked8 && c.st12 === 400);
    expect(contradictions, JSON.stringify(contradictions.slice(0, 3))).toEqual([]);
  });

  it("T-8 · ⑧이 더 엄격한 셀은 전부 감정평가 양쪽 입력 셀 — 의도된 비대칭(별건), 양방향 단언 금지", () => {
    const stricter = cells.filter((c) => c.blocked8 && c.st12 === 200);
    expect(stricter.length).toBeGreaterThan(0);
    expect(stricter.every((c) => c.app === "bothApp")).toBe(true);
  });
});
