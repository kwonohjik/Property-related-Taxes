/**
 * E2E: 양도세 부담부증여 × **재개발/재건축 APT** (소령 §159 × §166②).
 *
 * 이 조합은 2026-09-08까지 3층(⑤ UI · ⑧ validate · 엔진)에서 차단돼 있었다.
 * 게이트를 열었으므로 **화면에서 실제로 입력이 되는지**를 잰다 —
 * 엔진 anchor는 엔진 input을 손으로 만들어 넣으므로 입력 경로를 증명하지 않는다
 * (`feedback_api_trigger_without_input_path_is_noop`).
 *
 * 검증:
 *   ① 자산종류 「재개발/재건축 APT」에서 부담부증여를 고르면 rose 미지원 안내가 아니라
 *      `BurdenedGiftBlock`이 뜬다
 *   ② 증여재산 평가 라벨이 §61①4호(주택) 축으로 표시된다
 *   ③ 「취득시 기준시가」 칸이 함께 뜬다(기준시가 모드 · §159①1호 A괄호)
 *   ④ 🔴 대조군 — 조합원입주권은 여전히 미지원 안내가 뜬다
 *
 * 정책: worktree E2E는 `E2E_PORT` 필수 (`feedback_worktree_e2e_port_isolation`).
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

test.describe("부담부증여 × 재개발 APT — 입력 경로 개방", () => {
  test("재개발 APT에서 부담부증여 입력이 렌더된다", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const card = page.locator('[data-asset-card-index="0"]');
    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);

    // ① 자산 종류: 재개발/재건축 APT
    await card.getByRole("button", { name: "재개발/재건축 APT", exact: true }).click();

    // ② 양도 형태: 부담부증여
    await card.getByRole("radio", { name: /부담부증여/ }).check();

    // 🔴 미지원 안내가 «뜨지 않는다» — 게이트가 열렸다
    await expect(card.getByText(/에서만 지원됩니다/)).toHaveCount(0);

    // BurdenedGiftBlock 진입 — 인수 채무 카드
    await expect(card.getByText("부담부증여 (소득세법 시행령 §159)")).toBeVisible();

    // ③ 증여재산 평가 — §61①4호(주택) 축 라벨
    await expect(card.getByText("증여일 주택 기준시가")).toBeVisible();

    // ④ 취득시 기준시가 칸 (기준시가 모드 · §159①1호 A괄호)
    await expect(card.locator('[data-testid="bg-acq-std-price"]')).toBeVisible();
  });

  /**
   * 🔄 **대조군 교체 (2026-09-08)** — 종전 대조군은 조합원입주권이었다. 같은 날 후속 배치에서
   *    입주권이 지원에 편입되면서 그 자산으로는 안내문이 렌더되지 않는다. 아직 미지원인
   *    분양권(사용자 판단으로 범위 밖)으로 바꾼다. 단언 축은 그대로다.
   */
  test("🔴 대조군 — 분양권은 미지원 안내가 뜬다 (범위 밖)", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const card = page.locator('[data-asset-card-index="0"]');
    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);

    await card.getByRole("button", { name: "분양권", exact: true }).click();
    await card.getByRole("radio", { name: /부담부증여/ }).check();

    const notice = card.getByText(/에서만 지원됩니다/);
    await expect(notice).toBeVisible();
    // 지원 목록은 배열에서 파생된다 — 재개발 APT가 들어 있어야 한다
    await expect(notice).toContainText("재개발/재건축 APT");
  });
});
