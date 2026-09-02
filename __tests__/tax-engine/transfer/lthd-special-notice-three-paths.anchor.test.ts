// CB-02 · D5-05 · CB-05 anchor — LTHD 계열 특례의 «침묵» 제거 + 겸용 §97 시한 기준일
//
// ## 감면 효과는 3종인데 두 경로가 2종으로만 갈랐다 (CB-02)
//
// 차감형(소득금액 차감) · 세액감면형(산출세액 차감) · **LTHD 계열**(장기보유특별공제율 자체 변경).
// 겸용주택·§155⑳ 경로는 `!ALL_INCOME_DEDUCTION_IDS.has(type)` **이분법**으로만 갈라서, 세 번째가
// 자리를 못 찾고 세액감면형 버킷으로 흘러 `calcReductions`에서 조용히 사라졌다.
// 재개발 경로는 아예 `calcLongTermHoldingDeduction`(§98의2 표2 강제가 있는 유일한 지점)을
// 부르지 않는다 — `isRedevelopmentActive` 분기로 조기반환하기 때문이다.
//
// 대상 조문: §97의3①(임대기간분 70%) · §97의4①(표1 가산) · §98의2①1호(양도차익 × §95② 표2).
// 자산종류 게이트는 이 조합을 **허용한다** — `RENTAL_HOUSING_KINDS`에 `redevelopment_apt`가 있고,
// 조특령 §97의3② 후단이 「재개발사업·재건축사업 … 의 시행으로 임대할 수 없는 경우에는 관리처분
// 계획 인가일 전 6개월부터 준공일 후 6개월까지 계속하여 임대한 것으로 본다」로 재개발 아파트가
// §97의3 대상임을 **전제**한다.
//
// ⚠️ **세액 반영은 아직 하지 않는다.** §97의3⑤·§98의2①1호를 소령 §166⑤의 3분기 LTHD 구조
// (인가전·인가후 기존건물·청산금)와 어떻게 결합할지가 조문에서 곧바로 나오지 않아 별도 법적
// 판단이 필요하다. 이 anchor가 고정하는 것은 **침묵이 사라졌다**는 사실이다.
//
// ## CB-05 — 겸용 경로가 `calcReductions` 15번 인자(시한 기준일)를 빠뜨렸다
//
// `assetContractDate`는 겸용 여부와 무관하게 전송·Date 변환되는데 겸용 분기가 전달하지 않아
// `period-check.ts`가 `contractDate ?? acquisitionDate`로 **취득일에 후퇴**했다.
// §97의5①1호는 「2018년 12월 31일까지 … 매매계약을 체결하고 계약금을 납부한 경우를 포함한다」로
// **계약일이 기준**이라, 계약일은 시한 내인데 취득일이 시한 외인 사안이 침묵 차단됐다(불리).
import { describe, it, expect } from "vitest";
import { LTHD_SPECIAL_REDUCTION_IDS } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p3";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import { mixedUseCase14, CASE14_TRANSFER_DATE } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput } from "../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "@/__tests__/tax-engine/transfer-tax/redevelopment/_helpers";

const rates = makeMockRates();

const RENTAL_97_3 = {
  type: "rental_97_3" as const,
  registrationDate: new Date("2019-03-01"),
  rentalStartDate: new Date("2019-03-01"),
  isTaxRegistered: true,
};

describe("CB-02 LTHD 계열 특례 집합", () => {
  it("LT-1: §97의3·§97의4·§98의2 셋을 담는다", () => {
    expect(LTHD_SPECIAL_REDUCTION_IDS).toEqual(
      expect.arrayContaining(["rental_97_3", "rental_97_4", "unsold_98_2"]),
    );
    expect(LTHD_SPECIAL_REDUCTION_IDS).toHaveLength(3);
  });

  it("LT-2: 세액감면형·차감형은 이 집합에 없다 (버킷 오분류 방지)", () => {
    for (const id of ["public_expropriation", "self_farming", "new_99_3", "rental_97_main"]) {
      expect(LTHD_SPECIAL_REDUCTION_IDS).not.toContain(id);
    }
  });
});

