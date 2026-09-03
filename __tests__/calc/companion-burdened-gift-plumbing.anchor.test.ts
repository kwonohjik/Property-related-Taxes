/**
 * anchor — 컴패니언(다른 물건) × 부담부증여 **배관(④⑧⑩⑫⑬⑭) + 증여세 1회**.
 *
 * 엔진 레벨 정합은 `__tests__/tax-engine/transfer/companion-burdened-gift-debt-override.anchor.test.ts`
 * (O)가 지킨다. 여기서는 **route를 태워** 재배분된 채무가 실제로 도달하는지를 본다.
 *
 * ## 이 anchor가 지키는 것
 *
 * | 층이 빠지면 | 관측되는 값 |
 * |---|---|
 * | ④ 재배분 없음 | 카드마다 자기 채무 전액이 B → 차익 합계가 **자산 수만큼** 곱해진다 |
 * | ⑫ `assumedDebtOverride` 미등록 | Zod 침묵 stripping → 위와 같음 |
 * | ⑬ 컴패니언 payload에 미주입 | 그 카드만 과대 |
 * | ⑬ 합산 `burdenedGiftWholeInfo` 없음 | 증여세가 **아예 표시되지 않는다**(실측 undefined) |
 *
 * ## 픽스처 (소령 §159 — KoreanLaw 실측 mst=286211)
 *
 * 물건1 평가 10억(취득 5억) · 채무 4억  ┐
 * 물건2 평가  6억(취득 3억) · 채무 **0** ┘ ΣA = 16억, B = 4억 ⇒ debtRatio = B/ΣA = 0.25
 *
 * 물건2에 채무가 없는 것은 **의도된 설계**다 — 근저당이 한 물건에만 설정된 정상 케이스이고,
 * 「입력 채무 × 비율」 방식으로는 그 자산 몫이 통째로 사라진다는 것을 이 픽스처가 고정한다.
 *
 * ⚠️ 수치는 mock 세율표 실측값이지 「정본 세액」이 아니다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const BG = (
  stdTransfer: string,
  stdAcq: string,
  deposit: string,
  mortgage: string,
): Record<string, unknown> => ({
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_standard",
  bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: deposit,
  bgMortgageDebtAmount: mortgage,
  standardPriceAtTransfer: stdTransfer,
  standardPriceAtAcq: stdAcq,
});

const asset = (id: number, over: Record<string, unknown> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(id),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    ownershipNumerator: "100",
    ownershipDenominator: "100",
    ...over,
  }) as AssetForm;

const form = (assets: AssetForm[], contractTotalPrice = "1600000000"): TransferFormData =>
  ({
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    assets,
    houses: [],
    presaleRights: [],
    contractTotalPrice,
    totalTransferExpense: "0",
    householdHousingCount: "2",
    isOneHousehold: false,
  }) as unknown as TransferFormData;

const ASSET_1 = asset(1, BG("1000000000", "500000000", "200000000", "200000000"));
const ASSET_2 = asset(2, BG("600000000", "300000000", "0", "0"));

interface RouteData {
  mode?: string;
  aggregated?: {
    totalTax?: number;
    properties?: { transferGain: number }[];
    burdenedGift?: {
      debtRatio: number;
      assumedDebtAmount: number;
      sangjeungbeopValuation?: { max: number; selectedMode: string };
      giftTax?: { taxBase: number; finalTax: number };
    };
  };
  result?: { transferGain?: number; totalTax?: number };
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
      body: JSON.stringify({
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        isNonBusinessLand: false,
        annualBasicDeductionUsed: 0,
        ...cap.body,
        isOneHousehold: false,
        householdHousingCount: 2,
        residencePeriodMonths: 0,
      }),
    }),
  );
  const json = (await res.json()) as { data?: RouteData };
  return { status: res.status, body: cap.body!, data: json.data };
}

describe("컴패니언 × 부담부증여 — 배관", () => {
  it("C-1 ④⑬ 채무가 **자산가액 비율로 재배분**돼 실린다", async () => {
    const { body } = await run(form([ASSET_1, ASSET_2]));
    const primary = body.burdenedGiftInfo as Record<string, number>;
    // Bᵢ = 4억 × Aᵢ/16억
    expect(primary.assumedDebtOverride).toBe(250_000_000); // 10/16
    // 입력 채무 자체는 건드리지 않는다 — 평가액 A가 흔들리면 안 된다(O-3).
    expect(primary.lendingDepositTotal).toBe(200_000_000);
    expect(primary.mortgageDebtAmount).toBe(200_000_000);

    const comps = body.companionAssets as Record<string, unknown>[];
    const comp = comps[0].burdenedGiftInfo as Record<string, number>;
    expect(comp.assumedDebtOverride).toBe(150_000_000); // 6/16
    // 🔑 입력 채무가 **0인 자산**이 몫을 받는다 — 「입력 채무 × 비율」로는 불가능한 값.
    expect(comp.lendingDepositTotal).toBe(0);
    expect(comp.mortgageDebtAmount).toBe(0);
    expect(comps[0].transferType).toBe("burdened_gift"); // 엔진 §159 게이트
  });

  it("C-2 ⑬ 합산 `burdenedGiftWholeInfo`가 실린다 (증여세 1회용)", async () => {
    const { body } = await run(form([ASSET_1, ASSET_2]));
    const whole = body.burdenedGiftWholeInfo as Record<string, number | undefined>;
    expect(whole.buildingStdPriceAtTransfer).toBe(1_600_000_000); // ΣA
    expect(whole.buildingStdPriceAtAcquisition).toBe(800_000_000);
    expect(whole.lendingDepositTotal).toBe(200_000_000); // 총 채무 = 4억
    expect(whole.mortgageDebtAmount).toBe(200_000_000);
    // 카드용 재배분값은 합산 info에 실리지 않는다 — 여기서는 B가 신고 단위 그대로다.
    expect(whole.assumedDebtOverride).toBeUndefined();
  });

  it("C-3 🔴 차익 합계 = **재배분 없는 현행의 절반** (자산 수만큼 곱해지지 않는다)", async () => {
    const { status, data } = await run(form([ASSET_1, ASSET_2]));
    expect(status).toBe(200);
    expect(data?.mode).toBe("bundled");
    expect(data?.aggregated?.properties?.map((p) => p.transferGain)).toEqual([
      121_250_000, 72_750_000,
    ]);
    // 합계 194,000,000. 재배분을 끄면 각 카드가 자기 채무 전액을 B로 잡아 388,000,000이 된다
    // (Gate-B 해제 전 실측 — 이 anchor가 그 회귀를 막는다).
    expect(data?.aggregated?.totalTax).toBe(35_830_300);
  });

  it("C-4 자산별 차익이 **debtRatio 0.25를 강제한 단건 참조**와 일치한다", async () => {
    // 단건은 카드 하나가 곧 증여계약이므로 B/C = 0.25가 되도록 채무를 직접 넣는다.
    const s1 = await run(form([asset(1, BG("1000000000", "500000000", "125000000", "125000000"))]));
    const s2 = await run(form([asset(2, BG("600000000", "300000000", "75000000", "75000000"))]));
    expect(s1.data?.result?.transferGain).toBe(121_250_000);
    expect(s2.data?.result?.transferGain).toBe(72_750_000);
  });

  it("C-5 🔴 증여세는 **증여계약 단위 1회** — 카드별로 쪼개지지 않는다", async () => {
    const { data } = await run(form([ASSET_1, ASSET_2]));
    const bg = data?.aggregated?.burdenedGift;
    expect(bg?.assumedDebtAmount).toBe(400_000_000); // 신고 단위 B
    expect(bg?.debtRatio).toBeCloseTo(0.25, 10);
    // 합산 info의 성분 단순 합이 ΣAᵢ와 일치한다 — 승자가 전부 보충적평가일 때만 성립하며
    // 그 조건은 ⑧ 게이트(C-7)가 강제한다.
    expect(bg?.sangjeungbeopValuation?.max).toBe(1_600_000_000);
    expect(bg?.sangjeungbeopValuation?.selectedMode).toBe("supplementary");
    // 과세표준 = 16억 − 4억(채무) − 5천만(직계비속 증여재산공제)
    expect(bg?.giftTax?.taxBase).toBe(1_150_000_000);
    expect(bg?.giftTax?.finalTax).toBe(291_000_000);
  });

  it("C-6 ⑧ Gate-B: 채무 0인 자산이 **막히지 않는다**", () => {
    // 자산별 「채무 > 0」을 요구하면 근저당이 한 물건에만 있는 정상 케이스가 통째로 막힌다.
    const msgs = collectStepIssues(0, form([ASSET_1, ASSET_2]) as never).map((i) => i.message);
    expect(msgs).toEqual([]);
  });

  it("C-7 ⑧ 담보평가가 max인 자산이 섞이면 **명시 차단**", () => {
    // 물건2: 보충적평가 6억 < 담보평가 7억 ⇒ 성분 단순 합이 ΣAᵢ와 어긋나 증여세가 조용히 틀린다.
    const overSecured = asset(2, BG("600000000", "300000000", "350000000", "350000000"));
    const msgs = collectStepIssues(0, form([ASSET_1, overSecured]) as never).map((i) => i.message);
    // ⚠️ 합성 문자열 substring 금지 — 조문 표기 1건으로 좁게 단언한다.
    //    (「A·B」 같은 합성 문자열을 보면 메시지 문구가 바뀔 때 조용히 어긋난다.)
    expect(msgs.some((m) => m.includes("담보평가(상증법 §66)"))).toBe(true);
    // 자산 1은 보충적평가가 max라 걸리지 않는다 — 게이트가 넓어지면 지원 조합까지 막힌다.
    expect(msgs.filter((m) => m.includes("담보평가"))).toHaveLength(1);
  });

  it("C-8 축 B(지분 분할) 회귀 — 재배분이 걸리지 않는다", async () => {
    // 같은 물건의 60/40 분할. 채무 규약이 달라(물건 전체 입력 + 지분 안분) override가 붙으면 안 된다.
    const B = BG("1000000001", "500000001", "300000000", "300000000");
    const f = form(
      [
        asset(1, { ...B, ownershipNumerator: "60" }),
        asset(2, { ...B, ownershipNumerator: "40" }),
      ],
      "1000000000",
    );
    const { status, body, data } = await run(f);
    expect(status).toBe(200);
    expect((body.burdenedGiftInfo as Record<string, unknown>).assumedDebtOverride).toBeUndefined();
    // PR #1447이 고정한 값 그대로.
    expect(data?.aggregated?.totalTax).toBe(64_600_360);
  });
});
