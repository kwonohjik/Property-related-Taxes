/**
 * anchor — PDF «토지/건물 분리 내역»: 토지·건물 한 파트만 소유하면 구 이력에서도 타인 소유 파트는 «-» + 머리 «(타인 소유)».
 *
 * 계획서 `docs/00-pm/split-owner-nonowned-part-display.plan.md` v0.2 (Q-1 (a) · Q-2 (a)).
 *
 * 구 이력 = 파트 산정방식 echo(`acqMode`)가 없는 결과(2026-04-27 `selfOwns` 도입 ~ 2026-07-28 #836 `acqMode` 도입 사이 저장분).
 * 종전에는 소유 판정(`partOf`)이 `modern`일 때만 걸려 구 이력은 타인 소유 파트 값을 그대로 찍었다
 * (건물만 소유: 토지 열 양도가액 675,000,000 · 양도차익 475,000,000 · 보유 15년, 머리 표지 없음).
 * 시료는 현행 결과에서 `acqMode`만 지운 **모의 구 이력**이다 — 실제 저장 이력 샘플은 확인 필요(계획서 §2.2).
 */
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { COMBOS, SCN_N, run } from "../tax-engine/transfer/_helpers/split-acq-display-fixture";
import { TransferSplitSection } from "@/lib/pdf/ResultPdfTransferSections";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

/** react-pdf 요소 트리의 텍스트 토큰(`split-acq-basis-d1-4b.ui.anchor.test.tsx`와 같은 방식). */
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
const tokens = (r: TransferTaxResult) => collect(TransferSplitSection({ r: r as never })).filter((s) => s.trim());

type Own = "both" | "land_only" | "building_only";
const current = (own: Own) => run(SCN_N, COMBOS.AE, { selfOwns: own } as never);
/** 구 이력 형태 — 두 파트의 `acqMode` echo를 지운다. */
function legacy(r: TransferTaxResult): TransferTaxResult {
  const sd = r.splitDetail as unknown as Record<string, Record<string, unknown>>;
  const strip = (p: Record<string, unknown>) => {
    const q = { ...p };
    delete q.acqMode;
    return q;
  };
  return { ...r, splitDetail: { ...sd, land: strip(sd.land), building: strip(sd.building) } } as unknown as TransferTaxResult;
}

const HEAD = "토지/건물 분리 내역 (§164⑤·§166⑥)";

