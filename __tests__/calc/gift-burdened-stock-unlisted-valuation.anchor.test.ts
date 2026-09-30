/**
 * B23 — 증여 부담부 주식 · 비상장 환산의 §165④ 보충적 평가 입력 (2026-09-30 Zod↔엔진 필수 점검 2차).
 *
 * 결함: 「양도소득세 함께 계산」 토글의 기본값이 **비상장 · 환산**인데 그 경로에 필요한
 * 1주당 순손익가치·순자산가치 입력 칸이 없었다. ④는 한 필드도 싣지 않았고 ⑧은 통과시켰다.
 * 엔진은 양도기준시가 0으로 읽어 「보충적 평가 불가」 경고만 남기고 **취득가액 0**으로 계산했다.
 *   종전 실측(아래 FIXTURE): 취득가액 0 · 산출세액 199,500,000
 *   입력 후:                 취득가액 200,000,000 · 개산공제 1,840,000 · 산출세액 159,132,000
 *
 * 법 근거: 소득세법 시행령 §176의2②(환산취득가액) · §165④1호(가중평균 3:2 + 80% 하한)·
 *          §165④3호(순자산 단독) · §159①(부담부증여 B/C) · §163⑥4호(개산공제) ·
 *          소득세법 시행규칙 §81④1호(같은 사업연도 취득·양도 월할 가산).
 *
 * ④ → ⑫ → ⑭ → 엔진 전 계층을 태운다(leaf 직접호출 금지).
 */
