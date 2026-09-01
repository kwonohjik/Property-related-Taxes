/**
 * F-09 자동조회 4종 통합 anchor (Playwright 미설정 → vitest 통합 시나리오).
 *
 * 각 자동조회 헬퍼의 slot 알고리즘 + 평균 산식 + Map 매핑 정합성을 보장.
 * 모의투자 실호출 대신 quotes mock으로 회귀 보호.
 */

import { describe, it, expect } from "vitest";
import {
  oneMonthBeforeTransferAvg,
  oneMonthAfterListingAvg,
  twoMonthSurroundingAvg,
} from "@/lib/kiwoom/averages";
import {
  buildOneMonthBeforeSlots,
  buildOneMonthAfterListingSlots,
  buildTwoMonthSurroundingSlots,
} from "@/lib/kiwoom/calendar";

describe("F-09 자동조회 4종 통합 anchor", () => {
  // K-INT-01: 양도일 직전 1개월 (§99①3) — 양도일 포함 algorithm
  it("K-INT-01: 양도일 직전 1개월 slot은 양도일 포함", () => {
    const slots = buildOneMonthBeforeSlots("2024-06-03");
    expect(slots[slots.length - 1]).toBe("2024-06-03"); // 양도일 포함
    expect(slots[0]).toBe("2024-05-03"); // 1개월이 되는 날도 포함 (경계일 포함)
    expect(slots.length).toBe(32);
  });

  // K-INT-02: 상장 후 1개월 (§165⑤) — 상장일 포함
  it("K-INT-02: 상장 후 1개월 slot은 상장일 포함", () => {
    const slots = buildOneMonthAfterListingSlots("2024-06-03");
    expect(slots[0]).toBe("2024-06-03"); // 상장일 포함
    expect(slots[slots.length - 1]).toBe("2024-07-03"); // 1개월이 되는 날도 포함
  });

  // K-INT-03: 전후 2개월 (§63①1가) — 평가기준일 포함
  it("K-INT-03: 전후 2개월 slot은 평가기준일 포함", () => {
    const slots = buildTwoMonthSurroundingSlots("2024-06-15");
    expect(slots[0]).toBe("2024-04-15");
    expect(slots[slots.length - 1]).toBe("2024-08-15");
  });

  // K-INT-04: 모든 평균 산식 — floor 적용 + 거래일 분모 일관성
  it("K-INT-04: 3종 평균 함수 모두 동일한 floor 분모 정책", () => {
    const quotes = [
      { date: "2024-06-03", close: 100 },
      { date: "2024-06-04", close: 101 },
    ];

    // 각 함수의 slot에 quotes가 모두 포함되도록 기준일 설정
    const r1 = oneMonthBeforeTransferAvg({ quotes, transferDateIso: "2024-06-04" }); // slot [5/5~6/4]
    const r2 = oneMonthAfterListingAvg({ quotes, listingDateIso: "2024-06-03" });   // slot [6/3~7/2]
    const r3 = twoMonthSurroundingAvg({ quotes, valuationDateIso: "2024-06-04" });  // slot [4/4~8/4]

    // 모두 floor((100+101)/2) = 100 적용
    expect(r1.average).toBe(100);
    expect(r2.average).toBe(100);
    expect(r3.average).toBe(100);
  });

  // K-INT-05: 거래정지 메타 일관성 — 모든 함수가 args.tradingHalt를 그대로 결과에 포함
  it("K-INT-05: tradingHalt 플래그 3종 모두 결과에 echo", () => {
    const r1 = oneMonthBeforeTransferAvg({
      quotes: [],
      transferDateIso: "2024-06-03",
      tradingHalt: true,
    });
    const r2 = oneMonthAfterListingAvg({
      quotes: [],
      listingDateIso: "2024-06-03",
      tradingHalt: true,
    });
    const r3 = twoMonthSurroundingAvg({
      quotes: [],
      valuationDateIso: "2024-06-03",
      tradingHalt: true,
    });
    expect(r1.tradingHalt).toBe(true);
    expect(r2.tradingHalt).toBe(true);
    expect(r3.tradingHalt).toBe(true);
  });

  // K-INT-06: 빈 quotes — 모든 함수가 average=0, tradingDays=0 (자동 보정 금지)
  it("K-INT-06: 빈 quotes 처리 일관성 (자동 보정 금지)", () => {
    const r1 = oneMonthBeforeTransferAvg({ quotes: [], transferDateIso: "2024-06-03" });
    const r2 = oneMonthAfterListingAvg({ quotes: [], listingDateIso: "2024-06-03" });
    const r3 = twoMonthSurroundingAvg({ quotes: [], valuationDateIso: "2024-06-03" });
    [r1, r2, r3].forEach((r) => {
      expect(r.tradingDays).toBe(0);
      expect(r.average).toBe(0);
      expect(r.sum).toBe(0);
    });
  });

  // K-INT-07: closingPrices·weekendLabels 배열 길이가 slotDates와 동일
  it("K-INT-07: 결과 배열 3종 길이 일관성 (UI 매핑 보장)", () => {
    const args = { quotes: [], transferDateIso: "2024-06-03" };
    const r1 = oneMonthBeforeTransferAvg(args);
    expect(r1.closingPrices.length).toBe(r1.slotDates.length);
    expect(r1.weekendLabels.length).toBe(r1.slotDates.length);

    const r2 = oneMonthAfterListingAvg({ quotes: [], listingDateIso: "2024-06-03" });
    expect(r2.closingPrices.length).toBe(r2.slotDates.length);
    expect(r2.weekendLabels.length).toBe(r2.slotDates.length);

    const r3 = twoMonthSurroundingAvg({ quotes: [], valuationDateIso: "2024-06-03" });
    expect(r3.closingPrices.length).toBe(r3.slotDates.length);
    expect(r3.weekendLabels.length).toBe(r3.slotDates.length);
  });
});
