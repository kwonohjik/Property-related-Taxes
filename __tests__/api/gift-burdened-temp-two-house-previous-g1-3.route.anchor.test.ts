/**
 * 1h-G1-3 anchor(부담부증여 × 일시적 2주택 §155①) — 종전 주택 취득일은 증여(양도) 주택 취득일로 고정이다.
 *
 * 근거: 「소득세법 시행령」 §155①은 「그 주택(이하 이 항에서 "종전의 주택"이라 한다)을 양도하기 전에 다른 주택 … 을
 * 취득 … 신규 주택을 취득한 날부터 … 기간 이내에 종전의 주택을 양도하는 경우」에만 1세대1주택으로 본다(MST 290841).
 * 양도(증여)하는 주택이 종전의 주택이다 — 나중에 취득한 주택을 증여하면 이 항의 대상이 아니다.
 *
 * 종전에는 「종전 주택 취득일」이 자유 입력이라, 세대 2주택(X 2015 · Y 2023)에서 Y를 2025-06-01 부담부증여하며
 * 사실대로(종전 = X 2015-01-01 · 신규 = Y 2023-03-01) 넣으면 일시적 2주택 비과세가 성립했다(타이밍은 previousAcquisitionDate,
 * 보유·거주는 acquisitionDate로 판정되어 두 날짜가 섞였다). 계산기·판정 메뉴는 양도 주택 취득일로 고정한다.
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
import {
  giftBurdenedPreviousAcquisitionDate,
  giftBurdenedTempTwoHouseDeadlineInScope,
} from "@/lib/calc/gift-burdened-temp-two-house";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import { giftItem, giftBody, run, type Obj } from "./_gift-burdened-pr7-harness";

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));
afterEach(() => vi.unstubAllGlobals());

/** 증여 주택 Y = 2023-03-01 취득. 저장된 temporaryTwoHouse는 (옛 자유 입력 포함) 임의 값이어도 ④가 읽지 않는다. */
const bgtOf = (prev: string, next: string) =>
  ({
    acquisitionDate: new Date("2023-03-01"),
    householdHousingCount: 2,
    temporaryTwoHouse: { previousAcquisitionDate: new Date(prev), newAcquisitionDate: new Date(next) },
  }) as Partial<BurdenedGiftTransferTaxInput>;

const GIFT_DATES = ["2024-06-01", "2025-02-28", "2025-06-01", "2026-03-02", "2026-06-01"];

describe("G1-3 부담부증여 × §155① — 종전 주택 = 증여 주택", () => {
  it("G1-3-A: 사실대로(종전 칸 2015-01-01 · 신규 2023-03-01) 넣어도 ④는 종전 = 증여 주택 취득일(2023-03-01)을 싣는다", () => {
    const body = giftBody("2025-06-01", bgtOf("2015-01-01", "2023-03-01"));
    const tt = body.temporaryTwoHouse as Obj;
    expect(tt.previousAcquisitionDate).toBe("2023-03-01");
    expect(tt.newAcquisitionDate).toBe("2023-03-01");
  });

  it.each(GIFT_DATES)("G1-3-B: 증여일 %s — 나중에 취득한 주택 증여는 일시적 2주택 비과세가 아니다(대조 A와 같은 일반 과세)", async (giftDate) => {
    const viaStale = await run(giftBody(giftDate, bgtOf("2015-01-01", "2023-03-01")));
    const viaFixed = await run(giftBody(giftDate, bgtOf("2023-03-01", "2023-03-01")));
    expect(viaStale.exemptReason).not.toBe("일시적 2주택 비과세");
    expect(viaStale.totalTax).toBe(viaFixed.totalTax);
    expect(viaStale.isExempt).toBe(viaFixed.isExempt);
  });

  it("G1-3-C: 리뷰 시료(2025-06-01) — 과세 totalTax 12,210,000", async () => {
    const r = await run(giftBody("2025-06-01", bgtOf("2015-01-01", "2023-03-01")));
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(12_210_000);
  });

  it("G1-3-D(긍정 짝): 증여 주택이 먼저 취득(2015-01-01)이고 다른 주택을 나중(2023-03-01)에 취득했으면 일시적 2주택 비과세", async () => {
    const bgt = {
      acquisitionDate: new Date("2015-01-01"),
      householdHousingCount: 2,
      temporaryTwoHouse: { previousAcquisitionDate: new Date("2000-01-01"), newAcquisitionDate: new Date("2023-03-01") },
    } as Partial<BurdenedGiftTransferTaxInput>;
    const r = await run(giftBody("2025-06-01", bgt));
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("일시적 2주택 비과세");
  });

  it("G1-3-E: 게이트·⑧도 같은 leaf — 옛 자유 입력값이 아니라 증여 주택 취득일을 본다", () => {
    expect(giftBurdenedPreviousAcquisitionDate(bgtOf("2015-01-01", "2023-03-01") as BurdenedGiftTransferTaxInput)).toBe("2023-03-01");
    // 옛 자유 입력의 종전 칸이 비어 있어도 게이트는 증여 주택 취득일로 열린다(칸 삭제로 입력 경로가 사라지지 않음)
    const noPrev = {
      acquisitionDate: new Date("2023-03-01"),
      householdHousingCount: 2,
      temporaryTwoHouse: { newAcquisitionDate: new Date("2023-03-01") },
    } as unknown as BurdenedGiftTransferTaxInput;
    expect(giftBurdenedTempTwoHouseDeadlineInScope(noPrev)).toBe(true);
    // 증여 주택 취득일이 없으면 닫힌다
    expect(giftBurdenedTempTwoHouseDeadlineInScope({ ...noPrev, acquisitionDate: undefined } as unknown as BurdenedGiftTransferTaxInput)).toBe(false);
    const v = validateStep(1, {
      ...INITIAL_FORM,
      giftDate: "2025-06-01",
      donor: "father",
      giftItems: [giftItem(bgtOf("2015-01-01", "2023-03-01"))],
    } as FormState);
    expect(v).toBeNull();
  });
});
