/** @vitest-environment jsdom */
/**
 * 조정대상지역 고지 후속 — 판정 메뉴 결과 화면(4번) · PDF(5번).
 * 계획서 `docs/00-pm/regulated-area-notices-followup.plan.md`. 첫 자산 안내(8번)는 `first-asset-facts.anchor.test.ts` L-8.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { RegulatedAreaAssumptionLine } from "@/components/calc/results/transfer/RegulatedAreaAssumptionLine";
import { ResultPdfDocument } from "@/lib/pdf/ResultPdfDocument";
import { regulatedAddressAssumptions } from "@/lib/calc/effective-regulated-at-acquisition";
import { regulatedAssumptionPdfGroups } from "@/lib/calc/regulated-area-assumption-text";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

/** 시·도 생략 주소 — 시·도를 알아볼 수 없어 조정대상지역(low)으로 판정한다(#2919 B). */
const NO_SIDO = "강남구 테헤란로 1";

function calcForm(addr: string): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2026-02-16",
    assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-03-02", regionCode: "", addressJibun: addr }],
  } as TransferFormData;
}

/** react-pdf 노드 트리의 텍스트 수집(함수 컴포넌트는 직접 호출) — `phd-result-housing-term.anchor.test.tsx`와 같은 방식. */
function collectPdf(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collectPdf(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") { collectPdf((el.type as (p: unknown) => unknown)(el.props), out); return out; }
  collectPdf((el.props ?? {}).children, out);
  return out;
}
const pdfText = (taxType: string, inputData: Record<string, unknown>) =>
  collectPdf(
    ResultPdfDocument({ taxType, taxTypeLabel: "양도소득세", createdAt: "2026-11-06", resultData: { totalTax: 0 }, inputData, selectedSectionIds: [] }),
  ).join("");

describe("4번 — 판정 메뉴 결과 화면", () => {
  it("A-1 「직접 선택」 위치 — 계산기는 「보유 상황」, 판정 메뉴는 「② 양도 대상 주택」", () => {
    render(<RegulatedAreaAssumptionLine form={calcForm(NO_SIDO)} />);
    expect(screen.getByTestId("regulated-area-assumption-line").textContent).toContain("「보유 상황」에서 조정대상지역 여부를 직접 선택하세요");
    cleanup();
    render(<RegulatedAreaAssumptionLine form={calcForm(NO_SIDO)} selectWhere="judgment" />);
    const t = screen.getByTestId("regulated-area-assumption-line").textContent ?? "";
    expect(t).toContain("「② 양도 대상 주택」에서 조정대상지역 여부를 직접 선택하세요");
    expect(t).not.toContain("「보유 상황」");
  });

  it("A-2 판정 메뉴 폼에도 같은 leaf — 시·도 생략 주소 · 안 만짐 → 두 줄 · 직접 만진 축은 빠진다", () => {
    const f = createInitialOneHouseJudgmentForm();
    const jf = {
      ...f,
      transferDate: "2026-02-16",
      assets: [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2018-03-02", addressJibun: NO_SIDO }],
    } as OneHouseJudgmentFormData;
    expect(regulatedAddressAssumptions(jf).map((r) => r.which)).toEqual(["transfer", "acquisition"]);
    expect(regulatedAddressAssumptions({ ...jf, wasRegulatedAtAcquisitionTouched: true }).map((r) => r.which)).toEqual(["transfer"]);
  });

  it.each([
    "app/calc/one-house-exemption/OneHouseJudgmentCalculator.tsx",
    "app/calc/multi-house-surcharge/MultiHouseSurchargeCalculator.tsx",
  ])("A-3 배치 — %s 결과 단계에 판정 메뉴용 줄", (path) => {
    expect(readFileSync(path, "utf8")).toContain('<RegulatedAreaAssumptionLine form={formData} selectWhere="judgment" />');
  });
});

describe("5번 — PDF", () => {
  it("P-1 단건 — 항목을 하나도 고르지 않아도 고지 제목·줄·할 일이 실린다(화면 줄과 같은 문구)", () => {
    const t = pdfText("transfer", { regulatedAreaAssumptions: regulatedAssumptionPdfGroups([{ form: calcForm(NO_SIDO) }]) });
    expect(t).toContain("조정대상지역 판정 — 확인 필요");
    expect(t).toContain("양도일(2026-02-16): 조정대상지역으로 보고 계산 — ");
    expect(t).toContain("취득 당시(2018-03-02): 조정대상지역으로 보고 계산 — ");
    expect(t).toContain("「보유 상황」에서 조정대상지역 여부를 직접 선택하세요");
  });

  it("P-2 다건 — 건마다 label", () => {
    const groups = regulatedAssumptionPdfGroups([
      { form: calcForm("서울특별시 강남구 1"), label: "자산 1" },
      { form: calcForm(NO_SIDO), label: "자산 2" },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["자산 2"]);
    expect(pdfText("transfer_multi", { regulatedAreaAssumptions: groups })).toContain("조정대상지역 판정 — 확인 필요 · 자산 2");
  });

  it("P-3 줄이 없으면(정식 시·도 = high) 싣지 않는다", () => {
    const groups = regulatedAssumptionPdfGroups([{ form: calcForm("서울특별시 강남구 1") }]);
    expect(groups).toEqual([]);
    expect(pdfText("transfer", { regulatedAreaAssumptions: groups })).not.toContain("조정대상지역 판정 — 확인 필요");
    expect(pdfText("transfer", {})).not.toContain("조정대상지역 판정 — 확인 필요");
  });

  it.each([
    ["components/calc/results/TransferTaxResultView.tsx", "regulatedAreaAssumptions: regulatedAssumptionPdfGroups([{ form: formData }])"],
    ["components/calc/results/BundledAllocationCard.tsx", "regulatedAreaAssumptions: regulatedAssumptionPdfGroups([{ form: formData }])"],
    [
      "components/calc/results/MultiTransferTaxResultView.tsx",
      "regulatedAreaAssumptions: regulatedAssumptionPdfGroups(properties.map((p) => ({ form: p.form, label: p.propertyLabel })))",
    ],
  ])("P-4 PDF를 만드는 결과뷰 %s 가 고지를 넘긴다", (path, needle) => {
    expect(readFileSync(path, "utf8")).toContain(needle);
  });
});
