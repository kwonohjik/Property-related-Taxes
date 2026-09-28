/**
 * §43² 사용이익 2축(§37·§42 무상) 배관 — 폼 → ④ → ⑫ → 엔진, ⑤·④·⑧ 같은 술어.
 * 엔진 규칙은 `__tests__/tax-engine/gift-deemed/sec43-2-use-axes.anchor.test.ts`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/deemed-form-state";
import type { ScPriorTxRow } from "@/components/calc/deemed-gift/deemed-form-rows";
import { FreeRealEstateFields } from "@/components/calc/deemed-gift/free-realestate-form";
import { PropertyServiceUseFields } from "@/components/calc/deemed-gift/other-forms";
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/types";

afterEach(cleanup);

const row = (benefit: string, date = "2025-09-01"): ScPriorTxRow[] => [{ id: "p1", date, benefit, label: "" }];
const B: DeemedFormState = { ...INITIAL_DEEMED, giftDate: "2026-03-02" };
function endToEnd(form: DeemedFormState) {
  const body = JSON.parse(JSON.stringify(buildDeemedGiftInput(form)));
  const parsed = deemedGiftInputSchema.safeParse(body);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  return calcDeemedGift(parsed.data as DeemedGiftInput)!;
}
const bodyOf = (form: DeemedFormState) => buildDeemedGiftInput(form) as unknown as Record<string, unknown>;

const FR_USE: DeemedFormState = { ...B, type: "free_realestate", freeSubType: "free_use", freePropertyValue: "1,200,000,000" }; // 90,978,879
const FR_COL: DeemedFormState = { ...B, type: "free_realestate", freeSubType: "collateral", freeLoanAmount: "200,000,000", freeInterest: "0" }; // 9,200,000
const PSU_FREE: DeemedFormState = { ...B, type: "property_service_use", psuSubType: "free_use", psuMarketValue: "8,000,000" };
const PSU_LOW: DeemedFormState = { ...B, type: "property_service_use", psuSubType: "low_price", psuMarketValue: "100,000,000", psuConsideration: "80,000,000" };

describe("§37 배관", () => {
  it("[UP-1] 🔴 무상사용: 선행 행 → 90,978,879 과세", () => {
    expect(endToEnd({ ...FR_USE, freePriorSameClauseRows: row("10,000,000") }).deemedGiftValue).toBe(90_978_879);
  });
  it("[UP-1+] 짝 — 선행 없으면 0", () => {
    expect(endToEnd(FR_USE).deemedGiftValue).toBe(0);
  });
  it("[UP-2] 🔴 무상담보: 선행 행 → 9,200,000 과세", () => {
    expect(endToEnd({ ...FR_COL, freePriorSameClauseRows: row("800,000") }).deemedGiftValue).toBe(9_200_000);
  });
  it("[UP-3] 🔴 다기간 모드에서도 선행 행이 첫 기간 판정에 닿는다", () => {
    const f: DeemedFormState = { ...FR_USE, freePeriods: [{ startDate: "2026-03-02", value: "1,200,000,000", interest: "" }], freePriorSameClauseRows: row("10,000,000") };
    expect(endToEnd(f).deemedGiftValue).toBe(90_978_879);
  });
});

describe("§42 배관", () => {
  it("[UP-4] 🔴 무상: 선행 행 → 8,000,000 과세", () => {
    expect(endToEnd({ ...PSU_FREE, psuPriorSameClauseRows: row("3,000,000") }).deemedGiftValue).toBe(8_000_000);
  });
  it("[UP-5] 저가·고가는 금액기준이 비율 상당액뿐 — 표 행을 보내지 않는다", () => {
    expect(bodyOf({ ...PSU_LOW, psuPriorSameClauseRows: row("3,000,000") }).priorSameClauseGains).toBeUndefined();
  });
});

describe("⑧ · ⑤", () => {
  it("[UP-V] 활성 표의 빈 행을 막고, §42 저가면 막지 않는다", () => {
    expect(validateDeemedInput({ ...FR_USE, freePriorSameClauseRows: row("", "") })).toContain("선행 부동산 무상사용·담보 1의 증여일");
    expect(validateDeemedInput({ ...PSU_FREE, psuPriorSameClauseRows: row("", "") })).toContain("선행 재산사용·용역 1의 증여일");
    expect(validateDeemedInput({ ...PSU_LOW, psuPriorSameClauseRows: row("", "") })).toBeNull();
    expect(validateDeemedInput({ ...FR_USE, freePriorSameClauseRows: row("10,000,000") })).toBeNull();
  });
  it("[UP-U] 표는 §37 전부와 §42 무상에서만 보인다", () => {
    const noop = () => {};
    const { rerender } = render(<FreeRealEstateFields form={FR_USE} set={noop} />);
    expect(screen.getByTestId("free-prior-tx-table")).toBeInTheDocument();
    rerender(<FreeRealEstateFields form={FR_COL} set={noop} />);
    expect(screen.getByTestId("free-prior-tx-table")).toBeInTheDocument();
    rerender(<PropertyServiceUseFields form={PSU_FREE} set={noop} />);
    expect(screen.getByTestId("psu-prior-tx-table")).toBeInTheDocument();
    rerender(<PropertyServiceUseFields form={PSU_LOW} set={noop} />);
    expect(screen.queryByTestId("psu-prior-tx-table")).toBeNull();
  });
});
