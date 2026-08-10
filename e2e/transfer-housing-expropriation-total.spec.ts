/**
 * 주택(라목) §164⑨ 1호 공익수용 특례 총액 트랙 — 보상 총액 2필드 노출 게이트 E2E (계획 P5).
 *
 * 주택은 개별주택가격이 총액이라 원/㎡ 3후보(land·building)가 아닌 총액 3후보를 쓴다. 주택 + 수용 +
 * 환산 시 "주택 총액" 블록(보상액 총액·보상기초 총액)이 노출된다. 세액(환산취득가 상승)은 anchor가
 * 담당하고, 본 스펙은 UI 노출 게이트만 검증한다.
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/transfer-housing-expropriation-total.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

test.describe("주택 §164⑨ 1호 총액 트랙 — 보상 총액 2필드 게이트", () => {
  test("주택 + 환산 + 수용 → 보상 총액 2필드 노출 (라목 총액)", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const td = page.getByTestId("transfer-date");
    await td.getByLabel("연도").fill("2023");
    await td.getByLabel("월").fill("05");
    await td.getByLabel("일").fill("01");

    // 주택은 기본 자산종류 — ③취득정보에서 환산취득가만 켠다
    await expandAssetSection(page, 3);
    await page.getByRole("radio", { name: /환산취득가/ }).first().click();

    // ②양도정보 — 양도원인=공익수용
    await expandAssetSection(page, 2);
    await page.getByTestId("expr-cause-radio").click();

    // 게이트 충족(주택+환산+수용+양도 2023) → 주택 총액 2필드 노출
    await expect(page.getByText("보상액 총액").first()).toBeVisible();
    await expect(page.getByText("보상산정 기초 기준시가 총액")).toBeVisible();
  });

  test("주택 + 수용, 환산 아님(실거래가) → 미노출", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const td = page.getByTestId("transfer-date");
    await td.getByLabel("연도").fill("2023");
    await td.getByLabel("월").fill("05");
    await td.getByLabel("일").fill("01");

    await expandAssetSection(page, 2);
    await page.getByTestId("expr-cause-radio").click();

    await expect(page.getByText("보상산정 기초 기준시가 총액")).toHaveCount(0);
  });
});
