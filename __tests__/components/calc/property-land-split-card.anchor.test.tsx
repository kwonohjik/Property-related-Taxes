/**
 * PSA-E4 후속 M2·M1 — 결과 «토지 과세 구분별 세액» 카드(PropertyLandSplitCard) · 별도합산 recompute 개방.
 * 경로: 폼 상태 → ④ 본문 → ⑫ Zod → 엔진 → 결과뷰 렌더 (화면과 같은 경로 — 계획서 §13.4 시료 S-1·S-4·S-5·S-6·S-7·S-7b).
 */
import { render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Step3 } from "@/components/calc/property/Step3";
import { PropertyTaxResultView } from "@/components/calc/results/PropertyTaxResultView";
import { INITIAL_FORM, buildPropertyTaxRequestBody, firstInvalidStep, type FormState } from "@/components/calc/property/shared";
import { propertyTaxInputSchema } from "@/lib/validators/property-input";
import { calculatePropertyTax } from "@/lib/tax-engine/property-tax";
import {
  PROPERTY_LAND_SPLIT_COMBINED_NOTICE,
  PROPERTY_LAND_SPLIT_DIRECT_CAP_NOTICE,
} from "@/lib/tax-engine/property-land-split-tax";
import type { PropertyTaxInput } from "@/lib/tax-engine/types/property.types";

afterEach(cleanup);

const YEAR = new Date().getFullYear();
const base = (over: Partial<FormState>): FormState => ({
  ...INITIAL_FORM,
  objectType: "land",
  landTaxType: "separate_aggregate",
  saBuildingFloorArea: "100",
  ...over,
});
/** S-1: 철거 1년 초과 · 상업 300㎡ 전량 이관 */
const S1 = base({
  publishedPrice: "300,000,000",
  saZoningDistrict: "commercial",
  saLandArea: "300",
  saDemolished: true,
  saDemolishedDate: `${YEAR - 2}-01-01`,
  saDemolishedKind: "building", // PSA-E2 — 철거 종류는 기간이 지나도 항상 요구(그 밖의 사실 칸은 기간 접힘이라 비요구)
  otherComprehensiveValue: "0",
});
/** S-4: 공업 1,000㎡ · 바닥 100 → 별도합산 400㎡ + 이관 600㎡ */
const S4 = base({
  publishedPrice: "1,000,000,000",
  saZoningDistrict: "industrial",
  saLandArea: "1000",
  otherSeparateAggregateValue: "0",
  otherComprehensiveValue: "0",
});

function run(form: FormState) {
  expect(firstInvalidStep(form)).toBeNull();
  const parsed = propertyTaxInputSchema.safeParse(buildPropertyTaxRequestBody(form));
  expect(parsed.success).toBe(true);
  return calculatePropertyTax((parsed as { data: PropertyTaxInput }).data);
}
const text = (id: string) => screen.getByTestId(id).textContent ?? "";
const n = (v: number) => v.toLocaleString("ko-KR");

