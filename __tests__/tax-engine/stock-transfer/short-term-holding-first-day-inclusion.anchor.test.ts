/**
 * 주식 단기(1년 미만) 판정 — §104② 「취득일부터 양도일까지」 초일 산입 anchor
 *
 * §104②는 §104①11호가목(대주주 1년 미만 30%)의 보유기간을 부동산 §95④와 같은 문언으로 정한다.
 * 1년은 기산일 응당일의 **전날** 만료(민법 §160②), 해당일이 없으면 월말(§160③).
 * 종전 `days < 365`는 응당일 전날 양도를 단기로 오판했고 윤년 구간에서도 하루씩 어긋났다.
 * 정본: `__tests__/tax-engine/holding-period-first-day-inclusion.anchor.test.ts` (부동산 HP-FD).
 *
 * 단일 경로(`calcHoldingPeriod`)와 lot 경로(`allocateLots`) 둘 다 같은 판정을 쓰는지 고정한다.
 */
import { describe, expect, it } from "vitest";
import {
  calcHoldingPeriod,
  isHeldUnderOneYear,
} from "@/lib/tax-engine/stock-transfer/stock-transfer-helpers";
import { allocateLots } from "@/lib/tax-engine/stock-transfer/lot-allocation";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

const D = (s: string) => new Date(s);

describe("ST-FD — §104② 1년 미만 판정(초일 산입)", () => {
  it("ST-FD-1 응당일 전날(만료일) 양도 = 1년 보유 — 단기 아님 (종전 364일 < 365 → 단기 오판)", () => {
    expect(isHeldUnderOneYear(D("2023-01-10"), D("2024-01-09"))).toBe(false);
  });

  it("ST-FD-1 짝: 그 전날 양도 = 단기", () => {
    expect(isHeldUnderOneYear(D("2023-01-10"), D("2024-01-08"))).toBe(true);
  });

  it("ST-FD-2 윤일 포함 구간: 2024-03-01 취득 → 2025-02-28 양도 = 1년 (종전 364일 → 단기 오판)", () => {
    expect(isHeldUnderOneYear(D("2024-03-01"), D("2025-02-28"))).toBe(false);
    expect(isHeldUnderOneYear(D("2024-03-01"), D("2025-02-27"))).toBe(true);
  });

  it("ST-FD-3 단일 경로 배선 — calcHoldingPeriod(input).isShortTerm", () => {
    const at = (transfer: string) =>
      calcHoldingPeriod({
        acquisitionCause: "purchase",
        acquisitionDate: D("2023-01-10"),
        transferDate: D(transfer),
      } as StockTransferInput).isShortTerm;
    expect(at("2024-01-09")).toBe(false);
    expect(at("2024-01-08")).toBe(true);
  });

  it("ST-FD-4 lot 경로 배선 — allocateLots(fifo) sub-lot isShortTerm", () => {
    const lots = (transfer: string) =>
      allocateLots(
        [
          {
            id: "a1",
            acquisitionDate: D("2023-01-10"),
            shareCount: 100,
            perShareAcquisitionPrice: 10_000,
            acquisitionCause: "purchase",
          },
        ],
        [{ id: "t1", transferDate: D(transfer), shareCount: 100, perShareTransferPrice: 15_000 }],
        "fifo",
        true,
        false,
      ).matched[0].isShortTerm;
    expect(lots("2024-01-09")).toBe(false);
    expect(lots("2024-01-08")).toBe(true);
  });
});
