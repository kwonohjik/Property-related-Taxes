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
import { resolveTemporaryTwoHouseDeadlineEra } from "@/lib/tax-engine/data/temporary-two-house-deadline-era";
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
