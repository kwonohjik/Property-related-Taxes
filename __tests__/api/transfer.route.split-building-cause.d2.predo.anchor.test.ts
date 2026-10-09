/**
 * Pre-Do anchor: 「건물 상속·증여 + 토지 매매」(Phase D2) — **현행 동작 고정** (2026-10-09)
 *
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d2.engine.design.md §2·§3·§5·§8
 * 계획: docs/00-pm/transfer-acq-cause-mixed.plan.md §4 D2 · §7 V-2·V-3·V-4·V-11
 * 짝(UI·클라이언트): __tests__/calc/transfer-land-part-cause.d2.predo.test.ts
 *
 * D2-1(2026-10-09)에서 `[전환 D2 · Yn]` 줄을 400 기대로 뒤집고 todo를 활성화했다(설계 문서 §8 표와 1:1).
 * 전환 표시가 없는 줄(A·B)은 D2 전후 **그대로**다(회귀 0 — 깨지면 회귀다). 종전(침묵 통과) 값은 각 테스트 주석에 남겼다.
 *
 * 공통 시드: 주택, 양도 12억(토지 7억/건물 5억), 양도일 2026-06-30, 별개 취득, 파트 실가(토지 3억·건물 4억), 비과세 아님.
 * 건물 = 상속(피상속인 취득 2000-01-01, 상속개시 2025-05-01) · 토지 = 매매(`landAcquisitionCause: "purchase"` 명시).
 * 손계산 규약: 양도차익 = 토지 4억 + 건물 1억. 장특은 파트별 자기 취득일부터(§95④ — 상속은 단서 열거 없음 = 개시일부터,
 * 일반 연 2%·3년 미만 0·최대 30%). 기본공제 250만원은 높은 세율 파트(토지 60%)에 먼저 배분(MAX_BENEFIT).
 * 40%대 구간 산출세액 = 과세표준 × 40% − 25,940,000. 건물 1억(기본세율) = 1억 × 35% − 15,440,000 = 19,560,000.
 * ⚠️ 수치는 `makeMockRates()` 실측이지 정본 세액이 아니다 — 같은 시드의 상대 비교가 본질이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-acquisition";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-companion-payload";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const req = (b: object) =>
  new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });

const BASE = {
  propertyType: "housing",
  useEstimatedAcquisition: false,
  transferPrice: 1_200_000_000,
  transferDate: "2026-06-30",
  acquisitionDate: "2018-03-02",
  landAcquisitionDate: "2008-05-10",
  acquisitionPrice: 0,
  expenses: 0,
  isOneHousehold: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  residencePeriodMonths: 0,
  annualBasicDeductionUsed: 0,
  isSeparateAcquisition: true,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  saleSplitMode: "actual",
  landTransferPrice: 700_000_000,
  buildingTransferPrice: 500_000_000,
  landStandardPriceAtTransfer: 700_000_000,
  buildingStandardPriceAtTransfer: 500_000_000,
  landAcquisitionPrice: 300_000_000,
  buildingAcquisitionPrice: 400_000_000,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(over: Record<string, unknown>): Promise<{ status: number; body: any; r: any }> {
  const merged: Record<string, unknown> = { ...BASE, ...over };
  for (const k of Object.keys(merged)) if (merged[k] === "__DEL__") delete merged[k];
  const res = await POST(req(merged));
  const body = await res.json();
  return { status: res.status, body, r: body?.data?.result };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const messages = (body: any): string => JSON.stringify(body.error ?? body);

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

/** S3d — 건물 상속(개시 2025-05-01, 피상속인 2000-01-01) + 토지 매매 2025-01-10(개시 4개월 전). */
const D2_INH = {
  acquisitionCause: "inheritance",
  decedentAcquisitionDate: "2000-01-01",
  acquisitionDate: "2025-05-01",
  landAcquisitionCause: "purchase",
  landAcquisitionDate: "2025-01-10",
};

