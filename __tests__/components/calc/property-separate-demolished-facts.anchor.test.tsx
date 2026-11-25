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
  saBuildingPermit: "yes", // PSA-E3 — 철거 OFF 사례(결과 카드 «철거 판정 블록 없음»)가 허가 요건에 접히지 않게
  saDemolished: true,
  ...over,
});

const noop = () => {};
const view = (form: FormState, onChange: (d: Partial<FormState>) => void = noop) => render(<Step2SeparateAggregate form={form} onChange={onChange} />);
const has = (id: string) => screen.queryByTestId(id) !== null;
const group = (name: string) => document.querySelectorAll(`input[type="radio"][name="${name}"]`);
const floorLabel = () => screen.getByText(/바닥면적 \(㎡\)/);

describe("위젯 노출 — 엔진 사슬(chain.order)을 그대로 따른다 · 엄격 순차(답한 칸 + 첫 미답 칸)", () => {
  it("철거 OFF → 블록 없음 · 라벨은 «건물 바닥면적»", () => {
    view(demolishedForm({ saDemolished: false }));
    expect(has("pt-sa-demolished-facts")).toBe(false);
    expect(floorLabel().textContent).toBe("건물 바닥면적 (㎡)");
  });

  it("철거 ON · 철거일 없음 → 안내 한 줄만 — 종류 라디오도 사실 칸도 없다(PSA-S1: 종류는 사슬이 읽을 때만)", () => {
    view(demolishedForm());
    expect(has("pt-demolished-dates-notice")).toBe(true);
    expect(has("pt-sa-demolished-kind-house")).toBe(false);
    expect(has("pt-sa-demolished-kind-building")).toBe(false);
    expect(group("saDemolishedPermit")).toHaveLength(0);
  });

  it("철거일 있음(날짜가 아직 확정이 아님) · 종류 미선택 → 종류 라디오(기본값 없음) + 안내, 사실 칸 0(⑧도 종류부터 요구)", () => {
    view(demolishedForm({ saDemolishedDate: "2026-01-01" }));
    expect(has("pt-sa-demolished-kind-house")).toBe(true);
    expect(has("pt-sa-demolished-kind-building")).toBe(true);
    expect(document.querySelectorAll('input[name="saDemolishedKind"]:checked')).toHaveLength(0);
    expect(has("pt-demolished-dates-notice")).toBe(true);
    expect(group("saDemolishedPermit")).toHaveLength(0);
  });

  it("건축물 · 철거 2026-01-01 → 허가만(건축 외 용도는 허가 «예» 뒤) · 바닥면적 필수 표시는 사슬이 그 칸을 읽을 때만", () => {
    const base = demolishedForm({ saDemolishedKind: "building", saDemolishedDate: "2026-01-01" });
    const { rerender } = view(base);
    expect(group("saDemolishedPermit")).toHaveLength(3);
    expect(group("saDemolishedOtherUse")).toHaveLength(0);
    expect(group("saDemolishedVacantHouse")).toHaveLength(0);
    expect(has("pt-demolished-dates-notice")).toBe(false);
    expect(floorLabel().textContent).toBe("철거 전 건축물 바닥면적 (㎡)");
    rerender(<Step2SeparateAggregate form={{ ...base, saDemolishedPermit: "yes" }} onChange={noop} />);
    expect(group("saDemolishedOtherUse")).toHaveLength(3);
    expect(floorLabel().textContent).toBe("철거 전 건축물 바닥면적 (㎡)");
    rerender(<Step2SeparateAggregate form={{ ...base, saDemolishedPermit: "yes", saDemolishedOtherUse: "no" }} onChange={noop} />);
    expect(floorLabel().textContent).toBe("철거 전 건축물 바닥면적 (㎡) *");
    // 건축 외 «예» → 접힘 확정 — 뒤 칸 없음 · 바닥면적 필수 아님
    rerender(<Step2SeparateAggregate form={{ ...base, saDemolishedPermit: "yes", saDemolishedOtherUse: "yes" }} onChange={noop} />);
    expect(group("saDemolishedVacantHouse")).toHaveLength(0);
    expect(floorLabel().textContent).toBe("철거 전 건축물 바닥면적 (㎡)");
  });

  it("주택 · 철거 2026-01-01(일반 기간 안) → 허가 먼저 · 빈집정비는 건축 외 «예» 뒤(단서 하위) · 바닥면적은 필수 아님", () => {
    const base = demolishedForm({ saDemolishedKind: "house", saDemolishedDate: "2026-01-01" });
    const { rerender } = view(base);
    expect(group("saDemolishedPermit")).toHaveLength(3);
    expect(group("saDemolishedVacantHouse")).toHaveLength(0);
    rerender(<Step2SeparateAggregate form={{ ...base, saDemolishedPermit: "yes", saDemolishedOtherUse: "no" }} onChange={noop} />);
    expect(group("saDemolishedVacantHouse")).toHaveLength(0); // 건축 외 «아니오» — 빈집정비를 묻지 않는다
    expect(floorLabel().textContent).toBe("철거 전 건축물 바닥면적 (㎡)");
    rerender(<Step2SeparateAggregate form={{ ...base, saDemolishedPermit: "yes", saDemolishedOtherUse: "yes" }} onChange={noop} />);
    expect(group("saDemolishedVacantHouse")).toHaveLength(3);
    // 허가 «아니오» → 접힘 확정 · 건축 외 용도·빈집정비 칸 없음
    rerender(<Step2SeparateAggregate form={{ ...base, saDemolishedPermit: "no", saDemolishedOtherUse: "yes" }} onChange={noop} />);
    expect(group("saDemolishedOtherUse")).toHaveLength(0);
    expect(group("saDemolishedVacantHouse")).toHaveLength(0);
  });

  it("라디오 순서 = 계산 순서: (단서 자리) 종류 → 허가 → 건축 외 용도 → 빈집정비 · (관문 자리) 종류 → 빈집정비 → 허가 → 건축 외 용도 (DOM 순)", () => {
    const orderOf = () => {
      const names = [...document.querySelectorAll('input[type="radio"]')].map((i) => (i as HTMLInputElement).name);
      return names.filter((n, i) => names.indexOf(n) === i).filter((n) => n.startsWith("saDemolished"));
    };
    view(demolishedForm({ saDemolishedKind: "house", saDemolishedDate: "2026-01-01", saDemolishedPermit: "yes", saDemolishedOtherUse: "yes" }));
    expect(orderOf()).toEqual(["saDemolishedKind", "saDemolishedPermit", "saDemolishedOtherUse", "saDemolishedVacantHouse"]);
    cleanup();
    view(demolishedForm({ saDemolishedKind: "house", saDemolishedDate: "2024-06-15", saDemolishedVacantHouse: "yes", saDemolishedPermit: "yes" }));
    expect(orderOf()).toEqual(["saDemolishedKind", "saDemolishedVacantHouse", "saDemolishedPermit", "saDemolishedOtherUse"]);
  });

  it("철거 2025-05-31(일반 1년 경과) · 건축물 → 요건 칸 0 + «지나 종합합산» 안내(사슬이 낸 문장 — ⑧도 요구 0)", () => {
    const f = demolishedForm({ saDemolishedKind: "building", saDemolishedDate: "2025-05-31" });
    view(f);
    expect(group("saDemolishedPermit")).toHaveLength(0);
    expect(screen.getByTestId("pt-sa-demolished-no-facts").textContent).toContain("종합합산으로 처리합니다");
    expect(firstInvalidStep({ ...f, otherSeparateAggregateValue: "0", otherComprehensiveValue: "0" })).toBeNull();
  });

  it("철거 2023-05-31(빈집 3년도 지남) → 종류 라디오도 사실 칸도 없이 일반·빈집 기간 병기 안내 · ⑧은 종류 없이 통과", () => {
    const f = demolishedForm({ saDemolishedDate: "2023-05-31" });
    view(f);
    expect(has("pt-sa-demolished-kind-house")).toBe(false);
    expect(group("saDemolishedPermit")).toHaveLength(0);
    expect(screen.getByTestId("pt-sa-demolished-no-facts").textContent).toContain("일반 한시 기간(1년)과 빈집정비사업 철거 빈집 한시 기간(3년)이 모두 지나");
    expect(has("pt-demolished-dates-notice")).toBe(false);
    expect(firstInvalidStep({ ...f, otherSeparateAggregateValue: "0", otherComprehensiveValue: "0" })).toBeNull();
  });

  it("주택 · 철거 2024-06-15(일반 1년 밖·빈집 3년 안) → 빈집정비가 관문 · «아니오»면 허가·건축 외 칸 없이 확정 · «예»부터 허가 → 건축 외 → 공용 → 유료", () => {
    const base = demolishedForm({ saDemolishedKind: "house", saDemolishedDate: "2024-06-15" });
    const { rerender } = view(base);
    expect(group("saDemolishedVacantHouse")).toHaveLength(3);
    expect(group("saDemolishedPermit")).toHaveLength(0);

    rerender(<Step2SeparateAggregate form={{ ...base, saDemolishedVacantHouse: "no", saDemolishedPermit: "yes" }} onChange={noop} />);
    expect(group("saDemolishedVacantHouse")).toHaveLength(3);
    expect(group("saDemolishedPermit")).toHaveLength(0); // 관문 «아니오» — 접힘 확정, 저장된 허가 답은 화면에 새지 않는다

    const open = { ...base, saDemolishedVacantHouse: "yes" as const };
    rerender(<Step2SeparateAggregate form={open} onChange={noop} />);
    expect(group("saDemolishedPermit")).toHaveLength(3);
    expect(group("saDemolishedOtherUse")).toHaveLength(0);

    const chain = { ...open, saDemolishedPermit: "yes" as const, saDemolishedOtherUse: "yes" as const };
    rerender(<Step2SeparateAggregate form={chain} onChange={noop} />);
    expect(group("saDemolishedVacantHouse")).toHaveLength(3); // 같은 칸 — 두 번 그려지지 않는다
    expect(group("saDemolishedPublicUse")).toHaveLength(3);
    expect(group("saDemolishedPublicUsePaid")).toHaveLength(0);

    rerender(<Step2SeparateAggregate form={{ ...chain, saDemolishedPublicUse: "yes" }} onChange={noop} />);
    expect(group("saDemolishedPublicUsePaid")).toHaveLength(3);

    // 위 답이 바뀌어 사슬이 끊기면 하위 칸은 사라진다(저장값은 그대로 — 아래 «숨은 값 보존»)
    rerender(<Step2SeparateAggregate form={{ ...chain, saDemolishedPublicUse: "yes", saDemolishedOtherUse: "no" }} onChange={noop} />);
    expect(group("saDemolishedPublicUse")).toHaveLength(0);
    expect(group("saDemolishedPublicUsePaid")).toHaveLength(0);
  });

  it("주택 · 철거 2026-01-01 · 건축 외 «예» · 빈집정비 «예» → 공용 사용 → «예»이면 유료(단서 자리 — 일반 기간 안)", () => {
    const base = demolishedForm({ saDemolishedKind: "house", saDemolishedDate: "2026-01-01", saDemolishedPermit: "yes", saDemolishedOtherUse: "yes" });
    const { rerender } = view(base);
    expect(has("pt-sa-demolished-publicuse")).toBe(false);
    rerender(<Step2SeparateAggregate form={{ ...base, saDemolishedVacantHouse: "no" }} onChange={noop} />);
    expect(has("pt-sa-demolished-publicuse")).toBe(false);
    rerender(<Step2SeparateAggregate form={{ ...base, saDemolishedVacantHouse: "yes" }} onChange={noop} />);
    expect(group("saDemolishedPublicUse")).toHaveLength(3);
  });

  it("철거일이 과세기준일(올해 6.1.) 뒤 → 모순 안내 · 칸 0 · ⑧이 같은 문구로 차단(고칠 칸은 철거일)", () => {
    const f = demolishedForm({ saDemolishedKind: "building", saDemolishedDate: "2026-06-02" });
    view(f);
    expect(screen.getByTestId("pt-sa-demolished-contradiction").textContent).toBe(PROPERTY_DEMOLISHED_ISSUE_MESSAGE.demolishedAfterBaseDate);
    expect(group("saDemolishedPermit")).toHaveLength(0);
    expect(has("pt-sa-demolished-kind-house")).toBe(false);
    expect(firstInvalidStep(f)?.message).toBe(PROPERTY_DEMOLISHED_ISSUE_MESSAGE.demolishedAfterBaseDate);
  });

  it("공장용지 ∧ 종류 «주택» → 모순 안내 + ⑧ 차단(자동으로 건축물을 채우지 않는다) · 고칠 칸인 종류 라디오는 화면에 남는다", () => {
    const f = demolishedForm({ saIsFactory: true, saDemolishedKind: "house", saDemolishedDate: "2026-01-01" });
    view(f);
    expect(screen.getByTestId("pt-sa-demolished-contradiction").textContent).toBe(PROPERTY_DEMOLISHED_ISSUE_MESSAGE.demolishedFactoryHouse);
    expect(has("pt-sa-demolished-kind-building")).toBe(true);
    expect((screen.getByTestId("pt-sa-demolished-kind-house") as HTMLInputElement).checked).toBe(true);
    expect(group("saDemolishedPermit")).toHaveLength(0);
    expect(f.saDemolishedKind).toBe("house");
    expect(firstInvalidStep(f)?.step).toBe(2);
  });
});

