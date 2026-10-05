/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — ① 주택 수 스칼라는 **명부를 따라간다** (Q-8 후속 · 2026-09-22)
 *
 * ## 왜 별도 파일인가 — 술어 anchor 는 배선을 증명하지 않는다
 *
 * `household-house-count.anchor.test.ts` HC-8·HC-9 는 두 술어를 **직접** 부른다.
 * 술어가 옳아도 컴포넌트가 부르지 않으면 화면은 종전 그대로다 —
 * memory `feedback_library_anchor_does_not_prove_component_uses_it` ·
 * `feedback_fixed_layer_vs_consumed_layer`. 여기서는 **실제 컴포넌트를 렌더**해
 * (a) 명부 편집이 올리는 patch 와 (b) 버튼의 `disabled` 를 본다.
 *
 * ## 고정하는 것
 *
 * | # | 주장 |
 * |---|---|
 * | SL-1 | 「+ 주택 추가」가 올리는 patch 는 `houses` 만 담는다 — 새 행엔 취득일이 없다 |
 * | SL-2 | 행에 취득일을 넣는 patch 는 `householdHousingCount` 를 **함께** 올린다 |
 * | SL-3 | 행 삭제도 같은 경로 — **남는 행이 있어야** 구별력이 있다 |
 * | SL-4 | 분양권 양도(F1, 범위 밖)에서는 스칼라를 갱신하지 않는다 ·
 *        PR-C(2026-10-05)로 입주권은 범위 안 — 오프셋 0으로 갱신한다(SL-4b) |
 * | SL-5~8 | **2026-10-05 명부 필수화(PR-1)로 폐기** — `"housing"`은 버튼 위젯 자체가 사라졌다
 *          (읽기 전용 표시 + 「다른 보유 주택이 없습니다」 확정으로 대체). 잠금 메커니즘은
 *          애초에 `"housing"`에서만 의미가 있었으므로(다른 housing-like 3종은 항상 unlocked)
 *          그 kind가 버튼을 잃으면 전체가 무의미해진다. 아래 「SL Step4 ① 표시」로 교체 |
 *
 * ## ⚠️ 시료는 스칼라와 명부를 **어긋나게** 둔다
 *
 * 둘이 같은 시료만 쓰면 배선을 끊어도 초록이다
 * (memory `feedback_mutation_zero_discrimination_is_not_proof`).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HousesListSection } from "@/app/calc/transfer-tax/steps/step4-sections/HousesListSection";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

// `HouseEntry.acquisitionDate` 는 non-optional string — 미입력은 `""`(세어지지 않는다).
const house = (id: string, acquisitionDate = "") => ({
  id,
  region: "capital" as const,
  acquisitionDate,
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
});

function baseForm(over: Partial<TransferFormData> = {}): TransferFormData {
  const form = createDefaultTransferFormData();
  form.isOneHousehold = true;
  form.transferDate = "2024-06-01";
  const primary = makeDefaultAsset(1);
  primary.assetKind = "housing";
  primary.acquisitionDate = "2015-03-01";
  form.assets = [primary];
  return { ...form, ...over } as TransferFormData;
}

