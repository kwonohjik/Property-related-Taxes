/**
 * anchor: 취득세 주택 수 — 혼인 전 주택분양권으로 취득 시 배우자 주택 · 2023.3.14. 전 취득분 (PR #1839 후속)
 *
 * 연혁 (DRF 시행본 대조 2026-09-30):
 *  - §28의4⑤6호 신설 = 대통령령 제33325호(2023.3.14. 공포·시행, MST 248737). 그 직전 시행본
 *    (제33308호, 2023.2.28. 시행, MST 248313) ⑤는 1~4호뿐 — 배우자 주택 제외 규정이 없었다.
 *  - 부칙<제33325호> 제2조: 「제28조의2부터 제28조의4까지 … 의 개정규정은 이 영 시행 이후 납세의무가
 *    성립하는 분부터 적용한다.」 → 2023.3.13. 이전 취득에는 6호가 없다.
 *  - 2024.3.26. 항 신설로 ⑥6호(현행 MST 288831) — 문언 동일. 기한 없음.
 *
 * 2023.3.14. 전에 적용된 것 — **§28의4① 후단**(권리취득일 기준 세대별 주택 수):
 *  - 조심 2023지4299(2024.3.5., 취소): 2020.9.23. 분양계약 → 2021.3.10. 혼인 → 2023.1.30. 취득.
 *    「주택분양권의 취득일(분양계약일)을 기준으로 해당 주택 취득 시의 세대별 주택 수를 산정」 —
 *    분양계약일 현재 청구인 세대는 종전주택만 보유 → 1세대 3주택으로 볼 수 없다(조심 2022지890 등 다수).
 *  - 조심 2023지3598(2024.3.14., 취소): 같은 취지(2021.5.12. 계약 → 2022.5.20. 혼인 → 2023.1.20. 취득).
 *  - 처분청(행정안전부 적용요령)은 「혼인 전 취득한 분양권으로 주택 취득시, 배우자의 주택도 주택 수에
 *    포함」이 개정 전이라고 보았으나 심판원이 받아들이지 않았다.
 *  ⇒ 소급 산정(대통령령 제30939호 부칙 제2조 — 2020.8.12. 이후 취득한 권리)이 적용되는 경우에만
 *    권리취득일 현재 세대에 없던 배우자의 주택을 뺀다. 2020.8.12. 전 권리는 소급이 없어 주택 취득일
 *    현재 세대(배우자 포함)로 센다.
 *
 * 변경 전 실측(base b49826f8): 조심 2023지4299 사실관계(비조정 · 5억) → 3주택 8% 40,000,000.
 */

import { describe, it, expect } from "vitest";
import { INITIAL_FORM, createOwnedHouseInfo, type FormState } from "@/components/calc/acquisition/shared";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import { acquisitionTaxInputSchema } from "@/lib/validators/acquisition-input";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";
import { calculateHouseCount } from "@/lib/tax-engine/house-count/index";
import { resolvePreMarriageSpouseHouseEra } from "@/lib/tax-engine/data/pre-marriage-spouse-house-era";
import { ACQUISITION } from "@/lib/tax-engine/legal-codes";

describe("[PM-ERA] era leaf", () => {
  it("[PM-ERA-01] 2023.3.14. 이후 취득 → ⑥6호", () => {
    expect(resolvePreMarriageSpouseHouseEra("2023-03-14", true)).toBe("statute_6ho");
    expect(resolvePreMarriageSpouseHouseEra("2023-03-14", false)).toBe("statute_6ho");
  });
  it("[PM-ERA-02] 2023.3.13. 이전 취득 · 소급 산정 → 권리취득일 현재 세대", () => {
    expect(resolvePreMarriageSpouseHouseEra("2023-03-13", true)).toBe("right_date_household");
  });
  it("[PM-ERA-03] 2023.3.13. 이전 취득 · 소급 없음(2020.8.12. 전 권리) → 제외 근거 없음", () => {
    expect(resolvePreMarriageSpouseHouseEra("2023-03-13", false)).toBe("none");
  });
});

