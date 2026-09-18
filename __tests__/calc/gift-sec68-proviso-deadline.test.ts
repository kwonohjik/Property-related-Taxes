/**
 * anchor(SC-K·RC-P): 상증법 §68① **단서** — §45의3·§45의5의 증여세 신고기한.
 *
 * 법 §68① 단서 verbatim(후단): 「… 제45조의3 및 제45조의5에 따른 증여세 과세표준 신고기한은
 * 수혜법인 또는 특정법인의 「법인세법」 제60조제1항에 따른 과세표준의 신고기한이 속하는 달의
 * 말일부터 3개월이 되는 날로 한다.」
 * 법인세법 §60① verbatim: 「각 사업연도의 종료일이 속하는 달의 말일부터 3개월(… 성실신고확인서를
 * 제출하는 경우에는 4개월로 한다) 이내에 …」
 *
 * 종전에는 ④가 §68① «본문»만 파생해 기한이 3개월 일렀고, 그 값이 §48②2호 기한후신고 감면
 * «구간»을 갈랐다. 엔진(`inheritance-gift-penalty.ts:76`)과 ④(`gift-api.ts:127`)가 둘 다
 * 「④가 파생한다 — 단서 케이스 때문」이라 적어 두었는데 그 책임층이 단서를 몰랐다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildDueDatesFrom,
  getGiftFilingDueDates,
  getSec68ProvisoGiftFilingDueDates,
} from "@/lib/calc/inheritance-gift-filing-deadline";
import { calcInheritanceGiftFilingPenalty } from "@/lib/tax-engine/inheritance-gift-penalty";
import { resolveGiftStatutoryDeadline } from "@/lib/calc/gift-api";
import { buildGiftWizardPrefill } from "@/lib/calc/gift-deemed-api";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";

describe("기한 파생 — 2단 기산", () => {
  it("[P-0] 12월말 결산 → 본문 2025-03-31 / 단서 2025-06-30 (정확히 3개월 차)", () => {
    expect(getGiftFilingDueDates("2024-12-31")?.filing).toBe("2025-03-31");
    expect(getSec68ProvisoGiftFilingDueDates("2024-12-31")?.filing).toBe("2025-06-30");
  });

  it("[P-1] 성실신고확인서 제출 법인은 1단이 4개월 (법인세법 §60① 괄호)", () => {
    expect(getSec68ProvisoGiftFilingDueDates("2024-12-31", true)?.filing).toBe("2025-07-30");
  });

  it("[P-2] 3월말 결산도 같은 규칙으로 밀린다 — 12월말 전용 상수가 아니다", () => {
    expect(getSec68ProvisoGiftFilingDueDates("2025-03-31")?.filing).toBe("2025-09-30");
    expect(getSec68ProvisoGiftFilingDueDates("2024-06-30")?.filing).toBe("2024-12-30");
  });

  it("[P-3] 분납기한은 §70② 그대로 신고기한 + 2개월", () => {
    expect(getSec68ProvisoGiftFilingDueDates("2024-12-31")?.installment).toBe("2025-08-30");
    expect(buildDueDatesFrom("2025-06-30")?.installment).toBe("2025-08-30");
  });

  it("[P-4] 사업연도 종료일이 없으면 undefined — 본문으로 되메우지 않는다", () => {
    expect(getSec68ProvisoGiftFilingDueDates(undefined)).toBeUndefined();
    expect(getSec68ProvisoGiftFilingDueDates("")).toBeUndefined();
    expect(getSec68ProvisoGiftFilingDueDates("not-a-date")).toBeUndefined();
  });
});

describe("세액 영향 — §48②2호 감면 구간", () => {
  // 결정세액 10억 · 기한후신고 2025-08-15.
  // 본문 기한(2025-03-31) 기준이면 4.5개월 경과 → 20% 감면.
  // 단서 기한(2025-06-30) 기준이면 1.5개월 경과 → 30% 감면.
  const run = (deadline: string) =>
    calcInheritanceGiftFilingPenalty(1_000_000_000, {
      filingStatus: "late",
      actualFilingDate: "2025-08-15",
      statutoryDeadline: deadline,
    });

  it("[P-5] 본문 160,000,000 → 단서 140,000,000 (20,000,000원 과다였다)", () => {
    expect(run("2025-03-31").filingPenalty).toBe(160_000_000);
    expect(run("2025-06-30").filingPenalty).toBe(140_000_000);
  });

  it("[P-5b] 갈리는 것은 «감면율»이다 — 총가산세는 같다", () => {
    expect(run("2025-03-31").reductionRate).toBe(0.2);
    expect(run("2025-06-30").reductionRate).toBe(0.3);
    expect(run("2025-03-31").grossPenalty).toBe(run("2025-06-30").grossPenalty);
  });
});

describe("④ — 이관된 기한을 우선한다", () => {
  const form = (over: Partial<FormState>): FormState =>
    ({ ...INITIAL_FORM, giftDate: "2024-12-31", ...over }) as FormState;

  it("[P-6] statutoryDeadline이 있으면 그것을, 없으면 본문을 쓴다", () => {
    expect(resolveGiftStatutoryDeadline(form({ statutoryDeadline: "2025-06-30" }))).toBe("2025-06-30");
    expect(resolveGiftStatutoryDeadline(form({}))).toBe("2025-03-31");
  });

  it("[P-6b] 공백 문자열은 «없음»으로 본다 — 빈 값이 기한을 지우지 않는다", () => {
    expect(resolveGiftStatutoryDeadline(form({ statutoryDeadline: "   " }))).toBe("2025-03-31");
  });
});

describe("⑧ — 단서 건의 공란을 막는다", () => {
  const f = (over: Partial<FormState>): FormState =>
    ({
      ...INITIAL_FORM,
      giftDate: "2024-12-31",
      filingStatus: "late",
      lateFilingDate: "2025-08-15",
      ...over,
    }) as FormState;

  it("[P-7] 단서 표지 + 기한 공란 + 기한후신고 → 차단", () => {
    expect(validateStep(3, f({ filingDeadlineBasis: "sec68_1_proviso" }))).toContain("§68① 단서");
  });

  it("[P-7b] 긍정 짝 — 기한이 실려 있으면 통과", () => {
    expect(
      validateStep(3, f({ filingDeadlineBasis: "sec68_1_proviso", statutoryDeadline: "2025-06-30" })),
    ).toBeNull();
  });

  it("[P-7c] 단서 건이 아니면 기한이 없어도 통과 — 본문 건까지 막지 않는다", () => {
    expect(validateStep(3, f({}))).toBeNull();
  });

  it("[P-7d] 정기신고면 단서 건이어도 막지 않는다 — 기한이 닿는 곳은 late뿐이다", () => {
    expect(
      validateStep(3, f({ filingDeadlineBasis: "sec68_1_proviso", filingStatus: "on_time", lateFilingDate: "" })),
    ).toBeNull();
  });
});

describe("이관 payload — 단서 표지와 기한", () => {
  it("[P-8] §45의3은 증여일이 곧 사업연도 종료일이라 추가 입력 없이 파생된다", () => {
    const out = buildGiftWizardPrefill(
      { type: "related_corp", giftDate: "2024-12-31", corpHonestFilingConfirm: false } as never,
      { type: "related_corp", deemedGiftValue: 1_000_000, applied: true, breakdown: [] } as never,
    );
    expect(out.filingDeadlineBasis).toBe("sec68_1_proviso");
    expect(out.statutoryDeadline).toBe("2025-06-30");
  });

  it("[P-8b] §45의5는 «거래일»이 아니라 특정법인 사업연도 종료일에서 파생된다", () => {
    const out = buildGiftWizardPrefill(
      {
        type: "specific_corp",
        giftDate: "2025-05-20", // 거래한 날 — 사업연도와 무관
        scCorpFiscalYearEndDate: "2024-12-31",
        corpHonestFilingConfirm: false,
      } as never,
      { type: "specific_corp", deemedGiftValue: 1_000_000, applied: true, breakdown: [] } as never,
    );
    expect(out.statutoryDeadline).toBe("2025-06-30");
  });

  it("[P-8c] 파생하지 못하면 기한을 «넣지 않고» 표지만 보낸다 — 본문으로 되메우지 않는다", () => {
    const out = buildGiftWizardPrefill(
      { type: "specific_corp", giftDate: "2025-05-20", scCorpFiscalYearEndDate: "" } as never,
      { type: "specific_corp", deemedGiftValue: 1_000_000, applied: true, breakdown: [] } as never,
    );
    expect(out.filingDeadlineBasis).toBe("sec68_1_proviso");
    expect(out.statutoryDeadline).toBeUndefined();
  });

  it("[P-8e] 성실신고확인 플래그가 이관 파생까지 도달한다 — 4개월 기산", () => {
    const out = buildGiftWizardPrefill(
      { type: "related_corp", giftDate: "2024-12-31", corpHonestFilingConfirm: true } as never,
      { type: "related_corp", deemedGiftValue: 1_000_000, applied: true, breakdown: [] } as never,
    );
    expect(out.statutoryDeadline).toBe("2025-07-30");
  });

  it("[P-8d] 단서 대상이 아닌 유형에는 표지가 붙지 않는다", () => {
    const out = buildGiftWizardPrefill(
      { type: "free_loan", giftDate: "2024-12-31" } as never,
      { type: "free_loan", deemedGiftValue: 1_000_000, applied: true, breakdown: [] } as never,
    );
    expect(out.filingDeadlineBasis).toBeUndefined();
  });
});

/**
 * 배관 — 파생이 맞아도 «화면이 그 값을 쓰지 않으면» 사용자에게는 여전히 틀린 기한이 보인다.
 * 전건 렌더 대신 저장소의 확립된 소스 단언 관용구를 쓴다
 * (`ig-ui-g6-resultview-besshi.anchor.test.ts` F-3 「명시 매핑 strip 방지」와 같은 층위).
 */
describe("배관 — 폼 → 결과뷰", () => {
  const read = (p: string) => readFileSync(p, "utf-8");

  it("[P-9] GiftTaxForm이 statutoryDeadline을 결과뷰로 넘긴다", () => {
    expect(read("components/calc/GiftTaxForm.tsx")).toMatch(
      /statutoryDeadline=\{form\.statutoryDeadline\}/,
    );
  });

  it("[P-9b] 결과뷰는 이관된 기한을 «우선»하고, 없을 때만 본문을 파생한다", () => {
    const view = read("components/calc/results/GiftTaxResultView.tsx");
    expect(view).toMatch(/if \(provided\) return buildDueDatesFrom\(provided\);/);
    expect(view).toMatch(/return getGiftFilingDueDates\(giftDate\);/);
    // 종전: 무조건 본문 파생 — 이 형태가 남아 있으면 이관 값이 화면에 닿지 않는다
    expect(view).not.toMatch(/useMemo\(\(\) => getGiftFilingDueDates\(giftDate\), \[giftDate\]\)/);
  });
});
