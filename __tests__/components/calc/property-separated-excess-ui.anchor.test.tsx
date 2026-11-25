/**
 * PSE-U — 분리과세(공장·목장) 면적 한도 초과분 종합합산 이관: Step 3 합산 칸·요약 줄 · ④ body · ⑧ 차단 · 결과 카드 · recompute 개방.
 * 경로: 폼 상태 → ④ 본문 → ⑫ Zod → 엔진 → 결과뷰 (화면과 같은 경로). 세액 오라클 = 엔진 계획서 §3.2(F-0·F-1·F-2·P-1) · K-14(F-3).
 * 계획서: docs/01-plan/features/property-separated-excess-transfer.ui.plan.md
 */
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Step3 } from "@/components/calc/property/Step3";
import { PropertyTaxResultView } from "@/components/calc/results/PropertyTaxResultView";
import { isRecomputeTarget } from "@/components/calc/property/request-body";
import { INITIAL_FORM, buildPropertyTaxRequestBody, firstInvalidStep, validateStep, type FormState } from "@/components/calc/property/shared";
import { propertyTaxInputSchema } from "@/lib/validators/property-input";
import { calculatePropertyTax } from "@/lib/tax-engine/property-tax";
import {
  PROPERTY_LAND_SPLIT_INPUT_MESSAGE,
  PROPERTY_LAND_SPLIT_SEPARATED_NOTICE,
} from "@/lib/tax-engine/property-land-split-tax";
import { PROPERTY_LAND_SPLIT_EXCESS_COMPREHENSIVE_NOTICE } from "@/lib/tax-engine/property-tax-separated";
import type { PropertyTaxInput } from "@/lib/tax-engine/types/property.types";

afterEach(cleanup);

const sep = (over: Partial<FormState>): FormState => ({
  ...INITIAL_FORM,
  objectType: "land",
  landTaxType: "separated",
  ...over,
});
/** F-1: 공시가격 15억 · 산업단지 공장 15,000㎡ → 기준 12,000㎡ · 초과 3,000㎡ */
const F1 = sep({
  publishedPrice: "1,500,000,000",
  stSeparatedType: "factory",
  stFactoryLocation: "industrial_zone",
  stFactoryTotalLandArea: "15000",
  stFactoryFloorArea: "1200",
  stFactoryAreaRatePercent: "12",
});
/** F-0: 공시가격 8억 · 8,000㎡(이내) */
const F0 = { ...F1, publishedPrice: "800,000,000", stFactoryTotalLandArea: "8000" };
/** P-1: 공시가격 1억 · 목장 2,000㎡ · 한우 50마리 · 부대시설 → 기준 625㎡ */
const P1 = sep({
  publishedPrice: "100,000,000",
  stSeparatedType: "livestock",
  stPastureTotalLandArea: "2000",
  stPastureLivestockType: "hanwoo_breeding",
  stPastureLivestockCount: "50",
  stPastureHasFacility: true,
});

const has = (id: string) => screen.queryByTestId(id) !== null;
const text = (id: string) => screen.getByTestId(id).textContent ?? "";

function run(form: FormState) {
  expect(firstInvalidStep(form)).toBeNull();
  const parsed = propertyTaxInputSchema.safeParse(buildPropertyTaxRequestBody(form));
  expect(parsed.success).toBe(true);
  return calculatePropertyTax((parsed as { data: PropertyTaxInput }).data);
}

describe("Step 3 — 합산 칸·초과 요약 줄 (UQ-1~3)", () => {
  it("공장 초과: 종합합산 칸만 + 기준면적·부속토지·초과 면적 3값 + 분리과세 안내 문단", () => {
    render(<Step3 form={F1} onChange={vi.fn()} />);
    expect(has("other-comprehensive-value")).toBe(true);
    expect(has("other-separate-aggregate-value")).toBe(false);
    const t = text("land-split-inputs-excess");
    expect(t).toContain("공장입지기준면적 12,000㎡");
    expect(t).toContain("부속토지 15,000㎡");
    expect(t).toContain("초과 면적 3,000㎡");
    expect(text("land-split-inputs-separated-intro")).toContain("분리과세로 인정되는 부분은 합산하지 않습니다");
  });

  it("목장 초과: 가축별 기준면적 625㎡ · 목장용지 2,000㎡ · 초과 1,375㎡", () => {
    render(<Step3 form={P1} onChange={vi.fn()} />);
    const t = text("land-split-inputs-excess");
    expect(t).toContain("가축별 기준면적 625㎡");
    expect(t).toContain("목장용지 2,000㎡");
    expect(t).toContain("초과 면적 1,375㎡");
    expect(has("other-comprehensive-value")).toBe(true);
  });

  it("초과 0(F-0) · 면적 한도 없는 유형(농지) · Step 2 미완 — 카드 자체가 없다", () => {
    render(<Step3 form={F0} onChange={vi.fn()} />);
    expect(has("other-comprehensive-value")).toBe(false);
    expect(has("land-split-inputs-excess")).toBe(false);
    cleanup();
    render(<Step3 form={sep({ publishedPrice: "300,000,000", stSeparatedType: "farmland" })} onChange={vi.fn()} />);
    expect(has("other-comprehensive-value")).toBe(false);
    cleanup();
    render(<Step3 form={{ ...F1, stFactoryFloorArea: "" }} onChange={vi.fn()} />);
    expect(has("other-comprehensive-value")).toBe(false);
    expect(has("land-split-inputs-pending")).toBe(false);
  });

  it("합산 칸 입력은 문자열 그대로 onChange(빈칸 ≠ 0)", () => {
    const onChange = vi.fn();
    render(<Step3 form={F1} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("other-comprehensive-value"), { target: { value: "0" } });
    expect(onChange).toHaveBeenCalledWith({ otherComprehensiveValue: "0" });
  });
});

