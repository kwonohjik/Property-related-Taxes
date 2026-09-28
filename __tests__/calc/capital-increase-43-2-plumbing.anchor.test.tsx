/**
 * anchor #19 배관 — §39 §43② 1년 합산 입력이 폼 → ④ → ⑫ → 엔진까지 닿는가, ⑧·⑤가 같은 조건을 쓰는가.
 * 엔진 규칙은 `__tests__/tax-engine/gift-deemed/capital-increase-43-2-aggregation.anchor.test.ts`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import type { CapitalIncreaseAllocationInput } from "@/lib/tax-engine/gift-deemed/types";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/deemed-form-state";
import { makeCapTableRow } from "@/components/calc/deemed-gift/deemed-form-rows";
import { CapitalIncreaseFields, CapitalIncreaseAllocationFields } from "@/components/calc/deemed-gift/capital-forms";
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/types";

afterEach(cleanup);

const LOW_NR: DeemedFormState = {
  ...INITIAL_DEEMED, type: "capital_increase", giftDate: "2026-03-02", ciDirection: "low", ciSubType: "no_realloc",
  ciPrePrice: "100,000", ciPreShares: "1,000,000", ciNewPrice: "90,000", ciIssuedShares: "200,000", ciForfeitedShares: "24,000",
  // ⑧ 필수 — 이익이 바뀌지 않는 값: 균등증자 = 실제 증자(㉯ 불변) · 증자후 지분비율 1 × 특수관계인 실권주 24,000(귀속 불변)
  ciEqualIssueShares: "200,000", ciRelatedAcquiredShares: "24,000", ciPostHeldShares: "1,200,000", ciPostTotalShares: "1,200,000",
  ciPriorSameClauseRows: [{ id: "p1", date: "2025-09-01", benefit: "199,992,000", label: "" }],
};

/** route와 같은 순서 — ④ → JSON 왕복 → ⑫ → 엔진 */
function endToEnd(form: DeemedFormState) {
  const body = JSON.parse(JSON.stringify(buildDeemedGiftInput(form)));
  const parsed = deemedGiftInputSchema.safeParse(body);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  return calcDeemedGift(parsed.data as DeemedGiftInput);
}

describe("#19 단건 배관", () => {
  it("[AP-1] 🔴 나목 선행 행이 ④·⑫를 지나 엔진에 닿는다 — 199,992,000 과세", () => {
    const r = endToEnd(LOW_NR);
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(199_992_000);
  });

  it("[AP-2] 짝 — 선행 행이 없으면 0", () => {
    expect(endToEnd({ ...LOW_NR, ciPriorSameClauseRows: [] }).applied).toBe(false);
  });

  it("[AP-3] 나목이 아니면(가목) 남아 있는 행을 보내지 않는다 — ⑤와 같은 조건", () => {
    const body = buildDeemedGiftInput({ ...LOW_NR, ciSubType: "forfeited_realloc" }) as { priorSameClauseGains?: unknown };
    expect(body.priorSameClauseGains).toBeUndefined();
  });

  it("[AP-4] ⑧ — 날짜·이익이 빈 행과 증여일보다 뒤인 행을 막는다", () => {
    expect(validateDeemedInput({ ...LOW_NR, ciPriorSameClauseRows: [{ id: "p", date: "", benefit: "1", label: "" }] }))
      .toContain("선행 증자 1의 증여일");
    expect(validateDeemedInput({ ...LOW_NR, ciPriorSameClauseRows: [{ id: "p", date: "2026-04-01", benefit: "1", label: "" }] }))
      .toContain("소급");
    expect(validateDeemedInput({ ...LOW_NR, ciPriorSameClauseRows: [{ id: "p", date: "2025-09-01", benefit: "", label: "" }] }))
      .toContain("선행 증자 1의 이익");
    expect(validateDeemedInput(LOW_NR)).toBeNull(); // 짝
  });

  it("[AP-5] ⑤ — 표는 나목에서만 보인다(저가·고가 모두)", () => {
    const { rerender } = render(<CapitalIncreaseFields form={LOW_NR} set={() => {}} />);
    expect(screen.getByTestId("ci-prior-tx-table")).toBeInTheDocument();
    rerender(<CapitalIncreaseFields form={{ ...LOW_NR, ciDirection: "high" }} set={() => {}} />);
    expect(screen.getByTestId("ci-prior-tx-table")).toBeInTheDocument();
    rerender(<CapitalIncreaseFields form={{ ...LOW_NR, ciSubType: "forfeited_realloc" }} set={() => {}} />);
    expect(screen.queryByTestId("ci-prior-tx-table")).toBeNull();
  });
});

describe("#19 cap-table 배관", () => {
  const rows = (prior: string) => [
    { ...makeCapTableRow("A"), name: "A", preShares: "900,000", entitledShares: "180,000", subscribedShares: "0" },
    { ...makeCapTableRow("B"), name: "B", preShares: "100,000", entitledShares: "20,000", subscribedShares: "20,000", relatedTo: ["A"], priorSameClauseGain: prior },
  ];
  const form = (prior: string): DeemedFormState => ({
    ...INITIAL_DEEMED, type: "capital_increase_allocation", giftDate: "2026-03-02", ciAllocDirection: "low",
    ciAllocPrePrice: "100,000", ciAllocNewPrice: "90,000", ciAllocRows: rows(prior),
  });

  it("[APC-1] 🔴 행의 선행 이익 합계가 ④·⑫를 지나 게이트에 닿는다 — B 176,360,000 과세", () => {
    const body = JSON.parse(JSON.stringify(buildDeemedGiftInput(form("123,640,000"))));
    const parsed = deemedGiftInputSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    // route와 같은 경로 — cap-table은 라우터가 아니라 전용 함수로 간다(리뷰 G-13)
    const r = calcCapitalIncreaseAllocation(parsed.data as unknown as CapitalIncreaseAllocationInput);
    expect(r.perBeneficiary.find((p) => p.beneficiaryId === "B")?.total).toBe(176_360_000);
  });

  it("[APC-2] 짝 — 빈 칸이면 보내지 않고 B는 0", () => {
    const body = buildDeemedGiftInput(form("")) as unknown as { shareholders: { priorSameClauseGain?: number }[] };
    expect(body.shareholders[1].priorSameClauseGain).toBeUndefined();
  });

  it("[APC-3] ⑤ — 각 행에 선행 이익 합계 칸이 있다", () => {
    render(<CapitalIncreaseAllocationFields form={form("")} set={() => {}} />);
    expect(screen.getByTestId("ci-alloc-prior-0")).toBeInTheDocument();
    expect(screen.getByTestId("ci-alloc-prior-1")).toBeInTheDocument();
  });
});
