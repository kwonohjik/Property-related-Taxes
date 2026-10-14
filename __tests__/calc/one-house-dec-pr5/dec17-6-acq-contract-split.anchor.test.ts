/**
 * #17-6 — 같은 날 취득 주택의 배율 초과분 분리에서 **취득 당시 계약서 토지·건물 구분금액**을 받고 「소득세법」 §100③(30% 이상 차이 → 불분명 의제)로 판정한다.
 *
 * 엔진 직접 호출(경계·연혁) + 폼 → ④ → ⑧ → ⑫ → ⑭ → 엔진(파이프라인).
 *
 * 시료(엔진): 취득 2012-01-02 총 5억 · 양도 2026-02-16 10억 · 토지 500㎡ · 정착면적 100㎡ · 수도권 주거지역(3배 → 초과 200㎡).
 *   취득시 기준시가: 개별주택가격 5억 · ㎡당 60만원(토지 3억) · 건물 2억 → 안분 가액 토지 3억 : 건물 2억.
 *   건물이 작은 파트라 이탈률은 건물이 정한다 — 계약서 건물 1.4억 = 정확히 −30%(불분명) · 1.40000001억 = 29.9999995%(계약서 적용).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { baseTransferInput, makeMockRates } from "../../tax-engine/_helpers/mock-rates";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { sec100_3Era } from "@/lib/tax-engine/data/sec100-3-split-era";
import { housingExcessAcqContractNotice } from "@/lib/tax-engine/housing-excess-acq-contract";

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

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const rates = makeMockRates();
const BASE = {
  propertyType: "housing" as const, transferPrice: 1_000_000_000, transferDate: new Date("2026-02-16"),
  acquisitionDate: new Date("2012-01-02"), acquisitionPrice: 500_000_000, expenses: 0, useEstimatedAcquisition: false,
  isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 120,
  buildingFootprintArea: 100, acquisitionArea: 500, appurtenantLandZone: "metropolitan_residential" as const,
  landAcquisitionDate: new Date("2012-01-02"),
  standardPriceAtAcquisition: 500_000_000, standardPricePerSqmAtAcquisition: 600_000, buildingStandardPriceAtAcquisition: 200_000_000,
  landStandardPriceAtTransfer: 400_000_000, buildingStandardPriceAtTransfer: 400_000_000,
};
const run = (over: Record<string, unknown> = {}) => calculateTransferTax(baseTransferInput({ ...BASE, ...over }), rates);
const contract = (land: number, building: number, over: Record<string, unknown> = {}) =>
  run({ acqContractLandPrice: land, acqContractBuildingPrice: building, ...over });

describe("#17-6 §100③ 판정 — 경계 (정수 교차곱, 「이상」)", () => {
  it("대조 — 미입력이면 종전 기준시가 안분(토지 3억 · 건물 2억)이고 판정 내역이 없다", () => {
    const r = run();
    expect(r.splitDetail?.land.acquisitionPrice).toBe(300_000_000);
    expect(r.splitDetail?.building.acquisitionPrice).toBe(200_000_000);
    expect(r.splitDetail?.acqSplitJudgment).toBeUndefined();
  });

  it("건물 1.4억 = 안분(2억) 대비 정확히 −30% → 불분명 → 안분 가액(경계 포함)", () => {
    const r = contract(360_000_000, 140_000_000);
    const j = r.splitDetail!.acqSplitJudgment!;
    expect(j.outcome).toBe("deemed_unclear");
    expect(j.buildingOver).toBe(true);
    expect(j.landOver).toBe(false);
    expect(j.buildingDeviationBp).toBe(3000);
    expect(r.splitDetail!.land.acquisitionPrice).toBe(300_000_000);
    expect(r.totalTax).toBe(run().totalTax);
  });

  it("건물 140,000,001 → 29.9999995% 미만 → 계약서 구분금액 적용", () => {
    const r = contract(359_999_999, 140_000_001);
    expect(r.splitDetail!.acqSplitJudgment!.outcome).toBe("contract");
    expect(r.splitDetail!.land.acquisitionPrice).toBe(359_999_999);
    expect(r.splitDetail!.building.acquisitionPrice).toBe(140_000_001);
    expect(r.totalTax).not.toBe(run().totalTax);
  });

  it("상한 — 건물 2.6억(+30%) 불분명 / 259,999,999 계약서 적용", () => {
    expect(contract(240_000_000, 260_000_000).splitDetail!.acqSplitJudgment!.outcome).toBe("deemed_unclear");
    expect(contract(240_000_001, 259_999_999).splitDetail!.acqSplitJudgment!.outcome).toBe("contract");
  });

  it("토지가 큰 파트라 토지 이탈률은 건물보다 작다 — 건물이 정한다(작은 파트가 실질 제약) / 건물만 맞고 토지가 벗어나는 경우는 없다(합 고정)", () => {
    const j = contract(330_000_000, 170_000_000).splitDetail!.acqSplitJudgment!;
    expect(j.landDeviationBp).toBe(1000);
    expect(j.buildingDeviationBp).toBe(1500);
    expect(j.outcome).toBe("contract");
  });

  it("합이 취득가액과 다르거나 한쪽만 있으면 엔진이 던진다(⑧ 우회 방어) — 침묵 무시·자동 보정 없음", () => {
    expect(() => contract(300_000_000, 100_000_000)).toThrow(/합/);
    expect(() => run({ acqContractLandPrice: 300_000_000 })).toThrow(/모두 입력/);
  });

  it("이 경로가 아닌 입력(환산 취득)에 구분금액이 실리면 던진다 — 쓰이지 않는 값을 조용히 무시하지 않는다", () => {
    expect(() => contract(300_000_000, 200_000_000, { useEstimatedAcquisition: true, standardPriceAtTransfer: 1_000_000_000 })).toThrow(/에서만 받습니다/);
  });
});

describe("#17-6 결과 메모·고지 — 적용된 구분 기준을 거짓 없이 알린다", () => {
  it("계약서 구분금액이 적용되면 메모가 계약서 비율(토지 67.1% : 건물 32.9%)을 밝히고, 기준시가 안분비(60.0% : 40.0%)는 공통 비용 안분비로만 적는다", () => {
    const r = contract(335_714_285, 164_285_715);
    expect(r.splitDetail!.acqSplitJudgment!.outcome).toBe("contract");
    const note = r.splitDetail!.note;
    expect(note).toContain("취득가액은 계약서 구분금액 적용 — 토지 67.1% : 건물 32.9%");
    expect(note).toContain("공통 비용 안분비는 기준시가 기준 토지 60.0% : 건물 40.0%");
  });
  it("안분 가액이 적용되면(불분명) 종전 메모 그대로 — 계약서 문구가 섞이지 않는다 / 미입력도 동일", () => {
    const unclear = contract(380_000_000, 120_000_000).splitDetail!.note;
    expect(unclear).toContain("안분비 토지 60.0% : 건물 40.0%");
    expect(unclear).not.toContain("계약서 구분금액 적용");
    expect(run().splitDetail!.note).toBe(unclear);
  });
  it("단서(영 §166⑧1호) 적용 고지는 단서 적용 사실을 밝히고 30% 판정을 했다고 말하지 않는다", () => {
    const r = contract(380_000_000, 120_000_000, { acqContractOtherLaw: true });
    expect(r.splitDetail!.acqSplitJudgment!.outcome).toBe("exempt_other_law");
    const notice = housingExcessAcqContractNotice(r.splitDetail);
    expect(notice).toContain("제166조 제8항 제1호");
    expect(notice).toContain("30% 판정을 하지 않고");
    expect(notice).toContain("확인 필요");
  });
});

describe("#17-6 연혁 게이트 — 양도일 기준 (±1일)", () => {
  // 배율은 양도일 연혁(2022-01-01 전 도시지역 5배)이라 시료 면적을 키운다: 2026 3배 → 초과 500㎡ · 2015 5배 → 초과 300㎡
  const era = (transferDate: string, over: Record<string, unknown> = {}) =>
    contract(360_000_000, 140_000_000, {
      transferDate: new Date(transferDate),
      transferPrice: 800_000_000,
      acquisitionArea: 800,
      standardPricePerSqmAtAcquisition: 375_000,
      ...over,
    }).splitDetail!.acqSplitJudgment!;

  it("연혁 함수 — 경계 2015-12-31 / 2016-01-01 / 2024-12-31 / 2025-01-01", () => {
    expect(sec100_3Era("2015-12-31")).toBe("none");
    expect(sec100_3Era("2016-01-01")).toBe("body");
    expect(sec100_3Era("2024-12-31")).toBe("body");
    expect(sec100_3Era("2025-01-01")).toBe("body_and_proviso");
    expect(sec100_3Era(new Date("2024-12-31"))).toBe("body");
  });

  it("2015-12-31 양도 — 판정 없이 계약서 구분금액(30% 이상 차이여도)", () => {
    const j = era("2015-12-31");
    expect(j.outcome).toBe("before_effective");
    expect(j.applied).toEqual({ land: 360_000_000, building: 140_000_000 });
  });

  it("2016-01-01 양도 — 판정 시작: 30% 이상 차이 → 안분 가액", () => {
    expect(era("2016-01-01").outcome).toBe("deemed_unclear");
  });

  it("2024-12-31 양도 — 단서 없음: 단서 신고가 실려도 무시되어 불분명", () => {
    expect(era("2024-12-31", { acqContractOtherLaw: true }).outcome).toBe("deemed_unclear");
  });

  it("2025-01-01 양도 — 단서 적용: 신고 시 계약서 구분금액, 미신고(기본)면 불분명", () => {
    const on = era("2025-01-01", { acqContractOtherLaw: true });
    expect(on.outcome).toBe("exempt_other_law");
    expect(on.applied).toEqual({ land: 360_000_000, building: 140_000_000 });
    expect(on.buildingOver).toBe(true); // 예외로 인정받은 이탈 사실은 남는다
    expect(era("2025-01-01").outcome).toBe("deemed_unclear");
  });

  it("고지 — 판정이 돈 경우 비교 단위 미확인(확인 필요)을 알린다 / 미입력이면 없다", () => {
    const r = contract(360_000_000, 140_000_000);
    expect((r.warnings ?? []).some((w) => w.includes("제100조 제3항") && w.includes("확인 필요"))).toBe(true);
    expect((run().warnings ?? []).some((w) => w.includes("제100조 제3항"))).toBe(false);
  });
});