describe("④·⑧ — 요구 술어 하나로 일치 (Q-4)", () => {
  it("초과 > 0: 칸이 비면 ⑧이 합산 칸 문구로 막고, 0이면 통과 + body에 0이 실린다", () => {
    expect(validateStep(3, F1)).toBe(PROPERTY_LAND_SPLIT_INPUT_MESSAGE.otherComprehensiveValue);
    expect(firstInvalidStep(F1)?.step).toBe(3);
    const ok = { ...F1, otherComprehensiveValue: "0" };
    expect(validateStep(3, ok)).toBeNull();
    const body = buildPropertyTaxRequestBody(ok);
    expect(body.otherComprehensiveValue).toBe(0);
    expect(body).not.toHaveProperty("otherSeparateAggregateValue");
  });

  it("초과 0: 합산 칸에 남은 값(stale)은 body에 실리지 않고 ⑧도 요구하지 않는다", () => {
    const stale = { ...F0, otherComprehensiveValue: "200,000,000" };
    expect(validateStep(3, stale)).toBeNull();
    expect(buildPropertyTaxRequestBody(stale)).not.toHaveProperty("otherComprehensiveValue");
  });

  it("Step 2로 돌아가 면적을 줄이면 칸이 사라지고, 다시 늘리면 입력값이 보존된 채 복귀한다", () => {
    const form = { ...F1, otherComprehensiveValue: "200,000,000" };
    expect(buildPropertyTaxRequestBody(form).otherComprehensiveValue).toBe(200_000_000);
    expect(buildPropertyTaxRequestBody({ ...form, stFactoryTotalLandArea: "8000" })).not.toHaveProperty("otherComprehensiveValue");
    expect(buildPropertyTaxRequestBody({ ...form, stFactoryTotalLandArea: "15000" }).otherComprehensiveValue).toBe(200_000_000);
  });
});

describe("재산정(recompute) 개방 — 이관분이 있는 분리과세만 (UQ-5)", () => {
  it("isRecomputeTarget: 공장 초과 true · 이내 false · 농지 false", () => {
    expect(isRecomputeTarget(F1)).toBe(true);
    expect(isRecomputeTarget(F0)).toBe(false);
    expect(isRecomputeTarget(sep({ publishedPrice: "300,000,000", stSeparatedType: "farmland" }))).toBe(false);
  });

  it("Step 3: 초과 > 0이면 재산정 선택지 + direct 안내(상한 미적용), 이내면 선택지 없음(현행)", () => {
    render(<Step3 form={F1} onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /직전연도 과세표준으로 재산정/ })).toBeTruthy();
    expect(text("land-split-direct-cap-note")).toContain("세부담상한에 쓰지 않습니다");
    cleanup();
    render(<Step3 form={F0} onChange={vi.fn()} />);
    expect(screen.queryByRole("radio", { name: /재산정/ })).toBeNull();
    expect(has("land-split-direct-cap-note")).toBe(false);
  });

  it("recompute body: taxCapMode·previousYearTaxBase가 실린다(F-3) · ⑧ 통과", () => {
    const f3 = { ...F1, otherComprehensiveValue: "0", taxCapMode: "recompute" as const, previousYearTaxBase: "500,000,000" };
    const body = buildPropertyTaxRequestBody(f3);
    expect(body).toMatchObject({ taxCapMode: "recompute", previousYearTaxBase: 500_000_000 });
    expect(validateStep(3, f3)).toBeNull();
    // 이내(F-0)로 줄이면 recompute 대상이 아니라 직전 세액 경로로 돌아간다
    expect(buildPropertyTaxRequestBody({ ...f3, stFactoryTotalLandArea: "8000" })).not.toHaveProperty("taxCapMode");
  });
});

