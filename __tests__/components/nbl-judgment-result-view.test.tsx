/**
 * anchor U-7 — 비사업용 토지 판정 결과 뷰 (계획서 `nbl-judgment-menu.ui.plan.md` §6 · 「사용자 결정 2차」)
 * 판정 3갈래 · JSON 왕복(Date→문자열) · judgmentOnly(세율 단정 없음) · 입력 반영 현황 · 이월과세 A·B 나란히(적용 쪽을 단정하지 않는다) · 넘기기 카드.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NblJudgmentResultView } from "@/components/calc/results/NblJudgmentResultView";
import { createInitialNblJudgmentForm } from "@/lib/stores/nbl-judgment-form.types";
import type { NonBusinessLandJudgmentResponse } from "@/app/api/calc/non-business-land-judgment/route";
import type { NblInputEffects } from "@/lib/tax-engine/non-business-land-menu-effects";
import { CARD_CASES, jsonRound, judgeFromAsset } from "./_helpers/nbl-judgment-fixtures";

afterEach(cleanup);

const NO_EFFECT: NblInputEffects = { gracePeriods: "not_declared", deemedTransfer: "not_declared", urbanIncorporation: "not_declared" };
const j = (name: keyof typeof CARD_CASES) => jsonRound(judgeFromAsset(CARD_CASES[name].over, CARD_CASES[name].transferDate));
const res = (judgment: ReturnType<typeof j>, extra: Partial<NonBusinessLandJudgmentResponse> = {}): NonBusinessLandJudgmentResponse => ({ judgment, inputEffects: NO_EFFECT, ...extra });
const FORM = (() => {
  const f = createInitialNblJudgmentForm();
  return { ...f, transferDate: "2024-06-01", assets: [{ ...f.assets[0], addressJibun: "서울 강남구 테스트동 1", acquisitionDate: "2021-01-01", acquisitionArea: "1000", nblLandType: "other_land" as const }] };
})();
const FORBIDDEN = ["+10%p", "중과", "일반세율", "기본세율"] as const;
/** 화면 텍스트에서 한정 안내 줄(세율은 계산기에서 정해진다는 문장 — 「중과 유예·배제」를 **말하는** 것이지 단정이 아니다)을 뺀 것. */
function assertedText(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-testid="nbl-judgment-qualifier-note"]').forEach((n) => n.remove());
  return clone.textContent ?? "";
}

describe("[RV-1] 결론 머리 — 판정 3갈래 + 의제", () => {
  it.each([
    ["사업용", "businessFarmSelf"],
    ["비사업용", "nonBusinessVacant"],
    ["일부 비사업용", "housingArea"],
    ["사업용", "unconditionalExempt"],
  ] as const)("%s ← %s", (label, name) => {
    render(<NblJudgmentResultView result={res(j(name))} form={FORM} />);
    expect(screen.getByTestId("nbl-judgment-verdict").textContent).toContain(label);
  });

  it("일부 비사업용 — 면적 안분 비율을 머리에 적는다", () => {
    render(<NblJudgmentResultView result={res(j("housingArea"))} form={FORM} />);
    expect(screen.getByTestId("nbl-judgment-verdict").textContent).toContain("50.0%");
  });

  it("🔴 판정 결과 화면 어디에도 세율을 단정하는 문구가 없다(단일 판정 · 이월과세 A·B 모두)", () => {
    for (const name of Object.keys(CARD_CASES) as (keyof typeof CARD_CASES)[]) {
      const { container, unmount } = render(<NblJudgmentResultView result={res(j(name))} form={FORM} onCalculateTax={() => {}} />);
      for (const f of FORBIDDEN) expect(assertedText(container), `${name}: ${f}`).not.toContain(f);
      unmount();
    }
    const pair = res(j("nonBusinessVacant"), { judgmentIfCarryoverExcluded: j("businessFarmSelf") });
    const { container } = render(<NblJudgmentResultView result={pair} form={FORM} />);
    for (const f of FORBIDDEN) expect(assertedText(container), `A·B: ${f}`).not.toContain(f);
    // 대조군 — 한정 안내 줄은 실제로 그 문구를 갖고 있다(마스킹이 아무것도 가리지 않는 것이 아니다)
    expect(container.textContent).toContain("중과 유예·배제");
  });

  it("세율 한정 안내 · 면책 고지가 있다", () => {
    render(<NblJudgmentResultView result={res(j("nonBusinessVacant"))} form={FORM} />);
    expect(screen.getByTestId("nbl-judgment-qualifier-note").textContent).toContain("세율·장기보유특별공제·중과 유예·배제는 양도소득세 계산기에서 정해집니다");
    expect(document.body.textContent).toContain("면책 고지");
  });
});

describe("[RV-2] 입력 반영 현황 — inputEffects를 그대로 읽는다", () => {
  it("0건이면 카드가 없다", () => {
    render(<NblJudgmentResultView result={res(j("nonBusinessVacant"))} form={FORM} />);
    expect(screen.queryByTestId("nbl-judgment-input-effects")).toBeNull();
  });

  it("ignored_by_category · overridden_by_unconditional 문구", () => {
    render(
      <NblJudgmentResultView
        result={res(j("nonBusinessVacant"), { inputEffects: { gracePeriods: "ignored_by_category", deemedTransfer: "overridden_by_unconditional", urbanIncorporation: "applied" } })}
        form={FORM}
      />,
    );
    const t = screen.getByTestId("nbl-judgment-input-effects").textContent ?? "";
    expect(t).toContain("부득이한 사유는 입력했지만 이 지목의 판정에서는 읽지 않아 반영되지 않았습니다 — 확인 필요");
    expect(t).toContain("양도일 의제는 입력했지만 무조건 사업용 의제가 성립해 판정에 쓰이지 않았습니다");
    expect(t).not.toContain("도시편입일");
  });
});