// ────────────────────────────────────────────────────────────
// ⑤ 명부 편집 → patch
// ────────────────────────────────────────────────────────────
describe("SL 명부 편집이 스칼라를 함께 올린다", () => {
  function renderList(form: TransferFormData) {
    const onChange = vi.fn();
    render(<HousesListSection form={form} onChange={onChange} />);
    return onChange;
  }

  it("[SL-1] 주택 추가 — 새 행엔 취득일이 없어 아직 갱신하지 않는다", () => {
    const onChange = renderList(baseForm({ householdHousingCount: "1", houses: [] }));
    fireEvent.click(screen.getByText("+ 주택 추가"));
    const patch = onChange.mock.calls.at(-1)![0];
    expect(patch.houses).toHaveLength(1);
    expect(patch.householdHousingCount).toBeUndefined();
  });

  it("[SL-2] 취득일 있는 행 1개 상태에서 또 추가·삭제하면 파생값이 따라온다", () => {
    // 이미 1행(취득일 있음) → 파생 2. 여기서 행을 지우면 0행 → 갱신 없음(SL-3).
    const onChange = renderList(
      baseForm({ householdHousingCount: "1", houses: [house("h1", "2018-01-01")] }),
    );
    fireEvent.click(screen.getByText("+ 주택 추가"));
    const patch = onChange.mock.calls.at(-1)![0];
    // 기존 1행(취득일 O) + 새 행(취득일 X) ⇒ 세어지는 행은 여전히 1 ⇒ 파생 2
    expect(patch.householdHousingCount).toBe("2");
  });

  /**
   * 🔴 삭제 시료는 **남는 행이 있어야** 구별력이 있다.
   *
   * 처음엔 「1행 → 삭제 → 0행 → 갱신 없음」으로 적었는데, 그건 **배선을 끊어도 같은 결과**라
   * 뮤테이션이 살아남았다(실측: 삭제 경로 배선 해제 → 36건 전건 통과).
   * memory `feedback_mutation_zero_discrimination_is_not_proof`.
   */
  function removeFirstHouse() {
    const btn = screen.getAllByRole("button").find((b) => /삭제|제거/.test(b.textContent ?? ""));
    expect(btn, "삭제 버튼을 찾지 못했다 — 셀렉터가 낡았다").toBeTruthy();
    fireEvent.click(btn!);
  }

  it("[SL-3] 행 삭제도 같은 경로 — 3행에서 1개 지우면 스칼라가 '3'으로 따라 내려간다", () => {
    const onChange = renderList(
      baseForm({
        householdHousingCount: "4",
        houses: [house("h1", "2018-01-01"), house("h2", "2019-01-01"), house("h3", "2020-01-01")],
      }),
    );
    removeFirstHouse();
    const patch = onChange.mock.calls.at(-1)![0];
    expect(patch.houses).toHaveLength(2);
    expect(patch.householdHousingCount).toBe("3");
  });

  it("[SL-3b] 마지막 행을 지워 0행이 되면 갱신하지 않는다 (D-4 복귀)", () => {
    const onChange = renderList(
      baseForm({ householdHousingCount: "2", houses: [house("h1", "2018-01-01")] }),
    );
    removeFirstHouse();
    const patch = onChange.mock.calls.at(-1)![0];
    expect(patch.houses).toHaveLength(0);
    expect(patch.householdHousingCount).toBeUndefined();
  });

  it("[SL-4] 🔴 분양권 양도(F1, 범위 밖)에서는 스칼라를 갱신하지 않는다", () => {
    const form = baseForm({ householdHousingCount: "1", houses: [house("h1", "2018-01-01")] });
    form.assets[0].assetKind = "presale_right";
    const onChange = renderList(form);
    fireEvent.click(screen.getByText("+ 주택 추가"));
    expect(onChange.mock.calls.at(-1)![0].householdHousingCount).toBeUndefined();
  });

  it("[SL-4b] 🔴 PR-C — 입주권 양도는 housing과 같이 갱신한다(오프셋 0: 1행 → '1')", () => {
    const form = baseForm({ householdHousingCount: "1", houses: [house("h1", "2018-01-01")] });
    form.assets[0].assetKind = "right_to_move_in";
    const onChange = renderList(form);
    fireEvent.click(screen.getByText("+ 주택 추가"));
    // 기존 1행(취득일 O, 세어짐 1) + 새 빈 행(취득일 X, 안 세어짐) ⇒ 0 + 1 = "1"
    expect(onChange.mock.calls.at(-1)![0].householdHousingCount).toBe("1");
  });
});

