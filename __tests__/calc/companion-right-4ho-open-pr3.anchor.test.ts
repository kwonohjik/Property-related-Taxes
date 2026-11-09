/**
 * anchor — 컴패니언 조합원입주권 §89①4호 열기 PR-3: 세대 사실을 입력할 칸(① 세대·주택 현황 · 분양권·입주권 없음 확인)과 ⑧ 차단
 * (계획서 `docs/00-pm/companion-right-4ho-open.plan.md` §9 V-2 · §10).
 *
 * 종전: 주 자산 토지·건물 + 함께 양도 입주권 구성은 세대 기준 자산이 토지라 ① 칸 전체가 숨었다 — §89①4호 가목이 요구하는
 * «다른 주택·분양권 미보유»를 화면에서 답할 길이 없어 컴패니언 입주권의 4호가 열리지 않았다(PR-2 CR-18은 엔진 쪽 막힘만 고정).
 * 술어 한 곳(`household-facts-asset.ts`)이 ⑤ 표시 · ④ 전송 · ⑧ 검증의 게이트다(3중 패턴) — 여기는 ④·⑧ 쪽, 표시는 `.ui.test.tsx`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { allIssues, captureBody } from "./_helpers/redev-one-house-route";
import { HOUSE, LAND, form as g1Form } from "./_helpers/g1-reverse-appurtenant-fixtures";

vi.mock("@/lib/db/tax-rates", async (io) => {
  const actual = await io<typeof import("@/lib/db/tax-rates")>();
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

const NO_OTHER = "다른 보유 주택이 없는지 확인하세요.";
const NO_PRESALE = "세대가 보유한 분양권·입주권이 없는지 확인하세요.";
const SL = (id: string) => ({ ...LAND(id, 300), landNature: "standalone" });
const step1 = (f: TransferFormData) => allIssues(f).filter((i) => i.step === 1).map((i) => i.message);

/** 함께 양도 조합원입주권 한 자산. */
const RIGHT = (id: string): Record<string, unknown> => ({
  ...makeDefaultAsset(2),
  assetId: id,
  assetKind: "right_to_move_in",
  acquisitionCause: "purchase",
  acquisitionDate: "2018-03-01",
  fixedAcquisitionPrice: "300000000",
  actualSalePrice: "500000000",
  useEstimatedAcquisition: false,
  redevApprovalDate: "2019-06-01",
  redevRightsValue: "700000000",
  redevSettlementAmount: "0",
  redevPreApprovalExpenses: "0",
  redevActualAcquisitionPrice: "300000000",
  redevOriginalAssetType: "housing",
  redevExemptionEligibleAtApproval: "yes",
  addressJibun: "서울특별시 마포구 테스트동 1-1",
});

/** 보유 상황 단계를 «채우기 전» — 두 확인 토글이 꺼져 있다. */
const UNANSWERED = { householdNoOtherHousesConfirmed: false, householdNoPresaleRightsConfirmed: false } as Partial<TransferFormData>;
const withForm = (f: unknown, over: Partial<TransferFormData>) => withTestAddress({ ...(f as object), ...over } as TransferFormData);

describe("PR-3 ⑧ — 토지·건물 + 함께 양도 입주권에서 세대 사실 확인이 비면 막는다", () => {
  it("P3-1 🔑 토지 + 입주권 · 보유 상황 미입력 → «다른 보유 주택 없음»·«분양권·입주권 없음» 확인 2건 (종전: 통과 — 답할 칸이 없었다)", () => {
    const rv = step1(withForm(g1Form(SL("l1"), RIGHT("r1")), UNANSWERED));
    expect(rv).toContain(NO_OTHER);
    expect(rv).toContain(NO_PRESALE);
  });

  it("P3-2 두 확인을 켜면 통과", () => {
    const rv = step1(withForm(g1Form(SL("l1"), RIGHT("r1")), { householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true } as never));
    expect(rv).not.toContain(NO_OTHER);
    expect(rv).not.toContain(NO_PRESALE);
  });

  it("P3-3 짝 — 토지 + 분양권 컴패니언은 칸이 숨은 채로 통과한다(기준 자산은 입주권만 추가)", () => {
    const presale = { ...makeDefaultAsset(2), assetId: "p1", assetKind: "presale_right" };
    const rv = step1(withForm(g1Form(SL("l1"), presale), UNANSWERED));
    expect(rv).not.toContain(NO_OTHER);
    expect(rv).not.toContain(NO_PRESALE);
  });

  it("P3-4 짝 — 토지 + 주택 + 입주권이면 기준은 주택(종전 경로) — 같은 두 확인을 요구한다", () => {
    const rv = step1(withForm(g1Form(SL("l1"), HOUSE(0), RIGHT("r1")), UNANSWERED));
    expect(rv).toContain(NO_OTHER);
    expect(rv).toContain(NO_PRESALE);
  });
});

describe("PR-3 ④ — 입주권 기준 자산은 주택 카드용 id를 싣지 않는다", () => {
  it("P3-5 토지 + 입주권 → householdFactsCompanionAssetId 없음 (입주권 카드의 세대 사실은 oneRightHouseholdFacts가 싣는다)", async () => {
    const body = await captureBody(withForm(g1Form(SL("l1"), RIGHT("r1")), { transferDate: "2026-06-01", householdHousingCount: "0" } as never));
    expect(body.householdFactsCompanionAssetId).toBeUndefined();
  });

  it("P3-6 짝 — 토지 + 주택 → 주택 id를 싣는다(NH-14 후속, 불변)", async () => {
    const body = await captureBody(withForm(g1Form(SL("l1"), HOUSE(0)), { transferDate: "2026-02-16" } as never));
    expect(typeof body.householdFactsCompanionAssetId).toBe("string");
  });

  it("P3-7 토지 + 입주권 · 세대 주택 0 + 두 확인 → 본문 세대 입주권 수 1 · 주택 수 0 · 분양권 없음 확인이 실린다", async () => {
    const body = await captureBody(
      withForm(g1Form(SL("l1"), RIGHT("r1")), {
        transferDate: "2026-06-01",
        householdHousingCount: "0",
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
      } as never),
    );
    expect(body.householdRightCount).toBe(1);
    expect(body.householdNoPresaleRightsConfirmed).toBe(true);
  });
});
