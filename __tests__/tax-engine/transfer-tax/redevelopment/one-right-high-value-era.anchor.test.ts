/**
 * anchor E-3 — 조합원입주권 §89①4호 1세대1입주권 비과세의 **고가 기준금액 연혁** (양도일 축)
 *
 * 종전: `applyOneRightExemption`·판정 메뉴가 양도일과 무관하게 **12억 고정**(`HIGH_VALUE_THRESHOLD`).
 * 그래서 2021-12-07 이전 양도분(9억 시기)에서 9억~12억 입주권이 **전액 비과세**로 나왔다.
 *
 * ## 연혁 (법제처 DRF `target=eflaw` 전수 실독 2026-09-28 · 소득세법 시행령 190개 시행본)
 *
 * | 양도일 | 기준 | 근거 |
 * |---|---|---|
 * | < 1999-01-01 | **미지원**(입주권 의제 조항 없음) — 현행 12억 + 고지 | 1997·1998 시행령 시행본 |
 * | 1999-01-01 ~ 2003-03-01 | **미지원**(고급주택 체제) — 현행 12억 + 고지 | 영 §156 고급주택 · 대통령령 제17825호 부칙 제20조 |
 * | 2003-03-02 ~ 2008-10-06 | 6억 | 영 §155 제16항·제17항(1세대1주택 의제) → 법 §89(①)3호 괄호 → 영 §156① 6억 · 서면4팀-1246·서면5팀-1152·서면4팀-3370·서면5팀-74 (E-3 후속: 2005-02-19 전은 DRF `LM`+`efYd`로 실독) |
 * | 2008-10-07 ~ 2016-12-31 | 9억 | 같은 체인 · 영 §156① 9억(대통령령 제21062호 부칙 제2조) · 재산세제과-1061 |
 * | 2017-01-01 ~ 2017-02-02 | **확인 필요** — 현행 12억 + 고지 | 법 §89①4호 단서 「대통령령으로 정하는 기준」(법률 제14389호) · 영 미개정 |
 * | 2017-02-03 ~ 2021-12-07 | 9억 | 영 §155 제17항(대통령령 제27829호 부칙 제2조②) |
 * | ≥ 2021-12-08 | 12억 | 법 §89①4호 단서(법률 제18578호 부칙 제1조3호·제7조⑤) |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { buildOneRightVerdict } from "@/lib/tax-engine/one-house/one-right-verdict";
import {
  resolveOneRightHighValueEra,
  resolveOneRightHighValueThreshold,
  oneRightHighValueEraNotice,
} from "@/lib/tax-engine/data/one-right-high-value-era";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();
const d = (s: string) => new Date(s);

function redevInfo(approvalDate: string): RedevelopmentInfo {
  return {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: d(approvalDate),
    rightsValue: 300_000_000,
    settlementDirection: "pay",
    settlementAmount: 50_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    exemptionEligibleAtApproval: true,
  };
}

/** 가목(다른 주택 0 · 입주권 1) 1세대1입주권 — 양도일·양도가액만 바꾼다. */
function rightInput(transferDate: string, transferPrice: number, approvalDate = "2003-12-01"): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice,
    transferDate: d(transferDate),
    acquisitionDate: d("1995-03-01"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 0,
    householdRightCount: 1,
    residencePeriodMonths: 24,
    redevelopment: redevInfo(approvalDate),
  });
}

const run = (transferDate: string, price: number, approvalDate?: string) =>
  calculateTransferTax(rightInput(transferDate, price, approvalDate), mockRates);

