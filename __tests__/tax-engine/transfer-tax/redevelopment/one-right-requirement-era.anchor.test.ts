/**
 * anchor E-3 후속 — 조합원입주권 1세대1입주권 비과세(현행 「소득세법」 §89①4호) **요건 연혁**
 *
 * 종전: 엔진이 양도일과 무관하게 현행 §89①4호 문언(나목 3년 · 분양권 요건)으로 판정했다.
 * 연혁·근거는 `lib/tax-engine/data/one-right-requirement-era.ts` 헤더(DRF `LM`+`efYd` 실독 2026-09-28).
 *
 * | 축 | 연혁 | 근거 |
 * |---|---|---|
 * | 나목 | < 2006-01-01 없음 → 1년 → 2008-11-28 2년 → 2012-06-29 3년 (양도일) | 영 §155 제16·17항 · 대통령령 제19254·21138·23887호 부칙(시행 후 최초 양도분) |
 * | 분양권 | 입주권 인가일 ≥ 2022-01-01 이고 분양권 취득일 ≥ 2022-01-01일 때만 | 법률 제18578호 부칙 제7조②·③ · 서면-2021-법규재산-7792 |
 * | 고가 기준 | 2003-03-02 ~ 2005-02-18 6억(종전 미지원 12억) · 1999~2003-03-01 고급주택 체제 미지원 | 영 §156①(대통령령 제17825호) · 부칙 제20조 |
 *
 * ## 실측 (mock 세율 · 가목/나목 입주권 · 취득 1995-03-01 · 취득가 1억 · 권리가액 3억)
 *
 * | 케이스 | 종전 결정세액 | 수정 후 |
 * |---|---|---|
 * | 2005-12-31 양도 · 1주택(2005-09-01 취득) 5억 | 0 | 78,670,000 |
 * | 2006-01-01 양도 · 같은 사실 | 0 | 0 |
 * | 2008-11-27 양도 · 1주택(2007-06-01) 5억 | 0 | 75,630,000 |
 * | 2008-11-28 양도 · 같은 사실 | 0 | 0 |
 * | 2012-06-28 양도 · 1주택(2010-01-01) 5억 | 0 | 75,630,000 |
 * | 2012-06-29 양도 · 같은 사실 | 0 | 0 |
 * | 2023-06-01 양도 · 인가 2019 · 분양권 2023-01-01 · 10억 | 294,810,000 | 0 |
 * | 2024-06-01 양도 · 인가 2022-03-01 · 분양권 2021-06-01 · 10억 | 294,810,000 | 0 |
 * | 2024-06-01 양도 · 인가 2022-03-01 · 분양권 2022-05-01 · 10억 | 294,810,000 | 294,810,000 (불변) |
 * | 2004-06-01 양도 · 가목 7억 | 0 | 11,400,000 (6억 초과분 안분) |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { buildOneRightVerdict, applyOneRightVerdict } from "@/lib/tax-engine/one-house/one-right-verdict";
import {
  resolveOneRightRequirementEra,
  oneRightClauseNaYears,
  oneRightPresaleRightBlocks,
  oneRightRequirementEraNotices,
} from "@/lib/tax-engine/data/one-right-requirement-era";
import {
  resolveOneRightHighValueEra,
  resolveOneRightHighValueThreshold,
  oneRightHighValueEraNotice,
} from "@/lib/tax-engine/data/one-right-high-value-era";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { OneHouseJudgment } from "@/lib/tax-engine/one-house/types";

const rates = makeMockRates();
const d = (s: string) => new Date(s);

type Opt = { approval?: string; houses?: number; other?: string; presale?: string[]; rights?: number; declared?: boolean };

function input(transferDate: string, price: number, o: Opt = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: price,
    transferDate: d(transferDate),
    acquisitionDate: d("1995-03-01"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: o.houses ?? 0,
    householdRightCount: o.rights ?? 1,
    residencePeriodMonths: 24,
    // 분양권 「없음」 확정 — 이 파일의 테스트는 요건 연혁(나목 기한·고가 기준)이 관심사이고
    // `o.presale` 미지정은 "세대가 분양권을 보유하지 않음"을 뜻한다(2026-10-06, §4-6 남은 별건 3).
    householdNoPresaleRightsConfirmed: true,
    ...(o.presale
      ? {
          presaleRights: o.presale.map((p, i) => ({
            id: `p${i}`,
            type: "presale_right" as const,
            acquisitionDate: d(p),
            region: "capital" as const,
          })),
        }
      : {}),
    redevelopment: {
      subject: "right",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: d(o.approval ?? "2003-12-01"),
      rightsValue: 300_000_000,
      settlementDirection: "pay",
      settlementAmount: 50_000_000,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "housing",
      exemptionEligibleAtApproval: o.declared ?? true,
      ...(o.other ? { otherHouseAcquisitionDate: d(o.other) } : {}),
    },
  });
}

/** 판정 메뉴 운반 상자로 같은 사실을 옮긴다(`redevelopment` 없이 `oneRightExemptionFacts`). */
function judgmentInput(transferDate: string, price: number, o: Opt & { withApproval?: boolean } = {}): TransferTaxInput {
  const base = input(transferDate, price, o);
  const { redevelopment, ...rest } = base;
  return {
    ...rest,
    oneRightExemptionFacts: {
      eligibleAtApproval: redevelopment!.exemptionEligibleAtApproval === true,
      otherHouseAcquisitionDate: redevelopment!.otherHouseAcquisitionDate,
      ...(o.withApproval === false ? {} : { approvalDate: redevelopment!.approvalDate }),
    },
  };
}

