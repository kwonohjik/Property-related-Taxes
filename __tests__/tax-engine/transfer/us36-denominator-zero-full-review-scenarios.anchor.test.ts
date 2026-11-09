/**
 * anchor — US-36 분모 0 = 전액: 리뷰 실패 시나리오(mock 세율)의 «법령상 값»
 *
 * 규칙(2026-11-10 사용자 결정): (분자>0, 분모=0) → 전액 · (분자≤0, 분모=0) → 0. 분모 ±1원 양옆이 이미 전액이므로 분모 0도 그 값과 같다.
 * 아래 «기대값»은 엔진 출력을 보기 전에 리뷰(`docs/reviews/unsold-98-series-review-2026-11.md` US-36)의 손계산값으로 먼저 적었다.
 *   §98의7 mock 84,865,000 → 15,430,000 · §98의3 비과밀 77,341,000 → 0 · §98의3 과밀 → 19,013,500 · §98의5 82,357,000 → 6,517,500.
 * 그 뒤 머지된 2단계 P(2008~2017 누진세율·장특 표1)로 값이 바뀌었을 수 있으므로, 달라졌다면 각 케이스 주석에 손계산 근거를 남긴다.
 * 세율표는 mock(정본 세액 아님).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const mk = (reductions: unknown[], over: Record<string, unknown>) =>
  calculateTransferTax(
    baseTransferInput({ transferPrice: 800_000_000, acquisitionPrice: 500_000_000, householdHousingCount: 2, reductions, ...over } as never),
    makeMockRates(),
  );

describe("US-36 §98의7 (취득 2013-03-01 · 양도 2020-06-01 · 기준시가 1억·1.5억·1억)", () => {
  const O = { acquisitionDate: D("2013-03-01"), transferDate: D("2020-06-01") };
  const R = (tr: number) => ({
    type: "unsold_98_7" as const, contractDate987: D("2012-10-15"), acquisitionPrice987: 550_000_000,
    isUnsoldAtCutoff987: true, isFirstContract987: true, isNotOccupiedAtContract987: true, isNotRecontract987: true,
    standardPriceAtAcquisition987: 100_000_000, standardPriceAt5Years987: 150_000_000, standardPriceAtTransfer987: tr,
  });
  it("분모 0 → 전액 · 총 15,430,000 (분모 ±1과 같다) / 감면 없음 대조 84,865,000", () => {
    const z = mk([R(100_000_000)], O);
    expect(z.unsold987Detail!.signCase).toBe("pos_zero");
    expect(z.totalTax).toBe(15_430_000);
    for (const tr of [99_999_999, 100_000_001]) expect(mk([R(tr)], O).totalTax, String(tr)).toBe(15_430_000);
    expect(mk([], O).totalTax).toBe(84_865_000);
  });
});

describe("US-36 §98의3 (취득 2010-01-15 · 양도 2020-06-01 · 기준시가 2억·3억·2억)", () => {
  const O = { acquisitionDate: D("2010-01-15"), transferDate: D("2020-06-01") };
  const R = (tr: number, over: Record<string, unknown> = {}) => ({
    type: "unsold_98_3" as const, residencyType983: "resident" as const, houseType983: "purchased" as const, contractDate983: D("2009-12-01"),
    isOutsideSeoulNotDesignated983: true, isOverconcentration983: false, isUnsoldConfirmed983: true, isFirstContract983: true,
    isNotOccupiedAtContract983: true, isNotRecontract983: true,
    standardPriceAtAcquisition983: 200_000_000, standardPriceAt5Years983: 300_000_000, standardPriceAtTransfer983: tr, ...over,
  });
  it("비과밀(공제율 1): 분모 0 → 전액 · 총 0 (분모 ±1과 같다) / 감면 없음 대조 77,341,000", () => {
    expect(mk([R(200_000_000)], O).totalTax).toBe(0);
    for (const tr of [199_999_999, 200_000_001]) expect(mk([R(tr)], O).totalTax, String(tr)).toBe(0);
    expect(mk([], O).totalTax).toBe(77_341_000);
  });
  it("과밀억제권역(공제율 0.6, 대지 100㎡·연면적 84㎡): 분모 0 → 총 19,013,500 (분모 ±1과 같다)", () => {
    const over = { isOverconcentration983: true, landAreaSqm983: 100, floorAreaSqm983: 84 };
    expect(mk([R(200_000_000, over)], O).totalTax).toBe(19_013_500);
    // 분모 −1(pos_neg)도 같다. 분모 +1은 (+,+) 원값이 상한 전 값이라(US-12 · 공제율 곱 뒤 양도소득금액 한도) 율 0.6이어도 한도에 걸려 다르다 — US-36 범위 밖.
    expect(mk([R(199_999_999, over)], O).totalTax).toBe(19_013_500);
  });
});

describe("US-36 §98의5 (인하율 15% · 취득 2011-06-15)", () => {
  const O = { acquisitionDate: D("2011-06-15"), transferDate: D("2020-06-01") };
  const R = (tr: number) => ({
    type: "unsold_98_5" as const, isEligibleSubject985: true, contractDate985: D("2011-03-01"),
    announcedPrice985: 600_000_000, contractPrice985: 510_000_000,
    isNonCapitalUnsoldAtCutoff985: true, isFirstContract985: true, isNotOccupiedAtContract985: true, isNotRecontract985: true,
    standardPriceAtAcquisition985: 200_000_000, standardPriceAt5Years985: 300_000_000, standardPriceAtTransfer985: tr,
  });
  it("분모 0 → 총 6,517,500 (분모 ±1과 같다) / 감면 없음 대조 82,357,000", () => {
    expect(mk([R(200_000_000)], O).totalTax).toBe(6_517_500);
    // 분모 −1(pos_neg)도 같다. 분모 +1은 US-12(공제율 곱 뒤 양도소득금액 한도)로 «상한 전 원값»을 쓰므로 한도에 걸려 다르다 — US-36 범위 밖.
    expect(mk([R(199_999_999)], O).totalTax).toBe(6_517_500);
    expect(mk([], O).totalTax).toBe(82_357_000);
  });
});