describe("쓰기 — onChange 패치만(미러링·자동 채움 없음)", () => {
  it("종류·허가·건축 외 용도·빈집정비 클릭 → 해당 칸만 패치", () => {
    const onChange = vi.fn();
    view(demolishedForm({ saDemolishedKind: "house", saDemolishedDate: "2026-01-01", saDemolishedPermit: "yes", saDemolishedOtherUse: "yes" }), onChange);
    fireEvent.click(screen.getByTestId("pt-sa-demolished-kind-building"));
    fireEvent.click(screen.getByTestId("pt-sa-demolished-permit-unknown"));
    fireEvent.click(screen.getByTestId("pt-sa-demolished-otheruse-no"));
    fireEvent.click(screen.getByTestId("pt-sa-demolished-vacanthouse-no"));
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([
      { saDemolishedKind: "building" },
      { saDemolishedPermit: "unknown" },
      { saDemolishedOtherUse: "no" },
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
      saDemolishedOtherUse: "yes",
      saDemolishedVacantHouse: "yes",
      saDemolishedPublicUse: "no",
      saBuildingFloorArea: "",
    });
    expect(sa(house)).toMatchObject({ demolishedKind: "house", demolishedPermit: "yes", demolishedOtherUse: "yes", demolishedVacantHouse: "yes" });
    expect(sa(house)).not.toHaveProperty("buildingFloorArea");

    const building = { ...house, saDemolishedKind: "building" as const, saBuildingFloorArea: "100" };
    expect(building.saDemolishedVacantHouse).toBe("yes"); // 지워지지 않았다
    expect(sa(building)).not.toHaveProperty("demolishedVacantHouse"); // 건축물은 건축 외 «예»에서 접힘 — 빈집정비 단서 없음
    expect(sa(building)).not.toHaveProperty("buildingFloorArea"); // 접힘 확정 — 바닥면적을 읽지 않는다
    expect(sa(building)).toMatchObject({ demolishedKind: "building" });
    const buildingOk = { ...building, saDemolishedOtherUse: "no" as const };
    expect(sa(buildingOk)).toMatchObject({ demolishedKind: "building", buildingFloorArea: 100, zoningDistrict: "commercial" });

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
    // 사슬은 첫 미답 칸(허가)에서 멈춘다 — 그 뒤 칸은 읽지도 싣지도 않는다
    for (const k of ["demolishedOtherUse", "demolishedVacantHouse", "demolishedPublicUse", "demolishedPublicUsePaid", "buildingFloorArea"]) expect(item, k).not.toHaveProperty(k);
    expect(item).toMatchObject({ demolishedPermit: "" });
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

  it("날짜 확정 접힘(철거 2021-01-01 · 종류 없음) → 1,380,000대 이관 카드의 «한시 기간»은 일반·빈집 두 기간 병기(빈집 3년만 보이지 않음)", () => {
    const r = run(demolishedForm({ saDemolishedDate: "2021-01-01", saDemolishedKind: "", ...N, otherSeparateAggregateValue: "" }));
    render(<PropertyTaxResultView result={r} />);
    expect(text("land-split-demolished-period")).toContain("일반 한시 기간(1년)과 빈집정비사업 철거 빈집 한시 기간(3년) 모두 경과");
    expect(text("land-split-demolished-period")).not.toContain("3년(빈집정비사업 철거 빈집)");
    expect(text("land-split-demolished-outcome")).toContain("한시 기간이 지남");
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
