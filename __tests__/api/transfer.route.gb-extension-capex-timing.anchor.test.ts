/**
 * 일반건물 증축 × 자본적지출 — 지출 시점별 배분 (Q-6 후속 · 2026-10-23)
 *
 * 계획서: `docs/00-pm/gb-extension-capex-timing.plan.md` (Q-1~Q-5 확정). 폼 → ⑧ → ④ → ⑫ → ⑭ 전 구간 · mock 세율.
 *
 * 규칙: 증축 **전** 지출 → 원건물에만 · 증축 **후** 지출 → 원건물 : 증축분 = 양도가액 비율(Q-2 a).
 * 원건물 실가 + 증축분 환산이면 증축분 몫은 증축분의 §97②2호 단서 비교로(Q-3 a). 원건물 환산 경로도 같다(Q-4 a) —
 * 증축분이 실가면 그 몫(증축 후 자본적지출 · 양도비)을 증축분에 §97②1호로 가산한다(종전: 소실 — 표 3 K).
 * 증축 전 지출이 0이면 두 카드가 같은 모드인 조합은 종전 값과 같다(회귀 고정).
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
import { buildGbExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { capexHint } from "@/components/calc/transfer/capexHint";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const T = 1_600_000_000;
const BASE: Partial<AssetForm> = {
  assetKind: "general_building",
  addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000",
  gbAcqBuildingValue: "150000000",
  gbLandArea: "205",
  gbBuildingArea: "300",
  gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "5514000",
  gbTransferBuildingValue: "259072400",
  actualSalePrice: String(T),
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  gbHasExtension: true,
  gbExtensionDate: "2018-05-01",
  gbExtensionArea: "50",
};
/** 증축분 실가(매매) / 환산(자가증축). */
const EXT_ACTUAL = {
  gbExtensionAcquisitionMode: "actual", gbExtensionAcquisitionCause: "purchase", gbExtensionActualAcquisitionPrice: "50000000",
  gbTransferExtensionBuildingStdPrice: "40000000", gbAcquisitionExtensionBuildingStdPrice: "30000000",
} as Partial<AssetForm>;
const EXT_ESTIMATED = {
  gbExtensionAcquisitionMode: "estimated", gbExtensionAcquisitionCause: "newConstruction",
  gbTransferExtensionBuildingStdPrice: "40000000", gbAcquisitionExtensionBuildingStdPrice: "30000000",
} as Partial<AssetForm>;
const ACQ = {
  /** 매매 · 분리 OFF · 토지+원건물 일괄 실가 6억 */
  buyOff: { acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2005-05-01", acquisitionDate: "2005-05-01", fixedAcquisitionPrice: "600000000" },
  /** 매매 · 분리 ON · 토지 4억 · 건물 2억 */
  buyOn: { acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2005-05-01", acquisitionDate: "2010-05-01", landAcquisitionPrice: "400000000", buildingAcquisitionPrice: "200000000" },
  /** 토지·건물 모두 상속(C1) · 분리 OFF */
  c1Off: { acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "1995-05-01", acquisitionDate: "1995-05-01", decedentAcquisitionDate: "1970-01-01", publishedValueAtInheritance: "300000000", gbBuildingInheritedValue: "200000000" },
  /** C1 · 분리 ON */
  c1On: { acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1988-05-01", acquisitionDate: "1995-05-01", decedentAcquisitionDate: "1970-01-01", publishedValueAtInheritance: "300000000", gbBuildingInheritedValue: "200000000" },
} satisfies Record<string, Partial<AssetForm>>;
const CAPEX = { capitalExpenditure: "20000000" } as Partial<AssetForm>;
const TX = { transferExpense: "10000000" } as Partial<AssetForm>;
const PART = { landDirectExpenses: "30000000", buildingDirectExpenses: "20000000" } as Partial<AssetForm>;
const BUNDLED = { gbBundledAcquisitionExpenses: "15000000" } as Partial<AssetForm>;
const LEGACY = { directExpenses: "12000000" } as Partial<AssetForm>;

const asset = (...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(1) }, BASE, ...over) as AssetForm;
function form(a: AssetForm): TransferFormData {
  const f = newForm();
  f.transferDate = "2026-02-16";
  f.filingDate = "2026-05-31";
  f.contractTotalPrice = String(T);
  f.assets = [a];
  return f;
}

type Prop = { propertyId: string; necessaryExpense: number };
async function run(a: AssetForm) {
  const f = form(a);
  const issues = allIssues(f);
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(await captureBody(f)),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  const props = json.data.aggregated.properties as Prop[];
  const exp = (id: string) => props.find((p) => p.propertyId === id)!.necessaryExpense;
  const gbd = json.data.aggregated.generalBuildingValuationDetail;
  /** ⑦ 상세명세서 «자산별 필요경비» 산식 — 카드 값을 그대로 넘긴다. */
  const formula = (id: string) =>
    buildGbExpenseFormula({ propertyId: id, necessaryExpense: exp(id), capitalExpenditureForDisplay: 0 } as never, gbd);
  return {
    formula,
    issues,
    tax: json.data.aggregated.calculatedTax as number,
    sum: props.reduce((s, p) => s + p.necessaryExpense, 0),
    land: exp("land"),
    b1: exp("building1"),
    b2: exp("building2"),
  };
}
const EST_ORIGIN = {
  useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated", acquisitionCause: "purchase",
  gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2005-05-01", acquisitionDate: "2005-05-01",
} as Partial<AssetForm>;
const PARTB = { buildingDirectExpenses: "20000000" } as Partial<AssetForm>;
const pre = (v: string) => ({ gbCapexBeforeExtension: v }) as Partial<AssetForm>;
const preB = (v: string) => ({ gbBuildingCapexBeforeExtension: v }) as Partial<AssetForm>;
const ok = async (a: AssetForm) => {
  const r = await run(a);
  expect(r.issues).toEqual([]);
  return r;
};

describe("실가 원건물 · 증축분 실가 — 증축 전 지출은 원건물에만 (D-1)", () => {
  it("자산 단위 2천만 · 증축 전 0 → 종전과 같다(토지 11,549,295 · b1 7,320,449 · b2 1,130,256)", async () => {
    const r = await ok(asset(ACQ.buyOff, EXT_ACTUAL, CAPEX, pre("0")));
    expect([r.land, r.b1, r.b2, r.tax]).toEqual([11_549_295, 7_320_449, 1_130_256, 235_628_948]);
  });
  it("자산 단위 2천만 · 전부 증축 전 → 증축분 0 · 건물 몫 전부 원건물", async () => {
    const r = await ok(asset(ACQ.buyOff, EXT_ACTUAL, CAPEX, pre("20000000")));
    expect([r.land, r.b1, r.b2, r.tax]).toEqual([11_549_295, 8_450_705, 0, 235_771_361]);
  });
  it("상속 C1 분리 OFF도 같은 규칙 — 전부 증축 전이면 증축분 0", async () => {
    const r = await ok(asset(ACQ.c1Off, EXT_ACTUAL, CAPEX, pre("20000000")));
    expect([r.land, r.b1, r.b2]).toEqual([11_549_295, 8_450_705, 0]);
  });
  it("분리 ON 건물 파트 2천만 · 증축 전 5백만 → b1 = 5백만 + 1,500만 × 86.6% · b2 = 나머지", async () => {
    const r = await ok(asset(ACQ.buyOn, EXT_ACTUAL, PARTB, preB("5000000")));
    expect([r.land, r.b1, r.b2, r.sum]).toEqual([0, 17_993_796, 2_006_204, 20_000_000]);
    // ⑦ 증축 전 몫은 안분이 아니다 — 나눠 적는다.
    expect(r.formula("building1")).toBe("증축 전 자본적지출 5,000,000 + 자본적지출·양도비 안분 12,993,796 = 17,993,796 (§97②1호)");
  });
  it("분리 ON 건물 파트 · 전부 증축 전 → b1 2천만 · b2 0", async () => {
    const r = await ok(asset(ACQ.buyOn, EXT_ACTUAL, PARTB, preB("20000000")));
    expect([r.b1, r.b2]).toEqual([20_000_000, 0]);
  });
});

describe("실가 원건물 · 증축분 환산 — 증축 후 몫은 증축분 단서 비교로 (Q-3 a)", () => {
  it("증축 전 0 · 나목(2,674,938) ≤ 가목 → 증축분은 개산공제(900,000) 그대로 · 원건물은 증축분 몫을 뺀 금액", async () => {
    const r = await ok(asset(ACQ.buyOn, EXT_ESTIMATED, PARTB, preB("0")));
    expect([r.b1, r.b2, r.tax]).toEqual([17_325_062, 900_000, 242_471_152]);
  });
  it("전부 증축 전 → 원건물 2천만(종전 E-1 Q-8과 같다)", async () => {
    const r = await ok(asset(ACQ.buyOn, EXT_ESTIMATED, PARTB, preB("20000000")));
    expect([r.b1, r.b2, r.tax]).toEqual([20_000_000, 900_000, 241_684_720]);
  });
  it("증축 후 8억 → 증축분 몫 106,997,506 > 가목 → 단서 적용(증축분 필요경비 = 나목)", async () => {
    const r = await ok(asset(ACQ.buyOn, EXT_ESTIMATED, { buildingDirectExpenses: "800000000" }, preB("0")));
    expect([r.b1, r.b2]).toEqual([693_002_494, 106_997_506]);
  });
  it("분리 OFF 자산 단위도 같다 — 증축분 몫 1,130,256은 단서 비교에서 짐", async () => {
    const r = await ok(asset(ACQ.buyOff, EXT_ESTIMATED, CAPEX, pre("0")));
    expect([r.land, r.b1, r.b2]).toEqual([11_549_295, 7_320_449, 900_000]);
  });
});

describe("원건물 환산 — 자산총액 단서 (Q-4 a · D-2·D-3)", () => {
  it("증축분 환산 · 8억 · 증축 전 0 → 종전과 같다", async () => {
    const r = await ok(asset(EST_ORIGIN, EXT_ESTIMATED, { capitalExpenditure: "800000000" }, pre("0")));
    expect([r.land, r.b1, r.b2, r.tax]).toEqual([425_974_025, 311_688_310, 62_337_665, 193_262_108]);
  });
  it("증축분 환산 · 전부 증축 전 → 단서는 자산 전체가 고르되 증축분 몫 0(개산공제도 남지 않는다)", async () => {
    const r = await ok(asset(EST_ORIGIN, EXT_ESTIMATED, { capitalExpenditure: "800000000" }, pre("800000000")));
    expect([r.land, r.b1, r.b2, r.sum]).toEqual([461_971_831, 338_028_169, 0, 800_000_000]);
  });
  it("증축분 환산 · 증축 전 3억 → 증축 전 몫은 토지·원건물에만", async () => {
    const r = await ok(asset(EST_ORIGIN, EXT_ESTIMATED, { capitalExpenditure: "800000000" }, pre("300000000")));
    expect([r.land, r.b1, r.b2, r.sum]).toEqual([439_473_202, 321_565_757, 38_961_041, 800_000_000]);
  });
  it("증축분 실가 · 8억 · 증축 전 0 → 증축분이 증축 후 건물 몫을 가산받는다(종전 0)", async () => {
    const r = await ok(asset(EST_ORIGIN, EXT_ACTUAL, { capitalExpenditure: "800000000" }, pre("0")));
    expect([r.land, r.b1, r.b2, r.sum]).toEqual([435_864_524, 318_925_262, 45_210_214, 800_000_000]);
  });
  it("증축분 실가 · 전부 증축 전 → 증축분 0", async () => {
    const r = await ok(asset(EST_ORIGIN, EXT_ACTUAL, { capitalExpenditure: "800000000" }, pre("800000000")));
    expect([r.b2, r.sum]).toEqual([0, 800_000_000]);
  });
  it("🔴 증축분 실가 · 양도비 1천만(나목 ≤ 가목) → 증축분 몫 279,831 가산 — 종전에는 통째로 소실(세액 298,097,086 불변)", async () => {
    const r = await ok(asset(EST_ORIGIN, EXT_ACTUAL, { transferExpense: "10000000" }));
    expect([r.land, r.b1, r.b2, r.tax]).toEqual([6_150_000, 4_500_000, 279_831, 297_979_557]);
  });
});

describe("⑧ 「그중 증축 전」 칸 — 필요한 자리에서만 필수", () => {
  const issue = async (...over: Partial<AssetForm>[]) => allIssues(form(asset(...over))).join(" ");
  it("자산 단위 자본적지출이 있는데 비면 막는다", async () => {
    expect(await issue(ACQ.buyOff, EXT_ACTUAL, CAPEX)).toContain("증축 전에 지출한 금액을 입력하세요");
  });
  it("총액을 넘으면 막는다", async () => {
    expect(await issue(ACQ.buyOff, EXT_ACTUAL, CAPEX, pre("30000000"))).toContain("자본적지출보다 큽니다");
  });
  it("분리 ON 건물 파트 칸이 있는데 비면 막는다", async () => {
    expect(await issue(ACQ.buyOn, EXT_ACTUAL, PARTB)).toContain("건물 자본적지출 중 증축 전에 지출한 금액");
  });
  it("자본적지출이 없으면 묻지 않는다", async () => {
    expect(await issue(ACQ.buyOff, EXT_ACTUAL)).toBe("");
  });
  it("⑫ 같은 범위 규칙 — 총액을 넘는 payload는 400", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(await captureBody(form(asset(ACQ.buyOff, EXT_ACTUAL, CAPEX, pre("30000000"))))),
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any;
    expect(res.status).toBe(400);
    expect(Object.keys(json.error.fieldErrors)).toEqual(["generalBuildingValuation.capitalExpenditureBeforeExtension"]);
  });
});

/**
 * 원건물 건물 파트 감정가액·매매사례가액 × 증축 (계획서 §10 · 2026-10-23) — 분리 ON에서만 만들 수 있다(분리 OFF는 Q-A3 차단).
 * 종전: 건물 파트가 갈래 4(§97②2호 본문)면 증축분까지 통째로 건너뛰어 증축분 몫이 소실됐다(⑧ 통과).
 * 원건물은 그대로 개산공제만이고, 증축분은 자기 취득방식대로 받는다 — 실가 가산(§97②1호) · 환산 단서 비교(나목 = 그 몫의 자본적지출 + 양도비).
 */
describe("원건물 감정·매매사례 × 증축 — 증축분은 자기 방식대로 (§10)", () => {
  const APR = { buildingAcqMode: "appraisal", buildingAcquisitionPrice: "200000000" } as Partial<AssetForm>;
  const SC = { buildingAcqMode: "salesCase", buildingSalesCaseValue: "200000000" } as Partial<AssetForm>;
  it("🔴 감정 · 증축분 실가 · 양도비 1천만 → 증축분 279,830 가산(종전 0) · 원건물은 개산공제 그대로", async () => {
    const r = await ok(asset(ACQ.buyOn, APR, EXT_ACTUAL, { transferExpense: "10000000" }));
    expect([r.land, r.b1, r.b2, r.tax]).toEqual([7_907_768, 4_500_000, 279_830, 237_885_948]);
  });
  it("매매사례도 같다", async () => {
    const r = await ok(asset(ACQ.buyOn, SC, EXT_ACTUAL, { transferExpense: "10000000" }));
    expect([r.b1, r.b2]).toEqual([4_500_000, 279_830]);
  });
  it("🔴 감정 · 증축분 실가 · 건물 자본적지출 2천만(증축 후) → 증축분 몫 2,674,938 가산(종전 세액 240,328,361 불변)", async () => {
    const r = await ok(asset(ACQ.buyOn, APR, EXT_ACTUAL, PARTB, preB("0")));
    expect([r.b1, r.b2, r.tax]).toEqual([4_500_000, 2_674_938, 239_204_887]);
  });
  it("감정 · 전부 증축 전 → 증축분 몫 없음 · 원건물은 개산공제만", async () => {
    const r = await ok(asset(ACQ.buyOn, APR, EXT_ACTUAL, PARTB, preB("20000000")));
    expect([r.b1, r.b2, r.tax]).toEqual([4_500_000, 0, 240_328_361]);
  });
  it("감정 · 증축분 환산 · 자본적지출 8억 → 증축분 몫 106,997,506 > 가목 → 단서 적용", async () => {
    const r = await ok(asset(ACQ.buyOn, APR, EXT_ESTIMATED, { buildingDirectExpenses: "800000000" }, preB("0")));
    expect([r.b1, r.b2]).toEqual([4_500_000, 106_997_506]);
  });
  it("감정 · 증축분 환산 · 양도비 8억 → 증축분 몫이 가목보다 작아 본문(개산공제 900,000) 그대로", async () => {
    const r = await ok(asset(ACQ.buyOn, APR, EXT_ESTIMATED, { transferExpense: "800000000" }));
    expect([r.b1, r.b2]).toEqual([4_500_000, 900_000]);
  });
  it("⑤ 건물 파트 안내는 증축분 몫이 반영된다고 적는다(증축 없으면 종전 문구)", () => {
    expect(capexHint("건물", "appraisal", true)).toContain("증축분 몫은 증축분 취득방식대로 반영");
    expect(capexHint("건물", "appraisal")).toContain("자본적지출은 차감되지 않습니다");
    expect(capexHint("건물", "appraisal")).not.toContain("증축분");
  });
});
