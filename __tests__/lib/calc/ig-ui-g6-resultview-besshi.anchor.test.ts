/**
 * 상속·증여 UI 리뷰 — G6 배치(결과뷰·별지서식) 순수 anchor.
 *
 * 반복 주제는 하나다 — **화면 값 ≠ 별지 값**. 그래서 anchor도 「같은 칸 번호에 대해
 * 화면과 신고서가 같은 산식을 쓰는가」를 잰다.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { aggregatePriorGiftsForGift } from "@/lib/tax-engine/gift-prior-aggregation";
import { CURRENT_SURCHARGE_RATE } from "@/lib/tax-engine/data/installment-surcharge-rates";
import { getInheritanceFilingDueDates } from "@/lib/calc/inheritance-gift-filing-deadline";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";

const read = (p: string) => readFileSync(p, "utf-8");

describe("IG-073 — 부표 1 본문 A24는 «엔진이 합산한 회차»만 찍는다", () => {
  const base = (over: Partial<PriorGift>): PriorGift =>
    ({ giftDate: "2020-01-01", giftAmount: 100_000_000, isHeir: false, giftTaxPaid: 0, donor: "father", ...over }) as PriorGift;

  it("F-1 (양성): 10년 도과·타 증여자·증여자 사망·조특법 특례는 판정 집합에서 빠진다", () => {
    const gifts = [
      base({ giftDate: "2024-01-01" }),                                   // 합산
      base({ giftDate: "2010-01-01" }),                                   // 10년 도과
      base({ giftDate: "2024-02-01", donor: "spouse" }),                  // 타 동일인 그룹
      base({ giftDate: "2024-03-01", donorDeceasedDate: "2024-04-01" }),  // 증여자 사망
      base({ giftDate: "2024-04-01", specialTreatmentType: "startup" } as Partial<PriorGift>), // 조특법 특례
    ];
    const matched = aggregatePriorGiftsForGift(gifts, "2025-01-01", "father").matchedPriorGifts;
    expect(matched).toHaveLength(1);
    expect(matched[0].giftDate).toBe("2024-01-01");
  });

  it("F-2: 표가 그 헬퍼를 «실제로 호출»한다 (전건 렌더 아님)", () => {
    const src = read("components/calc/results/GiftTaxValuationFormTable.tsx");
    expect(src).toMatch(/aggregatePriorGiftsForGift\(priorGifts, giftDate, currentDonor\)/);
    expect(src).toMatch(/\{aggregatedPriorGifts\.map\(/);
    expect(src).not.toMatch(/\{priorGifts\.map\(\(pg, i\)/); // 종전 전건 렌더
  });

  it("F-3 (배관): 판정 3키가 폼 → 결과뷰 → 표까지 도달한다 (명시 매핑 strip 방지)", () => {
    const form = read("components/calc/GiftTaxForm.tsx");
    const view = read("components/calc/results/GiftTaxResultView.tsx");
    for (const k of ["specialTreatmentType", "donorDeceasedDate"]) {
      expect(form).toMatch(new RegExp(`${k}: pg\\.${k}`));
      expect(view).toMatch(new RegExp(`${k}: pg\\.${k}`));
    }
  });
});

describe("IG-080 · IG-081 — 신고기한·물납액이 화면과 신고서에서 갈리지 않는다", () => {
  it("F-4 (양성): 비거주자는 §67④ 9개월 — 훅이 공용 헬퍼에 위임한다", () => {
    const r = getInheritanceFilingDueDates("2024-01-15", "resident");
    const n = getInheritanceFilingDueDates("2024-01-15", "non_resident");
    expect(r.filing).toBe("2024-07-31");
    expect(n.filing).toBe("2024-10-31");
    const src = read("components/calc/results/useInheritanceResultDerived.ts");
    expect(src).toMatch(/getInheritanceFilingDueDates\(deathDate, decedentType\)/);
    expect(src).not.toMatch(/addMonths\(endOfMonth\(base\), 6\)/); // 종전 6개월 하드코딩
  });

  it("F-5: 물납 요건 미충족이면 ㊵에 금액을 넘기지 않는다", () => {
    const src = read("components/calc/results/useInheritanceResultDerived.ts");
    expect(src).toMatch(/if \(!d\.eligible\) return undefined;/);
  });
});

describe("IG-072 — 연부연납 가산율을 하드코딩하지 않는다", () => {
  it("F-6: 정본 상수를 렌더한다 (현행 3.1%)", () => {
    expect(CURRENT_SURCHARGE_RATE).toBeCloseTo(0.031, 5);
    const src = read("components/calc/results/GiftTaxResultViewHelpers.tsx");
    expect(src).toMatch(/CURRENT_SURCHARGE_RATE \* 100/);
    expect(src).not.toMatch(/※ 이자 상당액\(연 1\.8%/); // 종전 «렌더되던» 문자열
  });
});

describe("IG-039 — 별지6호의2 상속인별 표의 열 수가 맞는다", () => {
  it("F-7: rowSpan이 행 그룹을 넘지 않는다 — thead는 2, tbody 밴드는 파생값", () => {
    const src = read("components/calc/inheritance/deduction-besshi/Besshi6_2Section2.tsx");
    expect(src).not.toMatch(/<th className=\{H\} rowSpan=\{7\}>/); // 행 그룹을 넘던 JSX
    expect(src).toMatch(/rowSpan=\{2\}>\s*\n\s*상속인/);
    expect(src).toMatch(/rowSpan=\{minRows \+ 1\}/);   // 행 수를 파생
  });
});

describe("IG-082 — 「납부할세액 (별지9호 ㊳)」이 신고서와 같은 산식이다", () => {
  it("F-8: 카드가 가산세를 더한다 (0 하한은 가산세 가산 «전»)", () => {
    const src = read("components/calc/results/inheritance/CulturalHeritageDeferralCard.tsx");
    expect(src).toMatch(/const afterDeferral = Math\.max\(0, result\.finalTax - deferred\);/);
    expect(src).toMatch(/afterDeferral \+ underreportPenalty \+ latePaymentPenalty/);
    // 신고서 어댑터의 b43과 동형인지 — 같은 형태를 쓰는지 대조
    const adapter = read("lib/calc/filing-form-9-data.ts");
    expect(adapter).toMatch(/Math\.max\(0, result\.finalTax - b26\) \+ b36 \+ b37/);
  });
});

describe("IG-052 — 별지9호 PDF가 ㊵·㊶을 받는다", () => {
  it("F-9: PDF 버튼이 7인자로 어댑터를 부르고 부모가 그 값을 넘긴다", () => {
    const btn = read("components/calc/inheritance/filing-form-9/FilingForm9PdfDownloadButton.tsx");
    expect(btn).toMatch(/splitPaymentAmount,\s*\n\s*paymentInKindAmount,\s*\n\s*\)/);
    const section = read("components/calc/inheritance/filing-form-9/FilingForm9CoverSection.tsx");
    expect(section).toMatch(/splitPaymentAmount=\{splitPaymentAmount\}/);
    expect(section).toMatch(/paymentInKindAmount=\{paymentInKindAmount\}/);
  });
});

describe("IG-152 — 안전망이 «화면에 있는» 컴포넌트를 본다", () => {
  it("F-10: 복제본 파일과 re-export가 사라졌다", () => {
    expect(() => read("components/calc/results/deduction-breakdown/FarmingDeductionDetailRowExport.tsx")).toThrow();
    const view = read("components/calc/results/InheritanceTaxResultView.tsx");
    expect(view).not.toMatch(/FarmingDeductionDetailRowExport/);
  });
});

// ════════════════════════════════════════════════
// 결과뷰 게이트·라벨 — 렌더 픽스처가 결과 객체 전체를 요구해 비용이 큰 지점.
// 「그 줄이 되돌려졌는가」를 소스에서 잰다(G5와 같은 방식).
// ════════════════════════════════════════════════

describe("IG-070 — 납부지연만 있어도 총 납부세액이 보인다", () => {
  const src = () => read("components/calc/results/InheritanceTaxResultView.tsx");

  it("F-11 (양성): 총 납부세액 행이 «두 가산세 OR» 게이트를 쓴다", () => {
    expect(src()).toMatch(
      /\(result\.underreportPenalty \?\? 0\) > 0 \|\|\s*\n?\s*\(result\.latePaymentPenalty \?\? 0\) > 0/,
    );
  });

  it("F-12: 납부지연가산세 행이 형제로 추가됐다 (§47의4)", () => {
    expect(src()).toMatch(/납부지연가산세 \(국세기본법 §47의4\)/);
  });
});

describe("IG-068 — 증여세 헤드라인 라벨이 값을 따라간다", () => {
  it("F-13: 가산세가 있으면 「총 납부세액」으로 표기하고 내역을 병기한다", () => {
    const src = read("components/calc/results/GiftTaxResultView.tsx");
    expect(src).toMatch(/result\.totalPayableWithPenalty != null\s*\n?\s*\? "증여세 총 납부세액 \(결정세액 \+ 가산세\)"/);
    expect(src).toMatch(/결정세액 \{formatKRW\(result\.finalTax\)\} \+ 가산세/);
  });
});

describe("IG-076 — 동거주택공제 «미적용» 경로가 도달 가능하다", () => {
  it("F-14: 게이트에 detail 존재 조건이 OR로 들어갔다", () => {
    const src = read("components/calc/results/deduction-breakdown/DeductionBreakdownSection.tsx");
    expect(src).toMatch(/dd\.cohabitationDeduction > 0 \|\| dd\.cohabitDeductionDetail !== undefined/);
  });
});

describe("IG-077 — §24 차감 행 중복 제거 + 조문 표기 정정", () => {
  it("F-15 (양성): 상속포기 차감 행이 «하나»다", () => {
    const src = read("components/calc/results/deduction-breakdown/DeductionLimitDetailCard.tsx");
    const rows = src.match(/detail\.heirWaiverAmount > 0 && \(/g) ?? [];
    expect(rows).toHaveLength(1);
  });

  it("F-16: §24에는 «항»이 없다 — 화면 인용이 호만 쓴다 (실측: 상증법 §24 본문 + 1~3호)", () => {
    const src = read("components/calc/results/deduction-breakdown/DeductionLimitDetailCard.tsx");
    expect(src).not.toMatch(/§24 ?[①②③]/);
    expect(src).toMatch(/§24 1호/);
    expect(src).toMatch(/§24 2호/);
    expect(src).toMatch(/§24 3호/);
  });

  it("F-17 (대조군): 다른 법령의 §24 항 표기는 «그대로» 남는다 — 전역 치환 금지 축", () => {
    // 법인세법 시행령 §24①2호바목(개발비)은 ①이 정당하다. 조번호만 같은 다른 법령이다.
    const src = read("lib/tax-engine/property-valuation/net-asset-calc.ts");
    expect(src).toMatch(/법인세령 §24①2호바목/);
  });
});

// IG-054는 «렌더» anchor로 옮겼다(H-6·H-7) — 소스 문자열 축은 게이트를 `false`로 바꿔도
// 본문 표현식이 남아 통과해 «구별력 0»이었다.
