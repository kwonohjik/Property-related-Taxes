/**
 * anchor — 일반건물 **부담부증여(§159) × 이월과세(§97의2, F27) × 증여자 신축·증축** 「소득세법」 §114조의2 가산세 (PR-5c · 계획서 `gb-card-built-penalty-114-2.plan.md` §3.4)
 *
 * ## 결함
 * 일반건물 부담부증여 × 이월과세는 `general-building-route-carryover.ts`(F27)가 A(이월과세 적용)·B(미적용)를 신고단위 결정세액으로 비교한다.
 * 증여자가 신축·증축한 건물이어도 가산세를 입력할 길이 없었다(⑫ `refineBgDonorBuilt`가 주택·건물만 허용 → 400).
 *
 * ## 규약 (사용자 확정)
 * · base = 채무비율 안분 후 **건물분만**의 증여자 기준 환산취득가액(K-5) — 토지 제외 · W-6 swap 前 값 · 증축은 증축 부분
 * · 5년 기산 = 증여자 신축일(증축이면 완공일) · 이월과세 **A 채택일 때만**(B 채택·②1·2호·③ 배제면 0 + 중립 안내)
 * · ②3호 비교는 가산세 前 결정세액이라 가산세가 채택을 바꾸지 않는다
 * · 일반건물 부담부증여 지분(축 B)·함께 양도(컴패니언)는 F27 을 타지 않는다(이월과세 §97의2 자체가 반영되지 않는다) → ⑫ 가 donorBuilt 를 400 으로 거부한다
 * · K-7(감정)은 이 PR 에서 열지 않았다 — 당시 B 시나리오 400(별건)이었고 PR-1(`gb-bg-carryover-presumed-scenario-b.plan.md`)이 그것을 고쳤다. 개방은 PR-2
 *
 * ## 픽스처
 * 토지 100㎡×2,000,000(양도시 2억)·건물 양도시 2억 · 양도 2026-03-01 · 증여 등기 2024-05-01 · 당초 증여자 취득 2015-01-01 · 시가 10억 · 채무 5억(채무비율 0.5) →
 *   건물 양도가(안분) 2.5억. 당초 증여자 취득시 기준시가 토지 10,000,000 · 건물 40,000,000(A 채택) → 건물 환산취득가 = 2.5억 × 4천만/2억 = 50,000,000 → 가산세 2,500,000.
 *   증축 K-5: 2.5억 × 증축 부분 기준시가 2천만/2억 = 25,000,000 → 1,250,000.
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
import { DONOR_BUILT_APPLIED_NOTICE, DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE, DONOR_BUILT_OUTSIDE_WINDOW_NOTICE, DONOR_BUILT_ZERO_BASE_NOTICE } from "@/lib/tax-engine/transfer-tax-carryover-donor-display";
import { GB_BG_SELF_BUILT_NOTICE } from "@/lib/tax-engine/general-building-bg-penalty-signal";

const GB = {
  landArea: 100, buildingArea: 200, buildingFootprintArea: 50,
  transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000, zoneType: "general_residential" as const,
  acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 100_000_000,
};
const CT = (over: object = {}) => ({
  giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: 0, useEstimatedAcquisition: false,
  giftTaxAmount: 0, giftDateValuation: 1_000_000_000, donorRelation: "lineal", ...over,
});
const COMMON = {
  propertyType: "general_building" as const, transferDate: "2026-03-01", transferPrice: 1_000_000_000, acquisitionDate: "2024-05-01",
  acquisitionPrice: 0, expenses: 0, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
  isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false, reductions: [] as unknown[], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
};
const DB_NEW = { buildingType: "new", constructionDate: "2022-01-10" };
const INFO = (basis: object = {}, over: object = {}) => ({
  valuationMode: "sangjeungbeop_market" as const, acquisitionMethod: "converted" as const, marketValueAtTransfer: 1_000_000_000,
  lendingDepositTotal: 0, mortgageDebtAmount: 500_000_000, annualRentTotal: 0, mortgageSetAmount: 500_000_000,
  landStdPriceAtTransfer: 200_000_000, buildingStdPriceAtTransfer: 200_000_000, landStdPriceAtAcquisition: 100_000_000, buildingStdPriceAtAcquisition: 100_000_000,
  donorRelation: "lineal_descendant" as const,
  carryoverDonorBasis: { landStdPriceAtAcquisition: 10_000_000, buildingStdPriceAtAcquisition: 40_000_000, ...basis },
  ...over,
});
const body = (info: object, over: Record<string, unknown> = {}, gbOver: object = {}) => ({
  ...COMMON, transferType: "burdened_gift", acquisitionCause: "carryover_gift", useEstimatedAcquisition: false, carryoverTaxation: CT(),
  generalBuildingValuation: { ...GB, actualPriceMode: true, buildingAcquisitionCause: "purchase", buildingAcquisitionDate: "2024-05-01", landAcquisitionDate: "2024-05-01", ...gbOver },
  burdenedGiftInfo: info, ...over,
});

interface Echo { applied: boolean; notAppliedReason?: string; base?: number; penalty?: number; constructionDate?: string; buildingType?: string; burdenedGift?: { method: string } }
interface Prop { propertyId: string; propertyLabel?: string; penaltyTax?: number; penaltyBase?: number; steps?: Array<{ label: string; formula?: string }> }
interface Out {
  status: number; error?: { fieldErrors?: Record<string, string[]>; message?: string }; errText: string; determined: number; total: number; pen: number;
  adopted?: "A" | "B"; echo?: Echo; props: Prop[]; warnings: string[];
}
async function post(b: object): Promise<Out> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }));
  const json = (await res.json()) as { data?: { aggregated?: Record<string, any> }; error?: Out["error"] }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const a = json.data?.aggregated ?? {};
  return {
    status: res.status, error: json.error, errText: JSON.stringify(json.error ?? {}), determined: a.determinedTax, total: a.totalTax, pen: a.penaltyTax ?? 0,
    adopted: a.burdenedGiftCarryoverDetail?.adoptedScenario, echo: a.donorBuiltPenalty, props: a.properties ?? [], warnings: a.warnings ?? [],
  };
}
const bld = (r: Out) => r.props.find((p) => p.propertyId === "building")!;
const fields = (r: Out) => Object.keys(r.error?.fieldErrors ?? {});

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });

const withDb = (db: object, basis: object = {}) => INFO({ donorBuilt: db, ...basis });

describe("DB-1 A 채택 · 신축 — 건물분 환산취득가액 5%", () => {
  it("K-5: base 50,000,000 · 가산세 2,500,000 · 결정세액 불변 · 총납부 +2,750,000 · 토지 카드 0", async () => {
    const none = await post(body(INFO()));
    const on = await post(body(withDb(DB_NEW)));
    expect(none.status, none.errText).toBe(200);
    expect(on.status, on.errText).toBe(200);
    expect(on.adopted).toBe("A");
    expect(none.pen).toBe(0);
    expect(bld(on).penaltyBase).toBe(50_000_000);
    expect(bld(on).penaltyTax).toBe(2_500_000);
    expect(on.pen).toBe(2_500_000);
    expect(on.determined).toBe(none.determined); // 가산세는 §92③3호 — 결정세액·②3호 비교 불변
    expect(on.total).toBe(none.total + 2_500_000 + 250_000);
    expect(on.props.find((p) => p.propertyId === "land")?.penaltyTax ?? 0).toBe(0);
    // 건별 가산세 step 라벨이 «증여자 신축» 으로 신축자를 밝힌다(`penaltyDonorBuilt` 가 카드 → 항목 입력으로 전달된다)
    expect(bld(on).steps?.find((st) => st.label.startsWith("환산가액적용가산세"))?.formula).toContain("증여자 신축 5년 이내 양도 + 환산취득가액 적용");
    expect(on.echo).toMatchObject({ applied: true, base: 50_000_000, penalty: 2_500_000, constructionDate: "2022-01-10", buildingType: "new", burdenedGift: { method: "estimated" } });
  });

  it("적용 고지는 «증여자» 문구이고 양도인 본인 신축 고지(GB_BG_SELF_BUILT_NOTICE)가 섞이지 않는다", async () => {
    const on = await post(body(withDb(DB_NEW)));
    expect(on.warnings).toContain(DONOR_BUILT_APPLIED_NOTICE);
    expect(on.warnings).not.toContain(GB_BG_SELF_BUILT_NOTICE);
  });

  it("5년 경계: 신축 2021-03-01(양도 2026-03-01 당일 포함) 적용 · 2021-02-28 은 5년 밖 → 0 + 중립 안내", async () => {
    const on = await post(body(withDb({ ...DB_NEW, constructionDate: "2021-03-01" })));
    const off = await post(body(withDb({ ...DB_NEW, constructionDate: "2021-02-28" })));
    expect(on.pen).toBe(2_500_000);
    expect(off.status, off.errText).toBe(200);
    expect(off.pen).toBe(0);
    expect(off.echo).toMatchObject({ applied: false, notAppliedReason: "outside_penalty_window" });
    expect(off.warnings).toContain(DONOR_BUILT_OUTSIDE_WINDOW_NOTICE);
  });

  it("환산취득가액 시행일(양도일 2018-01-01) 전 양도 → 0", async () => {
    const early = await post({ ...body(withDb({ ...DB_NEW, constructionDate: "2016-01-10" })), transferDate: "2017-12-31", acquisitionDate: "2016-05-01", carryoverTaxation: CT({ giftRegistryDate: "2016-05-01", donorAcquisitionDate: "2015-01-01" }) });
    expect(early.status, early.errText).toBe(200);
    expect(early.pen).toBe(0);
    expect(early.echo).toMatchObject({ applied: false, notAppliedReason: "outside_penalty_window" });
  });

  it("§97②2호 단서(W-6) swap 발동(자본적지출 8천만 > 환산취득가 + 개산공제)이어도 base 는 swap 前 환산취득가 50,000,000", async () => {
    const r = await post(body(withDb(DB_NEW), {}, { capitalExpenditure: 80_000_000 }));
    expect(r.status, r.errText).toBe(200);
    expect(r.adopted).toBe("A");
    expect(bld(r).penaltyBase).toBe(50_000_000);
    expect(bld(r).penaltyTax).toBe(2_500_000);
  });
});

describe("DB-2 증여자 증축 — 증축 부분만 · 85㎡ 초과", () => {
  const ext = (area: number | undefined, std: number | null = 20_000_000) => withDb({ buildingType: "extension", constructionDate: "2022-01-10", ...(area ? { extensionFloorArea: area } : {}), ...(std ? { extensionStdPriceAtAcquisition: std } : {}) });
  it("90㎡ · 증축 부분 기준시가 2천만 → base 25,000,000 · 가산세 1,250,000", async () => {
    const r = await post(body(ext(90)));
    expect(r.status, r.errText).toBe(200);
    expect(bld(r).penaltyBase).toBe(25_000_000);
    expect(bld(r).penaltyTax).toBe(1_250_000);
    expect(r.echo).toMatchObject({ applied: true, buildingType: "extension", base: 25_000_000 });
    // 가산세 step 라벨이 «증여자 증축» — 카드의 buildingType 이 항목 입력까지 전달된다(안 닿으면 «신축» 으로 읽혀 85㎡ 게이트도 우회된다)
    expect(bld(r).steps?.find((st) => st.label.startsWith("환산가액적용가산세"))?.formula).toContain("증여자 증축 5년 이내 양도 + 환산취득가액 적용");
  });
  it("85㎡ 이하는 대상이 아니다 · 85.01㎡ 는 대상", async () => {
    const off = await post(body(ext(85)));
    const on = await post(body(ext(85.01)));
    expect(off.pen).toBe(0);
    expect(off.echo).toMatchObject({ applied: false, notAppliedReason: "outside_penalty_window" });
    expect(on.pen).toBeGreaterThan(0);
  });
  it("⑫ — 바닥면적 · 증축 부분 기준시가 누락은 400", async () => {
    const a = await post(body(ext(undefined)));
    expect(a.status).toBe(400);
    expect(fields(a)).toContain("burdenedGiftInfo.carryoverDonorBasis.donorBuilt.extensionFloorArea");
    const b = await post(body(ext(90, null)));
    expect(b.status).toBe(400);
    expect(fields(b)).toContain("burdenedGiftInfo.carryoverDonorBasis.donorBuilt.extensionStdPriceAtAcquisition");
  });
});

describe("DB-3 B 채택 · 이월과세 배제 — 가산세 0 + 중립 안내 (R2)", () => {
  it("②3호 B 채택(당초 증여자 기준시가가 커서 A 세액이 더 적다) → 0 · scenario_b · 중립 안내", async () => {
    const r = await post(body(withDb(DB_NEW, { landStdPriceAtAcquisition: 60_000_000, buildingStdPriceAtAcquisition: 80_000_000 })));
    expect(r.status, r.errText).toBe(200);
    expect(r.adopted).toBe("B");
    expect(r.pen).toBe(0);
    expect(bld(r).penaltyTax ?? 0).toBe(0);
    expect(r.echo).toMatchObject({ applied: false, notAppliedReason: "scenario_b" });
    expect(r.warnings).toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
  });
  it("②1호 수용 선언으로 이월과세 배제 → 0 · carryover_excluded · 중립 안내", async () => {
    const r = await post(body(withDb(DB_NEW), { carryoverTaxation: CT({ exclusionDeclared: { expropriationWithin2Years: true } }) }));
    expect(r.status, r.errText).toBe(200);
    expect(r.pen).toBe(0);
    expect(r.echo).toMatchObject({ applied: false, notAppliedReason: "carryover_excluded" });
    expect(r.warnings).toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
  });
  it("A 채택인데 기준액이 0(당초 증여자 건물 기준시가 0) → 0 · zero_base · 기준액 0 안내 (게이트는 열려 있다)", async () => {
    const r = await post(body(withDb(DB_NEW, { buildingStdPriceAtAcquisition: 0 })));
    expect(r.status, r.errText).toBe(200);
    expect(r.adopted).toBe("A");
    expect(r.pen).toBe(0);
    expect(r.echo).toMatchObject({ applied: false, notAppliedReason: "zero_base" });
    expect(r.warnings).toContain(DONOR_BUILT_ZERO_BASE_NOTICE);
  });
  it("③ 적용기간 초과(증여 후 10년 경과)로 배제 → 0 · carryover_excluded", async () => {
    const r = await post(body(withDb(DB_NEW), { transferDate: "2034-06-01", carryoverTaxation: CT({ giftRegistryDate: "2024-05-01" }) }));
    expect(r.status, r.errText).toBe(200);
    expect(r.pen).toBe(0);
    expect(r.echo).toMatchObject({ applied: false, notAppliedReason: "carryover_excluded" });
  });
  it("대조: B 채택·배제 결과의 세액은 donorBuilt 부재와 같다", async () => {
    const basis = { landStdPriceAtAcquisition: 60_000_000, buildingStdPriceAtAcquisition: 80_000_000 };
    const a = await post(body(withDb(DB_NEW, basis)));
    const b = await post(body(INFO(basis)));
    expect(a.total).toBe(b.total);
    expect(a.determined).toBe(b.determined);
  });
});

describe("DB-4 ⑫ 거부 — 400 (조용히 무시하지 않는다)", () => {
  it("취득가액 산정방식이 K-5 가 아니면 거부 — K-4 실지 · K-1 기준시가 · K-7 감정(일반건물은 K-5 만)", async () => {
    const k4 = await post(body(INFO({ donorBuilt: DB_NEW, actualAcquisitionTotal: 100_000_000 }, { acquisitionMethod: "actual", actualLandAcquisitionPrice: 100_000_000, actualBuildingAcquisitionPrice: 100_000_000 })));
    expect(k4.status).toBe(400);
    expect(fields(k4)).toContain("burdenedGiftInfo.carryoverDonorBasis.donorBuilt");
    const k1 = await post(body({ ...INFO({ donorBuilt: DB_NEW }), valuationMode: "sangjeungbeop_standard", acquisitionMethod: undefined }));
    expect(k1.status).toBe(400);
    const k7 = await post(body(INFO({ donorBuilt: DB_NEW, presumedLandAcquisitionPrice: 100_000_000, presumedBuildingAcquisitionPrice: 200_000_000 }, { acquisitionMethod: "appraisal" })));
    expect(k7.status).toBe(400);
    expect(k7.errText).toContain("환산취득가액(K-5)");
  });
  it("양도인 본인 신축(buildingAcquisitionCause = newConstruction)과 동시 입력 거부 — 두 축 혼동 차단", async () => {
    const r = await post(body(withDb(DB_NEW), {}, { buildingAcquisitionCause: "newConstruction" }));
    expect(r.status).toBe(400);
    expect(r.errText).toContain("다른 축");
    expect(fields(r)).toContain("burdenedGiftInfo.carryoverDonorBasis.donorBuilt");
  });
  it("이월과세가 아닌 부담부증여에 donorBuilt 를 보내면 거부", async () => {
    const r = await post(body(withDb(DB_NEW), { acquisitionCause: "purchase", carryoverTaxation: undefined }));
    expect(r.status).toBe(400);
    expect(fields(r)).toContain("burdenedGiftInfo.carryoverDonorBasis.donorBuilt");
  });
  it("일체 주택용 housing 키는 받지 않는다(strict)", async () => {
    const r = await post(body(withDb({ ...DB_NEW, housing: { landPricePerSqmAtAcquisition: 1, landArea: 1, buildingStdPriceAtAcquisition: 1, landStdPriceAtTransfer: 1, buildingStdPriceAtTransfer: 1 } })));
    expect(r.status).toBe(400);
  });
  it("신축일이 빈 문자열 · 형식 오류 — 500 이 아니라 400 (Zod 형식 오류만 낸다 · 범위 비교는 건너뛴다)", async () => {
    for (const bad of ["", "2022-13-45", "abc"]) {
      const r = await post(body(withDb({ ...DB_NEW, constructionDate: bad })));
      expect(r.status, bad).toBe(400);
      expect(fields(r), bad).toContain("burdenedGiftInfo.carryoverDonorBasis.donorBuilt.constructionDate");
    }
  });
  it("신축일이 당초 증여자 취득일 전 / 증여 등기접수일 후", async () => {
    expect((await post(body(withDb({ ...DB_NEW, constructionDate: "2014-12-31" })))).status).toBe(400);
    expect((await post(body(withDb({ ...DB_NEW, constructionDate: "2024-05-02" })))).status).toBe(400);
  });
  it("일반건물 입력(generalBuildingValuation) 없이 donorBuilt 만 보내면 거부(일반건물 경로를 타지 않아 받아 놓고 무시하게 된다)", async () => {
    const r = await post({ ...body(withDb(DB_NEW)), generalBuildingValuation: undefined });
    expect(r.status).toBe(400);
    expect(fields(r)).toContain("burdenedGiftInfo.carryoverDonorBasis.donorBuilt");
  });
  it("지분 분할 취득(축 B) 주 자산 payload 의 최상위 burdenedGiftInfo 에 donorBuilt 가 있어도 거부", async () => {
    const shares = {
      ...body(withDb(DB_NEW)),
      generalBuildingShares: [
        { shareId: "s1", shareLabel: "지분 1", ownershipRatio: 0.6, burdenedGiftInfo: INFO(), valuation: { ...GB, actualPriceMode: true, buildingAcquisitionCause: "purchase" }, acquisitionDate: "2024-05-01" },
        { shareId: "s2", shareLabel: "지분 2", ownershipRatio: 0.4, burdenedGiftInfo: INFO(), valuation: { ...GB, actualPriceMode: true, buildingAcquisitionCause: "purchase" }, acquisitionDate: "2024-05-01" },
      ],
    };
    const r = await post(shares);
    expect(r.status).toBe(400);
    expect(fields(r)).toContain("burdenedGiftInfo.carryoverDonorBasis.donorBuilt");
  });
  it("일반건물 지분 분할 취득(축 B) payload — 지분의 부담부증여 정보에 donorBuilt 가 있으면 거부(F27 을 타지 않아 받아 놓고 무시하게 된다)", async () => {
    const share = (donor: boolean) => ({
      ...body(INFO()),
      generalBuildingShares: [
        { shareId: "s1", shareLabel: "지분 1", ownershipRatio: 0.6, burdenedGiftInfo: donor ? withDb(DB_NEW) : INFO(), valuation: { ...GB, actualPriceMode: true, buildingAcquisitionCause: "purchase" }, acquisitionDate: "2024-05-01" },
        { shareId: "s2", shareLabel: "지분 2", ownershipRatio: 0.4, burdenedGiftInfo: INFO(), valuation: { ...GB, actualPriceMode: true, buildingAcquisitionCause: "purchase" }, acquisitionDate: "2024-05-01" },
      ],
    });
    const control = await post(share(false)); // donorBuilt 만 빼면 같은 payload 가 통과한다 — 아래 400 의 원인이 donorBuilt 뿐임을 고정
    expect(control.status, control.errText).toBe(200);
    const r = await post(share(true));
    expect(r.status).toBe(400);
    expect(fields(r)).toContain("generalBuildingShares.0.burdenedGiftInfo.carryoverDonorBasis.donorBuilt");
  });
});

describe("DB-5 [회귀 0] donorBuilt 부재 — 가산세 0 · 응답에 echo 없음", () => {
  it("K-5 A 채택 / B 채택 모두 가산세 0 이고 donorBuiltPenalty 가 없다", async () => {
    const a = await post(body(INFO()));
    const b = await post(body(INFO({ landStdPriceAtAcquisition: 60_000_000, buildingStdPriceAtAcquisition: 80_000_000 })));
    expect(a.adopted).toBe("A");
    expect(b.adopted).toBe("B");
    for (const r of [a, b]) {
      expect(r.pen).toBe(0);
      expect(r.echo).toBeUndefined();
      expect(r.warnings).not.toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
    }
  });
  it("양도인 본인 신축 K-5 + 이월과세(donorBuilt 없음) — echo·증여자 고지가 없다 (본인 신축 축은 5b 그대로: B 시나리오 호출에서만 신호가 실린다)", async () => {
    const r = await post(body(INFO(), {}, { buildingAcquisitionCause: "newConstruction", buildingAcquisitionDate: "2022-01-10" }));
    expect(r.status, r.errText).toBe(200);
    expect(r.echo).toBeUndefined();
    expect(r.warnings).not.toContain(DONOR_BUILT_APPLIED_NOTICE);
    expect(r.warnings).not.toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
  });
});
