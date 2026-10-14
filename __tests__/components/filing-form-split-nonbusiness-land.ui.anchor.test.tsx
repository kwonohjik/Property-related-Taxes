/**
 * RTL anchor — 신고서 양식 split-2col × 배율 초과 부수토지: 열 구성·라벨·각주 + 같은 echo를 읽는 분리 카드·결과 PDF 표 (표시 전용 · 세액 불변)
 *
 * 값의 정본은 `filing-form-split-nonbusiness-land.anchor.test.ts`(셀 단위 · echo 대조 · 열 합 불변식) — 여기는 화면에 실제로 그려지는 것(열 머리글 ·
 * 토지 열 구성 각주 · 카드/PDF의 초과분 블록)을 확인한다.
 * 인쇄는 같은 `FilingFormTable`(`data-print-section="form-table"`)이라 화면과 한 경로다 — 결과 PDF의 「토지/건물 분리 내역」(`TransferSplitSection`)만 별도 소스라 아래에서 따로 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import type { ReactElement } from "react";
import { render, screen, cleanup, within } from "@testing-library/react";
import { FilingFormTable } from "@/components/calc/results/transfer/FilingFormTable";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { TransferSplitSection } from "@/lib/pdf/ResultPdfTransferSections";
import { calc, sameDayInput } from "./_helpers/filing-split-excess-fixture";

afterEach(cleanup);

const PRICE = 1_500_000_000;
const withExcess = () => calc(sameDayInput("2026-02-16", PRICE, 500));
const noExcess = () => calc(sameDayInput("2026-02-16", PRICE, 300));

/** 행 라벨(첫 칸)로 찾은 행의 칸들 — [라벨, 합계, 토지, 건물] */
function cellsOf(label: string): HTMLElement[] {
  const tr = screen.getAllByRole("row").find((r) => within(r).queryAllByRole("cell")[0]?.textContent?.trim() === label.trim());
  if (!tr) throw new Error(`행 없음: ${label}`);
  return within(tr).getAllByRole("cell");
}
const num = (el: HTMLElement) => el.childNodes[0]?.textContent?.trim(); // 각주 div 앞의 금액 텍스트

describe("FilingFormTable — 초과분이 있으면 열은 합계·토지·건물 그대로, 값은 echo", () => {
  it("열 머리글 — 초과분 전용 열이 없다", () => {
    render(<FilingFormTable result={withExcess()} transferPriceOverride={PRICE} />);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["항목", "합계", "토지", "건물"]);
  });

  it("과세대상 양도차익 · 장기보유특별공제 · 양도소득금액 — 토지 열에 초과분 합산 값", () => {
    render(<FilingFormTable result={withExcess()} transferPriceOverride={PRICE} />);
    expect(["합계", "토지", "건물"].map((_, i) => num(cellsOf("과세대상 양도차익")[i + 1]))).toEqual(["292,857,143", "185,714,286", "107,142,857"]);
    expect([1, 2, 3].map((i) => num(cellsOf("장기보유특별공제")[i]))).toEqual(["137,714,285", "52,000,000", "85,714,285"]);
    expect([1, 2, 3].map((i) => num(cellsOf("양도소득금액")[i]))).toEqual(["155,142,858", "133,714,286", "21,428,572"]);
    expect([1, 2, 3].map((i) => num(cellsOf("보유 기간분 장특")[i]))).toEqual(["94,857,143", "52,000,000", "42,857,143"]);
  });

  it("토지 열 구성 각주 — 「기준면적 이내 토지분 + 배율 초과 부수토지분」(합계·건물 열에는 없다)", () => {
    render(<FilingFormTable result={withExcess()} transferPriceOverride={PRICE} />);
    const taxable = cellsOf("과세대상 양도차익");
    expect(taxable[2].textContent).toContain("기준면적 이내 토지분 0 + 배율 초과 부수토지분 185,714,286");
    expect(taxable[2].textContent).toContain("초과 200㎡");
    expect(taxable[2].textContent).toContain("소득세법 §104조의3 ①5호");
    expect(taxable[1].textContent).not.toContain("배율 초과");
    expect(taxable[3].textContent).not.toContain("배율 초과");
    const lt = cellsOf("장기보유특별공제");
    expect(lt[2].textContent).toContain("기준면적 이내 토지분 0 + 배율 초과 부수토지분 52,000,000");
    expect(lt[2].textContent).toContain("공제율 28%");
    expect(lt[3].textContent).not.toContain("배율 초과");
  });

  it("초과분이 없으면 각주도 없고 값은 종전(균일 비율) 그대로", () => {
    render(<FilingFormTable result={noExcess()} transferPriceOverride={PRICE} />);
    expect(screen.queryByText(/배율 초과 부수토지분/)).toBeNull();
    expect([1, 2, 3].map((i) => num(cellsOf("과세대상 양도차익")[i]))).toEqual(["200,000,000", "105,555,555", "94,444,444"]);
    expect([1, 2, 3].map((i) => num(cellsOf("장기보유특별공제")[i]))).toEqual(["159,999,999", "84,444,444", "75,555,555"]);
  });
});

describe("분리 카드(SplitGainDetailSection) — 초과분 블록은 같은 echo", () => {
  it("초과분이 있으면 블록 · 과세 양도차익 185,714,286 · 장특 52,000,000 · 양도소득금액 133,714,286", () => {
    const r = withExcess();
    render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);
    expect(screen.getByTestId("split-card-nb-part")).toBeTruthy();
    expect(screen.getByTestId("split-card-nb-taxable").textContent).toBe("185,714,286");
    expect(screen.getByTestId("split-card-nb-lthd").textContent).toBe("52,000,000");
    expect(screen.getByTestId("split-card-nb-income").textContent).toBe("133,714,286");
    expect(screen.getByTestId("split-card-nb-part").textContent).toContain("정착면적 × 3배");
    expect(screen.getByTestId("split-card-nb-part").textContent).toContain("200㎡");
  });

  it("초과분이 없으면 블록이 없다", () => {
    render(<SplitGainDetailSection splitDetail={noExcess().splitDetail!} assetKind="housing" />);
    expect(screen.queryByTestId("split-card-nb-part")).toBeNull();
  });
});

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

describe("결과 PDF 「토지/건물 분리 내역」 — 초과분 두 행", () => {
  const tokens = (r: ReturnType<typeof withExcess>) => collect(TransferSplitSection({ r: r as unknown as Record<string, unknown> }));
  it("초과분이 있으면 과세 양도차익·장특 행을 낸다(엔진 echo)", () => {
    const t = tokens(withExcess());
    const i = t.indexOf("배율 초과 부수토지 200㎡ (비사업용 토지) 과세 양도차익");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(t[i + 1]).toBe("185,714,286");
    const j = t.indexOf("배율 초과 부수토지 장기보유특별공제 (표1)");
    expect(j).toBeGreaterThanOrEqual(0);
    expect(t[j + 1]).toBe("52,000,000");
  });
  it("초과분이 없으면 행이 없다", () => {
    expect(tokens(noExcess()).join("|")).not.toContain("배율 초과 부수토지");
  });
});
