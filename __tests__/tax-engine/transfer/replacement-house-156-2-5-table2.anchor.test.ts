/**
 * S08-4 anchor — §156의2⑤ 대체주택(고가)을 신축주택 완성 후, 세대 2주택 상태로 양도하면 장특 표2다.
 *
 * 「소득세법 시행령」 §159의4 괄호 — 표2 대상 「1주택」은 「제155조·제155조의2·제156조의2·제156조의3 및 그 밖의 규정에 따라
 * 1세대 1주택으로 보는 주택을 포함」한다. 같은 영 §156의2⑤는 대체주택을 「1세대1주택으로 보아 제154조제1항을 적용」하고
 * 같은 항 3호는 신축주택 「완성되기 전 또는 완성된 후 3년 이내」 양도를 모두 포함한다(KoreanLaw MCP 원문 확인).
 *
 * 수정 전 실측(대체주택 거주 60개월 · 보유 5년 · 양도 15억/취득 5억): 완성 후 세대 2주택 rate 0.1(표1) · lthd 20,000,000 ·
 * 총세액 52,261,000 / 완성 전(세대 1주택) · 일반 1주택 고가 · §155① 일시적 2주택은 0.4 · 80,000,000 · 28,253,500.
 * E-5가 `deemedOneHouseBy155`를 싣지 않아 장특 표2 게이트(`isOneHouseForTable2`)가 닫혀 있었다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

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
import { runCalc } from "../../calc/_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { housesPatchWithDerivedCount } from "@/lib/calc/household-house-count";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

const R = makeMockRates();
const d = (s: string) => new Date(s);
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const common = {
  transferPrice: 1_500_000_000,
  acquisitionPrice: 500_000_000,
  acquisitionDate: d("2019-01-01"),
  transferDate: d("2024-06-01"),
  residencePeriodMonths: 60,
};
const rh = (completion: string, resMonths = 60) => ({
  businessApprovalDate: d("2018-06-01"),
  completionDate: d(completion),
  replacementResidenceMonths: resMonths,
  willResideNewHouse: true,
});

describe("S08-4 — §156의2⑤ 대체주택: 의제 1주택은 장특 표2 대상", () => {
  it("🔑 완성 후(3년 이내) · 세대 2주택 · 거주 60개월 → 표2 40%(보유 5년 20% + 거주 5년 20%) · 80,000,000 · 총세액 28,253,500 (수정 전 0.1 · 52,261,000)", () => {
    const r = calculateTransferTax(
      baseTransferInput({ ...common, householdHousingCount: 2, replacementHouse: rh("2022-06-01") }),
      R,
    );
    expect(r.exemptReason).toBe("대체주택 특례 고가주택 (§156의2⑤)");
    expect(r.longTermHoldingRate).toBeCloseTo(0.4, 10);
    expect(r.longTermHoldingDeduction).toBe(80_000_000);
    expect(r.totalTax).toBe(28_253_500);
    // 산식 문구도 표2(보유 4% + 거주 4%)다 — 표1 문구가 나오면 안 된다.
    const s = r.steps.find((x) => x.label === "장기보유특별공제");
    expect(s?.formula).toContain("보유 5년×4%=20% + 거주 5년×4%=20% = 40%");
  });

  it("대조 — 완성 전 세대 1주택 · 일반 1주택 고가 · §155① 일시적 2주택은 같은 값(의제 배선·표2 게이트는 정상)", () => {
    const before = calculateTransferTax(
      baseTransferInput({ ...common, householdHousingCount: 1, replacementHouse: rh("2025-06-01") }),
      R,
    );
    const plain = calculateTransferTax(baseTransferInput({ ...common, householdHousingCount: 1 }), R);
    const temp = calculateTransferTax(
      baseTransferInput({
        ...common,
        householdHousingCount: 2,
        temporaryTwoHouse: { previousAcquisitionDate: d("2019-01-01"), newAcquisitionDate: d("2023-06-01") },
      } as never),
      R,
    );
    for (const r of [before, plain, temp]) {
      expect(r.longTermHoldingRate).toBeCloseTo(0.4, 10);
      expect(r.totalTax).toBe(28_253_500);
    }
  });

  it("긍정 짝(거주 요건은 별개) — 의제여도 거주 2년 미만이면 표1(보유 5년 10%) — 의제만으로 표2가 열리지 않는다", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        ...common,
        residencePeriodMonths: 12,
        householdHousingCount: 2,
        replacementHouse: rh("2022-06-01", 12),
      }),
      R,
    );
    expect(r.exemptReason).toBe("대체주택 특례 고가주택 (§156의2⑤)");
    expect(r.longTermHoldingRate).toBeCloseTo(0.1, 10);
  });

  it("부정 짝 — 대체주택 요건 불성립(완성 후 3년 초과)이면 의제가 서지 않아 표1·과세", () => {
    const input = baseTransferInput({
      ...common,
      householdHousingCount: 2,
      replacementHouse: rh("2019-06-01"), // 완성 2019-06-01 → 양도 2024-06-01 = 5년 후
    });
    const r = calculateTransferTax(input, R);
    expect(r.exemptReason).not.toBe("대체주택 특례 고가주택 (§156의2⑤)");
    expect(r.longTermHoldingRate).toBeLessThan(0.4);
  });

  it("checkExemption — 비과세·고가 두 분기 모두 의제 echo를 싣는다", () => {
    const hv = checkExemption(
      baseTransferInput({ ...common, householdHousingCount: 2, replacementHouse: rh("2022-06-01") }) as never,
      R as never,
    ) as unknown as Record<string, unknown>;
    expect(hv.isPartialExempt).toBe(true);
    expect(hv.deemedOneHouseBy155).toBe(true);
    const ex = checkExemption(
      baseTransferInput({ ...common, transferPrice: 1_000_000_000, householdHousingCount: 2, replacementHouse: rh("2022-06-01") }) as never,
      R as never,
    ) as unknown as Record<string, unknown>;
    expect(ex.isExempt).toBe(true);
    expect(ex.deemedOneHouseBy155).toBe(true);
  });
});

describe("S08-4 route(④⑫⑭) — 계산기 폼: 대체주택 특례 ON + 명부에 신축주택 1행", () => {
  it("완성 후 세대 2주택(명부 파생) → 표2 0.4 · 총세액 28,253,500", async () => {
    const f = createDefaultTransferFormData();
    Object.assign(f, {
      transferDate: "2024-06-01",
      isOneHousehold: true,
      contractTotalPrice: "1500000000",
      householdNoPresaleRightsConfirmed: true,
      residencePeriodMonths: "60",
      replacementHouseSpecial: true,
      replBusinessApprovalDate: "2018-06-01",
      replCompletionDate: "2022-06-01",
      replResidenceMonths: "60",
      replWillResideNewHouse: true,
    });
    Object.assign(f.assets[0], {
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2019-01-01",
      actualSalePrice: "1500000000",
      fixedAcquisitionPrice: "500000000",
      addressJibun: "서울특별시 테스트구 1",
      residenceInputMode: "direct",
      residencePeriods: [],
      residencePeriodMonthsAsset: "60",
    });
    const row = {
      id: "N",
      region: "capital",
      acquisitionDate: "2010-01-01",
      officialPrice: "300000000",
      isInherited: false,
      isLongTermRental: false,
      isApartment: true,
      isOfficetel: false,
      isUnsoldHousing: false,
    } as unknown as HouseEntry;
    Object.assign(f, housesPatchWithDerivedCount([row], "housing", false, f.transferDate));
    const r = await runCalc(f);
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.result.exemptReason).toBe("대체주택 특례 고가주택 (§156의2⑤)");
    expect(r.result.longTermHoldingRate).toBeCloseTo(0.4, 10);
    expect(r.result.totalTax).toBe(28_253_500);
  });
});
