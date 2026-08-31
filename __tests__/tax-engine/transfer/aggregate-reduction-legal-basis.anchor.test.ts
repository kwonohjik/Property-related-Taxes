/**
 * anchor: 집계 감면 breakdown이 **자기 감면 조문**을 근거로 싣는다 (결과탭 코드리뷰 Lane 1 — #048).
 *
 * ## 중복배제 조항이 감면 근거 자리에 인쇄됐다
 *
 * 다건 「감면세액 합산 재계산」 카드(`MultiTransferTaxResultView.tsx:97`)는
 * `entry.legalBasis`를 그대로 그린다. 그 값이 두 경로에서 **§127⑦(중복배제)** 로 떨어졌다:
 *
 * 1. `lookupLimit(type)`을 **인자 없이** 호출 → `DEFAULT_LIMIT_GROUPS` 조회.
 *    그 기본 그룹②는 `public_expropriation` 하나뿐이라 `gb_designated_land`·
 *    `replacement_land_comp`는 `groupTypes.length === 0`이 된다.
 *    두 유형은 양도연도 분기본 `buildLimitGroups()`에만 있다 — 그리고 그 값은
 *    같은 함수 :103에서 **이미 만들어져 있었다**.
 * 2. `resolveTypeLegalBasis`의 `default`도 §127⑦이라 fallback 경로도 같은 곳으로 간다.
 *
 * ⇒ §77의3 개발제한구역 매수토지 감면의 근거가 「조특법 §127⑦ + 조특법 §133②」로 인쇄되고,
 *   실제 근거 §77의3은 그 화면 어디에도 인용되지 않았다. 대조군 `public_expropriation`은
 *   정상(「조특법 §77 + 조특법 §133②」)이라 **같은 표 안에서 규칙이 갈렸다**.
 *
 * 상수는 처음부터 있었다 — `legal-codes/transfer.ts:125 §77의2` · `:127 §77의3`.
 *
 * 법령: 조세특례제한법 §77 · §77의2 · §77의3 · §127⑦(중복배제) · §133②(한도)
 */
import { describe, it, expect } from "vitest";
import { resolveTypeLegalBasis } from "@/lib/tax-engine/transfer-tax-aggregate-pickers";
import { TRANSFER } from "@/lib/tax-engine/legal-codes/transfer";
import {
  REDUCTION_METADATA,
  ALL_REDUCTION_IDS,
} from "@/lib/tax-engine/transfer-reductions/metadata";
import {
  lookupLimit,
  buildLimitGroups,
  DEFAULT_LIMIT_GROUPS,
} from "@/lib/tax-engine/aggregate-reduction-limits";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

// ── E-0 구별력 ──────────────────────────────────────────────────────
describe("E-0 격자 — 두 유형은 기본 그룹에 없고 연도 분기본에만 있다", () => {
  it("DEFAULT_LIMIT_GROUPS로 조회하면 그룹이 비어 있다 (결함의 발생 조건)", () => {
    for (const type of ["gb_designated_land", "replacement_land_comp"]) {
      expect(lookupLimit(type, DEFAULT_LIMIT_GROUPS).groupTypes.length, type).toBe(0);
    }
    // 대조군 — 이 유형은 기본 그룹에도 있어 종전에도 정상이었다.
    expect(lookupLimit("public_expropriation", DEFAULT_LIMIT_GROUPS).groupTypes.length).toBeGreaterThan(0);
  });

  it("🔴 양도연도 분기본을 넘기면 세 유형이 모두 §133② 그룹에 든다", () => {
    const groups = buildLimitGroups(2026);
    for (const type of ["public_expropriation", "gb_designated_land", "replacement_land_comp"]) {
      expect(lookupLimit(type, groups).groupTypes.length, type).toBeGreaterThan(0);
      expect(lookupLimit(type, groups).legalBasis).toContain("§133");
    }
  });
});

