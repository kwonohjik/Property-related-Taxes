/**
 * D9 — 합가(동거봉양·혼인) 중과배제 × 소득세법 시행령 §167의10①15호·§167의3①13호 Pre-Do anchor.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §1 · §7.
 *
 * 15호(3주택 이상은 §167의3①13호 동문) 2요소:
 *   ① 「제155조…에 따라 1세대1주택으로 보아 제154조제1항이 적용되는 주택」 — §155④(동거봉양)·⑤(혼인):
 *      합침으로써 **1세대가 2주택**을 보유하게 된 경우, 합친 날부터 10년 이내에 **먼저 양도하는 주택**.
 *   ② 「같은 항의 요건을 모두 충족하는 주택」 — §154① 보유·거주.
 * 2023-02-28 전 양도분(2주택)은 구 §167의10①5호(동거봉양)·6호(혼인) — §154① 요건이 없다.
 * 합가(혼인) 전 **또는 당일** 취득: 서면-2023-부동산-0231 · 부동산거래관리과-410.
 * 먼저 양도는 토글 필수(Q-5) — 비과세 E-3.5와 같은 술어.
 *
 * 세율은 프로덕션 fallback(loadFallbackTransferRates). 2022-05-10~2026-05-09 양도분은 중과 유예
 * (§167의10①12호의2, 보유 2년 이상)로 세액이 같아지므로 그 구간은 배제 사유로 단언한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";
import { resolveMergeDeeming } from "@/lib/tax-engine/transfer-tax-exemption-requirements";

const house = (id: string, acq: string) => ({
  id,
  acquisitionDate: new Date(acq),
  officialPrice: 300_000_000,
  region: "capital" as const,
  regionCode: "11680",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
});

/** 조정지역(강남구) 8억 양도. n=2면 [양도, 2012 취득], n=3이면 [양도, 2012, 2013]. */
function households(
  n: 2 | 3,
  transferDate: string,
  acq: string,
  extra: Partial<TransferTaxInput> = {},
): TransferTaxInput {
  const others = n === 2 ? [house("h2", "2012-01-01")] : [house("h2", "2012-01-01"), house("h3", "2013-01-01")];
  return baseTransferInput({
    transferPrice: 800_000_000,
    acquisitionDate: new Date(acq),
    transferDate: new Date(transferDate),
    isRegulatedArea: true,
    householdHousingCount: n,
    houses: [house("selling", acq), ...others] as TransferTaxInput["houses"],
    sellingHouseId: "selling",
    ...extra,
  });
}

const PC = (d: string, first = true): Partial<TransferTaxInput> => ({
  parentalCareMerge: { mergeDate: new Date(d) },
  isFirstTransferredInMerge: first,
});
const MM = (d: string, first = true): Partial<TransferTaxInput> => ({
  marriageMerge: { marriageDate: new Date(d) },
  isFirstTransferredInMerge: first,
});

function calc(input: TransferTaxInput) {
  return calculateTransferTax(input, loadFallbackTransferRates(input.transferDate));
}
function reasons(input: TransferTaxInput): string[] {
  return (calc(input).multiHouseSurchargeEvaluation?.exclusionReasons ?? []).map((e) => e.type);
}

/** T1: 2018 조정지역 취득 · 거주 0 → §154① 미충족(보유 2년 이상). */
const T1 = (d: string) => households(2, d, "2018-01-01", { residencePeriodMonths: 0, wasRegulatedAtAcquisition: true });
/** T2: T1 + 거주 36개월 → §154① 충족 (긍정 짝). */
const T2 = (d: string) => households(2, d, "2018-01-01", { residencePeriodMonths: 36, wasRegulatedAtAcquisition: true });

