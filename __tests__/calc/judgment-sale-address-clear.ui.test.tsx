/**
 * @vitest-environment jsdom
 *
 * anchor(⑤→④) — OH-32: ② 소재지를 「지우기」하거나 **직접 입력 주소**를 채택하면
 * 이전 주소의 `regionCode`가 남지 않아야 한다.
 *
 * 엔진은 `regionCode`가 있으면 사용자 토글을 **무시한다**
 * (`resolveWasRegulatedAtAcquisition`). 화면은 저신뢰 안내에서 「소재지를 지우면 직접 고르는
 * 토글이 나타난다」고 약속하므로, 지운 뒤에도 코드가 남으면 그 약속이 거짓이 된다.
 *
 * 🔴 **실제 `AddressSearch`를 쓴다** — 결함은 위젯이 `pnu: ""`를 보낼 때 Step3가 그것을
 *    무시하는 **호출부 배선**에 있다. 위젯을 목으로 바꾸면 위젯이 실제로 무엇을 보내는지를
 *    가정하게 된다(`feedback_library_anchor_does_not_prove_component_uses_it`).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const GANGNAM = "1168010100";

function selectedForm(): OneHouseJudgmentFormData {
  return {
    ...createInitialOneHouseJudgmentForm(),
    isOneHousehold: true,
    transferDate: "2024-06-01",
    contractTotalPrice: "1000000000",
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionDate: "2019-01-01",
        addressRoad: "서울 강남구 테헤란로 1",
        addressJibun: "서울 강남구 역삼동 1-1",
        regionCode: GANGNAM,
      },
    ],
  } as unknown as OneHouseJudgmentFormData;
}

/** 화면이 돌려준 자산 patch를 폼에 적용한다(상위 store가 하는 일). */
function apply(f: OneHouseJudgmentFormData, patch: Partial<OneHouseJudgmentFormData>) {
  return { ...f, ...patch } as OneHouseJudgmentFormData;
}

describe("OH-32 소재지 해제 → regionCode도 해제", () => {
  it("[C1-32a] 「지우기」 → regionCode가 비고, 다시 그리면 수동 토글이 나타나며 ④가 코드를 싣지 않는다", () => {
    const patches: Partial<OneHouseJudgmentFormData>[] = [];
    const f = selectedForm();
    const { rerender } = render(<Step3 form={f} onChange={(p) => patches.push(p)} />);
    // 주소가 있으니 자동 판정 카드 · 토글 없음
    expect(screen.queryByTestId("one-house-regulated-auto")).not.toBeNull();
    expect(screen.queryByTestId("one-house-was-regulated")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "지우기" }));
    const next = apply(f, patches.at(-1)!);
    expect(next.assets[0].regionCode).toBe("");

    rerender(<Step3 form={next} onChange={() => {}} />);
    expect(screen.queryByTestId("one-house-was-regulated")).not.toBeNull();
    expect(screen.queryByTestId("one-house-regulated-auto")).toBeNull();
    expect(buildOneHouseExemptionApiBody(next).regionCode).toBeUndefined();
  });

  it("[C1-32b] 검색 결과 없음 → 「입력한 주소를 그대로 사용」 → regionCode가 빈다(PNU가 없다)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    } as unknown as Response);
    const patches: Partial<OneHouseJudgmentFormData>[] = [];
    const f = selectedForm();
    render(<Step3 form={f} onChange={(p) => patches.push(p)} />);

    const input = screen.getByPlaceholderText("도로명 또는 지번 주소 입력");
    fireEvent.change(input, { target: { value: "제주 어딘가 1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(await screen.findByText(/를 그대로 사용/));

    const next = apply(f, patches.at(-1)!);
    expect(next.assets[0].addressJibun).toBe("제주 어딘가 1");
    expect(next.assets[0].regionCode).toBe("");
  });

  it("[C1-32c] 긍정 짝 — 상세주소만 고치면 regionCode는 그대로다(같은 물건)", () => {
    const patches: Partial<OneHouseJudgmentFormData>[] = [];
    const f = selectedForm();
    render(<Step3 form={f} onChange={(p) => patches.push(p)} />);
    const detail = screen.getByPlaceholderText(/상세/);
    fireEvent.change(detail, { target: { value: "101동 1001호" } });
    const next = apply(f, patches.at(-1)!);
    expect(next.assets[0].addressDetail).toBe("101동 1001호");
    expect(next.assets[0].regionCode).toBe(GANGNAM);
  });
});