describe("결과 카드 — 분리과세분 + 종합합산 이관분 (UQ-6·7·9)", () => {
  it("F-1: 분리과세분 1,680,000 · 이관분 800,000 · 합계 2,480,000 · 총 2,976,000 · 한도 echo · 사유 라벨", () => {
    const r = run({ ...F1, otherComprehensiveValue: "0" });
    expect(r.totalPayable).toBe(2_976_000);
    render(<PropertyTaxResultView result={r} />);
    expect(has("property-land-split-card")).toBe(true);
    const sepd = text("land-split-separated-section");
    expect(sepd).toContain("840,000,000");
    expect(sepd).toContain("1,680,000");
    expect(sepd).toContain("분리과세 세율(0.2%)");
    expect(sepd).toContain("합산하지 않음");
    const lim = text("land-split-separated-area-limit");
    expect(lim).toContain("15,000㎡");
    expect(lim).toContain("12,000㎡");
    expect(lim).toContain("3,000㎡");
    expect(lim).toContain("80%");
    expect(text("land-split-comprehensive")).toContain("210,000,000");
    expect(text("land-split-comprehensive")).toContain("종합합산 이관분 (분리과세 기준면적 초과)");
    expect(text("land-split-row-separated")).toContain("1,680,000");
    expect(text("land-split-row-comprehensive")).toContain("800,000");
    expect(text("land-split-row-total")).toContain("2,480,000");
    expect(has("land-split-row-separate")).toBe(false); // 별도합산분 행 없음
    expect(text("land-split-reasons")).toContain("공장입지기준면적");
  });

  it("F-2(타 종합합산 2억): 몫 900,000 · 합계 2,580,000 · 총 3,096,000", () => {
    const r = run({ ...F1, otherComprehensiveValue: "200,000,000" });
    expect(r.totalPayable).toBe(3_096_000);
    render(<PropertyTaxResultView result={r} />);
    expect(text("land-split-row-comprehensive")).toContain("900,000");
    expect(text("land-split-row-total")).toContain("2,580,000");
  });

  it("P-1 목장: 분리과세분 15,312(0.07%) · 이관분 96,250 · 합계 111,562 · 총 133,874", () => {
    const r = run({ ...P1, otherComprehensiveValue: "0" });
    expect(r.totalPayable).toBe(133_874);
    render(<PropertyTaxResultView result={r} />);
    expect(text("land-split-separated-section")).toContain("목장용지");
    expect(text("land-split-separated-section")).toContain("분리과세 세율(0.07%)");
    expect(text("land-split-row-separated")).toContain("15,312");
    expect(text("land-split-row-comprehensive")).toContain("96,250");
    expect(text("land-split-row-total")).toContain("111,562");
    expect(text("land-split-reasons")).toContain("가축별 기준면적");
  });

  it("산출세액 행 라벨 «분리과세분 세액 + 종합합산 이관분…» · 적용 세율 «누진세율» 오표기 없음", () => {
    render(<PropertyTaxResultView result={run({ ...F1, otherComprehensiveValue: "0" })} />);
    expect(screen.getByText(/분리과세분 세액 \+ 종합합산 이관분/)).toBeTruthy();
    expect(screen.queryByText("누진세율 (구간별)")).toBeNull();
  });

  it("고지 중복 제거: 이관·합산 단위 고지는 카드에만, 종부세 고지는 일반 경고에 남는다", () => {
    render(<PropertyTaxResultView result={run({ ...F1, otherComprehensiveValue: "0" })} />);
    expect(text("land-split-notices")).toContain(PROPERTY_LAND_SPLIT_SEPARATED_NOTICE);
    expect(screen.getAllByText(PROPERTY_LAND_SPLIT_SEPARATED_NOTICE, { exact: false }).length).toBe(1);
    expect(screen.getAllByText(PROPERTY_LAND_SPLIT_EXCESS_COMPREHENSIVE_NOTICE, { exact: false }).length).toBe(1);
    expect(text("land-split-notices")).not.toContain("종합부동산세");
  });

  it("recompute(F-3): 분리과세분 직전연도 세액상당액 줄 + 확정 본세 1,575,000(상한)", () => {
    const r = run({ ...F1, otherComprehensiveValue: "0", taxCapMode: "recompute", previousYearTaxBase: "500,000,000" });
    expect(r.landSplit?.cap?.basisTaxSeparated).toBeGreaterThan(0);
    render(<PropertyTaxResultView result={r} />);
    expect(text("land-split-cap")).toContain("직전연도 분리과세분 세액상당액");
    expect(text("land-split-cap")).toContain(r.landSplit!.cap!.basisTaxSeparated!.toLocaleString("ko-KR"));
    expect(text("land-split-cap-result")).toContain("1,575,000");
    expect(screen.getByText(/분리과세분은 직전연도 분리과세 세율로/)).toBeTruthy();
  });

  it("초과 0(F-0) 결과: 카드 없음(현행 동일) · 이력의 옛 결과(landSplit 없음)도 같다", () => {
    const r = run(F0);
    expect(r.landSplit).toBeUndefined();
    expect(r.totalPayable).toBe(1_344_000);
    render(<PropertyTaxResultView result={r} />);
    expect(has("property-land-split-card")).toBe(false);
  });
});
