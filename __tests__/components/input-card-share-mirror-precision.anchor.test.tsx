/**
 * 입력 카드 지분 안내 금액 — `Math.floor(금액 × 지분)` 1원 과소 → `applyRatio` (십진 정확)
 *
 * 계획: docs/00-pm/input-card-share-mirror-precision.plan.md §5.3
 *
 * 대상 2곳 (둘 다 표시 전용 — store·API로 가지 않는다):
 *   A. `CompanionSaleModeBlock` 「자동 계산 (총 양도가액 × 지분율)」 카드
 *   B. `AssetSectionExpense` 「양도비」 칸(잠김) 값 + 힌트 「자동 안분 …」
 * 화면 숫자가 ④(`callTransferTaxAPI`)가 엔진에 싣는 값과 같아야 한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CompanionSaleModeBlock } from "@/components/calc/transfer/CompanionSaleModeBlock";
import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const noop = () => {};
const AUTO = "자동 계산 (총 양도가액 × 지분율)";

/** [지분 %, 입력 금액, 기대(참값) 금액] — 옛 식 `Math.floor(금액 × (p/100))`이 기대 − 1을 내는 쌍 (plan §3.1) */
const PAIRS: ReadonlyArray<readonly [string, number, string]> = [
  ["70", 340_000_000, "238,000,000"],
  ["70", 21_000_000, "14,700,000"],
  ["35", 90_000_000, "31,500,000"],
  ["57", 50_000_000, "28,500,000"],
  ["90.6", 50_000_000, "45,300,000"],
  ["58.12", 50_000_000, "29,060,000"],
];

const comma = (n: number) => n.toLocaleString();

function renderSaleCard(p: string, total: number, mode: "single" | "axisB" = "single") {
  render(
    <CompanionSaleModeBlock
      assetKind="land"
      bundledSaleMode="actual"
      actualSalePrice=""
      onActualSalePriceChange={noop}
      standardPriceAtTransfer=""
      onStandardPriceAtTransferChange={noop}
      transferDate="2026-02-16"
      {...(mode === "single" ? { singleMode: true } : { isFractionalSplit: true })}
      ownershipNumerator={p}
      ownershipDenominator="100"
      contractTotalPrice={String(total)}
    />,
  );
  return screen.getByText(AUTO).nextElementSibling!.textContent!;
}

function renderExpense(p: string, d: string, totalTransferExpense: string, onChange = vi.fn()) {
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "land",
    ownershipNumerator: p,
    ownershipDenominator: d,
  } as AssetForm;
  const { container } = render(
    <AssetSectionExpense asset={asset} onChange={onChange} totalTransferExpense={totalTransferExpense} />,
  );
  const input = screen.getByLabelText(/양도비 \(원\)/) as HTMLInputElement;
  return { input, text: container.textContent ?? "", onChange };
}

describe("PREMISE — 이 쌍들은 옛 식이 1원 과소인 입력이다", () => {
  for (const [p, x, expected] of PAIRS) {
    it(`${p}% · ${comma(x)}: 옛 식 = 기대 − 1`, () => {
      const old = Math.floor(x * (parseFloat(p) / parseFloat("100")));
      expect(comma(old + 1)).toBe(expected);
    });
  }
});

describe("A — 자동 계산 카드는 applyRatio 값을 보인다", () => {
  for (const [p, x, expected] of PAIRS) {
    it(`단건 ${p}% · ${comma(x)} → ${expected} 원`, () => {
      const text = renderSaleCard(p, x);
      expect(text).toBe(`${expected} 원`);
      expect(text).not.toContain(comma(Math.floor(x * (parseFloat(p) / 100))));
    });
  }
  it("축 B(isFractionalSplit) 70% · 340,000,000 → 238,000,000 원", () => {
    expect(renderSaleCard("70", 340_000_000, "axisB")).toBe("238,000,000 원");
  });
});

