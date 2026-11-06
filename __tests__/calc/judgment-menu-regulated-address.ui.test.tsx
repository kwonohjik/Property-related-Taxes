/**
 * @vitest-environment jsdom
 *
 * ⑤ — 판정 메뉴 2-C: 법정동코드 없이 주소 문자열만 있을 때 토글이 주소 판정값·근거를 보이고, 직접 고르면 표지를 세운다.
 * 계획서: `docs/00-pm/judgment-menu-regulated-area-address.plan.md` §3 (Q-2·Q-3 a). ④ 값은 `judgment-menu-regulated-address.anchor.test.ts`.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { MultiHouseSurchargeSidebar } from "@/components/calc/multi-house-surcharge/MultiHouseSurchargeSidebar";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

const GANGNAM = "서울특별시 강남구 역삼동 1";
const NAMYANGJU_HWADO = "경기도 남양주시 화도읍 1";

function form(addr: string, over: Partial<OneHouseJudgmentFormData> = {}, kind = "housing", acq = "2018-06-01"): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2026-06-01",
    contractTotalPrice: "1000000000",
    assets: [{ ...makeDefaultAsset(1), assetKind: kind, acquisitionDate: acq, addressJibun: addr }],
    ...over,
  } as OneHouseJudgmentFormData;
}

const sw = (testId: string) => within(screen.getByTestId(testId)).getByRole("switch");
const isOn = (testId: string) => sw(testId).getAttribute("aria-checked") === "true";

describe("판정 메뉴 2-C — 주소 문자열 판정", () => {
  it("[L-1] 강남 문자열 · 안 만짐 → 두 토글이 켜져 있고 근거를 보인다 · ④ 본문과 같은 값", () => {
    const f = form(GANGNAM);
    render(<Step3 form={f} onChange={() => {}} />);
    expect(isOn("one-house-was-regulated")).toBe(true);
    expect(isOn("one-house-is-regulated")).toBe(true);
    expect(screen.getByTestId("one-house-was-regulated").textContent).toContain("주소로 판정 — ");
    expect(screen.queryByTestId("one-house-was-regulated-address-uncertain")).toBeNull();
    const body = buildOneHouseExemptionApiBody(f);
    expect([body.isRegulatedArea, body.wasRegulatedAtAcquisition]).toEqual([true, true]);
  });

  it("[L-2] 토글을 누르면 값과 「직접 만짐」 표지를 함께 쓴다", () => {
    const onChange = vi.fn();
    render(<Step3 form={form(GANGNAM)} onChange={onChange} />);
    fireEvent.click(sw("one-house-was-regulated"));
    expect(onChange).toHaveBeenCalledWith({ wasRegulatedAtAcquisition: false, wasRegulatedAtAcquisitionTouched: true });
    fireEvent.click(sw("one-house-is-regulated"));
    expect(onChange).toHaveBeenCalledWith({ isRegulatedArea: false, isRegulatedAreaTouched: true });
  });

  it("[L-3] 직접 만진 축은 저장값 · 근거 문구 없음", () => {
    render(<Step3 form={form(GANGNAM, { wasRegulatedAtAcquisition: false, wasRegulatedAtAcquisitionTouched: true })} onChange={() => {}} />);
    expect(isOn("one-house-was-regulated")).toBe(false);
    expect(screen.getByTestId("one-house-was-regulated").textContent).not.toContain("주소로 판정");
    expect(isOn("one-house-is-regulated")).toBe(true);
  });

  it("[L-4] 신뢰도가 높지 않은 판정(남양주 화도읍 · medium) → 주황 안내", () => {
    render(<Step3 form={form(NAMYANGJU_HWADO, {}, "housing", "2020-12-01")} onChange={() => {}} />);
    expect(isOn("one-house-was-regulated")).toBe(true);
    expect(screen.getByTestId("one-house-was-regulated-address-uncertain")).toBeTruthy();
  });

  it("[L-5] 주소 없음 → 토글 · 기본 아니오 · 근거 문구 없음(D-6 그대로)", () => {
    render(<Step3 form={form("")} onChange={() => {}} />);
    expect(isOn("one-house-was-regulated")).toBe(false);
    expect(screen.getByTestId("one-house-was-regulated").textContent).not.toContain("주소로 판정");
  });

  it("[L-6] 입주권 양도 + 강남 문자열 → 토글 없이 읽기 전용 판정(Q-3 a)", () => {
    render(<Step3 form={form(GANGNAM, {}, "right_to_move_in")} onChange={() => {}} />);
    expect(screen.queryByTestId("one-house-was-regulated")).toBeNull();
    expect(screen.queryByTestId("one-house-is-regulated")).toBeNull();
    expect(screen.getByTestId("one-house-regulated-auto").textContent).toContain("해당");
    expect(screen.getByTestId("one-house-transfer-regulated-auto").textContent).toContain("해당");
  });

  it("[L-7] 다주택 중과 메뉴 사이드바 — 주소 판정이면 「(주소 판정)」, 직접 고르면 「(직접 선택)」", () => {
    const { unmount } = render(<MultiHouseSurchargeSidebar form={form(GANGNAM)} currentStep={1} onStepClick={() => {}} result={null} />);
    expect(document.body.textContent).toContain("예 (주소 판정)");
    unmount();
    render(
      <MultiHouseSurchargeSidebar
        form={form(GANGNAM, { isRegulatedArea: false, isRegulatedAreaTouched: true })}
        currentStep={1}
        onStepClick={() => {}}
        result={null}
      />,
    );
    expect(document.body.textContent).toContain("아니오 (직접 선택)");
  });
});