function mixed(over: Partial<MixedUseAssetInput> = {}) {
  return calcMixedUseTransferTax(
    1_500_000_000,
    CASE14_TRANSFER_DATE,
    { ...mixedUseCase14(), ...over } as MixedUseAssetInput,
    rates,
  );
}

describe("CB-02 겸용주택 — LTHD 특례 미반영 고지", () => {
  it("CB-02-M1: §97의3 선택 시 경고가 남는다 (종전 침묵)", () => {
    const r = mixed({ reductions: [RENTAL_97_3] as MixedUseAssetInput["reductions"] });
    expect(
      r.warnings.some((w) => w.includes("장기보유특별공제 특례") && w.includes("§97의3")),
    ).toBe(true);
  });

  it("CB-02-M2 대조군: 미선택이면 경고가 없다 (구별력)", () => {
    expect(mixed().warnings.some((w) => w.includes("장기보유특별공제 특례"))).toBe(false);
  });

  it("CB-02-M3: 차감형 고지와 «별개» 문구다 (두 축이 섞이지 않는다)", () => {
    const r = mixed({ reductions: [RENTAL_97_3] as MixedUseAssetInput["reductions"] });
    const lthd = r.warnings.filter((w) => w.includes("장기보유특별공제 특례"));
    const deferred = r.warnings.filter((w) => w.includes("소득금액 차감형"));
    expect(lthd).toHaveLength(1);
    expect(deferred).toHaveLength(0);
  });
});

describe("CB-05 겸용주택 — §97 시한 기준일(assetContractDate) 전달", () => {
  it("CB-05-1: 겸용 자산 타입이 assetContractDate를 받는다", () => {
    const asset = {
      ...mixedUseCase14(),
      assetContractDate: new Date("2018-12-01"),
    } as MixedUseAssetInput;
    expect(asset.assetContractDate?.toISOString().slice(0, 10)).toBe("2018-12-01");
  });

  it("CB-05-2: 계약일을 넘겨도 계산이 정상 완주한다 (배선 회귀)", () => {
    const r = mixed({ assetContractDate: new Date("2018-12-01") });
    expect(r.splitMode).toBe("post-2022");
    expect(r.total.taxBase).toBeGreaterThan(0);
  });
});

