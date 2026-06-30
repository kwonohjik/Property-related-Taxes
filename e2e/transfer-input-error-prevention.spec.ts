/**
 * 양도세 입력 오류 예방 3종 E2E (ui-upgrade, 2026-06-12)
 *
 * 1. 오류 일괄 표시 — "다음" 클릭 시 한 단계의 모든 차단 오류를 목록으로 표시 (두더지잡기 제거)
 * 2. 실시간 날짜 순서 경고 — 취득일 ≥ 양도일 입력 즉시 자산 카드에 amber 경고
 * 3. DateInput 실제 달력 클램핑 — 2월 30일 입력 → 말일 자동 보정
 *
 * worktree 실행: E2E_PORT=3102 npx playwright test e2e/transfer-input-error-prevention.spec.ts
 * ⚠️ stale 서버 주의 — lsof -ti :3102 | xargs kill 후 실행.
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

test.describe("양도세 입력 오류 예방", () => {
  test("오류 일괄 표시 — 빈 폼에서 다음 클릭 시 오류 목록 + 건수 헤더", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 아무것도 입력하지 않고 "다음" — 양도일·총양도가액·자산 오류가 한 번에 보여야 함
    await page.getByRole("button", { name: "다음", exact: true }).click();

    // 일괄 오류 배너: 건수 헤더 + 목록
    await expect(page.getByText(/입력 확인이 필요합니다 \(\d+건\)/)).toBeVisible();
    await expect(page.getByText("양도일을 선택하세요.", { exact: false })).toBeVisible();
    await expect(page.getByText("총 양도가액을 입력하세요.", { exact: false })).toBeVisible();
  });

  test("실시간 경고 — 취득일을 양도일 이후로 입력하면 즉시 amber 경고", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일 2024-06-01 (페이지 첫 DateInput)
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2024");
    await page.getByTestId("transfer-date").getByLabel("월").fill("06");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");

    // 자산 카드 취득일을 양도일과 동일하게 입력 (자산 카드 내 DateInput)
    // getByLabel("일")은 토글 스위치 라벨("…일…" 포함)에 오매칭 — textbox role로 한정
    const card = page.locator('[data-asset-card-index="0"]');
    // 점진적 노출 — 취득일(③) 펼침
    await expandAssetSection(page, 3);
    // 양도일·신고일이 ① 안으로 이동했으므로 취득일은 ③ 취득정보 섹션으로 스코프 한정
    const acqSection = card.locator('[data-asset-section="3"]');
    await acqSection.getByRole("textbox", { name: "연도" }).first().fill("2024");
    await acqSection.getByRole("textbox", { name: "월" }).first().fill("06");
    await acqSection.getByRole("textbox", { name: "일" }).first().fill("01");

    // "다음" 클릭 없이 즉시 경고 표시
    await expect(
      card.getByText(/취득일은 양도일보다 이전이어야 합니다.*날짜를 확인해 주세요/),
    ).toBeVisible();

    // 취득일을 양도일 이전으로 고치면 경고 즉시 소멸
    await acqSection.getByRole("textbox", { name: "연도" }).first().fill("2020");
    await expect(
      card.getByText(/날짜를 확인해 주세요/),
    ).toBeHidden();
  });

  test("DateInput 달력 클램핑 — 2월 30일 입력 시 말일 자동 보정", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일에 2023-02-30 시도 → 일이 28로 클램핑
    const year = page.getByTestId("transfer-date").getByLabel("연도");
    const month = page.getByTestId("transfer-date").getByLabel("월");
    const day = page.getByTestId("transfer-date").getByLabel("일");
    await year.fill("2023");
    await month.fill("02");
    await day.fill("30");
    await expect(day).toHaveValue("28");

    // 윤년 2024로 바꾸면 29까지 허용되므로 28 유지 (재클램핑 미발동)
    await year.fill("2024");
    await expect(day).toHaveValue("28");
  });
});
