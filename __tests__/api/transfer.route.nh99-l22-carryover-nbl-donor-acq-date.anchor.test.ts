/**
 * route anchor — 이월과세(`carryover_gift`) 토지의 비사업용 토지 판정 소유기간 기산일 = 증여자 취득일 (레인 L22 · 사용자 결정 2026-11-08).
 *
 * 결함: ④ `buildNonBusinessLandRaw`가 화면에 칸이 없는 이월과세 자산의 원시 `acquisitionDate`(매매 때 입력한 잔재 또는 "")를 읽었다.
 *   · 잔재 "" → 정밀판정 요청이 통째로 빠져 표지 `true`(중과)만 남았다(사업용이어도 +10%p · 판정 상세 없음).
 *   · 잔재 ≠ 등기접수일 → 옛 날짜로 판정했다. ⑧(L21 leaf)은 등기접수일을 읽으므로 ⑧ 차단 0건으로 조용히 갈렸다.
 * 수정: `nblAcquisitionDateOf` 한 곳이 ④ raw·⑧ 이농일/결격연도·무조건 의제 배지·⑤ 미리보기에 같은 값을 준다 — 이월과세는 `carryover.donorAcquisitionDate`.
 *
 * 법령: 시행령 §168조의6은 «토지의 소유기간»만 말하고 이월과세 기산일 명문이 없다(§168조의14③3호나목 괄호만 «법 제97조의2제1항을 적용받는 경우에는
 * 증여한 배우자 또는 직계존비속이 해당 자산을 취득한 날»). 국세청 해석(서면4팀-2622 · 부동산거래관리과-1112·-258 · 부동산납세과-539)이 일관되게
 * 증여자 취득일이라 한다 — 사용자 결정으로 따른다(확인 필요). 장기보유특별공제·세율의 보유기간과 와이어 `acquisitionDate`(등기접수일 · L21)는 그대로다.
 *
 * 모든 셀에서 ⑧(`collectStepIssues`)과 route(⑫·세액)를 같이 단언한다. 세율: route 폴백(`makeMockRates`).
 * 수정 전 값(같은 격자, patch 역적용 실측)은 각 셀 주석의 «전».
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateNblDetailedJudgment } from "@/lib/calc/transfer-tax-validate-nbl";
import { evaluateUnconditionalExemption, nblAcquisitionDateOf } from "@/lib/calc/nbl-unconditional-exemption-status";
import { buildFractionalShareNblRecord, buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const T = "2024-06-03";
const G = "2022-03-01"; // 증여 등기접수일
/** 농림지역 농지 3,000㎡ · 취득가 4억 · 양도가 10억 · 정밀판정 ON */
const RURAL = {
  assetKind: "land", acquisitionArea: "3000", transferArea: "3000", addressJibun: "강원 홍천군 테스트리 1", fixedAcquisitionPrice: "400000000",
  standardPriceAtTransfer: "500000000", isNonBusinessLand: true, nblUseDetailedJudgment: true, nblZoneType: "agriculture_forest", nblLandType: "farmland",
} as Partial<AssetForm>;
const CAR = (g: string, d: string) => ({
  giftRegistryDate: g, donorAcquisitionDate: d, donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000", useEstimatedAcquisition: false,
  estimationMode: "", giftTaxAmount: "0", donorCapitalExpenditure: "0", giftDateValuation: "100000000", exclusionDeclared: {}, donorRelation: "spouse",
}) as unknown as AssetForm["carryover"];
const farm = (s: string, e: string) =>
  ({ nblFarmingSelf: true, nblFarmerResidenceDistance: "5", nblBusinessUsePeriods: [{ startDate: s, endDate: e, usageType: "farming" }] }) as Partial<AssetForm>;

