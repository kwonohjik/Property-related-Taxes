/**
 * route anchor — 조특법 §99·§99의3 리뷰 L1 2차 (NH-15 · NH-02 · NH-03 · NH-17 · NH-40 · NH-49).
 * 폼 → ⑧ validate → ④ 변환 → fetch body → ⑫ Zod → ⑭ route → 엔진. 세율표는 route 폴백(`loadFallbackTransferRates`)이다.
 *
 * 불성립 사례는 「감면 선택 없는 대조」와 세액이 같아야 한다. 적격 사례는 대조보다 작아야 한다.
 * 수정 전 세액은 각 it 이름에 적었다(같은 시료를 수정 전 코드에서 실측 — PR 본문 표).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { allIssues, captureBody, runCalc } from "../calc/_one-house-pr3a-calc-route";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }) };
});
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date) as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;

function house(o: { acq: string; transfer: string; price: string; cause?: string; reductions: unknown[] }): TransferFormData {
  const asset = Object.assign({ ...makeDefaultAsset(1) }, x({
    assetKind: "housing", acquisitionCause: o.cause ?? "purchase", acquisitionDate: o.acq,
    actualSalePrice: o.price, fixedAcquisitionPrice: "200,000,000",
    standardPriceAtAcq: "100,000,000", standardPriceAtTransfer: "400,000,000",
    assetContractDate: "",
    // 상속 시료 — ⑫가 피상속인 취득일을 요구한다
    ...(o.cause === "inheritance" ? { decedentAcquisitionDate: "1990-01-01" } : {}),
    reductions: o.reductions as never,
  }));
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: o.transfer, contractTotalPrice: o.price, assets: [asset], isOneHousehold: false, householdHousingCount: "2",
  }) as TransferFormData;
}

const red99 = (over: Record<string, unknown> = {}) => ({
  ...getReductionDefault("new_99"),
  acquisitionType99: "self_built", usageApprovalDate99: "1999-03-01", exclusiveAreaSqm99: "84", houseType99: "apartment",
  standardPriceAtAcquisition99: "100,000,000", standardPriceAt5Years99: "150,000,000", standardPriceAtTransfer99: "400,000,000",
  ...over,
});
const red993 = (over: Record<string, unknown> = {}) => ({
  ...getReductionDefault("new_99_3"),
  acquisitionType993: "from_builder", contractDate993: "2002-03-01", exclusiveAreaSqm993: "84", houseType993: "apartment", firstContract993: "yes",
  region993: "outside_speculation",
  standardPriceAtAcquisition993: "100,000,000", standardPriceAt5Years: "150,000,000", standardPriceAtTransfer993: "400,000,000",
  ...over,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const det = (r: any) => r.new993Detail ?? r.new99Detail;
const codes = (r: unknown) => (det(r).ineligibleReasons as { code: string }[]).map((q) => q.code);

async function pair(f: TransferFormData, ctl: TransferFormData) {
  expect(allIssues(f).filter((m) => /99|신축|고급|최초/.test(m))).toEqual([]);
  const r = await runCalc(f);
  const c = await runCalc(ctl);
  expect(r.status).toBe(200);
  return { r, c };
}

describe("NH-15 route — 기준일 1999.9.17.까지 5억원(실지거래가액)", () => {
  it("공동 170㎡ · 사용승인 1999-03-01 · 5.8억 → 고급주택 배제 = 대조 (수정 전 적용 · 6억 기준)", async () => {
    const args = { acq: "1999-03-01", transfer: "2024-08-01", price: "580,000,000" };
    const { r, c } = await pair(house({ ...args, reductions: [red99({ exclusiveAreaSqm99: "170" })] }), house({ ...args, reductions: [] }));
    expect(codes(r.r)).toEqual(["HIGH_VALUE_HOUSE"]);
    expect(r.totalTax).toBe(c.totalTax);
  });
});

describe("NH-02 route — 단독주택 기준(연면적 264㎡ · 딸린 토지 495㎡ · 시설은 단독만)", () => {
  const args = { acq: "1999-03-01", transfer: "2024-08-01", price: "800,000,000" };
  const detached = { houseType99: "detached", grossFloorAreaSqm99: "200", attachedLandAreaSqm99: "300", stdPriceFloorMet99: "yes", luxuryFacility99: "no" };
  it("§99 단독 200㎡·300㎡·8억 → 적용 (수정 전 「전용면적」 200 입력 = 공동 165㎡ 기준 배제)", async () => {
    const f = house({ ...args, reductions: [red99({ ...detached, exclusiveAreaSqm99: "" })] });
    const body = await captureBody(f);
    // ④ → fetch body — 단독주택 사실이 실린다
    expect(JSON.stringify(body)).toContain('"houseType99":"detached"');
    expect(JSON.stringify(body)).toContain('"grossFloorAreaSqm99":200');
    const { r, c } = await pair(f, house({ ...args, reductions: [] }));
    expect(det(r.r).isEligible).toBe(true);
    expect(r.totalTax).toBeLessThan(c.totalTax);
    // 수정 전 입력(유형 없음 + 전용 200㎡)은 지금도 공동주택 기준 배제 — 직접 API·옛 이력 현행 유지
    const legacy = await runCalc(house({ ...args, reductions: [red99({ houseType99: "", exclusiveAreaSqm99: "200" })] }));
    expect(codes(legacy.r)).toEqual(["HIGH_VALUE_HOUSE"]);
    expect(legacy.totalTax).toBe(c.totalTax);
  });
  it("§99 단독 시설 「모름」 → 고급주택 배제 = 대조 + 확인 필요", async () => {
    const { r, c } = await pair(
      house({ ...args, reductions: [red99({ ...detached, luxuryFacility99: "unknown", exclusiveAreaSqm99: "" })] }),
      house({ ...args, reductions: [] }),
    );
    expect(codes(r.r)).toEqual(["HIGH_VALUE_HOUSE"]);
    expect(det(r.r).warnings.join(" ")).toContain("확인 필요");
    expect(r.totalTax).toBe(c.totalTax);
  });
  it("⑧ — 단독주택이면 연면적·딸린 토지·하한·시설을 묻는다 / 유형 미선택은 막는다", () => {
    const miss = allIssues(house({ ...args, reductions: [red99({ ...detached, luxuryFacility99: "" })] }));
    expect(miss.some((m) => /엘리베이터/.test(m))).toBe(true);
    const noType = allIssues(house({ ...args, reductions: [red99({ houseType99: "" })] }));
    expect(noType.some((m) => /주택 유형/.test(m))).toBe(true);
  });
});

describe("NH-03 · NH-17 · NH-40 route — 취득 원인", () => {
  const args = { acq: "2003-09-01", transfer: "2024-08-01", price: "900,000,000" };
  it("§99의3 1호 상속 취득 → 불성립 = 대조 (수정 전 적용)", async () => {
    const { r, c } = await pair(
      house({ ...args, cause: "inheritance", reductions: [red993({ firstContract993: "" })] }),
      house({ ...args, cause: "inheritance", reductions: [] }),
    );
    expect(codes(r.r)).toEqual(["ACQUIRED_BY_INHERITANCE_OR_GIFT"]);
    expect(r.totalTax).toBe(c.totalTax);
  });
  it("§99의3 1호 분양권 승계(최초 계약 「아니오」) → 불성립 = 대조", async () => {
    const { r, c } = await pair(house({ ...args, reductions: [red993({ firstContract993: "no" })] }), house({ ...args, reductions: [] }));
    expect(codes(r.r)).toEqual(["NOT_FIRST_CONTRACT"]);
    expect(r.totalTax).toBe(c.totalTax);
  });
  it("⑧ — 매매 취득은 최초 계약 여부를 묻고, 상속·이월과세 증여는 묻지 않는다 · ④는 묻지 않는 범위의 옛 답을 싣지 않는다", async () => {
    expect(allIssues(house({ ...args, reductions: [red993({ firstContract993: "" })] })).some((m) => /최초로 매매계약/.test(m))).toBe(true);
    expect(allIssues(house({ ...args, cause: "carryover_gift", reductions: [red993({ firstContract993: "" })] })).some((m) => /최초로 매매계약/.test(m))).toBe(false);
    const body = await captureBody(house({ ...args, cause: "inheritance", reductions: [red993({ firstContract993: "no" })] }));
    expect(JSON.stringify(body)).not.toContain("firstContract993");
  });
  it("§99의3 2호 자기건설 지분을 증여로 취득 → 그 지분 불성립 = 대조 (NH-40)", async () => {
    const self = red993({ acquisitionType993: "self_built", contractDate993: "", usageApprovalDate993: "2002-08-02", firstContract993: "" });
    const a2 = { acq: "2010-05-01", transfer: "2024-08-01", price: "900,000,000" };
    const { r, c } = await pair(house({ ...a2, cause: "gift", reductions: [self] }), house({ ...a2, cause: "gift", reductions: [] }));
    expect(codes(r.r)).toEqual(["ACQUIRED_BY_INHERITANCE_OR_GIFT"]);
    expect(r.totalTax).toBe(c.totalTax);
  });
});

describe("NH-49 route — 2015.12.31. 이전 양도 종전 규정 고지(세액 불변)", () => {
  it("§99의3 2015-06-01 양도 → 고지 + 세액은 고지 없는 같은 산식과 같다", async () => {
    const args = { acq: "2003-09-01", transfer: "2015-06-01", price: "500,000,000" };
    const { r, c } = await pair(house({ ...args, reductions: [red993()] }), house({ ...args, reductions: [] }));
    expect(det(r.r).isEligible).toBe(true);
    expect(det(r.r).warnings.join(" ")).toContain("대통령령 제26959호 부칙 제35조");
    expect(r.totalTax).toBeLessThan(c.totalTax);
    expect(r.totalTax).toMatchInlineSnapshot(`62089000`);
  });
});
