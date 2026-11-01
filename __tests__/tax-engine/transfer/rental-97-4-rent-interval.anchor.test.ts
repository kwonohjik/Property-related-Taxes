/**
 * anchor — §97의4 장기임대주택: 1년 이내 재증액 금지 (2026-11-01)
 *
 * 조특령 §97의4① → 소령 §167의3①2호 **가목·다목** 괄호:
 *   「임대료등의 증액 청구는 임대차계약의 체결 또는 약정한 임대료등의 증액이 있은 후
 *    1년 이내에는 하지 못하고 …」
 * 종전 평가기는 5% 한도만 봤다 — 4% 증액이라도 1년 안에 올렸으면 장기임대주택이 아니다.
 *
 * 시점: 이 괄호는 대통령령 제30395호(2020.2.11)가 신설했다(2019.2.12 문언은 「연 증가율 5%」뿐).
 *   같은 영 부칙 §16 「이 영 시행 이후 주택 임대차계약을 갱신하거나 새로 체결하는 분부터 적용」
 *   ⇒ 증액한 계약의 체결·갱신일이 2020-02-11 이후일 때만 판정한다.
 *
 * 1년은 민법 §157·§160 — 다음 해 같은 날 만료(그날까지 증액하면 위반) · §97의3·§97의5와 공용 헬퍼.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental974 } from "@/lib/tax-engine/transfer-reductions/rental-97-4";
import type { Rental97EvaluationInput, Rental97Result } from "@/lib/tax-engine/transfer-reductions/types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

/** API 경로(`toDate("YYYY-MM-DD")`)와 같은 UTC 자정 — 시행일 경계 비교를 TZ와 무관하게 */
const D = (s: string) => new Date(s);
const codes = (r: Rental97Result) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));
const jeonse = (date: string, deposit: number) => ({ contractDate: D(date), contractType: "jeonse" as const, deposit, monthlyRent: 0 });

/** 가목 수도권 5억 · 등록·임대개시 2016-03-01 → 양도 2024-06-01 (8년, 추가율 6%) */
const BASE: Rental97EvaluationInput = {
  id: "rental_97_4",
  acquisitionDate: D("2016-01-01"),
  registrationDate: D("2016-03-01"),
  rentalStartDate: D("2016-03-01"),
  transferDate: D("2024-06-01"),
  isTaxRegistered: true,
  rentIncreaseViolated: true,
  rental974Category: "purchase_a",
  region: "capital",
  officialPriceAtStart: 500_000_000,
};

const run = (history: ReturnType<typeof jeonse>[]) => evaluateRental974({ ...BASE, rentHistory: history });

describe("소령 §167의3①2호 — 1년 이내 재증액 금지 (§97의4)", () => {
  it("🔴 다음 해 같은 날 4% 증액 → 위반 (종전: 5% 이내라 적격)", () => {
    expect(codes(run([jeonse("2021-01-01", 100_000_000), jeonse("2022-01-01", 104_000_000)]))).toEqual([
      "RENT_INCREASE_WITHIN_1_YEAR",
    ]);
  });

  it("다음 날 4% 증액 → 적격, 추가율 6%", () => {
    const r = run([jeonse("2021-01-01", 100_000_000), jeonse("2022-01-02", 104_000_000)]);
    expect(r.isEligible).toBe(true);
    expect((r as unknown as { additionalRate: number }).additionalRate).toBe(0.06);
  });

  it("동결·감액 갱신은 1년 이내여도 위반 아님 — 「증액」만 제한", () => {
    expect(run([jeonse("2021-01-01", 100_000_000), jeonse("2021-06-01", 100_000_000)]).isEligible).toBe(true);
  });

  it("5% 초과 + 1년 이내 → 두 사유 모두", () => {
    expect(codes(run([jeonse("2021-01-01", 100_000_000), jeonse("2021-12-01", 110_000_000)]))).toEqual([
      "RENT_INCREASE_VIOLATED",
      "RENT_INCREASE_WITHIN_1_YEAR",
    ]);
  });
});

describe("대통령령 제30395호 부칙 §16 — 2020.2.11 이후 체결·갱신 계약부터", () => {
  it("🔴 시행일 당일(2020-02-11) 갱신하며 증액 → 적용, 위반", () => {
    expect(codes(run([jeonse("2019-02-11", 100_000_000), jeonse("2020-02-11", 104_000_000)]))).toEqual([
      "RENT_INCREASE_WITHIN_1_YEAR",
    ]);
  });

  it("시행일 전날(2020-02-10) 갱신 → 그때 문언에 1년 제한이 없어 적격", () => {
    expect(run([jeonse("2019-02-10", 100_000_000), jeonse("2020-02-10", 104_000_000)]).isEligible).toBe(true);
  });
});

describe("파이프라인 — calculateTransferTax까지", () => {
  it("🔴 rentHistory가 evaluator에 닿아 §97의4 추가율이 빠진다", () => {
    const input = (history: ReturnType<typeof jeonse>[]) =>
      baseTransferInput({
        propertyType: "housing",
        transferPrice: 800_000_000,
        acquisitionPrice: 300_000_000,
        acquisitionDate: D("2016-01-01"),
        transferDate: D("2024-06-01"),
        isOneHousehold: true,
        householdHousingCount: 2,
        isRegulatedArea: false,
        residencePeriodMonths: 0,
        reductions: [
          {
            type: "rental_97_4",
            registrationDate: D("2016-03-01"),
            rentalStartDate: D("2016-03-01"),
            isTaxRegistered: true,
            rentIncreaseViolated: true,
            region: "capital",
            rental974Category: "purchase_a",
            officialPriceAtStart: 500_000_000,
            rentHistory: history,
          },
        ],
      });
    const rates = makeMockRates();
    const bad = calculateTransferTax(input([jeonse("2021-01-01", 100_000_000), jeonse("2022-01-01", 104_000_000)]), rates);
    const ok = calculateTransferTax(input([jeonse("2021-01-01", 100_000_000), jeonse("2022-01-02", 104_000_000)]), rates);
    expect(bad.rental97LthdDetail?.isEligible).toBe(false);
    expect(codes(bad.rental97LthdDetail!)).toEqual(["RENT_INCREASE_WITHIN_1_YEAR"]);
    expect(ok.rental97LthdDetail?.isEligible).toBe(true);
    expect(bad.longTermHoldingDeduction).toBeLessThan(ok.longTermHoldingDeduction);
  });
});
