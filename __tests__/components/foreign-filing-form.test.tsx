/** @vitest-environment jsdom */
/**
 * 국외자산 부동산 신고서 표 — 별지 제84호서식(국내 부동산과 같은 서식) 매핑·렌더·PDF.
 *
 * 숫자는 엔진을 실제로 돌린 결과이고, 기대값은 손계산이다(K-1 교재 · PR-3 2건 · 외국납부세액).
 *   K-1: 양도가액 990,000,000(USD 900,000 × 1,100) · 취득가액 520,000,000 · 양도비 33,000,000 → 양도차익 437,000,000 · 기본공제 2,500,000 · 과세표준 434,500,000 · 산출세액 147,860,000
 *   2건: b(3/5 양도)가 먼저 → 기본공제 2,500,000 전부 b 몫 · 과세표준 a 437,000,000 / b 97,500,000 · 합계 534,500,000 → 산출세액 188,550,000
 *   필요경비 산입(K-1 + 외국세 40,000,000): 양도차익 397,000,000 · 과세표준 394,500,000 → 40% − 25,940,000 = 131,860,000
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { calculateForeignRealEstateTransferTax as calc } from "@/lib/tax-engine/foreign-realestate";
import { ForeignRealEstateResultCard } from "@/components/calc/results/foreign-realestate/ForeignRealEstateResultCard";
import { ForeignRealEstateResultView } from "@/components/calc/results/foreign-realestate/ForeignRealEstateResultView";
import {
  buildForeignFilingForm,
  buildForeignFilingMeta,
  hasForeignFilingForm,
  type ForeignFilingForm,
} from "@/components/calc/results/foreign-realestate/foreign-filing-form";
import {
  FOREIGN_ASSET_KIND_CODE,
  FOREIGN_RE_RATE_CODE,
} from "@/components/calc/results/foreign-realestate/foreign-filing-form-codes";
import { ResultPdfDocument } from "@/lib/pdf/ResultPdfDocument";
import { ForeignTransferSection, FOREIGN_FILING_FORM_PDF_KEY } from "@/lib/pdf/ResultPdfForeignSections";
import { aAsset, bAsset, ftax, k1Input, ratesAt } from "../tax-engine/foreign-realestate/_fixtures";

const downloadMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/calc/results/transfer/TransferTaxResultViewHelpers", async (orig) => ({
  ...(await orig<typeof import("@/components/calc/results/transfer/TransferTaxResultViewHelpers")>()),
  downloadSelectedPdf: downloadMock,
}));

afterEach(() => {
  cleanup();
  downloadMock.mockReset();
});

const rates = ratesAt("2026-07-10");
const k1 = () => calc(k1Input(), rates);
const two = (foreignTax?: Parameters<typeof calc>[0]["foreignTax"]) => calc(k1Input({ assets: [aAsset(), bAsset()], foreignTax }), rates);
/** 외국세는 USD 1단위 = 환율 1,000원 */
const t = (assetId: string, krw: number) => ftax(assetId, krw / 1_000, "2026-07-20", 1_000);

const rowOf = (f: ForeignFilingForm, labelPrefix: string) => {
  const r = f.rows.find((x) => x.label === labelPrefix) ?? f.rows.find((x) => x.label.startsWith(labelPrefix));
  if (!r) throw new Error(`행 없음: ${labelPrefix}`);
  return r;
};
const val = (f: ForeignFilingForm, labelPrefix: string, col = "total") => rowOf(f, labelPrefix).values[col];