import { describe, it, expect } from "vitest";
import { buildGiftStockBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { addStockRefines, stockTransferInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { coerceDates } from "@/lib/api/date-coerce";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftStockTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";
import { INITIAL_FORM } from "@/components/calc/gift-tax-form-shared";
import { validateStep } from "@/components/calc/gift-tax-form-validate";

const DATE_FIELDS = ["transferDate", "acquisitionDate", "filingDate", "priorYearEndDate", "listingDate"];
const GIFT_DATE = "2025-06-02";

/** 평가액 50억 · 채무 10억(채무비율 0.2) · 보유 10,000주 */
function unlistedItem(over: Partial<BurdenedGiftStockTransferTaxInput>): EstateItem {
  return {
    id: "u1",
    name: "비상장",
    category: "unlisted_stock",
    marketValue: 5_000_000_000,
    assumedDebtForGift: 1_000_000_000,
    unlistedStockData: { totalShares: 100_000, ownedShares: 10_000 },
    burdenedGiftStockTransferTax: {
      marketType: "unlisted",
      acquisitionDate: "2015-03-02",
      acquisitionMode: "estimated",
      ...over,
    },
  } as unknown as EstateItem;
}

/** 양도 (500,000×3 + 400,000×2)/5 = 460,000 · 취득 (100,000×3 + 80,000×2)/5 = 92,000 → 비율 0.2 */
const FILLED = {
  transferYearNetIncomePerShare: 500_000,
  transferYearNetAssetPerShare: 400_000,
  acquisitionYearNetIncomePerShare: 100_000,
  acquisitionYearNetAssetPerShare: 80_000,
} satisfies Partial<BurdenedGiftStockTransferTaxInput>;

function runFullStack(item: EstateItem) {
  const body = buildGiftStockBurdenedTransferBody(item, { giftDate: GIFT_DATE } as unknown as FormState);
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) {
    return { blocked: true as const, body, issues: parsed.error.issues.map((i) => i.path.join(".")) };
  }
  const result = calculateStockTransferTax(
    buildEngineInput(coerceDates(parsed.data as Record<string, unknown>, DATE_FIELDS)),
  );
  return { blocked: false as const, body, result };
}

const formWith = (item: EstateItem) =>
  ({ ...INITIAL_FORM, giftDate: GIFT_DATE, stockItems: [item] }) as unknown as FormState;

describe("B23 ④ — 비상장 환산 평가 입력이 body에 실린다", () => {
  it("B23-1: 1주당 순손익·순자산 4필드를 싣는다 (종전: 한 필드도 없음)", () => {
    const { body } = runFullStack(unlistedItem(FILLED));
    expect(body).toMatchObject(FILLED);
    expect(body.unlistedSameBizYearToggle).toBe(false);
  });

  it("B23-2: 🟢 입력하면 환산취득가·개산공제가 산출된다 (종전 취득가액 0 · 세액 199,500,000)", () => {
    const out = runFullStack(unlistedItem(FILLED));
    expect(out.blocked).toBe(false);
    if (out.blocked) return;
    // 환산취득가 = 채무 10억 × 92,000 / 460,000
    expect(out.result.acquisitionPrice).toBe(200_000_000);
    // 개산공제 = 92,000 × 10,000주 × 1% × 채무비율 0.2
    expect(out.result.estimatedDeduction).toBe(1_840_000);
    expect(out.result.calculatedTax).toBe(159_132_000);
  });

  it("B23-3: §165④3 순자산 단독 — 사유를 싣고 순손익 없이 순자산만으로 평가한다", () => {
    const out = runFullStack(
      unlistedItem({
        netAssetOnlyReason: "no_business_or_short_or_closed",
        transferYearNetAssetPerShare: 400_000,
        acquisitionYearNetAssetPerShare: 100_000,
      }),
    );
    expect(out.body.netAssetOnlyReason).toBe("no_business_or_short_or_closed");
    expect(out.body).not.toHaveProperty("transferYearNetIncomePerShare");
    expect(out.blocked).toBe(false);
    if (out.blocked) return;
    // 채무 10억 × 100,000 / 400,000 (80% 하한 미적용)
    expect(out.result.acquisitionPrice).toBe(250_000_000);
  });

  it("B23-4: 미입력은 0으로 채우지 않는다 (⑫의 「미입력」 판정을 우회하지 않게)", () => {
    const { body } = runFullStack(unlistedItem({ transferYearNetAssetPerShare: 400_000 }));
    expect(body).not.toHaveProperty("transferYearNetIncomePerShare");
    expect(body).not.toHaveProperty("acquisitionYearNetIncomePerShare");
    expect(body).not.toHaveProperty("acquisitionYearNetAssetPerShare");
  });

  it("B23-4b: ⑫ — 비워 보내면 주식 스키마(B5)가 400으로 막는다 (종전 200 · 취득가액 0 · 199,500,000)", () => {
    const out = runFullStack(unlistedItem({}));
    expect(out.blocked).toBe(true);
    if (!out.blocked) return;
    expect(out.issues).toEqual(
      expect.arrayContaining([
        "transferYearNetIncomePerShare",
        "transferYearNetAssetPerShare",
        "acquisitionYearNetIncomePerShare",
        "acquisitionYearNetAssetPerShare",
      ]),
    );
  });

  it("B23-5: 소칙 §81④1호 입력은 토글 ON일 때만 싣는다 (OFF의 잔존값은 화면에 없는 칸)", () => {
    const pp = { prePriorYearNetIncomePerShare: 90_000, prePriorYearNetAssetPerShare: 70_000, priorBizYearMonths: 13 };
    const off = runFullStack(unlistedItem({ ...FILLED, ...pp }));
    expect(off.body).not.toHaveProperty("prePriorYearNetIncomePerShare");
    expect(off.body).not.toHaveProperty("priorBizYearMonths");
    expect(off.blocked).toBe(false);
    const on = runFullStack(unlistedItem({ ...FILLED, ...pp, priorBizYearMonths: 12, unlistedSameBizYearToggle: true }));
    expect(on.body).toMatchObject({ prePriorYearNetIncomePerShare: 90_000, prePriorYearNetAssetPerShare: 70_000, priorBizYearMonths: 12, unlistedSameBizYearToggle: true });
  });

  it("B23-6: 상장 환산·실지 모드에는 비상장 평가 필드를 싣지 않는다 (잔존값 차단)", () => {
    const listed = unlistedItem({
      ...FILLED,
      marketType: "kospi",
      transferDatePriceAvg1Month: 100_000,
      acquisitionDatePriceAvg1Month: 50_000,
    });
    (listed as unknown as { listedStockShares: number }).listedStockShares = 10_000;
    expect(runFullStack(listed).body).not.toHaveProperty("transferYearNetAssetPerShare");
    const actual = runFullStack(unlistedItem({ ...FILLED, acquisitionMode: "actual", actualAcquisitionPrice: 500_000_000 }));
    expect(actual.body).not.toHaveProperty("transferYearNetAssetPerShare");
  });
});

describe("B23 ⑧ — 주식 마법사 ⑧(validateUnlistedSimpleFields)의 거울", () => {
  it("B23-V1: 4필드 모두 없으면 차단 (종전 통과 → 취득가액 0)", () => {
    expect(validateStep(1, formWith(unlistedItem({})))).toContain("1주당 순손익가치");
  });

  it.each([
    ["transferYearNetIncomePerShare", "양도일(증여일) 직전 사업연도 1주당 순손익가치"],
    ["transferYearNetAssetPerShare", "양도일(증여일) 직전 사업연도 1주당 순자산가치"],
    ["acquisitionYearNetIncomePerShare", "취득일 직전 사업연도 1주당 순손익가치"],
    ["acquisitionYearNetAssetPerShare", "취득일 직전 사업연도 1주당 순자산가치"],
  ] as const)("B23-V2: %s 하나만 빠져도 차단", (key, label) => {
    const bgt: Partial<BurdenedGiftStockTransferTaxInput> = { ...FILLED };
    delete bgt[key];
    expect(validateStep(1, formWith(unlistedItem(bgt)))).toContain(label);
  });

  it("B23-V3: 🟢 모두 있으면 통과 — 0·음수(결손·자본잠식)도 적법한 값이다", () => {
    expect(validateStep(1, formWith(unlistedItem(FILLED)))).toBeNull();
    expect(
      validateStep(
        1,
        formWith(
          unlistedItem({
            transferYearNetIncomePerShare: 0,
            transferYearNetAssetPerShare: -5_000,
            acquisitionYearNetIncomePerShare: -1_000,
            acquisitionYearNetAssetPerShare: 0,
          }),
        ),
      ),
    ).toBeNull();
  });

  it("B23-V4: §165④3 사유가 있으면 순손익가치를 요구하지 않는다 (순자산은 여전히 필수)", () => {
    const reason = { netAssetOnlyReason: "stock_holding_company" as const };
    expect(
      validateStep(1, formWith(unlistedItem({ ...reason, transferYearNetAssetPerShare: 1, acquisitionYearNetAssetPerShare: 1 }))),
    ).toBeNull();
    expect(validateStep(1, formWith(unlistedItem({ ...reason, transferYearNetAssetPerShare: 1 })))).toContain(
      "취득일 직전 사업연도 1주당 순자산가치",
    );
  });

  it("B23-V5: 동일 사업연도 토글 ON — 전전사업연도 필수 · 월수 1~12 정수", () => {
    const on = { ...FILLED, unlistedSameBizYearToggle: true };
    expect(validateStep(1, formWith(unlistedItem(on)))).toContain("전전사업연도 1주당 순손익가치");
    const pp = { prePriorYearNetIncomePerShare: 1, prePriorYearNetAssetPerShare: 1 };
    expect(validateStep(1, formWith(unlistedItem({ ...on, ...pp })))).toBeNull();
    expect(validateStep(1, formWith(unlistedItem({ ...on, ...pp, priorBizYearMonths: 13 })))).toContain("월수");
    // OFF면 잔존 월수는 ④가 싣지 않으므로 막지 않는다 (B23-5와 짝)
    expect(validateStep(1, formWith(unlistedItem({ ...FILLED, ...pp, priorBizYearMonths: 13 })))).toBeNull();
  });

  it("B23-V6: 실지취득가 모드는 평가 입력을 요구하지 않는다 (과다 차단 금지)", () => {
    expect(
      validateStep(1, formWith(unlistedItem({ acquisitionMode: "actual", actualAcquisitionPrice: 500_000_000 }))),
    ).toBeNull();
  });
});
