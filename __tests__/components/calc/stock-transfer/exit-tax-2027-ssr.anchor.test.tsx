/**
 * @vitest-environment jsdom
 *
 * 국외전출세 **2027.1.1. 이후 출국** 화면 — SSR 마크업 anchor + 별도 스냅샷 (U1·U2)
 *
 * 2026 이전 출국 기준선(`exit-tax-pre2027-ssr-baseline.anchor.test.tsx`)은 건드리지 않는다 — 이 파일은 **새 경로**를 고정한다.
 * 시료는 `__tests__/_helpers/exit-tax-2027-form.ts`(손계산):
 *   F1 단독 2027-01-01 → 183,500,000 / H1+F1 배분(2,500,000·0) → 268,375,000
 *
 *   UI-1 Step1 — era 안내 2곳(출국일 아래 · 대주주 설명)이 era에서만 마운트
 *   UI-2 Step2 — 시장 버튼 4/5 · 국외주식 행에만 외화 입력 · 외국인근로자 블록은 era+국외 행일 때만
 *   UI-3 Step2 — era 밖인데 국외 행이 남아 있으면 지우지 않고 안내만(C-4)
 *   UI-4 Step3 — 과세 구분 ≥2일 때만 기본공제 배분 칸, 구분 1개는 종전 문구 그대로
 */

import "fake-indexeddb/auto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { Step1 } from "@/app/calc/stock-transfer-tax/steps/Step1";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import { exitForm, F1, H1 } from "../../../_helpers/exit-tax-2027-form";

