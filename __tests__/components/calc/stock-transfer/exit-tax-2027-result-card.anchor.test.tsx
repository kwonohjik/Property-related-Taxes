/**
 * @vitest-environment jsdom
 *
 * 국외전출세 **2027.1.1. 이후 출국** 결과 카드 (U2 ⑦) — 호별 줄 · 제외 판정 · 외화 환산 echo · 지방소득세 두 줄
 *
 * 화면은 엔진 echo만 읽는다: 시료는 폼 → ④ body → ⑭ 매핑 → 엔진 실행 결과(`calculateExitTax`)를 그대로 카드에 넣는다.
 * 손계산 기대값: F1 단독 183,500,000 · H1+F1 배분(2,500,000·0) 84,375,000 + 184,000,000 = 268,375,000.
 * 2026 이전 출국 카드 기준선은 `exit-tax-pre2027-ssr-baseline.anchor.test.tsx`가 따로 지킨다(스냅샷 불변).
 */

import "fake-indexeddb/auto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { ExitTaxResultCard } from "@/components/calc/results/ExitTaxResultCard";
import { buildExitTaxApiBody } from "@/lib/calc/stock-transfer-tax-api-foreign-exit";
import { buildExitTaxEngineInput } from "@/lib/api/stock-transfer-exit-tax-engine-input";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { exitForm, F1, H1 } from "../../../_helpers/exit-tax-2027-form";

const html = (n: React.ReactElement) => renderToStaticMarkup(n);
const lines = (h: string) => h.replace(/></g, ">\n<") + "\n";
const snap = (name: string) => `./__snapshots__/exit-tax-2027/${name}.html`;
function resultOf(form: StockTransferFormData) {
  return calculateExitTax(buildExitTaxEngineInput(buildExitTaxApiBody(form)));
}

describe("UI-5 결과 카드 — 2027 호별 · 제외 · 환산 · 지방세", () => {
  const formMixed = exitForm({
    etHoldings: [H1(), F1()],
    etBasicDeductionAllocClause1: "2,500,000",
    etBasicDeductionAllocClause2b: "0",
  });

  it("H1+F1 배분 입력 → 호별 줄 · 산출세액 268,375,000 · 지방세 두 줄 · 배분 근거 고지", async () => {
    const r = resultOf(formMixed);
    expect(r.incomeTax).toBe(268_375_000);
    const out = html(<ExitTaxResultCard result={r} />);
    expect(out).toContain('data-testid="exit-bucket-clause1"');
    expect(out).toContain('data-testid="exit-bucket-clause2b"');
    expect(out).not.toContain("exit-bucket-clause2a");
    expect(out).toContain("산출세액 = 세율 구분별 산출세액의 합계");
    expect(out).toContain("268,375,000");
    // 구분별 산출세액: 1호 84,375,000 · 2호나목 184,000,000
    expect(out).toContain("84,375,000");
    expect(out).toContain("184,000,000");
    // 지방소득세 — 주값 + 참고값(산출세액 × 10%) 두 줄
    expect(out).toContain("참고: 산출세액 × 10%로 본 지방소득세");
    expect(out).toContain("확인 필요");
    // 배분 근거
    expect(out).toContain('data-testid="exit-alloc-basis"');
    // 환산 echo — 외화 1주당 × 환율
    expect(out).toContain("USD 1,000 × 1,400");
    expect(out).toContain("USD 400 × 1,200");
    // 현행 세율 안내 문단은 호별 줄로 대체됐다
    expect(out).not.toContain("과세표준 3억 이하 20%, 초과분 25%");
    // 숫자 끝 «원» 표기 없음
    expect(out).not.toMatch(/\d원</);
    await expect(lines(out)).toMatchFileSnapshot(snap("card-mixed-buckets"));
  });

  it("F1 단독(2호나목) → 183,500,000 · 호별 줄 1개 · 지방세 두 줄", async () => {
    const r = resultOf(exitForm());
    expect(r.incomeTax).toBe(183_500_000);
    const out = html(<ExitTaxResultCard result={r} />);
    expect(out).toContain("산출세액 = 과세표준 × 세율 (§118의11 2호)");
    expect(out).toContain("183,500,000");
    expect(out).toContain("exit-bucket-clause2b");
    expect(out).toContain("참고: 산출세액 × 10%로 본 지방소득세");
    expect(out).not.toContain("exit-alloc-basis"); // 구분 1개는 배분 없음
    await expect(lines(out)).toMatchFileSnapshot(snap("card-foreign-only"));
  });

  it("5억 이하 제외 + 국내 1호 → 제외 판정 블록 · 제외 종목 사유 · 국내 1호 단독이라 세율 문단은 현행", async () => {
    const small = F1({ departureDayPriceForeign: "100", perShareAcquisitionPriceForeign: "40" });
    const r = resultOf(exitForm({ etHoldings: [H1(), small] }));
    expect(r.foreignExclusion?.applied).toBe(true);
    const out = html(<ExitTaxResultCard result={r} />);
    expect(out).toContain('data-testid="exit-exclusion-notice"');
    expect(out).toContain("국외주식등 양도가액 합계가 5억 이하 (시행령 §178의8②1호)");
    expect(out).toContain("합산 양도차익 (제외한 종목을 뺀 과세 대상 종목 양도차익 합계)");
    expect(out).toContain("과세표준 3억 이하 20%, 초과분 25%"); // 국내 1호 단독 — 현행 문단
    expect(out).not.toContain("exit-bucket-breakdown");
    await expect(lines(out)).toMatchFileSnapshot(snap("card-excluded-under-500m"));
  });

  it("국외주식 전부 제외(과세 대상 없음) → 납세의무 없음 + 제외 판정 블록", () => {
    const small = F1({ departureDayPriceForeign: "100", perShareAcquisitionPriceForeign: "40" });
    const r = resultOf(exitForm({ etHoldings: [small] }));
    expect(r.isLiable).toBe(false);
    const out = html(<ExitTaxResultCard result={r} />);
    expect(out).toContain("납세의무 없음");
    expect(out).toContain('data-testid="exit-exclusion-notice"');
  });

  it("2026 이전 출국 + 국외 행 → 제외 사유 echo(출국일 기준 고지)", () => {
    const r = resultOf(exitForm({ etDepartureDate: "2026-12-31", etHoldings: [H1(), F1()] }));
    const out = html(<ExitTaxResultCard result={r} />);
    expect(out).toContain("2026.12.31. 이전 출국분은 국외주식등이 과세 대상이 아님");
    expect(out).not.toContain("exit-bucket-breakdown"); // pre2027 — 호별 조각 없음
  });

  it("echo 없는 옛 이력 resultData → 신규 필드를 지운 결과도 같은 마크업(현행 카드)", () => {
    const r = resultOf(exitForm({ etDepartureDate: "2026-09-01", etHoldings: [H1()] }));
    const old = { ...r } as Record<string, unknown>;
    for (const k of ["exitTaxRegime", "bucketDetails", "foreignExclusion", "basicDeductionBasis", "localIncomeTaxAlternative"]) {
      delete old[k];
    }
    old.holdingDetails = r.holdingDetails.map((d) => {
      const rest = { ...d } as Record<string, unknown>;
      for (const k of ["scope", "rateBucket", "excludedReason", "fx"]) delete rest[k];
      return rest;
    });
    const withEcho = html(<ExitTaxResultCard result={r} />);
    const without = html(<ExitTaxResultCard result={old as unknown as typeof r} />);
    expect(without).toBe(withEcho);
    expect(without).not.toContain("exit-bucket-breakdown");
  });
});
