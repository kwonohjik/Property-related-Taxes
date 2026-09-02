// D7-01·D7-02 anchor — §77①·§133② 2025 개정의 **경계**를 고정한다
//
// ## 리뷰 D7-01·D7-02는 오탐이다 — 여기에 그 근거를 못 박는다
//
// 리뷰는 시행일자별 본문을 `efYd=20250101`(§77① 10%)과 `efYd=20260101`(§77① 15%) **둘만**
// 비교하고 「15/20/35/45는 2026-01-01 시행」이라 결론냈다. 그 사이의 시행본을 건너뛴 것이다.
//
// 실측(법제처 DRF `target=eflaw`, 조세특례제한법 연혁 276본):
//   efYd=20250101 mst=267555 (법률 제20617호)  §77①=10%  §133②미신설
//   efYd=20250314 mst=269877 (법률 **제20778호**, 공포·시행 2025-03-14)  §77①=**15%**  §133②**신설**
//   efYd=20260101 mst=280409 (법률 제21223호)  §77①=15%  §133② 유지
//
// **법률 제20778호 부칙**이 결론을 확정한다:
//   제10조(공익사업용 토지 등에 대한 양도소득세의 감면에 관한 적용례)
//     「제77조제1항 및 제4항의 개정규정은 **이 법 시행일이 속하는 과세연도에 양도하는
//      경우부터** 적용한다.」
//   제15조(양도소득세 감면의 종합한도 변경에 따른 적용례 등) ①
//     「제133조제1항부터 제3항까지의 개정규정은 **이 법 시행일이 속하는 과세연도에 양도하는
//      경우부터** 적용한다.」
//
// 시행일 2025-03-14가 속한 과세연도 = **2025년**(양도소득세 과세기간 1.1~12.31)
// ⇒ **2025-01-01 양도분부터** 15/20/35/45와 §133② 2억/3억이 적용된다.
// ⇒ 코드의 `AMENDED_2025_TRANSFER_CUTOFF = 2025-01-01`과 `transferYear >= 2025`가 **정확**하다.
//
// ## 왜 anchor가 필요한가
//
// 결론은 「변경 없음」이지만 **경계를 지키는 테스트가 사실상 없었다**. 뮤테이션 실측
// (`npm run test:transfer` 8,232건 기준):
//   · `AMENDED_2025_TRANSFER_CUTOFF` 2025→2026 : **1/8,232**
//   · `getInvoluntaryTransferLimits` 2025→2026 : **0/8,232**
//   · `buildLimitGroups` 2025→2026             : 4/8,232
// 기존 R77-9는 이름이 「2025.1.1 이후 양도분」인데 `transferDate: 2026-02-16`만 써서
// **결함 구간(2025년)을 한 번도 밟지 않는다**. 아래가 그 구간을 고정한다.
import { describe, it, expect } from "vitest";
import {
  calculatePublicExpropriationReduction,
  getInvoluntaryTransferLimits,
  AMENDED_2025_TRANSFER_CUTOFF,
  PUBLIC_EXPROPRIATION_RATES,
} from "@/lib/tax-engine/public-expropriation-reduction";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import { buildLimitGroups } from "@/lib/tax-engine/aggregate-reduction-limits";

const base = {
  businessApprovalDate: new Date("2020-01-01"),
  calculatedTax: 50_000_000,
  transferIncome: 100_000_000,
  basicDeduction: 2_500_000,
  taxBase: 97_500_000,
  cashCompensation: 100_000_000,
  bondCompensation: 0,
};

describe("D7-01 §77① 감면율 경계 — 2025-01-01", () => {
  it("D7-01-1: 상수는 2025-01-01이다 (법률 제20778호 부칙 §10 — 시행일이 속한 과세연도)", () => {
    expect(AMENDED_2025_TRANSFER_CUTOFF.getFullYear()).toBe(2025);
    expect(AMENDED_2025_TRANSFER_CUTOFF.getMonth()).toBe(0);
    expect(AMENDED_2025_TRANSFER_CUTOFF.getDate()).toBe(1);
  });

  it("D7-01-2 경계 직전: 2024-12-31 양도 → 개정 전 10%", () => {
    const r = calculatePublicExpropriationReduction({ ...base, transferDate: new Date("2024-12-31") });
    expect(r.rateSetApplied).toBe("current_2018");
    expect(r.breakdown.cashRate).toBe(0.1);
    expect(r.breakdown.cashReduction).toBe(9_750_000);
    expect(r.rawReductionAmount).toBe(5_000_000);
  });

  it("D7-01-3 경계 당일: 2025-01-01 양도 → 개정 후 15%", () => {
    const r = calculatePublicExpropriationReduction({ ...base, transferDate: new Date("2025-01-01") });
    expect(r.rateSetApplied).toBe("amended_2025");
    expect(r.breakdown.cashRate).toBe(0.15);
    expect(r.breakdown.cashReduction).toBe(14_625_000);
    expect(r.rawReductionAmount).toBe(7_500_000);
  });

  it("D7-01-4: 개정 법률 시행일(2025-03-14) **이전** 양도분에도 개정율이 간다 — 과세연도 단위 소급", () => {
    // 부칙 §10의 「시행일이 **속하는 과세연도**에 양도하는 경우부터」가 2025-01-01까지 당긴다.
    const r = calculatePublicExpropriationReduction({ ...base, transferDate: new Date("2025-02-10") });
    expect(r.rateSetApplied).toBe("amended_2025");
    expect(r.breakdown.cashRate).toBe(0.15);
  });

  it("D7-01-5: 채권 3종도 같은 경계에서 갈린다 (30/40 → 35/45)", () => {
    const at = (d: string, opts: Record<string, unknown>) =>
      calculatePublicExpropriationReduction({
        ...base,
        cashCompensation: 0,
        bondCompensation: 100_000_000,
        transferDate: new Date(d),
        ...opts,
      }).breakdown.bondRate;
    expect(at("2024-12-31", {})).toBe(0.15);
    expect(at("2025-01-01", {})).toBe(0.2);
    expect(at("2024-12-31", { bondHoldingYears: 3 })).toBe(0.3);
    expect(at("2025-01-01", { bondHoldingYears: 3 })).toBe(0.35);
    expect(at("2024-12-31", { bondHoldingYears: 5 })).toBe(0.4);
    expect(at("2025-01-01", { bondHoldingYears: 5 })).toBe(0.45);
  });
});

