/**
 * G2-6 anchor — 다건 합산 요약 카드(와 PDF 「합산 신고서 양식」)의 비과세/과세대상 양도차익은
 * 고가주택·부분 비과세에서도 §160① 안분 후 값(자산별 정본 leaf `assetTaxableGain`·`assetExemptGain` 합)이어야 한다.
 *
 * 종전 결함: 카드가 `exemptGain = Σgross − result.totalTransferGain`, 「과세대상 양도차익」 = `result.totalTransferGain`을 그렸다.
 * `totalTransferGain`은 자산별 `transferGain`의 합인데 12억 초과 고가주택은 안분 **전** 값이라
 *  (a) 20억 1주택: 카드 양도차익 1,200,000,000 → 장특 −384,000,000 → 양도소득금액 96,000,000 (행 검산 불성립, 비과세·과세대상 행 없음)
 *  (b) 8억 전액 비과세 + (a): 비과세 −400,000,000 / 과세대상 1,200,000,000 (정본 신고서는 1,120,000,000 / 480,000,000)
 * 세액은 정확했고 표시만 틀렸다. PDF 다건 「총 양도차익」(`r.totalTransferGain`)도 같은 값을 그렸다.
 *
 * 기대값은 하드코딩하지 않고 같은 화면의 정본 신고서가 쓰는 leaf 합으로 정하되, (a)·(b)의 숫자는 법령 산식으로 직접 고정한다:
 * 소득세법 §95①·시행령 §160①1·2호 — 양도차익·장특 × (양도가액−12억)/양도가액 = 20억 기준 40%.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NextRequest } from "next/server";
import type { ReactElement } from "react";
import { POST as POST_MULTI } from "@/app/api/calc/transfer/multi/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { MultiTransferTaxSummaryCard } from "@/components/calc/results/MultiTransferTaxSummaryCard";
import { assetExemptGain, assetTaxableGain } from "@/components/calc/results/transfer/exempt-gross-gain";
import { TransferMultiSection } from "@/lib/pdf/ResultPdfTransferSections";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { defaultMultiTransferFormData, type PropertyItem, type MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

type Asset = ReturnType<typeof makeDefaultAsset>;
const MAPO = "1144010100";

function house(price: string, acqPrice: string, over: Partial<TransferFormData> = {}): TransferFormData {
  const d = createDefaultTransferFormData();
  const a = {
    ...makeDefaultAsset(1), assetKind: "housing", regionCode: MAPO, addressJibun: "서울특별시 마포구 아현동 1",
    acquisitionCause: "purchase", acquisitionDate: "2012-01-01", actualSalePrice: price, fixedAcquisitionPrice: acqPrice,
    residenceInputMode: "interval", residencePeriods: [{ moveInDate: "2012-01-01", moveOutDate: "2022-01-01" }],
  } as Asset;
  return {
    ...d, transferDate: "2025-06-01", contractTotalPrice: price, assets: [a], houses: [], presaleRights: [],
    isOneHousehold: true, householdHousingCount: "1", householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true, annualBasicDeductionUsed: "0", ...over,
  } as TransferFormData;
}
const item = (i: number, form: TransferFormData): PropertyItem =>
  ({ propertyId: `p${i}`, propertyLabel: `자산 ${i}`, form, completionPercent: 100 }) as PropertyItem;

async function compute(forms: TransferFormData[]) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T03:00:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string, init?: RequestInit) =>
      POST_MULTI(
        new NextRequest(`http://localhost${u}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
          body: String(init?.body),
        }),
      ),
    ),
  );
  const props = forms.map((f, i) => item(i + 1, f));
  const mf: MultiTransferFormData = { ...defaultMultiTransferFormData, taxYear: 2025, annualBasicDeductionUsed: "0", properties: props };
  try {
    const result = await callMultiTransferTaxAPI(mf, props);
    return { result, props };
  } finally {
    vi.useRealTimers();
  }
}

function cardRows(result: AggregateTransferResult, props: PropertyItem[]) {
  const { container } = render(<MultiTransferTaxSummaryCard result={result} properties={props} taxYear={2025} />);
  return Array.from(container.querySelectorAll("div.flex.justify-between")).map((d) => d.textContent?.replace(/\s+/g, "") ?? "");
}

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
/** PDF 합산 신고서 양식 표의 (라벨 → 다음 텍스트) 첫 값 — 자산별 표보다 앞이므로 첫 등장이 합산 표다. */
const pdfAfter = (t: string[], label: string) => {
  const i = t.indexOf(label);
  return i >= 0 ? t[i + 1] : undefined;
};
const pdfText = (result: AggregateTransferResult) =>
  collect(TransferMultiSection({ r: result as unknown as Record<string, unknown> }));

