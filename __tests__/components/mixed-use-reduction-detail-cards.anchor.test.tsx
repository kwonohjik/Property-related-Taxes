/**
 * anchor: 겸용주택 결과뷰의 **감면 산출근거와 ⑲ 세액감면대상금액** (결과탭 코드리뷰 Lane 4 — #049).
 *
 * ## 무엇이 없었나
 *
 * 나머지 세 결과뷰(단건·일괄·다건)는 모두 `ReductionDetailCards`를 갖는데 **겸용만 없었다**.
 * 엔진은 detail을 만들고도 `computeMixedUsePostTax`에서 통째로 버렸다. 그래서 §77 요건
 * 미충족으로 감면이 0이 된 경우에도 사유를 알려주는 카드가 없어 「왜 안 붙었는지」가 사라졌다.
 *
 * 어댑터도 `reductionTypeApplied`·`reducibleIncome`을 싣지 않아, 같은 화면에서
 *   ⑮ 감면세액 = 5,532,128  ·  ⑲ 세액감면대상금액 = **0**
 *   상세명세서 「세액감면대상금액」 산식 = **「감면 대상 없음」**
 * 이라는 **자기모순**이 인쇄됐다.
 *
 * 법령: 조세특례제한법 §77 · 소득세법 §90① (세액감면방식 — 소득금액 미차감) · 별지 제84호서식 부표1
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const TRANSFER = 3_000_000_000;

const EXPROPRIATION = [
  {
    type: "public_expropriation" as const,
    cashCompensation: TRANSFER,
    bondCompensation: 0,
    bondHoldingYears: null,
    businessApprovalDate: D("2024-01-01"),
  },
];

function mixed(reductions: unknown[] = EXPROPRIATION) {
  return calcMixedUseTransferTax(
    TRANSFER,
    D("2026-06-01"),
    { ...mixedUseCase14(), isOneHouseExempt: false, reductions } as never,
    makeMockRatesWithHouseEngine(),
  );
}

function formData(): TransferFormData {
  return {
    transferDate: "2026-06-01",
    filingDate: "2026-08-31",
    contractTotalPrice: String(TRANSFER),
    assets: [{ ...makeDefaultAsset(1), acquisitionDate: "1992-01-01" }],
  } as unknown as TransferFormData;
}

function filingRows(b: ReturnType<typeof mixed>) {
  const result = mixedUseToFilingResult(b);
  const { mode } = deriveColumns(result, undefined, undefined, undefined);
  const rows = buildRows(result, mode, formData()) as never as {
    label: string;
    values: Record<string, unknown>;
  }[];
  return (label: string) => {
    const r = rows.find((x) => x.label === label);
    expect(r, `행 「${label}」이 없다`).toBeDefined();
    return Number((r!.values["total"] as number) ?? 0);
  };
}

// ── M-0 구별력 ──────────────────────────────────────────────────────
describe("M-0 격자 — 겸용에 §77 세액감면이 실제로 붙는다", () => {
  it("감면세액·감면대상소득이 0이 아니다", () => {
    const t = mixed().total;
    expect(t.reductionAmount, "감면 0이면 ⑲도 0이라 이 anchor는 아무것도 구별하지 못한다").toBeGreaterThan(0);
    expect(t.reductionTypeApplied).toBe("public_expropriation");
    expect(t.reductionDetails?.publicExpropriationDetail?.isEligible).toBe(true);
  });

  it("대조군 — 감면 미선택이면 식별자도 detail도 없다", () => {
    const t = mixed([]).total;
    expect(t.reductionAmount).toBe(0);
    expect(t.reductionTypeApplied).toBeUndefined();
    expect(t.reductionDetails?.publicExpropriationDetail).toBeUndefined();
  });
});

// ── M-1 ⑲ 세액감면대상금액 ──────────────────────────────────────────
describe("M-1 신고서 ⑲가 감면과 일관된다", () => {
  it("🔴 ⑮ 감면세액이 있으면 ⑲ 세액감면대상금액도 0이 아니다", () => {
    const b = mixed();
    const n = filingRows(b);
    expect(n("감면세액")).toBe(b.total.reductionAmount);
    expect(n("세액감면대상금액"), "⑮가 있는데 ⑲가 0이면 서식이 자기모순이다").toBeGreaterThan(0);
    // §77은 「자산 전액이 감면대상」이라 ⑲ = 양도소득금액이다(§90① — 소득금액 미차감).
    expect(n("세액감면대상금액")).toBe(n("양도소득금액"));
  });

  it("🔴 상세명세서 산식이 「감면 대상 없음」이 아니다", () => {
    const items = buildStatementItems(
      mixedUseToFilingResult(mixed()),
      formData(),
      undefined,
      undefined,
      undefined,
    );
    const row = items.get("reductionTargetIncome");
    expect(row, "명세서에 세액감면대상금액 행이 없다").toBeDefined();
    expect(Number(row!.value ?? 0)).toBeGreaterThan(0);
    expect(String(row!.formula ?? "")).not.toContain("감면 대상 없음");
  });

  it("대조군 — 감면이 없으면 ⑲도 0이다", () => {
    expect(filingRows(mixed([]))("세액감면대상금액")).toBe(0);
  });
});

// ── M-2 감면 산출근거 카드 ──────────────────────────────────────────
describe("M-2 겸용 결과뷰에 감면 산출근거 카드가 있다", () => {
  it("🔴 §77 카드가 렌더된다", () => {
    const { container } = render(<MixedUseResultCard breakdown={mixed()} />);
    const text = container.textContent ?? "";
    expect(text).toContain("공익사업 수용 감면 상세");
    expect(text).toContain("① 보상 구성");
    // 겸용은 세액감면형만 계산하므로 ⑤까지 표시된다(집계 컨텍스트가 아니다).
    expect(text).toContain("⑤ 감면세액 = 산출세액");
  });

  it("대조군 — 감면 미선택이면 카드가 없다", () => {
    const { container } = render(<MixedUseResultCard breakdown={mixed([])} />);
    expect(container.textContent ?? "").not.toContain("공익사업 수용 감면 상세");
  });
});
