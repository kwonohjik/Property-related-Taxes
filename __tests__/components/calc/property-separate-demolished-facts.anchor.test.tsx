/**
 * PSA-U1 — 재산세 별도합산 철거 사실 칸 위젯(`SeparateAggregateDemolishedFacts`) · 결과 카드 철거 판정 블록.
 * 과세기준일은 가짜 Date로 고정한다(화면은 `targetDate`를 보내지 않아 올해 6.1.). 시료 = 엔진 계획서 §7 K-표.
 *   위젯: 노출 격자(종류·철거일·답 사슬) · onChange 패치 · 숨은 값 보존·④ 미전송 · 문구가 시행본을 따름 · ⑧ 첫 실패 단계
 *   결과: K-1·K-2·K-15~K-20 세액 + 철거 판정 블록(holds/fold 사유·면적 범위·확인 필요)
 */
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { Step2SeparateAggregate } from "@/components/calc/property/Step2SeparateAggregate";
import { PropertyTaxResultView } from "@/components/calc/results/PropertyTaxResultView";
import { INITIAL_FORM, buildPropertyTaxRequestBody, firstInvalidStep, type FormState } from "@/components/calc/property/shared";
import { propertyTaxInputSchema } from "@/lib/validators/property-input";
import { calculatePropertyTax } from "@/lib/tax-engine/property-tax";
import { PROPERTY_DEMOLISHED_ISSUE_MESSAGE } from "@/lib/tax-engine/property-separate-requirements";
import { PROPERTY_DEMOLISHED_PUBLIC_USE_UNPAID_NOTICE } from "@/lib/tax-engine/property-separate-requirements";
import { propertyDemolishedVerdictLines } from "@/lib/calc/property-demolished-verdict-text";
import type { PropertyTaxInput } from "@/lib/tax-engine/types/property.types";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T00:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** 상업 300㎡ · 바닥 100(기준 300㎡) — 공시가격 3억 */
const demolishedForm = (over: Partial<FormState> = {}): FormState => ({
  ...INITIAL_FORM,
  objectType: "land",
  landTaxType: "separate_aggregate",
  publishedPrice: "300,000,000",
  saLandArea: "300",
  saZoningDistrict: "commercial",
  saBuildingFloorArea: "100",
  saDemolished: true,
  ...over,
});

const noop = () => {};
const view = (form: FormState, onChange: (d: Partial<FormState>) => void = noop) => render(<Step2SeparateAggregate form={form} onChange={onChange} />);
const has = (id: string) => screen.queryByTestId(id) !== null;
const group = (name: string) => document.querySelectorAll(`input[type="radio"][name="${name}"]`);
const floorLabel = () => screen.getByText(/바닥면적 \(㎡\)/);