describe("B — 양도비 칸·힌트는 applyRatio 값을 보인다", () => {
  for (const [p, x, expected] of PAIRS) {
    it(`${p}% · 총 양도비 ${comma(x)} → ${expected}`, () => {
      const { input, text, onChange } = renderExpense(p, "100", String(x));
      expect(input.value).toBe(expected);
      expect(input.disabled).toBe(true);
      expect(text).toContain(`자동 안분 ${expected} = 총 양도비 ${comma(x)}`);
      // 표시 전용 — 마운트에서 store로 쓰지 않는다
      expect(onChange).not.toHaveBeenCalled();
    });
  }
});

describe("대조군 — 바뀌면 안 되는 값", () => {
  it("50% · 170,000,000 → 85,000,000 (옛 식도 같은 값)", () => {
    expect(renderSaleCard("50", 170_000_000)).toBe("85,000,000 원");
    cleanup();
    const { input } = renderExpense("50", "100", "170000000");
    expect(input.value).toBe("85,000,000");
  });
  it("100%(fractional 아님) → 양도비 칸 value 빈 값", () => {
    const { input, text } = renderExpense("100", "100", "170000000");
    expect(input.value).toBe("");
    expect(text).not.toContain("자동 안분");
  });
  it("레거시 1/3 × 300,000,000 → 100,000,000 (순환 소수 — applyRatio float 갈래)", () => {
    const { input } = renderExpense("1", "3", "300000000");
    expect(input.value).toBe("100,000,000");
    cleanup();
    render(
      <CompanionSaleModeBlock
        assetKind="land"
        bundledSaleMode="actual"
        actualSalePrice=""
        onActualSalePriceChange={noop}
        standardPriceAtTransfer=""
        onStandardPriceAtTransferChange={noop}
        transferDate="2026-02-16"
        singleMode
        ownershipNumerator="1"
        ownershipDenominator="3"
        contractTotalPrice="300000000"
      />,
    );
    expect(screen.getByText(AUTO).nextElementSibling!.textContent).toBe("100,000,000 원");
  });
});

describe("카드 = ④ body — 화면 숫자가 엔진으로 가는 값과 같다", () => {
  async function captureBody(p: string, price: number, expense: number) {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ success: false, error: { code: "X", message: "anchor" } }), { status: 400 });
      }),
    );
    const form = {
      ...createDefaultTransferFormData(),
      transferDate: "2026-02-16",
      contractTotalPrice: String(price),
      totalTransferExpense: String(expense),
      assets: [
        {
          ...makeDefaultAsset(1),
          assetKind: "land",
          acquisitionCause: "purchase",
          acquisitionDate: "2024-06-01",
          fixedAcquisitionPrice: "180000000",
          transferArea: "300",
          acquisitionArea: "300",
          ownershipNumerator: p,
          ownershipDenominator: "100",
          ownershipRemainderThirdParty: "yes",
        },
      ],
    } as unknown as Parameters<typeof callTransferTaxAPI>[0];
    try {
      await callTransferTaxAPI(form);
    } catch {
      // 400 응답은 예외로 올라온다 — body만 필요하다
    }
    return bodies[0];
  }

  const LINKS: ReadonlyArray<readonly [string, number, number]> = [
    ["70", 340_000_000, 21_000_000],
    ["35", 90_000_000, 90_000_000],
    ["57", 50_000_000, 50_000_000],
    ["90.6", 50_000_000, 50_000_000],
    ["58.12", 50_000_000, 50_000_000],
  ];
  for (const [p, price, expense] of LINKS) {
    it(`${p}% — 카드 숫자 = body.transferPrice, 양도비 칸 = body.transferExpense`, async () => {
      const card = renderSaleCard(p, price);
      // 단건에는 「총 양도비」 칸이 없어 Step1이 빈 값을 넘긴다 — 칸은 자산 자신의 값(빈칸)이고 ④도 숨은 총 양도비를 싣지 않는다(O-9).
      //   지분 안분 표시 정밀도(applyRatio)는 위 B가 지킨다.
      const { input } = renderExpense(p, "100", "");
      const body = await captureBody(p, price, expense);
      expect(body).toBeDefined();
      expect(card).toBe(`${comma(Number(body!.transferPrice))} 원`);
      expect(body!.transferExpense).toBeUndefined();
      expect(Number(input.value.replace(/,/g, "") || 0)).toBe(Number(body!.transferExpense ?? 0));
      expect(input.disabled).toBe(false);
    });
  }
});