// ──────────────────────────────────────────────────────────────────────────────
// 1. leaf — 경계 ±1일
// ──────────────────────────────────────────────────────────────────────────────
describe("E-3 leaf — 조합원입주권 고가 기준금액 연혁 경계", () => {
  it.each([
    ["1998-12-31", "unsupported", 1_200_000_000],
    ["1999-01-01", "luxury_house_regime", 1_200_000_000],
    ["2003-03-01", "luxury_house_regime", 1_200_000_000],
    ["2003-03-02", "deemed_one_house", 600_000_000],
    ["2005-02-18", "deemed_one_house", 600_000_000],
    ["2005-02-19", "deemed_one_house", 600_000_000],
    ["2008-10-06", "deemed_one_house", 600_000_000],
    ["2008-10-07", "deemed_one_house", 900_000_000],
    ["2016-12-31", "deemed_one_house", 900_000_000],
    ["2017-01-01", "delegation_gap", 1_200_000_000],
    ["2017-02-02", "delegation_gap", 1_200_000_000],
    ["2017-02-03", "decree_155_17", 900_000_000],
    ["2021-12-07", "decree_155_17", 900_000_000],
    ["2021-12-08", "statute", 1_200_000_000],
    ["2026-09-28", "statute", 1_200_000_000],
  ] as const)("양도일 %s → %s · %i", (date, era, threshold) => {
    expect(resolveOneRightHighValueEra(d(date))).toBe(era);
    expect(resolveOneRightHighValueThreshold(d(date))).toBe(threshold);
  });

  it("미확인 구간만 고지가 있다 — 확인된 구간은 고지 없음", () => {
    expect(oneRightHighValueEraNotice(d("1998-12-31"))).toMatch(/지원하지 않습니다/);
    expect(oneRightHighValueEraNotice(d("2003-03-01"))).toMatch(/고급주택/);
    expect(oneRightHighValueEraNotice(d("2017-01-15"))).toMatch(/확인되지 않아/);
    for (const s of ["2003-03-02", "2005-02-18", "2005-02-19", "2010-01-01", "2017-02-03", "2021-12-07", "2021-12-08"]) {
      expect(oneRightHighValueEraNotice(d(s))).toBeUndefined();
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. 엔진 — ±1일 쌍 (같은 가액이 경계에서 결론을 바꾼다)
// ──────────────────────────────────────────────────────────────────────────────
describe("E-3 엔진 — 12억 경계 2021-12-07 / 2021-12-08 (양도가액 10억)", () => {
  const before = run("2021-12-07", 1_000_000_000);
  const after = run("2021-12-08", 1_000_000_000);

  it("🔴 2021-12-07 양도 — 9억 초과이므로 안분 과세(종전: 전액 비과세)", () => {
    expect(before.redevelopmentDetail?.oneRightHighValueApplied).toBe(true);
    expect(before.redevelopmentDetail?.oneRightExemptionApplied).toBeUndefined();
    expect(before.redevelopmentDetail?.highValueAllocation?.nontaxableThreshold).toBe(900_000_000);
    // (10억 − 9억) / 10억 = 0.1
    expect(before.redevelopmentDetail?.highValueAllocation?.taxableRatio).toBeCloseTo(0.1, 12);
    expect(before.determinedTax).toBeGreaterThan(0);
  });

  it("2021-12-08 양도 — 12억 이하이므로 전액 비과세", () => {
    expect(after.redevelopmentDetail?.oneRightExemptionApplied).toBe(true);
    expect(after.redevelopmentDetail?.oneRightHighValueApplied).toBeUndefined();
    expect(after.determinedTax).toBe(0);
  });

  it("산출근거 문구가 적용한 기준금액을 적는다 (9억 시기에 「12억」 리터럴 금지)", () => {
    const step = before.steps.find((s) => s.label.startsWith("1세대1입주권"));
    expect(step?.label).toContain("9억");
    expect(step?.formula).toContain("9억");
    expect(step?.formula).not.toContain("12억");
    const exemptStep = after.steps.find((s) => s.label === "1세대1입주권 비과세");
    expect(exemptStep?.formula).toContain("12억");
  });
});

describe("E-3 엔진 — 9억 시기 우변 ±1원 (양도일 2019-06-01)", () => {
  it("양도가액 9억 = 기준 이하 → 전액 비과세", () => {
    const r = run("2019-06-01", 900_000_000);
    expect(r.redevelopmentDetail?.oneRightExemptionApplied).toBe(true);
    expect(r.determinedTax).toBe(0);
  });
  it("양도가액 9억 + 1원 → 안분 과세", () => {
    const r = run("2019-06-01", 900_000_001);
    expect(r.redevelopmentDetail?.oneRightHighValueApplied).toBe(true);
    expect(r.redevelopmentDetail?.highValueAllocation?.nontaxableThreshold).toBe(900_000_000);
  });
});

describe("E-3 엔진 — 6억/9억 경계 2008-10-06 / 2008-10-07 (양도가액 7억)", () => {
  it("2008-10-06 양도 — 6억 초과 → 안분 과세 · 비율 (7억 − 6억) / 7억", () => {
    const r = run("2008-10-06", 700_000_000);
    expect(r.redevelopmentDetail?.oneRightHighValueApplied).toBe(true);
    expect(r.redevelopmentDetail?.highValueAllocation?.nontaxableThreshold).toBe(600_000_000);
    expect(r.redevelopmentDetail?.highValueAllocation?.taxableRatio).toBeCloseTo(1 / 7, 12);
  });
  it("2008-10-07 양도 — 9억 이하 → 전액 비과세", () => {
    const r = run("2008-10-07", 700_000_000);
    expect(r.redevelopmentDetail?.oneRightExemptionApplied).toBe(true);
    expect(r.determinedTax).toBe(0);
  });
});

describe("E-3 엔진 — 2017 위임 공백 경계 2016-12-31 / 2017-01-01 / 2017-02-02 / 2017-02-03 (양도가액 10억)", () => {
  it("2016-12-31 — 영 §156 9억 → 안분", () => {
    const r = run("2016-12-31", 1_000_000_000);
    expect(r.redevelopmentDetail?.oneRightHighValueApplied).toBe(true);
    expect(r.redevelopmentDetail?.highValueAllocation?.nontaxableThreshold).toBe(900_000_000);
  });
  it("2017-01-01 — 확인 필요 구간: 현행 12억(종전 동작 유지) + 고지", () => {
    const r = run("2017-01-01", 1_000_000_000);
    expect(r.redevelopmentDetail?.oneRightExemptionApplied).toBe(true);
    expect(r.warnings?.some((w) => w.includes("확인되지 않아"))).toBe(true);
  });
  it("2017-02-02 — 같은 구간", () => {
    const r = run("2017-02-02", 1_000_000_000);
    expect(r.redevelopmentDetail?.oneRightExemptionApplied).toBe(true);
    expect(r.warnings?.some((w) => w.includes("확인되지 않아"))).toBe(true);
  });
  it("2017-02-03 — 영 §155 제17항 9억 → 안분 · 고지 없음", () => {
    const r = run("2017-02-03", 1_000_000_000);
    expect(r.redevelopmentDetail?.oneRightHighValueApplied).toBe(true);
    expect(r.redevelopmentDetail?.highValueAllocation?.nontaxableThreshold).toBe(900_000_000);
    expect(r.warnings?.some((w) => w.includes("고가 기준금액"))).toBe(false);
  });
});

describe("E-3 엔진 — 2003-03-01 이전 양도는 미지원 고지(현행 12억으로 계산 — 숨기지 않는다)", () => {
  it("2003-03-01 양도 10억 — 전액 비과세(12억) + 고급주택 체제 미지원 고지", () => {
    const r = run("2003-03-01", 1_000_000_000, "2002-06-01");
    expect(r.redevelopmentDetail?.oneRightExemptionApplied).toBe(true);
    expect(r.warnings?.some((w) => w.includes("고급주택"))).toBe(true);
  });
  it("E-3 후속 — 2004-12-01 양도 10억은 6억 → 안분 · 고지 없음 (종전 미지원 12억)", () => {
    const r = run("2004-12-01", 1_000_000_000, "2003-06-01");
    expect(r.redevelopmentDetail?.oneRightHighValueApplied).toBe(true);
    expect(r.redevelopmentDetail?.highValueAllocation?.nontaxableThreshold).toBe(600_000_000);
    expect(r.warnings?.some((w) => w.includes("고가 기준금액"))).toBe(false);
  });
  it("2005-02-19 양도 7억 — 6억 → 안분 · 고지 없음", () => {
    const r = run("2005-02-19", 700_000_000, "2004-06-01");
    expect(r.redevelopmentDetail?.oneRightHighValueApplied).toBe(true);
    expect(r.redevelopmentDetail?.highValueAllocation?.nontaxableThreshold).toBe(600_000_000);
    expect(r.warnings?.some((w) => w.includes("고가 기준금액"))).toBe(false);
  });
  it("비과세가 성립하지 않으면(인가일 요건 미선언) 고지하지 않는다 — 기준금액을 쓰지 않았다", () => {
    const input = rightInput("2003-03-01", 1_000_000_000, "2002-06-01");
    input.redevelopment!.exemptionEligibleAtApproval = false;
    const r = calculateTransferTax(input, mockRates);
    expect(r.redevelopmentDetail?.oneRightExemptionApplied).toBeUndefined();
    expect(r.warnings?.some((w) => w.includes("고급주택"))).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. 판정 메뉴 — 계산기와 같은 leaf (두 화면이 같은 입력에 다른 답을 내지 않는다)
// ──────────────────────────────────────────────────────────────────────────────
describe("E-3 판정 메뉴 — buildOneRightVerdict도 양도일 기준금액", () => {
  it("2021-12-07 10억 → 부분 비과세 · 기준 9억", () => {
    const v = buildOneRightVerdict(rightInput("2021-12-07", 1_000_000_000), true);
    expect(v?.isPartialExempt).toBe(true);
    expect(v?.isExempt).toBe(false);
    expect(v?.highValueThreshold).toBe(900_000_000);
    expect(v?.thresholdNotice).toBeUndefined();
  });
  it("2021-12-08 10억 → 전액 비과세 · 기준 12억", () => {
    const v = buildOneRightVerdict(rightInput("2021-12-08", 1_000_000_000), true);
    expect(v?.isExempt).toBe(true);
    expect(v?.highValueThreshold).toBe(1_200_000_000);
  });
  it("2017-01-20 → 확인 필요 고지를 싣는다", () => {
    const v = buildOneRightVerdict(rightInput("2017-01-20", 1_000_000_000), true);
    expect(v?.isExempt).toBe(true);
    expect(v?.thresholdNotice).toMatch(/확인되지 않아/);
  });
});