describe("D2-A 엔진은 이 조합을 이미 처리한다 — 세율은 파트별로 갈린다 (V-2 · S3d)", () => {
  it("D2-A1 S3d: 건물 기본세율(피상속인 통산) + 토지 60% = 258,060,000 — ⑫는 `purchase` overlay를 받는다", async () => {
    // 토지 1년 5개월(장특 0) · 건물 개시일부터 1년(장특 0) → 5억 − 250만 = 497,500,000
    // 토지 60%: (4억 − 250만) = 397,500,000 × 60% = 238,500,000 / 건물 1억 기본세율 = 19,560,000 → 합 258,060,000
    // §104⑤ 비교: 합산 누진 497,500,000 × 40% − 25,940,000 = 173,060,000 < 258,060,000 → 파트합이 채택
    const { status, r } = await post(D2_INH);
    expect(status).toBe(200);
    expect(r.determinedTax).toBe(258_060_000);
    expect(r.taxBase).toBe(497_500_000);
    expect(r.splitDetail.land.longTermDeduction).toBe(0);
    expect(r.splitDetail.building.longTermDeduction).toBe(0);
    // 개산공제 0 — 상속 건물은 평가액(실가) 취급, 토지는 실가
    expect(r.splitDetail.land.appraisalDeduction).toBe(0);
    expect(r.splitDetail.building.appraisalDeduction).toBe(0);
    // echo(D1-3): 토지 = 자기 취득일(own) + 주택 max로 적용 기산일은 건물 취득일(상속개시일), 건물 = 피상속인 통산(decedent)
    expect(r.splitDetail.land).toMatchObject({
      acquisitionCause: "purchase",
      rateBasisRule: "own",
      rateBasisAcquisitionDate: "2025-01-10",
      appliedRateBasisDate: "2025-05-01",
    });
    expect(r.splitDetail.building).toMatchObject({
      acquisitionCause: "inheritance",
      acquisitionDate: "2025-05-01",
      rateBasisRule: "decedent",
      rateBasisAcquisitionDate: "2000-01-01",
      appliedRateBasisDate: "2000-01-01",
    });
    expect(r.splitDetail.partRateBasisApplied).toBe(true);
  });

  it("D2-A2 토지 취득일 변주(V-2 · 주택 max의 방향): 이전 2020 → 229,260,000 / 개시 1년 3개월 전 2024-01-10 → 258,060,000 / 이후 2025-09-01 → 297,810,000", async () => {
    // 이전 2020-01-10: 토지 6년 12% = 48,000,000 → 소득 4.52억 − 250만 = 449,500,000.
    //   토지 기산 = max(2020-01-10, 건물 취득일=개시일 2025-05-01) → 1년 1개월 → 60%: (4억 − 4,800만 − 250만) = 349,500,000 × 60% = 209,700,000 + 건물 19,560,000 = 229,260,000
    // 이전 2024-01-10: 토지 2년 5개월(장특 0). 기산 max → 2025-05-01 → 60%: 397,500,000 × 60% + 19,560,000 = 258,060,000
    // 이후 2025-09-01: 토지 10개월 → 70%: 397,500,000 × 70% = 278,250,000 + 19,560,000 = 297,810,000
    const a = await post({ ...D2_INH, landAcquisitionDate: "2020-01-10" });
    const b = await post({ ...D2_INH, landAcquisitionDate: "2024-01-10" });
    const c = await post({ ...D2_INH, landAcquisitionDate: "2025-09-01" });
    expect([a.r.determinedTax, b.r.determinedTax, c.r.determinedTax]).toEqual([229_260_000, 258_060_000, 297_810_000]);
    expect(a.r.splitDetail.land.holdingYears).toBe(6);
    expect(a.r.splitDetail.land.longTermDeduction).toBe(48_000_000);
    expect(a.r.splitDetail.land.appliedRateBasisDate).toBe("2025-05-01"); // ← Q-D2-1: 건물 「개시일」 기준 max. 피상속인 기준이면 2020-01-10
    expect(b.r.splitDetail.land.appliedRateBasisDate).toBe("2025-05-01");
    expect(c.r.splitDetail.land.appliedRateBasisDate).toBe("2025-09-01");
  });

  it("D2-A3 건물 증여(통산 없음): 토지 이전 2025-01-10 → 298,500,000 / 2020-01-10 → 269,700,000 — 두 파트 모두 60% 단일", async () => {
    // 단순 증여는 §104②2호(이월과세만) 비해당 → 건물 기산 = 증여일. 토지 기산 max(자기, 증여일) = 증여일 → 둘 다 1년 1개월 = 60%.
    // 2025-01-10: 497,500,000 × 60% = 298,500,000
    // 2020-01-10: 토지 장특 48,000,000 → (5억 − 4,800만 − 250만) = 449,500,000 × 60% = 269,700,000
    const G = { ...D2_INH, acquisitionCause: "gift", decedentAcquisitionDate: "__DEL__", donorAcquisitionDate: "2000-01-01" };
    const a = await post(G);
    const b = await post({ ...G, landAcquisitionDate: "2020-01-10" });
    expect(a.r.determinedTax).toBe(298_500_000);
    expect(b.r.determinedTax).toBe(269_700_000);
    expect(a.r.splitDetail.building).toMatchObject({ acquisitionCause: "gift", rateBasisRule: "own", appliedRateBasisDate: "2025-05-01" });
    expect(a.r.splitDetail.partRateBasisApplied).toBe(true); // 판정은 했고(judged) 세율이 같아 합쳐 계산(게이트 7)
  });

  it("D2-A4 같은 날(L = E)은 엔진이 통과한다 — 258,060,000. D1 같은 날(원인 무의미)과 달리 D2는 원인이 세율을 가른다", async () => {
    // 토지 기산 max(2025-05-01, 2025-05-01) = 2025-05-01 → 60%, 건물은 피상속인 통산 기본세율 → S3d와 같은 값.
    for (const isSeparateAcquisition of [true, false]) {
      const x = await post({ ...D2_INH, landAcquisitionDate: "2025-05-01", isSeparateAcquisition });
      expect(x.status).toBe(200);
      expect(x.r.determinedTax).toBe(258_060_000);
    }
  });
});