/** 증여자 취득일(소유기간 기산) 두 구간 — ge5: 7.4년(1호) · lt5: 4.3년(2호). 사업용: 증여자 자경 → 등기접수일까지 · 비사업용: 소유 초반에 자경을 마침 */
const D = { ge5: "2017-01-01", lt5: "2020-03-01" } as const;
const USE = { ge5: farm("2017-01-02", G), lt5: farm("2020-03-02", "2023-09-01") } as const;
const NON = { ge5: farm("2017-01-02", "2018-06-01"), lt5: farm("2020-03-02", "2020-09-01") } as const;
/** 화면에 칸이 없는 이월과세 자산의 원시 취득일 — 비움 / 증여자 취득일보다 이름 / 등기접수일보다 늦음 / 등기접수일과 같음 */
const RESIDUE = ["", "2015-01-01", "2023-06-01", G] as const;

const v8 = (f: TransferFormData) => [0, 1, 2, 3, 4, 5].flatMap((s) => collectStepIssues(s, f));

interface Judged {
  status: number;
  issues: string[];
  total?: number;
  nbl: Array<boolean | undefined>;
  steps: string;
  warnings: string[];
  wireAcq?: string;
  rawAcq?: string;
  rawSent: boolean;
}
async function run(f: TransferFormData, companion = false): Promise<Judged> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cap.body),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  const agg = json.data?.aggregated;
  const single = json.data?.result;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const carrier: any = companion ? (cap.body as any)?.companionAssets?.[0] : cap.body;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const details = companion ? (agg?.properties ?? []).map((p: any) => p.nonBusinessLandJudgmentDetail) : [single?.nonBusinessLandJudgmentDetail];
  return {
    status: res.status,
    issues: v8(f).map((i) => i.message),
    total: companion ? agg?.totalTax : single?.totalTax,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nbl: details.map((d: any) => d?.isNonBusinessLand),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    steps: (details[0]?.judgmentSteps ?? []).map((s: any) => s.detail).join(" | "),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    warnings: ((details[0] as any)?.warnings ?? []) as string[],
    wireAcq: carrier?.acquisitionDate,
    rawAcq: carrier?.nonBusinessLandRaw?.acquisitionDate,
    rawSent: carrier?.nonBusinessLandRaw !== undefined,
  };
}

function mainForm(over: Partial<AssetForm>): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = T;
  f.filingDate = "2024-08-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [Object.assign({ ...makeDefaultAsset(1) }, RURAL, over) as AssetForm];
  return f;
}
const carryoverMain = (d: string, residue: string, periods: Partial<AssetForm>) =>
  mainForm({ acquisitionCause: "carryover_gift", acquisitionDate: residue, carryover: CAR(G, d), ...periods } as Partial<AssetForm>);

/** 축 B(같은 땅 지분 분할 취득) — 첫 지분 매매(땅 사실·사용기간) + 둘째 지분 이월과세(증여자 취득일 = 첫 지분 취득일) */
function shareForm(d: string, residue: string, periods: Partial<AssetForm>): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = T;
  f.filingDate = "2024-08-31";
  f.contractTotalPrice = "1000000000";
  f.assetSplitMode = "fractional";
  f.assets = [
    Object.assign({ ...makeDefaultAsset(1) }, RURAL, { ownershipNumerator: "50", ownershipDenominator: "100", acquisitionCause: "purchase", acquisitionDate: d, fixedAcquisitionPrice: "200000000" }, periods),
    Object.assign({ ...makeDefaultAsset(2) }, { ownershipNumerator: "50", ownershipDenominator: "100", acquisitionCause: "carryover_gift", acquisitionDate: residue, fixedAcquisitionPrice: "", acquisitionPrice: "100000000", carryover: CAR(G, d) }),
  ] as AssetForm[];
  return f;
}

