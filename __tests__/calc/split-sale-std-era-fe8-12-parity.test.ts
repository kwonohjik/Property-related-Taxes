/**
 * 토지·건물 구분 기재(split) 양도시 기준시가 V7 — 양도일 2016.1.1. 전 ⑧↔⑫ 정합 (T-1~T-9).
 *
 * 쟁점: 양도일이 2016.1.1. 전이고 구분 기재(`saleSplitMode: "actual"`)이며 환산 파트가 없으면 ⑧(`saleStdPriceWaivedByEra`)은 양도시
 * 토지·건물 기준시가를 면제하는데, ⑫ Zod refine V7이 연혁을 보지 않고 무조건 요구해 «화면 통과 → 서버 400»이 났다.
 * 엔진은 그 구간에서 기준시가를 쓰지 않으므로(T-6) ⑫를 ⑧과 같은 술어로 좁혔다.
 *
 * 후속(감정평가 양쪽): 양도시 감정평가가액이 토지·건물 양쪽이면 그 가액이 안분 basis 1순위라(부가령 §64①1호 단서) 양도시 기준시가는 안분·§100③ 판정에 쓰이지 않는다.
 * ⑫는 이미 그렇게 풀어 줬고 ⑧만 기준시가를 요구하던 비대칭(47셀)을 같은 술어로 맞췄다 — T-4(전 256셀 ⇔)·T-10~T-12. 계획서: docs/00-pm/split-sale-std-appraisal-fe8-parity.plan.md
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
  type Cell = { td: string; sm: string; lm: string; bm: string; app: "noApp" | "bothApp"; price: string; std: Std; blocked8: boolean; st12: number; res: string };
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
                cells.push({ td, sm, lm, bm, app, price, std, blocked8: r.blocked8, st12: r.st12, res: JSON.stringify(r.json?.data?.result ?? null) });
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

  it("전 256셀: ⑧ 차단 ⇔ ⑫ 400 (양방향 정합 — 감정평가 양쪽 셀 포함) · 비공허", () => {
    const mismatch = cells.filter((c) => c.blocked8 !== (c.st12 === 400));
    expect(mismatch, JSON.stringify(mismatch.slice(0, 3))).toEqual([]);
    const blocked = cells.filter((c) => c.blocked8).length;
    expect(blocked).toBeGreaterThanOrEqual(130);
    expect(cells.length - blocked).toBeGreaterThanOrEqual(110);
  });

  it("T-10 · 감정평가 양쪽: 환산 파트가 없으면 기준시가가 없어도·한쪽만 있어도 ⑧ 통과 ∧ ⑫ 200 (V4·V7 모두)", () => {
    const sub = cells.filter((c) => c.app === "bothApp" && c.lm === "actual" && c.bm === "actual");
    expect(sub.length).toBe(40); // 양도일 2 × (구분양도 priced·unpriced + 일괄 unpriced + 감정 priced·unpriced = 5) × 기준시가 4
    const bad = sub.filter((c) => c.blocked8 || c.st12 !== 200);
    expect(bad, JSON.stringify(bad.slice(0, 3))).toEqual([]);
    // 비공허: 기준시가 없음·토지만·건물만이 각각 들어 있다
    for (const std of ["none", "landOnly", "bldOnly"] as const) expect(sub.some((c) => c.std === std)).toBe(true);
  });

  it("T-11 · 감정평가 양쪽 + 환산 파트: 그 파트의 분모(양도시 기준시가)만 요구한다 — 반대 파트 기준시가는 요구하지 않는다", () => {
    for (const [part, own, other] of [["토지", "landOnly", "bldOnly"], ["건물", "bldOnly", "landOnly"]] as const) {
      const sub = cells.filter((c) => c.app === "bothApp" && (part === "토지" ? c.lm === "estimated" && c.bm === "actual" : c.bm === "estimated" && c.lm === "actual"));
      expect(sub.length).toBeGreaterThan(0);
      for (const c of sub) {
        const ok = c.std === "both" || c.std === own;
        expect(c.blocked8, `${part} ${c.td}/${c.sm}/${c.price}/${c.std} ⑧`).toBe(!ok);
        expect(c.st12 === 400, `${part} ${c.td}/${c.sm}/${c.price}/${c.std} ⑫`).toBe(!ok);
      }
      expect(sub.some((c) => c.std === other)).toBe(true);
    }
  });

  it("T-12 · 세액 불변 — 감정평가 양쪽이면 결과 전체가 기준시가 입력과 무관하다 (200인 셀끼리 result JSON 동일)", () => {
    const groups = new Map<string, Cell[]>();
    for (const c of cells.filter((x) => x.app === "bothApp" && x.st12 === 200)) {
      const k = [c.td, c.sm, c.lm, c.bm, c.price].join("|");
      groups.set(k, [...(groups.get(k) ?? []), c]);
    }
    let compared = 0;
    for (const [k, g] of groups) {
      for (const c of g.slice(1)) {
        expect(c.res, `${k}: ${g[0].std} vs ${c.std}`).toBe(g[0].res);
        compared++;
      }
    }
    expect(compared).toBeGreaterThanOrEqual(40);
  });
});

describe("T-13 · 소유자 분리(동시 취득 · 개별주택가격 비례 안분) 격자 — 감정평가 양쪽에서도 ⑧ 차단 ⇔ ⑫ 400", () => {
  it("384셀(환산 없음·본인 소유 파트 환산·비소유 파트 환산): 모순 0 · 불일치 0 · 환산 파트가 있으면 비례 척도라 양쪽 기준시가를 요구(부분 입력 차단) · 없으면 요구 없음", async () => {
    type C = { so: string; est: string; app: string; std: Std; td: string; sm: string; price: string; blocked8: boolean; st12: number; res: string };
    const cells: C[] = [];
    for (const td of [EARLY, FIRST])
      for (const so of ["land_only", "building_only"])
        for (const est of ["none", "owned", "foreign"])
          for (const sm of ["actual", "apportioned", "appraisal"])
            for (const app of ["noApp", "bothApp"])
              for (const std of ["none", "both", "landOnly", "bldOnly"] as const)
                for (const price of ["priced", "unpriced"]) {
                  if (sm === "appraisal" && app === "noApp") continue;
                  if (sm === "apportioned" && price === "priced") continue;
                  // owned = 본인 소유 파트가 환산, foreign = 소유하지 않는 파트가 환산(엔진·⑫는 비소유 파트 환산을 세지 않는다)
                  const lm = (so === "land_only" && est === "owned") || (so === "building_only" && est === "foreign") ? "estimated" : "actual";
                  const bm = (so === "building_only" && est === "owned") || (so === "land_only" && est === "foreign") ? "estimated" : "actual";
                  const over: Record<string, unknown> = {
                    saleSplitMode: sm,
                    selfOwns: so,
                    hasSeperateLandAcquisitionDate: false,
                    landAcquisitionDate: "",
                    acquisitionDate: "2005-06-01",
                    landAcqMode: lm,
                    buildingAcqMode: bm,
                    landAcquisitionPrice: lm === "actual" ? "300,000,000" : "",
                    buildingAcquisitionPrice: bm === "actual" ? "250,000,000" : "",
                    standardPriceAtAcq: "300,000,000",
                    fixedAcquisitionPrice: "550,000,000",
                    standardPriceAtTransfer: est !== "none" ? "900,000,000" : "",
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
                  cells.push({ so, est, app, std, td, sm, price, blocked8: r.blocked8, st12: r.st12, res: JSON.stringify(r.json?.data?.result ?? null) });
                }
    expect(cells.length).toBe(384);
    const mismatch = cells.filter((c) => c.blocked8 !== (c.st12 === 400));
    expect(mismatch, JSON.stringify(mismatch.slice(0, 3).map((c) => ({ ...c, res: undefined })))).toEqual([]);
    // 비공허: 감정평가 양쪽 + 환산 파트 + 부분 기준시가 = 차단, 환산 파트 없음 + 기준시가 없음 = 통과
    expect(cells.some((c) => c.app === "bothApp" && c.est === "owned" && (c.std === "landOnly" || c.std === "bldOnly") && c.blocked8)).toBe(true);
    expect(cells.some((c) => c.app === "bothApp" && c.est === "none" && c.std === "none" && !c.blocked8 && c.st12 === 200)).toBe(true);
    // 비소유 파트 환산은 분모가 쓰이지 않는다 — 기준시가 없이도 통과
    expect(cells.some((c) => c.app === "bothApp" && c.est === "foreign" && c.std === "none" && !c.blocked8 && c.st12 === 200)).toBe(true);
    // 세액 불변: 감정평가 양쪽 + 환산 파트 없음이면 기준시가와 무관
    const byKey = new Map<string, C[]>();
    for (const c of cells.filter((x) => x.app === "bothApp" && x.est !== "owned" && x.st12 === 200)) {
      const k = [c.td, c.so, c.est, c.sm, c.price].join("|");
      byKey.set(k, [...(byKey.get(k) ?? []), c]);
    }
    let compared = 0;
    for (const [k, g] of byKey) for (const c of g.slice(1)) { expect(c.res, k).toBe(g[0].res); compared++; }
    expect(compared).toBeGreaterThanOrEqual(30);
  }, 180_000);
});

describe("T-15 · 감정평가 한쪽만 — 기존 동작 유지(안분 basis가 못 되므로 기준시가를 계속 요구)", () => {
  for (const [name, app] of [
    ["토지만", { landAppraisalAtTransfer: "1,100,000,000" }],
    ["건물만", { buildingAppraisalAtTransfer: "400,000,000" }],
  ] as const) {
    // 2016-01-01(연혁 면제 없음)만 — 2015-12-31은 면제라 ⑫가 200이고 ⑧은 V8(한쪽만 입력)로 막는 별개 비대칭이다(fail-closed, 기준시가와 무관).
    for (const td of [FIRST]) {
      it(`${name} · ${td} · 기준시가 없음: ⑧ 차단 ∧ ⑫ 400(양도시 기준시가 두 칸)`, async () => {
        const r = await both(formOf(td, { ...SALE_ACTUAL, landAcqMode: "actual", buildingAcqMode: "actual", ...app }, "2017-02-28"));
        expect(r.blocked8).toBe(true);
        // ⑧도 한쪽만 입력한 감정평가를 안분 basis로 보지 않아 V8(한쪽만 입력)보다 먼저 V7(양도시 기준시가)에서 막힌다
        expect(r.i8[0].message).toContain("양도시 기준시가");
        expect(r.st12).toBe(400);
        expect(r.keys12.sort()).toEqual([BLD_KEY, LAND_KEY].sort());
      });
    }
  }
});

describe("T-14 · 파트 이월과세(증여자 환산) 격자 — 감정평가 양쪽에서도 ⑧ 차단 ⇔ ⑫ 400", () => {
  it("72셀: 불일치 0 · 증여자 환산 파트의 분모만 요구", async () => {
    const est = { partEstimated: true, donorAcquisitionPrice: "", donorStandardPriceAtAcquisition: "30,000,000" };
    type C = { donor: string; app: string; std: string; blocked8: boolean; st12: number };
    const cells: C[] = [];
    for (const [td, filing] of [["2015-09-30", "2015-11-30"], ["2025-06-30", "2025-08-31"]])
      for (const donor of ["none", "land", "building"])
        for (const sm of ["actual", "appraisal"])
          for (const app of ["noApp", "bothApp"])
            for (const std of ["none", "both", "landOnly", "bldOnly"]) {
              if (sm === "appraisal" && app === "noApp") continue;
              const base = cAsset();
              const over: Record<string, unknown> = {
                saleSplitMode: sm,
                landStandardPriceAtTransfer: std === "both" || std === "landOnly" ? "700,000,000" : "",
                buildingStandardPriceAtTransfer: std === "both" || std === "bldOnly" ? "500,000,000" : "",
                landCarryover: { ...base.landCarryover, donorAcquisitionDate: "1995-03-01", ...(donor === "land" ? est : {}) },
                carryover: { ...base.carryover, giftRegistryDate: "2012-03-01", donorAcquisitionDate: "2008-06-01", ...(donor === "building" ? est : {}) },
              };
              if (sm === "appraisal") {
                over.landTransferPrice = "";
                over.buildingTransferPrice = "";
              }
              if (app === "bothApp") {
                over.landAppraisalAtTransfer = "700,000,000";
                over.buildingAppraisalAtTransfer = "500,000,000";
              }
              const r = await both(cForm({ transferDate: td, filingDate: filing } as never, cAsset(over)));
              cells.push({ donor, app, std, blocked8: r.blocked8, st12: r.st12 });
            }
    expect(cells.length).toBe(72);
    const mismatch = cells.filter((c) => c.blocked8 !== (c.st12 === 400));
    expect(mismatch, JSON.stringify(mismatch.slice(0, 3))).toEqual([]);
    // 비공허: 증여자 환산 토지 + 토지 기준시가만 = 통과(건물 기준시가 불요), 증여자 환산 토지 + 건물 기준시가만 = 차단
    expect(cells.some((c) => c.app === "bothApp" && c.donor === "land" && c.std === "landOnly" && !c.blocked8 && c.st12 === 200)).toBe(true);
    expect(cells.some((c) => c.app === "bothApp" && c.donor === "land" && c.std === "bldOnly" && c.blocked8 && c.st12 === 400)).toBe(true);
  }, 180_000);
});