describe("D2-B 비과세 축 (V-3) — 현행 유지 (엔진 변경 0)", () => {
  // 1세대1주택, 양도 12억(= 고가주택 기준 이하 → 전액 비과세 후보)
  const EX = { isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 14 };

  it("D2-B1 개시 1년 2개월(통산 없음) → 비과세 아님 243,660,000 / 동일세대 통산(영 §154⑧3호) → 전액 비과세 0 (토지 개시 전 2023-01-01)", async () => {
    // 비과세 아님: 토지 3년 6% = 24,000,000 → 토지 (4억 − 2,400만 − 250만) = 373,500,000 × 60% = 224,100,000 + 건물 19,560,000 = 243,660,000
    const a = await post({ ...D2_INH, ...EX, landAcquisitionDate: "2023-01-01" });
    expect(a.r.isExempt).toBe(false);
    expect(a.r.determinedTax).toBe(243_660_000);
    const b = await post({
      ...D2_INH, ...EX, landAcquisitionDate: "2023-01-01",
      decedentSameHouseholdBeforeInheritance: true, decedentCohabitationHoldingStartDate: "2010-01-01", decedentCohabitationResidenceMonths: 180,
    });
    expect(b.r.isExempt).toBe(true);
    expect(b.r.determinedTax).toBe(0);
  });

  it("D2-B2 건물 개시 3년 · 토지 개시 후 취득 2025-02-01(1년 5개월) → 토지분만 과세 238,500,000 / 토지가 개시 전 2019 → 전액 비과세 0", async () => {
    // isLaterAcquiredLandExemptExcluded: 토지가 건물 취득일(개시일)보다 늦고 보유 2년 미만 → 토지분 제외.
    //   토지 (4억 − 250만) = 397,500,000 × 60% = 238,500,000
    const S = { ...D2_INH, ...EX, acquisitionDate: "2023-05-01", residencePeriodMonths: 36 };
    const later = await post({ ...S, landAcquisitionDate: "2025-02-01" });
    const earlier = await post({ ...S, landAcquisitionDate: "2019-02-01" });
    expect(later.r.determinedTax).toBe(238_500_000);
    expect(earlier.r.isExempt).toBe(true);
    expect(earlier.r.determinedTax).toBe(0);
  });

  it("D2-B3 [전환 D2 · Y8] overlay를 빼면 400 — 종전: 토지가 「상속」으로 읽혀 같은 시드가 238,500,000 → 133,060,000(−105,440,000 침묵 과소). D2 UI는 항상 `purchase`를 보낸다", async () => {
    // 부재 → 토지 원인 = 자산 원인(상속) → 토지 법정 기산 = 피상속인 2000 → max(2000, 개시 2023-05-01) = 2023-05-01 → 2년 이상 기본세율
    //   397,500,000 × 40% − 25,940,000 = 133,060,000 (종전 값)
    const S = { ...D2_INH, ...EX, acquisitionDate: "2023-05-01", residencePeriodMonths: 36, landAcquisitionDate: "2025-02-01" };
    const withOverlay = await post(S);
    const without = await post({ ...S, landAcquisitionCause: "__DEL__" });
    expect(withOverlay.r.determinedTax).toBe(238_500_000);
    expect(without.status).toBe(400);
    expect(messages(without.body)).toContain("토지 취득원인이 없습니다");
    // 긍정 짝: 같은 날(소유자 분리·PHD가 토지일을 건물일로 후퇴시켜 보내는 경우)은 overlay 없이도 통과
    expect((await post({ ...S, landAcquisitionCause: "__DEL__", landAcquisitionDate: "2023-05-01" })).status).toBe(200);
  });
});

