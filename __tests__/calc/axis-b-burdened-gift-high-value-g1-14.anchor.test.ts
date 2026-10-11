/**
 * 1h-G1-14 anchor(결정 #28 A · «축 B 정정») — 지분 분할 취득(축 B) 60% + 40% 카드 = 단건 100%.
 *
 * 종전: 축 B 카드는 ④가 채무를 지분율만큼 미리 줄여 싣는다(§159의 B/C 보존). 그런데 12억 고가주택 판정 가액은 «물건 전체
 * 보충적평가액(기준시가)»으로 고정이라, 담보(§66)가 기준시가보다 큰 1세대1주택은 단건 100%는 고가주택인데 60/40은 전액
 * 비과세로 갈렸다(국심2007서2099 「이전방식에 관계없이 1주택의 전체가액」 위배).
 * 지분 증여가액 ÷ 지분율(소령 §156①)로 판정하면 카드 C(= 물건 전체 C × r) ÷ r = 물건 전체 증여가액이라 단건과 같아진다.
 *
 * 시료: 물건 전체 양도시 기준시가 11억 · 취득시 5억 · 채무 13억(보증금 6.5억 + 차입 6.5억 — 담보 승) · 1세대1주택 · 거주 120개월 ·
 * 2009-03-01 → 2024-03-01. 기존 축 B anchor는 전부 보충적평가가 이기는 시료라 이 차이를 못 잡았다. mock 세율표 실측 — 방향만 유효.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const asset = (id: number, numerator: string, bg: Record<string, string>): AssetForm =>
  ({
    ...makeDefaultAsset(id),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "120",
    ownershipNumerator: numerator,
    ownershipDenominator: "100",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard",
    bgDonorRelation: "lineal_descendant",
    standardPriceAtTransfer: "1100000000",
    standardPriceAtAcq: "500000000",
    ...bg,
  }) as AssetForm;

const form = (assets: AssetForm[], contractTotalPrice = "1300000000"): TransferFormData =>
  ({
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    assets,
    houses: [],
    presaleRights: [],
    contractTotalPrice,
    totalTransferExpense: "0",
    householdHousingCount: "1",
    isOneHousehold: true,
    residencePeriodMonths: "120",
  }) as unknown as TransferFormData;

interface Data {
  mode?: string;
  aggregated?: {
    totalTax?: number;
    properties?: { transferGain: number; isExempt?: boolean; exemptReason?: string; steps?: { formula: string }[] }[];
  };
  result?: { totalTax?: number; isExempt?: boolean };
}
async function run(f: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...cap.body }),
    }),
  );
  const json = (await res.json()) as { data?: Data };
  return { status: res.status, data: json.data };
}

/** 채무 13억 = 보증금 6.5억 + 차입 6.5억 (물건 전체 입력 — 축 B는 ④가 ×지분율) */
const DEBT = { bgLendingDepositTotal: "650000000", bgMortgageDebtAmount: "650000000" };

describe("축 B 정정 — 담보가 이기는 1세대1주택: 60% + 40% = 단건 100%", () => {
  it("AB-1 ★ 단건 100% = 고가주택 부분 과세 632,076(담보 13억 > 기준시가 11억 → 12억 초과)", async () => {
    const single = await run(form([asset(1, "100", DEBT)]));
    expect(single.status).toBe(200);
    expect(single.data?.result?.isExempt).toBe(false);
    expect(single.data?.result?.totalTax).toBe(632_076);
  });

  it("AB-2 ★ 60/40 두 카드 모두 «물건 전체 증여가액 C 13억»으로 12억 초과를 판정한다(종전 0 — 11억 ≤ 12억 전액 비과세)", async () => {
    const axisB = await run(form([asset(1, "60", DEBT), asset(2, "40", DEBT)]));
    expect(axisB.status).toBe(200);
    expect(axisB.data?.mode).toBe("bundled");
    const props = axisB.data?.aggregated?.properties ?? [];
    expect(props).toHaveLength(2);
    for (const p of props) {
      expect(p.isExempt).toBe(false);
      expect(p.exemptReason).toBe("1세대1주택 고가주택");
      // 12억 초과분 안분의 분자·분모가 지분분 C가 아니라 물건 전체 C(13억)다 — 단건 100%와 같은 판정 가액
      expect(p.steps?.some((st) => st.formula.includes("증여가액 C 1,300,000,000 - 12억"))).toBe(true);
    }
    expect(axisB.data?.aggregated?.totalTax).toBeGreaterThan(0);
  });

  it("AB-3 부정 짝 — 보충적평가가 이기는 시료(담보 6억 < 기준시가 11억)는 단건·60/40 모두 전액 비과세 0", async () => {
    const small = { bgLendingDepositTotal: "300000000", bgMortgageDebtAmount: "300000000" };
    const single = await run(form([asset(1, "100", small)]));
    const axisB = await run(form([asset(1, "60", small), asset(2, "40", small)]));
    expect(single.data?.result?.totalTax).toBe(0);
    expect(axisB.data?.aggregated?.totalTax).toBe(0);
  });
});

describe("별건 400 — 새 폼(양도가액 contractTotalPrice 빈 칸)에서도 지분 부담부증여 계산이 막히지 않는다 (결정 #28 조건)", () => {
  /**
   * 부담부증여의 양도가액은 §159가 채무 안분으로 정하므로 폼의 «양도가액» 칸은 비어 있다. ④가 그 빈 칸을
   * totalPropertyTransferPrice = 0 으로 실으면 ⑫ `positive()`가 거절해 400이었다. #2098(PR7)이 부담부증여 주 자산에서
   * 그 값을 싣지 않게 해소했다 — 이 anchor가 «양도가액이 빈 새 폼»으로 고정한다(기존 R4 D3·축 B 배관 anchor는 10억 픽스처라 400을 가렸다).
   */
  it("NF-1 ★ 축 B 60/40 · 양도가액 빈 새 폼 → 200 (합계 > 0)", async () => {
    const blank = await run(form([asset(1, "60", DEBT), asset(2, "40", DEBT)], ""));
    expect(blank.status).toBe(200);
    expect(blank.data?.aggregated?.totalTax).toBeGreaterThan(0);
    // 양도가액은 §159가 채무 안분으로 정하므로 칸을 채워도 세액이 같다 — placeholder가 계산에 새지 않는다
    const filled = await run(form([asset(1, "60", DEBT), asset(2, "40", DEBT)]));
    expect(blank.data?.aggregated?.totalTax).toBe(filled.data?.aggregated?.totalTax);
  });
  it("NF-3 함께 부담부증여(다른 물건 2건 100%) · 양도가액 빈 새 폼 → 200", async () => {
    const r = await run(form([asset(1, "100", DEBT), asset(2, "100", { ...DEBT, assetId: "2" })], ""));
    expect(r.status).toBe(200);
  });
  it("NF-2 ★ 단건 지분 1/2(나머지 타인 소유) · 양도가액 빈 새 폼 → 200", async () => {
    const half = asset(1, "50", { bgLendingDepositTotal: "325000000", bgMortgageDebtAmount: "325000000", ownershipRemainderThirdParty: "yes" });
    const r = await run(form([half], ""));
    expect(r.status).toBe(200);
  });
});
