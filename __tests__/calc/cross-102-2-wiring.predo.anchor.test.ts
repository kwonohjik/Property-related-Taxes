/**
 * Pre-Do anchor — **크로스 §102② 통산 «배선»** (PR-4)
 *
 * 계획서: `docs/00-pm/cross-engine-102-2-loss-offset.plan.md` §4.3 축 3 · **§5.2** · §7 · §11 PR-4
 *
 * ## PR-3과 무엇이 다른가
 *
 * PR-3은 **계산**을 만들었다(`cross-102-2-loss-offset.ts`). 그런데 크로스 §104⑤ API가 받는 것은
 * **과세표준과 산출세액**이라(`cross-104-5-api.ts:13~17`), 통산이 자산별 양도소득금액을 바꿔도
 * **아무 세액도 바뀌지 않는다**. 과세표준은 기본공제 배분(§103②)을, 산출세액은 세율표를 거쳐야
 * 나오기 때문이다.
 *
 * ⇒ **두 엔진에 통산 결과를 주입해 다시 돌린다**(계획서 §5.2 (a)). 이 파일이 그 배선을 고정한다.
 *
 * ## 주입 형태가 «왜» 엔진마다 다른가
 *
 * | 엔진 | 주입 | 이유 |
 * |---|---|---|
 * | 부동산(다자산) | **외부 행**(`crossLossOffsetExternal`) | 자기 자산이 여럿이라 §167의2①의 1호·2호 배분을 **엔진이 직접** 해야 `lossOffsetFromSame`/`FromOther`가 정합하다. 그 둘은 표시용이 아니라 **감면 안분의 입력**이다(`transfer-tax-aggregate.ts:221`) |
 * | 기타자산(단건) | **통산 후 income**(`crossLossOffsetIncome`) | 크로스 경로는 단건 엔드포인트라 자산이 **하나**다 — 배분할 것이 없다 |
 *
 * 🔑 두 경로가 **같은 답**을 내는 근거는 «같은 배열·같은 순서»다. 부동산 엔진은
 *   `[자기 자산…, 외부 행…]` 순으로 코어를 돌리고, 크로스 레이어도 `[부동산…, 기타자산]` 순으로
 *   돌린다(`buildCrossLossRows`). 코어는 결정적이므로 두 결과가 일치한다.
 *   ⚠️ 순서가 어긋나면 **잔액 흡수**(floor 잔여)가 갈려 1원이 틀어질 수 있다 — W-7이 고정한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

import { offsetLosses, type AssetRecord } from "@/lib/tax-engine/transfer-tax-aggregate-helpers";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { multiInputSchema } from "@/lib/api/transfer-tax-schema";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { defaultMultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { buildCrossInjection } from "@/lib/calc/cross-102-2-apply";
import { CROSS_PROG_BASIC, CROSS_PROG_NBL } from "@/lib/tax-engine/cross-loss-offset-rate-key";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** `offsetLosses`가 읽는 4개 필드만 채운 최소 레코드 (characterization 픽스처와 같은 규약) */
function rec(propertyId: string, rateKey: string, income: number, isExempt = false): AssetRecord {
  return {
    item: { propertyId },
    result: { isExempt },
    rateGroup: "progressive",
    lossOffsetRateKey: rateKey,
    income,
  } as unknown as AssetRecord;
}

// ============================================================
// 축 3-a — 부동산 엔진에 «외부 행» 주입
// ============================================================

describe("W: 부동산 통산에 기타자산 행을 넣는다", () => {
  it("W-1 🔴 외부 차손이 부동산 차익을 잠식한다", () => {
    const out = offsetLosses(
      [rec("p1", "prog:104-1-1", 500_000_000)],
      [{ id: "other-asset", income: -200_000_000, rateKey: CROSS_PROG_BASIC, exempt: false }],
    );
    // 부동산 자산의 통산 후 양도소득금액이 차손만큼 줄어든다
    expect(out.incomeAfterOffset).toEqual([300_000_000]);
    expect(out.lossOffsetFromSame[0]).toBe(200_000_000);
    // 출력 배열은 **자기 자산 길이**로 잘려 나온다 — 외부 행이 새 자산으로 보이면 안 된다
    expect(out.incomeAfterOffset).toHaveLength(1);
    expect(out.lossOffsetFromSame).toHaveLength(1);
  });

  it("W-2 🔴 외부 행이 있으면 자기 키도 크로스 축으로 번역된다 (§167의2①1호가 살아난다)", () => {
    const out = offsetLosses(
      [rec("p1", "prog:104-1-1", 500_000_000)],
      [{ id: "other-asset", income: -200_000_000, rateKey: CROSS_PROG_BASIC, exempt: false }],
    );
    // 번역이 없으면 `prog:104-1-1` ≠ `x:prog-basic`이라 **2호(다른 세율 안분)**로 떨어진다.
    expect(out.lossOffsetTable.every((r) => r.scope === "same_group")).toBe(true);
    expect(out.lossOffsetTable[0]?.fromPropertyId).toBe("other-asset");
    expect(out.lossOffsetTable[0]?.toPropertyId).toBe("p1");
  });

  it("W-2b 🔴 세율군이 다르면 2호(다른 세율)로 간다 — 거짓 병합이 아니다", () => {
    const out = offsetLosses(
      [rec("p1", "prog:104-1-1", 500_000_000)],
      [{ id: "other-asset", income: -200_000_000, rateKey: CROSS_PROG_NBL, exempt: false }],
    );
    expect(out.lossOffsetTable.every((r) => r.scope === "other_group")).toBe(true);
    expect(out.incomeAfterOffset).toEqual([300_000_000]);
  });

  it("W-3 🟢 외부 행이 없으면 현행과 한 원도 다르지 않다 (무영향 회귀)", () => {
    const records = [
      rec("p1", "prog:104-1-1", 500_000_000),
      rec("p2", "prog:104-1-1", -200_000_000),
      rec("p3", "rate:0.7", 100_000_000),
    ];
    expect(offsetLosses(records, [])).toEqual(offsetLosses(records));
    expect(offsetLosses(records, undefined)).toEqual(offsetLosses(records));
  });
});