describe("D2-C 침묵 통과를 막는다 [전환 D2 · Y*] (상속·증여 건물 + 토지 `purchase`) — 종전 값은 주석", () => {
  const FB = { familyBusinessInheritance: { decedentAcquisitionPrice: 100_000_000, inheritanceMarketValue: 300_000_000, fbDeductionAppliedRate: 1, inheritanceDate: "2025-05-01" } };
  const BG = {
    transferType: "burdened_gift",
    burdenedGiftInfo: {
      valuationMode: "sangjeungbeop_market", acquisitionMethod: "actual", marketValueAtTransfer: 1_200_000_000,
      actualLandAcquisitionPrice: 300_000_000, actualBuildingAcquisitionPrice: 400_000_000, donorRelation: "lineal_descendant",
      lendingDepositTotal: 0, mortgageDebtAmount: 300_000_000, annualRentTotal: 0,
      landStdPriceAtTransfer: 700_000_000, buildingStdPriceAtTransfer: 500_000_000,
      landStdPriceAtAcquisition: 300_000_000, buildingStdPriceAtAcquisition: 400_000_000,
    },
  };
  const PHD = {
    preHousingDisclosure: {
      firstDisclosureDate: "2005-04-30", firstDisclosureHousingPrice: 400_000_000, landArea: 100, landPricePerSqmAtAcquisition: 1_000_000,
      buildingStdPriceAtAcquisition: 100_000_000, landPricePerSqmAtFirstDisclosure: 1_200_000, buildingStdPriceAtFirstDisclosure: 110_000_000,
      transferHousingPrice: 900_000_000, landPricePerSqmAtTransfer: 2_000_000, buildingStdPriceAtTransfer: 150_000_000,
    },
  };
  const blocked = async (over: Record<string, unknown>, needle: string) => {
    const x = await post({ ...D2_INH, ...over });
    expect(x.status, JSON.stringify(x.body)).toBe(400);
    expect(messages(x.body)).toContain(needle);
  };

  it("D2-C0 [유지 · R-X5] 건물 상속·증여 + 토지 상속·증여 → ⑫ 400 (D3 범위) · 긍정 짝은 D2-A1", async () => {
    const a = await post({ ...D2_INH, landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "1995-01-01" });
    const b = await post({ ...D2_INH, landAcquisitionCause: "gift" });
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
    expect(messages(a.body)).toContain("건물을 상속·증여·이월과세·부담부증여로 취득한 자산에서 토지 취득원인을");
    expect(messages(a.body)).toContain("토지 취득원인은 매매만 지정할 수 있습니다");
  });

  it("D2-C1 [Y3] 상속 건물 환산 → 400 field buildingAcqMode (종전 200·291,140,000·건물 개산공제 9,000,000) · 긍정 짝 토지 환산은 허용", async () => {
    const x = await post({ ...D2_INH, buildingAcqMode: "estimated", buildingStandardPriceAtAcquisition: 300_000_000 });
    expect(x.status).toBe(400);
    expect(x.body.error.fieldErrors.buildingAcqMode?.[0]).toContain("상속·증여로 취득한 건물은 취득가액을");
    const land = await post({ ...D2_INH, landAcqMode: "estimated", standardPricePerSqmAtAcquisition: 1_000_000, acquisitionArea: 100, standardPriceAtTransfer: 1_000_000_000 });
    expect(land.status).toBe(200);
    expect(land.r.splitDetail.land.acqMode).toBe("estimated");
  });

  it("D2-C2 [Y1] 가업상속 입력 → 400 (종전 200·258,060,000 침묵 무시)", async () => {
    await blocked(FB, "가업상속공제가 적용된 자산");
    expect((await post(D2_INH)).r.determinedTax).toBe(258_060_000);
  });

  it("D2-C3 [Y1] 소유자 분리 → 400 (종전 land_only 133,060,000 · building_only 18,685,000 — overlay 무시) · selfOwns both는 통과", async () => {
    for (const selfOwns of ["land_only", "building_only"]) await blocked({ selfOwns }, "한쪽만 소유한 자산");
    expect((await post({ ...D2_INH, selfOwns: "both" })).status).toBe(200);
  });

  it("D2-C4 [Y1] 부담부증여 transferType → 400 (종전 200 — §159 총액과 어긋난 분리 입력)", async () => {
    await blocked(BG, "부담부증여로 양도하는 자산");
  });

  it("D2-C5 [Y4] 건물 개시 2005-04-29 이전 → 400 field acquisitionDate (종전 200·113,060,000, §163⑨ 단서 2호 비교 없음) · 당일 2005-04-30은 200 · 증여도 동일", async () => {
    const pre = { acquisitionDate: "2003-05-01", decedentAcquisitionDate: "1990-01-01", landAcquisitionDate: "2003-01-10" };
    // [D2-4a 전환 · 문구] 이 시드는 주택 구분 사실(buildingHouseKind)이 없다 = 「모름」 → 단독·다가구로 보지 않는 Y4d 문구로 400(field 불변).
    //   단독·다가구 + ②는 열린다 — `transfer.route.split-building-sec164.d2-4a.anchor.test.ts`. 비주택 `building`은 종전 문구(같은 파일 A-10).
    await blocked(pre, "단독·다가구주택으로 확인된 주택만 지원합니다");
    await blocked({ ...pre, acquisitionCause: "gift", decedentAcquisitionDate: "__DEL__", donorAcquisitionDate: "1990-01-01" }, "단독·다가구주택으로 확인된 주택만 지원합니다");
    expect((await post({ ...D2_INH, acquisitionDate: "2005-04-29", decedentAcquisitionDate: "1990-01-01", landAcquisitionDate: "2005-01-10" })).status).toBe(400);
    const edge = await post({ ...D2_INH, acquisitionDate: "2005-04-30", decedentAcquisitionDate: "1990-01-01", landAcquisitionDate: "2005-01-10" });
    expect(edge.status).toBe(200);
    // 경계 당일 손계산: 토지 21년 30% = 120,000,000 · 건물 21년 30% = 30,000,000 → 5억 − 1.5억 − 250만 = 347,500,000 × 40% − 25,940,000 = 113,060,000
    expect(edge.r.determinedTax).toBe(113_060_000);
  });

  it("D2-C6 [Y2] 토지 취득일 없음 → 400 field landAcquisitionDate (종전 200·472,935,000·splitDetail 없음)", async () => {
    const x = await post({ ...D2_INH, landAcquisitionDate: "__DEL__" });
    expect(x.status).toBe(400);
    expect(x.body.error.fieldErrors.landAcquisitionDate?.[0]).toContain("토지 취득일이 필요합니다");
  });

  it("D2-C7 [Y7] 자산 단위 `inheritedAcquisition` 동봉 → 400 (종전 200·세액 불변·결과에 450,000,000 「상속 취득가액 의제」 단계가 남는 표시 드리프트)", async () => {
    const IA = { inheritedAcquisition: { mode: "post-deemed", inheritanceStartDate: "2025-05-01", assetKind: "house_individual", reportedValue: 450_000_000, reportedMethod: "supplementary" } };
    const x = await post({ ...D2_INH, ...IA });
    expect(x.status).toBe(400);
    expect(x.body.error.fieldErrors.inheritedAcquisition?.[0]).toContain("자산 단위 상속 취득가액 의제");
    // 긍정 짝: 제거하면 종전 값, 결과에 의제 단계 없음
    const y = await post(D2_INH);
    expect(y.r.determinedTax).toBe(258_060_000);
    expect(y.r.inheritedAcquisitionDetail).toBeUndefined();
  });

  it("D2-C8 [Y1] PHD → 400 (경계일 전 시드에서 PHD 전용 메시지가 Y4보다 먼저 — 구조 규칙이 앞)", async () => {
    const x = await post({ ...D2_INH, ...PHD, acquisitionDate: "2003-05-01", decedentAcquisitionDate: "1990-01-01", landAcquisitionDate: "2003-01-10", buildingAcqMode: "estimated", landAcqMode: "estimated" });
    expect(x.status).toBe(400);
    expect(messages(x.body)).toContain("개별주택가격이 공시되기 전에 취득한 주택의 환산");
  });

  it("D2-C10 [Y9] 같은 날(isSeparateAcquisition false → 파트 완결 규칙 꺼짐) + 파트 가액 없음 → 400 (종전 200·472,935,000·splitDetail 없음 — 취득가액 0) · 가액이 있으면 200", async () => {
    const same = { landAcquisitionDate: "2025-05-01" };
    for (const isSeparateAcquisition of [true, false]) {
      const x = await post({ ...D2_INH, ...same, isSeparateAcquisition, buildingAcquisitionPrice: "__DEL__", landAcquisitionPrice: "__DEL__" });
      expect(x.status, JSON.stringify(x.body)).toBe(400);
      expect(x.body.error.fieldErrors.buildingAcquisitionPrice?.[0]).toContain("건물 취득가액");
    }
    const noLand = await post({ ...D2_INH, ...same, landAcquisitionPrice: "__DEL__" });
    expect(noLand.status).toBe(400);
    expect(noLand.body.error.fieldErrors.landAcquisitionPrice?.[0]).toContain("토지 취득가액");
    expect((await post({ ...D2_INH, ...same })).status).toBe(200);
  });

  it("D2-C9 [R-X5 개정] 건물 이월과세·부담부증여 acquisitionCause + 토지 매매 → 400", async () => {
    const x = await post({ ...D2_INH, acquisitionCause: "burdened_gift" });
    expect(x.status).toBe(400);
    expect(messages(x.body)).toContain("이월과세(증여)·부담부증여로 취득한 자산에서는 토지 취득원인을 따로 지정할 수 없습니다");
  });
});