// ────────────────────────────────────────────────────────────
// ⑤ Step4 버튼 잠금
// ────────────────────────────────────────────────────────────
describe("SL Step4 ① 표시 — 명부 필수화(PR-1, 2026-10-05) 이후", () => {
  /**
   * | # | 주장 |
   * |---|---|
   * | SL-R1 | `"housing"`은 버튼 위젯 자체가 없다 — `household-house-count-buttons` 미존재 |
   * | SL-R2 | 명부 0행 + 미확정 → 「다른 보유 주택이 없습니다」 토글이 보이고 OFF |
   * | SL-R3 | 명부 2행 → 토글이 사라지고 읽기 전용 표시가 "3채"(도출값, 선언 스칼라 무시) |
   * | SL-R4 | 토글을 켜면 확정 + 스칼라를 "1"로 함께 맞춘다(패치 1건) |
   * | SL-R5 | 분양권(F1)은 그대로 「1/2/3+」 버튼을 쓴다 — Q-11 범위 밖 회귀 없음 |
   */
  it("[SL-R1] housing에는 버튼 위젯이 없다", () => {
    render(<Step4 form={baseForm({ houses: [] })} onChange={() => {}} />);
    expect(screen.queryByTestId("household-house-count-buttons")).toBeNull();
  });

  it("[SL-R2] 명부 0행 + 미확정 → 확정 토글이 보이고 OFF", () => {
    render(<Step4 form={baseForm({ houses: [], householdNoOtherHousesConfirmed: false })} onChange={() => {}} />);
    const toggle = screen.getByText("다른 보유 주택이 없습니다");
    expect(toggle).toBeTruthy();
  });

  it("[SL-R3] 명부 2행 → 토글이 사라지고 도출값(3채)을 보여준다 — 선언 스칼라는 무시", () => {
    render(
      <Step4
        form={baseForm({
          householdHousingCount: "1", // 어긋난 선언 — 도출값이 이겨야 한다
          houses: [house("h1", "2018-01-01"), house("h2", "2019-01-01")],
        })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText("다른 보유 주택이 없습니다")).toBeNull();
    expect(screen.getByTestId("household-house-count-derived").textContent).toContain("3채");
  });

  it("[SL-R4] 토글 ON → 확정 + 스칼라를 \"1\"로 함께 맞춘다", () => {
    const onChange = vi.fn();
    render(
      <Step4
        form={baseForm({ houses: [], householdHousingCount: "3", householdNoOtherHousesConfirmed: false })}
        onChange={onChange}
      />,
    );
    // 접근성 이름에 description이 함께 실려(ToggleCard aria-labelledby) 제목만으로는 정확히 안 맞는다 — 정규식으로.
    fireEvent.click(screen.getByRole("switch", { name: /^다른 보유 주택이 없습니다/ }));
    expect(onChange).toHaveBeenCalledWith({
      householdNoOtherHousesConfirmed: true,
      householdHousingCount: "1",
    });
  });

  it("[SL-R5] 분양권 양도는 종전 버튼 위젯을 그대로 쓴다(Q-11 범위 밖)", () => {
    const form = baseForm({ houses: [] });
    form.assets[0].assetKind = "presale_right";
    render(<Step4 form={form} onChange={() => {}} />);
    expect(screen.getByTestId("household-house-count-buttons")).toBeTruthy();
    expect(screen.queryByText("다른 보유 주택이 없습니다")).toBeNull();
  });
});

/**
 * ── PR-C(2026-10-05) — 입주권도 housing과 같은 명부-필수 UX ──
 *
 * `docs/00-pm/roster-required-other-assets.plan.md` §4-3. SL-R1~R4의 입주권 짝.
 * **오프셋만 다르다** — 입주권 자신은 §89①4호 가목의 「주택」이 아니라 확정 시 스칼라가
 * "0"(housing·redevelopment_apt는 "1")으로 맞춰진다.
 */
describe("SL-PRC Step4 ① 표시 — 입주권(PR-C)", () => {
  function rightForm(over: Partial<TransferFormData> = {}) {
    const form = baseForm(over);
    form.assets[0].assetKind = "right_to_move_in";
    return form;
  }

  it("[SL-PRC-1] right_to_move_in에는 버튼 위젯이 없다", () => {
    render(<Step4 form={rightForm({ houses: [] })} onChange={() => {}} />);
    expect(screen.queryByTestId("household-house-count-buttons")).toBeNull();
  });

  it("[SL-PRC-2] 명부 0행 + 미확정 → 확정 토글이 보이고 OFF", () => {
    render(
      <Step4
        form={rightForm({ houses: [], householdNoOtherHousesConfirmed: false })}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/다른 보유 주택이 없습니다/)).toBeTruthy();
  });

  it("[SL-PRC-3] 명부 2행 → 토글이 사라지고 도출값(2채, 오프셋 0)을 보여준다", () => {
    render(
      <Step4
        form={rightForm({
          householdHousingCount: "1", // 어긋난 선언 — 도출값이 이겨야 한다
          houses: [house("h1", "2018-01-01"), house("h2", "2019-01-01")],
        })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText("다른 보유 주택이 없습니다")).toBeNull();
    // housing·redevelopment_apt의 "3채"(1+2)와 다르다 — 입주권 자신은 세지 않는다(0+2).
    expect(screen.getByTestId("household-house-count-derived").textContent).toContain("2채");
  });

  it("[SL-PRC-4] 토글 ON → 확정 + 스칼라를 \"0\"으로 맞춘다(housing의 \"1\"과 다르다)", () => {
    const onChange = vi.fn();
    render(
      <Step4
        form={rightForm({ houses: [], householdHousingCount: "3", householdNoOtherHousesConfirmed: false })}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /^다른 보유 주택이 없습니다/ }));
    expect(onChange).toHaveBeenCalledWith({
      householdNoOtherHousesConfirmed: true,
      householdHousingCount: "0",
    });
  });
});

