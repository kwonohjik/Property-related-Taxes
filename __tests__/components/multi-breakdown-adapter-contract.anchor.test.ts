/**
 * anchor: 다건 「건별 상세」 어댑터가 **표시 빌더가 읽는 것을 실제로 채운다**
 * (결과탭 코드리뷰 Lane 5 — #080 high · #104).
 *
 * ## 왜 TypeScript가 한 건도 못 잡았나
 *
 * `TransferTaxResult`는 엔진 결과 타입이면서 **표시 계약** 역할을 겸한다. 필드 89개 중
 * **69개가 optional**이라, 손으로 그 타입을 만들어내는 어댑터 3개
 * (`aggregateToFilingResult` · `breakdownToFilingResult` · `mixedUseToFilingResult`)가
 * 서로 다른 부분집합만 채워도 컴파일이 통과한다. 공용 표시 빌더 4개는 그 빈칸을
 * 조용히 0·false·default 분기로 그린다.
 *
 * ## 실측된 두 구멍
 *
 * ### #080 ④ — ⑲ 세액감면대상금액에 **감면율이 곱해진 값**이 실렸다
 *
 * `reductionEligibleIncome(reductionTypeApplied, …)`은 §77·§77의3이면 양도소득금액 **전액**,
 * §77의2면 대토분 echo, 그 외면 `reducibleIncome`을 돌려준다. 어댑터가 식별자를 싣지 않아
 * **default 분기**로 떨어졌고, §77 계열의 `reducibleIncome`은 감면율(15/20/40%)이 이미
 * 곱해진 값이라 서식에 그대로 실리면 안 된다(`reduction-eligible-income.ts` 주석이 명시).
 *
 * 실측(공익수용 9억 토지): ⑲ = **63,000,000** (정본 420,000,000 — 양도소득금액 전액).
 *
 * ### #104 — 옛 이력을 불러오면 신고서 4칸이 `NaN`
 *
 * 결과는 IndexedDB에 저장·복원된다. `refDeterminedTax`가 없던 시절 저장분이 도달하면
 * 가드 없는 읽기가 `undefined`를 흘려 `Math.floor((undefined + n) * 0.1)` → `NaN`이 된다.
 * `fmtCell`은 null·undefined·""·0만 거르고 **NaN은 `formatKRW`로 넘긴다** → 화면에 "NaN".
 * 같은 파일의 `resolveRefCalculatedTax`와 아코디언 본문, 형제 `getRefDeterminedTax`는 모두
 * 가드를 갖고 있었고 **이 한 곳만** 우회했다.
 *
 * 법령: 소득세법 §90①(세액감면방식) · 별지 제84호서식 부표1 ⑲ · 조세특례제한법 §77
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { breakdownToFilingResult } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

const EXPROPRIATION = [
  {
    type: "public_expropriation" as const,
    cashCompensation: 900_000_000,
    bondCompensation: 0,
    bondHoldingYears: null,
    businessApprovalDate: D("2024-01-01"),
  },
];

function agg() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [
        {
          ...baseTransferInput({
            propertyType: "land",
            acquisitionDate: D("2010-03-01"),
            transferDate: D("2026-02-01"),
            transferPrice: 900_000_000,
            acquisitionPrice: 300_000_000,
            expenses: 0,
            isOneHousehold: false,
            householdHousingCount: 0,
            annualBasicDeductionUsed: 0,
            isNonBusinessLand: false,
            transferCause: "public_expropriation",
            reductions: EXPROPRIATION,
          } as Partial<TransferTaxInput>),
          propertyId: "p1",
          propertyLabel: "수용토지",
        } as never,
      ],
    } as never,
    rates,
  );
}

function rowsOf(b: PerPropertyBreakdown) {
  const fr = breakdownToFilingResult(b);
  const { mode } = deriveColumns(fr, undefined, undefined, undefined);
  const rows = buildRows(fr, mode, createDefaultTransferFormData()) as never as {
    label: string;
    values: Record<string, number | string | null>;
  }[];
  return (label: string) => {
    const r = rows.find((x) => x.label === label);
    expect(r, `자산별 신고서에 「${label}」 행이 없다`).toBeDefined();
    return r!.values["total"];
  };
}

// ── E-0 구별력 ──────────────────────────────────────────────────────
describe("E-0 격자 — §77 감면이 실제로 붙고 두 값이 다르다", () => {
  it("reducibleIncome(감면율 곱해진 값) ≠ 양도소득금액", () => {
    const b = agg().properties[0];
    expect(b.reductionType, "감면 식별자가 없으면 이 anchor는 아무것도 구별하지 못한다").toBe(
      "public_expropriation",
    );
    expect(b.reducibleIncome ?? 0).toBeGreaterThan(0);
    expect(
      b.reducibleIncome,
      "두 값이 같으면 default 분기로 떨어져도 티가 나지 않는다",
    ).not.toBe(b.income);
  });
});

// ── E-1 #080 ⑲ 라우팅 ───────────────────────────────────────────────
describe("E-1 ⑲ 세액감면대상금액이 §77 라우팅을 탄다 (#080)", () => {
  it("🔴 어댑터가 감면 식별자를 싣는다", () => {
    const fr = breakdownToFilingResult(agg().properties[0]) as unknown as Record<string, unknown>;
    expect(fr.reductionTypeApplied).toBe("public_expropriation");
  });

  it("🔴 ⑲ = 양도소득금액 전액 (감면율 곱해진 값이 아니다)", () => {
    const b = agg().properties[0];
    const n = rowsOf(b);
    expect(n("세액감면대상금액")).toBe(n("양도소득금액"));
    expect(
      n("세액감면대상금액"),
      "감면율이 곱해진 reducibleIncome이 그대로 실렸다",
    ).not.toBe(b.reducibleIncome);
  });
});

// ── E-2 #104 NaN 가드 ───────────────────────────────────────────────
describe("E-2 옛 이력에 refDeterminedTax가 없어도 NaN이 안 나온다 (#104)", () => {
  /** `refDeterminedTax`가 없던 시절 IndexedDB에 저장된 결과를 재현한다. */
  function stale(): PerPropertyBreakdown {
    const b = { ...agg().properties[0] } as Record<string, unknown>;
    delete b.refDeterminedTax;
    return b as unknown as PerPropertyBreakdown;
  }

  it("격자 — 그 필드가 실제로 없다", () => {
    expect("refDeterminedTax" in (stale() as object)).toBe(false);
  });

  it("🔴 신고서 4칸이 숫자다", () => {
    const n = rowsOf(stale());
    for (const label of [
      "결정세액",
      "총결정세액",
      "지방소득세 산출세액",
      "지방세 결정세액",
    ]) {
      const v = n(label);
      expect(typeof v, `${label}이 숫자가 아니다`).toBe("number");
      expect(Number.isNaN(v as number), `${label}이 NaN이다 — 화면에 "NaN"으로 찍힌다`).toBe(false);
    }
  });

  it("🔴 fallback 값이 형제 카드와 같다", () => {
    // 가드가 채우는 값은 「산출세액(참고) − 감면세액」이다 — 아코디언 헤더와 같은 규칙.
    const full = rowsOf(agg().properties[0]);
    const recovered = rowsOf(stale());
    expect(recovered("결정세액")).toBe(full("결정세액"));
  });
});