describe("D9 합가 중과배제 — §167의10①15호·§167의3①13호", () => {
  it("D9-A1 3주택 + 동거봉양: §155④는 「2주택이 되는 경우」 → 배제 없음(3주택 중과)", () => {
    const s = households(3, "2026-08-01", "2015-01-01", { residencePeriodMonths: 48 });
    const pc = calc({ ...s, ...PC("2022-01-01") });
    expect(pc.totalTax).toBe(354_541_000);
    // Q-4: 3주택 이상 합가 특례 중첩은 모델링하지 않는다 — 결과에 한계를 남긴다.
    expect(pc.multiHouseSurchargeEvaluation?.warnings.some((w) => w.includes("합가 특례"))).toBe(true);
    // 형제 경로 회귀: 혼인도 3주택이면 배제 없음(⑨ 차감 없는 입력)
    expect(calc({ ...s, ...MM("2022-01-01") }).totalTax).toBe(354_541_000);
  });

  it("D9-A2 2주택 + 동거봉양 · §154① 미충족 → 배제 없음(2주택 중과)", () => {
    expect(calc({ ...T1("2026-08-01"), ...PC("2022-01-01") }).totalTax).toBe(299_816_000);
  });

  it("D9-A2+ 긍정 짝: §154① 충족 + 먼저 양도 → 8억은 비과세(E-3.5) · 15억은 부분 비과세 + 중과 배제", () => {
    for (const m of [PC("2022-01-01"), MM("2022-01-01")]) {
      const r = calc({ ...T2("2026-08-01"), ...m });
      expect(r.isExempt).toBe(true);
      expect(r.totalTax).toBe(0);
    }
    const hv = { ...T2("2026-08-01"), transferPrice: 1_500_000_000 };
    expect(calc({ ...hv, ...PC("2022-01-01") }).totalTax).toBe(33_797_500);
    expect(calc({ ...hv, ...MM("2022-01-01") }).totalTax).toBe(33_797_500);
  });

  it("D9-A3 합가(혼인) **후** 취득한 주택 양도 → §155④⑤ 불성립 → 배제 없음", () => {
    const s = households(2, "2026-08-01", "2023-01-01", { residencePeriodMonths: 36, wasRegulatedAtAcquisition: true });
    expect(calc({ ...s, ...PC("2022-01-01") }).totalTax).toBe(299_816_000);
    expect(calc({ ...s, ...MM("2022-01-01") }).totalTax).toBe(299_816_000);
  });

  it("D9-A4 합가일부터 정확히 10년 되는 날 양도 → 10년 이내(경계 포함) 배제 · 다음 날은 배제 없음 (15억)", () => {
    const hv = { transferPrice: 1_500_000_000, residencePeriodMonths: 60 };
    const at = households(2, "2026-08-01", "2010-01-01", hv);
    expect(calc({ ...at, ...PC("2016-08-01") }).totalTax).toBe(19_013_498);
    expect(calc({ ...at, ...MM("2016-08-01") }).totalTax).toBe(19_013_498);
    const after = households(2, "2026-08-02", "2010-01-01", hv);
    expect(calc({ ...after, ...PC("2016-08-01") }).totalTax).toBe(520_228_500);
    expect(calc({ ...after, ...MM("2016-08-01") }).totalTax).toBe(520_228_500);
  });

  it("D9-A5 시점축: 2023-02-27 양도(구 5호 — §154① 요건 없음) 배제 / 2023-02-28(15호) 배제 없음", () => {
    // 유예 구간이라 세액은 같다 — 배제 사유로 단언한다.
    expect(reasons({ ...T1("2023-02-27"), ...PC("2022-01-01") })).toContain("parental_care_merge");
    expect(reasons({ ...T1("2023-02-28"), ...PC("2022-01-01") })).not.toContain("parental_care_merge");
    expect(reasons({ ...T1("2023-02-27"), ...MM("2022-01-01") })).toContain("marriage_merge");
    expect(reasons({ ...T1("2023-02-28"), ...MM("2022-01-01") })).not.toContain("marriage_merge");
  });

  it("D9-A6 취득일 = 합가일(서면-2023-부동산-0231) → 비과세 E-3.5 성립 · 중과 배제 유지", () => {
    const s = households(2, "2026-08-01", "2019-08-23", { residencePeriodMonths: 48 });
    const pc = calc({ ...s, ...PC("2019-08-23") });
    expect(pc.isExempt).toBe(true);
    expect(pc.totalTax).toBe(0);
    const mm = calc({ ...s, ...MM("2019-08-23") });
    expect(mm.isExempt).toBe(true);
    expect(mm.totalTax).toBe(0);
  });

  it("D9-A7 비과세·중과 일관성: 동거봉양 · §154① 미충족 → 비과세 거부 + 중과 배제 없음(합가 없음과 같은 세액)", () => {
    const s = { ...T1("2026-08-01"), transferPrice: 1_000_000_000 };
    const withMerge = calc({ ...s, ...PC("2022-01-01") });
    expect(withMerge.isExempt).toBe(false);
    expect(withMerge.multiHouseSurchargeEvaluation?.exclusionReasons.map((e) => e.type)).not.toContain(
      "parental_care_merge",
    );
    expect(withMerge.totalTax).toBe(calc(s).totalTax);
  });

  it("D9-A8 먼저 양도 토글 미체크(Q-5) → 혼인·동거봉양 모두 배제 없음", () => {
    expect(calc({ ...T2("2026-08-01"), ...MM("2022-01-01", false) }).totalTax).toBe(299_816_000);
    expect(calc({ ...T2("2026-08-01"), ...PC("2022-01-01", false) }).totalTax).toBe(299_816_000);
  });
});