// ============================================================
// 축 3-b — 기타자산(단건) 엔진에 «통산 후 income» 주입
// ============================================================

function otherAsset(gain: number, o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "other_asset",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: true,
    cumulativeTransferRatio: 0.6,
    blockShareholderRealEstateRatio: 0.6,
    blockShareholderOwnershipRatio: 0.6,
    aggregationFirstTransferDate: new Date("2024-06-01"),
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2020-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 100,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: gain / 100 + 10_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 10_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  } as StockTransferInput;
}

describe("W: 기타자산 단건에 통산 후 income을 주입한다", () => {
  it("W-4 🔴 주입값이 과세표준의 기준이 된다", () => {
    const plain = calculateStockTransferTax(otherAsset(300_000_000));
    expect(plain.taxBase).toBe(297_500_000);

    const injected = calculateStockTransferTax(
      otherAsset(300_000_000, { crossLossOffsetIncome: 100_000_000 }),
    );
    expect(injected.transferIncome).toBe(100_000_000);
    expect(injected.taxBase).toBe(97_500_000);
    expect(injected.calculatedTax).toBeLessThan(plain.calculatedTax);
  });

  it("W-4b 🟢 미주입이면 현행 그대로다 (무영향)", () => {
    expect(calculateStockTransferTax(otherAsset(300_000_000, { crossLossOffsetIncome: undefined })))
      .toEqual(calculateStockTransferTax(otherAsset(300_000_000)));
  });

  it("W-5 🔴 ⑭ route 매핑이 주입값을 싣는다 (침묵 strip 방지)", () => {
    const built = buildEngineInput({ crossLossOffsetIncome: 100_000_000 } as Record<string, unknown>);
    expect(built.crossLossOffsetIncome).toBe(100_000_000);
  });
});

// ============================================================
// ④⑬⑫ — 폼 → body → Zod 를 통째로 태운다
// ============================================================

/**
 * 🔑 **세 지점을 한 테스트로 묶는 이유**: ④(변환)·⑬(body spread)·⑫(Zod)는 **TypeScript가
 * 못 본다**. 하나만 빠져도 필드가 조용히 사라지고 통산이 세액에 닿지 않는데, 아무 테스트도
 * 빨개지지 않는다. leaf만 검증하면 「배선이 산다」를 증명하지 못한다
 * ([[feedback_leaf_anchor_skips_zod_layer]]).
 */
async function captureMultiBody(
  opts: Parameters<typeof callMultiTransferTaxAPI>[2],
): Promise<Record<string, unknown>> {
  const captured: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }),
  );
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "land" as const,
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2018-02-10",
    actualSalePrice: "700,000,000",
    fixedAcquisitionPrice: "300,000,000",
    standardPriceAtTransfer: "700,000,000",
  };
  await callMultiTransferTaxAPI(
    { ...defaultMultiTransferFormData, transferDate: "2024-06-01", properties: [] } as never,
    [{ propertyId: "p1", propertyLabel: "자산 1", form: { transferDate: "2024-06-01", assets: [asset], houses: [] } } as never],
    opts,
  );
  return captured.body ?? {};
}

afterEach(() => vi.unstubAllGlobals());

const EXTERNAL = [
  { id: "other-asset", income: -200_000_000, rateKey: CROSS_PROG_BASIC, exempt: false },
];