describe("D5-05 · CB-02 재개발 경로 — LTHD 특례 미반영 고지", () => {
  function redev(over: Partial<TransferTaxInput> = {}) {
    return calculateTransferTax(
      baseTransferInput({
        propertyType: "redevelopment_apt",
        transferPrice: 525_000_000,
        transferDate: new Date("2026-02-16T00:00:00"),
        acquisitionDate: new Date("2005-04-09T00:00:00"),
        acquisitionPrice: 0,
        expenses: 0,
        useEstimatedAcquisition: true,
        isOneHousehold: false,
        residencePeriodMonths: 0,
        redevelopment: case44RedevelopmentInfo(),
        ...over,
      }),
      rates,
    );
  }

  /**
   * 🔄 2026-09-02 — D5-05-1·CB-02-R1은 **의도적으로 뒤집혔다**.
   *
   * 도입 당시에는 §97의3·§97의4·§98의2 셋 다 「미반영 고지」였다. 그 뒤 결합 규칙을 다시
   * 읽어 보니 §97의3·§97의4는 결합 규칙이 필요 없고(전자는 임대분 고정 70%라 보유기간이
   * 개입하지 않고, 후자는 가산이라 분기별 합 = 전체 적용), §98의2는 조합원 경로와 **결합
   * 자체가 성립하지 않는다**(조합원 배정분은 미분양주택이 될 수 없다).
   * ⇒ 앞 둘은 계산에 반영하고, §98의2는 「적용 대상 아님」으로 문구를 바꿨다.
   */
  it("D5-05-1: 🔴 §98의2는 「미반영」이 아니라 「적용 대상 아님」이다", () => {
    const r = redev({
      reductions: [
        { type: "unsold_98_2", contractDate982: new Date("2009-06-01") },
      ] as unknown as TransferTaxInput["reductions"],
    });
    expect(
      r.steps.some((st) => st.label === "조특법 §98의2 — 적용 대상 아님 (조합원 취득 자산)"),
    ).toBe(true);
    expect(r.warnings?.some((w) => w.includes("적용되지 않습니다"))).toBe(true);
    // 종전 문구는 「아직 반영하지 않았다」로 읽혀 받을 수 있는 특례를 놓쳤다고 오해시켰다
    expect(r.warnings?.some((w) => w.includes("미반영"))).toBe(false);
  });

  it("CB-02-R1: 🔴 §97의3은 이제 **고지가 아니라 계산에 반영**된다", () => {
    const r = redev({ reductions: [RENTAL_97_3] as unknown as TransferTaxInput["reductions"] });
    // 요건(10년 계속 임대) 미충족 fixture라 적격은 아니지만, 「미반영 고지」는 더는 붙지 않는다
    expect(r.warnings?.some((w) => w.includes("장기보유특별공제 특례"))).toBe(false);
    expect(
      r.steps.some((st) => st.label === "조특법 감면 — 미반영 (장기보유특별공제 특례)"),
    ).toBe(false);
  });

  it("CB-02-R2 대조군: 미선택이면 경고가 없다 (구별력)", () => {
    expect(redev().warnings?.some((w) => w.includes("장기보유특별공제 특례"))).toBe(false);
  });

  it("CB-02-R3: 세액감면형(§77)에는 이 고지가 붙지 않는다 (버킷 구분)", () => {
    const r = redev({
      reductions: [
        {
          type: "public_expropriation",
          cashCompensation: 500_000_000,
          bondCompensation: 0,
          businessApprovalDate: new Date("2020-01-01"),
        },
      ] as unknown as TransferTaxInput["reductions"],
    });
    expect(r.warnings?.some((w) => w.includes("장기보유특별공제 특례"))).toBe(false);
  });
});

describe("CB-02 §155⑳ 거주주택 특례 경로 — LTHD 특례 미반영 고지", () => {
  const rentalException: NonNullable<TransferTaxInput["rentalHousingException"]> = {
    applyException: true,
    scenario: "A",
    rentalUnits: [
      {
        businessRegistrationDate: new Date("2018-06-01"),
        rentalRegistrationDate: new Date("2018-06-01"),
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

  function rhe(over: Partial<TransferTaxInput> = {}) {
    return calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: 1_500_000_000,
        acquisitionPrice: 1_100_000_000,
        acquisitionDate: new Date("2014-06-01"),
        transferDate: new Date("2024-06-01"),
        residencePeriodMonths: 60,
        isOneHousehold: true,
        householdHousingCount: 1,
        expenses: 0,
        rentalHousingException: rentalException,
        ...over,
      }),
      rates,
    );
  }

  it("CB-02-H1: 특례 경로로 조기반환한다 (전제)", () => {
    expect(rhe().rentalHousingExceptionDetail?.applied).toBe(true);
  });

  it("CB-02-H2: §97의4 선택 시 경고 + step이 남는다", () => {
    const r = rhe({
      reductions: [
        {
          type: "rental_97_4",
          registrationDate: new Date("2015-01-01"),
          rentalStartDate: new Date("2015-01-01"),
        },
      ] as unknown as TransferTaxInput["reductions"],
    });
    expect(r.warnings?.some((w) => w.includes("장기보유특별공제 특례"))).toBe(true);
    expect(
      r.steps.some((st) => st.label === "조특법 감면 — 미반영 (장기보유특별공제 특례)"),
    ).toBe(true);
  });

  it("CB-02-H3 대조군: 미선택이면 경고가 없다", () => {
    // §155⑳ 경로는 고지가 없으면 warnings 키 자체를 싣지 않는다(기존 규약).
    expect(rhe().warnings?.some((w) => w.includes("장기보유특별공제 특례")) ?? false).toBe(false);
  });
});