describe("K-1 단건 — 별지 제84호서식 칸 매핑", () => {
  const f = buildForeignFilingForm(k1());

  it("열은 합계(국외분 소계) 하나 · 금액은 원화 환산값", () => {
    expect(f.columns).toEqual([{ key: "total", label: "합계 (국외분 소계)" }]);
    expect(val(f, "양도가액")).toBe(990_000_000);
    expect(val(f, "취득가액 (원화")).toBe(520_000_000);
    expect(val(f, "기타필요경비")).toBe(33_000_000);
  });

  it("양도가액 − 취득가액 − 기타필요경비 = 전체 양도차익 437,000,000 = 양도소득금액", () => {
    expect(990_000_000 - 520_000_000 - 33_000_000).toBe(437_000_000);
    expect(val(f, "전체 양도차익")).toBe(437_000_000);
    expect(val(f, "양도소득금액")).toBe(437_000_000);
  });

  it("장기보유특별공제는 0 · 코드는 «해당 없음»(부표1 작성방법 12. 국외자산은 해당되지 않습니다)", () => {
    expect(val(f, "장기보유특별공제")).toBe(0);
    expect(val(f, "장기보유특별공제 코드")).toBe("해당 없음");
    expect(rowOf(f, "장기보유특별공제").notes?.total).toContain("국외자산은 해당되지 않습니다");
  });

  it("기본공제 2,500,000 · 과세표준 434,500,000 · 세율구분 코드 2-10 · 세율 40% · 산출세액 147,860,000 · 결정세액 = 산출세액", () => {
    expect(val(f, "기본공제")).toBe(2_500_000);
    expect(val(f, "과세표준")).toBe(434_500_000);
    expect(val(f, "세율구분 코드")).toBe("2-10");
    expect(FOREIGN_RE_RATE_CODE).toBe("2-10");
    expect(val(f, "세율")).toBe("40%");
    expect(val(f, "산출세액")).toBe(147_860_000);
    expect(val(f, "결정세액")).toBe(147_860_000);
  });

  it("소재지 구분 «2 (국외)» · 자산종류 토지 «1» · 지방소득세는 서식에 없는 참고 행으로 덧붙는다", () => {
    expect(val(f, "소재지 구분")).toBe("2 (국외)");
    expect(val(f, "자산종류 코드")).toBe("1");
    expect(val(f, "지방세 결정세액")).toBe(14_786_000);
    expect(f.notices.some((n) => n.includes("지방소득세 칸은 없어"))).toBe(true);
  });

  it("외국납부세액이 없으면 외국납부세액공제·필요경비 산입 행이 없다", () => {
    expect(f.rows.some((r) => r.label.startsWith("외국납부세액공제"))).toBe(false);
    expect(f.rows.some((r) => r.label.startsWith("필요경비 산입"))).toBe(false);
  });
});

describe("2건 — 기본공제는 먼저 양도한 자산(b)에서", () => {
  const f = buildForeignFilingForm(two());

  it("열: 합계 + 자산 2열", () => {
    expect(f.columns.map((c) => c.key)).toEqual(["total", "a", "b"]);
    expect(f.columns[1].label).toBe("a (토지)");
    expect(f.columns[2].label).toBe("b (건물)");
  });

  it("기본공제: b 2,500,000 · a 0 · 합계 2,500,000 (§118의7② 먼저 양도하는 자산부터)", () => {
    expect([val(f, "기본공제", "a"), val(f, "기본공제", "b"), val(f, "기본공제")]).toEqual([0, 2_500_000, 2_500_000]);
  });

  it("과세표준: a 437,000,000 · b 97,500,000 · 합계 534,500,000 (열 합 = 합계)", () => {
    expect([val(f, "과세표준", "a"), val(f, "과세표준", "b"), val(f, "과세표준")]).toEqual([437_000_000, 97_500_000, 534_500_000]);
    expect(437_000_000 + 97_500_000).toBe(534_500_000);
  });

  it("산출세액 188,550,000은 합계 열에만 — 자산 열은 비운다(과세표준 합계에 §55① 한 번 적용)", () => {
    expect(val(f, "산출세액")).toBe(188_550_000);
    expect(val(f, "산출세액", "a")).toBeNull();
    expect(val(f, "세율")).toBe("42%");
  });

  it("합계 열 금액 = 자산 열 합(양도가액·취득가액·양도소득금액)", () => {
    for (const label of ["양도가액", "취득가액 (원화", "양도소득금액"]) {
      expect(val(f, label, "a") as number + (val(f, label, "b") as number)).toBe(val(f, label));
    }
  });

  it("건물(b)의 자산종류 코드는 비우고 확인 필요 안내를 단다 · 토지(a)는 1", () => {
    expect(val(f, "자산종류 코드", "a")).toBe("1");
    expect(val(f, "자산종류 코드", "b")).toBeNull();
    expect(FOREIGN_ASSET_KIND_CODE.building).toBeUndefined();
    expect(rowOf(f, "자산종류 코드").notes?.b).toContain("확인 필요");
    expect(f.notices.some((n) => n.includes("건물의 자산종류 코드"))).toBe(true);
  });

  it("소재지 합계 열은 비운다(자산별 칸)", () => {
    expect(val(f, "양도일자")).toBeNull();
    expect(val(f, "양도일자", "a")).toBe("2026-07-10");
    expect(val(f, "양도일자", "b")).toBe("2026-03-05");
  });
});

