/**
 * 상속·증여 UI 리뷰 G3 — 공용 입력 위젯 축 anchor.
 *
 * IG-094(IntegerInput 센티널)·IG-051/IG-120(`|| undefined`가 0을 삼킴)·IG-050(display
 * fallback ↔ store 불일치)·IG-103(새 동시증여 건의 기본 증여자).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { ListedStockBesshiAttributesSection } from "@/components/calc/inheritance/listed-stock/ListedStockBesshiAttributesSection";
import { GiftCreditChecklist } from "@/components/calc/gift/GiftCreditChecklist";
import { INITIAL_FORM as GIFT_INITIAL_FORM } from "@/components/calc/gift-tax-form-shared";
import type { FormState as GiftFormState } from "@/components/calc/gift-tax-form-shared";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(cleanup);

// ════════════════════════════════════════════════════
// IG-094 — IntegerInput은 빈칸을 undefined로 올릴 수 있다
// ════════════════════════════════════════════════════

describe("[G3-P] IG-094 — 센티널 가드가 실제로 작동한다", () => {
  it("P-1: 🔴 allowEmpty면 빈 입력이 undefined로 올라간다 (종전엔 0)", () => {
    const onChange = vi.fn();
    render(<IntegerInput ariaLabel="주식수" value={1000} onChange={onChange} allowEmpty />);
    fireEvent.change(screen.getByLabelText("주식수"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("P-2: 🔴 allowEmpty면 0이 빈칸이 아니라 「0」으로 보인다 (진짜 0과 미입력을 구분)", () => {
    render(<IntegerInput ariaLabel="주식수" value={0} onChange={vi.fn()} allowEmpty />);
    expect((screen.getByLabelText("주식수") as HTMLInputElement).value).toBe("0");
  });

  it("P-3: 양성 쌍둥이 — 기본 모드는 종전 그대로다 (0 → 빈칸 표시, 지우면 0을 올린다)", () => {
    const onChange = vi.fn();
    render(<IntegerInput ariaLabel="기본0" value={0} onChange={onChange} />);
    // 기본 모드는 0을 빈칸으로 그린다 (종전 동작 유지 — 회귀 0)
    expect((screen.getByLabelText("기본0") as HTMLInputElement).value).toBe("");
    cleanup();

    render(<IntegerInput ariaLabel="기본5" value={5} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("기본5"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("P-4: 양성 쌍둥이 — 숫자 입력은 그대로 올라간다", () => {
    const onChange = vi.fn();
    render(<IntegerInput ariaLabel="수량" value={undefined} onChange={onChange} allowEmpty />);
    fireEvent.change(screen.getByLabelText("수량"), { target: { value: "1,234" } });
    expect(onChange).toHaveBeenLastCalledWith(1234);
  });
});

// ════════════════════════════════════════════════════
// IG-051 · IG-050 — 상장주식 별지 속성
// ════════════════════════════════════════════════════

describe("[G3-Q] IG-051·IG-050 — 0 저장과 기본값 명시", () => {
  const item = (patch: Record<string, unknown> = {}): EstateItem =>
    ({
      id: "s1",
      category: "listed_stock",
      name: "상장주식",
      // ⑪ 직전기 배당률 칸은 §63②3호 라디오가 「증자 신주(미상장)」일 때만 열린다.
      unlistedShareMode: "capital_increase",
      isCapitalIncreaseUnlistedShare: true,
      ...patch,
    }) as unknown as EstateItem;

  function renderSection(patch: Record<string, unknown> = {}) {
    const onUpdate = vi.fn();
    render(<ListedStockBesshiAttributesSection item={item(patch)} onUpdate={onUpdate} />);
    return onUpdate;
  }

  /** FieldCard 라벨은 htmlFor 연결이 아니라 형제 텍스트다 — 컨테이너를 타고 input을 찾는다. */
  const priorDividendInput = () => {
    const label = screen.getByText(/직전기 배당률/);
    const input =
      label.parentElement?.querySelector("input") ??
      label.closest("div")?.querySelector("input") ??
      label.parentElement?.parentElement?.querySelector("input");
    expect(input).toBeTruthy();
    return input as HTMLInputElement;
  };

  it("Q-1: 🔴 IG-051 — 직전기 배당률 0이 0으로 저장된다 (⑧은 「0 허용」이라 안내했다)", () => {
    const onUpdate = renderSection();
    fireEvent.change(priorDividendInput(), { target: { value: "0" } });
    expect(onUpdate.mock.calls.at(-1)?.[0].priorDividendRate).toBe(0);
  });

  it("Q-2: 양성 쌍둥이 — 빈 문자열은 undefined다 (미입력과 0을 구분한다)", () => {
    const onUpdate = renderSection({ priorDividendRate: 0.05 });
    fireEvent.change(priorDividendInput(), { target: { value: "" } });
    expect(onUpdate.mock.calls.at(-1)?.[0].priorDividendRate).toBeUndefined();
  });

  it("Q-3: 🔴 IG-050 — §63③ 토글 ON이 companySize를 «명시 저장»한다", () => {
    const onUpdate = renderSection();
    const sw = screen
      .getAllByRole("switch")
      .find((el) =>
        /최대주주/.test((el.closest("label") ?? el.parentElement)?.textContent ?? ""),
      );
    expect(sw).toBeTruthy();
    fireEvent.click(sw!);
    const patch = onUpdate.mock.calls.at(-1)?.[0];
    expect(patch.isMaxShareholder).toBe(true);
    // 종전엔 여기가 undefined라 화면은 「중소기업」으로 보이는데 ⑧이 영구 차단했다.
    expect(patch.companySize).toBe("small");
  });

  it("Q-4: 양성 쌍둥이 — 이미 고른 규모는 덮어쓰지 않는다", () => {
    const onUpdate = renderSection({ companySize: "large" });
    const sw = screen
      .getAllByRole("switch")
      .find((el) =>
        /최대주주/.test((el.closest("label") ?? el.parentElement)?.textContent ?? ""),
      );
    fireEvent.click(sw!);
    const patch = onUpdate.mock.calls.at(-1)?.[0];
    // OFF → ON 이면 명시 저장, ON → OFF 이면 정리 — 어느 쪽이든 "small"로 덮지 않는다
    expect(patch.companySize === "large" || patch.companySize === undefined).toBe(true);
  });
});

