/**
 * E2E: 수유자(legatee) 추가 경로 — 상속인 외 유증액 자동 집계 입력 버그 수정
 *
 * 버그: HeirComposition에 수유자(legatee) 추가 버튼이 없어 사용자가 손녀(수유자)를
 *   "기타(other)"로 추가 → other는 법정상속분 배분 대상(상속인)이라 상속인 외 유증으로
 *   자동 집계되지 않음(이미지46 상속인 외 유증 0). legatee 버튼 추가로 수정.
 *
 * 검증: 상속인 추가 패널에 "수유자" 버튼 노출 + 추가 → 협의분할 배분 대상 포함.
 */
import { test, expect } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

test("수유자(legatee) 추가 버튼 노출 + 추가 (상속인 외 유증 입력 경로)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");

  // 배우자 + 자녀 추가
  await addHeir(page, "heir", "spouse");
  await addHeir(page, "heir", "child");

  // 상속인 추가 패널 → "수유자" 버튼 노출 (SPECIAL_RELATIONS — 버그 수정 핵심)
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await expect(page.getByText("수유자", { exact: true })).toBeVisible({
    timeout: 5_000,
  });

  // 수유자 추가 → HeirEditor 헤더 "N. 수유자" 형식 (index+1 + ". " + 관계 라벨)
  await page.getByText("수유자", { exact: true }).click();
  await expect(page.getByText(/\d\. 수유자/).first()).toBeVisible({ timeout: 5_000 });
});