describe("[RV-3] 이월과세 — A·B를 나란히, 적용 쪽을 단정하지 않는다", () => {
  const pair = (a: keyof typeof CARD_CASES, b: keyof typeof CARD_CASES) =>
    res(j(a), { judgmentIfCarryoverExcluded: j(b), inputEffectsIfCarryoverExcluded: { ...NO_EFFECT, gracePeriods: "ignored_by_category" } });

  it("두 카드 + 각자 결론 + 고지(세액 비교는 계산기)", () => {
    render(<NblJudgmentResultView result={pair("nonBusinessVacant", "businessFarmSelf")} form={FORM} />);
    expect(screen.getByTestId("nbl-judgment-card-a")).toBeTruthy();
    expect(screen.getByTestId("nbl-judgment-card-b")).toBeTruthy();
    expect(screen.getByTestId("nbl-judgment-verdict-a").textContent).toContain("비사업용");
    expect(screen.getByTestId("nbl-judgment-verdict-b").textContent).toContain("사업용");
    expect(screen.getByTestId("nbl-judgment-carryover-notice").textContent).toContain("양도소득세 계산기에서 세액 비교로 정해집니다");
    // B 쪽의 입력 반영 현황은 B의 effects를 읽는다(A에는 없다)
    expect(screen.getByTestId("nbl-judgment-input-effects-b").textContent).toContain("부득이한 사유");
    expect(screen.queryByTestId("nbl-judgment-input-effects-a")).toBeNull();
  });

  it("결론이 다르면 머리는 어느 쪽도 고르지 않는다 · 같으면 그 결론", () => {
    const { unmount } = render(<NblJudgmentResultView result={pair("nonBusinessVacant", "businessFarmSelf")} form={FORM} />);
    expect(screen.getByTestId("nbl-judgment-verdict").textContent).toContain("이월과세 적용 여부에 따라 다름");
    unmount();
    render(<NblJudgmentResultView result={pair("nonBusinessVacant", "nonBusinessVacant")} form={FORM} />);
    expect(screen.getByTestId("nbl-judgment-verdict").textContent).toContain("비사업용");
    expect(screen.getByTestId("nbl-judgment-verdict").textContent).not.toContain("다름");
  });

  it("B가 없으면(이월과세 아님) 나란히 보기가 없다", () => {
    render(<NblJudgmentResultView result={res(j("nonBusinessVacant"))} form={FORM} />);
    expect(screen.queryByTestId("nbl-judgment-carryover-pair")).toBeNull();
  });
});

describe("[RV-4] 계산기 넘기기 카드", () => {
  it("onCalculateTax가 없으면 카드를 그리지 않는다", () => {
    render(<NblJudgmentResultView result={res(j("nonBusinessVacant"))} form={FORM} />);
    expect(screen.queryByTestId("nbl-judgment-to-calculator")).toBeNull();
  });

  it("CTA 클릭 → onCalculateTax · 남은 입력 목록 · 지분<100%·자경 편입 안내는 해당할 때만", () => {
    const onCalc = vi.fn();
    const { unmount } = render(<NblJudgmentResultView result={res(j("nonBusinessVacant"))} form={FORM} onCalculateTax={onCalc} remainingInputs={["총 양도가액", "취득가액"]} />);
    expect(screen.getByTestId("nbl-judgment-to-calculator-remaining").textContent).toContain("총 양도가액 · 취득가액");
    expect(screen.queryByTestId("nbl-judgment-to-calculator-share-note")).toBeNull();
    expect(screen.queryByTestId("nbl-judgment-to-calculator-self-farming-note")).toBeNull();
    fireEvent.click(screen.getByTestId("nbl-judgment-to-calculator"));
    expect(onCalc).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("nbl-judgment-to-calculator").textContent).toBe("양도세 계산하기");
    unmount();

    const f2 = { ...FORM, assets: [{ ...FORM.assets[0], nblLandType: "farmland" as const, ownershipNumerator: "50", ownershipDenominator: "100" }] };
    render(<NblJudgmentResultView result={res(j("nonBusinessVacant"))} form={f2} onCalculateTax={onCalc} />);
    expect(screen.getByTestId("nbl-judgment-to-calculator-share-note")).toBeTruthy();
    expect(screen.getByTestId("nbl-judgment-to-calculator-self-farming-note")).toBeTruthy();
  });
});

describe("[RV-5] 전제 요약 칩", () => {
  it("소재지·양도일·면적이 칩으로 보인다 — 부득이한 사유 같은 입력 상세는 아니다", () => {
    render(<NblJudgmentResultView result={res(j("nonBusinessVacant"))} form={FORM} />);
    const t = screen.getByTestId("nbl-judgment-premise").textContent ?? "";
    expect(t).toContain("서울 강남구 테스트동 1");
    expect(t).toContain("2024.06.01");
    expect(t).toContain("1,000 ㎡");
    expect(t).not.toContain("부득이한 사유");
  });
});
