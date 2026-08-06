/**
 * anchor: §155⑳ 장기임대 거주주택 특례 + 주택 부수토지 **배율 초과분**(§104의3①5호)
 *
 * [결함] STEP 2.5(`runRentalHousingExceptionStep`)가 조기반환해 STEP 3의 배율 초과분 분리와
 *   STEP 7의 §104⑤ 비교과세에 **도달하지 못했다**. 그 결과 특례를 적용하면 배율 초과분이
 *   주택 부수토지로 통째 취급되어 ⓐ12억 안분 제외 ⓑ장특 표1 ⓒ§104①8호 +10%p ⓓ§104⑤가
 *   **전부 사라졌다**(과소과세).
 *
 * [법령]
 *  · 「소득세법 시행령」 제155조 제20항 — 거주주택을 "국내에 1개의 주택을 소유하고 있는 것으로
 *    보아 **제154조제1항을 적용**한다". ⇒ 특례의 효과는 **주택 수 의제**뿐이고, 비과세 범위는
 *    §154①과 그 위임인 §154⑦(부수토지 = 정착면적 × 지역별 배율 이내)이 정한다.
 *    §155①(일시적 2주택)·§155②(상속주택)과 **같은 문형**이며, 일반 경로는 이미 그렇게 구현돼
 *    있다(`applyHousingLandExclusions`).
 *  · 「소득세법」 제104조의3 제1항 제5호 — 주택부수토지 중 배율 초과분은 **비사업용 토지**.
 *  · 「소득세법」 제104조 제5항 본문 후단 — 한 필지가 비사업용 토지와 그 외로 구분되면
 *    **각각을 별개의 자산으로 보아** 산출세액을 계산한다.
 *  · 「소득세법」 제95조 제2항 표1 — 비사업용 토지분 장기보유특별공제(보유연수 × 2%, 최대 30%).
 *
 * [픽스처] 조심 2024인3140 구조 + §155⑳ A 시나리오(거주주택 양도·고가 20억).
 *   토지 2008-07-01 취득(16억 양도 / 2억 취득) · 건물 2014-09-01 취득(4억 / 1억) · 2024-06-01 양도
 *   정착 60㎡ · 토지 660㎡ · 도시지역 밖(배율 10) → 한도 600㎡ · **초과 60㎡**
 *
 * [기대값 독립 도출 — 엔진 출력을 베끼지 않는다]
 *   토지 양도차익 = 1,600,000,000 − 200,000,000 = 1,400,000,000
 *   배율 초과분   = floor(1,400,000,000 × 60/660) = **127,272,727**
 *   표1 공제율    = min(15년 × 2%, 30%) = 30%  (토지 보유 2008-07-01~2024-06-01 = 15년 11개월)
 *   표1 공제액    = floor(127,272,727 × 0.30) = **38,181,818**
 *   비사토 소득금액 = 127,272,727 − 38,181,818 = **89,090,909**
 *
 *   ⭐ 위 세 값은 **특례 적용 여부와 무관**하다 — 배율 초과분은 §154①의 「이에 딸린 토지」가
 *     아니라서 §155⑳의 의제 대상 밖이기 때문이다. 그래서 **일반 경로와 같은 값**이어야 한다는
 *     것이 이 anchor의 핵심 등식이다(단일 값 일치보다 이 등식이 본질).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const rentalException: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      businessRegistrationDate: D("2018-06-01"),
      rentalRegistrationDate: D("2018-06-01"),
      rentalCategory: "long_general" as const,
      rentalAcquisitionType: "purchase" as const,
      isApartment: false,
      region: "non-metro" as const,
      isExcluded918Rule: false,
      standardPriceAtRentalStart: 250_000_000,
      hasMinimum2Units: false,
      rentalMonths: 96,
      rentalAutoTermination: false,
      requirementsConfirmed: true,
    },
  ],
};

/** 배율 초과 부수토지를 가진 고가(20억) 거주주택 */
const excessLandHouse = (rhe: boolean): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 2_000_000_000,
    acquisitionPrice: 300_000_000,
    landTransferPrice: 1_600_000_000,
    buildingTransferPrice: 400_000_000,
    // §100③(30% 의제) 판정 근거 — 구분 기재값과 **동일 비율**로 둬 의제가 발동하지 않게 한다.
    //    Phase 1-D부터 구분 기재 시 양도시 기준시가가 필수다(계획서 §12.7 R-7). 세액 불변.
    landStandardPriceAtTransfer: 1_600_000_000,
    buildingStandardPriceAtTransfer: 400_000_000,
    landAcquisitionPrice: 200_000_000,
    buildingAcquisitionPrice: 100_000_000,
    acquisitionDate: D("2014-09-01"),
    landAcquisitionDate: D("2008-07-01"),
    transferDate: D("2024-06-01"),
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    buildingFootprintArea: 60,
    acquisitionArea: 660,
    appurtenantLandZone: "non_urban" as const,
    residencePeriodMonths: 60,
    isOneHousehold: true,
    householdHousingCount: 1,
    expenses: 0,
    annualBasicDeductionUsed: 0,
    ...(rhe ? { rentalHousingException: rentalException } : {}),
  });

