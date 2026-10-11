/**
 * 1h-G1-6 anchor — 증여 화면의 부담부증여 양도세 경로는 지분율·물건 전체 가액 입력이 없다(최소 조치: ⑧ 차단 + 계산기 안내).
 *
 * 근거: 「소득세법 시행령」 §156①은 일부가 타인 소유인 주택을 「양도하는 부분(타인 소유부분을 포함한다)의 면적이 전체 주택면적에서
 * 차지하는 비율을 나누어 계산한 금액이 12억원을 초과하는 경우」에 고가주택으로 본다(물건 전체 기준). §160①도 12억 × 지분 비율로
 * 안분한다. 종전에는 20억 아파트의 1/2 지분(지분 가액 10억)을 증여하면 지분 가액으로 판정돼 전액 비과세(totalTax 0)였다 —
 * 같은 사실을 물건 전체 값 + ownershipRatio 0.5로 넣으면 고가주택 부분 비과세(taxableGain 58,200,000)다.
 *
 * 이 anchor가 지키는 것
 *  · G1-6-A/B  ⑧: 「일부 지분만 증여」 ON이면 증여 화면이 막고 계산기로 안내한다. OFF·비주택은 통과(긍정 짝).
 *  · G1-6-C    계산기(지분 부담부증여): ④가 totalPropertyTransferPrice 0을 싣지 않아 ⑫가 400을 내지 않는다 — 안내가 성립하는 전제.
 *              (계산기 → 12억 분모는 엔진이 물건 전체 보충적평가액을 burdenedGiftDenominator로 싣는다.)
 *  · G1-6-D    긍정 짝: 일반(비 부담부증여) 지분 양도는 여전히 총 물건가를 싣는다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { bodyOf, giftItem, post, type Obj } from "./_gift-burdened-pr7-harness";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));
afterEach(() => vi.unstubAllGlobals());

const BGT = { acquisitionDate: new Date("2015-01-01"), residencePeriodMonths: 60, householdHousingCount: 1, standardPriceAtAcquisition: 500_000_000 };
const step1 = (item: EstateItem) =>
  validateStep(1, { ...INITIAL_FORM, giftDate: "2025-06-01", donor: "father", giftItems: [item] } as FormState);

describe("G1-6 ⑧ — 증여 화면: 일부 지분만 증여", () => {
  it("G1-6-A: ON이면 ⑧이 막고 양도소득세 계산기로 안내한다", () => {
    const msg = step1(giftItem({ ...BGT, isPartialOwnershipGift: true }, { standardPrice: 1_000_000_000, debt: 300_000_000 }));
    expect(msg).toContain("일부 지분");
    expect(msg).toContain("양도소득세 계산기");
    expect(msg).toContain("§156①");
  });
  it("G1-6-B(긍정 짝): OFF(미선택)면 통과 · 비주택(토지)은 이 토글이 없으므로 stale 값이 있어도 막지 않는다", () => {
    expect(step1(giftItem({ ...BGT }, { standardPrice: 1_000_000_000, debt: 300_000_000 }))).toBeNull();
    const land = giftItem({ ...BGT, isPartialOwnershipGift: true }, { standardPrice: 1_000_000_000, debt: 300_000_000 });
    expect(step1({ ...land, category: "real_estate_land" } as EstateItem)).toBeNull();
  });
});

describe("G1-6 계산기 — 지분 부담부증여가 새 폼에서 400이 나지 않는다", () => {
  const calcForm = (over: Record<string, unknown> = {}): TransferFormData => {
    const a = {
      ...makeDefaultAsset(1),
      addressJibun: "서울 강남구 테스트동 1-1",
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2015-01-01",
      ownershipNumerator: "50",
      ownershipDenominator: "100",
      ownershipRemainderThirdParty: "yes", // 나머지 지분은 타인 소유(축 A 선언)
      transferType: "burdened_gift",
      bgValuationMode: "sangjeungbeop_standard",
      bgDonorRelation: "lineal_descendant",
      bgLendingDepositTotal: "100000000",
      bgMortgageDebtAmount: "200000000",
      standardPriceAtTransfer: "2000000000", // 물건 전체(100%) 20억
      standardPriceAtAcq: "1000000000",
      ...over,
    };
    return { ...createDefaultTransferFormData(), transferDate: "2025-06-01", assets: [a], householdHousingCount: "1", isOneHousehold: true } as unknown as TransferFormData;
  };

  it("G1-6-C: ④가 totalPropertyTransferPrice를 싣지 않고, ⑧ 통과, route 200 — 물건 전체 20억의 1/2 지분은 고가주택 부분 비과세", async () => {
    const f = calcForm();
    expect(collectStepIssues(0, f).map((i) => i.message)).toEqual([]);
    const body = await bodyOf(() => callTransferTaxAPI(f));
    expect(body.ownershipRatio).toBe(0.5);
    expect("totalPropertyTransferPrice" in body && body.totalPropertyTransferPrice !== undefined).toBe(false);
    const res = await post(body);
    expect(res.status).toBe(200);
    const r = ((await res.json()) as { data: { result: Obj } }).data.result;
    // 증여 화면에 물건 전체 값 + ownershipRatio 0.5를 직접 넣은 대조 B(리뷰)와 같은 값
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt).toBe(true);
    expect(r.exemptReason).toBe("1세대1주택 고가주택");
    expect(r.transferGain).toBe(145_500_000);
    // 145,500,000 × (20억 − 12억) / 20억 — 분모는 지분 가액(10억)이 아니라 물건 전체
    expect(r.taxableGain).toBe(58_200_000);
  });

  it("G1-6-D(긍정 짝): 일반(비 부담부증여) 지분 양도는 여전히 총 물건가를 싣는다", async () => {
    const f = {
      ...calcForm({ transferType: "sale", actualSalePrice: "", acquisitionCause: "purchase" }),
      contractTotalPrice: "2000000000",
    } as TransferFormData;
    const body = await bodyOf(() => callTransferTaxAPI(f));
    expect(body.totalPropertyTransferPrice).toBe(2_000_000_000);
  });
});