/**
 * ── PR-B(2026-10-05) — 재개발APT도 housing과 같은 명부-필수 UX ──
 *
 * `docs/00-pm/roster-required-other-assets.plan.md` §4-2. SL-R1~R4의 재개발APT 짝.
 */
describe("SL-PRB Step4 ① 표시 — 재개발APT(PR-B)", () => {
  function redevForm(over: Partial<TransferFormData> = {}) {
    const form = baseForm(over);
    form.assets[0].assetKind = "redevelopment_apt";
    return form;
  }

  it("[SL-PRB-1] redevelopment_apt에는 버튼 위젯이 없다", () => {
    render(<Step4 form={redevForm({ houses: [] })} onChange={() => {}} />);
    expect(screen.queryByTestId("household-house-count-buttons")).toBeNull();
  });

  it("[SL-PRB-2] 명부 0행 + 미확정 → 확정 토글이 보이고 OFF", () => {
    render(
      <Step4
        form={redevForm({ houses: [], householdNoOtherHousesConfirmed: false })}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("다른 보유 주택이 없습니다")).toBeTruthy();
  });

  it("[SL-PRB-3] 명부 2행 → 토글이 사라지고 도출값(3채)을 보여준다 — 선언 스칼라는 무시", () => {
    render(
      <Step4
        form={redevForm({
          householdHousingCount: "1", // 어긋난 선언 — 도출값이 이겨야 한다
          houses: [house("h1", "2018-01-01"), house("h2", "2019-01-01")],
        })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText("다른 보유 주택이 없습니다")).toBeNull();
    expect(screen.getByTestId("household-house-count-derived").textContent).toContain("3채");
  });

  it("[SL-PRB-4] 토글 ON → 확정 + 스칼라를 \"1\"로 함께 맞춘다", () => {
    const onChange = vi.fn();
    render(
      <Step4
        form={redevForm({ houses: [], householdHousingCount: "3", householdNoOtherHousesConfirmed: false })}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /^다른 보유 주택이 없습니다/ }));
    expect(onChange).toHaveBeenCalledWith({
      householdNoOtherHousesConfirmed: true,
      householdHousingCount: "1",
    });
  });
});