describe("§155⑳ 특례 + 배율 초과 부수토지 (§104의3①5호 · §104⑤)", () => {
  const withRhe = calculateTransferTax(excessLandHouse(true), rates);
  const withoutRhe = calculateTransferTax(excessLandHouse(false), rates);

  it("RH-EX-1: 특례가 실제로 적용된 경로다 (게이트 확인)", () => {
    expect(withRhe.rentalHousingExceptionDetail?.applied).toBe(true);
  });

  it("RH-EX-2: 특례 경로에서도 배율 초과분이 비사업용 토지로 분리된다", () => {
    const nb = withRhe.splitDetail?.nonBusinessLandPart;
    expect(nb).toBeDefined();
    expect(nb!.appliedMultiplier).toBe(10);
    expect(nb!.limitArea).toBe(600);
    expect(nb!.excessArea).toBe(60);
  });

  it("RH-EX-3: 배율 초과분 양도차익·장특은 특례 적용 여부와 무관하게 같다 (핵심 등식)", () => {
    const a = withRhe.splitDetail!.nonBusinessLandPart!;
    const b = withoutRhe.splitDetail!.nonBusinessLandPart!;
    // 독립 도출값
    expect(a.gain).toBe(127_272_727);
    expect(a.longTermRate).toBe(0.30);
    expect(a.longTermDeduction).toBe(38_181_818);
    // 등식 — §155⑳은 §154① 적용을 의제할 뿐 배율 초과분에는 미치지 않는다
    expect(a.gain).toBe(b.gain);
    expect(a.longTermRate).toBe(b.longTermRate);
    expect(a.longTermDeduction).toBe(b.longTermDeduction);
  });

  it("RH-EX-4: 특례 안분(12억 초과분)은 배율 초과분을 **제외한** 주택분에만 적용된다", () => {
    // 주택분 양도차익 = (1,400,000,000 − 127,272,727) + 300,000,000 = 1,572,727,273
    // 표2 = min(9년×4%,40%) + min(5년×4%,40%) = 36% + 20% = 56%
    //   (거주주택 보유 2014-09-01~2024-06-01 = 9년 9개월)
    // 장특 = floor(1,572,727,273 × 0.56) = 880,727,272 → 양도소득금액 692,000,001
    // 과세분 = floor(692,000,001 × (20억−12억)/20억) = 276,800,000
    expect(withRhe.rentalHousingExceptionDetail!.taxableGain).toBe(276_800_000);
  });

  it("RH-EX-5: 과세 대상 양도소득금액 = 주택분 + 비사업용 토지분", () => {
    // 276,800,000 + 89,090,909 = 365,890,909
    expect(withRhe.taxableGain).toBe(365_890_909);
  });

  it("RH-EX-6: 산출세액 = §104⑤ MAX(1호 합산누진, 2호 파트별 합)", () => {
    // 과세표준 = 365,890,909 − 2,500,000(기본공제) = 363,390,909
    expect(withRhe.taxBase).toBe(363_390_909);

    // 1호 = floor(363,390,909 × 40%) − 25,940,000 = 119,416,363
    const clause1 = Math.floor(363_390_909 * 0.4) - 25_940_000;
    expect(clause1).toBe(119_416_363);

    // 2호 — 기본공제는 한계세율이 높은 비사업용 토지 파트(24% + 10%p)에 귀속(§103② MAX_BENEFIT)
    //   주택분  276,800,000 → floor(×38%) − 19,940,000            = 85,244,000
    //   비사토   86,590,909 → floor(×24%) − 5,760,000 + floor(×10%) = 23,680,908
    const housingPart = Math.floor(276_800_000 * 0.38) - 19_940_000;
    const nblPart =
      Math.floor(86_590_909 * 0.24) - 5_760_000 + Math.floor(86_590_909 * 0.1);
    const clause2 = housingPart + nblPart;
    expect(clause2).toBe(108_924_908);

    // 이 픽스처에서는 1호가 크다 — §104⑤ 본문이 "큰 것"이라 법대로다.
    expect(withRhe.calculatedTax).toBe(Math.max(clause1, clause2));
    expect(withRhe.calculatedTax).toBe(119_416_363);

    // 종전(결함) 값 92,806,000 — 배율 초과분이 통째로 누락돼 있었다(과소 26,610,363).
    expect(withRhe.calculatedTax - 92_806_000).toBe(26_610_363);
  });

  it("RH-EX-7: 배율 초과분 분리 사실이 계산 단계에 노출된다 (침묵 금지)", () => {
    expect(withRhe.steps.some((s) => s.label.includes("배율 초과분 분리"))).toBe(true);
    expect(withRhe.steps.some((s) => s.label === "산출세액")).toBe(true);
  });
});

