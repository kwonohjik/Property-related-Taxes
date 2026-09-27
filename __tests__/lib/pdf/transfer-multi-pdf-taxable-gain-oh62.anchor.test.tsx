/**
 * anchor — 다건 PDF 자산별 표의 고가주택 안분 후 과세대상 양도차익 (OH-62 형제)
 *
 * 종전: 전체 양도차익 900,000,000 → 장특 102,857,142 → 양도소득금액 25,714,286으로 바로 넘어가
 *       표의 산술(900,000,000 − 102,857,142)이 양도소득금액과 맞지 않았다.
 * 이제: 과세대상 양도차익 128,571,428 행이 서고, 128,571,428 − 102,857,142 = 25,714,286이 성립한다.
 *       안분이 없는 자산은 행을 내지 않는다.
 */
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { TransferMultiSection } from "@/lib/pdf/ResultPdfTransferSections";

function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const c of node) collect(c, out);
    return out;
  }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") {
    collect((el.type as (p: unknown) => unknown)(el.props), out);
    return out;
  }
  collect((el.props as { children?: unknown } | undefined)?.children, out);
  return out;
}

const after = (t: string[], label: string, from = 0) => {
  const i = t.indexOf(label, from);
  return i >= 0 ? t[i + 1] : undefined;
};

function property(over: Record<string, unknown>) {
  return {
    propertyId: "h1",
    propertyLabel: "주택 A",
    isExempt: false,
    transferPrice: 1_400_000_000,
    acquisitionPrice: 500_000_000,
    transferGain: 900_000_000,
    longTermHoldingDeduction: 102_857_142,
    income: 25_714_286,
    taxBaseShare: 25_714_286,
    ...over,
  };
}

function render(properties: Record<string, unknown>[]) {
  return collect(
    TransferMultiSection({
      r: { properties, lossOffsetTable: [], localIncomeTax: 0 } as Record<string, unknown>,
    }),
  );
}

describe("다건 PDF — 안분 후 과세대상 양도차익 행", () => {
  it("부분 비과세 고가주택: 과세대상 행이 서고 산술이 성립한다", () => {
    const t = render([property({})]);
    const start = t.indexOf("주택 A");
    expect(after(t, "전체 양도차익", start)).toBe("900,000,000");
    expect(after(t, "과세대상 양도차익", start)).toBe("128,571,428");
    expect(128_571_428 - 102_857_142).toBe(25_714_286);
    expect(after(t, "양도소득금액", start)).toBe("25,714,286");
  });

  it("안분 없는 자산: 행을 내지 않는다", () => {
    const t = render([
      property({ propertyLabel: "토지 B", transferGain: 400_000_000, longTermHoldingDeduction: 0, income: 400_000_000 }),
    ]);
    expect(t).not.toContain("과세대상 양도차익");
  });
});
