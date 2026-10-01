/**
 * anchor — OH-01 · 「소득세법 시행령」 §155① 일시적 2주택 **조정대상지역 처분기한 연혁**
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §3.1 · 리뷰 OH-01.
 *
 * | 구간 | 기준축 | 기한 | 근거 |
 * |---|---|---|---|
 * | 비조정 또는 한쪽만 조정 | — | 3년 | §155① 본문 |
 * | 조정→조정, 양도 < 2018-10-23 또는 신규 취득 ≤ 2018-09-13 | 양도일·신규취득일 | 3년 | 제29242호 부칙 제2조①② |
 * | 조정→조정, 신규 취득 2018-09-14 ~ | 신규취득일 | 2년 | 제29242호(MST 204914) |
 * | 조정→조정, 신규 취득 ≥ 2019-12-17 · 양도 2020-02-11 ~ 2022-05-09 | 둘 다 | 1년(+전입요건) | 제30395호 부칙 제15조 |
 * | 양도 2022-05-10 ~ 2023-01-11 | 양도일 | 2년 | 제32654호 부칙 제3조 |
 * | 양도 ≥ 2023-01-12 | 양도일 | 3년 | 제33267호 부칙 제8조 |
 *
 * ⚠️ 조정 여부의 **판정 대상·시점**(신규 취득 당시 종전·신규 모두 조정)은 A2b가 입력 경로를 만들었다
 *    (`temporary-two-house-regulated-move-in-a2b.anchor.test.ts`). 이 파일의 통합 케이스는 두 주택의
 *    조정 여부를 넣지 않으므로 **미입력 폴백**(양도일 기준 양도주택 = `isRegulatedArea`)으로 계산된다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import {
  resolveTemporaryTwoHouseDeadlineEra,
  temporaryTwoHouseEraInputRelevance,
} from "@/lib/tax-engine/data/temporary-two-house-deadline-era";
import { resolveRegulatedAtNewAcquisition } from "@/lib/tax-engine/transfer-tax-temporary-two-house-timing";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const d = (s: string) => new Date(s);

/** 종전 2015-01-01(경과규정 — 거주요건 면제) · 조정지역 · 5억 · 2주택 */
function tt(newAcq: string, transfer: string, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    householdHousingCount: 2,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    acquisitionDate: d("2015-01-01"),
    transferDate: d(transfer),
    residencePeriodMonths: 0,
    temporaryTwoHouse: { previousAcquisitionDate: d("2015-01-01"), newAcquisitionDate: d(newAcq) },
    ...over,
  });
}
const exempt = (i: TransferTaxInput) => calculateTransferTax(i, mockRates).isExempt;

