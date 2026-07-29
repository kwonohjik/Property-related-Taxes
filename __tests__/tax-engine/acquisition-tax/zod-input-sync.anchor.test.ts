/**
 * [AT-ZOD] ⑫ Zod 스키마 ↔ 엔진 입력 동기화 회귀 anchor
 *
 * 2026-06 리뷰 R1에서 acquisitionTaxInputSchema가 P1~P4 확장 필드 38개를
 * 정의하지 않아 safeParse가 침묵 strip → UI 입력(일시적 2주택·자경 감면·
 * 읍면 농특세 면제 등)이 엔진에 도달하지 못하던 Critical 버그의 회귀 방어.
 *
 * 각 anchor는 route.ts와 동일 경로(safeParse → calcAcquisitionTax)와
 * 엔진 직접 호출의 결과가 원 단위로 일치함을 고정한다.
 */
import { describe, it, expect } from "vitest";
import { acquisitionTaxInputSchema } from "@/lib/validators/acquisition-input";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";
import type { AcquisitionTaxInput } from "@/lib/tax-engine/types/acquisition.types";

/** route.ts 경로 재현: safeParse 통과 데이터를 엔진에 전달 */
function calcViaRoute(body: unknown) {
  const parsed = acquisitionTaxInputSchema.safeParse(body);
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error("unreachable");
  return calcAcquisitionTax(parsed.data);
}