describe("D7-02 §133 종합한도 경계 — 2025 과세연도", () => {
  it("D7-02-1: 2024년 양도 → 연 1억 / 5년 2억 (§133①)", () => {
    expect(getInvoluntaryTransferLimits(2024)).toEqual({
      annual: 100_000_000,
      fiveYear: 200_000_000,
    });
  });

  it("D7-02-2: 2025년 양도 → 연 2억 / 5년 3억 (§133② 신설, 법률 제20778호 부칙 §15①)", () => {
    expect(getInvoluntaryTransferLimits(2025)).toEqual({
      annual: 200_000_000,
      fiveYear: 300_000_000,
    });
  });

  it("D7-02-3: 그룹 «구성»도 같은 경계에서 갈린다 — 2024는 자경과 한 바구니", () => {
    const g2024 = buildLimitGroups(2024);
    expect(g2024).toHaveLength(1);
    // §133①1호는 §66~§69 등과 §77·§77의2·§77의3을 **같은 합계액**으로 묶어 과세기간별 1억
    expect(g2024[0].types).toContain("self_farming");
    expect(g2024[0].types).toContain("public_expropriation");
    expect(g2024[0].annualLimit).toBe(100_000_000);
  });

  it("D7-02-4: 2025는 자경(§133①)과 비자발적 양도(§133②) 두 그룹으로 분리된다", () => {
    const g2025 = buildLimitGroups(2025);
    expect(g2025).toHaveLength(2);
    const involuntary = g2025.find((g) => g.types.includes("public_expropriation"))!;
    expect(involuntary.types).not.toContain("self_farming");
    expect(involuntary.annualLimit).toBe(200_000_000);
    expect(involuntary.fiveYearLimit).toBe(300_000_000);
    expect(involuntary.legalBasis).toContain("§133②");
  });

  it("D7-02-5: 2024 그룹의 5년 한도에서 §77의3만 빠진다 (①2호나목 열거 — D7-03)", () => {
    const g = buildLimitGroups(2024)[0];
    expect(g.fiveYearTypes).toContain("public_expropriation");
    expect(g.fiveYearTypes).toContain("replacement_land_comp");
    expect(g.fiveYearTypes).not.toContain("gb_designated_land");
  });
});

describe("D7-12 §77 LEGACY 요율의 출처 (부칙 번호는 미확인)", () => {
  it("D7-12-1: LEGACY 4개 값 = efYd 2009-01-01~2013-12-31 시행본 §77① 원문", () => {
    // 법제처 DRF 실측: 2009-01-01본 「양도소득세의 100분의 20[… 100분의 25로 하되, …
    //   100분의 40(만기가 5년 이상인 경우에는 100분의 50)]」
    expect(PUBLIC_EXPROPRIATION_RATES.LEGACY).toEqual({
      cash: 0.2,
      bond: 0.25,
      bond3y: 0.4,
      bond5y: 0.5,
    });
  });

  it("D7-12-2: 세 요율 세트가 서로 구별된다 (2009 / 2014~2015 / 2016~2024)", () => {
    expect(PUBLIC_EXPROPRIATION_RATES.CURRENT_2018).toEqual({
      cash: 0.1,
      bond: 0.15,
      bond3y: 0.3,
      bond5y: 0.4,
    });
    expect(PUBLIC_EXPROPRIATION_RATES.AMENDED_2025).toEqual({
      cash: 0.15,
      bond: 0.2,
      bond3y: 0.35,
      bond5y: 0.45,
    });
  });

  it("D7-12-3: 경과조치 상수는 부칙 제53조를 가리킨다 (법률 번호 미확인 — 주석에 명시)", () => {
    expect(TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION_TRANSITIONAL).toBe("조특법 부칙 제53조");
  });
});