describe("D2-D ⑧·④·⑫ 연결부 — 자산 단위 상속 요구와 파트 입력의 충돌을 푼다 [전환 D2 · Y7]", () => {
  const asset = (over: Partial<AssetForm> = {}) =>
    ({
      ...makeDefaultAsset(1),
      assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2025-05-01", decedentAcquisitionDate: "2000-01-01",
      landCauseHost: "inheritance", landAcquisitionCause: "purchase", landAcquisitionDate: "2025-01-10", hasSeperateLandAcquisitionDate: true,
      landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300000000", buildingAcquisitionPrice: "400000000",
      standardPriceAtTransfer: "1200000000", landStandardPriceAtTransfer: "700000000", buildingStandardPriceAtTransfer: "500000000", ...over,
    }) as unknown as AssetForm;

  it("D2-D1 ⑧ 단일 자산: 건물 파트 평가액을 채우면 통과 (종전: 「상속개시일 평가액(상속세 신고가액)을 입력하세요」 막다른 길) · 비우면 건물 취득가액 칸으로 이동", () => {
    expect(validateAssetAcquisition(asset(), "자산1", "2026-06-30")).toBeNull();
    expect(validateAssetAcquisition(asset({ buildingAcquisitionPrice: "" }), "자산1", "2026-06-30")).toContain("건물 취득가액");
    // 긍정 짝: D2가 아니면(overlay·호스트 없음) 종전 자산 단위 ① 요구
    expect(validateAssetAcquisition(asset({ landAcquisitionCause: "", landCauseHost: "", hasSeperateLandAcquisitionDate: false }), "자산1", "2026-06-30")).toBe(
      "자산1: 상속개시일 평가액(상속세 신고가액)을 입력하세요.",
    );
  });

  it("D2-D2 컴패니언: ④가 overlay `purchase`를 싣고 빈 자산 단위 `inheritanceValuation`을 싣지 않는다 → CP-1 면제로 ⑫ 통과 (종전 400 companionAssets.0.inheritanceValuation)", () => {
    const comp = buildAssetPayload({ ...asset(), assetId: "c1" } as AssetForm, "apportioned", "2026-06-30") as Record<string, unknown>;
    expect(comp.landAcquisitionCause).toBe("purchase");
    expect(comp.inheritanceValuation).toBeUndefined();
    const body = {
      propertyType: "land", transferDate: "2026-06-30", transferPrice: 300_000_000, acquisitionDate: "2015-01-01",
      acquisitionPrice: 100_000_000, expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 0, isRegulatedArea: false,
      wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false, reductions: [],
      annualBasicDeductionUsed: 0, residencePeriodMonths: 0, standardPriceAtTransferForApportion: 400_000_000,
      totalSalePrice: 1_500_000_000, companionAssets: [comp],
    };
    const r = propertySchema.safeParse(body);
    expect(r.success).toBe(true);
  });
});