describe("위젯 노출 — 엔진 요구 술어를 그대로 따른다", () => {
  it("철거 OFF → 블록 없음 · 라벨은 «건물 바닥면적»", () => {
    view(demolishedForm({ saDemolished: false }));
    expect(has("pt-sa-demolished-facts")).toBe(false);
    expect(floorLabel().textContent).toBe("건물 바닥면적 (㎡)");
  });

  it("철거 ON · 철거일 없음 → 종류 라디오 + 안내 한 줄 · 사실 칸 0", () => {
    view(demolishedForm());
    expect(has("pt-sa-demolished-kind-house")).toBe(true);
    expect(has("pt-sa-demolished-kind-building")).toBe(true);
    expect(has("pt-demolished-dates-notice")).toBe(true);
    expect(group("saDemolishedPermit")).toHaveLength(0);
    // 종류 기본값 없음 — 아무 것도 선택돼 있지 않다
    expect(document.querySelectorAll('input[name="saDemolishedKind"]:checked')).toHaveLength(0);
  });

  it("철거일 있음 · 종류 미선택 → 사실 칸 0 + 안내(⑧도 종류부터 요구)", () => {
    view(demolishedForm({ saDemolishedDate: "2026-01-01" }));
    expect(has("pt-demolished-dates-notice")).toBe(true);
    expect(group("saDemolishedPermit")).toHaveLength(0);
  });

  it("건축물 · 철거 2026-01-01 → 허가 + 건축 외 용도(빈집정비 없음) · 바닥면적 필수 표시", () => {
    view(demolishedForm({ saDemolishedKind: "building", saDemolishedDate: "2026-01-01" }));
    expect(group("saDemolishedPermit")).toHaveLength(3);
    expect(group("saDemolishedOtherUse")).toHaveLength(3);
    expect(group("saDemolishedVacantHouse")).toHaveLength(0);
    expect(has("pt-demolished-dates-notice")).toBe(false);
    expect(floorLabel().textContent).toBe("철거 전 건축물 바닥면적 (㎡) *");
  });

  it("주택 · 철거 2026-01-01 → 빈집정비 노출 · 바닥면적은 필수 아님(표시 *없음)", () => {
    view(demolishedForm({ saDemolishedKind: "house", saDemolishedDate: "2026-01-01" }));
    expect(group("saDemolishedVacantHouse")).toHaveLength(3);
    expect(floorLabel().textContent).toBe("철거 전 건축물 바닥면적 (㎡)");
  });

  it("라디오 순서 = 계산 순서: 허가 → 건축 외 용도 → 빈집정비 (DOM 순)", () => {
    view(demolishedForm({ saDemolishedKind: "house", saDemolishedDate: "2026-01-01" }));
    const names = [...document.querySelectorAll('input[type="radio"]')].map((i) => (i as HTMLInputElement).name);
    const order = names.filter((n, i) => names.indexOf(n) === i);
    expect(order.filter((n) => n.startsWith("saDemolished"))).toEqual(["saDemolishedKind", "saDemolishedPermit", "saDemolishedOtherUse", "saDemolishedVacantHouse"]);
  });

  it("철거 2025-05-31(1년 경과) → 요건 칸 0 + «1년 이상 지나 종합합산» 안내(⑧도 요구 0)", () => {
    const f = demolishedForm({ saDemolishedKind: "building", saDemolishedDate: "2025-05-31" });
    view(f);
    expect(group("saDemolishedPermit")).toHaveLength(0);
    expect(screen.getByTestId("pt-sa-demolished-no-facts").textContent).toContain("종합합산으로 처리합니다");
    expect(firstInvalidStep({ ...f, otherSeparateAggregateValue: "0", otherComprehensiveValue: "0" })).toBeNull();
  });

  it("주택 · 철거 2024-06-15 → 3년 안이라 허가·건축 외·빈집정비 칸 · 빈집정비 «예» ∧ 건축 외 «예»이면 공용 사용 → «예»이면 유료", () => {
    const base = demolishedForm({ saDemolishedKind: "house", saDemolishedDate: "2024-06-15", saDemolishedPermit: "yes" });
    const { rerender } = view(base);
    expect(group("saDemolishedVacantHouse")).toHaveLength(3);
    expect(has("pt-sa-demolished-publicuse")).toBe(false);

    const half = { ...base, saDemolishedOtherUse: "yes" as const, saDemolishedVacantHouse: "no" as const };
    rerender(<Step2SeparateAggregate form={half} onChange={noop} />);
    expect(has("pt-sa-demolished-publicuse")).toBe(false);

    const open = { ...half, saDemolishedVacantHouse: "yes" as const };
    rerender(<Step2SeparateAggregate form={open} onChange={noop} />);
    expect(group("saDemolishedPublicUse")).toHaveLength(3);
    expect(group("saDemolishedPublicUsePaid")).toHaveLength(0);

    rerender(<Step2SeparateAggregate form={{ ...open, saDemolishedPublicUse: "yes" }} onChange={noop} />);
    expect(group("saDemolishedPublicUsePaid")).toHaveLength(3);

    // 위 답이 바뀌어 사슬이 끊기면 하위 칸은 사라진다(저장값은 그대로 — 아래 «숨은 값 보존»)
    rerender(<Step2SeparateAggregate form={{ ...open, saDemolishedPublicUse: "yes", saDemolishedOtherUse: "no" }} onChange={noop} />);
    expect(group("saDemolishedPublicUse")).toHaveLength(0);
    expect(group("saDemolishedPublicUsePaid")).toHaveLength(0);
  });

  it("철거일이 과세기준일(올해 6.1.) 뒤 → 모순 안내 · 요건 칸 0 · ⑧이 같은 문구로 차단", () => {
    const f = demolishedForm({ saDemolishedKind: "building", saDemolishedDate: "2026-06-02" });
    view(f);
    expect(screen.getByTestId("pt-sa-demolished-contradiction").textContent).toBe(PROPERTY_DEMOLISHED_ISSUE_MESSAGE.demolishedAfterBaseDate);
    expect(group("saDemolishedPermit")).toHaveLength(0);
    expect(firstInvalidStep(f)?.message).toBe(PROPERTY_DEMOLISHED_ISSUE_MESSAGE.demolishedAfterBaseDate);
  });

  it("공장용지 ∧ 종류 «주택» → 모순 안내 + ⑧ 차단(자동으로 건축물을 채우지 않는다)", () => {
    const f = demolishedForm({ saIsFactory: true, saDemolishedKind: "house", saDemolishedDate: "2026-01-01" });
    view(f);
    expect(screen.getByTestId("pt-sa-demolished-contradiction").textContent).toBe(PROPERTY_DEMOLISHED_ISSUE_MESSAGE.demolishedFactoryHouse);
    expect(f.saDemolishedKind).toBe("house");
    expect(firstInvalidStep(f)?.step).toBe(2);
  });
});

