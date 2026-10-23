/**
 * PR-7b-2 — 의제취득일(1985.1.1.) 전 상속·증여 일반건물 × 부담부증여 × 기준시가 평가 (계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` §6).
 *
 * 사용자 결정 Q-25(기준시가 평가 → 의제취득일 기준시가 × 채무비율). 일반건물은 GB 취득시 기준시가 칸이 그 기준시가다.
 * 종전(master 19400ffb3)에는
 *  · G-1 — 1985 전 **상속**이면 ⑧ E-1이 ① 또는 「확인할 수 없음」 선언을 요구했는데 일반건물 화면에는 둘 다 없어 계산할 수 없었다.
 *  · G-3 — 1990.8.30. 전 상속·증여 토지에 등급만 넣으면(화면은 환산값 표시) ⑧·④·엔진이 직접 입력 칸만 읽어 400이었다.
 *
 * 화면 경로(폼 → ⑧ → ④ body → route ⑫⑭ → 엔진). 시료: 1983-07-26 상속 · 2023-02-16 부담부증여 · 토지 100㎡ ·
 * 양도시 토지 2,000,000/㎡ · 건물 200,000,000 · 취득시(의제취득일) 토지 300,000/㎡ · 건물 30,000,000 · 채무 500,000,000
 * (기준시가 400,000,000보다 커 담보평가가 이겨 증여가액 500,000,000 — 채무비율 1). 등급 환산 = 458,432/㎡. 세율은 mock.
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
import { needsClauseADeclaration } from "@/lib/calc/transfer-tax-validate-clause-a";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const GB: Record<string, unknown> = {
  addressJibun: "서울 강남구 테스트동 8-8",
  assetKind: "general_building",
  acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "inheritance",
  acquisitionDate: "1983-07-26",
  inheritanceStartDate: "1983-07-26",
  decedentAcquisitionDate: "1970-01-01",
  useEstimatedAcquisition: false,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  gbLandArea: "100",
  gbBuildingArea: "200",
  gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2,000,000",
  gbTransferBuildingValue: "200,000,000",
  gbAcqLandPricePerSqm: "300,000",
  gbAcqBuildingValue: "30,000,000",
  gbZoneType: "general_residential",
  transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant",
  bgMortgageDebtAmount: "500000000",
  bgLendingDepositTotal: "0",
};
const STD = { bgValuationMode: "sangjeungbeop_standard" };
/** 1990.8.30. 전 토지 등급 — 환산 458,432/㎡ */
const GRADE = {
  pre1990Enabled: true,
  pre1990Grade_current: "218",
  pre1990Grade_prev: "218",
  pre1990Grade_atAcq: "200",
  pre1990PricePerSqm_1990: "1100000",
  pre1990GradeMode: "number",
};
const GRADE_ONLY = { ...GRADE, gbAcqLandPricePerSqm: "" };

const form = (over: Record<string, unknown>): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16",
    filingDate: "2023-04-30",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
    assets: [{ ...makeDefaultAsset(1), ...GB, ...over } as AssetForm],
  }) as TransferFormData;

async function run(over: Record<string, unknown>) {
  const f = form(over);
  const issues = allIssues(f);
  const body = await captureBody(f);
  const r = await postTransfer(body);
  // 일반건물은 다건 집계 응답이다(`data.aggregated` · `data.transferBurdenedGiftBreakdown`)
  const data = r.json?.data;
  const bg = data?.transferBurdenedGiftBreakdown;
  return {
    issues,
    body,
    status: r.status,
    tax: data?.aggregated?.determinedTax,
    method: bg?.acquisitionMethodUsed,
    land: bg?.perAsset.land.acquisitionPrice,
    building: bg?.perAsset.building.acquisitionPrice,
  };
}