describe("[AT-ZOD] Zod 스키마 ↔ 엔진 입력 동기화", () => {
  it("[AT-ZOD-01] 일시적 2주택 8억 (조정→조정) — 중과 배제 + 선형보간 2.333%", () => {
    const body: AcquisitionTaxInput = {
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 800_000_000,
      acquiredBy: "individual",
      houseCountAfter: 2,
      isRegulatedArea: true,
      isTemporaryTwoHouse: true,
      previousHouseRegion: "regulated",
      newHouseRegion: "regulated",
      balancePaymentDate: "2024-06-01",
    };

    const direct = calcAcquisitionTax(body);
    const viaRoute = calcViaRoute(body);

    // strip 회귀 방어: route 경로 = 직접 호출 (수정 전에는 8% 중과 64,000,000)
    expect(viaRoute.appliedRate).toBe(direct.appliedRate);
    expect(viaRoute.acquisitionTax).toBe(direct.acquisitionTax);
    // [R3-10] §11①8나 4자리 확정세율: (8억×2−9억)/300억 = 0.023333 → 0.0233.
    //   취득세 = floor(8억 × 0.0233) = 18,640,000.
    expect(viaRoute.appliedRate).toBe(0.0233);
    expect(viaRoute.acquisitionTax).toBe(18_640_000);
    expect(viaRoute.isSurcharged).toBe(false);
  });

  it("[AT-ZOD-02] 자경농민 농지 5억 — 50% 감면 7,500,000 유지", () => {
    const body: AcquisitionTaxInput = {
      propertyType: "land_farmland",
      acquisitionCause: "purchase",
      reportedPrice: 500_000_000,
      acquiredBy: "individual",
      isSelfCultivatedFarmer: true,
      farmingYears: 5,
      farmlandArea: 3000,
      farmlandLocationDistance: 10,
      balancePaymentDate: "2024-06-01",
    };

    const direct = calcAcquisitionTax(body);
    const viaRoute = calcViaRoute(body);

    expect(viaRoute.reductionAmount).toBe(direct.reductionAmount);
    // 농지 매매 3% = 15,000,000 본세 × 50% 감면 (수정 전에는 strip으로 감면 0)
    expect(viaRoute.reductionAmount).toBe(7_500_000);
    // [R3-09] 자경농지 §6① 감면 시 농특세 비과세(농특세법 §4 10호) → 농특세 0.
    //   감면후본세 7,500,000 + 농특세 0 + 교육세 1,000,000 = 8,500,000.
    //   교육세 = §151①1 본문 (3%−2%)×20% = 0.2% = 1,000,000 (비과세 대상 아님).
    expect(viaRoute.ruralSpecialTax).toBe(0);
    expect(viaRoute.totalTaxAfterReduction).toBe(8_500_000);
  });

  it("[AT-ZOD-03] 읍·면 95㎡ 주택 — 농특세 100㎡ 한도 면제 유지", () => {
    const body: AcquisitionTaxInput = {
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 1_000_000_000,
      areaSqm: 95, // 85㎡ 초과·100㎡ 이하 — 읍·면이면 면제 (농특법 §4②6호)
      acquiredBy: "individual",
      houseCountAfter: 1,
      isRuralRegion: true,
      balancePaymentDate: "2024-06-01",
    };

    const direct = calcAcquisitionTax(body);
    const viaRoute = calcViaRoute(body);

    expect(viaRoute.ruralSpecialTax).toBe(direct.ruralSpecialTax);
    // 수정 전에는 strip으로 85㎡ 기준 적용 → 1,000,000 과세
    expect(viaRoute.ruralSpecialTax).toBe(0);
  });

  it("[AT-ZOD-04] 비취득 3종 enum 제거 — API가 명시 거부 (지방세법 §6 단서 부재)", () => {
    // 환매·법인합병·협의분할은 §15① 세율특례 과세 대상 (specialRateType으로 입력)
    for (const cause of ["redemption", "corporate_merger", "consensual_division"]) {
      const parsed = acquisitionTaxInputSchema.safeParse({
        propertyType: "housing",
        acquisitionCause: cause,
        reportedPrice: 500_000_000,
        acquiredBy: "individual",
      });
      expect(parsed.success).toBe(false);
    }
  });

  it("[AT-ZOD-05] 연부취득 회차 label — 신고 스케줄에 echo 유지", () => {
    const body: AcquisitionTaxInput = {
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 600_000_000,
      acquiredBy: "individual",
      houseCountAfter: 1,
      installments: [
        { paymentDate: "2024-01-10", amount: 100_000_000, label: "계약금" },
        { paymentDate: "2025-01-10", amount: 200_000_000, label: "중도금" },
        { paymentDate: "2026-03-10", amount: 300_000_000, label: "잔금" },
      ],
    };

    const viaRoute = calcViaRoute(body);

    // 수정 전에는 installmentPaymentSchema에 label이 없어 strip → 항상 "N회차" fallback
    expect(viaRoute.installmentFilingSchedule?.map((s) => s.label)).toEqual([
      "계약금",
      "중도금",
      "잔금",
    ]);
  });

  it("[AT-ZOD-06] 과점주주 설립 시 취득 (§7⑤) — route 경로 비과세 유지", () => {
    const body: AcquisitionTaxInput = {
      propertyType: "building",
      acquisitionCause: "deemed_major_shareholder",
      reportedPrice: 0,
      acquiredBy: "individual",
      deemedInput: {
        majorShareholder: {
          corporateAssetValue: 1_000_000_000,
          prevShareRatio: 0,
          newShareRatio: 1.0,
          isListed: false,
          isFoundingShare: true,
        },
      },
      balancePaymentDate: "2024-06-01",
    };

    const direct = calcAcquisitionTax(body);
    const viaRoute = calcViaRoute(body);

    // 수정 전에는 deemed 서브스키마에 isFoundingShare가 없어 strip → 20,000,000 과세
    expect(viaRoute.totalTax).toBe(direct.totalTax);
    expect(viaRoute.totalTax).toBe(0);
    expect(viaRoute.deemedDetail?.isSubjectToTax).toBe(false);
    // 비과세 조기 종료 시 근거는 deemedDetail.legalBasis에 담긴다
    expect(viaRoute.deemedDetail?.legalBasis).toContain("§7⑤");
  });

  it("[AT-ZOD-07] 지목변경 취득시기 날짜 — deemedInput 날짜 필드 통과 (안내 경고 생성)", () => {
    const body: AcquisitionTaxInput = {
      propertyType: "land",
      acquisitionCause: "deemed_land_category",
      reportedPrice: 0,
      acquiredBy: "individual",
      deemedInput: {
        landCategory: {
          prevCategory: "전",
          newCategory: "대",
          prevStandardValue: 100_000_000,
          newStandardValue: 250_000_000,
          actualChangeDate: "2024-05-10",
          registrationDate: "2024-05-01",
        },
      },
      balancePaymentDate: "2024-05-01", // 빠른 날 (lib/calc 변환과 동일 규칙)
    };

    const viaRoute = calcViaRoute(body);

    // 차액 1.5억 × 2% = 3,000,000 + 두 날짜 중 빠른 날 안내 경고
    expect(viaRoute.acquisitionTax).toBe(3_000_000);
    expect(viaRoute.acquisitionDate).toBe("2024-05-01");
    expect(viaRoute.warnings.join(" ")).toContain("빠른 날");
  });
});