const tax = (i: TransferTaxInput) => calculateTransferTax(i, rates);

// ──────────────────────────────────────────────────────────────────────────────
// 1. leaf — 경계 ±1일
// ──────────────────────────────────────────────────────────────────────────────
describe("leaf — 요건 연혁 경계", () => {
  it.each([
    ["1998-12-31", "unsupported", 3],
    ["1999-01-01", "ga_only", null],
    ["2005-12-31", "ga_only", null],
    ["2006-01-01", "na_1y", 1],
    ["2008-11-27", "na_1y", 1],
    ["2008-11-28", "na_2y", 2],
    ["2012-06-28", "na_2y", 2],
    ["2012-06-29", "na_3y", 3],
    ["2026-09-28", "na_3y", 3],
  ] as const)("양도일 %s → %s · 나목 %s년", (date, era, years) => {
    expect(resolveOneRightRequirementEra(d(date))).toBe(era);
    expect(oneRightClauseNaYears(d(date))).toBe(years);
  });

  it("분양권 — 두 날짜 모두 2022-01-01 이후일 때만 요건에 걸린다", () => {
    expect(oneRightPresaleRightBlocks(d("2021-12-31"), d("2022-06-01"))).toBe(false);
    expect(oneRightPresaleRightBlocks(d("2022-01-01"), d("2021-12-31"))).toBe(false);
    expect(oneRightPresaleRightBlocks(d("2022-01-01"), d("2022-01-01"))).toBe(true);
    expect(oneRightPresaleRightBlocks(d("2022-01-01"), undefined)).toBe("undetermined");
    expect(oneRightPresaleRightBlocks(d("2021-12-31"), undefined)).toBe(false);
  });

  it("고가 기준 — 2003-03-02부터 6억, 1999-01-01 ~ 2003-03-01 고급주택 체제 미지원, 그 전 미지원", () => {
    expect(resolveOneRightHighValueEra(d("1998-12-31"))).toBe("unsupported");
    expect(resolveOneRightHighValueEra(d("1999-01-01"))).toBe("luxury_house_regime");
    expect(resolveOneRightHighValueEra(d("2003-03-01"))).toBe("luxury_house_regime");
    expect(resolveOneRightHighValueEra(d("2003-03-02"))).toBe("deemed_one_house");
    expect(resolveOneRightHighValueThreshold(d("2003-03-01"))).toBe(1_200_000_000);
    expect(resolveOneRightHighValueThreshold(d("2003-03-02"))).toBe(600_000_000);
    expect(resolveOneRightHighValueThreshold(d("2005-02-18"))).toBe(600_000_000);
    expect(oneRightHighValueEraNotice(d("2003-03-01"))).toMatch(/고급주택/);
    expect(oneRightHighValueEraNotice(d("1998-12-31"))).toMatch(/지원하지 않습니다/);
    expect(oneRightHighValueEraNotice(d("2003-03-02"))).toBeUndefined();
  });

  it("고지 — 1999년 전 미지원 · 2005년까지 입주권 2개 이상 · 재건축 기준일(선언 시)", () => {
    const n = (t: string, extra: Partial<Parameters<typeof oneRightRequirementEraNotices>[0]> = {}) =>
      oneRightRequirementEraNotices({ transferDate: d(t), eligibleAtApprovalDeclared: true, ...extra });
    expect(n("1998-12-31").some((x) => x.includes("지원하지 않습니다"))).toBe(true);
    expect(n("2005-12-31", { householdRightCount: 2 }).some((x) => x.includes("1개 소유"))).toBe(true);
    expect(n("2006-01-01", { householdRightCount: 2, rightApprovalDate: d("2006-01-01") })).toEqual([]);
    expect(n("2005-05-30").some((x) => x.includes("사업시행인가일"))).toBe(true);
    // 2005-05-31 이후 양도라도 인가일이 그 전이면 사업시행인가도 그 전이 확실하다 — 부칙 ④
    expect(n("2010-01-01", { rightApprovalDate: d("2005-05-30") }).some((x) => x.includes("사업시행인가일"))).toBe(true);
    expect(n("2010-01-01", { rightApprovalDate: d("2005-05-31") })).toEqual([]);
    expect(
      oneRightRequirementEraNotices({ transferDate: d("2005-05-30"), eligibleAtApprovalDeclared: false }),
    ).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. 엔진(계산기) — ±1일 쌍
// ──────────────────────────────────────────────────────────────────────────────
describe("계산기 — 나목 연혁 (양도가액 5억 · 1주택 보유)", () => {
  const na = (t: string, other: string, approval: string) =>
    tax(input(t, 500_000_000, { houses: 1, other, approval }));

  it("🔴 2005-12-31 — 나목 없던 시기: 불성립 → 78,670,000 (종전 0)", () => {
    const r = na("2005-12-31", "2005-09-01", "2004-06-01");
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBeUndefined();
    expect(r.determinedTax).toBe(78_670_000);
  });
  it("2006-01-01 — 1년 이내(2005-09-01 취득) → 나목 비과세 0", () => {
    const r = na("2006-01-01", "2005-09-01", "2004-06-01");
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBe("na");
    expect(r.determinedTax).toBe(0);
  });
  it("🔴 2008-11-27 — 1년 기한(2007-06-01 취득 · 1년 5개월) → 75,630,000 (종전 0)", () => {
    const r = na("2008-11-27", "2007-06-01", "2006-06-01");
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBeUndefined();
    expect(r.determinedTax).toBe(75_630_000);
  });
  it("2008-11-28 — 2년 기한 → 0", () => {
    expect(na("2008-11-28", "2007-06-01", "2006-06-01").determinedTax).toBe(0);
  });
  it("🔴 2012-06-28 — 2년 기한(2010-01-01 취득 · 2년 6개월) → 75,630,000 (종전 0)", () => {
    const r = na("2012-06-28", "2010-01-01", "2009-06-01");
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBeUndefined();
    expect(r.determinedTax).toBe(75_630_000);
  });
  it("2012-06-29 — 3년 기한 → 0", () => {
    expect(na("2012-06-29", "2010-01-01", "2009-06-01").determinedTax).toBe(0);
  });
  it("1년 기한 우변 — 2006-06-01 취득 · 2007-06-01 양도(만료일 당일) 성립 / 2007-06-02 불성립", () => {
    expect(na("2007-06-01", "2006-06-01", "2005-06-01").redevelopmentDetail?.oneRightExemptionClause).toBe("na");
    expect(na("2007-06-04", "2006-06-01", "2005-06-01").redevelopmentDetail?.oneRightExemptionClause).toBeUndefined();
  });
  it("가목은 연혁과 무관 — 2005-06-01 양도 · 주택 0채 5억 → 0", () => {
    const r = tax(input("2005-06-01", 500_000_000, { approval: "2004-06-01" }));
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBe("ga");
    expect(r.determinedTax).toBe(0);
  });
});

describe("계산기 — 분양권 요건 연혁 (양도가액 10억 · 가목)", () => {
  it("🔴 인가 2019 · 분양권 2023-01-01 · 2023-06-01 양도 → 종전 규정: 비과세 0 (종전 294,810,000)", () => {
    const r = tax(input("2023-06-01", 1_000_000_000, { approval: "2019-01-01", presale: ["2023-01-01"] }));
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBe("ga");
    expect(r.determinedTax).toBe(0);
  });
  it("🔴 인가 2022-03-01 · 분양권 2021-06-01 → 부칙 제7조③: 대상 아님 → 0 (종전 294,810,000)", () => {
    const r = tax(input("2024-06-01", 1_000_000_000, { approval: "2022-03-01", presale: ["2021-06-01"] }));
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBe("ga");
    expect(r.determinedTax).toBe(0);
  });
  it("긍정 짝 — 인가 2022-03-01 · 분양권 2022-05-01 → 불성립 294,810,000 (불변)", () => {
    const r = tax(input("2024-06-01", 1_000_000_000, { approval: "2022-03-01", presale: ["2022-05-01"] }));
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBeUndefined();
    expect(r.determinedTax).toBe(294_810_000);
  });
  it("경계 — 인가 2021-12-31 · 분양권 2022-05-01 → 종전 규정 0 / 인가 2022-01-01 → 불성립", () => {
    expect(tax(input("2024-06-01", 1_000_000_000, { approval: "2021-12-31", presale: ["2022-05-01"] })).determinedTax).toBe(0);
    expect(tax(input("2024-06-01", 1_000_000_000, { approval: "2022-01-01", presale: ["2022-05-01"] })).determinedTax).toBe(294_810_000);
  });
});

describe("계산기 — 2005-02-19 전 고가 기준(6억)", () => {
  it("🔴 2004-06-01 양도 7억 → 6억 초과분 안분 11,400,000 (종전 12억 전액 비과세 0)", () => {
    const r = tax(input("2004-06-01", 700_000_000, { approval: "2003-06-01" }));
    expect(r.redevelopmentDetail?.oneRightHighValueApplied).toBe(true);
    expect(r.redevelopmentDetail?.highValueAllocation?.nontaxableThreshold).toBe(600_000_000);
    expect(r.determinedTax).toBe(11_400_000);
  });
  it("2003-03-01 양도 7억 → 고급주택 체제 미지원: 현행 12억(종전 동작) + 고지", () => {
    const r = tax(input("2003-03-01", 700_000_000, { approval: "2002-06-01" }));
    expect(r.redevelopmentDetail?.oneRightExemptionApplied).toBe(true);
    expect(r.warnings?.some((w) => w.includes("고급주택"))).toBe(true);
  });
});

describe("계산기 — 요건 고지는 warnings로 나간다", () => {
  it("재건축 기준일 고지 — 2005-05-30 양도(선언)", () => {
    const r = tax(input("2005-05-30", 500_000_000, { approval: "2004-06-01" }));
    expect(r.warnings?.some((w) => w.includes("사업시행인가일"))).toBe(true);
  });
  it("2005년 입주권 2개 → 1개 요건 유지(불성립) + 확인 필요 고지", () => {
    const r = tax(input("2004-06-01", 500_000_000, { approval: "2003-06-01", rights: 2 }));
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBeUndefined();
    expect(r.warnings?.some((w) => w.includes("1개 소유"))).toBe(true);
  });
  it("현행 시기에는 고지가 없다", () => {
    const r = tax(input("2024-06-01", 500_000_000, { approval: "2022-03-01" }));
    expect(r.warnings?.some((w) => w.includes("사업시행인가일") || w.includes("1개 소유"))).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. 판정 메뉴 — 같은 leaf
// ──────────────────────────────────────────────────────────────────────────────
describe("판정 메뉴 — buildOneRightVerdict도 같은 요건 연혁", () => {
  it("2005-12-31 1주택 → 미성립 · 나목 없던 시기 사유", () => {
    const v = buildOneRightVerdict(judgmentInput("2005-12-31", 500_000_000, { houses: 1, other: "2005-09-01", approval: "2004-06-01" }), true);
    expect(v?.clause).toBeNull();
    expect(v?.reasons.some((r) => r.includes("2006.1.1. 이후 양도분부터"))).toBe(true);
  });
  it("2008-11-28 나목 성립 · naYears 2 · 판정 라벨 「2년」", () => {
    const v = buildOneRightVerdict(judgmentInput("2008-11-28", 500_000_000, { houses: 1, other: "2007-06-01", approval: "2006-06-01" }), true);
    expect(v?.clause).toBe("na");
    expect(v?.naYears).toBe(2);
    const judgment = applyOneRightVerdict(
      { isExempt: false, isPartialExempt: false, appliedExceptions: [] } as unknown as OneHouseJudgment,
      v,
    );
    expect(judgment.appliedExceptions.at(-1)?.label).toContain("2년 이내");
  });
  it("인가일 입력 → 2019 인가 · 2023 분양권 → 가목 성립", () => {
    const v = buildOneRightVerdict(judgmentInput("2023-06-01", 1_000_000_000, { approval: "2019-01-01", presale: ["2023-01-01"] }), true);
    expect(v?.clause).toBe("ga");
  });
  it("인가일 미입력 · 2023 분양권 → 판정 불가(불성립) + 인가일 사유", () => {
    const v = buildOneRightVerdict(
      judgmentInput("2023-06-01", 1_000_000_000, { approval: "2019-01-01", presale: ["2023-01-01"], withApproval: false }),
      true,
    );
    expect(v?.clause).toBeNull();
    expect(v?.reasons.some((r) => r.includes("인가일을 입력하지 않으면"))).toBe(true);
  });
  it("인가일 미입력이어도 2022년 전 분양권이면 결론이 같다 → 가목 성립", () => {
    const v = buildOneRightVerdict(
      judgmentInput("2023-06-01", 1_000_000_000, { approval: "2019-01-01", presale: ["2021-06-01"], withApproval: false }),
      true,
    );
    expect(v?.clause).toBe("ga");
  });
  it("요건 고지를 verdict에 싣는다 (계산기 warnings와 같은 문구)", () => {
    const i = judgmentInput("2005-05-30", 500_000_000, { approval: "2004-06-01" });
    const v = buildOneRightVerdict(i, true);
    const calc = tax(input("2005-05-30", 500_000_000, { approval: "2004-06-01" }));
    const notice = v?.requirementNotices?.find((n) => n.includes("사업시행인가일"));
    expect(notice).toBeDefined();
    expect(calc.warnings).toContain(notice);
  });
});
