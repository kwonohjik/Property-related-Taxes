/**
 * #12 anchor — **세대원 건물 출자 통산** (사용자 결정 2026-10-13).
 *
 * 토지만 출자한 원조합원 완공APT에서 같은 세대의 세대원이 철거된 기존 건물을 소유했으면, 그 건물의 보유·거주기간을
 * §154① **비과세** 보유·거주 요건에 통산한다.
 *   · 보유 기산일: 사용승인일 → 세대원 건물 취득일
 *   · 거주월수: 신축 거주 + 세대원 건물 거주
 *   · 통산하지 않는 것: 「취득 당시」 조정대상지역 판정일(사용승인일) · 장기보유특별공제 공제율(조심 2025서3843 · 재산세제과-37 · 법규과-1721)
 *
 * 시료(mock 세율): 서울 강남(1168010100 — 2017-08-03~ 조정) · 토지 2005-01-01 · 인가 2017-09-01 · 사용승인 2023-03-15 ·
 * 양도 2024-05-20(사용승인 후 1년 2개월) · 15억 · 1세대1주택. 사용승인일 조정 → 거주 2년 필요 · 보유 2년 필요.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { translateRedevAptForHousingJudgment } from "@/lib/tax-engine/one-house/redev-apt-judgment-input";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

function apt(
  hb: RedevelopmentInfo["householdBuilding"] | undefined,
  rOver: Partial<RedevelopmentInfo> = {},
  over: Partial<TransferTaxInput> = {},
): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 1_500_000_000,
    transferDate: D("2024-05-20"),
    acquisitionDate: D("2005-01-01"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    regionCode: "1168010100",
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: D("2017-09-01"),
      rightsValue: 250_000_000,
      settlementDirection: "pay",
      settlementAmount: 136_000_000,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "land",
      completionDate: D("2023-03-15"),
      newHouseResidenceMonths: 12,
      ...(hb ? { householdBuilding: hb } : {}),
      ...rOver,
    } as RedevelopmentInfo,
    ...over,
  } as Partial<TransferTaxInput>);
}

const calc = (i: TransferTaxInput) => calculateTransferTax(i, rates);
const warn = (r: { warnings?: string[] }) => (r.warnings ?? []).join("\n");
const NOTICE = /세대원 건물 출자 통산을 적용했습니다/;
const pct = (n: number | undefined) => Math.round((n ?? 0) * 100);

describe("#12 세대원 건물 출자 통산 — 보유·거주", () => {
  it("대조 — 통산 없음: 보유 1년 2개월 · 거주 12개월 → 사용승인일 조정이라 거주·보유 미달 → 과세, 고지 없음", () => {
    const r = calc(apt(undefined));
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt).toBe(false);
    expect(warn(r)).not.toMatch(NOTICE);
  });

  it("🔑 건물 2010-05-01 취득 + 건물 거주 36개월 → 보유 통산(14년) · 거주 36 + 12 = 48개월 → 12억 초과 안분 비과세 + 확인 필요 고지", () => {
    const r = calc(apt({ acquisitionDate: D("2010-05-01"), residenceMonths: 36 }));
    expect(r.isPartialExempt || r.isExempt).toBe(true);
    expect(warn(r)).toMatch(NOTICE);
    expect(warn(r)).toContain("확인 필요");
    expect(warn(r)).toContain("2010-05-01");
  });

  it("부정 짝 — 건물 취득일만 있고 건물 거주 0 → 보유는 충족해도 거주 12개월(<24) → 과세 (보유·거주는 각각 요건이다)", () => {
    const r = calc(apt({ acquisitionDate: D("2010-05-01") }));
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt).toBe(false);
  });

  it("부정 짝 — 건물 거주만 길고 취득일이 사용승인 후 2년 안(= 보유 미달)에 가까우면 통산해도 보유 미달 → 과세", () => {
    // 건물 취득 2023-01-01(인가 2017-09-01 뒤라 입력 오류) → 통산 무시 → 사용승인일 기준 보유 1년 2개월 → 과세
    const r = calc(apt({ acquisitionDate: D("2023-01-01"), residenceMonths: 36 }));
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt).toBe(false);
    expect(warn(r)).not.toMatch(NOTICE);
  });

  it("「취득 당시」 조정대상지역 판정일은 통산하지 않는다 — 건물 취득일(2010, 강남 비조정)로 판정하면 거주요건이 없어져 비과세지만, 사용승인일(2023, 조정) 기준이라 거주 부족이면 과세", () => {
    const r = calc(apt({ acquisitionDate: D("2010-05-01"), residenceMonths: 0 }));
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt).toBe(false);
  });
});

describe("#12 세대원 건물 출자 통산 — 장기보유특별공제 공제율은 통산하지 않는다", () => {
  it("같은 사실에서 통산을 켜도 기존건물분·청산금분 공제율이 같다(거주 12개월 → 표1 · 공제율은 신축 거주만)", () => {
    const without = calc(apt(undefined)).redevelopmentDetail!;
    const withCarry = calc(apt({ acquisitionDate: D("2010-05-01"), residenceMonths: 36 })).redevelopmentDetail!;
    expect(pct(withCarry.preApproval.lthdRate)).toBe(pct(without.preApproval.lthdRate));
    expect(pct(withCarry.settlement.lthdRate)).toBe(pct(without.settlement.lthdRate));
  });
});

describe("#12 세대원 건물 출자 통산 — 범위", () => {
  it("주택 출자 원조합원은 이 입력을 읽지 않는다(§154⑧1호 통산이 이미 있다) — 고지도 없다", () => {
    const r = calc(apt({ acquisitionDate: D("2010-05-01"), residenceMonths: 36 }, { originalAssetType: "housing" }));
    expect(warn(r)).not.toMatch(NOTICE);
  });
  it("번역 입력도 읽지 않는다 — 주택 출자 원조합원의 거주월수·보유 기산일이 선언 유무와 같다", () => {
    const hbInput = apt({ acquisitionDate: D("2010-05-01"), residenceMonths: 36 }, { originalAssetType: "housing" });
    const plain = apt(undefined, { originalAssetType: "housing" });
    const a = translateRedevAptForHousingJudgment(hbInput);
    const b = translateRedevAptForHousingJudgment(plain);
    expect(a.residencePeriodMonths).toBe(b.residencePeriodMonths);
    expect(a.exemptionHoldingStartDate).toBe(b.exemptionHoldingStartDate);
  });
  it("번역 입력 — 토지 출자는 거주월수에 건물 거주를 더하고(12 + 36) 보유 기산일이 건물 취득일이다", () => {
    const t = translateRedevAptForHousingJudgment(apt({ acquisitionDate: D("2010-05-01"), residenceMonths: 36 }));
    expect(t.residencePeriodMonths).toBe(48);
    expect(t.exemptionHoldingStartDate?.toISOString().slice(0, 10)).toBe("2010-05-01");
    const base = translateRedevAptForHousingJudgment(apt(undefined));
    expect(base.residencePeriodMonths).toBe(12);
    expect(base.exemptionHoldingStartDate?.toISOString().slice(0, 10)).toBe("2023-03-15");
  });
  it("1세대가 아니면 고지도 판정도 없다", () => {
    const r = calc(apt({ acquisitionDate: D("2010-05-01"), residenceMonths: 36 }, {}, { isOneHousehold: false, householdHousingCount: 2 }));
    expect(warn(r)).not.toMatch(NOTICE);
  });
  it("통산이 없어도 결론이 같으면(보유·거주 24개월 이상) 고지를 내지 않는다", () => {
    const r = calc(
      apt(
        { acquisitionDate: D("2010-05-01"), residenceMonths: 36 },
        { completionDate: D("2020-01-01"), newHouseResidenceMonths: 30 },
        { residencePeriodMonths: 30 },
      ),
    );
    expect(warn(r)).not.toMatch(NOTICE);
  });
});
