/**
 * 양도소득세 — 다주택 중과세 + 비사업용 토지 정밀 판정 (T-23~T-26) 테스트
 *
 * 공통 세율·기본 입력은 ../_helpers/mock-rates 에서 import.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { HouseInfo } from "@/lib/tax-engine/multi-house-surcharge";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land";
import type { RentalReductionInput } from "@/lib/tax-engine/rental-housing-reduction";
import type { NewHousingReductionInput } from "@/lib/tax-engine/new-housing-reduction";
import { makeMockRates, baseTransferInput as baseInput, makeHouseInfo, makeMockRatesWithHouseEngine } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const mockRatesWithHouseEngine = makeMockRatesWithHouseEngine();

describe("T-23: houses[] 제공 시 유효 주택 수 산정 (householdHousingCount 무시)", () => {
  it("3채 중 비수도권 1억 이하 1채 제외 → effectiveCount=2, surchargeType=multi_house_2", () => {
    // houses: 3채 (비수도권 1억 이하 1채 포함)
    // householdHousingCount: 3 (원래라면 3plus 중과)
    // 기대: 유효 2주택 → multi_house_2 적용
    const h1 = makeHouseInfo("h1", { regionCode: "11680" }); // 강남구 (조정, 양도주택)
    const h2 = makeHouseInfo("h2", { region: "capital" });
    const h3 = makeHouseInfo("h3", {
      region: "non_capital",
      officialPrice: 90_000_000, // 1억 미만
    });

    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2024-06-01"),
      isRegulatedArea: true, // 플래그도 조정 (fallback)
      householdHousingCount: 3, // 잘못 제공된 값 — 무시되어야 함
      isOneHousehold: true,
      sellingHouseId: "h1",
      houses: [h1, h2, h3],
    });

    const result = calculateTransferTax(input, mockRatesWithHouseEngine);

    // 다주택 상세 결과 확인
    expect(result.multiHouseSurchargeDetail).toBeDefined();
    expect(result.multiHouseSurchargeDetail!.effectiveHouseCount).toBe(2);
    expect(result.multiHouseSurchargeDetail!.excludedHouses).toHaveLength(1);
    expect(result.multiHouseSurchargeDetail!.excludedHouses[0].reason).toBe("low_price_non_capital");

    // 중과 유형: 2주택 (3주택+ 아님)
    expect(result.surchargeType).toBe("multi_house_2");
    expect(result.surchargeRate).toBeDefined();
  });
});

// ============================================================
// T-24: 일시적 2주택 배제 → 일반세율 적용 통합 검증
// ============================================================

describe("T-24: houses[] + 일시적 2주택 배제 → 일반세율", () => {
  it("2주택 일시적 2주택 배제 → surchargeType 없음, 일반 누진세율 적용", () => {
    // 종전주택(h1) 양도, 신규주택(h2) 취득 2022.5.10 이후 → 3년 처분기한
    const h1 = makeHouseInfo("h1", { regionCode: "11680" }); // 강남구 (조정)
    const h2 = makeHouseInfo("h2", { acquisitionDate: new Date("2022-06-01") });

    const transferDate = new Date("2024-06-01"); // 신규주택 취득 후 2년 → 3년 이내

    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate,
      isRegulatedArea: true,
      householdHousingCount: 2,
      isOneHousehold: true,
      sellingHouseId: "h1",
      houses: [h1, h2],
      multiHouseTemporaryTwoHouse: { previousHouseId: "h1", newHouseId: "h2" },
    });

    const result = calculateTransferTax(input, mockRatesWithHouseEngine);

    // 배제 → 중과 미적용
    expect(result.surchargeType).toBeUndefined();
    expect(result.isSurchargeSuspended).toBe(false);
    expect(result.multiHouseSurchargeDetail!.exclusionReasons[0].type).toBe("temporary_two_house");

    // 일반 누진세율로 세금 계산됨 → surchargeRate 없음
    expect(result.surchargeRate).toBeUndefined();
  });
});

// ============================================================
// T-25: 장기임대 등록주택 보유 2주택자 → 유효 1주택 → 중과 미적용
// ============================================================

describe("T-25: 장기임대 등록주택 → 유효 1주택, 중과 미적용", () => {
  it("임대 등록 유효 주택 1채 → effectiveCount=1, surchargeType 없음", () => {
    const h1 = makeHouseInfo("h1", { regionCode: "11680" }); // 강남구 (조정, 양도주택)
    const h2 = makeHouseInfo("h2", {
      isLongTermRental: true,
      rentalRegistrationDate: new Date("2020-01-01"),
      rentalCancelledDate: undefined,
    });

    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2024-06-01"),
      isRegulatedArea: true,
      householdHousingCount: 2,
      isOneHousehold: true,
      sellingHouseId: "h1",
      houses: [h1, h2],
    });

    const result = calculateTransferTax(input, mockRatesWithHouseEngine);

    // 유효 주택 1채 → 중과 미적용
    expect(result.multiHouseSurchargeDetail!.effectiveHouseCount).toBe(1);
    expect(result.surchargeType).toBeUndefined();
    expect(result.surchargeRate).toBeUndefined();
  });
});

// ============================================================
// T-26: nonBusinessLandDetails 제공 → 판정 결과로 isNonBusinessLand 덮어쓰기
// ============================================================

describe("T-26: 비사업용 토지 정밀 판정 연동", () => {
  it("input.isNonBusinessLand=false이나 nonBusinessLandDetails 판정 결과 비사업용 → 중과 적용 + 장기보유공제 표1 적용", () => {
    // 나대지, 5년 보유, 사업용 사용 0일 → 비사업용 판정
    const nbDetails: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 1000,
      zoneType: "residential",
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2025-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
    };

    const input = baseInput({
      propertyType: "land",
      transferPrice: 500_000_000,
      acquisitionPrice: 200_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2025-01-01"),
      isNonBusinessLand: false, // 플래그는 false지만 details로 덮어씀
      isOneHousehold: false,    // land에 1세대1주택 특례 미적용 → 표1(연2%) 경로
      nonBusinessLandDetails: nbDetails,
    });

    const result = calculateTransferTax(input, mockRates);

    // 판정 결과: 비사업용
    expect(result.nonBusinessLandJudgmentDetail).toBeDefined();
    expect(result.nonBusinessLandJudgmentDetail!.isNonBusinessLand).toBe(true);
    // 비사업용 → 중과 +10%p
    expect(result.surchargeType).toBe("non_business_land");
    expect(result.surchargeRate).toBe(0.1);
    // 비사업용이어도 장기보유특별공제 표1 적용 (현행 소득세법)
    // 민법 초일불산입: 2020-01-02 기산 → 2025-01-01까지 4년 11개월 → years=4, rate=4×2%=8%
    expect(result.longTermHoldingRate).toBe(0.08);
    expect(result.longTermHoldingDeduction).toBeGreaterThan(0);
  });

  it("input.isNonBusinessLand=true이나 nonBusinessLandDetails 판정 결과 사업용 → 중과 미적용, 장기보유공제 적용", () => {
    // 농지, 자경 5년 이상 → 사업용
    const nbDetails: NonBusinessLandInput = {
      landType: "farmland",
      landArea: 5000,
      zoneType: "agriculture_forest",
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2022-01-01"),
      farmingSelf: true,
      farmerResidenceDistance: 10,
      businessUsePeriods: [
        {
          startDate: new Date("2015-01-02"),
          endDate: new Date("2022-01-01"),
          usageType: "자경",
        },
      ],
      gracePeriods: [],
    };

    const input = baseInput({
      propertyType: "land",
      transferPrice: 300_000_000,
      acquisitionPrice: 100_000_000,
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2022-01-01"),
      isNonBusinessLand: true, // 플래그는 true지만 details로 덮어씀 → 사업용
      nonBusinessLandDetails: nbDetails,
    });

    const result = calculateTransferTax(input, mockRates);

    // 판정 결과: 사업용
    expect(result.nonBusinessLandJudgmentDetail!.isNonBusinessLand).toBe(false);
    // 사업용 → 비사업용 중과 없음
    expect(result.surchargeType).toBeUndefined();
    // 7년 보유 → 장기보유공제 적용 (일반 2%/년, 7년=14%)
    expect(result.longTermHoldingRate).toBeGreaterThan(0);
  });

  it("nonBusinessLandDetails 미제공 → isNonBusinessLand 플래그 그대로 사용 (하위 호환)", () => {
    const input = baseInput({
      propertyType: "land",
      transferPrice: 300_000_000,
      acquisitionPrice: 100_000_000,
      acquisitionDate: new Date("2018-01-01"),
      transferDate: new Date("2022-01-01"),
      isNonBusinessLand: true,
      // nonBusinessLandDetails: 미제공
    });

    const result = calculateTransferTax(input, mockRates);

    expect(result.nonBusinessLandJudgmentDetail).toBeUndefined();
    expect(result.surchargeType).toBe("non_business_land");
  });
});

// ============================================================
// H-1 회귀: §104① 후단 — 비사업용 토지 단기보유 비교과세
// 하나의 자산이 비사업용 토지(§104①8호)이면서 단기보유(§104①3·2호)에
// 해당하면 둘 중 큰 산출세액 적용. (코드리뷰 2026-06-03 발견·실증)
// ============================================================
describe("H-1: 비사업용 토지 단기보유 §104①후단 비교과세", () => {
  // 비사업용 토지 기본 입력 (차익은 acquisitionPrice로 조정)
  const nblLand = (overrides?: Partial<TransferTaxInput>): TransferTaxInput =>
    baseInput({
      propertyType: "land",
      transferPrice: 500_000_000,
      acquisitionPrice: 200_000_000, // 차익 3억
      acquisitionDate: new Date("2024-01-01"),
      transferDate: new Date("2024-06-01"), // 5개월 = 1년 미만
      isNonBusinessLand: true,
      isOneHousehold: false,
      householdHousingCount: 0,
      residencePeriodMonths: 0,
      expenses: 0,
      ...overrides,
    });

  it("1년 미만 보유 — 단기 50% > 비사업용 누진+10%p → 단기세율 적용", () => {
    // 과세표준 2.975억: 단기 50% = 148,750,000 vs 비사업용(38%+10%p) = 122,860,000
    const r = calculateTransferTax(nblLand(), mockRates);
    expect(r.taxBase).toBe(297_500_000);
    expect(r.calculatedTax).toBe(148_750_000); // 큰 세액 = 단기 50%
    expect(r.appliedRate).toBe(0.5);
    expect(r.surchargeType).toBeUndefined(); // 단기 단일세율 → 중과 표시 없음
    expect(r.shortTermNote).toContain("§104①후단");
  });

  it("1~2년 보유 + 낮은 과세표준(1.475억) — 단기 40% > 비사업용 → 40% 적용", () => {
    // 차익 1.5억(과표 1.475억): 단기 40% = 59,000,000 vs 비사업용(35%+10%p) = 50,935,000
    const r = calculateTransferTax(
      nblLand({ transferPrice: 350_000_000, transferDate: new Date("2025-06-01") }),
      mockRates,
    );
    expect(r.taxBase).toBe(147_500_000);
    expect(r.calculatedTax).toBe(59_000_000); // 큰 세액 = 단기 40%
    expect(r.appliedRate).toBe(0.4);
    expect(r.surchargeType).toBeUndefined();
  });

  it("1~2년 보유 + 높은 과세표준(2.975억) — 비사업용 누진+10%p > 단기 40% → 비사업용 유지", () => {
    // 차익 3억(과표 2.975억): 비사업용 = 122,860,000 vs 단기 40% = 119,000,000
    const r = calculateTransferTax(
      nblLand({ transferDate: new Date("2025-06-01") }),
      mockRates,
    );
    expect(r.taxBase).toBe(297_500_000);
    expect(r.calculatedTax).toBe(122_860_000); // 큰 세액 = 비사업용 누진+10%p
    expect(r.surchargeType).toBe("non_business_land");
    expect(r.surchargeRate).toBe(0.1);
  });

  it("정확히 2년 보유(24개월) — 단기 미해당 → 비사업용 누진+10%p", () => {
    const r = calculateTransferTax(
      nblLand({ acquisitionDate: new Date("2022-06-01"), transferDate: new Date("2024-06-01") }),
      mockRates,
    );
    expect(r.calculatedTax).toBe(122_860_000);
    expect(r.surchargeType).toBe("non_business_land");
  });

  it("장기보유(3년 이상) — 단기 비교 없음, 비사업용 누진+10%p + LTHD 정상", () => {
    const r = calculateTransferTax(
      nblLand({ acquisitionDate: new Date("2021-01-01"), transferDate: new Date("2024-06-01") }),
      mockRates,
    );
    expect(r.surchargeType).toBe("non_business_land");
    expect(r.longTermHoldingRate).toBeGreaterThan(0); // 비사업용도 LTHD 적용 (다주택 중과만 배제)
  });

  it("대조군: 사업용 토지 1년 미만 — 단기 50% 정상 적용 (회귀 방어)", () => {
    const r = calculateTransferTax(nblLand({ isNonBusinessLand: false }), mockRates);
    expect(r.calculatedTax).toBe(148_750_000);
    expect(r.appliedRate).toBe(0.5);
  });
});

// ============================================================
// T-27: rentalReductionDetails 제공 → 정밀 감면 엔진 연동
// ============================================================