// 수정 전 값 — 같은 격자를 patch 역적용(`git apply -R`)해 실측. 잔재 "" 는 정밀판정 요청이 빠져 판정 상세가 없다(nbl undefined) · 총세액은 표지 true 중과.
//   주 자산  ge5 사업용: 전 473,836,000(잔재 "" 판정 없음 / 2015 비사업용 / 2023·G 비사업용 3호) → 후 375,111,000 · 판정 사업용 (잔재 무관)
//   주 자산  lt5 사업용: 전 473,836,000("" · 2023) / 375,111,000(2015 · G) → 후 375,111,000 전 셀
//   주 자산  비사업용 : 전·후 473,836,000 (세액 동일 — 잔재 ""는 표지 true였고, 이제 판정 상세가 생긴다 · 소유기간 호는 전 3호/1호 → 후 1호/2호)
//   컴패니언 ge5 사업용: 전 340,417,000 → 후 326,139,000 · lt5 사업용: 전 350,977,000("" · 2023) / 337,227,000(2015 · G) → 후 337,227,000
const MAIN_TOTAL = { USE: 375_111_000, NON: 473_836_000 } as const;
const PURCHASE_CONTROL = {
  ge5: { USE: [197_703_000, false], NON: [254_188_000, true] },
  lt5: { USE: [214_335_000, false], NON: [274_780_000, true] },
} as const;
const SHARE_TOTAL = { ge5: { USE: 326_139_000, NON: 413_204_000 }, lt5: { USE: 337_227_000, NON: 426_932_000 } } as const;

for (const bucket of ["ge5", "lt5"] as const) {
  for (const use of ["USE", "NON"] as const) {
    const periods = use === "USE" ? USE[bucket] : NON[bucket];
    const verdict = use === "NON";
    describe(`주 자산 이월과세 농지 · 증여자 소유 ${bucket === "ge5" ? "5년 이상(1호)" : "3~5년(2호)"} · ${verdict ? "비사업용" : "사업용"} 판정`, () => {
      for (const residue of RESIDUE) {
        it(`원시 취득일 잔재 ${residue === "" ? "비움" : residue}: ⑧ 0건 · 요청 raw 취득일 = 증여자 취득일 · 와이어 = 등기접수일 · 판정·세액이 잔재와 무관`, async () => {
          const r = await run(carryoverMain(D[bucket], residue, periods));
          expect(r.issues).toEqual([]);
          expect(r.status).toBe(200);
          expect(r.rawSent).toBe(true);
          expect(r.rawAcq).toBe(D[bucket]);
          expect(r.wireAcq).toBe(G);
          expect(r.nbl).toEqual([verdict]);
          expect(r.total).toBe(MAIN_TOTAL[use]);
          expect(r.steps).toContain(bucket === "ge5" ? "1호(소유 5년 이상)" : "2호(소유 3~5년)");
          // 결과 고지 — 증여자 취득일 기산 + 해석례 + 확인 필요
          const notice = r.warnings.filter((w) => w.includes("이월과세"));
          expect(notice).toHaveLength(1);
          expect(notice[0]).toContain(`증여자 취득일(${D[bucket]})부터 셌습니다`);
          expect(notice[0]).toContain("부동산납세과-539");
          expect(notice[0]).toContain("확인이 필요합니다");
        });
      }
    });
    describe(`대조 — 일반 매매 토지(취득일 ${D[bucket]}) ${bucket} · ${verdict ? "비사업용" : "사업용"}: 수정 전후 불변`, () => {
      it("판정·세액이 수정 전 실측과 같다", async () => {
        const r = await run(mainForm({ acquisitionCause: "purchase", acquisitionDate: D[bucket], ...periods }));
        expect(r.issues).toEqual([]);
        const [total, nbl] = PURCHASE_CONTROL[bucket][use];
        expect(r.total).toBe(total);
        expect(r.nbl).toEqual([nbl]);
        expect(r.rawAcq).toBe(D[bucket]);
        expect(r.wireAcq).toBe(D[bucket]);
        expect(r.warnings.filter((w) => w.includes("이월과세"))).toEqual([]); // 이월과세가 아니면 고지 없음(긍정 짝은 위 격자)
      });
    });
  }
}

