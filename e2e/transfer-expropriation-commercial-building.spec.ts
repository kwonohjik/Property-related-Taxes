/**
 * 상업용건물 §164⑨ 1호 공익수용 특례 — 보상 2필드 노출 게이트 E2E (계획 D16-CB).
 *
 * 종전에는 상가가 `PER_SQM_TRACK`에서 제외돼 보상 필드가 미노출이었다(P3 D16). CB 배선 후
 * `commercial_building`을 재추가해 UI가 켜진다. 엔진 세액(86,784,934원 해소)은 anchor가 담당하고,
 * 본 스펙은 **UI 노출 게이트**만 검증한다.
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/transfer-expropriation-commercial-building.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

test.describe("상업용건물 §164⑨ 1호 — 보상 2필드 게이트", () => {
  test("상가 + 수용 + 환산 → 보상 2필드 노출 (다목 — P3 제외분 복원)", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const td = page.getByTestId("transfer-date");
    await td.getByLabel("연도").fill("2023");
    await td.getByLabel("월").fill("05");
    await td.getByLabel("일").fill("01");

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "상업용건물·오피스텔" }).click();

    // ③취득정보 — 환산취득가 사용 토글 ON (CommercialBuildingBlock)
    await expandAssetSection(page, 3);
    await page.getByRole("switch", { name: /환산취득가 사용/ }).click();

    // ②양도정보 — 양도원인=공익수용
    await expandAssetSection(page, 2);
    await page.getByTestId("expr-cause-radio").click();

    // 게이트 충족(상가+수용+환산+양도 2023) → 보상 2필드 노출
    await expect(page.getByText("보상가액").first()).toBeVisible();
    await expect(page.getByText("보상산정 기초 기준시가")).toBeVisible();
  });

  test("상가 + 수용, 환산 아님 → 미노출", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const td = page.getByTestId("transfer-date");
    await td.getByLabel("연도").fill("2023");
    await td.getByLabel("월").fill("05");
    await td.getByLabel("일").fill("01");

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "상업용건물·오피스텔" }).click();
    // 환산취득가 미사용 (실거래가) — 특례 게이트 OFF
    await expandAssetSection(page, 2);
    await page.getByTestId("expr-cause-radio").click();

    await expect(page.getByText("보상산정 기초 기준시가")).toHaveCount(0);
  });
});