describe("쓰기 — onChange 패치만(미러링·자동 채움 없음)", () => {
  it("종류·허가·건축 외 용도·빈집정비 클릭 → 해당 칸만 패치", () => {
    const onChange = vi.fn();
    view(demolishedForm({ saDemolishedKind: "house", saDemolishedDate: "2026-01-01" }), onChange);
    fireEvent.click(screen.getByTestId("pt-sa-demolished-kind-building"));
    fireEvent.click(screen.getByTestId("pt-sa-demolished-permit-unknown"));
    fireEvent.click(screen.getByTestId("pt-sa-demolished-otheruse-yes"));
    fireEvent.click(screen.getByTestId("pt-sa-demolished-vacanthouse-no"));
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([
      { saDemolishedKind: "building" },
      { saDemolishedPermit: "unknown" },
      { saDemolishedOtherUse: "yes" },
      { saDemolishedVacantHouse: "no" },
    ]);
  });
});

describe("숨은 값 보존 · ④ 미전송", () => {
  const sa = (f: FormState) => (buildPropertyTaxRequestBody(f) as { separateAggregateItem: Record<string, unknown> }).separateAggregateItem;

  it("주택 → 건축물로 바꿔도 빈집정비 답은 폼에 남고 body에서만 빠진다 · 다시 주택이면 그대로 체크", () => {
    const house = demolishedForm({
      saDemolishedKind: "house",
      saDemolishedDate: "2026-01-01",
      saDemolishedPermit: "yes",
      saDemolishedOtherUse: "no",
      saDemolishedVacantHouse: "yes",
      saBuildingFloorArea: "",
    });
    expect(sa(house)).toMatchObject({ demolishedKind: "house", demolishedPermit: "yes", demolishedOtherUse: "no", demolishedVacantHouse: "yes" });
    expect(sa(house)).not.toHaveProperty("buildingFloorArea");

    const building = { ...house, saDemolishedKind: "building" as const, saBuildingFloorArea: "100" };
    expect(building.saDemolishedVacantHouse).toBe("yes"); // 지워지지 않았다
    expect(sa(building)).not.toHaveProperty("demolishedVacantHouse");
    expect(sa(building)).toMatchObject({ demolishedKind: "building", buildingFloorArea: 100 });

    view(house);
    expect((screen.getByTestId("pt-sa-demolished-vacanthouse-yes") as HTMLInputElement).checked).toBe(true);
  });

  it("건축 외 용도 «예→아니오»로 끊기면 공용 사용·유료 답은 폼에 남고 body에서 빠진다", () => {
    const f = demolishedForm({
      saDemolishedKind: "house",
      saDemolishedDate: "2024-06-15",
      saDemolishedPermit: "yes",
      saDemolishedOtherUse: "yes",
      saDemolishedVacantHouse: "yes",
      saDemolishedPublicUse: "yes",
      saDemolishedPublicUsePaid: "yes",
      saBuildingFloorArea: "",
    });
    expect(sa(f)).toMatchObject({ demolishedPublicUse: "yes", demolishedPublicUsePaid: "yes" });
    const cut = { ...f, saDemolishedOtherUse: "no" as const };
    expect(cut.saDemolishedPublicUse).toBe("yes");
    expect(sa(cut)).not.toHaveProperty("demolishedPublicUse");
    expect(sa(cut)).not.toHaveProperty("demolishedPublicUsePaid");
  });

  it("요구되지 않은 칸은 실리지 않는다 — 요구됐는데 미선택인 칸은 `\"\"`(⑧이 보내기 전에 막고 ⑫가 400)", () => {
    const f = demolishedForm({ saDemolishedKind: "building", saDemolishedDate: "2026-01-01" });
    const item = sa(f);
    for (const k of ["demolishedVacantHouse", "demolishedPublicUse", "demolishedPublicUsePaid"]) expect(item, k).not.toHaveProperty(k);
    expect(item).toMatchObject({ demolishedPermit: "", demolishedOtherUse: "" });
    expect(propertyTaxInputSchema.safeParse(buildPropertyTaxRequestBody(f)).success).toBe(false);
    expect(firstInvalidStep(f)?.step).toBe(2);
  });
});