describe("resolveMergeDeeming — §155④⑤ 합가 의제 정본(비과세 E-3.5 · 중과 15호 공용)", () => {
  const base = {
    householdHousingCount: 2,
    parentalCareMerge: { mergeDate: new Date("2016-08-01") },
    isFirstTransferredInMerge: true,
    acquisitionDate: new Date("2010-01-01"),
    transferDate: new Date("2020-01-01"),
  };
  it("성립 — 2주택 · 먼저 양도 · 합가 전 취득 · 10년 이내", () => {
    expect(resolveMergeDeeming(base)).toBe("parental_care_merge");
  });
  it("주택 수가 2가 아니면 불성립(§155④ 「2주택을 보유하게 되는 경우」)", () => {
    expect(resolveMergeDeeming({ ...base, householdHousingCount: 3 })).toBeUndefined();
    expect(resolveMergeDeeming({ ...base, householdHousingCount: 1 })).toBeUndefined();
  });
  it("먼저 양도 미선언이면 불성립(Q-5)", () => {
    expect(resolveMergeDeeming({ ...base, isFirstTransferredInMerge: false })).toBeUndefined();
    expect(resolveMergeDeeming({ ...base, isFirstTransferredInMerge: undefined })).toBeUndefined();
  });
  it("취득일 = 합가일은 성립, 다음 날 취득은 불성립(서면-2023-부동산-0231)", () => {
    expect(resolveMergeDeeming({ ...base, acquisitionDate: new Date("2016-08-01") })).toBe("parental_care_merge");
    expect(resolveMergeDeeming({ ...base, acquisitionDate: new Date("2016-08-02") })).toBeUndefined();
  });
  it("합가일부터 정확히 10년 되는 날은 성립, 다음 날은 불성립", () => {
    expect(resolveMergeDeeming({ ...base, transferDate: new Date("2026-08-01") })).toBe("parental_care_merge");
    expect(resolveMergeDeeming({ ...base, transferDate: new Date("2026-08-02") })).toBeUndefined();
  });
  it("합가 전 양도는 불성립", () => {
    expect(resolveMergeDeeming({ ...base, transferDate: new Date("2016-07-31") })).toBeUndefined();
  });
  it("혼인·동거봉양 입력이 둘 다 있으면 혼인을 먼저 본다(종전 E-3.5 순서)", () => {
    expect(
      resolveMergeDeeming({ ...base, marriageMerge: { marriageDate: new Date("2016-08-01") } }),
    ).toBe("marriage_merge");
  });
});