describe("소유기간 5년 경계(1825일 vs 1824일)는 증여자 취득일로 센다 — 잔재·등기접수일이 호를 정하지 않는다", () => {
  // 양도일 2024-06-03 − 1825일 = 2019-06-05(기산일) → 취득일은 그 전날
  it.each([
    ["2019-06-04", "1호(소유 5년 이상)"],
    ["2019-06-05", "2호(소유 3~5년)"],
  ] as const)("증여자 취득일 %s → %s", async (donor, bucketText) => {
    for (const residue of ["", "2023-06-01", G]) {
      const r = await run(carryoverMain(donor, residue, farm(addOneDay(donor), "2023-09-01")));
      expect(r.issues).toEqual([]);
      expect(r.steps).toContain(bucketText);
      expect(r.rawAcq).toBe(donor);
      expect(r.nbl).toEqual([false]);
      expect(r.total).toBe(MAIN_TOTAL.USE);
    }
  });
});

for (const bucket of ["ge5", "lt5"] as const) {
  for (const use of ["USE", "NON"] as const) {
    const periods = use === "USE" ? USE[bucket] : NON[bucket];
    describe(`컴패니언(축 B 둘째 지분) 이월과세 · 증여자 소유 ${bucket === "ge5" ? "5년 이상" : "3~5년"} · ${use === "NON" ? "비사업용" : "사업용"}`, () => {
      for (const residue of RESIDUE) {
        it(`원시 취득일 잔재 ${residue === "" ? "비움" : residue}: ⑧ 0건 · 지분 요청 raw 취득일 = 증여자 취득일 · 두 지분 판정이 같다`, async () => {
          const r = await run(shareForm(D[bucket], residue, periods), true);
          expect(r.issues).toEqual([]);
          expect(r.status).toBe(200);
          expect(r.rawSent).toBe(true);
          expect(r.rawAcq).toBe(D[bucket]);
          expect(r.wireAcq).toBe(G);
          expect(r.nbl).toEqual([use === "NON", use === "NON"]);
          expect(r.total).toBe(SHARE_TOTAL[bucket][use]);
        });
      }
    });
  }
}

describe("leaf `nblAcquisitionDateOf` — 이월과세만 증여자 취득일 · 비면 \"\" (잔재·등기접수일로 대신 채우지 않는다)", () => {
  const a = (over: Partial<AssetForm>) => ({ ...makeDefaultAsset(1), assetKind: "land", ...over }) as AssetForm;
  it("이월과세 → 증여자 취득일", () => {
    expect(nblAcquisitionDateOf(a({ acquisitionCause: "carryover_gift", acquisitionDate: "2005-01-01", carryover: CAR(G, "2017-01-01") } as Partial<AssetForm>))).toBe("2017-01-01");
  });
  it("이월과세 · 증여자 취득일 비움 → \"\" (잔재 2005-01-01·등기접수일로 채우지 않음) · ④ raw 없음", () => {
    const x = a({ acquisitionCause: "carryover_gift", acquisitionDate: "2005-01-01", carryover: CAR(G, ""), acquisitionArea: "100", nblUseDetailedJudgment: true, nblLandType: "farmland", nblZoneType: "agriculture_forest" } as Partial<AssetForm>);
    expect(nblAcquisitionDateOf(x)).toBe("");
    expect(buildNonBusinessLandRaw(x, T)).toBeUndefined();
  });
  it("매매·상속·일반 증여 → 원시 취득일 그대로", () => {
    for (const cause of ["purchase", "inheritance", "gift"]) {
      expect(nblAcquisitionDateOf(a({ acquisitionCause: cause, acquisitionDate: "2014-03-04" } as Partial<AssetForm>))).toBe("2014-03-04");
    }
  });
  it("축 B 지분 레코드 — 같은 취득 판정은 증여자 취득일끼리 비교한다(잔재가 달라도 같은 취득이면 의제 선언을 끄지 않는다)", () => {
    const share = (residue: string, d: string) => a({ acquisitionCause: "carryover_gift", acquisitionDate: residue, carryover: CAR(G, d) } as Partial<AssetForm>);
    const primary = { ...share("2001-01-01", "2017-01-01"), nblExemptJongjoongOwned: true } as AssetForm;
    expect(buildFractionalShareNblRecord(share("2009-09-09", "2017-01-01"), primary).nblExemptJongjoongOwned).toBe(true);
    expect(buildFractionalShareNblRecord(share("2001-01-01", "2018-01-01"), primary).nblExemptJongjoongOwned).toBe(false);
  });
});