describe("차손 자산 혼재 — 통산하지 않음", () => {
  const f = buildForeignFilingForm(calc(k1Input({ assets: [aAsset(), bAsset({}, 200_000, 1_200)] }), rates));

  it("전체 양도차익은 차손이 음수로(합계 417,000,000) · 과세대상 양도차익·양도소득금액은 차손 자산 0(합계 437,000,000) — 엔진 값 그대로", () => {
    expect([val(f, "전체 양도차익", "a"), val(f, "전체 양도차익", "b"), val(f, "전체 양도차익")]).toEqual([437_000_000, -20_000_000, 417_000_000]);
    expect([val(f, "과세대상 양도차익", "a"), val(f, "과세대상 양도차익", "b"), val(f, "과세대상 양도차익")]).toEqual([437_000_000, 0, 437_000_000]);
    expect([val(f, "양도소득금액", "a"), val(f, "양도소득금액", "b"), val(f, "양도소득금액")]).toEqual([437_000_000, 0, 437_000_000]);
  });

  it("기본공제는 차익 자산 a 몫 · 과세표준 합계 434,500,000 · 산출세액 147,860,000", () => {
    expect([val(f, "기본공제", "a"), val(f, "기본공제", "b"), val(f, "기본공제")]).toEqual([2_500_000, 0, 2_500_000]);
    expect([val(f, "과세표준", "a"), val(f, "과세표준", "b"), val(f, "과세표준")]).toEqual([434_500_000, 0, 434_500_000]);
    expect(val(f, "산출세액")).toBe(147_860_000);
  });

  it("안내에 «통산하지 않고 0으로 보아» 한 줄(확인 필요) — 차손이 없으면 없다", () => {
    expect(f.notices.some((n) => n.includes("통산하지 않고 0으로 보아") && n.includes("확인 필요"))).toBe(true);
    expect(buildForeignFilingForm(two()).notices.some((n) => n.includes("통산하지 않고"))).toBe(false);
  });
});

describe("외국납부세액", () => {
  it("세액공제방법 한도 초과(a 200,000,000 · b 10,000,000): ⑫ 합계 163,438,268 · a 153,438,268 · b 10,000,000 · 결정세액 25,111,732", () => {
    const r = two({ method: "credit", items: [t("a", 200_000_000), t("b", 10_000_000)] });
    const f = buildForeignFilingForm(r);
    expect(val(f, "외국납부세액공제")).toBe(163_438_268);
    expect([val(f, "외국납부세액공제", "a"), val(f, "외국납부세액공제", "b")]).toEqual([153_438_268, 10_000_000]);
    expect(val(f, "결정세액")).toBe(25_111_732);
    expect(rowOf(f, "외국납부세액공제").notes?.total).toContain("46,561,732");
    expect(val(f, "외국납부세액 공제 (지방세특례제한법")).toBe(r.localForeignTaxCredit);
    expect(r.localForeignTaxCredit).toBeGreaterThan(0);
    expect(f.rows.some((x) => x.label.startsWith("필요경비 산입"))).toBe(false);
  });

  it("필요경비 산입방법(K-1 + 외국세 40,000,000): 별도 행 40,000,000 · 양도차익 397,000,000 · 과세표준 394,500,000 · 산출세액 131,860,000 · 공제 행 없음", () => {
    const r = calc(k1Input({ foreignTax: { method: "expense", items: [t("a1", 40_000_000)] } }), rates);
    const f = buildForeignFilingForm(r);
    expect(val(f, "필요경비 산입 외국납부세액")).toBe(40_000_000);
    expect(990_000_000 - 520_000_000 - 33_000_000 - 40_000_000).toBe(397_000_000);
    expect(val(f, "전체 양도차익")).toBe(397_000_000);
    expect(val(f, "과세표준")).toBe(394_500_000);
    expect(val(f, "산출세액")).toBe(131_860_000);
    expect(f.rows.some((x) => x.label.startsWith("외국납부세액공제"))).toBe(false);
    expect(f.notices.some((n) => n.includes("서식상 위치 확인 필요"))).toBe(true);
  });
});

describe("납세의무 없음(거주 5년 미만) — 신고서 표를 만들지 않는다", () => {
  const nl = calc(k1Input({ domesticResidenceYears: 4 }), rates);

  it("hasForeignFilingForm=false · 결과 카드에 신고서 표 없음", () => {
    expect(nl.isLiable).toBe(false);
    expect(hasForeignFilingForm(nl)).toBe(false);
    render(<ForeignRealEstateResultCard result={nl} />);
    expect(screen.queryByTestId("foreign-filing-form")).toBeNull();
  });

  it("결과뷰의 출력 항목 선택 패널에 신고서 표가 없다(거짓 선택 방지)", () => {
    render(<ForeignRealEstateResultView result={nl} onBack={() => {}} onGoToFirst={() => {}} onReset={() => {}} />);
    expect(screen.queryByLabelText("신고서 양식 표 (별지 제84호서식)")).toBeNull();
  });
});