const won = (n: number) => n.toLocaleString("ko-KR");

describe("G2-6 카드 — 비과세/과세대상 양도차익은 §160① 안분 후 값", () => {
  it("(a) 고가 1주택 20억: 비과세 720,000,000 · 과세대상 480,000,000 · 행 검산(480M−384M=96M)", async () => {
    const { result, props } = await compute([house("2,000,000,000", "800,000,000")]);
    expect(result.totalIncomeAfterOffset).toBe(96_000_000);
    const rows = cardRows(result, props);
    expect(rows).toContain("양도차익1,200,000,000");
    expect(rows).toContain("비과세양도차익-720,000,000");
    expect(rows).toContain("과세대상양도차익480,000,000");
    expect(rows).toContain("장기보유특별공제-384,000,000");
    expect(rows).toContain("양도소득금액96,000,000");
    expect(480_000_000 - 384_000_000).toBe(96_000_000);
  });

  it("(b) 8억 전액 비과세 + (a): 비과세 1,120,000,000 · 과세대상 480,000,000 — 같은 화면 신고서 leaf 합과 일치", async () => {
    const { result, props } = await compute([
      house("800,000,000", "400,000,000", { transferDate: "2025-03-01" }),
      house("2,000,000,000", "800,000,000"),
    ]);
    const rows = cardRows(result, props);
    expect(rows).toContain("양도차익1,600,000,000");
    expect(rows).toContain("비과세양도차익-1,120,000,000");
    expect(rows).toContain("과세대상양도차익480,000,000");
    const leafTaxable = result.properties.reduce((s, p) => s + assetTaxableGain(p), 0);
    const leafExempt = result.properties.reduce((s, p) => s + assetExemptGain(p), 0);
    expect([leafExempt, leafTaxable]).toEqual([1_120_000_000, 480_000_000]);
  });

  it("긍정 짝 — 부분 비과세 없음(12억 이하 비과세 + 과세 주택): 종전과 같은 값, 행 검산 일치", async () => {
    const { result, props } = await compute([
      house("1,000,000,000", "400,000,000"),
      house("900,000,000", "400,000,000", { isOneHousehold: false }),
    ]);
    const rows = cardRows(result, props);
    expect(rows).toContain("비과세양도차익-600,000,000");
    expect(rows).toContain("과세대상양도차익500,000,000");
    expect(result.totalTransferGain).toBe(500_000_000); // 이 구성에선 종전 값(totalTransferGain)과 leaf 합이 같다
  });

  it("긍정 짝 — 전 자산 과세(12억 이하 일반 과세 주택 1채): 비과세 행을 내지 않는다", async () => {
    const { result, props } = await compute([house("900,000,000", "400,000,000", { isOneHousehold: false })]);
    const rows = cardRows(result, props);
    expect(rows.some((r) => r.startsWith("비과세양도차익"))).toBe(false);
    expect(rows.some((r) => r.startsWith("과세대상양도차익"))).toBe(false);
  });
});

describe("G2-6 PDF — 합산 신고서 양식 표도 같은 값", () => {
  it("(a) 고가 1주택 20억: 총 양도차익 1,200,000,000 · 비과세 720,000,000 · 과세대상 480,000,000", async () => {
    const { result } = await compute([house("2,000,000,000", "800,000,000")]);
    const t = pdfText(result);
    expect(pdfAfter(t, "총 양도차익")).toBe(won(1_200_000_000));
    // 「- 」 접두는 JSX 문자열 자식이라 값과 별개 텍스트 노드다
    const i = t.indexOf("비과세 양도차익");
    expect([t[i + 1], t[i + 2]]).toEqual(["- ", won(720_000_000)]);
    expect(pdfAfter(t, "과세대상 양도차익")).toBe(won(480_000_000));
  });

  it("긍정 짝 — 부분 비과세가 없으면 「총 양도차익」 한 행뿐이고 값은 종전(totalTransferGain)과 같다", async () => {
    const { result } = await compute([house("900,000,000", "400,000,000", { isOneHousehold: false })]);
    const t = pdfText(result);
    expect(pdfAfter(t, "총 양도차익")).toBe(won(result.totalTransferGain));
    expect(t).not.toContain("비과세 양도차익");
  });
});
