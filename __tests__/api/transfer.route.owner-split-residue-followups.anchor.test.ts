/**
 * 소유자 분리 후속 — 계획서 `docs/02-design/features/owner-split-residue-followups.plan.md`.
 *
 * 수정 전 실측(mock 세율):
 *   V-5 상속 소유자 분리 + 남은 환산 플래그 + 남은 분리 플래그 + 공익수용 → ⑧ 「주택 … 취득일 분리 + 공익수용 환산 … 미지원」(칸 0개) ↔ 서버 200
 *   V-8 신축·이월과세 소유자 분리 — 화면에 없는 파트 금액·방식·토지 취득일이 세액을 바꿨다(이월과세 건물만 145,860,000 → 223,410,000 등) · 분리 플래그 막다른 길
 *   C-1 이월과세 토지만 본인 — 토지 파트만 증여 등기일 기산(§95④ 단서 위반) 117,060,000 → 88,550,000
 *   C-2 신축 — 신축비용을 기준시가 비율로 토지에 나눴다(건물만 본인 154,500,000 → 114,180,000 · 토지만 본인은 차단)
 *   V-7 취득 당시 감정평가가액 안분 칸이 없었다(부가령 §64①1호 단서)
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { cAsset } from "../calc/_helpers/split-carryover-c-form";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { nonPurchaseOwnerSplit } from "@/lib/calc/transfer-land-part-cause";
import { normalizeBuildingCauseInputs } from "@/lib/calc/transfer-land-part-cause";
import { acqAppraisalApportionApplies } from "@/lib/calc/transfer-acq-appraisal";
import { newConstructionLandOnly } from "@/lib/calc/transfer-land-part-cause";
import { newConstructionLandOnlyIssue } from "@/lib/api/transfer-tax-schema-household-refines";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const STD = {
  acquisitionArea: "100", transferArea: "100", standardPricePerSqmAtTransfer: "5600000", buildingStandardPriceAtTransfer: "840000000",
  standardPricePerSqmAtAcq: "2400000", standardPriceAtAcq: "480000000", buildingStandardPriceAtAcq: "360000000", standardPriceAtTransfer: "1400000000",
};
const HH = {
  transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const INH: Loose = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2015-01-01",
  decedentAcquisitionDate: "2005-01-01", actualSalePrice: "1,200,000,000", publishedValueAtInheritance: "300,000,000",
  inheritanceValuationMethod: "supplementary", fixedAcquisitionPrice: "", ...STD,
};
const NEWC: Loose = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "newConstruction", occupancyApprovalDate: "2015-01-01",
  acquisitionDate: "2015-01-01", actualSalePrice: "1,200,000,000", fixedAcquisitionPrice: "300,000,000", ...STD,
};
/** 이월과세 — 증여자 2015-06-01 취득 3억 · 증여 등기 2023-03-01 · 양도 2025-06-30(파트 이월과세 C는 끈다) */
const c0 = cAsset() as unknown as Loose;
const CARRY: Loose = {
  ...c0, ...STD, carryoverDonorSplit: false, landAcquisitionPrice: "", buildingAcquisitionPrice: "", saleSplitMode: "apportioned",
  landTransferPrice: "", buildingTransferPrice: "", landStandardPriceAtTransfer: "", acquisitionDate: "2023-03-01",
  carryover: { ...c0.carryover, donorAcquisitionPrice: "300,000,000", giftDateValuation: "900,000,000" },
};
const CARRY_HH = { transferDate: "2025-06-30", filingDate: "2025-08-31" };

const form = (a: Loose, hh: Loose = {}): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    ...HH, ...hh, contractTotalPrice: String(a.actualSalePrice).replace(/,/g, ""), assets: [{ ...makeDefaultAsset(1), ...a } as AssetForm],
  }) as TransferFormData;

async function run(a: Loose, hh: Loose = {}) {
  const f = form(a, hh);
  const body = (await captureBody(f)) as Loose;
  const r = await postTransfer(body);
  return {
    fields: allIssues(f).map((i) => i.field),
    status: r.status,
    tax: (r.result as Loose | undefined)?.calculatedTax as number | undefined,
    split: (r.result as Loose | undefined)?.splitDetail as Loose | undefined,
    zod: Object.keys((r.json as Loose)?.error?.fieldErrors ?? {}),
    body,
    result: r.result as Loose | undefined,
    form: f,
  };
}