describe("카드 — 3분할 행 값 = 엔진 값", () => {
  it("S-1 전량 이관: 별도합산분 행 없음 · 이관분 800,000 · 합계 800,000 · 총 960,000", () => {
    const r = run(S1);
    expect(r.totalPayable).toBe(960_000);
    render(<PropertyTaxResultView result={r} />);
    expect(screen.queryByTestId("land-split-separate")).toBeNull();
    expect(screen.queryByTestId("land-split-row-separate")).toBeNull();
    expect(text("land-split-row-comprehensive")).toContain("800,000");
    expect(text("land-split-row-total")).toContain("800,000");
    expect(text("land-split-reasons")).toContain("철거");
  });

  it("S-4: 별도합산분 640,000 · 이관분 1,850,000 · 합계 2,490,000(= 산출세액) · 총 2,988,000", () => {
    const r = run(S4);
    expect([r.landSplit?.separate?.share, r.landSplit?.comprehensive?.share, r.determinedTax, r.totalPayable]).toEqual([
      640_000, 1_850_000, 2_490_000, 2_988_000,
    ]);
    render(<PropertyTaxResultView result={r} />);
    expect(text("land-split-row-separate")).toContain("640,000");
    expect(text("land-split-row-comprehensive")).toContain("1,850,000");
    expect(text("land-split-row-total")).toContain("2,490,000");
    // 분류별 산식 — 합산 과세표준(별도합산 400㎡ 4억 × 70% = 2.8억 · 종합합산 6억 × 70% = 4.2억)
    expect(text("land-split-separate")).toContain("280,000,000");
    expect(text("land-split-comprehensive")).toContain("420,000,000");
  });

  it("S-5: 타 종합합산 2억 → 합산 과세표준 5.6억 · 합산세 2,550,000 · 이 필지 몫 1,912,500 · 총 3,063,000", () => {
    const r = run({ ...S4, otherComprehensiveValue: "200,000,000" });
    expect(r.totalPayable).toBe(3_063_000);
    render(<PropertyTaxResultView result={r} />);
    const comp = text("land-split-comprehensive");
    for (const v of ["600,000,000", "200,000,000", "800,000,000", "560,000,000", "2,550,000", "1,912,500"]) {
      expect(comp).toContain(v);
    }
    expect(comp).toContain("75%");
    expect(text("land-split-row-comprehensive")).toContain("1,912,500");
    // 합산 고지는 카드 안에 한 번만 — 경고 목록과 중복되지 않는다
    expect(screen.getAllByText(new RegExp(PROPERTY_LAND_SPLIT_COMBINED_NOTICE.slice(0, 20))).length).toBe(1);
    expect(within(screen.getByTestId("land-split-notices")).getByText(/합산해 과세표준·세율을 정했고/)).toBeTruthy();
  });

  it("S-6: 타 별도합산 1억 → 별도합산분 몫 680,000 · 총 3,036,000", () => {
    const r = run({ ...S4, otherSeparateAggregateValue: "100,000,000" });
    expect(r.totalPayable).toBe(3_036_000);
    render(<PropertyTaxResultView result={r} />);
    expect(text("land-split-row-separate")).toContain("680,000");
    expect(text("land-split-separate")).toContain("350,000,000");
  });

  it("직접 종합합산 선택: «종합합산분 (과세 유형을 종합합산으로 선택)» 한 분류만", () => {
    const r = run({
      ...INITIAL_FORM,
      objectType: "land",
      landTaxType: "comprehensive_aggregate",
      publishedPrice: "300,000,000",
      otherComprehensiveValue: "100,000,000",
    });
    expect(r.totalPayable).toBe(1_035_000);
    render(<PropertyTaxResultView result={r} />);
    expect(screen.queryByTestId("land-split-separate")).toBeNull();
    expect(text("land-split-row-comprehensive")).toContain("862,500");
    expect(screen.getByTestId("land-split-comprehensive").textContent).toContain("종합합산으로 선택");
  });
});

