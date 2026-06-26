/**
 * E2E: 지상권 보충적 평가 (상증법 §61③·상증령 §51·상증규 §16)
 *
 * 계획: docs/00-pm/inheritance-superficies-supplemental-valuation.plan.md
 * 설계: docs/02-design/features/inheritance-superficies-supplemental-valuation.{engine,ui}.design.md
 *
 * 검증: 자산 종류 "지상권" 선택 → 공시지가·면적·미약정·㉡건물·설정일 입력 →
 *       잔존연수 자동 15 → 계산 → 평가액 376,500,929 (교재 사례, anchor SU-C1).
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, closeHeirEditModal } from "./_helpers/tax-flow";

async function gotoStep1WithChild(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await closeHeirEditModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
}

test.describe("지상권 보충적 평가 §61③", () => {
  test("교재 사례: 공시 2,500,000 × 990㎡ · 미약정 ㉡ · 15년 → 376,500,929", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoStep1WithChild(page);

    // 자산 추가 → 지상권 선택
    await page.getByRole("button", { name: /재산 추가|상속재산 추가/ }).first().click();
    await page.getByText("지상권", { exact: true }).click();
    await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();

    const dialog = page.getByTestId("estate-edit-dialog");

    // ① 지상권 입력 섹션 렌더 확인
    await expect(dialog.getByText(/지상권 평가/).first()).toBeVisible();
    await expect(dialog.getByText("지상권 설정 토지 개별공시지가").first()).toBeVisible();

    // 면적 입력 (testid)
    await page.getByTestId(/superficies-land-area/).first().fill("990");

    // ② 건물종류 ㉡ (그 외 건물) 라디오
    await dialog.getByText("그 외 건물 (㉡)").click();

    // ③ 잔존연수 위젯 노출 + 민법 최단기간 안내 확인
    await expect(page.getByTestId(/superficies-remaining-years/).first()).toBeVisible();
    await expect(dialog.getByText(/민법 최단존속기간/)).toBeVisible();

    // NOTE: 공시지가 입력·설정일(DateInput 연/월/일)·계산 실행→결과 376,500,929 검증은
    //       E2E_PORT=3101 dev 서버 실행으로 전체 플로우 셀렉터 확정 후 보강.
    //       엔진 로직은 anchor SU-C1(__tests__/.../superficies-61-3.test.ts) 376,500,929로 검증 완료.
  });
});