/**
 * B 시나리오(직전거주주택보유주택 · §161 안분)에도 **같은 원리**가 적용된다.
 *
 * §161①이 계산하는 것은 「**직전거주주택보유주택등**의 양도소득금액」인데, 배율 초과분은
 * 그 주택의 부수토지(§154⑦)가 아니므로 안분 대상에서 먼저 빠진다 — A 시나리오의 12억 안분과
 * 같은 자리다. 일반 경로도 12억 안분에서 같은 순서(①분리 → ②잔여만 안분)를 쓴다.
 *
 * ⚠️ A는 §155⑳ 본문("§154①을 적용")이 직접 근거인 반면, B는 §161①의 **적용 대상 주택 범위**
 *   해석에 기댄다 — 명문이 "배율 초과분을 빼라"고 적어 두지는 않았다. 다만 빼지 않으면 같은
 *   토지가 §161 안분(주택)과 §104의3①5호(비사업용)에 **동시에** 들어가 모순이 된다.
 */
describe("§155⑳ B 시나리오(§161 안분) + 배율 초과 부수토지", () => {
  const rentalExceptionB: NonNullable<TransferTaxInput["rentalHousingException"]> = {
    applyException: true,
    scenario: "B",
    rentalUnits: [
      {
        businessRegistrationDate: D("2014-01-01"),
        rentalRegistrationDate: D("2014-01-01"),
        rentalCategory: "long_general" as const,
        rentalAcquisitionType: "purchase" as const,
        isApartment: true,
        region: "seoul-metro" as const,
        isExcluded918Rule: false,
        standardPriceAtRentalStart: 500_000_000,
        hasMinimum2Units: false,
        rentalMonths: 96,
        rentalAutoTermination: false,
        requirementsConfirmed: true,
      },
    ],
    priorResidenceTransferDate: D("2016-08-25"),
    standardPriceAtAcquisition: 300_000_000,
    standardPriceAtPriorTransfer: 450_000_000,
    standardPriceAtTransfer: 500_000_000,
  };

  // 양도 8억(토지 6억 + 건물 2억) / 취득 3억(토지 2억 + 건물 1억)
  // 토지 2009-08-12 · 건물 2014-09-01 · 양도 2024-06-01 · 정착 60㎡ · 토지 660㎡(초과 60㎡)
  const r = calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 800_000_000,
      acquisitionPrice: 300_000_000,
      landTransferPrice: 600_000_000,
      buildingTransferPrice: 200_000_000,
      // §100③(30% 의제) 판정 근거 — 구분 기재값과 **동일 비율**로 둬 의제가 발동하지 않게 한다.
      //    Phase 1-D부터 구분 기재 시 양도시 기준시가가 필수다(계획서 §12.7 R-7). 세액 불변.
      landStandardPriceAtTransfer: 600_000_000,
      buildingStandardPriceAtTransfer: 200_000_000,
      landAcquisitionPrice: 200_000_000,
      buildingAcquisitionPrice: 100_000_000,
      acquisitionDate: D("2014-09-01"),
      landAcquisitionDate: D("2009-08-12"),
      transferDate: D("2024-06-01"),
      isSeparateAcquisition: true,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      buildingFootprintArea: 60,
      acquisitionArea: 660,
      appurtenantLandZone: "non_urban" as const,
      residencePeriodMonths: 30,
      isOneHousehold: true,
      householdHousingCount: 1,
      expenses: 0,
      annualBasicDeductionUsed: 0,
      rentalHousingException: rentalExceptionB,
    }),
    rates,
  );

  it("RH-EX-B1: 배율 초과분이 분리된다 (표1은 **토지** 보유연수 14년 × 2% = 28%)", () => {
    // 토지 양도차익 = 600,000,000 − 200,000,000 = 400,000,000
    // 초과분 = floor(400,000,000 × 60/660) = 36,363,636
    // 표1 = min(14년 × 2%, 30%) = 28%  (2009-08-12 ~ 2024-06-01 = 14년 9개월)
    const nb = r.splitDetail!.nonBusinessLandPart!;
    expect(nb.gain).toBe(36_363_636);
    expect(nb.holdingYears).toBe(14);
    expect(nb.longTermRate).toBe(0.28);
    expect(nb.longTermDeduction).toBe(10_181_818);
  });

  it("RH-EX-B2: §161① 안분은 배율 초과분을 제외한 주택분에만 적용된다", () => {
    // 주택분 양도차익 = 500,000,000 − 36,363,636 = 463,636,364
    // 표1(거주주택 보유 9년 × 2% = 18%) = floor(463,636,364 × 0.18) = 83,454,545
    //   → §95① 양도소득금액 = 380,181,819
    // §161① 비율 = (450,000,000 − 300,000,000) / (500,000,000 − 300,000,000) = 0.75
    //   → 주택분 과세 = floor(380,181,819 × 0.75) = 285,136,364
    expect(r.rentalHousingExceptionDetail!.taxableGain).toBe(285_136_364);
    // 총 과세 대상 = 285,136,364 + (36,363,636 − 10,181,818) = 311,318,182
    expect(r.taxableGain).toBe(311_318_182);
  });

  it("RH-EX-B3: 산출세액 = §104⑤ MAX", () => {
    // 과세표준 = 311,318,182 − 2,500,000 = 308,818,182
    // 1호 = floor(308,818,182 × 40%) − 25,940,000 = 97,587,272
    expect(r.taxBase).toBe(308_818_182);
    expect(r.calculatedTax).toBe(Math.floor(308_818_182 * 0.4) - 25_940_000);
    expect(r.calculatedTax).toBe(97_587_272);
  });
});