describe("세부담상한 — 별도합산 recompute 개방(M1)", () => {
  it("S-7: S-1 + recompute 직전 과표 1.5억 → 직전 세액상당액 500,000 → 상한 750,000 · 총 900,000", () => {
    const r = run({ ...S1, taxCapMode: "recompute", previousYearTaxBase: "150,000,000" });
    expect(r.determinedTax).toBe(750_000);
    expect(r.totalPayable).toBe(900_000);
    render(<PropertyTaxResultView result={r} />);
    expect(text("land-split-row-total")).toContain("800,000");
    expect(text("land-split-row-total")).toContain("세부담상한 적용 전");
    const cap = text("land-split-cap");
    expect(cap).toContain("500,000");
    expect(cap).toContain("750,000");
    expect(text("land-split-cap-result")).toContain("750,000");
    // 단일 분류(S-1은 종합합산분만) — 종전 문구 그대로, 별도합산 행·문구 없음 (sync-checker M-2)
    expect(screen.getByText("(직전 과세표준 150,000,000 × 직전연도 누진세율)")).toBeTruthy();
    expect(screen.queryByText(/분류별 가액 비율로 나눠/)).toBeNull();
    expect(screen.getByTestId("land-split-cap").textContent).not.toContain("별도합산분");
  });

  it("M-2: 직접 종합합산 + recompute — 종전 문구 «직전 과세표준 × 직전연도 누진세율» · 카드에 별도합산 행 없음", () => {
    const r = run({
      ...INITIAL_FORM,
      objectType: "land",
      landTaxType: "comprehensive_aggregate",
      publishedPrice: "300,000,000",
      otherComprehensiveValue: "0",
      taxCapMode: "recompute",
      previousYearTaxBase: "100,000,000",
    });
    render(<PropertyTaxResultView result={r} />);
    expect(screen.getByText("(직전 과세표준 100,000,000 × 직전연도 누진세율)")).toBeTruthy();
    const cap = screen.getByTestId("land-split-cap").textContent ?? "";
    expect(cap).not.toContain("별도합산");
    expect(cap).toContain("직전연도 세액상당액 (직전 과세표준 × 직전연도 누진세율)");
    expect(cap).not.toContain("직접 입력");
  });

  it("M-2: 두 분류가 모두 있을 때만 분류별 문구·행 (S-4 + recompute)", () => {
    const r = run({ ...S4, taxCapMode: "recompute", previousYearTaxBase: "100,000,000" });
    expect(r.landSplit?.separate && r.landSplit?.comprehensive).toBeTruthy();
    render(<PropertyTaxResultView result={r} />);
    expect(screen.getByText(/분류별 가액 비율로 나눠 별도합산분·종합합산분/)).toBeTruthy();
    const cap = screen.getByTestId("land-split-cap").textContent ?? "";
    expect(cap).toContain("직전연도 별도합산분 세액상당액");
    expect(cap).toContain("직전연도 종합합산분 세액상당액");
  });

  it("S-8: 별도합산 전량 인정 + recompute — 직전 별도합산분 재산정 200,000 → 상한 300,000 → 총 360,000", () => {
    const r = run(
      base({
        publishedPrice: "300,000,000",
        saZoningDistrict: "commercial",
        saLandArea: "300",
        otherSeparateAggregateValue: "0",
        taxCapMode: "recompute",
        previousYearTaxBase: "100,000,000",
      }),
    );
    expect(r.landSplit?.cap).toMatchObject({ applied: true, basisTaxSeparate: 200_000, basisTaxComprehensive: 0 });
    expect(r.determinedTax).toBe(300_000);
    expect(r.totalPayable).toBe(360_000);
  });

  it("S-7b: S-1 + direct 선택 → 상한 미적용 · 고지에 «재산정하는 방식» 안내(화면에 그 선택지가 있다)", () => {
    const r = run({ ...S1, taxCapMode: "direct", previousYearTax: "100,000" });
    expect(r.determinedTax).toBe(800_000);
    expect(r.totalPayable).toBe(960_000);
    expect(r.warnings).toContain(PROPERTY_LAND_SPLIT_DIRECT_CAP_NOTICE);
    expect(PROPERTY_LAND_SPLIT_DIRECT_CAP_NOTICE).toContain("직전 과세표준으로 재산정하는 방식을 쓰면 상한을 적용할 수 있습니다");
    render(<PropertyTaxResultView result={r} />);
    expect(screen.queryByTestId("land-split-cap")).toBeNull();
    expect(text("land-split-notices")).toContain("재산정하는 방식");
  });

  it("recompute 직전 과표 빈칸은 ⑧ 통과 · ④ 미전송(상한 없음) — 기존 recompute 대상과 같은 규칙", () => {
    const f = { ...S1, taxCapMode: "recompute" as const, previousYearTaxBase: "" };
    expect(firstInvalidStep(f)).toBeNull();
    const body = buildPropertyTaxRequestBody(f);
    expect(body.taxCapMode).toBeUndefined();
    expect(body.previousYearTaxBase).toBeUndefined();
  });

  it("recompute 직전 과표는 body에 도달한다(별도합산) — stale 직접입력 세액은 보내지 않는다", () => {
    const body = buildPropertyTaxRequestBody({
      ...S1,
      taxCapMode: "recompute",
      previousYearTaxBase: "150,000,000",
      previousYearTax: "999",
    });
    expect(body.taxCapMode).toBe("recompute");
    expect(body.previousYearTaxBase).toBe(150_000_000);
    expect(body.previousYearTax).toBeUndefined();
  });
});