// ════════════════════════════════════════════════════
// IG-103 — 새 동시증여 건은 «관계 미선택»으로 태어난다
// ════════════════════════════════════════════════════

describe("[G3-R] IG-103 — 추가 버튼이 즉시 동일인 그룹 경고를 만들지 않는다", () => {
  it("R-1: 🔴 새 건의 donor가 undefined다 (종전엔 INITIAL_FORM의 「father」)", () => {
    const set = vi.fn();
    render(
      <GiftCreditChecklist
        form={{ ...GIFT_INITIAL_FORM, simultaneousGiftForms: [] } as GiftFormState}
        set={set}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "+ 동시증여 추가" }));
    const forms = set.mock.calls.at(-1)?.[0].simultaneousGiftForms;
    expect(forms).toHaveLength(1);
    expect(forms[0].donor).toBeUndefined();
  });

  it("R-2: 양성 쌍둥이 — 주 건의 증여일은 그대로 물려받는다 (Zod 날짜 검증 통과용)", () => {
    const set = vi.fn();
    render(
      <GiftCreditChecklist
        form={
          {
            ...GIFT_INITIAL_FORM,
            giftDate: "2026-03-01",
            simultaneousGiftForms: [],
          } as GiftFormState
        }
        set={set}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "+ 동시증여 추가" }));
    expect(set.mock.calls.at(-1)?.[0].simultaneousGiftForms[0].giftDate).toBe("2026-03-01");
  });
});
