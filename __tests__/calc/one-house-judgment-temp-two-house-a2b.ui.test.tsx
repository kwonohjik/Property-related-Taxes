/**
 * @vitest-environment jsdom
 *
 * anchor(⑤⑧) — OH-01 A2b · 판정 메뉴 ③의 §155①2호 새 입력이 **실제 위젯**으로 배선됐는가
 *
 * 렌더된 `Step2`로 본다 — `judgeTempTwoHouseFromForm`을 직접 부르면 화면이 무엇을 넘기는지
 * 증명하지 못한다(`feedback_library_anchor_does_not_prove_component_uses_it`).
 *
 * | # | 무엇을 고정하나 |
 * |---|---|
 * | UI-1 | 결론을 바꾸는 양도 시기(2021-03-01)에만 블록이 뜬다 · 2024-06-01이면 없다(부정 짝) |
 * | UI-2 | 주소가 없으면 두 주택 선언 라디오가 뜨고 고르면 그 필드로 patch된다 |
 * | UI-3 | 주소가 있으면 라디오 대신 자동 판정 문구(엔진과 같은 우선순위) |
 * | UI-4 | 전입일 ±1일이 카드 「요건 C」를 가른다 · 한쪽 비조정이면 전입 칸이 사라진다 |
 * | UI-5 | 임차인 단서 — 카드가 연장된 기한(2021-12-31)을 말한다 |
 * | UI-6 | ⑧ — 칸이 있을 때만 막는다(토글 ON·종료일 없음 = 차단 · 전입 미입력 = 경고) |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

const GANGNAM = "1168010100";

function form(over: Record<string, unknown> = {}, rowOver: Record<string, unknown> = {}, assetOver: Record<string, unknown> = {}) {
  return {
    ...createInitialOneHouseJudgmentForm(),
    isOneHousehold: true,
    transferDate: "2021-03-01",
    contractTotalPrice: "500000000",
    presaleRights: [],
    houses: [
      {
        id: "h-new",
        region: "capital",
        acquisitionDate: "2020-06-01",
        officialPrice: "300000000",
        isInherited: false,
        ...rowOver,
      },
    ],
    assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2015-01-01", ...assetOver }],
    ...over,
  } as unknown as OneHouseJudgmentFormData;
}

const block = () => screen.queryByTestId("temp-two-house-regulated-block");
const card = () => screen.getByTestId("temp-two-house-verdict").textContent ?? "";
const radio = (name: string, value: string) =>
  document.querySelector(`input[name="${name}"][value="${value}"]`) as HTMLInputElement | null;

describe("UI-1 노출 게이트", () => {
  it("양도 2021-03-01(조정→조정 단축 기한 시기) → 블록이 뜬다", () => {
    render(<Step2 form={form()} onChange={() => {}} />);
    expect(block()).not.toBeNull();
  });
  it("부정 짝 — 양도 2024-06-01(본문 3년뿐) → 블록 없음", () => {
    render(<Step2 form={form({ transferDate: "2024-06-01" })} onChange={() => {}} />);
    expect(block()).toBeNull();
  });
});

describe("UI-2 선언 라디오 → 폼 patch", () => {
  it("신규 주택 「조정대상지역」을 고르면 newHouseRegulatedAtAcquisition = yes", () => {
    const onChange = vi.fn();
    render(<Step2 form={form()} onChange={onChange} />);
    fireEvent.click(radio("newHouseRegulatedAtAcquisition", "yes")!);
    expect(onChange).toHaveBeenCalledWith({ newHouseRegulatedAtAcquisition: "yes" });
    fireEvent.click(radio("prevHouseRegulatedAtNewAcquisition", "no")!);
    expect(onChange).toHaveBeenCalledWith({ prevHouseRegulatedAtNewAcquisition: "no" });
  });
});

describe("UI-3 주소가 있으면 자동 판정", () => {
  it("양도·신규 모두 강남 코드 → 라디오 없음 · 자동 판정 문구", () => {
    render(<Step2 form={form({}, { regionCode: GANGNAM }, { regionCode: GANGNAM })} onChange={() => {}} />);
    expect(radio("newHouseRegulatedAtAcquisition", "yes")).toBeNull();
    expect(radio("prevHouseRegulatedAtNewAcquisition", "yes")).toBeNull();
    expect(screen.getByTestId("temp-two-house-new-regulated-auto").textContent).toContain("조정대상지역 —");
    expect(screen.getByTestId("temp-two-house-prev-regulated-auto").textContent).toContain("조정대상지역 —");
  });
});

describe("UI-4 가목 전입 — 카드 요건 C", () => {
  const both = { newHouseRegulatedAtAcquisition: "yes", prevHouseRegulatedAtNewAcquisition: "yes" };
  it("전입 2021-06-01(1년 기한 말일) → 「충족 · 요건 C」 · 요건 충족", () => {
    render(<Step2 form={form({ ...both, newHouseMoveInDate: "2021-06-01" })} onChange={() => {}} />);
    expect(card()).toContain("충족 · 요건 C");
    expect(card()).toContain("1년 내 종전주택 양도");
    expect(screen.getByText("일시적 2주택 특례 요건 충족")).toBeInTheDocument();
  });
  it("전입 2021-06-02 → 「미충족 · 요건 C」 · 요건 미충족", () => {
    render(<Step2 form={form({ ...both, newHouseMoveInDate: "2021-06-02" })} onChange={() => {}} />);
    expect(card()).toContain("미충족 · 요건 C");
    expect(screen.getByText("일시적 2주택 특례 요건 미충족")).toBeInTheDocument();
  });
  it("전입일 칸에 입력하면 newHouseMoveInDate로 patch — DateInput 배선 · 미입력이면 「미입력 · 요건 C」", () => {
    const onChange = vi.fn();
    render(<Step2 form={form(both)} onChange={onChange} />);
    expect(card()).toContain("미입력 · 요건 C");
    const box = screen.getByTestId("temp-two-house-move-in-date");
    const q = (label: string) => box.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
    // DateInput은 연·월·일 세 칸이다 — 실제 사용자처럼 차례로 채운다.
    fireEvent.change(q("연도"), { target: { value: "2021" } });
    fireEvent.change(q("월"), { target: { value: "06" } });
    fireEvent.change(q("일"), { target: { value: "01" } });
    expect(onChange).toHaveBeenLastCalledWith({ newHouseMoveInDate: "2021-06-01" });
  });
  it("부정 짝 — 종전 주택이 비조정(선언 no)이면 전입 칸·요건 C가 없고 3년 기한", () => {
    render(
      <Step2 form={form({ newHouseRegulatedAtAcquisition: "yes", prevHouseRegulatedAtNewAcquisition: "no" })} onChange={() => {}} />,
    );
    expect(screen.queryByTestId("temp-two-house-move-in-date")).toBeNull();
    expect(card()).not.toContain("요건 C");
    expect(card()).toContain("3년 내 종전주택 양도");
  });
});

describe("UI-5 단서 — 기존 임차인", () => {
  it("종료일 2021-12-31 → 카드가 그 날까지의 기한을 말한다", () => {
    render(
      <Step2
        form={form({
          newHouseRegulatedAtAcquisition: "yes",
          prevHouseRegulatedAtNewAcquisition: "yes",
          newHouseMoveInDate: "2021-07-01",
          newHouseExistingTenant: true,
          newHouseTenantLeaseEndDate: "2021-12-31",
        })}
        onChange={() => {}}
      />,
    );
    expect(card()).toContain("기존 임차인의 임대차계약 종료일까지(최대 2년)");
    expect(card()).toContain("처분기한 2021-12-31");
    expect(screen.getByTestId("temp-two-house-lease-end-date")).toBeInTheDocument();
  });
  it("임차인 토글을 켜면 newHouseExistingTenant = true로 patch", () => {
    const onChange = vi.fn();
    render(
      <Step2
        form={form({ newHouseRegulatedAtAcquisition: "yes", prevHouseRegulatedAtNewAcquisition: "yes" })}
        onChange={onChange}
      />,
    );
    const toggle = screen.getByTestId("temp-two-house-existing-tenant");
    fireEvent.click(toggle.querySelector('[role="switch"]') as HTMLElement);
    expect(onChange).toHaveBeenCalledWith({ newHouseExistingTenant: true });
  });
});

describe("UI-6 ⑧ — 같은 게이트로 막는다", () => {
  const both = { newHouseRegulatedAtAcquisition: "yes", prevHouseRegulatedAtNewAcquisition: "yes" };
  const fields = (f: OneHouseJudgmentFormData, sev: "error" | "warning") =>
    validateStep2(f).filter((e) => e.severity === sev).map((e) => e.field);

  it("임차인 토글 ON · 종료일 없음 → 차단 / 종료일 입력 → 통과", () => {
    expect(fields(form({ ...both, newHouseExistingTenant: true }), "error")).toContain("newHouseTenantLeaseEndDate");
    expect(
      fields(form({ ...both, newHouseExistingTenant: true, newHouseTenantLeaseEndDate: "2021-12-31" }), "error"),
    ).not.toContain("newHouseTenantLeaseEndDate");
  });
  it("종료일이 취득일(2020-06-01) 이하 → 차단 / 다음날 → 통과", () => {
    const at = (d: string) => form({ ...both, newHouseExistingTenant: true, newHouseTenantLeaseEndDate: d });
    expect(fields(at("2020-06-01"), "error")).toContain("newHouseTenantLeaseEndDate");
    expect(fields(at("2020-06-02"), "error")).not.toContain("newHouseTenantLeaseEndDate");
  });
  it("계약일이 취득일 뒤 → 차단 / 같은 날 → 통과", () => {
    expect(fields(form({ newHouseContractDate: "2020-06-02" }), "error")).toContain("newHouseContractDate");
    expect(fields(form({ newHouseContractDate: "2020-06-01" }), "error")).not.toContain("newHouseContractDate");
  });
  it("미입력은 경고만 — 조정 여부·전입일", () => {
    const w = fields(form(), "warning");
    expect(w).toContain("newHouseRegulatedAtAcquisition");
    expect(w).toContain("newHouseMoveInDate");
    expect(fields(form(), "error")).toEqual([]);
  });
  it("부정 짝 — 칸이 없는 시기(양도 2024-06-01)면 stale 토글이 남아 있어도 막지 않는다", () => {
    const f = form({ transferDate: "2024-06-01", ...both, newHouseExistingTenant: true, newHouseContractDate: "2030-01-01" });
    expect(fields(f, "error")).toEqual([]);
    expect(fields(f, "warning")).not.toContain("newHouseMoveInDate");
  });
});
