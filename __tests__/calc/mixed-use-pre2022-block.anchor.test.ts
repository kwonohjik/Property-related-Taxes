/**
 * anchor: 2022.1.1. **전** 양도의 겸용주택은 분리계산 범위 밖이다 — 계산하지 않고 막는다.
 *
 * 계획서: `docs/00-pm/transfer-nbl-deferral-derived-followups.plan.md` F-3 (D-1 ⓐ: 단건·함께 양도 모두 ⑧ 차단)
 *
 * [결함 — 실측 2026-10-18] 엔진(`calcMixedUseTransferTax`)은 2022.1.1. 전 양도를 전부 0인 결과 + 거부 문구로 돌려준다
 * (`splitMode: "pre-2022-rejected"`). 단건은 결과뷰가 붉은 카드로 보여 줘 명시적이지만, **함께 양도**는 파트 카드 확장
 * (`buildMixedUsePartCards`)이 `splitMode`를 보지 않아 겸용 파트 카드 4장이 양도가액·차익 0으로 합산에 들어가고 거부 문구가
 * 버려졌다 — 겸용 주택이 합산에서 **조용히 빠졌다**(같은 입력 2012 양도 결정세액 66,290,000 · 2023 양도 113,060,000).
 * ⑧은 어느 경로도 막지 않았다(화면엔 붉은 안내만 있었다).
 *
 * [조치] ⑧ `validateMixedUseAsset` 차단(단건·함께 양도 공통) + ⑭ 파트 카드 확장에서 400(API 직접 호출 방어).
 * 단건 route는 종전대로 거부 결과(200)를 낸다 — API 직접 호출 시 결과뷰의 붉은 카드가 방어선이다.
 * 시행일 판정은 엔진 STEP 1과 같은 leaf(`isMixedUseSplitTransfer`)다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { allIssues, captureBody, postTransfer } from "./_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { isMixedUseSplitTransfer } from "@/lib/tax-engine/data/mixed-use-split-era";

type Form = ReturnType<typeof createDefaultTransferFormData>;
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const BLOCK = "2022.1.1. 전 양도분은 겸용주택 분리계산 범위 밖입니다";
const MIXED = {
  assetKind: "housing", isMixedUseHouse: true, residentialFloorArea: "60", nonResidentialFloorArea: "40", buildingFootprintArea: "50",
  mixedUseTotalLandArea: "900", mixedZoneType: "general_residential", mixedTransferHousingPrice: "900000000", mixedTransferCommercialBuildingPrice: "300000000",
  mixedTransferLandPricePerSqm: "2000000", mixedAcqHousingPrice: "300000000", mixedAcqCommercialBuildingPrice: "100000000", mixedAcqLandPricePerSqm: "1000000",
  acquisitionCause: "purchase", acquisitionDate: "2000-01-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "400000000",
};
const house = (i: number, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(i), addressJibun: `서울 강남구 테스트동 ${i}-1`, assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2000-03-01",
  useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000", actualSalePrice: "600000000", standardPriceAtTransfer: "500000000",
  standardPriceAtAcq: "250000000", residenceInputMode: "direct", residencePeriods: [], ...over,
});
const mixed = (i: number) => house(i, MIXED);
const form = (td: string, assets: unknown[]): Form =>
  withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(), assets, transferDate: td, contractTotalPrice: "1200000000",
    householdHousingCount: "2", isOneHousehold: false, residencePeriodMonths: "0",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
  } as unknown as Form);
const blocked = (f: Form) => allIssues(f).filter((i) => i.message.includes(BLOCK));
/** ⑧을 우회한 API 직접 호출 — 폼 변환(④) 본문을 그대로 POST */
const post = async (f: Form) => postTransfer(await captureBody(f));

const CASES = [
  ["주 자산이 겸용 + 주택", (td: string) => form(td, [mixed(1), house(2)])],
  ["주택 + 함께 양도 겸용", (td: string) => form(td, [house(1), mixed(2)])],
] as const;

describe("leaf — 시행일 경계(2022.1.1. 당일부터 분리계산)", () => {
  it("문자열·Date 모두 2021-12-31 거짓 · 2022-01-01 참", () => {
    expect(isMixedUseSplitTransfer("2021-12-31")).toBe(false);
    expect(isMixedUseSplitTransfer("2022-01-01")).toBe(true);
    expect(isMixedUseSplitTransfer(new Date("2021-12-31"))).toBe(false);
    expect(isMixedUseSplitTransfer(new Date("2022-01-01"))).toBe(true);
  });
});

describe.each(CASES)("함께 양도 — %s", (_name, mk) => {
  it("🔑 2021-12-31 양도: ⑧ 차단 1건(겸용 자산의 «겸용주택 분리계산» 토글로 이동) · API 직접 호출도 400 (수정 전: 0인 파트 카드로 200)", async () => {
    const f = mk("2021-12-31");
    const b = blocked(f);
    expect(b).toHaveLength(1);
    expect(b[0].field).toBe("isMixedUseHouse");
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("겸용주택 분리계산 범위 외");
  });
  it("2022-01-01 양도: 차단 없음 · 200 · 겸용 파트 카드 양도가액 합 > 0", async () => {
    const f = mk("2022-01-01");
    expect(blocked(f)).toEqual([]);
    const r = await post(f);
    expect(r.status).toBe(200);
    const props = r.json.data.aggregated.properties as { propertyId: string; transferPrice: number }[];
    const mu = props.filter((p) => p.propertyId.startsWith("mu-"));
    expect(mu.length).toBeGreaterThanOrEqual(4);
    expect(mu.reduce((s, p) => s + p.transferPrice, 0)).toBeGreaterThan(0);
  });
});

describe("단건 겸용", () => {
  it("🔑 2021-12-31 양도: ⑧ 차단 1건 (D-1 ⓐ — 종전엔 계산 후 결과 화면에서야 붉은 카드)", () => {
    const b = blocked(form("2021-12-31", [mixed(1)]));
    expect(b).toHaveLength(1);
    expect(b[0].field).toBe("isMixedUseHouse");
  });
  it("API 직접 호출은 종전대로 거부 결과(200 · pre-2022-rejected) — 결과뷰 붉은 카드가 방어선", async () => {
    const r = await post(form("2021-12-31", [mixed(1)]));
    expect(r.status).toBe(200);
    expect(r.json.data.mode).toBe("mixed-use");
    expect(r.json.data.result.splitMode).toBe("pre-2022-rejected");
  });
  it("2022-01-01 양도: 차단 없음 · 분리계산", async () => {
    const f = form("2022-01-01", [mixed(1)]);
    expect(blocked(f)).toEqual([]);
    const r = await post(f);
    expect(r.json.data.result.splitMode).toBe("post-2022");
  });
  it("대조 — 겸용 토글을 끈 같은 주택(단일 자산)은 2021-12-31 양도도 막지 않는다", () => {
    expect(blocked(form("2021-12-31", [house(1)]))).toEqual([]);
  });
});
