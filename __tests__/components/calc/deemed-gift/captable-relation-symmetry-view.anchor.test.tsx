/**
 * anchor #44·#53 — cap-table 특수관계 칩은 **대칭**으로 보이고 대칭으로 꺼진다.
 *
 * 「상증법」§2제10호 후단 — 「이 경우 본인도 특수관계인의 특수관계인으로 본다.」
 * 엔진은 어느 행의 표시든 같은 관계로 읽는다(`captable-relation-symmetry.anchor.test.ts`).
 * 화면도 같은 사실을 같은 모습으로 보여야 한다 — 종전 칩은 누른 행에만 켜지고 라벨은
 * 「이 주주에게 증여한 자」라는 **방향**을 말했다(수증자는 계산 결과가 나와야 정해진다).
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CapitalIncreaseAllocationFields } from "@/components/calc/deemed-gift/capital-forms";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

afterEach(cleanup);

function initial(): DeemedFormState {
  return {
    ...INITIAL_DEEMED,
    type: "capital_increase_allocation",
    ciAllocDirection: "high",
    ciAllocRows: [
      { id: "sh-1", name: "갑", preShares: "50,000", entitledShares: "50,000", subscribedShares: "80,000", reallocatedShares: "30,000", relatedTo: [], allocationMethod: "normal" },
      { id: "sh-2", name: "병", preShares: "30,000", entitledShares: "30,000", subscribedShares: "0", reallocatedShares: "", relatedTo: [], allocationMethod: "normal" },
    ],
  };
}

/** 마지막으로 store에 반영된 폼 — set 핸들러가 기록한다(렌더 중 바깥 변수 대입 금지 규칙) */
const seen: { form?: DeemedFormState } = {};
function Harness({ start }: { start: DeemedFormState }) {
  const [form, setForm] = useState(start);
  const set = (p: Partial<DeemedFormState>) => {
    seen.form = { ...form, ...p };
    setForm(seen.form);
  };
  return <CapitalIncreaseAllocationFields form={form} set={set} />;
}

const chip = (rowIdx: number, otherId: string) => screen.getByTestId(`ci-alloc-related-${rowIdx}-${otherId}`);

describe("#44·#53 cap-table 특수관계 칩 대칭", () => {
  it("[RSV-1] 증여자 행(갑)에서 한 번 누르면 **두 행 모두** 켜진 모습", () => {
    render(<Harness start={initial()} />);
    expect(chip(0, "sh-2")).toHaveAttribute("aria-pressed", "false");
    expect(chip(1, "sh-1")).toHaveAttribute("aria-pressed", "false"); // 누르기 전 — 짝
    fireEvent.click(chip(0, "sh-2"));
    expect(chip(0, "sh-2")).toHaveAttribute("aria-pressed", "true");
    expect(chip(1, "sh-1")).toHaveAttribute("aria-pressed", "true");
  });

  it("[RSV-2] 반대 행(병)에서 끄면 두 행 모두 꺼지고 store의 **양쪽** relatedTo에서 제거된다", () => {
    const start = initial();
    start.ciAllocRows = start.ciAllocRows.map((r) => ({ ...r, relatedTo: r.id === "sh-1" ? ["sh-2"] : ["sh-1"] }));
    render(<Harness start={start} />);
    fireEvent.click(chip(1, "sh-1"));
    expect(chip(0, "sh-2")).toHaveAttribute("aria-pressed", "false");
    expect(chip(1, "sh-1")).toHaveAttribute("aria-pressed", "false");
    expect(seen.form!.ciAllocRows.map((r) => r.relatedTo)).toEqual([[], []]);
  });

  it("[RSV-2b] 한쪽 행에만 저장된 종전 기록도 반대 행에서 끌 수 있다", () => {
    const start = initial();
    start.ciAllocRows = start.ciAllocRows.map((r) => ({ ...r, relatedTo: r.id === "sh-1" ? ["sh-2"] : [] }));
    render(<Harness start={start} />);
    expect(chip(1, "sh-1")).toHaveAttribute("aria-pressed", "true"); // 병 행에는 저장이 없지만 켜져 보인다
    fireEvent.click(chip(1, "sh-1"));
    expect(seen.form!.ciAllocRows.map((r) => r.relatedTo)).toEqual([[], []]);
  });

  it("[RSV-3] 라벨은 방향(「증여한 자」)을 말하지 않고 §2제10호 후단 대칭을 안내한다", () => {
    render(<Harness start={initial()} />);
    expect(screen.queryAllByText(/이 주주에게 증여한 자/)).toHaveLength(0);
    expect(screen.getAllByText(/§2제10호 후단/).length).toBeGreaterThan(0);
  });
});