/**
 * ── OH-34 레거시 표식 UI ──
 *
 * | # | 주장 |
 * |---|---|
 * | SL-9 | 표식 ON → 레거시 카드(저장 당시 값으로 계산) + 종전 불일치 카드 **미노출** |
 * | SL-10 | 표식 ON → 「목록 기준으로 전환」이 표식을 끄고 스칼라를 파생값으로 맞춘다 |
 * | SL-11 | 🔴 표식 ON 이면 명부를 편집해도 스칼라를 덮지 않는다 — 전환 버튼만이 끈다 |
 * | SL-12 | 표식 ON 이면 C-1 「목록 기준으로 산정됩니다」 안내를 숨긴다 (그 상태에선 거짓) |
 */
describe("SL OH-34 레거시 표식", () => {
  const two = [house("h1", "2018-01-01"), house("h2", "2019-01-01")]; // 파생 3채

  function renderList(over: Partial<TransferFormData>) {
    const onChange = vi.fn();
    render(<HousesListSection form={baseForm(over)} onChange={onChange} />);
    return onChange;
  }

  it("[SL-9] 표식 ON → 레거시 카드가 뜨고 종전 불일치 카드는 안 뜬다", () => {
    renderList({ householdHousingCount: "1", houses: two, legacyHouseCountPrecedence: true });
    expect(screen.getByTestId("house-count-legacy-precedence")).toBeTruthy();
    expect(screen.queryByTestId("house-count-mismatch")).toBeNull();
  });

  it("[SL-9-twin] 표식 OFF → 종전 불일치 카드 (구별력 확인)", () => {
    renderList({ householdHousingCount: "1", houses: two });
    expect(screen.queryByTestId("house-count-legacy-precedence")).toBeNull();
    expect(screen.getByTestId("house-count-mismatch")).toBeTruthy();
  });

  it("[SL-10] 「목록 기준으로 전환」 → 표식 OFF + 스칼라를 파생값 3으로", () => {
    const onChange = renderList({
      householdHousingCount: "1",
      houses: two,
      legacyHouseCountPrecedence: true,
    });
    fireEvent.click(screen.getByTestId("house-count-adopt-roster"));
    expect(onChange).toHaveBeenCalledWith({
      legacyHouseCountPrecedence: false,
      householdHousingCount: "3",
    });
  });

  it("[SL-11] 🔴 표식 ON 이면 명부를 편집해도 스칼라를 덮지 않는다", () => {
    const onChange = renderList({
      householdHousingCount: "1",
      houses: two,
      legacyHouseCountPrecedence: true,
    });
    fireEvent.click(screen.getByText("+ 주택 추가"));
    const patch = onChange.mock.calls.at(-1)![0];
    expect(patch.houses).toHaveLength(3);
    expect(patch.householdHousingCount).toBeUndefined();
  });

  it("[SL-11-twin] 표식 OFF 면 같은 조작이 스칼라를 갱신한다 (구별력 확인)", () => {
    const onChange = renderList({ householdHousingCount: "1", houses: two });
    fireEvent.click(screen.getByText("+ 주택 추가"));
    expect(onChange.mock.calls.at(-1)![0].householdHousingCount).toBe("3");
  });

  it("[SL-12] 표식 ON 이면 C-1 「목록 기준으로 산정됩니다」를 숨긴다 — 그 상태에선 거짓", () => {
    renderList({ householdHousingCount: "1", houses: two, legacyHouseCountPrecedence: true });
    expect(screen.queryByText(/목록이 비어 있을 때만 사용됩니다/)).toBeNull();
  });

  it("[SL-12-twin] 표식 OFF 면 C-1 이 그대로 뜬다 (구별력 확인)", () => {
    renderList({ householdHousingCount: "1", houses: two });
    expect(screen.getByText(/목록이 비어 있을 때만 사용됩니다/)).toBeTruthy();
  });
});
