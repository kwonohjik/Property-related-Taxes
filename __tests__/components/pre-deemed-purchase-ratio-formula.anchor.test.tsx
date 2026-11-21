/**
 * R-c07-07 — 의제취득일 전 매수 카드 ②의 산식이 옆 칸 금액을 그대로 다시 만든다.
 *
 * 종전 `ratio.toFixed(4)` 표기는 반올림한 배율을 산식 인수로 써서, 식대로 계산하면 1975.03. 취득 3,000만 −542원 ·
 * 1980.01. 취득 1억 −1,686원 · 직접 입력 12.345678 +220원이 어긋났다. 엔진(`computePreDeemedClause2`)이 쓴 원천 수량 —
 * 지수표 경로는 두 지수, 직접 입력은 `ratioToScaled6`와 같은 소수 6자리 — 를 적는다.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PreDeemedPurchaseResultCard } from "@/components/calc/results/transfer/PreDeemedPurchaseResultCard";
import { computePreDeemedClause2 } from "@/lib/tax-engine/pre-deemed-purchase-clause2";
import type { PreDeemedPurchaseDetail } from "@/lib/tax-engine/types/transfer-pre-deemed-purchase.types";

afterEach(cleanup);

const toScaled = (s: string, scale: number) => {
  const [i, f = ""] = s.split(".");
  return BigInt(i + f.padEnd(scale, "0").slice(0, scale));
};

/** 카드 ② 산식 칸을 읽어 «실가 × 분자 지수 / 분모 지수» 또는 «실가 × 배율»을 고정소수 BigInt로 다시 계산(floor) */
function renderCase(actual: number, acq: string, ppiRatio?: number) {
  const c2 = computePreDeemedClause2(actual, { originalAcquisitionDate: new Date(acq), ppiRatio })!;
  const detail: PreDeemedPurchaseDetail = { ...c2, selected: "clause2", expenseBasis: "actual" };
  render(<PreDeemedPurchaseResultCard detail={detail} />);
  const span = [...screen.getByTestId("pre-deemed-purchase-result-card").querySelectorAll("span")].find((s) =>
    s.textContent?.startsWith("실지거래가액"),
  )!;
  const text = span.textContent ?? "";
  const base = BigInt(text.match(/실지거래가액 ([\d,]+) ×/)![1].replace(/,/g, ""));
  const frac = span.querySelector("span.inline-flex");
  let recomputed: number;
  if (frac) {
    const [top, bottom] = [...frac.children].map((c) => c.textContent!.match(/^\d{4}-\d{2} 지수 ([\d.]+)$/)![1]);
    recomputed = Number((base * toScaled(top, 2)) / toScaled(bottom, 2));
  } else {
    const r = text.match(/× ([\d.]+) \(직접 입력 배율\)/)![1];
    recomputed = Number((base * toScaled(r, 6)) / BigInt(1_000_000));
  }
  return { text, recomputed, amount: c2.clause2Amount };
}

describe("의제취득일 전 매수 카드 ② 산식 (R-c07-07)", () => {
  it.each([
    ["1975.03. 취득 3,000만", 30_000_000, "1975-03-15"],
    ["1980.01. 취득 1억", 100_000_000, "1980-01-10"],
  ])("🔑 지수표 경로 %s — 실가 × 직전 달 지수 ÷ 취득월 지수 = 옆 칸 금액", (_n, actual, acq) => {
    const { text, recomputed, amount } = renderCase(actual, acq);
    expect(text).not.toMatch(/× \d+\.\d{4}(?!\d)/);
    expect(recomputed).toBe(amount);
  });

  it("🔑 직접 입력 배율 12.345678 — 소수 6자리 그대로", () => {
    const { text, recomputed, amount } = renderCase(100_000_000, "1960-05-01", 12.345678);
    expect(text).toContain("× 12.345678 (직접 입력 배율)");
    expect(recomputed).toBe(amount);
  });
});
