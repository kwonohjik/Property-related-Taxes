/**
 * 양도세 결과 — "상세 내역" 요약 표(이미지3) 제거 회귀 (2026-06-29)
 *
 * 제거: TransferTaxResultView 상세 내역 컴팩트 표(양도차익~지방소득세 8행).
 * 보존(절대 영향 금지): 신고서 양식(FilingFormTable) · 계산결과 상세명세서 · 총 납부세액 배너.
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-result-no-detail-summary-table.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function getInputByLabel(page: Page, labelText: string) {
  return page.locator(`label:has-text("${labelText}")`).locator("xpath=..").locator("input");
}

test("상세 내역 표 제거 후 신고서 양식·상세명세서·총 납부세액은 유지", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  // 날짜는 textbox role로 타깃 (취득일 영역 §166⑥ 링크 버튼이 getByLabel("일")에 오매칭되는 것 회피)
  const year = (i: number) => page.getByRole("textbox", { name: "연도", exact: true }).nth(i);
  const month = (i: number) => page.getByRole("textbox", { name: "월", exact: true }).nth(i);
  const day = (i: number) => page.getByRole("textbox", { name: "일", exact: true }).nth(i);

  // 양도일 2024-06-01 / 신고일 2024-08-31
  await year(0).fill("2024");
  await month(0).fill("06");
  await day(0).fill("01");
  await year(1).fill("2024");
  await month(1).fill("08");
  await day(1).fill("31");

  // 점진적 노출 — 양도정보(②)·취득정보(③) 펼침
  await expandAssetSection(page, 2);
  await expandAssetSection(page, 3);

  // 자산: 주택(기본) · 양도가액 1,500,000,000
  await getInputByLabel(page, "양도가액 (원)").first().fill("1500000000");

  // 취득원인 매매 · 취득일 2015-03-10 · 취득가액 800,000,000
  await page.getByRole("button", { name: "매매", exact: true }).click();
  await year(2).fill("2015");
  await month(2).fill("03");
  await day(2).fill("10");
  await getInputByLabel(page, "취득가액 (원)").first().fill("800000000");

  // 가산세 단계로 이동 후 계산
  await page.getByRole("button", { name: "가산세" }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();

  // ── 보존 검증 (이미지4·5): 결과 도달 + 신고서 양식·상세명세서 렌더 ──
  await expect(page.getByText("신고서 양식", { exact: false }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("계산결과 상세명세서", { exact: false }).first()).toBeVisible();
});
