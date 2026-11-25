/**
 * PSA-SU — 별도합산 순차 노출 마무리: «이전에 고른 답» 표식(SQ-4) · 확정 안내 문장 · 낭독 한 줄 · 접근성 연결 (계획서 `property-separate-demolished-sequential.ui.plan.md` §2.1-5 · §2.5 · §2.9).
 * 격자(`property-separate-demolished-render-grid`·`property-building-permit-render-grid`)가 «노출 ⇔ 엔진 확정»을 전수 대조하고, 이 파일은 **상태를 가진 흐름**(클릭 → 확인 집합 → 표식)과 접근성 이름을 본다.
 * 시료 시각은 가짜 Date(2026-11-25) — 과세기준일 2026.6.1.(일반 한시 1년 · 허가·건축 외·면적 문언 모두 시행).
 */
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { Step2SeparateAggregate } from "@/components/calc/property/Step2SeparateAggregate";
import { INITIAL_FORM, type FormState } from "@/components/calc/property/shared";
import { PROPERTY_BUILDING_PERMIT_NO_NOTICE } from "@/lib/tax-engine/property-separate-requirements";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T00:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const demolished = (over: Partial<FormState> = {}): FormState => ({
  ...INITIAL_FORM,
  objectType: "land",
  landTaxType: "separate_aggregate",
  publishedPrice: "300,000,000",
  saLandArea: "300",
  saZoningDistrict: "commercial",
  saBuildingFloorArea: "100",
  saDemolished: true,
  saDemolishedDate: "2026-01-01",
  saDemolishedKind: "building",
  saDemolishedPermit: "yes",
  saDemolishedOtherUse: "no",
  ...over,
});

/** 폼을 실제로 갱신하는 하네스 — 클릭이 `onChange` 패치로 이어지고 화면이 다시 그려진다 */
function Harness({ initial }: { initial: FormState }) {
  const [form, setForm] = useState(initial);
  return <Step2SeparateAggregate form={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} />;
}
const has = (id: string) => screen.queryByTestId(id) !== null;
const mark = (f: string) => has(`pt-sa-prev-answer-${f}`);
const confirmBtn = (f: string) => screen.getByTestId(`pt-sa-prev-answer-${f}`).querySelector("button") as HTMLButtonElement;
const status = () => screen.getByTestId("pt-sa-seq-status").textContent;

describe("«이전에 고른 답» 표식 — 숨었다가 다시 나타난 칸이 저장값을 가진 채 보일 때 (SQ-4 · 핸들러 갱신 · useEffect 미러링 없음)", () => {
  it("마운트 직후 저장값이 있는 칸마다 표식 → 확인 버튼 한 번에 그 칸만 사라진다", () => {
    render(<Harness initial={demolished()} />);
    for (const f of ["demolishedKind", "demolishedPermit", "demolishedOtherUse", "buildingFloorArea"]) expect(mark(f), f).toBe(true);
    fireEvent.click(confirmBtn("demolishedKind"));
    expect(mark("demolishedKind")).toBe(false);
    expect(mark("demolishedPermit")).toBe(true);
  });

  it("앞 답을 바꿔 사슬이 접히면 뒤 칸이 사라지고, 다시 «예»로 되돌리면 저장값이 선택된 채 나타나며 표식이 붙는다 · 라디오를 고르면 표식이 사라진다", () => {
    render(<Harness initial={demolished()} />);
    for (const f of ["demolishedKind", "demolishedPermit", "demolishedOtherUse", "buildingFloorArea"]) fireEvent.click(confirmBtn(f));
    for (const f of ["demolishedKind", "demolishedPermit", "demolishedOtherUse", "buildingFloorArea"]) expect(mark(f), `${f} 확인 뒤`).toBe(false);

    fireEvent.click(screen.getByTestId("pt-sa-demolished-permit-no")); // 허가 «아니오» → 확정
    expect(screen.getByTestId("pt-sa-seq-settled").getAttribute("data-reason")).toBe("permit");
    expect(has("pt-sa-demolished-otheruse-no")).toBe(false);
    expect(has("pt-sa-area-basis")).toBe(false);
    expect(mark("demolishedPermit")).toBe(false); // 방금 고른 답은 확인된 답

    fireEvent.click(screen.getByTestId("pt-sa-demolished-permit-yes")); // 되돌림 → 숨었던 칸이 저장값을 가진 채 복귀
    expect(has("pt-sa-seq-settled")).toBe(false);
    expect((screen.getByTestId("pt-sa-demolished-otheruse-no") as HTMLInputElement).checked).toBe(true);
    expect(mark("demolishedOtherUse")).toBe(true);
    expect(mark("buildingFloorArea")).toBe(true);
    expect(mark("demolishedPermit")).toBe(false);

    fireEvent.click(screen.getByTestId("pt-sa-demolished-otheruse-yes")); // 다른 답을 고르면 그 칸은 확인됨 → 표식 사라짐(건축물 + 건축 외 «예» = 확정)
    expect(mark("demolishedOtherUse")).toBe(false);
    expect(screen.getByTestId("pt-sa-seq-settled").getAttribute("data-reason")).toBe("other_use");
  });

  it("면적 쌍: 바닥면적을 고치면 표식이 사라진다 · 라벨 ↔ 입력 연결(getByLabelText)로 같은 칸을 찾는다", () => {
    render(<Harness initial={demolished()} />);
    expect(mark("buildingFloorArea")).toBe(true);
    fireEvent.change(screen.getByLabelText(/철거 전 건축물 바닥면적/), { target: { value: "120" } });
    expect(mark("buildingFloorArea")).toBe(false);
  });

  it("철거 토글 ON → OFF 왕복: 본 경로 허가 칸이 저장값을 가진 채 돌아오면 표식이 붙는다", () => {
    const initial = demolished({ saDemolished: false, saBuildingPermit: "yes" });
    render(<Harness initial={initial} />);
    expect(mark("buildingPermit")).toBe(true);
    fireEvent.click(confirmBtn("buildingPermit"));
    expect(mark("buildingPermit")).toBe(false);
    fireEvent.click(screen.getByRole("switch", { name: /건축물 철거 완료/ })); // ON — 허가 칸은 숨는다
    expect(has("pt-sa-permit")).toBe(false);
    fireEvent.click(screen.getByRole("switch", { name: /건축물 철거 완료/ })); // OFF — 돌아온다
    expect((screen.getByTestId("pt-sa-permit-yes") as HTMLInputElement).checked).toBe(true);
    expect(mark("buildingPermit")).toBe(true);
  });
});

