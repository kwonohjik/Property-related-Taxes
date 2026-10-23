/**
 * anchor — 일체 주택 본인 신축 × §114조의2 가산세 base 건물분: ④ 전송 · ⑧ 차단 · 3중 패턴 (단건) — Q-12 PR-2
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md (§7.4~7.7 · §9 PR-2)
 *
 * 경로: 폼 → ⑧ `collectStepIssues(0~5)` → ④ `callTransferTaxAPI` 본문 → route POST(⑫⑭ + 엔진).
 *  · W — 입력을 채우면 `selfBuiltHousing` 중첩 객체가 실리고 base 가 건물분이 된다(키가 없으면 PR-4 이후 엔진이 400 — 종전 500,000,000 / 25,000,000 은 영 §164⑨ 공익수용 결합에만 남는다)
 *  · N — 범위 밖(실가·5년 경과·방식 전환·비주택·겸용·증축·분리·공익수용 등)이면 키를 싣지 않고 ⑧도 요구하지 않는다(숨은 입력 = 미전송 = 미요구)
 *  · B — 칸이 비면 ⑧이 칸 단위로 차단한다(자동 채움·합계 뺄셈 없음)
 */
import { describe, it, expect, vi } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { calc, sbForm, SB_APPRAISAL, SB_INPUTS } from "./_self-built-housing-fixture";
import { buildSaleSplitWire } from "@/lib/calc/transfer-tax-api-sale-split";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const OUR_FIELDS = [
  "selfBuiltBuildingAppraisal",
  "standardPricePerSqmAtAcq",
  "acquisitionArea",
  "buildingStandardPriceAtAcq",
  "standardPricePerSqmAtTransfer",
  "transferArea",
  "buildingStandardPriceAtTransfer",
  "landAppraisalAtTransfer",
  "buildingAppraisalAtTransfer",
  "landTransferPrice",
  "buildingTransferPrice",
];
const ours = (r: Awaited<ReturnType<typeof calc>>) => r.issues.filter((i) => OUR_FIELDS.includes(i.field ?? ""));
const sb = (r: Awaited<ReturnType<typeof calc>>) => r.body.selfBuiltHousing as Record<string, unknown> | undefined;
const blank = (...keys: (keyof AssetForm)[]) => Object.fromEntries(keys.map((k) => [k, ""])) as Partial<AssetForm>;