describe("소재지 표시값(meta)", () => {
  it("국가 라벨은 통화 괄호를 뗀다 · 「기타」·미선택은 비운다 · 소재지는 공백을 다듬는다", () => {
    expect(
      buildForeignFilingMeta([
        { countryCode: "US", address: " 123 Main St " },
        { countryCode: "OTHER", address: "" },
        { countryCode: "", address: "x" },
      ]),
    ).toEqual([
      { countryLabel: "미국", address: "123 Main St" },
      { countryLabel: undefined, address: undefined },
      { countryLabel: undefined, address: "x" },
    ]);
  });

  it("2건: 소재지는 입력 순서(인덱스)로 자산 열에 붙는다 — 결과 rows 순서와 같다", () => {
    const f = buildForeignFilingForm(two(), buildForeignFilingMeta([{ countryCode: "US", address: "Austin" }, { countryCode: "JP", address: "Tokyo" }]));
    expect([val(f, "소재지국", "a"), val(f, "소재지국", "b")]).toEqual(["미국", "일본"]);
    expect([val(f, "소재지 (", "a"), val(f, "소재지 (", "b")]).toEqual(["Austin", "Tokyo"]);
    expect(val(f, "소재지국")).toBeNull();
  });

  it("meta가 있으면 소재지국·소재지 칸이 채워지고 확인 필요 안내가 사라진다 · 없으면 칸은 비고 안내가 뜬다", () => {
    const r = k1();
    const withMeta = buildForeignFilingForm(r, buildForeignFilingMeta([{ countryCode: "US", address: "Austin, TX" }]));
    expect(val(withMeta, "소재지국")).toBe("미국");
    expect(val(withMeta, "소재지 (")).toBe("Austin, TX");
    expect(withMeta.notices.some((n) => n.includes("소재지국이 비어"))).toBe(false);
    const without = buildForeignFilingForm(r);
    expect(val(without, "소재지국")).toBeNull();
    expect(without.notices.some((n) => n.includes("소재지국이 비어"))).toBe(true);
  });
});