describe("PR-7b-2 일반건물 × 의제취득일 전 × 부담부증여 · 기준시가 평가", () => {
  it("S-1 1983 상속 · 기준시가 — ①·선언 없이 ⑧ 통과(G-1) · 취득가액 = 의제취득일 기준시가 × 채무비율 1", async () => {
    const r = await run(STD);
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.method).toBe("standard_price");
    expect([r.land, r.building]).toEqual([30_000_000, 30_000_000]);
    expect(r.tax).toBe(95_756_000);
  });

  it("S-2 채무 2억(증여가액 4억 · 채무비율 0.5) — 취득가액 15,000,000씩", async () => {
    const r = await run({ ...STD, bgMortgageDebtAmount: "200000000" });
    expect(r.issues).toEqual([]);
    expect([r.land, r.building]).toEqual([15_000_000, 15_000_000]);
    expect(r.tax).toBe(25_114_500);
  });

  it("S-3 토지 등급만 입력(직접 칸 비움) — ⑧ 통과 · ④ 등급 환산값 458,432/㎡ · 토지 취득가액 45,843,200(G-3)", async () => {
    const r = await run({ ...STD, ...GRADE_ONLY });
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect((r.body.burdenedGiftInfo as Record<string, unknown>).landStdPriceAtAcquisition).toBe(45_843_200);
    expect((r.body.generalBuildingValuation as Record<string, unknown>).acquisitionLandPricePerSqm).toBe(458_432);
    expect([r.land, r.building]).toEqual([45_843_200, 30_000_000]);
    expect(r.tax).toBe(91_330_480);
  });

  it("S-4 등급과 직접 칸이 둘 다 있으면 직접 칸 — 종전과 같다", async () => {
    const r = await run({ ...STD, ...GRADE });
    expect(r.issues).toEqual([]);
    expect(r.land).toBe(30_000_000);
    expect(r.tax).toBe(95_756_000);
  });

  it("S-5 토지만 1983 상속 · 건물 1995 신축 — 의제취득일 전 파트가 있으면 E-1 면제", async () => {
    const r = await run({
      ...STD,
      gbBuildingAcquisitionCause: "newConstruction",
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "1983-07-26",
      acquisitionDate: "1995-05-01",
    });
    expect(r.issues).toEqual([]);
    expect(r.tax).toBe(95_756_000);
  });

  it("S-6 1988 상속(의제취득일 후 · 1990.8.30. 전) 등급만 — G-3은 의제취득일과 무관하게 같은 leaf", async () => {
    const r = await run({ ...STD, acquisitionDate: "1988-07-26", inheritanceStartDate: "1988-07-26", ...GRADE_ONLY });
    expect(r.issues).toEqual([]);
    expect(r.land).toBe(45_843_200);
    expect(r.tax).toBe(91_330_480);
  });

  it("G-1 1983 증여 · 등급만 — 증여도 같은 등급 환산값", async () => {
    const r = await run({
      ...STD,
      ...GRADE_ONLY,
      acquisitionCause: "gift",
      gbBuildingAcquisitionCause: "gift",
      inheritanceStartDate: "",
    });
    expect(r.issues).toEqual([]);
    expect(r.land).toBe(45_843_200);
    expect(r.tax).toBe(91_330_480);
  });

  // ⚠️ 양도일 2023-02-16은 영 §159①1호 괄호에 상증법 §66이 들어가기(2023.2.28.) 전이다 — 엔진은 현행 문언대로 계산하고 결과 화면이 시기 단서를 알린다
  //    (`burdened-gift-valuation.ts` BG_PAREN_MORTGAGE_66_FROM · 2026-10-22 결정). 이 anchor는 그 계산 경로의 E-1 면제를 고정할 뿐 시기 해석을 확정하지 않는다.
  it("C-1 시가 평가 · 담보 승(시가 4억 < 채무 5억) — §159①1호 괄호라 기준시가 평가와 같이 E-1 면제", async () => {
    const r = await run({ bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "400000000", bgAcquisitionMethod: "converted" });
    expect(r.issues).toEqual([]);
    expect(r.method).toBe("standard_price");
    expect(r.tax).toBe(95_756_000);
  });

  it("M-1 경계: 시가 평가(담보 패) 상속은 E-1이 남는다 — 3자 max는 PR-7b-6(Q-28·Q-29)", async () => {
    const r = await run({ bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "converted" });
    expect(r.issues.map((i) => i.field)).toContain("preDeemedClauseAUnconfirmed");
  });

  it("M-1b 경계: 재개발 완공 아파트 기준시가 평가 부담부증여는 E-1 면제가 아니다 — 일반건물 술어가 다른 자산으로 새지 않는다(PR-7b-4 범위)", () => {
    const redev = {
      ...makeDefaultAsset(1),
      assetKind: "redevelopment_apt",
      acquisitionCause: "inheritance",
      acquisitionDate: "1983-07-26",
      inheritanceStartDate: "1983-07-26",
      decedentAcquisitionDate: "1970-01-01",
      ...STD,
      transferType: "burdened_gift",
    } as unknown as AssetForm;
    expect(needsClauseADeclaration(redev)).toBe(true);
  });

  it("M-2 시가 평가 · 환산 · 등급만 — 환산 분자도 등급 환산값(토지 57,304,000 = 5억 × 45,843,200/2억 × 0.5)", async () => {
    const r = await run({
      bgValuationMode: "sangjeungbeop_market",
      bgMarketValueAtTransfer: "1000000000",
      bgAcquisitionMethod: "converted",
      preDeemedClauseAUnconfirmed: true,
      ...GRADE_ONLY,
    });
    expect(r.issues).toEqual([]);
    expect(r.method).toBe("converted");
    expect([r.land, r.building]).toEqual([57_304_000, 37_500_000]);
    expect(r.tax).toBe(86_589_521);
  });

  it("P-1 회귀: 일반 양도 1983 상속 · 등급만 — 종전 값 그대로(파트별 3자 max)", async () => {
    const f = form({
      transferType: "regular",
      actualSalePrice: "1000000000",
      publishedValueAtInheritance: "600000000",
      gbBuildingInheritedValue: "100000000",
      ...GRADE_ONLY,
    });
    Object.assign(f, { contractTotalPrice: "1000000000" });
    expect(allIssues(f)).toEqual([]);
    const r = await postTransfer(await captureBody(f));
    expect(r.status).toBe(200);
    expect(r.json?.data?.aggregated?.determinedTax).toBe(47_510_000);
  });

  /** 축 B — 같은 물건 60/40 지분 · 두 지분 모두 1983 상속 */
  const axisB = (land: Record<string, unknown>): TransferFormData => {
    const share = (id: number, n: string) =>
      ({ ...makeDefaultAsset(id), ...GB, ...STD, ...GRADE, ...land, ownershipNumerator: n, ownershipDenominator: "100" }) as unknown as AssetForm;
    return Object.assign(form({}), { assets: [share(1, "60"), share(2, "40")], assetSplitMode: "fractional" }) as TransferFormData;
  };
  /** 함께 양도 — 일반건물(주) + 토지, 둘 다 부담부증여(증여계약 전체 §159 명세) */
  const bundle = (land: Record<string, unknown>): TransferFormData => {
    // 담보 승 자산은 함께 양도에서 막힌다(⑧) — 채무 2억(증여가액 4억)
    const gb = { ...makeDefaultAsset(1), ...GB, ...STD, ...GRADE, bgMortgageDebtAmount: "200000000", ...land } as unknown as AssetForm;
    const other = {
      ...makeDefaultAsset(2),
      addressJibun: "서울 강남구 테스트동 2-2",
      assetKind: "land",
      acquisitionCause: "purchase",
      acquisitionDate: "2010-01-01",
      acquisitionArea: "100",
      transferArea: "100",
      landNature: "standalone",
      standardPriceAtAcq: "100,000,000",
      standardPriceAtTransfer: "200,000,000",
      ...STD,
      transferType: "burdened_gift",
      bgDonorRelation: "lineal_descendant",
      bgLendingDepositTotal: "0",
      bgMortgageDebtAmount: "0",
    } as unknown as AssetForm;
    return Object.assign(form({}), { assets: [gb, other] }) as TransferFormData;
  };

  it.each([
    ["축 B 지분 카드", axisB],
    ["함께 양도", bundle],
  ] as const)("W-2 %s · 등급만 — 세액과 물건 전체 §159 명세(표시 전용 · 리뷰 발견 1)가 직접 입력(458,432)과 같다", async (_label, build) => {
    const res = async (land: Record<string, unknown>) => {
      const f = build(land);
      const issues = allIssues(f);
      const r = await postTransfer(await captureBody(f));
      const data = r.json?.data;
      return { issues, status: r.status, tax: data?.aggregated?.determinedTax, wholeLand: data?.transferBurdenedGiftBreakdown?.perAsset?.land?.acquisitionPrice };
    };
    const direct = await res({ gbAcqLandPricePerSqm: "458,432" });
    const grade = await res({ gbAcqLandPricePerSqm: "" });
    expect(direct.issues).toEqual([]);
    expect(grade.issues).toEqual([]);
    expect([direct.status, grade.status]).toEqual([200, 200]);
    expect(direct.wholeLand).toBeGreaterThan(0);
    expect(grade).toEqual(direct);
  });

  it("W-1 함께 양도 카드 일반건물 — 부담부증여 info·평가 payload 모두 등급 환산값", async () => {
    const land = {
      ...makeDefaultAsset(1),
      addressJibun: "서울 강남구 테스트동 2-2",
      assetKind: "land",
      acquisitionCause: "purchase",
      acquisitionDate: "2010-01-01",
      transferType: "regular",
      actualSalePrice: "500000000",
      fixedAcquisitionPrice: "300000000",
      acquisitionArea: "100",
      transferArea: "100",
      landNature: "standalone",
      standardPriceAtTransfer: "400000000",
    } as unknown as AssetForm;
    const gb = { ...makeDefaultAsset(2), ...GB, ...STD, ...GRADE_ONLY } as unknown as AssetForm;
    const f = Object.assign(form({}), { contractTotalPrice: "500000000", assets: [land, gb] }) as TransferFormData;
    const body = await captureBody(f);
    const companion = (body.companionAssets as Record<string, unknown>[] | undefined)?.find((c) => c.assetKind === "general_building");
    expect((companion?.burdenedGiftInfo as Record<string, unknown>).landStdPriceAtAcquisition).toBe(45_843_200);
    expect((companion?.generalBuildingValuation as Record<string, unknown>).acquisitionLandPricePerSqm).toBe(458_432);
  });
});
