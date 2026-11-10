/**
 * anchor — US-36 분모 0 = 전액: 리뷰 실패 시나리오(mock 세율)의 «법령상 값»
 *
 * 규칙(2026-11-10 사용자 결정): (분자>0, 분모=0) → 전액 · (분자≤0, 분모=0) → 0. 분모 ±1원 양옆이 이미 전액이므로 분모 0도 그 값과 같다.
 * 아래 «기대값»은 엔진 출력을 보기 전에 리뷰(`docs/reviews/unsold-98-series-review-2026-11.md` US-36)의 손계산값으로 먼저 적었다.
 *   §98의7 mock 84,865,000 → 15,430,000 · §98의3 비과밀 77,341,000 → 0 · §98의3 과밀 → 19,013,500 · §98의5 82,357,000 → 6,517,500.
 * 2026-11-10 후속(분모 ≤ 0 = 감면율 무관 전액): 감면율 100% 미만(과밀 60%·§98의5 15% 60%)도 분모 -1·0·+1이 모두 전액 -- 아래 과밀·§98의5는 모두 0원(농특세 비과세).
 *   종전 19,013,500·6,517,500은 분모 0·-1에서 «양도소득금액 × 감면율»만 차감한 값이라 분모 +1(0원)과 절벽이었다.
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
  it("과밀억제권역(공제율 0.6, 대지 100㎡·연면적 84㎡): 분모 -1·0·+1 모두 전액 차감 · 총 0 (종전 분모 0·-1 19,013,500)", () => {
    const over = { isOverconcentration983: true, landAreaSqm983: 100, floorAreaSqm983: 84 };
    // 손계산: 분모 +1은 5년간 발생분(원값, 분자 1억 / 분모 1) × 60%가 양도소득금액을 크게 넘어 상한 = 전액 -> 과표 0 · 농특세 비과세 -> 0.
    //   분모 0·-1도 같은 값이어야 한다(분모 -> 0+ 극한의 연장).
    for (const tr of [199_999_999, 200_000_000, 200_000_001]) expect(mk([R(tr, over)], O).totalTax, String(tr)).toBe(0);
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
  it("분모 -1·0·+1 모두 전액 차감 · 총 0 (종전 분모 0·-1 6,517,500) / 감면 없음 대조 82,357,000", () => {
    // 손계산: 분모 +1은 상한 전 원값 × 60%(인하율 15%) > 양도소득금액 -> 상한 = 전액 · 농특세 비과세 -> 0. 분모 0·-1도 같다.
    for (const tr of [199_999_999, 200_000_000, 200_000_001]) expect(mk([R(tr)], O).totalTax, String(tr)).toBe(0);
    expect(mk([], O).totalTax).toBe(82_357_000);
  });
});
