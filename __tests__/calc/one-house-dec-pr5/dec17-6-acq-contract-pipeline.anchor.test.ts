/**
 * #17-6 파이프라인 — 폼 → ④ → ⑧ → ⑫ → ⑭ → 엔진 (단건 · 함께 양도 컴패니언).
 *
 * 시료(단건): 취득 2012-01-02 총 5억 · 양도 2026-02-16 10억 · 토지 500㎡ · 정착면적 100㎡ · 수도권 주거지역(초과 200㎡) · 거주 120개월.
 *   기준시가(취득시): 개별주택가격 5억 · ㎡당 60만원(토지 3억) · 건물 2억 → 안분 가액 토지 3억 : 건물 2억 / (양도시): ㎡당 80만원 · 건물 4억
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../../tax-engine/_helpers/mock-rates";

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
import { runCalc } from "../_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { buildSplitPayload, makeRatioed } from "@/lib/calc/transfer-tax-api-split";
import {
  housingExcessAcqContractAsksProviso,
  housingExcessAcqContractPayload,
  housingExcessNeedsAcqContract,
} from "@/lib/calc/housing-excess-acq-contract";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const TD = "2026-02-16";
const HOUSE: Record<string, unknown> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2012-01-02",
  fixedAcquisitionPrice: "500000000",
  actualSalePrice: "1000000000",
  addressJibun: "서울 테스트동 1",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "120",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  areaScenario: "same",
  acquisitionArea: "500",
  transferArea: "500",
  standardPriceAtAcq: "500000000",
  standardPricePerSqmAtAcq: "600000",
  buildingStandardPriceAtAcq: "200000000",
  standardPricePerSqmAtTransfer: "800000",
  buildingStandardPriceAtTransfer: "400000000",
};
const asset = (over: Record<string, unknown> = {}) => ({ ...makeDefaultAsset(1), ...HOUSE, ...over }) as unknown as AssetForm;
function form(over: Record<string, unknown> = {}, formOver: Record<string, unknown> = {}) {
  return {
    ...createDefaultTransferFormData(),
    transferDate: TD,
    contractTotalPrice: "1000000000",
    isOneHousehold: true,
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "120",
    assets: [asset(over)],
    ...formOver,
  } as never;
}
const UNDER = { acqContractLandPrice: "335714285", acqContractBuildingPrice: "164285715" }; // 건물 −17.9% (30% 미만)
const OVER = { acqContractLandPrice: "380000000", acqContractBuildingPrice: "120000000" }; // 건물 −40% (30% 이상)
const judgment = (r: Awaited<ReturnType<typeof runCalc>>) => r.result.splitDetail.acqSplitJudgment;

describe("#17-6 단건 — 미입력 불변 (세액·판정·body 동일)", () => {
  it("키가 없는 옛 저장분 = 빈 문자열 = 종전과 동일 — body에 구분금액 키 없음 · 판정 내역 없음 · 같은 세액", async () => {
    const none = await runCalc(form());
    const empty = await runCalc(form({ acqContractLandPrice: "", acqContractBuildingPrice: "", acqContractOtherLaw: false }));
    expect(none.issues).toEqual([]);
    expect(none.status).toBe(200);
    for (const r of [none, empty]) {
      expect(r.body).not.toHaveProperty("acqContractLandPrice");
      expect(r.body).not.toHaveProperty("acqContractBuildingPrice");
      expect(r.body).not.toHaveProperty("acqContractOtherLaw");
      expect(judgment(r)).toBeUndefined();
    }
    expect(empty.result.totalTax).toBe(none.result.totalTax);
    expect(empty.result.splitDetail.land.acquisitionPrice).toBe(none.result.splitDetail.land.acquisitionPrice);
    expect(none.result.splitDetail.land.acquisitionPrice).toBe(300_000_000);
  }, 60_000);
});

describe("#17-6 단건 — 계약서 구분금액", () => {
  it("30% 미만 차이 → 계약서 구분금액 적용 (body 전송 · 판정 contract · 토지 취득가액이 계약서 값 · 세액이 안분과 다르다)", async () => {
    const base = await runCalc(form());
    const r = await runCalc(form(UNDER));
    expect(r.issues).toEqual([]);
    expect(r.body.acqContractLandPrice).toBe(335_714_285);
    expect(r.body.acqContractBuildingPrice).toBe(164_285_715);
    expect(judgment(r).outcome).toBe("contract");
    expect(r.result.splitDetail.land.acquisitionPrice).toBe(335_714_285);
    expect(r.result.splitDetail.building.acquisitionPrice).toBe(164_285_715);
    expect(r.result.totalTax).not.toBe(base.result.totalTax);
  }, 60_000);

  it("30% 이상 차이 → 불분명 → 안분 가액 (세액이 미입력과 같다 · 판정 deemed_unclear · 이탈률 echo)", async () => {
    const base = await runCalc(form());
    const r = await runCalc(form(OVER));
    expect(r.issues).toEqual([]);
    expect(judgment(r)).toMatchObject({ outcome: "deemed_unclear", buildingOver: true, buildingDeviationBp: 4000 });
    expect(judgment(r).applied).toEqual(judgment(r).apportioned);
    expect(r.result.totalTax).toBe(base.result.totalTax);
    expect(r.result.warnings.some((w: string) => w.includes("제100조 제3항") && w.includes("확인 필요"))).toBe(true);
  }, 60_000);

  it("영 §166⑧1호 단서(양도 2026 — 2025.1.1. 이후) — 켜면 30% 이상 차이여도 계약서 구분금액 적용 / 끄면 불분명", async () => {
    const on = await runCalc(form({ ...OVER, acqContractOtherLaw: true }));
    expect(on.body.acqContractOtherLaw).toBe(true);
    expect(judgment(on).outcome).toBe("exempt_other_law");
    expect(on.result.splitDetail.land.acquisitionPrice).toBe(380_000_000);
    const off = await runCalc(form({ ...OVER, acqContractOtherLaw: false }));
    expect(off.body).not.toHaveProperty("acqContractOtherLaw");
    expect(judgment(off).outcome).toBe("deemed_unclear");
  }, 60_000);

  it("양도일 2024-12-31 — 단서 질문이 없고 stale 토글은 body에 실리지 않는다(불분명) / 2025-01-01 — 질문이 열린다", () => {
    const a = asset({ ...OVER, acqContractOtherLaw: true });
    expect(housingExcessAcqContractAsksProviso(a, "2024-12-31")).toBe(false);
    expect(housingExcessAcqContractPayload(a, "2024-12-31")).toEqual({ acqContractLandPrice: 380_000_000, acqContractBuildingPrice: 120_000_000 });
    expect(housingExcessAcqContractAsksProviso(a, "2025-01-01")).toBe(true);
    expect(housingExcessAcqContractPayload(a, "2025-01-01")).toMatchObject({ acqContractOtherLaw: true });
  });
});

describe("#17-6 ⑧ — 필수·합계 (⑤ 노출과 같은 술어)", () => {
  it("한쪽만 입력 → 비어 있는 칸으로 차단 (자동 보정 없음)", async () => {
    const r1 = await runCalc(form({ acqContractLandPrice: "380000000" }));
    expect(r1.issues.find((i) => i.field === "acqContractBuildingPrice")?.message).toContain("건물 금액을 입력하세요");
    const r2 = await runCalc(form({ acqContractBuildingPrice: "120000000" }));
    expect(r2.issues.find((i) => i.field === "acqContractLandPrice")?.message).toContain("토지 금액을 입력하세요");
  }, 60_000);

  it("합이 취득가액과 다르면 토지 금액 칸으로 차단 — 합과 취득가액을 문구에 싣는다", async () => {
    const r = await runCalc(form({ acqContractLandPrice: "380000000", acqContractBuildingPrice: "100000000" }));
    const hit = r.issues.find((i) => i.field === "acqContractLandPrice");
    expect(hit?.message).toContain("480,000,000");
    expect(hit?.message).toContain("500,000,000");
  }, 60_000);

  it("칸이 안 열리는 조합(환산 취득 · 별개취득 토글 ON)은 잔재가 있어도 요구하지도 싣지도 않는다", async () => {
    const estimated = asset({ useEstimatedAcquisition: true, acquisitionMethod: "estimated", acqContractLandPrice: "1" });
    const sep = asset({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2012-01-02", acqContractLandPrice: "1" });
    for (const a of [estimated, sep]) {
      expect(housingExcessNeedsAcqContract(a, TD)).toBe(false);
      expect(housingExcessAcqContractPayload(a, TD)).toBeNull();
    }
    const r = await runCalc(form({ acqContractLandPrice: "380000000", acqContractBuildingPrice: "1", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2012-01-02" }));
    expect(r.body).not.toHaveProperty("acqContractLandPrice");
    expect(r.issues.some((i) => i.field === "acqContractLandPrice" || i.field === "acqContractBuildingPrice")).toBe(false);
  }, 60_000);

  it("⑧↔⑫ 정합 — ⑧ 통과 입력은 route가 400으로 막지 않는다 / ⑧ 위반 입력(합 불일치)을 API로 직접 보내면 엔진이 막는다", async () => {
    const ok = await runCalc(form(UNDER));
    expect(ok.issues).toEqual([]);
    expect(ok.status).toBe(200);
    const bad = await runCalc(form({ acqContractLandPrice: "380000000", acqContractBuildingPrice: "100000000" }));
    expect(bad.issues.length).toBeGreaterThan(0);
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(bad.json)).toContain("합");
  }, 60_000);

  it("④ 직접 — 양도시 기준시가·기준시가 5칸은 종전처럼 항상 필요하다(구분금액이 대체하지 않는다)", async () => {
    const r = await runCalc(form({ ...UNDER, buildingStandardPriceAtAcq: "" }));
    expect(r.issues.find((i) => i.field === "buildingStandardPriceAtAcq")).toBeDefined();
    const t = await runCalc(form({ ...UNDER, buildingStandardPriceAtTransfer: "" }));
    expect(t.issues.find((i) => i.field === "buildingStandardPriceAtTransfer")).toBeDefined();
  }, 60_000);

  it("buildSplitPayload 직접 — primaryCtx 없이(감가상각 범위 판정)는 싣지 않는다", () => {
    const p = buildSplitPayload(asset(UNDER), { isBurdenedGift: false, usesPhd: false, ratioed: makeRatioed(1, false) });
    expect(p).not.toHaveProperty("acqContractLandPrice");
  });
});

describe("#17-6 컴패니언 (함께 양도 주택 카드)", () => {
  // #17-1 시료와 같다 — 컴패니언 주택 매매 2012-01-02 3억 · 양도가 5억 · 500㎡(초과 200㎡) · 기준시가 취득시 3억(토지 2억 + 건물 1.5억) · 양도시 ㎡당 80만 + 건물 4억.
  const SMALL = { fixedAcquisitionPrice: "300000000", actualSalePrice: "500000000", standardPriceAtTransfer: "500000000", acquisitionArea: "250", transferArea: "250" };
  const FIVE = { standardPriceAtAcq: "300000000", standardPricePerSqmAtAcq: "400000", buildingStandardPriceAtAcq: "150000000" };
  const f = (companionOver: Record<string, unknown>) =>
    form({ ...SMALL }, {
      assets: [
        asset({ ...SMALL, standardPriceAtAcq: "", standardPricePerSqmAtAcq: "", buildingStandardPriceAtAcq: "", standardPricePerSqmAtTransfer: "", buildingStandardPriceAtTransfer: "" }),
        { ...makeDefaultAsset(2), ...HOUSE, ...SMALL, ...FIVE, addressJibun: "서울 테스트동 2", acquisitionArea: "500", transferArea: "500", ...companionOver } as unknown as AssetForm,
      ],
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (r: Awaited<ReturnType<typeof runCalc>>): any[] => r.json?.data?.aggregated?.properties ?? [];
  const exceptSameDay = (r: Awaited<ReturnType<typeof runCalc>>) => r.issues.filter((i) => !i.message.includes("함께양도로 묶여 있습니다"));

  it("컴패니언 주택도 같은 판정 — body 전송(⑬) · ⑭ 매핑 · 30% 이상이면 안분 가액", async () => {
    const r = await runCalc(f({ acqContractLandPrice: "100000000", acqContractBuildingPrice: "200000000" }));
    expect(exceptSameDay(r)).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (r.body.companionAssets as any[])[0];
    expect(body.acqContractLandPrice).toBe(100_000_000);
    expect(body.acqContractBuildingPrice).toBe(200_000_000);
    const j = props(r)[1].splitDetail.acqSplitJudgment;
    expect(j).toMatchObject({ outcome: "deemed_unclear", landOver: true });
    expect(j.declared).toEqual({ land: 100_000_000, building: 200_000_000 });
    expect(j.applied).toEqual(j.apportioned);
  }, 60_000);

  it("컴패니언 30% 미만 → 계약서 구분금액이 토지 취득가액이 된다", async () => {
    const r = await runCalc(f({ acqContractLandPrice: "200000000", acqContractBuildingPrice: "100000000" }));
    expect(exceptSameDay(r)).toEqual([]);
    expect(props(r)[1].splitDetail.acqSplitJudgment.outcome).toBe("contract");
    expect(props(r)[1].splitDetail.land.acquisitionPrice).toBe(200_000_000);
  }, 60_000);

  it("컴패니언도 ⑧이 같은 술어로 막는다 — 한쪽만 입력하면 비어 있는 칸(건물 금액)으로", async () => {
    const r = await runCalc(f({ acqContractLandPrice: "200000000" }));
    const hit = exceptSameDay(r).find((i) => i.field === "acqContractBuildingPrice");
    expect(hit?.message).toContain("건물 금액을 입력하세요");
  }, 60_000);

  it("컴패니언 미입력 불변 — body 키 없음 · 판정 내역 없음 · 안분 가액", async () => {
    const r = await runCalc(f({}));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (r.body.companionAssets as any[])[0];
    expect(body).not.toHaveProperty("acqContractLandPrice");
    expect(props(r)[1].splitDetail.acqSplitJudgment).toBeUndefined();
    expect(props(r)[1].splitDetail.land.acquisitionPrice).toBe(171_428_571);
  }, 60_000);
});