function spouseCase(over: { right: string; marriage: string; acq: string; spouseHouse?: string }) {
  return calculateHouseCount({
    houses: [
      { id: "A", standardValue: 300_000_000, type: "housing", acquisitionDate: "2015-01-01", isMetropolitan: true },
      { id: "B", standardValue: 300_000_000, type: "housing", acquisitionDate: over.spouseHouse ?? "2018-01-01", isMetropolitan: true, ownedBySpouse: true },
    ],
    rights: [],
    offices: [],
    pendingAcquisition: {
      isMetropolitan: true,
      acquisitionValue: 500_000_000,
      acquiredViaRight: true,
      rightAcquisitionDate: over.right,
      viaPreMarriageSubscriptionRight: true,
      marriageDate: over.marriage,
    },
    referenceDate: over.acq,
  });
}

describe("[PM] 엔진 — 2023.3.14. 전 취득", () => {
  it("[PM-01] 🔴 소급 산정 · 권리취득 후 혼인 → 배우자 주택은 권리취득일 현재 세대 밖 → 제외 (2)", () => {
    const r = spouseCase({ right: "2021-05-01", marriage: "2022-01-10", acq: "2023-03-13" });
    expect(r.effectiveCount).toBe(2);
    expect(r.excludedDetails.map((e) => `${e.assetId}:${e.reason}`)).toEqual(["B:spouse_not_in_household_at_right_date"]);
    expect(r.excludedDetails[0].legalBasis).toBe(ACQUISITION.HOUSE_COUNT_RIGHT_ACQUISITION_DATE);
    expect(r.excludedDetails[0].description).toContain("조심 2023지4299");
  });

  it("[PM-02] 긍정 짝 — 2020.8.12. 전 권리(소급 없음) → 주택 취득일 현재 세대로 산정 → 산입 (3) + 고지", () => {
    const r = spouseCase({ right: "2019-05-01", marriage: "2020-01-01", acq: "2023-03-13" });
    expect(r.effectiveCount).toBe(3);
    expect(r.warnings.some((w) => w.includes("2023.3.14. 전"))).toBe(true);
  });

  it("[PM-03] 2023.3.14. 취득 → ⑥6호 (종전과 같음)", () => {
    const r = spouseCase({ right: "2021-05-01", marriage: "2022-01-10", acq: "2023-03-14" });
    expect(r.excludedDetails.map((e) => e.reason)).toEqual(["spouse_pre_marriage_house"]);
  });

  it("[PM-04] 배우자 주택이 혼인 후 취득이어도 권리취득일 뒤라 이미 제외(기준일 뒤 취득) — 이중 제외 없음", () => {
    const r = spouseCase({ right: "2021-05-01", marriage: "2022-01-10", acq: "2023-01-30", spouseHouse: "2022-06-01" });
    expect(r.excludedDetails.map((e) => e.reason)).toEqual(["acquired_after_reference_date"]);
    expect(r.effectiveCount).toBe(2);
  });
});

describe("[PM] 폼 → 빌더 → Zod → 엔진 — 조심 2023지4299 사실관계", () => {
  function form(over: Partial<FormState> = {}): FormState {
    return {
      ...INITIAL_FORM,
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquiredBy: "individual",
      reportedPrice: "500000000",
      standardValue: "500000000",
      isRegulatedArea: false,
      isMetropolitanRegion: true,
      houseCountAfter: "3",
      balancePaymentDate: "2023-01-30",
      acquiredViaRight: true,
      rightAcquisitionDate: "2020-09-23",
      acquiredViaPreMarriageRight: true,
      marriageDate: "2021-03-10",
      ownedHouses: [
        { ...createOwnedHouseInfo("own"), standardValue: "300000000", acquisitionDate: "2019-01-01", isMetropolitanRegion: true },
        { ...createOwnedHouseInfo("spouse"), standardValue: "300000000", acquisitionDate: "2019-06-01", isMetropolitanRegion: true, ownedBySpouse: true },
      ],
      ...over,
    };
  }
  const calc = (f: FormState) => {
    const parsed = acquisitionTaxInputSchema.safeParse(buildAcquisitionTaxBody(f));
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("unreachable");
    return calcAcquisitionTax(parsed.data);
  };

  it("[PM-05] 🔴 비조정 → 2주택 1% 5,000,000 (종전 3주택 8% 40,000,000)", () => {
    const r = calc(form());
    expect(r.houseCountDetail?.effectiveCount).toBe(2);
    expect(r.acquisitionTax).toBe(5_000_000);
  });

  it("[PM-06] 긍정 짝 — 혼인 전 분양권 표시가 꺼져 있으면 배우자 주택 산입 (3주택 8%)", () => {
    expect(calc(form({ acquiredViaPreMarriageRight: false })).acquisitionTax).toBe(40_000_000);
  });
});