describe("OH-01 leaf — 조정→조정 처분기한 연혁", () => {
  const era = (n: string, t: string, bothRegulated = true) =>
    resolveTemporaryTwoHouseDeadlineEra({
      bothRegulated,
      baseDeadlineYears: 3,
      newAcquisitionDate: d(n),
      transferDate: d(t),
    });

  it("비조정(또는 한쪽만 조정)은 모든 구간 3년", () => {
    for (const t of ["2018-10-23", "2021-06-01", "2022-09-01", "2024-06-01"]) {
      expect(era("2020-06-01", t, false)).toEqual({ years: 3, moveInRequirementPending: false });
    }
  });

  it("양도 2018-10-22 → 3년 / 2018-10-23 → 2년 (제29242호 부칙 제2조①)", () => {
    expect(era("2018-10-01", "2018-10-22").years).toBe(3);
    expect(era("2018-10-01", "2018-10-23").years).toBe(2);
  });

  it("신규 취득 2018-09-13 → 3년 / 2018-09-14 → 2년 (제29242호 부칙 제2조②1호)", () => {
    expect(era("2018-09-13", "2019-06-01").years).toBe(3);
    expect(era("2018-09-14", "2019-06-01").years).toBe(2);
  });

  it("신규 취득 2019-12-16 → 2년 / 2019-12-17 → 1년·전입요건 미판정 (제30395호 부칙 제15조)", () => {
    expect(era("2019-12-16", "2021-06-01")).toEqual({ years: 2, moveInRequirementPending: false });
    expect(era("2019-12-17", "2021-06-01")).toEqual({ years: 1, moveInRequirementPending: true });
  });

  it("양도 2020-02-10 → 2년(제29242호 체제) / 2020-02-11 → 1년 (제30395호 부칙 제15조①)", () => {
    expect(era("2019-12-20", "2020-02-10").years).toBe(2);
    expect(era("2019-12-20", "2020-02-11").years).toBe(1);
  });

  it("양도 2022-05-09 → 1년 / 2022-05-10 → 2년 (제32654호 부칙 제3조)", () => {
    expect(era("2020-06-01", "2022-05-09").years).toBe(1);
    expect(era("2020-06-01", "2022-05-10")).toEqual({ years: 2, moveInRequirementPending: false });
  });

  it("양도 2023-01-11 → 2년 / 2023-01-12 → 3년 (제33267호 부칙 제8조)", () => {
    expect(era("2020-09-01", "2023-01-11").years).toBe(2);
    expect(era("2020-09-01", "2023-01-12").years).toBe(3);
  });

  describe("2026 개정(제36737호) — §155①1호 2년·2호 3년", () => {
    it("양도 2026-09-30(시행 전) → 3년 / 2026-10-01(시행) → 2년 — 신규취득 2026-08-10", () => {
      expect(era("2026-08-10", "2026-09-30").years).toBe(3);
      expect(era("2026-08-10", "2026-10-01")).toEqual({ years: 2, moveInRequirementPending: false });
    });

    it("신규 취득 2026-08-03 → 3년 / 2026-08-04 → 2년 (부칙 제2조①·②1호) — 양도 2027-01-01", () => {
      expect(era("2026-08-03", "2027-01-01").years).toBe(3);
      expect(era("2026-08-04", "2027-01-01")).toEqual({ years: 2, moveInRequirementPending: false });
    });

    it("계약일 2026-08-03(취득일은 그 뒤) → 3년 — 부칙 제2조②2호(min(취득,계약) 재사용)", () => {
      expect(
        resolveTemporaryTwoHouseDeadlineEra({
          bothRegulated: true,
          baseDeadlineYears: 3,
          newAcquisitionDate: new Date("2026-09-01"),
          newContractDate: new Date("2026-08-03"),
          transferDate: new Date("2027-01-01"),
        }).years,
      ).toBe(3);
    });

    it("긍정 짝 — 조정→비조정(한쪽만 조정)이면 신규취득 2026-08-10이어도 3년 (양도 2027-01-01)", () => {
      expect(era("2026-08-10", "2027-01-01", false).years).toBe(3);
    });

    it("긍정 짝 — 신규취득이 2025년(기준일 전)이면 양도가 2026-10-01 이후여도 3년", () => {
      expect(era("2025-06-01", "2026-10-01").years).toBe(3);
    });
  });

  describe("UI 게이트 temporaryTwoHouseEraInputRelevance — 2026 구간도 연다", () => {
    it("양도 2026-09-30 → regulatedAxis 닫힘 / 2026-10-01 → 열림", () => {
      const at = (t: string) =>
        temporaryTwoHouseEraInputRelevance({
          newAcquisitionDate: d("2026-08-10"),
          transferDate: d(t),
        }).regulatedAxis;
      expect(at("2026-09-30")).toBe(false);
      expect(at("2026-10-01")).toBe(true);
    });

    it("2026-10-01 이후에도 2023-01-12~2026-09-30 구간은 여전히 닫혀 있다(그 사이 본문 3년 고정 구간)", () => {
      expect(
        temporaryTwoHouseEraInputRelevance({
          newAcquisitionDate: d("2024-01-01"),
          transferDate: d("2024-06-01"),
        }).regulatedAxis,
      ).toBe(false);
    });
  });
});