describe("D2-E 세액 불변·고지 (D2-Q1 A안) — 시드 전환 후에도 수치 그대로", () => {
  it("D2-E1 고지: 2020-01-10·2024-01-10(구간이 갈림)은 warnings 1줄, 2025-01-10·개시 후·증여는 없음 · 세액은 D2-A2 그대로", async () => {
    const note = (r: { r: { warnings?: string[] } }) => (r.r.warnings ?? []).filter((w) => /받기 전/.test(w));
    const a = await post({ ...D2_INH, landAcquisitionDate: "2020-01-10" });
    const b = await post({ ...D2_INH, landAcquisitionDate: "2024-01-10" });
    expect(note(a)).toHaveLength(1);
    expect(note(b)).toHaveLength(1);
    expect(a.r.determinedTax).toBe(229_260_000);
    expect(b.r.determinedTax).toBe(258_060_000);
    expect(note(await post(D2_INH))).toHaveLength(0);
    expect(note(await post({ ...D2_INH, landAcquisitionDate: "2025-09-01" }))).toHaveLength(0);
    // 증여 건물도 같은 앵커(증여일) — 구간이 갈리면 증여일 문구로 낸다(Q-D2-2, 사용자 결정 「두 기산이 갈릴 때 고지」)
    const g = await post({ ...D2_INH, acquisitionCause: "gift", decedentAcquisitionDate: "__DEL__", donorAcquisitionDate: "2000-01-01", landAcquisitionDate: "2020-01-10" });
    expect(note(g)).toHaveLength(1);
    expect(note(g)[0]).toContain("증여일(2025-05-01)부터");
    expect(g.r.determinedTax).toBe(269_700_000);
  });
});

