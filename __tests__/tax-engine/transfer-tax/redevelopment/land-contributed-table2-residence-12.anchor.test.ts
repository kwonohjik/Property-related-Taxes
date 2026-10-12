/**
 * #12 후속 anchor — 토지만 출자한 원조합원 완공APT의 **장기보유특별공제 표2 거주월수**도 신축주택 거주만 센다.
 *
 * 결정 #12 조건: 「준공 전 거주는 보유기간 중 거주로 세지 않는다(토지 출자자의 거주월수·거주 상한을 승계조합원과 같게 적용)」.
 * 「소득세법 시행령」 §154①(「그 보유기간 중 거주기간」)과 §159의4(같은 문언)는 같은 사실을 요구한다(OH-48 단일 소스).
 * #2117은 비과세 판정 번역(`translateRedevAptForHousingJudgment`)만 신축 거주로 바꾸고, 표2(`computeRedevelopmentLthd` ·
 * `redevUsesTable2` — §97의4① 단서)는 종전 거주 + 신축 거주를 그대로 더했다. 화면은 토지 출자에서 종전 거주 칸을 숨기고 ④가 보내지 않아
 * 맞았지만, API로 종전 거주를 보내면 두 판정이 다른 거주월수를 봤다.
 *
 * 시료(mock 세율): 토지 2005-01-01 · 인가 2016-03-01 · 사용승인 2019-06-01 · 양도 2024-06-01 · 15억 · 비조정 · 1세대1주택.
 *
 * | 입력(종전 / 신축 거주) | 토지 출자 전 | 토지 출자 후 | 주택 출자(불변) |
 * |---|---|---|---|
 * | 36 / 12 | 36,966,739 (표2 56%) | 55,584,069 (표1 = 신축 12개월만) | 36,966,739 |
 * | 36 / 30 | 27,029,160 (표2 60%) | 35,081,844 (= 0 / 30) | 27,029,160 |
 *
 * 표시(결과 카드 `lthdResidenceAttribution` · 신고서 분기별 거주기간)도 같은 규칙 — 종전에는 「거주 48개월(종전+신축 통산) → 표1」처럼
 * 적용 공제율과 어긋난 값을 보였다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { isLandContributedNewBuild, redevUsesTable2, resolveAptResidenceMonths } from "@/lib/tax-engine/redevelopment-lthd";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

function apt(origin: "land" | "housing", prior: number | undefined, nw: number | undefined): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 1_500_000_000,
    transferDate: D("2024-06-01"),
    acquisitionDate: D("2005-01-01"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: D("2016-03-01"),
      rightsValue: 250_000_000,
      settlementDirection: "pay",
      settlementAmount: 136_000_000,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: origin,
      completionDate: D("2019-06-01"),
      ...(prior !== undefined ? { priorHouseResidenceMonths: prior } : {}),
      ...(nw !== undefined ? { newHouseResidenceMonths: nw } : {}),
    } as RedevelopmentInfo,
  } as Partial<TransferTaxInput>);
}

const tax = (i: TransferTaxInput) => calculateTransferTax(i, rates).totalTax;

describe("#12 후속 — 토지 출자 원조합원 표2 거주월수 = 신축 거주만", () => {
  it("★ 종전 36 + 신축 12 — 종전 거주를 세지 않아 표1 (전 36,966,739 표2 56% → 후 55,584,069)", () => {
    expect(tax(apt("land", 36, 12))).toBe(55_584_069);
    expect(tax(apt("land", 36, 12))).toBe(tax(apt("land", undefined, 12)));
  });

  it("★ 종전 36 + 신축 30 — 신축 30개월만으로 표2 (전 27,029,160 → 후 35,081,844 = 종전 0 + 신축 30)", () => {
    expect(tax(apt("land", 36, 30))).toBe(35_081_844);
    expect(tax(apt("land", 36, 30))).toBe(tax(apt("land", 0, 30)));
  });

  it("장기보유공제 단계 공제율도 신축 거주만으로 산정된다 (인가전 분 48% = 보유 40% + 거주 2년 8%)", () => {
    const r = calculateTransferTax(apt("land", 36, 30), rates);
    const pre = r.steps.find((s) => s.label.includes("인가전 분 장기보유공제"))?.formula ?? "";
    expect(pre).toContain("× 48%");
  });

  it("대조 — 주택 출자 원조합원은 §154⑧1호 통산(prior + new) 그대로", () => {
    expect(tax(apt("housing", 36, 12))).toBe(36_966_739);
    expect(tax(apt("housing", 36, 30))).toBe(27_029_160);
  });

  it("★ redevUsesTable2(§97의4① 단서 · 표2 여부) — 토지 출자 종전 36 + 신축 12는 표2 아님 / 주택 출자는 표2", () => {
    const t2 = (origin: "land" | "housing", prior: number, nw: number) =>
      redevUsesTable2({ redevelopment: apt(origin, prior, nw).redevelopment!, isOneHouseSingle: true, residencePeriodMonths: 0 });
    expect(t2("land", 36, 12)).toBe(false);
    expect(t2("land", 0, 30)).toBe(true);
    expect(t2("housing", 36, 12)).toBe(true);
  });

  it("★ 표시도 적용 공제율과 같은 거주월수 — 결과 카드 귀속 메타 · 신고서 분기별 거주기간 (종전 36은 보이지 않는다)", () => {
    const withDates = apt("land", 36, 12);
    withDates.redevelopment = {
      ...withDates.redevelopment!,
      priorResidenceStartDate: "2006-01-01",
      priorResidenceEndDate: "2009-01-01",
    } as RedevelopmentInfo;
    const d = calculateTransferTax(withDates, rates).redevelopmentDetail!;
    expect(d.lthdResidenceAttribution?.existingResidenceMonths).toBe(12);
    expect(d.lthdResidenceAttribution?.existingTable).toBe("table1");
    expect(d.lthdResidenceAttribution?.priorPeriod).toBeUndefined();
    expect(d.preApproval.residenceMonths).toBeUndefined();
    expect(d.preApproval.residenceStartDate).toBeUndefined();
    expect(d.postApprovalExistingHouse.residenceMonths).toBe(12);
    // 대조 — 주택 출자는 통산 표시 그대로
    const h = calculateTransferTax(apt("housing", 36, 12), rates).redevelopmentDetail!;
    expect(h.lthdResidenceAttribution?.existingResidenceMonths).toBe(48);
    expect(h.preApproval.residenceMonths).toBe(36);
    expect(h.postApprovalExistingHouse.residenceMonths).toBe(48);
  });

  it("leaf — 술어와 거주월수 규칙", () => {
    const land = apt("land", 36, 12).redevelopment!;
    expect(isLandContributedNewBuild(land)).toBe(true);
    expect(isLandContributedNewBuild({ ...land, originalAssetType: "housing" })).toBe(false);
    expect(isLandContributedNewBuild({ ...land, isSuccessorMember: true })).toBe(false);
    expect(isLandContributedNewBuild({ ...land, completionDate: undefined })).toBe(false);
    // 신축 거주 칸이 비면 Step4 거주값(승계조합원과 같은 fallback)
    expect(resolveAptResidenceMonths({ isSuccessorMember: true, priorHouseResidenceMonths: 36, residencePeriodMonths: 20 })).toBe(20);
  });
});