// ── E-1 유형별 감면 근거 ────────────────────────────────────────────
describe("E-1 감면 유형이 자기 조문을 돌려준다 (#048)", () => {
  it("🔴 §77의3 개발제한구역 매수토지", () => {
    expect(resolveTypeLegalBasis("gb_designated_land")).toBe(TRANSFER.REDUCTION_GB_DESIGNATED_LAND);
    expect(resolveTypeLegalBasis("gb_designated_land")).toContain("§77의3");
  });

  it("🔴 §77의2 대토보상", () => {
    expect(resolveTypeLegalBasis("replacement_land_comp")).toBe(TRANSFER.REDUCTION_REPLACEMENT_LAND);
    expect(resolveTypeLegalBasis("replacement_land_comp")).toContain("§77의2");
  });

  it("🔴 어느 유형도 중복배제 조항(§127⑦)을 자기 근거로 내지 않는다", () => {
    for (const type of [
      "public_expropriation",
      "gb_designated_land",
      "replacement_land_comp",
      "self_farming",
      "long_term_rental",
      "new_housing",
      "unsold_housing",
    ]) {
      expect(resolveTypeLegalBasis(type), `${type}이 §127⑦을 자기 근거로 낸다`).not.toBe(
        TRANSFER.REDUCTION_OVERLAP_EXCLUSION,
      );
    }
  });

  it("🔴 REDUCTION_METADATA 24 조문 **전수**가 자기 조문을 낸다 (D8-02)", () => {
    // 종전에는 이 검사가 legacy 7종을 **하드코딩**해 신규 §97 시리즈·§99 시리즈·
    // §98 하이브리드가 그대로 빠져나갔다. 전수로 돌려 조문 추가 시 자동 검출한다.
    expect(ALL_REDUCTION_IDS.length).toBeGreaterThanOrEqual(24);
    for (const id of ALL_REDUCTION_IDS) {
      const basis = resolveTypeLegalBasis(id);
      expect(basis, `${id}이 §127⑦을 자기 근거로 낸다`).not.toBe(
        TRANSFER.REDUCTION_OVERLAP_EXCLUSION,
      );
      expect(basis, `${id}의 근거가 metadata와 어긋난다`).toBe(REDUCTION_METADATA[id].article);
    }
  });

  it("대조군 — 미지정 유형은 여전히 default로 §127⑦이다", () => {
    expect(resolveTypeLegalBasis("unknown_type")).toBe(TRANSFER.REDUCTION_OVERLAP_EXCLUSION);
  });
});

// ════════════════════════════════════════════════════════════════════
// E-2 호출부 — 집계 엔진을 실제로 태운다
// ════════════════════════════════════════════════════════════════════

/**
 * ⚠️ E-0·E-1은 `resolveTypeLegalBasis`·`lookupLimit`을 **직접** 부른다 — 그 둘을 조합하는
 *   호출부(`transfer-tax-aggregate-reduction-step.ts:130`)는 못 본다. 실측했다:
 *   그 줄을 종전 `lookupLimit(type)`으로 되돌려도 `__tests__/{tax-engine,components}`
 *   **13,216건이 전부 통과**했다. 그래서 여기서는 집계 엔진의 실제 산출물을 본다.
 */
const rates = makeMockRates();
const D = (s: string) => new Date(s);

const LAND = {
  propertyType: "land" as const,
  isOneHousehold: false,
  householdHousingCount: 0,
  transferPrice: 1_000_000_000,
  acquisitionPrice: 300_000_000,
  acquisitionDate: D("2010-01-01"),
  transferDate: D("2026-06-01"),
};

const GB_REDUCTION = [
  {
    type: "gb_designated_land",
    branch: "in_zone",
    designationDate: D("2015-01-01"),
    triggerDate: D("2024-01-01"),
    residedFromAcqToTrigger: true,
  },
];

const EXPROPRIATION = [
  {
    type: "public_expropriation",
    cashCompensation: 1_000_000_000,
    bondCompensation: 0,
    bondHoldingYears: null,
    businessApprovalDate: D("2024-01-01"),
  },
];

function agg(reductions: unknown[], id: string) {
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 0,
    properties: [
      {
        ...(baseTransferInput({ ...LAND, reductions } as never) as unknown as TransferTaxItemInput),
        propertyId: id,
        propertyLabel: id,
      },
    ],
  };
  return calculateTransferTaxAggregate(input, rates);
}

function basisOf(reductions: unknown[], id: string, type: string): string {
  const r = agg(reductions, id);
  const entry = (r.reductionBreakdown ?? []).find((b) => b.type === type);
  expect(entry, `집계 breakdown에 「${type}」 항목이 없다 — 이 anchor는 아무것도 재지 못한다`).toBeDefined();
  return entry!.legalBasis ?? "";
}

describe("E-2 다건 「감면세액 합산 재계산」 카드가 인쇄하는 문자열 (#048)", () => {
  it("🔴 §77의3 항목의 근거가 §77의3이고, 중복배제 조항이 아니다", () => {
    const basis = basisOf(GB_REDUCTION, "gb", "gb_designated_land");
    expect(basis).toContain("§77의3");
    expect(basis, "감면 근거 자리에 중복배제 조항이 인쇄됐다").not.toContain(
      TRANSFER.REDUCTION_OVERLAP_EXCLUSION,
    );
    // 한도 조항은 그대로 병기된다 — 감면 근거와 한도 근거는 다른 축이다.
    expect(basis).toContain("§133");
  });

  it("대조군 — §77 공익수용은 종전에도 정상이었다 (같은 표 안에서 규칙이 갈렸다)", () => {
    const basis = basisOf(EXPROPRIATION, "ex", "public_expropriation");
    expect(basis).toContain("§77");
    expect(basis).not.toContain(TRANSFER.REDUCTION_OVERLAP_EXCLUSION);
  });
});
