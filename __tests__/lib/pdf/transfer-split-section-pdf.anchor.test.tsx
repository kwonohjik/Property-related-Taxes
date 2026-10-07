/**
 * anchor — 결과 PDF 「토지/건물 분리 내역」(`TransferSplitSection`) · Phase C F3 (표시 전용, 세액 불변)
 *
 * 종전: 취득가액 행을 「환산취득가」로 못 박고 개산공제만 적었다 — 실거래가·감정가액·매매사례가액 파트의 라벨이 화면과 달랐고,
 *       직접경비(자본적지출·양도비) 행이 없었으며, §97②2호 단서(swap) 파트도 환산취득가액을 취득가액으로 적었다.
 * 이제: 화면(카드·신고서·명세서)과 같은 정본(`summarizeSplitGain`·`splitAcqModeLabel`)을 읽는다. 구 이력(파트 `acqMode` echo 부재)은 종전 표.
 */
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { TransferSplitSection } from "@/lib/pdf/ResultPdfTransferSections";
import { ResultPdfDocument } from "@/lib/pdf/ResultPdfDocument";
import { COMBOS, SCN_N, SCN_X, run } from "../../tax-engine/transfer/_helpers/split-acq-display-fixture";

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

const tokens = (result: unknown) => collect(TransferSplitSection({ r: result as Record<string, unknown> }));
/** 라벨 다음 두 칸(토지·건물) */
const row = (t: string[], label: string): [string, string] | undefined => {
  const i = t.indexOf(label);
  return i >= 0 ? [t[i + 1], t[i + 2]] : undefined;
};

describe("PDF 분리 내역 — 파트별 산정방식·취득가액·필요경비", () => {
  it("실가/환산 — 산정방식 라벨은 입력 어휘(실거래가·환산취득가), 개산공제는 건물만", () => {
    const t = tokens(run(SCN_N, COMBOS.AE));
    expect(row(t, "취득 방식")).toEqual(["실거래가", "환산취득가"]);
    expect(row(t, "취득가액")).toEqual(["200,000,000", "112,500,000"]);
    expect(row(t, "개산공제 (필요경비, §163⑥)")).toEqual(["-", "1,500,000"]);
    expect(t).not.toContain("자본적지출·양도비 (필요경비)");
    expect(row(t, "양도차익")).toEqual(["475,000,000", "111,000,000"]);
    // 종전 행 라벨 「환산취득가」가 실거래가 파트에 붙지 않는다
    expect(t).not.toContain("환산취득가가");
  });

  it("감정가액/실거래가 · 매매사례가액 — 라벨이 splitAcqModeLabel 어휘다", () => {
    expect(row(tokens(run(SCN_N, COMBOS.PA)), "취득 방식")).toEqual(["감정가액", "실거래가"]);
    expect(row(tokens(run(SCN_N, COMBOS.SE)), "취득 방식")).toEqual(["매매사례가액", "환산취득가"]);
  });

  it("실가/실가 + 직접경비 — 자본적지출·양도비 행이 서고 개산공제 행은 없다", () => {
    const t = tokens(run(SCN_N, COMBOS.AA, { landDirectExpenses: 5_000_000, buildingDirectExpenses: 2_000_000 }));
    expect(row(t, "자본적지출·양도비 (필요경비)")).toEqual(["5,000,000", "2,000,000"]);
    expect(t).not.toContain("개산공제 (필요경비, §163⑥)");
    expect(row(t, "취득가액")).toEqual(["200,000,000", "150,000,000"]);
  });

  it("§97②2호 단서(swap) 건물 — 취득가액 0 + 필요경비 = 직접경비 + 안내(환산취득가액은 차감되지 않는다)", () => {
    const r = run(SCN_N, COMBOS.AE, { buildingDirectExpenses: 150_000_000 });
    expect(r.splitDetail!.building.swapApplied).toBe(true);
    const t = tokens(r);
    expect(row(t, "취득가액")).toEqual(["200,000,000", "0"]);
    expect(row(t, "자본적지출·양도비 (필요경비)")).toEqual(["-", "150,000,000"]);
    expect(t.join("")).toContain("건물: 「소득세법」 §97②2호 단서 — 환산취득가액 112,500,000을 차감하지 않고 자본적지출·양도비를 필요경비로 적용");
    // 항등식 — 양도가 − 취득 − 필요경비 = 양도차익 (건물: 225,000,000 − 0 − 150,000,000 = 75,000,000)
    expect(row(t, "양도차익")![1]).toBe("75,000,000");
  });

  it("소유자 분리(land_only) — 건물은 타인 소유 표기 · 값 대신 「-」", () => {
    const t = tokens(run(SCN_N, COMBOS.AE, { selfOwns: "land_only" }));
    expect(t.join("|")).toContain("건물| (타인 소유)"); // 헤더 칸 — 「건물」 + 소유 표기
    expect(row(t, "양도가액")).toEqual(["675,000,000", "-"]);
    expect(row(t, "취득가액")).toEqual(["200,000,000", "-"]);
    expect(row(t, "양도차익")).toEqual(["475,000,000", "-"]);
    expect(row(t, "장기보유특별공제")![1]).toBe("-");
  });

  it("구 이력(파트 acqMode echo 부재) — 종전 표(환산취득가 행)를 그대로 쓴다", () => {
    const old = structuredClone(run(SCN_N, COMBOS.AE));
    delete old.splitDetail!.land.acqMode;
    delete old.splitDetail!.building.acqMode;
    const t = tokens(old);
    expect(t).not.toContain("취득 방식");
    expect(row(t, "환산취득가")).toEqual(["200,000,000", "112,500,000"]);
    expect(row(t, "개산공제 (필요경비, §163⑥)")).toEqual(["-", "1,500,000"]);
  });

  it("비과세 결과(X)는 같은 표를 쓴다 — 파트 값은 비과세와 모순 없이 그대로", () => {
    const r = run(SCN_X, COMBOS.AE);
    expect(r.isExempt).toBe(true);
    const t = tokens(r);
    // X(양도가 10억): 건물 양도가 250,000,000 × 취득시 50,000,000 ÷ 양도시 100,000,000 = 125,000,000
    expect(row(t, "취득가액")).toEqual(["200,000,000", "125,000,000"]);
  });
});

describe("PDF 문서 배선 — 단건 양도세 결과가 분리 섹션을 이 표로 싣는다", () => {
  it("ResultPdfDocument → TransferSection → TransferSplitSection", () => {
    const tree = ResultPdfDocument({
      taxType: "transfer",
      taxTypeLabel: "양도소득세",
      createdAt: "2026-10-08",
      resultData: run(SCN_N, COMBOS.AE) as unknown as Record<string, unknown>,
    });
    const t = collect(tree);
    expect(t).toContain("토지/건물 분리 내역 (§164⑤·§166⑥)");
    expect(row(t, "취득 방식")).toEqual(["실거래가", "환산취득가"]);
  });
});