describe("확정 안내 문장 — 사유는 엔진 notice 그대로 · «모름»은 인정하지 않아 확정", () => {
  it("철거 허가 «모름» → «모름은 요건 충족을 인정하지 않아 확정» 문장 · «아니오» → 그 문장 없음 + «답을 바꾸면 이어서 다시 묻습니다»", () => {
    const { rerender } = render(<Step2SeparateAggregate form={demolished({ saDemolishedPermit: "unknown" })} onChange={() => {}} />);
    expect(screen.getByTestId("pt-sa-seq-settled").textContent).toContain("«모름»은 요건 충족을 인정하지 않아 확정됩니다 — 확인되면 답을 바꾸세요.");
    rerender(<Step2SeparateAggregate form={demolished({ saDemolishedPermit: "no" })} onChange={() => {}} />);
    const text = screen.getByTestId("pt-sa-seq-settled").textContent ?? "";
    expect(text).not.toContain("«모름»");
    expect(text).toContain("답을 바꾸면 이어서 다시 묻습니다.");
    expect(text).toContain("이 답으로 별도합산 불성립(종합합산 이관)이 확정되어 나머지 칸은 묻지 않습니다.");
  });

  it("철거일만으로 확정(답 없음) → «철거일(과세기준일)로 결과가 정해져…» · «철거일을 바꾸면…» — «이 답으로»·«답을 바꾸면»을 쓰지 않는다 (L-2)", () => {
    // 2026 과세기준일 · 철거일 3년 초과 = 종류를 묻지 않고 확정(at: date)
    const form = demolished({ saDemolishedDate: "2022-01-01", saDemolishedKind: "", saDemolishedPermit: "", saDemolishedOtherUse: "" });
    render(<Step2SeparateAggregate form={form} onChange={() => {}} />);
    const text = screen.getByTestId("pt-sa-seq-settled").textContent ?? "";
    expect(text).toContain("철거일(과세기준일)로 결과가 정해져 별도합산 불성립(종합합산 이관)이 확정되어 나머지 칸은 묻지 않습니다.");
    expect(text).toContain("철거일을 바꾸면 이어서 다시 묻습니다.");
    expect(text).not.toContain("이 답으로");
    expect(text).not.toContain("답을 바꾸면");
    expect(screen.getByText("철거일로 종합합산 이관이 확정되었습니다")).toBeTruthy(); // 카드 제목도 «이 답으로»가 아니다
    expect(screen.queryByText("이 답으로 종합합산 이관이 확정되었습니다")).toBeNull();
    expect(has("pt-sa-demolished-kind-house")).toBe(false);
  });

  it("종류 답으로 확정(건축물 · 일반 1년 밖) → 답 문장 그대로(날짜 문장 아님)", () => {
    const form = demolished({ saDemolishedDate: "2025-05-01", saDemolishedKind: "building", saDemolishedPermit: "", saDemolishedOtherUse: "" });
    render(<Step2SeparateAggregate form={form} onChange={() => {}} />);
    const text = screen.getByTestId("pt-sa-seq-settled").textContent ?? "";
    expect(text).toContain("이 답으로 별도합산 불성립(종합합산 이관)이 확정되어 나머지 칸은 묻지 않습니다.");
    expect(text).toContain("답을 바꾸면 이어서 다시 묻습니다.");
    expect(text).not.toContain("철거일을 바꾸면");
  });

  it("비철거 허가 «아니오» → 엔진 고지 상수 그대로 + 면적 블록 없음", () => {
    render(<Step2SeparateAggregate form={demolished({ saDemolished: false, saBuildingPermit: "no" })} onChange={() => {}} />);
    expect(screen.getByTestId("pt-sa-seq-settled").textContent).toContain(PROPERTY_BUILDING_PERMIT_NO_NOTICE);
    expect(has("pt-sa-area-basis")).toBe(false);
  });
});