describe("표시 규칙", () => {
  it("금액 칸은 고정폭·우측정렬 · 인쇄 선택 id land-split", () => {
    render(<PropertyTaxResultView result={run(S4)} />);
    const row = screen.getByTestId("land-split-row-total");
    const amount = row.querySelector("span:last-child");
    expect(amount?.className).toContain("font-mono");
    expect(amount?.className).toContain("tabular-nums");
    expect(amount?.className).toContain("text-right");
    expect(document.querySelector('[data-print-id="land-split"]')).not.toBeNull();
  });

  it("합계 행의 «산출세액» 행이 합산 과세 합계임을 밝힌다 (과세표준 × 세율 ≠ 산출세액 오해 차단)", () => {
    render(<PropertyTaxResultView result={run(S4)} />);
    // 섹션 독립적 문구 — land-split 섹션을 인쇄에서 빼도 가리킬 대상이 사라지지 않는다 (sync-checker L-2)
    expect(screen.getByText(/분류별 합산 과세 — 같은 관할구역 합산 세액 중 이 필지 몫의 합계/)).toBeTruthy();
    expect(screen.queryByText(/위 «토지 과세 구분별 세액»/)).toBeNull();
    expect(n(2_490_000)).toBe("2,490,000");
  });

  it("토지 합산 과세가 아닌 결과(건축물)에는 카드가 없다", () => {
    const r = calculatePropertyTax({ objectType: "building", publishedPrice: 1_000_000_000 } as PropertyTaxInput);
    render(<PropertyTaxResultView result={r} />);
    expect(screen.queryByTestId("property-land-split-card")).toBeNull();
    expect(document.querySelector('[data-print-id="land-split"]')).toBeNull();
  });
});

describe("Step 3 위젯 — 별도합산에도 재산정 선택지(M1)", () => {
  it("별도합산: 직접 입력·재산정 두 선택지 노출 · 이관분이 있고 직접 입력이면 안내 한 줄", () => {
    render(<Step3 form={S1} onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /직전연도 과세표준으로 재산정/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /직전연도 부과세액 직접 입력/ })).toBeTruthy();
    expect(screen.getByText(/직접 입력한 직전연도 세액은\s+세부담상한에 쓰지 않습니다/)).toBeTruthy();
  });

  it("별도합산 전량 인정(이관분 0): 선택지는 있되 직접 입력 안내 없음", () => {
    render(
      <Step3
        form={base({ publishedPrice: "300,000,000", saZoningDistrict: "commercial", saLandArea: "300", otherSeparateAggregateValue: "0" })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: /직전연도 과세표준으로 재산정/ })).toBeTruthy();
    expect(screen.queryByText(/세부담상한에 쓰지 않습니다/)).toBeNull();
  });

  it("recompute 선택 시 직전연도 과세표준 칸 노출", () => {
    render(<Step3 form={{ ...S1, taxCapMode: "recompute" }} onChange={vi.fn()} />);
    expect(screen.getByText("직전연도 과세표준 (원)")).toBeTruthy();
  });

  it("분리과세: 재산정 선택지 없음(대상 아님)", () => {
    render(<Step3 form={{ ...INITIAL_FORM, objectType: "land", landTaxType: "separated" }} onChange={vi.fn()} />);
    expect(screen.queryByRole("radio", { name: /재산정/ })).toBeNull();
  });
});

describe("공시가액 환산 안내(L-1)", () => {
  it("공시가격을 면적으로 나눈 단가가 원 단위로 안 떨어지면 카드에 안내 한 줄", () => {
    // 1,000,000,001 ÷ 1000㎡ → 단가 floor → 합산 공시가액이 입력 공시가격과 다르다
    const r = run({ ...S4, publishedPrice: "1,000,000,001" });
    expect((r.landSplit?.separate?.ownValue ?? 0) + (r.landSplit?.comprehensive?.ownValue ?? 0)).not.toBe(1_000_000_001);
    render(<PropertyTaxResultView result={r} />);
    expect(screen.getByTestId("land-split-own-value-note")).toBeTruthy();
  });

  it("원 단위로 떨어지면 안내 없음", () => {
    render(<PropertyTaxResultView result={run(S4)} />);
    expect(screen.queryByTestId("land-split-own-value-note")).toBeNull();
  });
});

describe("주택 부칙 §15 안내 문구 ↔ ⑧ 정합 (M-1)", () => {
  const housing = { ...INITIAL_FORM, objectType: "housing" as const, publishedPrice: "300,000,000", housingTaxCapEnabled: true };

  it("토글 ON + 본세 빈칸은 ⑧이 막고, Step3 안내는 «토글을 켜면 … 입력해야 합니다»", () => {
    expect(firstInvalidStep(housing)?.message).toContain("직전연도 재산세 본세를 입력하세요");
    render(<Step3 form={housing} onChange={vi.fn()} />);
    expect(screen.getByText(/토글을 켜면 직전 본세\(도시지역이면 직전 도시지역분도\)를 입력해야 하며/)).toBeTruthy();
    expect(screen.queryByText(/미입력 시 상한 없이/)).toBeNull();
  });
});
