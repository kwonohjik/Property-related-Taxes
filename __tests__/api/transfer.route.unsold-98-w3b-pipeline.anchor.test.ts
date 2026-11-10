/**
 * anchor — §98 시리즈 후속 W3b: route 풀 파이프라인(④ 폼→payload → ⑫ Zod → ⑭ 매퍼 → 엔진 → ⑦ 결과) 원 단위 고정.
 *
 * (1) §98의5 5년 후 차감 (US-65 수정 방향 4 — #3106이 남김)
 * (2) §98의7·§98의8·§99의2 기준시가 블록 — PHD(§164⑦) 환산 취득시 기준시가 + 5년 시점·양도시 기준시가가 엔진까지 도달해 차감액에 반영 (1단계 H #3023이 남김)
 * (3) 「확인 필요」 warnings가 route 응답까지 실린다 (§98의3 과밀 독법 · 분모 0)
 *
 * 값은 엔진 출력이 아니라 손계산(각 주석)으로 정했다. 세율: makeMockRates() 2024 8구간
 * (1,400만 6%·5,000만 15%·8,800만 24%·1.5억 35%·3억 38%…, 누진공제 1.5억 구간 15,440,000 · 3억 구간 19,940,000).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { toUnsold987Payload, toUnsold988Payload, toUnsold992Payload } from "@/lib/calc/transfer-tax-api-reductions-unsold";
import {
  ALLOCATION_DENOMINATOR_ZERO_FULL_NOTICE,
  ALLOCATION_NONPOSITIVE_DENOMINATOR_BELOW_FULL_RATE_NOTICE,
} from "@/lib/tax-engine/transfer-reductions/new-99-3";
import { UNSOLD_98_3_OVERCON_READING_NOTICE } from "@/lib/tax-engine/transfer-reductions/unsold-98-3";

async function run(body: object) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 응답 JSON의 detail 객체를 조문별로 읽는 테스트 헬퍼
  return { status: res.status, r: json.data?.result as Record<string, any> | undefined, json };
}

const BASE = {
  propertyType: "housing" as const,
  transferPrice: 800_000_000,
  transferDate: "2024-08-01",
  acquisitionPrice: 500_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  annualBasicDeductionUsed: 0,
};

describe("W3b — §98 시리즈 route 후속 anchor", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  /*
   * (1) §98의5 5년 후 (취득 2011-06-01 · 양도 2024-08-01 · 차익 300,000,000 · 2주택 · 인하율 15% → 감면율 80%)
   *  보유 13년 2개월 → 13년 → 표1 2%×13 = 26% → 장특 78,000,000 → 양도소득금액 222,000,000
   *  5년 안분 (300M−200M)/(400M−200M) = 0.5 → 5년간 발생분 111,000,000 × 80% = 차감 88,800,000
   *  과세표준 = 222,000,000 − 88,800,000 − 2,500,000 = 130,700,000 → ×35% − 15,440,000 = 30,305,000 (결정세액)
   *  농특세 0(농특세법 시행령 §4⑦1호 열거) · 지방소득세 3,030,500 → 총 33,335,500
   *  (감면 없음이면 (222,000,000−2,500,000)×38% − 19,940,000 = 63,470,000)
   */
  it("US-65-4: §98의5 5년 후(인하율 15% · 80%) 차감 — 총 33,335,500 (⑫⑭→엔진, 농특세 비과세)", async () => {
    const { status, r } = await run({
      ...BASE,
      acquisitionDate: "2011-06-01",
      reductions: [
        {
          type: "unsold_98_5",
          contractDate985: "2010-12-01",
          priceReductionRatePct985: 15,
          isNonCapitalUnsoldAtCutoff985: true,
          isFirstContract985: true,
          isNotOccupiedAtContract985: true,
          isNotRecontract985: true,
          standardPriceAtAcquisition985: 200_000_000,
          standardPriceAt5Years985: 300_000_000,
          standardPriceAtTransfer985: 400_000_000,
        },
      ],
    });
    expect(status).toBe(200);
    expect(r!.longTermHoldingDeduction).toBe(78_000_000);
    expect(r!.unsold985Detail.taxReductionRate).toBe(0.8);
    expect(r!.unsold985Detail.reducibleTransferIncome).toBe(88_800_000);
    expect(r!.calculatedTax).toBe(30_305_000);
    expect(r!.ruralSurtax ?? 0).toBe(0);
    expect(r!.localIncomeTax).toBe(3_030_500);
    expect(r!.totalTax).toBe(33_335_500);
    // 정상 안분(분자>0·분모>0)은 확인 필요 고지 없음
    expect(r!.unsold985Detail.warnings ?? []).toEqual([]);
  });

  /*
   * (2) PHD 환산 취득시 기준시가 (소령 §164⑦): 최초공시 주택가격 P_F = 400,000,000
   *  Sum_A(취득시) = 50㎡ × 2,000,000 + 건물 100,000,000 = 200,000,000
   *  Sum_F(최초공시) = 50㎡ × 2,500,000 + 건물 120,000,000 = 245,000,000
   *  취득시 기준시가 = floor(400,000,000 × 200,000,000 / 245,000,000) = 326,530,612
   *  5년 시점 450,000,000 · 양도시 500,000,000 → 분자 123,469,388 · 분모 173,469,388
   *  5년간 발생분 = floor(양도소득금액 × 123,469,388 / 173,469,388)
   *  공통: 양도 2024-08-01 · 차익 300,000,000 · 장특 표1 2%/년
   *   §98의7 (취득 2013-01-15, 11년 22%): 소득금액 234,000,000 → 발생분 = 166,552,941 (100%)
   *   §98의8 (취득 2015-07-01,  9년 18%): 소득금액 246,000,000 → 발생분 175,094,117 × 50% = 87,547,058
   *   §99의2 (취득 2013-10-23, 10년 20%): 소득금액 240,000,000 → 발생분 = 170,823,529 (100%)
   *  과세표준 = 소득금액 − 차감액 − 기본공제 2,500,000
   */
  const PHD = {
    phdMode: true,
    phdFirstDisclosureDate: "2013-04-30",
    phdFirstDisclosurePrice: "400,000,000",
    phdLandAreaSqm: "50",
    phdLandPricePerSqmAtAcq: "2,000,000",
    phdLandPricePerSqmAtFirst: "2,500,000",
    phdBuildingStdAtAcq: "100,000,000",
    phdBuildingStdAtFirst: "120,000,000",
    std5Y: "450,000,000",
    stdTransfer: "500,000,000",
  };
  const ACQ_STD = 326_530_612;

  it("기준시가 블록 §98의7: PHD 환산값이 payload·엔진에 도달 — 양도소득금액 234,000,000 × 123,469,388/173,469,388 = 166,552,941 차감", async () => {
    const payload = toUnsold987Payload({
      type: "unsold_98_7",
      isDomestic987: true,
      contractDate987: "2012-10-15",
      acquisitionPrice987: "550,000,000",
      isUnsoldAtCutoff987: true,
      isFirstContract987: true,
      isNotOccupiedAtContract987: true,
      isNotRecontract987: true,
      standardPriceAtAcquisition987: "",
      standardPriceAt5Years987: PHD.std5Y,
      standardPriceAtTransfer987: PHD.stdTransfer,
      phdMode987: true,
      phdFirstDisclosureDate987: PHD.phdFirstDisclosureDate,
      phdFirstDisclosurePrice987: PHD.phdFirstDisclosurePrice,
      phdLandAreaSqm987: PHD.phdLandAreaSqm,
      phdLandPricePerSqmAtAcq987: PHD.phdLandPricePerSqmAtAcq,
      phdLandPricePerSqmAtFirst987: PHD.phdLandPricePerSqmAtFirst,
      phdBuildingStdAtAcq987: PHD.phdBuildingStdAtAcq,
      phdBuildingStdAtFirst987: PHD.phdBuildingStdAtFirst,
    } as never);
    expect(payload.standardPriceAtAcquisition987).toBe(ACQ_STD);
    const { status, r } = await run({ ...BASE, acquisitionDate: "2013-01-15", reductions: [payload] });
    expect(status).toBe(200);
    expect(r!.longTermHoldingDeduction).toBe(66_000_000);
    expect(r!.unsold987Detail.standardPriceAtAcquisition).toBe(ACQ_STD);
    expect(r!.unsold987Detail.standardPriceAt5Years).toBe(450_000_000);
    expect(r!.unsold987Detail.standardPriceAtTransfer).toBe(500_000_000);
    expect(r!.unsold987Detail.reducibleTransferIncome).toBe(166_552_941);
    // 차감액이 과세표준에 반영: 234,000,000 − 166,552,941 − 2,500,000 = 64,947,059
    expect(r!.taxBase).toBe(64_947_059);
  });

  it("기준시가 블록 §98의8(50%): 양도소득금액 246,000,000 × 안분 175,094,117 × 50% = 87,547,058 차감", async () => {
    const payload = toUnsold988Payload({
      type: "unsold_98_8",
      isResident988: true,
      contractDate988: "2015-06-01",
      acquisitionPrice988: "550,000,000",
      exclusiveAreaSqm988: "84.5",
      rentalContractDate988: "2015-12-20",
      rentalStartDate988: "2016-01-01",
      businessRegistrationDate988: "2015-12-10",
      rentalRegistrationDate988: "2015-12-10",
      isUnsoldAfterCompletion988: true,
      isFirstContract988: true,
      isNotRecontract988: true,
      standardPriceAtAcquisition988: "",
      standardPriceAt5Years988: PHD.std5Y,
      standardPriceAtTransfer988: PHD.stdTransfer,
      phdMode988: true,
      phdFirstDisclosureDate988: PHD.phdFirstDisclosureDate,
      phdFirstDisclosurePrice988: PHD.phdFirstDisclosurePrice,
      phdLandAreaSqm988: PHD.phdLandAreaSqm,
      phdLandPricePerSqmAtAcq988: PHD.phdLandPricePerSqmAtAcq,
      phdLandPricePerSqmAtFirst988: PHD.phdLandPricePerSqmAtFirst,
      phdBuildingStdAtAcq988: PHD.phdBuildingStdAtAcq,
      phdBuildingStdAtFirst988: PHD.phdBuildingStdAtFirst,
    } as never);
    expect(payload.standardPriceAtAcquisition988).toBe(ACQ_STD);
    const { status, r } = await run({ ...BASE, acquisitionDate: "2015-07-01", reductions: [payload] });
    expect(status).toBe(200);
    expect(r!.longTermHoldingDeduction).toBe(54_000_000);
    expect(r!.unsold988Detail.standardPriceAtAcquisition).toBe(ACQ_STD);
    expect(r!.unsold988Detail.reducibleTransferIncome).toBe(87_547_058);
    // 246,000,000 − 87,547,058 − 2,500,000 = 155,952,942
    expect(r!.taxBase).toBe(155_952_942);
  });

  it("기준시가 블록 §99의2: 양도소득금액 240,000,000 × 안분 = 170,823,529 차감", async () => {
    const payload = toUnsold992Payload({
      type: "unsold_99_2",
      houseType992: "new_or_unsold",
      contractDate992: "2013-06-01",
      acquisitionPrice992: "550,000,000",
      exclusiveAreaSqm992: "84.5",
      meetsHouseTypeRequirement992: true,
      isNotRecontract992: true,
      hasConfirmationSeal992: true,
      standardPriceAtAcquisition992: "",
      standardPriceAt5Years992: PHD.std5Y,
      standardPriceAtTransfer992: PHD.stdTransfer,
      phdMode992: true,
      phdFirstDisclosureDate992: PHD.phdFirstDisclosureDate,
      phdFirstDisclosurePrice992: PHD.phdFirstDisclosurePrice,
      phdLandAreaSqm992: PHD.phdLandAreaSqm,
      phdLandPricePerSqmAtAcq992: PHD.phdLandPricePerSqmAtAcq,
      phdLandPricePerSqmAtFirst992: PHD.phdLandPricePerSqmAtFirst,
      phdBuildingStdAtAcq992: PHD.phdBuildingStdAtAcq,
      phdBuildingStdAtFirst992: PHD.phdBuildingStdAtFirst,
    } as never);
    expect(payload.standardPriceAtAcquisition992).toBe(ACQ_STD);
    const { status, r } = await run({ ...BASE, acquisitionDate: "2013-10-23", reductions: [payload] });
    expect(status).toBe(200);
    expect(r!.longTermHoldingDeduction).toBe(60_000_000);
    expect(r!.unsold992Detail.standardPriceAtAcquisition).toBe(ACQ_STD);
    expect(r!.unsold992Detail.reducibleTransferIncome).toBe(170_823_529);
    // 240,000,000 − 170,823,529 − 2,500,000 = 66,676,471
    expect(r!.taxBase).toBe(66_676_471);
  });

  it("대조: PHD 토글 OFF면 수동 취득시 기준시가가 쓰인다 (§98의7, 5년간 발생분 = 234,000,000 × 100/200 = 117,000,000)", async () => {
    const payload = toUnsold987Payload({
      type: "unsold_98_7",
      isDomestic987: true,
      contractDate987: "2012-10-15",
      acquisitionPrice987: "550,000,000",
      isUnsoldAtCutoff987: true,
      isFirstContract987: true,
      isNotOccupiedAtContract987: true,
      isNotRecontract987: true,
      standardPriceAtAcquisition987: "200,000,000",
      standardPriceAt5Years987: "300,000,000",
      standardPriceAtTransfer987: "400,000,000",
      phdMode987: false,
    } as never);
    const { r } = await run({ ...BASE, acquisitionDate: "2013-01-15", reductions: [payload] });
    expect(r!.unsold987Detail.reducibleTransferIncome).toBe(117_000_000);
  });

  /*
   * (3) warnings route 도달 — §98의3 과밀 사업주체 취득 5년 후 (US-65-3과 같은 시료: 취득 2009-12-01 · 양도 2024-08-01)
   */
  const R983 = (over: Record<string, unknown> = {}) => ({
    type: "unsold_98_3",
    residencyType983: "resident",
    houseType983: "purchased",
    contractDate983: "2009-06-15",
    isOutsideSeoulNotDesignated983: true,
    isOverconcentration983: true,
    landAreaSqm983: 400,
    floorAreaSqm983: 120,
    isUnsoldConfirmed983: true,
    isFirstContract983: true,
    isNotOccupiedAtContract983: true,
    isNotRecontract983: true,
    standardPriceAtAcquisition983: 200_000_000,
    standardPriceAt5Years983: 300_000_000,
    standardPriceAtTransfer983: 400_000_000,
    ...over,
  });

  it("§98의3 과밀 5년 후: 세액은 US-65-3(40,265,500) 그대로, warnings에 과밀 독법 고지 1건", async () => {
    const { status, r } = await run({ ...BASE, acquisitionDate: "2009-12-01", reductions: [R983()] });
    expect(status).toBe(200);
    expect(r!.totalTax).toBe(40_265_500);
    expect(r!.unsold983Detail.warnings).toEqual([UNSOLD_98_3_OVERCON_READING_NOTICE]);
  });

  it("§98의3 비과밀 5년 후: warnings 없음", async () => {
    const { status, r } = await run({
      ...BASE,
      acquisitionDate: "2009-12-01",
      reductions: [R983({ isOverconcentration983: false, landAreaSqm983: undefined, floorAreaSqm983: undefined })],
    });
    expect(status).toBe(200);
    expect(r!.unsold983Detail.warnings ?? []).toEqual([]);
  });

  it("§98의3 과밀 + 분모 0: 감면율 100% 미만 분모 ≤ 0 고지와 과밀 독법 고지가 함께 실린다", async () => {
    const { status, r } = await run({
      ...BASE,
      acquisitionDate: "2009-12-01",
      reductions: [R983({ standardPriceAtTransfer983: 200_000_000 })],
    });
    expect(status).toBe(200);
    expect(r!.unsold983Detail.signCase).toBe("pos_zero");
    expect(r!.unsold983Detail.warnings).toEqual([
      ALLOCATION_NONPOSITIVE_DENOMINATOR_BELOW_FULL_RATE_NOTICE,
      UNSOLD_98_3_OVERCON_READING_NOTICE,
    ]);
  });

  /* 분모 0: 취득시·양도시 기준시가 200,000,000 동일 → 전액 차감. 감면 전 산출 (234,000,000−2,500,000)×38%−19,940,000 = 68,030,000, 결정세액 0, 농특세 = 68,030,000×20% = 13,606,000 */
  it("§98의7(100%) 분모 0: 전액 + 확인 필요 고지가 route 응답 warnings에 실린다 (총 13,606,000)", async () => {
    const payload = toUnsold987Payload({
      type: "unsold_98_7",
      isDomestic987: true,
      contractDate987: "2012-10-15",
      acquisitionPrice987: "550,000,000",
      isUnsoldAtCutoff987: true,
      isFirstContract987: true,
      isNotOccupiedAtContract987: true,
      isNotRecontract987: true,
      standardPriceAtAcquisition987: "200,000,000",
      standardPriceAt5Years987: "300,000,000",
      standardPriceAtTransfer987: "200,000,000",
    } as never);
    const { status, r } = await run({ ...BASE, acquisitionDate: "2013-01-15", reductions: [payload] });
    expect(status).toBe(200);
    expect(r!.totalTax).toBe(13_606_000);
    expect(r!.unsold987Detail.warnings).toEqual([ALLOCATION_DENOMINATOR_ZERO_FULL_NOTICE]);
  });
});
