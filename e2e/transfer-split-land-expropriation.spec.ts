/**
 * 건물 토지·건물 분리(split) 양도 §164⑨ 1호 공익수용 특례 — 토지분 보상 2필드 노출 게이트 E2E (계획 P6/D6).
 *
 * 토지·건물 취득일이 달라 분리(안분) 계산되는 건물을 환산취득가액으로 수용 양도 시,
 * **토지분** 양도당시 기준시가만 min[]로 낮춘다(건물분 무변경 — 시행규칙 §80⑧). 이때 per-sqm 블록이
 * 아닌 "토지·건물 분리 양도" 총액 블록(토지분 보상액 총액·토지분 보상기초 총액)이 노출된다.
 * 세액(토지 환산취득가 상승)은 anchor가 담당하고, 본 스펙은 UI 노출 게이트만 검증한다.
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/transfer-split-land-expropriation.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

async function setupBuildingSplit(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const td = page.getByTestId("transfer-date");
  await td.getByLabel("연도").fill("2023");
  await td.getByLabel("월").fill("05");
  await td.getByLabel("일").fill("01");
  // 자산종류 = 건물(토지 제외) → 나목 (propertyType "building")
  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: "건물(토지 제외)", exact: true }).first().click();
  // ③ 취득정보 — 매매 + 토지·건물 취득일 분리(split) 토글 ON
  await expandAssetSection(page, 3);
  await page.getByRole("radio", { name: "매매", exact: true }).click();
  await page.getByRole("switch", { name: /토지·건물 취득일 다름/ }).click();
}

test.describe("건물 split 토지분 §164⑨ 1호 — 토지분 보상 2필드 게이트", () => {
  test("건물 split + 환산 + 수용 → 토지분 보상 총액 2필드 노출", async ({ page }) => {
    test.setTimeout(90_000);
    await setupBuildingSplit(page);
    await page.getByRole("radio", { name: /환산취득가/ }).first().click();

    // ② 양도정보 — 양도원인 = 공익수용
    await expandAssetSection(page, 2);
    await page.getByTestId("expr-cause-radio").click();

    // 게이트 충족(건물 split + 환산 + 수용 + 양도 2023) → 토지분 총액 2필드 노출
    await expect(page.getByText("② 토지분 보상액 총액")).toBeVisible();
    await expect(page.getByText("③ 토지분 보상산정 기초 기준시가 총액")).toBeVisible();
    // per-sqm 블록(② 보상가액 원/㎡)은 split에서 우회되므로 미노출
    await expect(page.getByText("① 공시지가 (양도시 기준시가)")).toHaveCount(0);
  });

  test("건물 split + 수용, 환산 아님(실거래가) → 미노출", async ({ page }) => {
    test.setTimeout(90_000);
    await setupBuildingSplit(page);
    // 실거래가(기본) 유지 — 환산 미선택
    await expandAssetSection(page, 2);
    await page.getByTestId("expr-cause-radio").click();

    await expect(page.getByText("③ 토지분 보상산정 기초 기준시가 총액")).toHaveCount(0);
  });
});