describe("문구는 과세기준일 시행본을 따른다(고정 «1년» 아님)", () => {
  it("올해(2026) 시행본: 일반 1년 · 빈집정비 3년", () => {
    view(demolishedForm());
    expect(document.body.textContent).toContain("한시 기간(1년 · 빈집정비사업 철거 빈집 3년)");
    expect(document.body.textContent).not.toContain("철거·멸실 후 1년 이내 별도합산 유지 특례");
  });

  it("2025 시행본: 일반 6개월", () => {
    vi.setSystemTime(new Date("2025-11-25T00:00:00Z"));
    view(demolishedForm());
    expect(document.body.textContent).toContain("한시 기간(6개월 · 빈집정비사업 철거 빈집 3년)");
  });

  it("2023 시행본: 빈집 3년 문언 없음 → 일반 6개월만", () => {
    vi.setSystemTime(new Date("2023-11-25T00:00:00Z"));
    view(demolishedForm());
    expect(document.body.textContent).toContain("한시 기간(6개월)");
    expect(document.body.textContent).not.toContain("빈집정비사업 철거 빈집 3년");
  });
});

describe("⑧ — 첫 실패 단계는 철거 칸이 있는 step 2", () => {
  const ok = { otherSeparateAggregateValue: "0", otherComprehensiveValue: "0" };

  it("종류 미선택 → step 2 · 종류 문구 · 위젯에 그 칸이 그려져 있다", () => {
    const f = demolishedForm({ saDemolishedDate: "2026-01-01", ...ok });
    expect(firstInvalidStep(f)).toEqual({ step: 2, message: PROPERTY_DEMOLISHED_ISSUE_MESSAGE.demolishedKind });
    view(f);
    expect(has("pt-sa-demolished-kind-house")).toBe(true);
  });

  it("건축물 · 허가 미선택 → step 2 · 허가 문구 · 위젯에 허가 칸", () => {
    const f = demolishedForm({ saDemolishedKind: "building", saDemolishedDate: "2026-01-01", ...ok });
    expect(firstInvalidStep(f)).toEqual({ step: 2, message: PROPERTY_DEMOLISHED_ISSUE_MESSAGE.demolishedPermit });
    view(f);
    expect(group("saDemolishedPermit")).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 결과 — 철거 판정 블록 + 세액(K-표)
// ─────────────────────────────────────────────────────────────────────────────

function run(form: FormState) {
  expect(firstInvalidStep(form)).toBeNull();
  const parsed = propertyTaxInputSchema.safeParse(buildPropertyTaxRequestBody(form));
  expect(parsed.success).toBe(true);
  return calculatePropertyTax((parsed as { data: PropertyTaxInput }).data);
}
const text = (id: string) => screen.getByTestId(id).textContent ?? "";
const N = { otherSeparateAggregateValue: "0", otherComprehensiveValue: "0" };
const bld = (over: Partial<FormState>) => demolishedForm({ saDemolishedKind: "building", saDemolishedDate: "2026-01-01", saDemolishedPermit: "yes", saDemolishedOtherUse: "no", ...N, ...over });
const hse = (over: Partial<FormState>) =>
  demolishedForm({
    publishedPrice: "400,000,000",
    saLandArea: "400",
    saBuildingFloorArea: "",
    saDemolishedKind: "house",
    saDemolishedDate: "2024-06-15",
    saDemolishedPermit: "yes",
    saDemolishedOtherUse: "no",
    saDemolishedVacantHouse: "yes",
    ...N,
    ...over,
  });

describe("결과 카드 — 철거 특례 판정 블록 + 엔진 세액", () => {
  it("K-1 요건 충족 → 총 516,000 · 판정 «별도합산 유지» · 면적 범위 적용 · 읽은 칸 echo", () => {
    const r = run(bld({}));
    expect(r.totalPayable).toBe(516_000);
    render(<PropertyTaxResultView result={r} />);
    const block = text("land-split-demolished-verdict");
    expect(text("land-split-demolished-outcome")).toContain("별도합산 유지");
    expect(text("land-split-demolished-period")).toContain("1년");
    expect(text("land-split-demolished-area")).toContain("범위만 별도합산");
    expect(text("land-split-demolished-required")).toContain("허가·사용승인");
    expect(text("land-split-demolished-required")).toContain("철거 전 바닥면적·용도지역");
    expect(block).not.toContain("종합합산으로 접힘");
  });

  it("K-2 허가 «아니오» → 총 960,000 · 접힘 사유 «허가·사용승인» + 엔진 고지는 경고 목록에", () => {
    const r = run(bld({ saDemolishedPermit: "no", otherSeparateAggregateValue: "", otherComprehensiveValue: "0" }));
    expect(r.totalPayable).toBe(960_000);
    render(<PropertyTaxResultView result={r} />);
    expect(text("land-split-demolished-outcome")).toContain("종합합산으로 접힘");
    expect(text("land-split-demolished-outcome")).toContain("허가·사용승인을 받지 않았거나 확인되지 않음");
    expect(screen.queryByTestId("land-split-demolished-area")).toBeNull();
    expect(text("land-split-reasons")).toContain("허가·사용승인");
    expect(document.body.textContent).toContain("종합합산으로 이관했습니다 — 확인 필요");
  });

  it("K-3 허가 «모름» → 960,000 · «확인되지 않아» 고지", () => {
    const r = run(bld({ saDemolishedPermit: "unknown", otherSeparateAggregateValue: "" }));
    expect(r.totalPayable).toBe(960_000);
    render(<PropertyTaxResultView result={r} />);
    expect(document.body.textContent).toContain("확인되지 않아(모름·미선택)");
  });

  it("K-15 주택 400㎡ 요건 충족 → 768,000 · 주택은 면적 범위 없음 + 범위 확인 필요 · 바닥면적·용도지역은 읽지 않음", () => {
    const r = run(hse({ saDemolishedDate: "2026-01-01", saDemolishedVacantHouse: "no" }));
    expect(r.totalPayable).toBe(768_000);
    render(<PropertyTaxResultView result={r} />);
    expect(text("land-split-demolished-area")).toContain("부속토지 전체를 별도합산 범위로 봄");
    expect(text("land-split-demolished-required")).not.toContain("철거 전 바닥면적");
  });

  it("K-16 빈집 «예» 3년 안 → 768,000 · 한시 기간 3년", () => {
    const r = run(hse({}));
    expect(r.totalPayable).toBe(768_000);
    render(<PropertyTaxResultView result={r} />);
    expect(text("land-split-demolished-period")).toContain("3년");
    expect(text("land-split-demolished-outcome")).toContain("별도합산 유지");
  });

  it("K-17 빈집 «아니오» → 1,380,000 · 사유 «한시 기간이 지남»", () => {
    const r = run(hse({ saDemolishedVacantHouse: "no", otherSeparateAggregateValue: "", otherComprehensiveValue: "0" }));
    expect(r.totalPayable).toBe(1_380_000);
    render(<PropertyTaxResultView result={r} />);
    expect(text("land-split-demolished-outcome")).toContain("한시 기간이 지남");
    expect(screen.queryByTestId("land-split-demolished-vacant")).toBeNull();
  });

  it("K-18 빈집 «모름» → 1,380,000 · 3년 연장 미확인 «확인 필요» 줄", () => {
    const r = run(hse({ saDemolishedVacantHouse: "unknown", otherSeparateAggregateValue: "", otherComprehensiveValue: "0" }));
    expect(r.totalPayable).toBe(1_380_000);
    render(<PropertyTaxResultView result={r} />);
    expect(text("land-split-demolished-vacant")).toContain("일반 한시 기간만 반영");
  });

  it("K-19 건축 외 «예» ∧ 빈집 «예» ∧ 공용 «예» ∧ 유료 «예» → 768,000 단서 포함", () => {
    const r = run(hse({ saDemolishedOtherUse: "yes", saDemolishedPublicUse: "yes", saDemolishedPublicUsePaid: "yes" }));
    expect(r.totalPayable).toBe(768_000);
    render(<PropertyTaxResultView result={r} />);
    expect(text("land-split-demolished-outcome")).toContain("별도합산 유지");
    expect(text("land-split-demolished-required")).toContain("국가 등 공용·공공용 사용");
    expect(text("land-split-demolished-required")).toContain("유료·재산세 부과");
  });

  it("K-20 유료 «아니오» → 1,380,000 · 사유 «무상 공용» + 비과세 가능성 고지", () => {
    const r = run(
      hse({ saDemolishedOtherUse: "yes", saDemolishedPublicUse: "yes", saDemolishedPublicUsePaid: "no", otherSeparateAggregateValue: "", otherComprehensiveValue: "0" }),
    );
    expect(r.totalPayable).toBe(1_380_000);
    render(<PropertyTaxResultView result={r} />);
    expect(text("land-split-demolished-outcome")).toContain("무상 공용·공공용 사용");
    expect(text("land-split-reasons")).toContain("비과세 가능성");
    expect(document.body.textContent).toContain(PROPERTY_DEMOLISHED_PUBLIC_USE_UNPAID_NOTICE);
  });

  it("철거가 아닌 필지 → 철거 판정 블록 없음(기존 카드 문구 그대로)", () => {
    const r = run(demolishedForm({ saDemolished: false, otherSeparateAggregateValue: "0" }));
    render(<PropertyTaxResultView result={r} />);
    expect(screen.queryByTestId("land-split-demolished-verdict")).toBeNull();
    expect(screen.getByTestId("property-land-split-card")).toBeTruthy();
  });

  it("PDF 행과 화면이 같은 문장 — 판정 echo에서만 만든다", () => {
    const r = run(bld({}));
    const lines = propertyDemolishedVerdictLines(r.landSplit!.demolishedVerdict!);
    expect(lines.map((l) => l.key)).toEqual(["period", "outcome", "area", "required"]);
    render(<PropertyTaxResultView result={r} />);
    for (const l of lines) expect(text(`land-split-demolished-${l.key}`)).toContain(l.text);
  });
});