describe("화면 렌더 — 결과 카드·선택 출력", () => {
  it("K-1: 신고서 표에 교재 숫자가 금액 칸(font-mono tabular-nums)으로 보인다", () => {
    render(<ForeignRealEstateResultCard result={k1()} filingMeta={buildForeignFilingMeta([{ countryCode: "US", address: "Austin, TX" }])} />);
    const box = screen.getByTestId("foreign-filing-form");
    for (const n of ["990,000,000", "520,000,000", "33,000,000", "437,000,000", "2,500,000", "434,500,000", "147,860,000"]) {
      expect(box.textContent).toContain(n);
    }
    expect(box.textContent).toContain("별지 제84호서식");
    expect(box.textContent).toContain("2-10");
    expect(box.textContent).toContain("미국");
    const amount = [...box.querySelectorAll("td")].find((c) => c.textContent?.includes("990,000,000"));
    expect(amount?.className).toMatch(/font-mono/);
    expect(amount?.className).toMatch(/tabular-nums/);
    expect(amount?.className).toMatch(/whitespace-nowrap/);
    // 문자열 칸(소재지)은 줄바꿈을 허용한다(긴 주소가 열을 밀지 않게) — 금액 칸만 nowrap
    const addr = [...box.querySelectorAll("td")].find((c) => c.textContent?.includes("Austin, TX"));
    expect(addr?.className).toMatch(/whitespace-normal/);
    expect(addr?.className).not.toMatch(/whitespace-nowrap/);
  });

  it("선택 출력 leaf form-table: 미선택이면 print:hidden · 선택하면 클래스 없음 · 화면에는 항상 보인다", () => {
    const { container, rerender } = render(<ForeignRealEstateResultCard result={k1()} selectedIds={new Set()} />);
    expect(container.querySelector('[data-print-id="form-table"]')?.className).toContain("print:hidden");
    expect(screen.getByTestId("foreign-filing-form")).toBeTruthy();
    rerender(<ForeignRealEstateResultCard result={k1()} selectedIds={new Set(["form-table"])} />);
    expect(container.querySelector('[data-print-id="form-table"]')?.className ?? "").not.toContain("print:hidden");
  });

  it("결과뷰: 신고서 표를 고르면 «선택 항목 PDF»가 열리고, 클릭하면 PDF 생성에 서식 값(원화 환산)이 실려 간다", () => {
    render(
      <ForeignRealEstateResultView
        result={k1()}
        foreignAssets={[{ countryCode: "US", address: "Austin, TX" }]}
        onBack={() => {}}
        onGoToFirst={() => {}}
        onReset={() => {}}
      />,
    );
    const pdfBtn = screen.getByRole("button", { name: /선택 항목 PDF/ });
    expect((pdfBtn as HTMLButtonElement).disabled).toBe(true); // 기본 전체 미선택
    fireEvent.click(screen.getByLabelText("신고서 양식 표 (별지 제84호서식)"));
    expect((pdfBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(pdfBtn);
    expect(downloadMock).toHaveBeenCalledTimes(1);
    const [args, sections] = downloadMock.mock.calls[0] as [{ taxType: string; inputData: Record<string, ForeignFilingForm> }, string[]];
    expect(sections).toEqual(["form-table"]);
    expect(args.taxType).toBe("transfer_foreign");
    const form = args.inputData[FOREIGN_FILING_FORM_PDF_KEY];
    expect(val(form, "과세표준")).toBe(434_500_000);
    expect(val(form, "소재지국")).toBe("미국");
  });

  it("PDF 채널이 없는 leaf(요약)만 고르면 PDF 버튼은 닫힌 채다", () => {
    render(<ForeignRealEstateResultView result={k1()} onBack={() => {}} onGoToFirst={() => {}} onReset={() => {}} />);
    fireEvent.click(screen.getByLabelText("총 납부세액 요약"));
    expect((screen.getByRole("button", { name: /선택 항목 PDF/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") {
    try { collect((el.type as (p: unknown) => unknown)(el.props), out); } catch { /* 렌더 불가 노드 */ }
    return out;
  }
  collect((el.props ?? {}).children, out);
  return out;
}

describe("PDF — 같은 행·열 값을 그린다", () => {
  const input = (r: ReturnType<typeof k1>) => ({ [FOREIGN_FILING_FORM_PDF_KEY]: buildForeignFilingForm(r) }) as Record<string, unknown>;

  it("form-table 선택: K-1 교재 숫자와 열 머리가 나온다", () => {
    const r = k1();
    const t = collect(ForeignTransferSection({ r: r as never, inputData: input(r), selectedSectionIds: ["form-table"] }));
    for (const n of ["990,000,000", "520,000,000", "437,000,000", "434,500,000", "147,860,000", "2-10", "합계 (국외분 소계)"]) {
      expect(t).toContain(n);
    }
  });

  it("form-table 미선택이면 아무것도 그리지 않는다 · 전체(undefined)면 그린다", () => {
    const r = k1();
    expect(collect(ForeignTransferSection({ r: r as never, inputData: input(r), selectedSectionIds: ["summary"] }))).toEqual([]);
    expect(collect(ForeignTransferSection({ r: r as never, inputData: input(r) })).length).toBeGreaterThan(10);
  });

  it("납세의무 없음 결과는 그리지 않는다 · inputData가 없어도 던지지 않는다", () => {
    const nl = calc(k1Input({ domesticResidenceYears: 4 }), rates);
    expect(collect(ForeignTransferSection({ r: nl as never, inputData: input(nl) }))).toEqual([]);
    expect(collect(ForeignTransferSection({ r: k1() as never, inputData: undefined }))).toEqual([]);
  });

  it("문서: 총 납부세액 카드와 신고서 표가 함께 나온다(2건은 자산 열 포함)", () => {
    const r = two();
    const doc = ResultPdfDocument({
      taxType: "transfer_foreign",
      taxTypeLabel: "양도소득세(국외자산 부동산)",
      createdAt: "2026-11-27",
      resultData: r as never,
      inputData: input(r),
      selectedSectionIds: ["form-table"],
    });
    const t = collect(doc);
    expect(t).toContain("207,405,000");
    expect(t).toContain("188,550,000");
    expect(t).toContain("534,500,000");
    expect(t).toContain("b (건물)");
  });

  it("react-pdf 렌더가 던지지 않는다(단건·2건·전체·선택)", async () => {
    for (const r of [k1(), two()]) {
      for (const ids of [undefined, ["form-table"], ["summary"]]) {
        const buf = await renderToBuffer(
          <ResultPdfDocument taxType="transfer_foreign" taxTypeLabel="양도소득세(국외자산 부동산)" createdAt="2026-11-27" resultData={r as never} inputData={input(r)} selectedSectionIds={ids} />,
        );
        expect(buf.length).toBeGreaterThan(1000);
      }
    }
  });
});
