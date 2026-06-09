/**
 * E2E: 상속인/수유자/법인 "종류 변경" 기능
 *
 * 기능: 이미 추가한 항목의 관계(relation)를 잘못 선택한 경우, 삭제·재추가 없이
 *   헤더의 "종류 변경" 버튼으로 즉시 교정. id 보존으로 자산 협의분할 배분도 유지.
 *
 * 검증:
 *   1. 헤더에 "종류 변경" 버튼 노출 → 클릭 시 관계 선택 그리드 펼침 (현재 관계 "현재" 배지)
 *   2. 다른 관계 선택 → 헤더 라벨 변경 + 그리드 닫힘 (기타 → 수유자: 직전 버그4 교정 경로)
 *   3. 법인 → 자연인 변경 시 법인 전용 UI(영리법인 토글) 제거 + 자연인 UI 노출
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */
import { test, expect } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

async function fillStep0(page: import("@playwright/test").Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");
}

test("CHR-1: 기타 → 수유자 종류 변경 (삭제·재추가 없이 교정)", async ({ page }) => {
  test.setTimeout(90_000);
  await fillStep0(page);

  // 기타(other) 1명 추가 → 헤더 "1. 기타 법정상속인..." 형식
  await addHeir(page, "other");
  await expect(page.getByText(/\d\. 기타/).first()).toBeVisible();

  // 종류 변경 버튼 → 관계 선택 그리드 펼침
  await page.getByTestId("heir-change-relation-0").click();
  const picker = page.getByTestId("heir-relation-picker-0");
  await expect(picker).toBeVisible();

  // 현재 관계(기타)에 "현재" 배지 노출
  await expect(picker.getByText("현재")).toBeVisible();

  // 수유자 선택 → 헤더 "N. 수유자"로 변경 + 그리드 닫힘
  await picker.getByText("수유자", { exact: true }).click();
  await expect(page.getByText(/\d\. 수유자/).first()).toBeVisible();
  await expect(picker).not.toBeVisible();
});

test("CHR-2: 법인 → 자녀 종류 변경 (법인 전용 UI 제거, 자연인 UI 노출)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await fillStep0(page);

  // 법인(corporate) 추가 → 영리법인 토글 노출
  await addHeir(page, "corporate");
  await expect(page.getByTestId("heir-is-for-profit")).toBeVisible();

  // 종류 변경 → 자녀
  await page.getByTestId("heir-change-relation-0").click();
  await page
    .getByTestId("heir-relation-picker-0")
    .getByText("자녀", { exact: true })
    .click();

  // 법인 전용 UI 제거 + 헤더 "N. 자녀"
  await expect(page.getByTestId("heir-is-for-profit")).not.toBeVisible();
  await expect(page.getByText(/\d\. 자녀/).first()).toBeVisible();
});
