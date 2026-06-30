import { test, expect } from "@playwright/test";

/**
 * 자산 분할 토글 분리 — 함께양도(토글 A, 목록 레벨) ↔ 지분분할(토글 B, ③ 취득정보).
 * 핵심 검증:
 *  - 자기소멸 차단(three_state): 토글 클릭 후 Switch가 ON을 유지한다.
 *  - Dialog 폐기확인: 형제 자산 있는 상태에서 OFF → Dialog, 취소 시 유지.
 *  - 상호배타: 한 토글 ON이면 다른 토글 disabled.
 */
test.describe("자산 분할 토글 분리", () => {
  test("토글 A(함께양도) — ON 유지(자기소멸 X) + 총양도가액 노출 + OFF Dialog 취소 시 유지", async ({
    page,
  }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const toggleA = page.getByRole("switch", { name: /다른 부동산도 함께/ });
    await toggleA.click();
    await expect(toggleA).toBeChecked(); // 자기소멸 차단
    await expect(page.getByText("총 양도가액")).toBeVisible(); // companion 전용 §166⑥ 블록

    // OFF 클릭 → Dialog (형제 자산 존재)
    await toggleA.click();
    await expect(
      page.getByText("‘함께 양도’ 모드를 끄시겠습니까?"),
    ).toBeVisible();
    // 취소 → 토글·데이터 유지
    await page.getByRole("button", { name: "취소" }).click();
    await expect(toggleA).toBeChecked();
  });

  test("토글 B(지분분할) — ③ 취득정보에 표시 + ON 유지 + 토글 A 상호배타 비활성", async ({
    page,
  }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // ③ 취득정보 펼침 (첫 자산)
    await page.getByRole("button", { name: /취득정보/ }).first().click();

    const toggleB = page.getByRole("switch", { name: /지분\(%\)별로 나눠 취득/ });
    await expect(toggleB).toBeVisible();
    await toggleB.click();
    await expect(toggleB).toBeChecked(); // 자기소멸 차단

    // 상호배타 — 토글 A 비활성
    const toggleA = page.getByRole("switch", { name: /다른 부동산도 함께/ });
    await expect(toggleA).toBeDisabled();
  });
});