describe("W — 입력을 채우면 ④가 싣고 base 가 건물분이 된다", () => {
  it("W-1 환산: 중첩 객체 5값 · base 187,500,000 · 가산세 9,375,000 · 총납부 180,649,700 (없으면 500,000,000 / 25,000,000 / 197,837,200)", async () => {
    const r = await calc(sbForm());
    expect(r.issues).toEqual([]);
    expect(sb(r)).toEqual({
      landPricePerSqmAtAcquisition: 1_000_000,
      landArea: 100,
      buildingStdPriceAtAcquisition: 60_000_000,
      landStdPriceAtTransfer: 240_000_000,
      buildingStdPriceAtTransfer: 160_000_000,
    });
    expect(r.status).toBe(200);
    expect(r.result).toMatchObject({ penaltyBase: 187_500_000, penaltyTax: 9_375_000, totalTax: 180_649_700 });
  });

  it("W-2 구분 기재 700/300(§100③ 통과) → sale 와이어 · base 140,625,000 · 가산세 7,031,250", async () => {
    const r = await calc(sbForm({ saleSplitMode: "actual", landTransferPrice: "700000000", buildingTransferPrice: "300000000" }));
    expect(r.issues).toEqual([]);
    expect(sb(r)?.sale).toEqual({ landTransferPrice: 700_000_000, buildingTransferPrice: 300_000_000 });
    expect(r.result).toMatchObject({ penaltyBase: 140_625_000, penaltyTax: 7_031_250 });
  });

  it("W-3 감정 · 건물 감정가액 직접 1.1억 → 와이어는 그 한 값뿐(L·N 미전송) · base 110,000,000 · 가산세 5,500,000 (없으면 300,000,000 / 15,000,000)", async () => {
    const r = await calc(sbForm({ ...SB_APPRAISAL, selfBuiltBuildingAppraisal: "110000000" }));
    expect(r.issues).toEqual([]);
    expect(sb(r)).toEqual({ buildingAppraisalValue: 110_000_000 });
    expect(r.result).toMatchObject({ penaltyBase: 110_000_000, penaltyTax: 5_500_000 });
  });

  it("W-4 감정 · 「구분 표시 없음」 → 취득 당시 토지·건물 기준시가 비례 · base 112,500,000 · 가산세 5,625,000 (직접 입력 값은 미전송)", async () => {
    const r = await calc(sbForm({ ...SB_APPRAISAL, selfBuiltAppraisalNoSplit: true, selfBuiltBuildingAppraisal: "110000000" }));
    expect(r.issues).toEqual([]);
    expect(sb(r)).toEqual({ landPricePerSqmAtAcquisition: 1_000_000, landArea: 100, buildingStdPriceAtAcquisition: 60_000_000 });
    expect(r.result).toMatchObject({ penaltyBase: 112_500_000, penaltyTax: 5_625_000 });
  });

  it("W-5 지분 50%: 양도가 5억 · 기준시가는 스케일하지 않는다 · base 93,750,000 · 가산세 4,687,500", async () => {
    const r = await calc(sbForm({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" }));
    expect(r.issues).toEqual([]);
    expect(sb(r)?.landStdPriceAtTransfer).toBe(240_000_000);
    expect(r.result).toMatchObject({ penaltyBase: 93_750_000, penaltyTax: 4_687_500 });
  });

  it("W-6 지분 50% · 구분 기재는 지분 스케일(7억 → 3.5억, 3억 → 1.5억)", async () => {
    const r = await calc(
      sbForm({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes", saleSplitMode: "actual", landTransferPrice: "700000000", buildingTransferPrice: "300000000" }),
    );
    expect(sb(r)?.sale).toEqual({ landTransferPrice: 350_000_000, buildingTransferPrice: 150_000_000 });
  });

  it("W-7 양도차손(§97②2호 단서 swap)도 건물분 — 총납부 10,312,500 (없으면 27,500,000)", async () => {
    const r = await calc(sbForm({ capitalExpenditure: "1200000000" }));
    expect(r.result).toMatchObject({ penaltyBase: 187_500_000, penaltyTax: 9_375_000, totalTax: 10_312_500 });
  });
});

describe("W-sale — 양도가액 구분(`sale`) 와이어는 모드로 게이트된다(이월과세 donor ④와 같은 공용 leaf)", () => {
  const STALE = { landTransferPrice: "700000000", buildingTransferPrice: "300000000", landAppraisalAtTransfer: "650000000", buildingAppraisalAtTransfer: "350000000" };

  it("안분 모드로 되돌린 뒤 남은 구분 기재·감정평가 값은 보내지 않는다 — base 는 기준시가 비례(187,500,000)", async () => {
    const r = await calc(sbForm({ saleSplitMode: "apportioned", ...STALE }));
    expect(r.issues).toEqual([]);
    expect(sb(r)?.sale).toBeUndefined();
    expect(r.result?.penaltyBase).toBe(187_500_000);
  });

  it("buildSaleSplitWire — 모드별로 실리는 키: apportioned 없음 · actual 구분 기재 + 감정(비교 대상) · appraisal 감정만", () => {
    const a = (over: Partial<AssetForm>) => ({ ...sbForm().assets[0], ...STALE, ...over }) as AssetForm;
    expect(buildSaleSplitWire(a({ saleSplitMode: "apportioned" }), "2026-03-01", 1)).toEqual({});
    expect(buildSaleSplitWire(a({ saleSplitMode: "actual" }), "2026-03-01", 1)).toEqual({
      landTransferPrice: 700_000_000,
      buildingTransferPrice: 300_000_000,
      landAppraisalAtTransfer: 650_000_000,
      buildingAppraisalAtTransfer: 350_000_000,
    });
    expect(buildSaleSplitWire(a({ saleSplitMode: "appraisal" }), "2026-03-01", 1)).toEqual({
      landAppraisalAtTransfer: 650_000_000,
      buildingAppraisalAtTransfer: 350_000_000,
    });
  });

  it("영 §166⑧ 예외는 구분 기재(actual) ∧ 양도일 2025.1.1. 이후일 때만 싣는다", () => {
    const a = (over: Partial<AssetForm>) => ({ ...sbForm().assets[0], saleSplitExemption: "other_law", ...over }) as AssetForm;
    expect(buildSaleSplitWire(a({ saleSplitMode: "actual", buildingTransferPrice: "300000000" }), "2025-01-01", 1)).toMatchObject({ saleSplitExemption: "other_law" });
    expect(buildSaleSplitWire(a({ saleSplitMode: "actual", buildingTransferPrice: "300000000" }), "2024-12-31", 1)).not.toHaveProperty("saleSplitExemption");
    expect(buildSaleSplitWire(a({ saleSplitMode: "apportioned" }), "2026-03-01", 1)).not.toHaveProperty("saleSplitExemption");
  });
});

describe("V-3 — 일부 양도(partial): 주택공시가격(H·H_T)은 주택 전체 값이라 토지 면적도 «취득 당시 전체 면적»이 같은 척도다", () => {
  // 취득 당시 전체 100㎡ 중 50㎡만 양도(양도가 5억). transferArea(50)는 양도분 면적이라 쓰지 않는다.
  const PARTIAL = { areaScenario: "partial", acquisitionArea: "100", transferArea: "50", actualSalePrice: "500000000" } as Partial<AssetForm>;
  const f = (over: Partial<AssetForm> = {}) => sbForm({ ...PARTIAL, ...over }, { contractTotalPrice: "500000000" });

  it("V3-1 landArea·양도 당시 토지 기준시가 모두 전체 면적(100㎡) 기준 — 와이어 100㎡ · 240,000,000 · base 93,750,000(= 5억 × 건물분 7,500만 ÷ 양도시 주택공시가격 4억)", async () => {
    const r = await calc(f());
    expect(r.issues).toEqual([]);
    expect(sb(r)).toMatchObject({ landArea: 100, landStdPriceAtTransfer: 240_000_000 });
    expect(r.result).toMatchObject({ penaltyBase: 93_750_000, penaltyTax: 4_687_500 });
  });

  it("V3-2 구분 기재(건물 2.2억 — §100③ 통과)도 전체 면적 기준: base 103,125,000 (= 2.2억 × 7,500만 ÷ 양도 당시 건물분 1.6억). 양도분 면적 기준이면 B_tr 이 부풀어 다른 값", async () => {
    const r = await calc(f({ saleSplitMode: "actual", buildingTransferPrice: "220000000" }));
    expect(r.issues).toEqual([]);
    expect(r.result?.penaltyBase).toBe(103_125_000);
  });
});

describe("N — 범위 밖이면 키를 싣지 않고 ⑧도 요구하지 않는다 (stale 값이 남아 있어도)", () => {
  const cases: [string, Partial<AssetForm>, Record<string, unknown>?][] = [
    ["실지거래가액(방식 전환)", { useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000" }],
    ["매매사례가액", { useEstimatedAcquisition: false, isSalesCaseAcquisition: true, similarSalesValue: "300000000" }],
    ["신축일부터 5년 경과(양도 2027-01-11)", {}, { transferDate: "2027-01-11" }],
    ["본인 신축 토글 OFF", { isSelfBuilt: false }],
    ["증축", { buildingType: "extension", extensionFloorArea: "120", extensionStdPriceAtAcquisition: "40000000" }],
    ["비주택(건물 단독)", { assetKind: "building" }],
    ["겸용주택", { isMixedUseHouse: true }],
    ["공익수용(영 §164⑨)", { transferCause: "public_expropriation" }],
  ];
  it.each(cases)("N %s → 키 없음 · 우리 칸 요구 없음", async (_n, over, formOver) => {
    // 칸은 채워 둔 채(stale) — 범위 밖이면 보내지도 요구하지도 않아야 한다. ⑧ 오류가 나는 조합(증축 등)은 우리 칸이 없는 것만 본다.
    const r = await calc(sbForm(over, formOver as never));
    expect(sb(r)).toBeUndefined();
    expect(ours(r)).toEqual([]);
  });

  it("N-방식 전환 후 빈 칸 — 환산 입력을 비운 채 실거래가로 바꿔도 막히지 않는다(숨은 입력은 요구하지 않는다)", async () => {
    const r = await calc(
      sbForm({ useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000", ...blank("standardPricePerSqmAtAcq", "buildingStandardPriceAtAcq", "buildingStandardPriceAtTransfer") }),
    );
    expect(sb(r)).toBeUndefined();
    expect(ours(r)).toEqual([]);
  });

  it("N-감정 · 직접 입력일 때 L·N 칸이 비어 있어도 요구하지 않는다(보이지 않는 칸)", async () => {
    const r = await calc(
      sbForm({ ...SB_APPRAISAL, selfBuiltBuildingAppraisal: "110000000", ...blank("standardPricePerSqmAtAcq", "buildingStandardPriceAtAcq", "standardPricePerSqmAtTransfer", "buildingStandardPriceAtTransfer") }),
    );
    expect(ours(r)).toEqual([]);
    expect(r.status).toBe(200);
  });

  it("N-감정 · 「구분 표시 없음」일 때 건물 감정가액이 비어 있어도 요구하지 않는다", async () => {
    const r = await calc(sbForm({ ...SB_APPRAISAL, selfBuiltAppraisalNoSplit: true, selfBuiltBuildingAppraisal: "" }));
    expect(ours(r)).toEqual([]);
    expect(sb(r)).toEqual({ landPricePerSqmAtAcquisition: 1_000_000, landArea: 100, buildingStdPriceAtAcquisition: 60_000_000 });
  });
});

describe("B — 칸이 비면 ⑧이 칸 단위로 차단한다 (계산 순서 = 화면 순서)", () => {
  it("B-1 환산: 5칸을 비우면 첫 칸(취득 ㎡당 공시지가)부터 — 채울 때마다 다음 칸으로 이동", async () => {
    const empty = { ...blank("standardPricePerSqmAtAcq", "acquisitionArea", "transferArea", "buildingStandardPriceAtAcq", "standardPricePerSqmAtTransfer", "buildingStandardPriceAtTransfer") };
    const seq: [Partial<AssetForm>, string][] = [
      [empty, "standardPricePerSqmAtAcq"],
      [{ ...empty, standardPricePerSqmAtAcq: "1000000" }, "acquisitionArea"],
      [{ ...empty, standardPricePerSqmAtAcq: "1000000", acquisitionArea: "100", transferArea: "100" }, "buildingStandardPriceAtAcq"],
      [{ ...empty, standardPricePerSqmAtAcq: "1000000", acquisitionArea: "100", transferArea: "100", buildingStandardPriceAtAcq: "60000000" }, "standardPricePerSqmAtTransfer"],
      [{ ...SB_INPUTS, buildingStandardPriceAtTransfer: "" }, "buildingStandardPriceAtTransfer"],
    ];
    for (const [over, field] of seq) {
      const issues = ours(await calc(sbForm(over)));
      expect(issues[0]?.field, JSON.stringify(issues)).toBe(field);
    }
  });

  it("B-2 감정 · 직접 입력 비움 → selfBuiltBuildingAppraisal · 감정가액 총액 초과 → 같은 칸", async () => {
    const e = ours(await calc(sbForm({ ...SB_APPRAISAL, selfBuiltBuildingAppraisal: "" })));
    expect(e[0]?.field).toBe("selfBuiltBuildingAppraisal");
    const over = ours(await calc(sbForm({ ...SB_APPRAISAL, selfBuiltBuildingAppraisal: "300000001" })));
    expect(over[0]?.field).toBe("selfBuiltBuildingAppraisal");
    expect(over[0]?.message).toContain("클 수 없습니다");
  });

  it("B-3 감정 · 「구분 표시 없음」 + 3칸 비움 → 취득 ㎡당 공시지가 → 면적 → 건물 기준시가", async () => {
    const base = { ...SB_APPRAISAL, selfBuiltAppraisalNoSplit: true } as Partial<AssetForm>;
    expect(ours(await calc(sbForm({ ...base, ...blank("standardPricePerSqmAtAcq") })))[0]?.field).toBe("standardPricePerSqmAtAcq");
    expect(ours(await calc(sbForm({ ...base, ...blank("acquisitionArea", "transferArea") })))[0]?.field).toBe("acquisitionArea");
    expect(ours(await calc(sbForm({ ...base, ...blank("buildingStandardPriceAtAcq") })))[0]?.field).toBe("buildingStandardPriceAtAcq");
  });
});