describe("D2-F 토지 매매 파트 환산 · 개산공제 값 (취득가액 리뷰 c) — 토지는 자기 매매 취득이라 환산 허용, 건물은 평가액이라 개산공제 0", () => {
  it("D2-F1 토지 환산: 환산취득가 = 토지 양도가 7억 × 취득시 기준시가 1억 ÷ 양도시 토지 기준시가 7억 = 1억 · 개산공제 = 취득시 기준시가 1억 × 3% = 3,000,000 → 376,260,000", async () => {
    // 토지 양도차익 = 7억 − 1억 − 300만 = 597,000,000 · 건물 = 5억 − 4억(평가액, 개산공제 0) = 100,000,000 → 합 697,000,000 − 기본공제 250만 = 694,500,000
    // 토지 60%(1년 5개월): (597,000,000 − 2,500,000) × 60% = 356,700,000 · 건물 1억 기본세율 19,560,000 → 376,260,000
    const x = await post({ ...D2_INH, landAcqMode: "estimated", standardPricePerSqmAtAcquisition: 1_000_000, acquisitionArea: 100, standardPriceAtTransfer: 1_000_000_000 });
    expect(x.status, JSON.stringify(x.body)).toBe(200);
    expect(x.r.determinedTax).toBe(376_260_000);
    expect(x.r.taxBase).toBe(694_500_000);
    expect(x.r.splitDetail.land).toMatchObject({ acqMode: "estimated", acquisitionPrice: 100_000_000, appraisalDeduction: 3_000_000, gain: 597_000_000 });
    expect(x.r.splitDetail.building).toMatchObject({ acqMode: "actual", acquisitionPrice: 400_000_000, appraisalDeduction: 0, gain: 100_000_000 });
  });
  it("D2-F2 건물 증여여도 같다(개산공제 0·토지만 환산) · 토지 실가 대조군은 개산공제 0 — 258,060,000", async () => {
    const g = await post({ ...D2_INH, acquisitionCause: "gift", decedentAcquisitionDate: "__DEL__", donorAcquisitionDate: "2000-01-01", landAcqMode: "estimated", standardPricePerSqmAtAcquisition: 1_000_000, acquisitionArea: 100, standardPriceAtTransfer: 1_000_000_000 });
    expect(g.status).toBe(200);
    expect(g.r.splitDetail.land.appraisalDeduction).toBe(3_000_000);
    expect(g.r.splitDetail.building.appraisalDeduction).toBe(0);
    expect((await post(D2_INH)).r.splitDetail.land.appraisalDeduction).toBe(0);
  });
});

// D2-3 표시(4뷰 원인 행·건물 가액 태그)는 `__tests__/components/split-acq-cause-mixed-d2-3.ui.anchor.test.tsx`로 활성화했다.
describe("D2 후 기대 — todo (D2-4 경계일 전 max · 선택안 B)", () => {
  it.todo("Q-D2-1=B(피상속인 앵커) 채택 시에만: 2020-01-10 → 153,860,000(토지 6년 12% = 4,800만 · 5억 − 4,800만 − 250만 = 449,500,000 × 40% − 25,940,000) / 2024-01-10 → 173,060,000(497,500,000 × 40% − 25,940,000) — A안으로 확정돼 비활성");
  // D2-4a(엔진·⑫·⑭·④)로 활성화 → `transfer.route.split-building-sec164.d2-4a.anchor.test.ts`. 화면(⑤ 카드·⑧ 완화)은 D2-4b.
});