const noop = () => {};
const html = (n: React.ReactElement) => renderToStaticMarkup(n);
const lines = (h: string) => h.replace(/></g, ">\n<") + "\n";
const snap = (name: string) => `./__snapshots__/exit-tax-2027/${name}.html`;
/** 시장 선택 그리드의 버튼 라벨 */
function marketButtons(out: string): string[] {
  const m = out.match(/<div class="grid grid-cols-[45] gap-1">([\s\S]*?)<\/div>/);
  return m ? [...m[1].matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((x) => x[1]) : [];
}
describe("UI-1 Step1 — era 안내", () => {
  it("2027-01-01 출국이면 출국일 아래 안내 + 대주주 설명 끝에 국외주식 제외 문구", async () => {
    const out = html(<Step1 form={exitForm()} onChange={noop} />);
    expect(out).toContain('data-testid="exit-era-identity-note"');
    expect(out).toContain("국외주식등(§94①3호 다목)은 제외합니다(§118의9①2호)");
    await expect(lines(out)).toMatchFileSnapshot(snap("step1-departure-2027-01-01"));
  });

  it("2026-12-31 · 빈 출국일이면 마운트되지 않는다", () => {
    for (const d of ["2026-12-31", ""]) {
      const out = html(<Step1 form={exitForm({ etDepartureDate: d })} onChange={noop} />);
      expect(out, d).not.toContain("exit-era-identity-note");
      expect(out, d).not.toContain("국외주식등(§94①3호 다목)은 제외합니다");
    }
  });
});

describe("UI-2 Step2 — 시장 버튼·국외주식 입력·외국인근로자", () => {
  it("era면 시장 버튼 5개(국외주식 포함), 아니면 4개", () => {
    const era = html(<Step2 form={exitForm({ etHoldings: [H1()] })} onChange={noop} />);
    expect(marketButtons(era)).toEqual(["코스피", "코스닥", "코넥스", "비상장", "국외주식"]);
    const pre = html(<Step2 form={exitForm({ etDepartureDate: "2026-12-31", etHoldings: [H1()] })} onChange={noop} />);
    expect(marketButtons(pre)).toEqual(["코스피", "코스닥", "코넥스", "비상장"]);
  });

  it("국외주식 행만 외화 입력이 있고 국내 행은 종전 원화 칸이다", async () => {
    const out = html(<Step2 form={exitForm({ etHoldings: [H1(), F1()] })} onChange={noop} />);
    // 국외 행: 외화 칸 · 환율 · 시가 모드 2종 · 환산 참고 칩(엔진 leaf 값 1,400,000,000)
    expect(out).toContain('data-testid="exit-foreign-holding-fields"');
    expect(out).toContain("취득일 기준환율 (원/외화)");
    expect(out).toContain("출국일 기준환율 (원/외화)");
    expect(out).toContain("시행령 §178의3 시가");
    expect(out).toContain('data-testid="exit-foreign-preview-chip"');
    expect(out).toContain("1,400,000,000");
    // 국내 행: 원화 거래가액 칸은 H1 하나뿐(국외 행에는 없다)
    expect(out.match(/출국일 거래가액 \(1주당, 원\)/g)?.length).toBe(1);
    await expect(lines(out)).toMatchFileSnapshot(snap("step2-holdings-domestic-and-foreign"));
  });

  it("외국인근로자 블록은 era + 국외 행일 때만", () => {
    const withForeign = html(<Step2 form={exitForm()} onChange={noop} />);
    expect(withForeign).toContain("국외주식등 제외 — 외국인근로자 (시행령 §178의8②)");
    const domesticOnly = html(<Step2 form={exitForm({ etHoldings: [H1()] })} onChange={noop} />);
    expect(domesticOnly).not.toContain("외국인근로자");
    const preEra = html(<Step2 form={exitForm({ etDepartureDate: "2026-12-31" })} onChange={noop} />);
    expect(preEra).not.toContain("국외주식등 제외 — 외국인근로자");
  });

  it("가족 선택이면 요건 4개 · 가족 구분 · 근로 개시일 입력이 열린다", async () => {
    const out = html(
      <Step2
        form={exitForm({ etForeignWorkerStatus: "foreign_worker_family", etForeignWorkerFamilyKind: "spouse" })}
        onChange={noop}
      />,
    );
    expect(out).toContain('data-testid="exit-foreign-worker-checks"');
    expect(out).toContain('data-testid="exit-foreign-worker-family"');
    expect(out).toContain("외국인근로자가 국내에서 근로를 제공하기 시작한 날");
    await expect(lines(out)).toMatchFileSnapshot(snap("step2-foreign-worker-family"));
    // 본인 선택이면 가족 입력은 없다
    const self = html(<Step2 form={exitForm({ etForeignWorkerStatus: "foreign_worker" })} onChange={noop} />);
    expect(self).toContain('data-testid="exit-foreign-worker-checks"');
    expect(self).not.toContain('data-testid="exit-foreign-worker-family"');
    // 해당 없음이면 요건도 없다
    const none = html(<Step2 form={exitForm()} onChange={noop} />);
    expect(none).not.toContain('data-testid="exit-foreign-worker-checks"');
  });

  it("내국법인 발행이면 중소기업 토글이 열린다 · 외국법인 발행이면 없다", () => {
    const foreignCorp = html(<Step2 form={exitForm()} onChange={noop} />);
    expect(foreignCorp).not.toContain("exit-foreign-sme-toggle");
    const domesticCorp = html(
      <Step2 form={exitForm({ etHoldings: [F1({ isListedForeignCorp: false })] })} onChange={noop} />,
    );
    expect(domesticCorp).toContain("exit-foreign-sme-toggle");
  });
});

describe("UI-3 Step2 — era 밖 국외 행은 지우지 않고 안내만 (C-4)", () => {
  it("2026-12-31 출국 + 국외 행: 행 유지 · 제외 안내 · 시장 버튼 4개 · 근로자 블록 없음", () => {
    const form = exitForm({ etDepartureDate: "2026-12-31", etHoldings: [F1()] });
    const out = html(<Step2 form={form} onChange={noop} />);
    expect(out).toContain("2027.1.1. 이전 출국분은 국외주식등이 과세 대상이 아닙니다");
    expect(out).toContain('data-testid="exit-foreign-holding-fields"'); // 행은 그대로(자동 삭제 없음)
    expect(marketButtons(out)).toHaveLength(4);
    expect(out).not.toContain("국외주식등 제외 — 외국인근로자");
  });
});

describe("UI-4 Step3 — 기본공제 250만원 구분별 배분 칸", () => {
  it("과세 구분 2개(1호 + 2호나목)면 배분 칸 2개 · «추가 입력이 없습니다» 문구 없음", async () => {
    const out = html(<Step3 form={exitForm({ etHoldings: [H1(), F1()] })} onChange={noop} />);
    expect(out).toContain('data-testid="exit-alloc-notice"');
    expect(out).toContain("§118의11 1호 — 국내 상장·비상장 주식");
    expect(out).toContain("§118의11 2호 나목 — 국외주식 그 밖");
    expect(out).not.toContain("§118의11 2호 가목 — 국외주식 중 중소기업"); // 과세 구분이 아닌 쪽은 칸이 없다
    expect(out).not.toContain("추가 입력이 없습니다");
    await expect(lines(out)).toMatchFileSnapshot(snap("step3-allocation-two-buckets"));
  });

  it("과세 구분 1개(F1 단독 · H1 단독)면 배분 칸 없음 · 종전 문구 그대로", () => {
    for (const holdings of [[F1()], [H1()]]) {
      const out = html(<Step3 form={exitForm({ etHoldings: holdings })} onChange={noop} />);
      expect(out).not.toContain("exit-alloc-notice");
      expect(out).toContain("추가 입력이 없습니다");
    }
  });

  it("5억 이하라 국외가 제외되면(과세 구분 1호뿐) 배분 칸 없음 — 판정은 엔진 helper", () => {
    const small = F1({ departureDayPriceForeign: "100", perShareAcquisitionPriceForeign: "40" });
    const out = html(<Step3 form={exitForm({ etHoldings: [H1(), small] })} onChange={noop} />);
    expect(out).not.toContain("exit-alloc-notice");
  });
});