describe("V-5 공익수용 — 남은 분리 플래그가 칸 없는 「미지원」 차단을 만들지 않는다", () => {
  const EXPR = { transferCause: "public_expropriation", expropriationNoticeDate: "2020-01-01", reductions: [], useEstimatedAcquisition: true };
  it.each(["building_only", "land_only"] as const)("상속 %s — 분리 플래그 + 옛 토지 취득일 상태가 분리 플래그 꺼짐 상태와 같다(보상액 총액 칸 · 서버 200)", async (owns) => {
    const clean = await run({ ...INH, ...EXPR, selfOwns: owns });
    const stale = await run({ ...INH, ...EXPR, selfOwns: owns, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01" });
    expect(clean.fields).toEqual(["housingCompensationTotal"]);
    expect([stale.fields, stale.status, stale.tax]).toEqual([clean.fields, 200, clean.tax]);
  });
});

describe.each([
  ["신축 건물만", NEWC, "building_only", {}, 114_180_000],
  ["이월과세 건물만", CARRY, "building_only", CARRY_HH, 145_860_000],
  ["이월과세 토지만", CARRY, "land_only", CARRY_HH, 88_550_000],
] as const)("V-8 %s — 화면에 없는 분리 입력이 세액을 바꾸지 않는다", (_n, B, owns, hh, control) => {
  it("대조", async () => {
    const r = await run({ ...B, selfOwns: owns }, hh);
    expect([r.fields, r.status, r.tax]).toEqual([[], 200, control]);
  });
  it.each([
    ["토지 취득가액 1억", { landAcquisitionPrice: "100,000,000" }],
    ["토지 감정 1억", { landAcqMode: "appraisal", landAcquisitionPrice: "100,000,000" }],
    ["옛 토지 취득일 2010", { landAcquisitionDate: "2010-01-01" }],
    ["옛 토지 취득일 2020", { landAcquisitionDate: "2020-01-01" }],
    ["건물 취득가액 1억", { buildingAcquisitionPrice: "100,000,000" }],
    ["두 파트 매매사례 1억", { landAcqMode: "salesCase", buildingAcqMode: "salesCase", landSalesCaseValue: "100,000,000", buildingSalesCaseValue: "100,000,000" }],
    ["분리 플래그 + 옛 토지 취득일(막다른 길이었다)", { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01" }],
  ] as const)("%s → 대조와 같다", async (_r, patch) => {
    const r = await run({ ...B, selfOwns: owns, ...patch }, hh);
    expect([r.fields, r.status, r.tax]).toEqual([[], 200, control]);
  });
});

describe("C-1 이월과세 소유자 분리 — 토지 파트도 증여자 취득일부터 기산(소득세법 §95④ 단서)", () => {
  it("토지만 본인 — 토지 파트 취득일 2015-06-01 · 보유 10년(수정 전 2023-03-01 · 2년 · 117,060,000)", async () => {
    const r = await run({ ...CARRY, selfOwns: "land_only" }, CARRY_HH);
    expect([r.status, r.tax]).toEqual([200, 88_550_000]);
    expect([r.split?.land.acquisitionDate, r.split?.land.holdingYears, r.split?.building.acquisitionDate]).toEqual(["2015-06-01", 10, "2015-06-01"]);
  });
  it("⑦ 신고서 토지 열 — 복원이 채운 토지 취득일(= 증여 등기일)이 있어도 이월과세 적용(A) 서식은 증여자 취득일로 계산과 같다", async () => {
    const r = await run({ ...CARRY, selfOwns: "land_only", landAcquisitionDate: "2023-03-01" }, CARRY_HH);
    const rows = buildRows(r.result as never, "split-2col", r.form, r.form.assets[0], undefined, "(증여자 취득일)", "2015-06-01");
    expect(rows[1].values.land).toContain("2015");
  });
});

describe("C-2 신축 소유자 분리", () => {
  it("건물만 본인 — 건물 취득가액 = 신축비용 전액 3억(수정 전 기준시가 비율 1.8억)", async () => {
    const r = await run({ ...NEWC, selfOwns: "building_only" });
    expect([r.status, r.split?.building.acquisitionPrice, r.body.buildingAcquisitionPrice]).toEqual([200, 300_000_000, 300_000_000]);
  });
  it("토지만 본인 — ⑧·⑫가 소유자 분리 칸에서 막는다(신축은 건물의 취득원인 — 영 §162①4호)", async () => {
    const r = await run({ ...NEWC, selfOwns: "land_only" });
    expect([r.fields, r.status, r.zod]).toEqual([["selfOwns"], 400, ["selfOwns"]]);
  });

  it("함께 양도 자산(컴패니언) 토지만 본인도 ⑧·⑫가 같은 칸으로 막는다(리뷰 게이트 F-2)", async () => {
    const f = Object.assign(createDefaultTransferFormData(), {
      ...HH, contractTotalPrice: "1700000000",
      assets: [
        { ...makeDefaultAsset(1), ...INH, actualSalePrice: "500,000,000", acquisitionArea: "", transferArea: "" } as AssetForm,
        { ...makeDefaultAsset(2), ...NEWC, selfOwns: "land_only" } as AssetForm,
      ],
    }) as TransferFormData;
    const r = await postTransfer((await captureBody(f)) as Loose);
    expect(allIssues(f).map((i) => i.field)).toContain("selfOwns");
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("신축(자가건축)은 건물의 취득원인");
  });

  it("부담부증여로 양도해도 같은 결론 — ⑧ 술어와 ⑫ 규칙이 양도 형태를 보지 않는다(리뷰 게이트 F-3)", () => {
    const a = { ...makeDefaultAsset(1), ...NEWC, selfOwns: "land_only", transferType: "burdened_gift" } as AssetForm;
    expect(newConstructionLandOnly(a)).toBe(true);
    expect(newConstructionLandOnlyIssue({ acquisitionCause: "newConstruction", selfOwns: "land_only" })).not.toBeNull();
    expect(newConstructionLandOnly({ ...a, selfOwns: "building_only" })).toBe(false);
  });
});

describe("V-7 취득 당시 감정평가가액 안분(부가령 §64①1호 단서)", () => {
  const AP = { landAppraisalAtAcquisition: "150,000,000", buildingAppraisalAtAcquisition: "150,000,000" };
  const PUR_OWNER: Loose = { ...INH, acquisitionCause: "purchase", publishedValueAtInheritance: "", fixedAcquisitionPrice: "300,000,000", selfOwns: "land_only" };

  it.each([
    ["상속 토지만", { ...INH, selfOwns: "land_only" }, 94_022_000, 84_446_000],
    ["상속 건물만", { ...INH, selfOwns: "building_only" }, 154_500_000, 164_580_000],
    ["매매 토지만", PUR_OWNER, 94_022_000, 84_446_000],
  ] as const)("%s — 감정 50:50이면 그 비율로 나눈다(기준시가 40:60 대조 %s → %s)", async (_n, B, control, appraised) => {
    const c = await run(B);
    const r = await run({ ...B, ...AP });
    expect([c.status, c.tax, c.split?.acqApportionBasisKind]).toEqual([200, control, undefined]);
    expect([r.fields, r.status, r.tax, r.split?.land.acquisitionPrice, r.split?.acqApportionBasisKind]).toEqual([[], 200, appraised, 150_000_000, "appraisal"]);
  });

  it("한쪽만 입력 → ⑧·⑫ 같은 칸으로 막는다(비율이 없다)", async () => {
    const r = await run({ ...INH, selfOwns: "land_only", landAppraisalAtAcquisition: "150,000,000" });
    expect([r.fields, r.status, r.zod]).toEqual([["buildingAppraisalAtAcquisition"], 400, ["buildingAppraisalAtAcquisition"]]);
  });

  it.each([
    ["소유자 분리 없음", { ...INH }],
    ["매매 같은 날 취득일 분리(소유자 같음 — 엔진이 분리 계산하지 않는다)", { ...PUR_OWNER, selfOwns: "both", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-01-01" }],
    ["매매 별개 취득", { ...PUR_OWNER, selfOwns: "both", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01", landAcquisitionPrice: "100,000,000", buildingAcquisitionPrice: "200,000,000" }],
    // 리뷰 게이트 F-1 — 본인 파트가 총액 안분을 타지 않으면 엔진이 감정가액을 읽지 않는다
    ["매매 소유자 분리 · 토지 환산", { ...PUR_OWNER, landAcqMode: "estimated", buildingAcqMode: "estimated", landStandardPriceAtTransfer: "560,000,000" }],
    ["매매 소유자 분리 · 본인 토지 금액 직접 입력", { ...PUR_OWNER, landAcquisitionPrice: "100,000,000" }],
    ["신축 건물만(신축비용 전액이 건물 금액 — C-2)", { ...NEWC, selfOwns: "building_only" }],
  ] as const)("%s → 칸 없음 · 전송 안 함 · 세액 불변", async (_n, B) => {
    const a = { ...makeDefaultAsset(1), ...B, ...AP } as AssetForm;
    expect(acqAppraisalApportionApplies(a)).toBe(false);
    const c = await run(B);
    const r = await run({ ...B, ...AP });
    expect([r.body.landAppraisalAtAcquisition, r.body.buildingAppraisalAtAcquisition]).toEqual([undefined, undefined]);
    expect([r.status, r.tax]).toEqual([c.status, c.tax]);
  });

  it("함께 양도 자산(컴패니언) 소유자 분리도 같은 payload — 감정가액이 총세액에 닿는다", async () => {
    const two = (c: Loose) =>
      Object.assign(createDefaultTransferFormData(), {
        ...HH, contractTotalPrice: "1700000000",
        assets: [
          { ...makeDefaultAsset(1), ...INH, actualSalePrice: "500,000,000", acquisitionArea: "", transferArea: "" } as AssetForm,
          { ...makeDefaultAsset(2), ...INH, selfOwns: "land_only", ...c } as AssetForm,
        ],
      }) as TransferFormData;
    const total = async (c: Loose) => {
      const f = two(c);
      const r = await postTransfer((await captureBody(f)) as Loose);
      return { fields: allIssues(f).map((i) => i.field), status: r.status, tax: r.json?.data?.aggregated?.totalTax as number | undefined };
    };
    const control = await total({});
    const appraised = await total(AP);
    expect([control.status, appraised.fields, appraised.status]).toEqual([200, [], 200]);
    expect(appraised.tax).toBeLessThan(control.tax!);
  });
});

describe("정규화 범위 — 매매 외 소유자 분리", () => {
  const residue = {
    hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01", landAcqMode: "appraisal", buildingAcqMode: "estimated",
    landAcquisitionPrice: "1", buildingAcquisitionPrice: "2", landSalesCaseValue: "3", buildingSalesCaseValue: "4",
  };
  it("신축 건물만 — 건물 취득가액은 신축비용 · 나머지 사본은 상속·증여와 같다", () => {
    const n = normalizeBuildingCauseInputs({ ...makeDefaultAsset(1), ...NEWC, selfOwns: "building_only", ...residue } as AssetForm);
    expect([n.hasSeperateLandAcquisitionDate, n.landAcquisitionDate, n.landAcqMode, n.buildingAcqMode]).toEqual([false, "2015-01-01", "actual", "actual"]);
    expect([n.landAcquisitionPrice, n.buildingAcquisitionPrice, n.landSalesCaseValue, n.buildingSalesCaseValue]).toEqual(["", "300,000,000", "", ""]);
  });
  it("이월과세 — 토지 취득일은 본문 취득일(취득일이 비면 증여 등기일)", () => {
    const a = { ...makeDefaultAsset(1), ...CARRY, selfOwns: "land_only", ...residue } as AssetForm;
    expect(normalizeBuildingCauseInputs(a).landAcquisitionDate).toBe("2023-03-01");
    expect(normalizeBuildingCauseInputs({ ...a, acquisitionDate: "" }).landAcquisitionDate).toBe("2023-03-01");
  });
  it.each([
    ["신축 + 토지 상속(D1)", { ...NEWC, landCauseHost: "newConstruction", landAcquisitionCause: "inheritance", hasSeperateLandAcquisitionDate: true }],
    ["신축 + 토지 이월과세(P3 A)", { ...NEWC, landCauseHost: "newConstruction", landAcquisitionCause: "carryover_gift", hasSeperateLandAcquisitionDate: true }],
    ["이월과세 건물 + 토지 매매(P4 B)", { ...CARRY, landCauseHost: "carryover_gift", landAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true }],
  ] as const)("%s + 소유자 분리 → 대상 아님(leaf S4가 막는 조합)", (_n, B) => {
    expect(nonPurchaseOwnerSplit({ ...makeDefaultAsset(1), ...B, selfOwns: "land_only" } as AssetForm)).toBe(false);
  });
});
