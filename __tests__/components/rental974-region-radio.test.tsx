/**
 * @vitest-environment jsdom
 *
 * anchor: §97의4 소재지(region) ⑤ 입력 경로 — UI 리뷰 高.
 *
 * 기준시가 한도는 소재지가 가른다(소령 §167의3①2호 가목 괄호 — 수도권 밖 3억원):
 *   `rental-97-4.ts:125`  isPurchase && input.region === "non_capital" ? 3억 : 6억
 *
 * 그런데 폼에 라디오가 없어 값이 기본값 `"capital"`에 굳어 있었고, 같은 파일의 한도
 * 안내문만 그 값을 **읽고** 있었다 — 고를 수 없는 값을 인용하느라 「3억원(가목 — 수도권
 * 밖)」 문구가 영원히 나오지 않았다. 결과적으로 수도권 밖 3~6억 주택이 한도 초과인데도
 * 감면을 받았다(세액 과소). 형제 §97의3·§97의5 폼에는 같은 라디오가 이미 있었다.
 *
 * ①타입 ②기본값 ③migrate ④API ⑫Zod는 전부 이미 있었다 — 막힌 것은 ⑤ 하나다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Rental974InputForm } from "@/components/calc/transfer/rental/Rental974InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import type { RentalReductionFormVariant } from "@/lib/stores/calc-wizard-asset-reduction";

afterEach(cleanup);

type Rental974Form = Extract<RentalReductionFormVariant, { type: "rental_97_4" }>;

function value(over: Partial<Rental974Form> = {}): Rental974Form {
  return { ...(getReductionDefault("rental_97_4") as Rental974Form), ...over };
}

function radio(v: "capital" | "non_capital"): HTMLInputElement {
  const el = document.querySelector(`input[name="region_974"][value="${v}"]`);
  if (!el) throw new Error(`소재지 라디오(${v})가 렌더되지 않았다`);
  return el as HTMLInputElement;
}

describe("§97의4 소재지 라디오", () => {
  it("🔑 G-1: 소재지 라디오가 렌더된다 (종전에는 입력 경로 자체가 없었다)", () => {
    render(<Rental974InputForm value={value()} onChange={() => {}} />);
    expect(radio("capital").checked).toBe(true); // 기본값
    expect(radio("non_capital").checked).toBe(false);
  });

  it("🔑 G-2: 비수도권을 고르면 region이 폼에 기록된다 (①까지 배선)", () => {
    const onChange = vi.fn();
    render(<Rental974InputForm value={value()} onChange={onChange} />);
    fireEvent.click(radio("non_capital"));
    expect(onChange).toHaveBeenCalledWith({ region: "non_capital" });
  });

  it("G-3: 가목 + 비수도권 → 한도 안내가 3억원으로 바뀐다", () => {
    render(
      <Rental974InputForm
        value={value({ rental974Category: "purchase_a", region: "non_capital" })}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/3억원 \(가목 — 수도권 밖\)/)).toBeTruthy();
  });

  it("G-4: 가목 + 수도권 → 6억원", () => {
    render(
      <Rental974InputForm
        value={value({ rental974Category: "purchase_a", region: "capital" })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(/3억원 \(가목 — 수도권 밖\)/)).toBeNull();
  });

  it("G-5: 다목은 소재지와 무관하게 6억원 (가목만 3억 분기가 있다)", () => {
    render(
      <Rental974InputForm
        value={value({ rental974Category: "construction_c", region: "non_capital" })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(/3억원 \(가목 — 수도권 밖\)/)).toBeNull();
  });
});