describe("낭독 한 줄(role=status) — 항상 마운트 · 다음 질문과 확정만 읽는다", () => {
  it("허가 미선택 → «다음 질문: 허가·사용승인» → 예 → «건물 바닥면적·용도지역» → 면적 입력 후 빈 문자열 · 아니오 → 확정 문구", () => {
    render(<Harness initial={demolished({ saDemolished: false, saBuildingPermit: "", saZoningDistrict: "", saBuildingFloorArea: "" })} />);
    const el = screen.getByTestId("pt-sa-seq-status");
    expect(el.getAttribute("role")).toBe("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
    expect(status()).toBe("다음 질문: 허가·사용승인");
    fireEvent.click(screen.getByTestId("pt-sa-permit-yes"));
    expect(status()).toBe("다음 질문: 건물 바닥면적·용도지역");
    fireEvent.click(screen.getByTestId("pt-sa-permit-no"));
    expect(status()).toBe("별도합산 불성립이 확정되어 나머지 칸은 묻지 않습니다");
    expect(screen.getByTestId("pt-sa-seq-status")).toBe(el); // 같은 노드 — 언마운트 없이 내용만 바뀐다
  });

  it("철거 ON · 철거일 없음 → 화면 안내와 같은 문구를 낭독한다(빈 문자열 아님) · 철거일이 생기면 다음 질문으로 (L-3)", () => {
    const base = demolished({ saDemolishedDate: "", saDemolishedKind: "", saDemolishedPermit: "", saDemolishedOtherUse: "" });
    const { rerender } = render(<Step2SeparateAggregate form={base} onChange={() => {}} />);
    expect(status()).toBe("철거일을 입력하면 이어서 필요한 칸이 표시됩니다.");
    expect(screen.getByTestId("pt-demolished-dates-notice").textContent).toBe(status());
    rerender(<Step2SeparateAggregate form={{ ...base, saDemolishedDate: "2026-01-01" }} onChange={() => {}} />);
    expect(status()).toBe("다음 질문: 철거된 것의 종류");
    // 화면 안내도 날짜가 아니라 종류를 가리킨다(낭독과 같은 칸)
    expect(screen.queryByTestId("pt-demolished-dates-notice")).toBeNull();
    expect(screen.getByTestId("pt-demolished-kind-notice").textContent).toBe("철거된 것의 종류를 고르면 이어서 필요한 칸이 표시됩니다.");
  });

  it("철거 사슬: 종류 미선택 → «철거된 것의 종류» · 허가 미답 → «허가·사용승인»", () => {
    const { rerender } = render(<Step2SeparateAggregate form={demolished({ saDemolishedKind: "", saDemolishedPermit: "", saDemolishedOtherUse: "" })} onChange={() => {}} />);
    expect(status()).toBe("다음 질문: 철거된 것의 종류");
    rerender(<Step2SeparateAggregate form={demolished({ saDemolishedPermit: "", saDemolishedOtherUse: "" })} onChange={() => {}} />);
    expect(status()).toBe("다음 질문: 허가·사용승인");
  });
});

describe("접근성 이름 — 라디오 그룹 · 라벨 ↔ 입력", () => {
  it("허가·용도지역 라디오 그룹이 role=radiogroup + 이름을 가진다 · 토지 면적·바닥면적 라벨이 입력과 연결된다", () => {
    render(<Step2SeparateAggregate form={demolished({ saDemolished: false, saBuildingPermit: "yes" })} onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: /허가·사용승인을 받은 것입니까/ })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: /용도지역/ })).toBeTruthy();
    expect((screen.getByLabelText(/토지 면적/) as HTMLInputElement).getAttribute("data-testid")).toBe("pt-sa-land-area");
    expect((screen.getByLabelText(/건물 바닥면적/) as HTMLInputElement).getAttribute("data-testid")).toBe("pt-sa-area-floor");
  });

  it("철거 사실 칸 라디오 그룹에도 질문 이름이 붙는다", () => {
    render(<Step2SeparateAggregate form={demolished()} onChange={() => {}} />);
    for (const q of [/주택입니까, 주택이 아닌 건축물입니까/, /허가·사용승인을 받은 것이었습니까/, /건축을 위한 용도 외의 다른 용도로 사용했습니까/]) {
      expect(screen.getByRole("radiogroup", { name: q })).toBeTruthy();
    }
  });
});
