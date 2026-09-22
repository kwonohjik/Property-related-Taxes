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
 * | SL-4 | 입주권 양도(F1)에서는 스칼라를 갱신하지 않는다 |
 * | SL-5 | Step4 — 정합 상태에서 버튼 3개가 **잠긴다** + 안내 문구 |
 * | SL-6 | 🔴 어긋난 상태(구 이력 복원)에서는 **열려 있다** — dead-end 방지 |
 * | SL-7 | 명부가 비면 열려 있다 (D-4 간이 입력) |
 * | SL-8 | 잠긴 상태에서 「정확한 주택 수」 입력칸도 잠긴다 |
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

  it("[SL-4] 🔴 입주권 양도(F1)에서는 스칼라를 갱신하지 않는다", () => {
    const form = baseForm({ householdHousingCount: "1", houses: [house("h1", "2018-01-01")] });
    form.assets[0].assetKind = "right_to_move_in";
    const onChange = renderList(form);
    fireEvent.click(screen.getByText("+ 주택 추가"));
    expect(onChange.mock.calls.at(-1)![0].householdHousingCount).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// ⑤ Step4 버튼 잠금
// ────────────────────────────────────────────────────────────
describe("SL Step4 스칼라 버튼 잠금", () => {
  function renderStep4(form: TransferFormData) {
    render(<Step4 form={form} onChange={() => {}} />);
    // 「N채」는 불일치 경고 문구에도 나온다 — 버튼군으로 범위를 좁힌다.
    const group = screen.getByTestId("household-house-count-buttons");
    const btns = Array.from(group.querySelectorAll("button"));
    expect(btns.map((b) => b.textContent)).toEqual(["1채", "2채", "3채 이상"]);
    return btns;
  }

  it("[SL-5] 정합 상태(선언 3 = 1 + 명부 2행) → 버튼 3개가 잠긴다", () => {
    const btns = renderStep4(
      baseForm({
        householdHousingCount: "3",
        houses: [house("h1", "2018-01-01"), house("h2", "2019-01-01")],
      }),
    );
    for (const b of btns) expect(b).toBeDisabled();
    expect(screen.getByText(/자동 산정됩니다/)).toBeTruthy();
  });

  it("[SL-6] 🔴 어긋난 상태(선언 1 + 명부 2행) → 열려 있다. 잠그면 맞출 화면이 사라진다", () => {
    const btns = renderStep4(
      baseForm({
        householdHousingCount: "1",
        houses: [house("h1", "2018-01-01"), house("h2", "2019-01-01")],
      }),
    );
    for (const b of btns) expect(b).not.toBeDisabled();
    expect(screen.queryByText(/자동 산정됩니다/)).toBeNull();
  });

  it("[SL-7] 명부가 비면 열려 있다 (D-4 간이 입력)", () => {
    const btns = renderStep4(baseForm({ householdHousingCount: "1", houses: [] }));
    for (const b of btns) expect(b).not.toBeDisabled();
  });

  it("[SL-8] 잠기면 「정확한 세대 보유 주택 수」 칸도 잠긴다", () => {
    renderStep4(
      baseForm({
        householdHousingCount: "4",
        houses: [house("h1", "2018-01-01"), house("h2", "2019-01-01"), house("h3", "2020-01-01")],
      }),
    );
    expect(screen.getByLabelText("정확한 세대 보유 주택 수")).toBeDisabled();
  });

  it("[SL-8-twin] 어긋나면 그 칸도 열려 있다", () => {
    renderStep4(
      baseForm({
        householdHousingCount: "9",
        houses: [house("h1", "2018-01-01"), house("h2", "2019-01-01")],
      }),
    );
    expect(screen.getByLabelText("정확한 세대 보유 주택 수")).not.toBeDisabled();
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