describe("W: ④⑬⑫ 크로스 외부 행이 엔진까지 살아 간다", () => {
  it("W-6 🔴 ④⑬ — body에 실린다", async () => {
    const body = await captureMultiBody({ crossLossOffsetExternal: EXTERNAL });
    expect(body.crossLossOffsetExternal).toEqual(EXTERNAL);
  });

  /**
   * ⑫를 **「필드를 아는가」**로 잰다 — 스키마에 없으면 어떤 값을 넣어도 **조용히 strip**되어
   * issue가 하나도 안 생긴다. 그래서 «망가진 값»에 issue가 뜨는 것이 곧 인지의 증거다.
   * (전체 body를 통과시키려면 유효한 `properties` 픽스처가 필요한데, 그 무게는 ⑫와 무관하다.)
   */
  it("W-6c 🔴 ⑫ — Zod가 이 필드를 안다 (strip 되지 않는다)", () => {
    const at = (v: unknown) =>
      multiInputSchema
        .safeParse({ taxYear: 2024, properties: [], annualBasicDeductionUsed: 0, crossLossOffsetExternal: v })
        .error?.issues.filter((i) => i.path[0] === "crossLossOffsetExternal") ?? [];

    // 망가진 값 → 그 경로에 issue가 뜬다 (스키마가 보고 있다)
    expect(at([{ id: "x", income: "이백", rateKey: "k", exempt: false }]).length).toBeGreaterThan(0);
    // 정상 값 → 그 경로에 issue가 없다 (과잉 거절이 아니다)
    expect(at(EXTERNAL)).toEqual([]);
  });

  it("W-6b 🟢 주입하지 않으면 body에 키 자체가 없다 (오염 0)", async () => {
    const body = await captureMultiBody({});
    expect("crossLossOffsetExternal" in body).toBe(false);
  });
});

// ============================================================
// 크로스 레이어 — 한 번의 코어 실행에서 두 주입값을 유도한다
// ============================================================

/** `buildCrossLossRows`가 읽는 부분만 채운 부동산 결과 */
function reResult(
  props: { propertyId: string; income: number; rateKey: string }[],
): AggregateTransferResult {
  return {
    properties: props.map((p) => ({
      propertyId: p.propertyId,
      propertyLabel: p.propertyId,
      income: p.income,
      lossOffsetRateKey: p.rateKey,
      isExempt: false,
    })),
  } as unknown as AggregateTransferResult;
}

/** `buildCrossLossRows`가 읽는 부분만 채운 기타자산 결과 */
function oaResult(income: number): StockTransferResult {
  return {
    basicDeductionGroup: "real_estate_and_other_asset",
    taxCategory: "other_asset_block_shareholder",
    isShortTermHolding: false,
    isExempt: false,
    transferIncome: income,
  } as unknown as StockTransferResult;
}

describe("W: 크로스 주입 인자 조립", () => {
  it("W-7 🔴 부동산 외부 행 + 기타자산 통산 후 income을 함께 돌려준다", () => {
    const got = buildCrossInjection(
      reResult([{ propertyId: "p1", income: 500_000_000, rateKey: "prog:104-1-1" }]),
      oaResult(-200_000_000),
    );
    expect(got.ok).toBe(true);
    if (!got.ok) return;

    // 부동산 엔진에 넘길 외부 행 = 기타자산 1건(통산 «전» 값)
    expect(got.injection.realEstateExternalRows).toEqual([
      { id: "other-asset", income: -200_000_000, rateKey: CROSS_PROG_BASIC, exempt: false },
    ]);
    // 기타자산 엔진에 넘길 값 = 통산 «후» (차손이 전액 흡수돼 0)
    expect(got.injection.otherAssetIncome).toBe(0);
    expect(got.injection.outcome.appliedAcrossEngines).toBe(true);

    // 🔑 두 경로가 같은 답이다 — 부동산 엔진이 같은 외부 행으로 돌린 결과와 일치한다
    const viaEngine = offsetLosses(
      [rec("p1", "prog:104-1-1", 500_000_000)],
      got.injection.realEstateExternalRows,
    );
    const viaCross = got.injection.outcome.assets.find((a) => a.id === "p1");
    expect(viaEngine.incomeAfterOffset[0]).toBe(viaCross?.incomeAfterOffset);
  });

  it("W-8 🟢 크로스 흡수가 없으면 주입하지 않는다 (오탐 0)", () => {
    const got = buildCrossInjection(
      reResult([{ propertyId: "p1", income: 500_000_000, rateKey: "prog:104-1-1" }]),
      oaResult(300_000_000),
    );
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.injection.outcome.appliedAcrossEngines).toBe(false);
  });

  it("W-9 🟢 자산별 내역이 없으면 건너뛴다 (C-9 계약 승계)", () => {
    const got = buildCrossInjection({} as AggregateTransferResult, oaResult(-200_000_000));
    expect(got.ok).toBe(false);
  });
});