describe("PDF 분리 내역 — 구 이력에서도 타인 소유 파트는 «-» + 머리 «(타인 소유)»", () => {
  it("전제 — 구 이력 형태는 `modern`이 아니다(«취득 방식» 행이 없다)", () => {
    expect(tokens(legacy(current("building_only")))).not.toContain("취득 방식");
    expect(tokens(current("building_only"))).toContain("취득 방식");
  });

  it("SO-1 건물만 소유 · 구 이력 — 토지 열 6행 «-», 건물 열 값 유지", () => {
    expect(tokens(legacy(current("building_only")))).toEqual([
      HEAD, "토지", " (타인 소유)", "건물",
      "양도가액", "-", "225,000,000",
      "환산취득가", "-", "112,500,000",
      "개산공제 (필요경비, §163⑥)", "-", "1,500,000",
      "양도차익", "-", "111,000,000",
      "보유연수", "-", "7년",
      "장기보유특별공제", "-", "15,540,000",
    ]);
  });

  it("SO-2 토지만 소유 · 구 이력 — 건물 열 «-», 토지 열 값 유지 · 개산공제 행은 소유 파트에 공제가 없어 숨김(현행 결과와 같은 규약)", () => {
    expect(tokens(legacy(current("land_only")))).toEqual([
      HEAD, "토지", "건물", " (타인 소유)",
      "양도가액", "675,000,000", "-",
      "환산취득가", "200,000,000", "-",
      "양도차익", "475,000,000", "-",
      "보유연수", "15년", "-",
      "장기보유특별공제", "142,500,000", "-",
    ]);
  });

  it("SO-5 두 파트 모두 환산(EE) · 건물만 소유 · 구 이력 — 개산공제 행은 남고 토지 칸만 «-»", () => {
    const t = tokens(legacy(run(SCN_N, COMBOS.EE, { selfOwns: "building_only" } as never)));
    const i = t.indexOf("개산공제 (필요경비, §163⑥)");
    expect(i).toBeGreaterThan(-1);
    expect(t[i + 1]).toBe("-");
    expect(t[i + 2]).not.toBe("-");
    // 전제 — 타인 소유 토지 파트에도 개산공제 echo가 있다(소유 판정이 없으면 그 값이 찍힌다)
    expect(run(SCN_N, COMBOS.EE, { selfOwns: "building_only" } as never).splitDetail!.land.appraisalDeduction).toBeGreaterThan(0);
  });

  it("SO-6 토지만 환산(EA) · 건물만 소유 · 구 이력 — 개산공제가 타인 소유 토지 파트에만 있으면 행 자체가 없다(현행 결과와 같은 규약)", () => {
    const r = run(SCN_N, COMBOS.EA, { selfOwns: "building_only" } as never);
    // 전제 — 개산공제가 토지(타인 소유)에만 있다
    expect(r.splitDetail!.land.appraisalDeduction).toBeGreaterThan(0);
    expect(r.splitDetail!.building.appraisalDeduction).toBe(0);
    expect(tokens(legacy(r))).not.toContain("개산공제 (필요경비, §163⑥)");
    expect(tokens(r)).not.toContain("개산공제 (필요경비, §163⑥)");
  });

  it("SO-7 두 파트 모두 환산(EE) · 토지만 소유 · 구 이력 — 개산공제 행은 남고 건물 칸만 «-»", () => {
    const r = run(SCN_N, COMBOS.EE, { selfOwns: "land_only" } as never);
    expect(r.splitDetail!.building.appraisalDeduction).toBeGreaterThan(0);
    const t = tokens(legacy(r));
    const i = t.indexOf("개산공제 (필요경비, §163⑥)");
    expect(i).toBeGreaterThan(-1);
    expect(t[i + 1]).not.toBe("-");
    expect(t[i + 2]).toBe("-");
  });

  it("SO-3 두 파트 소유 · 구 이력 — 종전 출력 그대로", () => {
    expect(tokens(legacy(current("both")))).toEqual(SO3_BEFORE);
  });

  it("SO-4 한 파트만 소유 · 현행 결과 — 종전 출력 그대로", () => {
    expect(tokens(current("building_only"))).toEqual([
      HEAD, "토지", " (타인 소유)", "건물", "취득 방식", "-", "환산취득가",
      "양도가액", "-", "225,000,000", "취득가액", "-", "112,500,000",
      "개산공제 (필요경비, §163⑥)", "-", "1,500,000", "양도차익", "-", "111,000,000",
      "보유연수", "-", "7년", "장기보유특별공제", "-", "15,540,000",
    ]);
    expect(tokens(current("land_only"))).toEqual([
      HEAD, "토지", "건물", " (타인 소유)", "취득 방식", "실거래가", "-",
      "양도가액", "675,000,000", "-", "취득가액", "200,000,000", "-",
      "양도차익", "475,000,000", "-", "보유연수", "15년", "-", "장기보유특별공제", "142,500,000", "-",
    ]);
  });
});

/** 수정 전 출력(두 파트 소유는 소유 판정이 둘 다 참이라 바뀌지 않는다). */
const SO3_BEFORE = [
  HEAD, "토지", "건물",
  "양도가액", "675,000,000", "225,000,000",
  "환산취득가", "200,000,000", "112,500,000",
  "개산공제 (필요경비, §163⑥)", "-", "1,500,000",
  "양도차익", "475,000,000", "111,000,000",
  "보유연수", "15년", "7년",
  "장기보유특별공제", "142,500,000", "15,540,000",
];