describe("OH-01 통합 — 비과세 판정이 연혁 기한을 따른다", () => {
  it("★ 리뷰 실패 시나리오: 신규 2020-06-01 · 양도 2022-09-01 → 2년 도과 → 과세", () => {
    expect(exempt(tt("2020-06-01", "2022-09-01"))).toBe(false);
  });

  it("같은 입력의 2년 이내(2022-05-31) 양도는 비과세 (긍정 짝)", () => {
    expect(exempt(tt("2020-06-01", "2022-05-31"))).toBe(true);
  });

  it("양도 2023-01-11 과세 / 2023-01-12 비과세 (신규 2020-09-01 — 2년 도과·3년 이내)", () => {
    expect(exempt(tt("2020-09-01", "2023-01-11"))).toBe(false);
    expect(exempt(tt("2020-09-01", "2023-01-12"))).toBe(true);
  });

  it("양도 2022-05-09 과세(1년) / 2022-05-10 비과세(2년) — 신규 2020-06-01", () => {
    expect(exempt(tt("2020-06-01", "2022-05-09"))).toBe(false);
    expect(exempt(tt("2020-06-01", "2022-05-10"))).toBe(true);
  });

  it("신규 취득 2019-12-16 비과세(2년) / 2019-12-17 과세(1년) — 양도 2021-06-01", () => {
    expect(exempt(tt("2019-12-16", "2021-06-01"))).toBe(true);
    expect(exempt(tt("2019-12-17", "2021-06-01"))).toBe(false);
  });

  it("신규 취득 2018-09-13 비과세(3년) / 2018-09-14 과세(2년) — 양도 2021-06-01", () => {
    expect(exempt(tt("2018-09-13", "2021-06-01"))).toBe(true);
    expect(exempt(tt("2018-09-14", "2021-06-01"))).toBe(false);
  });

  it("비조정이면 같은 날짜도 3년 — 양도 2022-09-01 비과세", () => {
    expect(
      exempt(tt("2020-06-01", "2022-09-01", { isRegulatedArea: false, wasRegulatedAtAcquisition: false })),
    ).toBe(true);
  });
});

describe("2026 개정(제36737호) 통합 — 비과세 판정이 2년 기한을 따른다", () => {
  /** 조정→조정, 신규 2026-08-10, 양도 2029-07-10(신규취득일부터 2년 11개월 후 — 2년 초과·3년 이내) */
  function case2026(transfer: string) {
    return tt("2026-08-10", transfer);
  }

  it("★ 2026 개정 리뷰 시나리오 — 신규 2026-08-10 · 양도 2029-07-10 → 2년 도과 → 과세(개정 전 비과세였다)", () => {
    const result = calculateTransferTax(case2026("2029-07-10"), mockRates) as ReturnType<
      typeof calculateTransferTax
    > & { determinedTax: number };
    // 개정 전(research probe 실측) determinedTax = 0(비과세) → 개정 후 과세로 전환되어야 한다.
    expect(result.isExempt).toBe(false);
    expect(result.determinedTax).toBeGreaterThan(0);
  });

  it("긍정 짝 — 같은 입력의 2년 이내(2028-08-09) 양도는 비과세", () => {
    expect(exempt(case2026("2028-08-09"))).toBe(true);
  });

  it("긍정 짝 — 조정→비조정이면 신규 2026-08-10·양도 2029-07-10도 비과세(본문 3년)", () => {
    expect(
      exempt(tt("2026-08-10", "2029-07-10", { isRegulatedArea: false, wasRegulatedAtAcquisition: false })),
    ).toBe(true);
  });

  it("조정대상지역 공고일 이전 계약 → 3년(부칙 제2조②2호) — 신규취득 2026-08-10·계약 2026-06-01, 신규주택 코드 41310(공고일 2026-07-01)", () => {
    // resolveRegulatedAtNewAcquisition이 공고일 이전 계약 제외를 적용해 next=false → bothRegulated=false → 3년.
    const base = tt("2026-08-10", "2029-07-10", {
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date("2015-01-01"),
        newAcquisitionDate: new Date("2026-08-10"),
        newHouseRegionCode: "41310",
        newHouseRegulatedAtAcquisition: true,
        newHouseContractDate: new Date("2026-06-01"),
      },
    });
    const reg = resolveRegulatedAtNewAcquisition(base);
    expect(reg.bothRegulated).toBe(false);
    expect(exempt(base)).toBe(true);
  });
});
