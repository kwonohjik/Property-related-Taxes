/**
 * ⑫ 거주 개월 일반 상한 — API 직접 호출도 UI ⑧과 같은 규칙으로 막는다
 * (계획서 `docs/02-design/features/land-only-o11-o13-o14-o16-o17-measure.plan.md` O-14 · Q-3 a).
 *
 * 종전: `residencePeriodMonths: z.number().int().nonnegative()`에 상한이 없어, 보유 60개월 주택에 거주 120개월을 보내면 **오류·경고 없이** 장특 거주분이 40%(거주 10년)로 계산됐다
 * (실측: 보유 5년 · 20억 · 거주 60 → 장특 40% · 결정세액 117,060,000 / 거주 120 → 60% · 70,310,000, −46,750,000). UI ⑧(`directResidenceMonthsOverflowError`)은 이미 막고 있었다.
 * 법 근거: 「소득세법」 §95② 표2 «보유기간 중 거주기간» · 시행령 §154① 괄호 «그 보유기간 중 거주기간» — ⑧과 같은 leaf를 쓴다.
 *
 * 독립 산식(모의 세율표 · 양도 2026-06-15 · 1세대1주택 20억 · 취득 5억 · 취득일 2021-06-01):
 *   양도차익 1,500,000,000 → 12억 초과분 안분 (20억 − 12억)/20억 = 40% → 과세 양도차익 600,000,000.
 *   장특 표2 = 보유 5년 × 4% + 거주 5년 × 4% = 40% → 240,000,000. 거주 10년이면 보유 20% + 거주 40% = 60% → 360,000,000.
 *   취득일~양도일 = 5년 0개월 15일 → 완성 개월 60.
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
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { residenceMonthsOverflowIssue } from "@/lib/api/transfer-tax-schema-household-refines";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const body = (months: number, over: Loose = {}) => ({
  propertyType: "housing", transferPrice: 2_000_000_000, transferDate: "2026-06-15", acquisitionPrice: 500_000_000, acquisitionDate: "2021-06-01",
  acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 1, residencePeriodMonths: months,
  isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: true, reductions: [],
  annualBasicDeductionUsed: 0, ...over,
});
const run = async (b: Loose) => {
  const res = await postTransfer(b);
  return { status: res.status, json: res.json as Loose };
};

describe("⑫ 거주 개월 상한 — 라우트(단건)", () => {
  it("🔑 R1 보유 60개월 · 거주 60(= 상한): 통과 · 장특 40% 240,000,000 (경계 포함)", async () => {
    const r = await run(body(60));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect(r.json.data.result.longTermHoldingDeduction).toBe(240_000_000);
    expect(r.json.data.result.determinedTax).toBe(117_060_000);
  });

  it("🔑 R2 거주 61(상한 +1): 400 — 거주기간 오류가 residencePeriodMonths를 가리키고 취득일·상한 60개월을 알린다", async () => {
    const r = await run(body(61));
    expect(r.status).toBe(400);
    const msg = JSON.stringify(r.json.error);
    expect(msg).toContain("residencePeriodMonths");
    expect(msg).toContain("61개월");
    expect(msg).toContain("60개월");
    expect(msg).toContain("2021-06-01");
  });

  it("🔑 R3 거주 120 · 999(보유 초과): 400 — 종전 200 · 장특 60%(360,000,000) · 결정세액 70,310,000 (−46,750,000)", async () => {
    for (const months of [120, 999]) {
      const r = await run(body(months));
      expect(r.status, `거주 ${months}`).toBe(400);
    }
  });

  it("R4 1세대1주택이 아니면(isOneHousehold false) 거주는 쓰이지 않으므로 상한도 걸지 않는다 — ⑧과 같은 조건", async () => {
    const r = await run(body(999, { isOneHousehold: false }));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });

  it("R5 보유 1년(2025-06-01 취득) · 거주 12(= 상한) 통과 · 13 차단 — 장특 0인 구간도 같은 규칙", async () => {
    expect((await run(body(12, { acquisitionDate: "2025-06-01" }))).status).toBe(200);
    expect((await run(body(13, { acquisitionDate: "2025-06-01" }))).status).toBe(400);
  });
});

describe("⑫ 거주 개월 상한 — 순수 술어(⑧ `directResidenceMonthsOverflowError`·`residenceStartWithMerge`와 같은 leaf)", () => {
  const base = { propertyType: "housing", isOneHousehold: true, acquisitionDate: "2021-06-01", transferDate: "2026-06-15", residencePeriodMonths: 61 };

  it("취득일 기준: 61 > 60 → 문구 «취득일(2021-06-01)부터 양도일까지의 60개월»", () => {
    expect(residenceMonthsOverflowIssue(base)).toContain("취득일(2021-06-01)부터 양도일까지의 60개월");
    expect(residenceMonthsOverflowIssue({ ...base, residencePeriodMonths: 60 })).toBeNull();
  });

  it("🔑 토지만 본인 × 같은 세대 × 합가: 기준일이 합가일 — 합가 2023-06-01이면 상한 36개월(2023-06-01~2026-06-15) · 문구가 합가일을 말한다", () => {
    const merged = { ...base, selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: "2023-06-01" };
    expect(residenceMonthsOverflowIssue({ ...merged, residencePeriodMonths: 36 })).toBeNull();
    const msg = residenceMonthsOverflowIssue({ ...merged, residencePeriodMonths: 37 });
    expect(msg).toContain("세대 합가일(2023-06-01)부터 양도일까지의 36개월");
  });

  it("합가일이 취득일보다 이르면 취득일 기준 그대로(합가일은 늦출 때만 쓴다)", () => {
    const merged = { ...base, selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: "2019-01-01" };
    expect(residenceMonthsOverflowIssue({ ...merged, residencePeriodMonths: 60 })).toBeNull();
    expect(residenceMonthsOverflowIssue({ ...merged, residencePeriodMonths: 61 })).toContain("취득일(2021-06-01)");
  });

  it("처음부터 같은 세대(합가 아님)·다른 세대는 합가일을 쓰지 않는다", () => {
    const m = { ...base, selfOwns: "land_only", buildingOwnerHouseholdMergeDate: "2023-06-01" };
    expect(residenceMonthsOverflowIssue({ ...m, buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: false, residencePeriodMonths: 60 })).toBeNull();
    expect(residenceMonthsOverflowIssue({ ...m, buildingOwnerSameHousehold: false, buildingOwnerHouseholdMerged: true, residencePeriodMonths: 60 })).toBeNull();
  });

  it("적용하지 않는 조합 — 1세대1주택 아님 · 주택 외 자산 · 재개발(자체 상한) · 개월 미입력 · 날짜 역전", () => {
    expect(residenceMonthsOverflowIssue({ ...base, isOneHousehold: false })).toBeNull();
    expect(residenceMonthsOverflowIssue({ ...base, propertyType: "land" })).toBeNull();
    expect(residenceMonthsOverflowIssue({ ...base, redevelopment: { subject: "apt" } })).toBeNull();
    expect(residenceMonthsOverflowIssue({ ...base, residencePeriodMonths: undefined })).toBeNull();
    expect(residenceMonthsOverflowIssue({ ...base, acquisitionDate: "2027-01-01" })).toBeNull();
  });

  it("🔑 통산 기산 후보 — 증여자 취득일·세대 보유 시작일·이월과세 증여자 날짜가 취득일보다 이르면 그 날부터가 상한(⑧보다 느슨: ⑧ 통과 ⇒ ⑫ 통과)", () => {
    // 취득(증여) 2025-06-01 · 양도 2026-06-15 → 취득일 기준 상한 12개월
    const gift = { ...base, acquisitionDate: "2025-06-01", acquisitionCause: "gift", residencePeriodMonths: 36 };
    expect(residenceMonthsOverflowIssue(gift)).toContain("취득일(2025-06-01)부터 양도일까지의 12개월"); // 통산 후보 없으면 ⑧과 같다
    expect(residenceMonthsOverflowIssue({ ...gift, giftHouseholdHoldingStartDate: "2000-06-01" })).toBeNull();
    expect(residenceMonthsOverflowIssue({ ...gift, donorAcquisitionDate: "2000-06-01" })).toBeNull();
    expect(residenceMonthsOverflowIssue({ ...gift, carryoverTaxation: { donorHouseholdHoldingStartDate: "2000-06-01" } })).toBeNull();
    expect(residenceMonthsOverflowIssue({ ...gift, carryoverTaxation: { donorAcquisitionDate: "2000-06-01" } })).toBeNull();
    // 토지 분리취득 · 이월과세 파트(B/C)의 증여자 취득일도 같은 후보다
    expect(residenceMonthsOverflowIssue({ ...gift, landAcquisitionDate: "2008-01-01", residencePeriodMonths: 120 })).toBeNull();
    expect(residenceMonthsOverflowIssue({ ...gift, buildingCarryoverPart: { donorAcquisitionDate: "2015-06-01" }, residencePeriodMonths: 120 })).toBeNull();
    expect(residenceMonthsOverflowIssue({ ...gift, landCarryoverPart: { donorAcquisitionDate: "1995-03-01" }, residencePeriodMonths: 120 })).toBeNull();
    // 통산 후보에서도 넘으면 막고, 그 날짜가 무엇인지 문구가 밝힌다(2023-06-01~2026-06-15 = 36개월 → 37 차단)
    const msg = residenceMonthsOverflowIssue({ ...gift, giftHouseholdHoldingStartDate: "2023-06-01", residencePeriodMonths: 37 });
    expect(msg).toContain("보유 기산 후보 중 가장 이른 날(2023-06-01");
    expect(msg).toContain("36개월");
    expect(residenceMonthsOverflowIssue({ ...gift, giftHouseholdHoldingStartDate: "2023-06-01", residencePeriodMonths: 36 })).toBeNull();
    // 취득일보다 늦은 후보는 기준일을 늦추지 않는다
    expect(residenceMonthsOverflowIssue({ ...gift, giftHouseholdHoldingStartDate: "2026-01-01" })).toContain("취득일(2025-06-01)");
  });

  it("증여 취득이면 «증여 전 동일세대 거주기간» 칸 안내가 붙는다(⑧ `giftPriorHint`와 같은 문구)", () => {
    expect(residenceMonthsOverflowIssue({ ...base, acquisitionCause: "gift" })).toContain("증여 전 동일세대 거주기간");
    expect(residenceMonthsOverflowIssue({ ...base, acquisitionCause: "purchase" })).not.toContain("증여 전 동일세대 거주기간");
  });
});