describe("N1b — ⑧ 이농일·결격 과세기간 범위와 무조건 의제 배지가 ④와 같은 날짜(증여자 취득일)를 읽는다", () => {
  const land = (over: Partial<AssetForm>) =>
    ({ ...createDefaultTransferFormData().assets[0], ...RURAL, acquisitionCause: "carryover_gift", carryover: CAR(G, "2015-01-01"), ...over }) as AssetForm;
  it("이농일 2018-01-01(증여자 취득일 이후 · 등기접수일 이전): 잔재가 어떤 값이어도 통과 (수정 전 잔재 2023-06-01·등기접수일에서 «취득일보다 빠릅니다»)", () => {
    for (const residue of ["", "2023-06-01", G]) {
      expect(validateNblDetailedJudgment(land({ acquisitionDate: residue, nblExemptInong: true, nblExemptInongDate: "2018-01-01" }), "자산 1", T)).toBeNull();
    }
  });
  it("이농일이 증여자 취득일보다 빠르면 «증여자 취득일»로 차단한다", () => {
    const msg = validateNblDetailedJudgment(land({ acquisitionDate: "2005-01-01", nblExemptInong: true, nblExemptInongDate: "2014-06-01" }), "자산 1", T);
    expect(msg).toContain("증여자 취득일(2015-01-01)");
  });
  it("결격 과세기간 2016·2017(증여자 취득연도 2015 ~ 양도연도 2024 안): 잔재 무관 통과 · 2014는 취득연도 2015 기준으로 차단", () => {
    for (const residue of ["", "2023-06-01", G]) {
      expect(validateNblDetailedJudgment(land({ acquisitionDate: residue, nblDisqualifiedTaxPeriods: "2016, 2017" }), "자산 1", T)).toBeNull();
    }
    expect(validateNblDetailedJudgment(land({ acquisitionDate: "", nblDisqualifiedTaxPeriods: "2014" }), "자산 1", T)).toContain("취득연도(2015)");
  });
  it("무조건 의제 ③3호나목(공익수용 · 취득일이 사업인정고시일 5년 이전): 증여자 취득일 기준 — 증여자 취득일이 비면 잔재(2010-01-01)로 대신 채우지 않아 불성립", () => {
    const expr = { transferCause: "public_expropriation", expropriationNoticeDate: "2020-01-01" } as Partial<AssetForm>;
    const ok = land({ ...expr, carryover: CAR(G, "2010-01-01"), acquisitionDate: "2019-06-01" });
    expect(evaluateUnconditionalExemption(ok, T).isExempt).toBe(true);
    const blank = land({ ...expr, carryover: CAR(G, ""), acquisitionDate: "2010-01-01" });
    expect(evaluateUnconditionalExemption(blank, T).isExempt).toBe(false);
  });
  it("무조건 의제 ③4호 가목(종중 소유 · 2005.12.31. 이전 취득): 종중 취득일 = 증여자 취득일 기준 — 잔재가 달라도 같고, 증여자 취득일이 2006년 이후면 불성립", () => {
    const base = land({ carryover: CAR("2008-03-01", "2004-05-01"), nblExemptJongjoongOwned: true });
    for (const residue of ["", "2010-01-01", "2008-03-01"]) {
      expect(evaluateUnconditionalExemption({ ...base, acquisitionDate: residue }, T).isExempt).toBe(true);
    }
    expect(evaluateUnconditionalExemption({ ...base, carryover: CAR("2008-03-01", "2006-05-01"), acquisitionDate: "1990-01-01" }, T).isExempt).toBe(false);
  });
});

function addOneDay(d: string): string {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}
