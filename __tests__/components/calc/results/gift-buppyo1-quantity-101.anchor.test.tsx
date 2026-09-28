/**
 * anchor #101 — 증여 별지 제10호서식 부표1 ⑤ 수량(면적)·⑥ 단가.
 *
 * 설계: docs/00-pm/gift39-101-buppyo1-quantity.plan.md
 *
 * ① §39 이관 항목은 ⑤·⑥ **공란이 정답**이다 — 「상증법」§39①은 「그 이익에 상당하는 **금액**을
 *    … 증여재산가액으로 한다」이고, 「상증칙」 별지 제10호서식 부표1 작성방법에는 ⑤·⑥ 기재 지시가
 *    없다. 엔진 산출근거(1주당 이익 2,500 × 이익 귀속 주식수 40,000)를 칸에 주입하는 원 수정안은
 *    리뷰 법령 렌즈가 기각했다(그 단가는 주식 평가단가도 인수가액도 아니다).
 * ② 증여 마법사에서 **입력되는데 버려지던** 값은 부동산 면적(`areaSqm` — 동·호 조회 자동채움·
 *    부담부증여 면적)뿐이었다. 상속 부표2(`besshi-buppyo-2-data.ts`)는 이미 ⑤에 면적을 싣는다.
 * ③ `quantityCount`는 입력 위젯(`EstateValuationMetaSection`)이 **상속 모드 전용**이라
 *    증여에는 입력 경로가 없다 — 읽지 않는다(리뷰 대안 `?? quantityCount`는 효과 0).
 */
import { describe, it, expect, afterEach } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { render, screen, within, cleanup } from "@testing-library/react";
import { GiftTaxValuationFormTable } from "@/components/calc/results/GiftTaxValuationFormTable";
import { GiftValuationFormPdfPage } from "@/lib/pdf/GiftValuationFormPdfDocument";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { buildGiftWizardPrefill } from "@/lib/calc/gift-deemed-prefill";
import { INITIAL_DEEMED } from "@/components/calc/deemed-gift/deemed-form-state";
import type { EstateItem, PropertyValuationResult } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(cleanup);

const vr = (id: string, amt: number): PropertyValuationResult => ({
  estateItemId: id, method: "market_value", valuatedAmount: amt, breakdown: [], warnings: [],
});

function collectText(node: ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    if (typeof el.type === "function") {
      try {
        return collectText((el.type as (p: unknown) => ReactNode)(el.props));
      } catch {
        return collectText(el.props.children);
      }
    }
    return collectText(el.props.children);
  }
  return "";
}

function renderBoth(items: EstateItem[], vrs: PropertyValuationResult[]) {
  const total = vrs.reduce((a, v) => a + v.valuatedAmount, 0);
  const props = { valuationResults: vrs, estateItems: items, grossGiftValue: total, exemptAmount: 0, aggregatedGiftValue: total };
  render(<GiftTaxValuationFormTable {...props} />);
  const pdfText = collectText(<GiftValuationFormPdfPage {...props} />);
  const cells = (i: number) => {
    const row = screen.getByTestId(`row-data-${i}`);
    return {
      qty: within(row).getByTestId("col-shares").textContent?.trim(),
      unit: within(row).getByTestId("col-unit-price").textContent?.trim(),
    };
  };
  return { cells, pdfText };
}

const APT = { id: "apt", category: "real_estate_apartment", name: "아파트", areaSqm: 84.57 } as EstateItem;

describe("#101 증여 부표1 ⑤·⑥", () => {
  it("[B1-1] 부동산 면적(areaSqm 84.57)이 화면 ⑤에 표시된다 · ⑥은 공란", () => {
    const { cells } = renderBoth([APT], [vr("apt", 500_000_000)]);
    expect(cells(1).qty).toBe("84.57");
    expect(cells(1).unit).toBe("");
  });

  it("[B1-2] PDF 쌍둥이도 같은 ⑤ 값을 싣는다", () => {
    const { pdfText } = renderBoth([APT], [vr("apt", 500_000_000)]);
    expect(pdfText).toContain("84.57");
  });

  it("[B1-3] 긍정 짝 — 상장주식은 종전대로 ⑤ 주식수 · ⑥ 평균단가 (화면·PDF)", () => {
    const stock = { id: "s", category: "listed_stock", name: "상장주", listedStockShares: 1_234, listedStockAvgPrice: 56_789 } as EstateItem;
    const { cells, pdfText } = renderBoth([stock], [vr("s", 70_077_626)]);
    expect(cells(1).qty).toBe("1,234");
    expect(cells(1).unit).toBe("56,789");
    expect(pdfText).toContain("1,234");
    expect(pdfText).toContain("56,789");
  });

  it("[B1-4] 🔴 §39 이관 항목은 ⑤·⑥ 공란 — 엔진 산출근거 2,500 × 40,000을 칸에 주입하지 않는다", () => {
    const deemedInput = {
      type: "capital_increase" as const, preIssuePrice: 10_000, preIssueShares: 100_000, newSharePrice: 5_000,
      issuedShares: 100_000, forfeitedShares: 40_000,
    };
    const result = calcDeemedGift(deemedInput);
    // 부정 단언의 전제 — 그 수들은 엔진에 **실재**한다(없어서 안 찍히는 것이 아니다)
    expect(result.deemedGiftValue).toBe(100_000_000);
    const amounts = result.breakdown.map((b) => b.amount);
    expect(amounts).toContain(2_500);
    expect(amounts).toContain(40_000);

    const prefill = buildGiftWizardPrefill({ ...INITIAL_DEEMED, type: "capital_increase", giftDate: "2026-03-02" }, result);
    const item = prefill.giftItems![0] as EstateItem;
    const { cells, pdfText } = renderBoth([item], [vr(item.id, 100_000_000)]);
    expect(cells(1).qty).toBe("");
    expect(cells(1).unit).toBe("");
    expect(pdfText).not.toContain("40,000");
    expect(pdfText).not.toContain("2,500");
  });

  it("[B1-5] 부동산이 아닌 항목에 남은 areaSqm(카테고리 변경 잔존)은 싣지 않는다", () => {
    const stale = { id: "o", category: "other", name: "기타", areaSqm: 33.3 } as EstateItem;
    const { cells, pdfText } = renderBoth([stale], [vr("o", 10_000_000)]);
    expect(cells(1).qty).toBe("");
    expect(pdfText).not.toContain("33.3");
  });

  it("[B1-6] quantityCount는 증여에 입력 경로가 없어 읽지 않는다(상속 모드 전용 위젯)", () => {
    const other = { id: "q", category: "other", name: "그림", quantityCount: 7 } as EstateItem;
    const { cells } = renderBoth([other], [vr("q", 30_000_000)]);
    expect(cells(1).qty).toBe("");
  });
});
