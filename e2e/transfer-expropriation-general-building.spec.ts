/**
 * 일반건물(토지+건물 일괄) §164⑨ 1호 공익수용 특례 — 보상 2필드 노출 게이트 E2E (계획 D16-GB).
 *
 * 종전에는 일반건물이 `PER_SQM_TRACK`에서 제외돼 보상 필드가 미노출이었다(route early-return 우회).
 * GB 토지 환산 분모 배선(D16-GB) 후 `general_building`을 재추가해 UI가 켜진다. 엔진 세액(토지 환산취득가
 * 상승, +82,745,181원 실증)은 anchor가 담당하고, 본 스펙은 **UI 노출 게이트**만 검증한다.
 *
 * ⚠️ GB는 §164⑨을 **토지분만** 적용한다(시행규칙 §80⑧ — 안분·건물 무변경). 참조행 ①은 양도시
 *    토지 개별공시지가(`gbTransferLandPricePerSqm`)를 보여준다.
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/transfer-expropriation-general-building.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

test.describe("일반건물 §164⑨ 1호 — 보상 2필드 게이트", () => {
  test("일반건물 + 매매·환산 + 수용 → 보상 2필드 노출 (토지분 특례)", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const td = page.getByTestId("transfer-date");
    await td.getByLabel("연도").fill("2023");
    await td.getByLabel("월").fill("05");
    await td.getByLabel("일").fill("01");

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "일반건물(토지+건물 일괄)" }).click();

    // ③취득정보 — 취득원인 매매 + 환산취득가 모드 ON
    await expandAssetSection(page, 3);
    await page.getByRole("radio", { name: "매매" }).first().click();
    await page.getByRole("button", { name: /환산취득가/ }).first().click();

    // ②양도정보 — 양도원인=공익수용
    await expandAssetSection(page, 2);
    await page.getByTestId("expr-cause-radio").click();

    // 게이트 충족(일반건물+매매환산+수용+양도 2023) → 보상 2필드 노출
    await expect(page.getByText("보상가액").first()).toBeVisible();
    await expect(page.getByText("보상산정 기초 기준시가")).toBeVisible();
  });

  test("일반건물 + 수용, 환산 아님(실거래가) → 미노출", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const td = page.getByTestId("transfer-date");
    await td.getByLabel("연도").fill("2023");
    await td.getByLabel("월").fill("05");
    await td.getByLabel("일").fill("01");

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "일반건물(토지+건물 일괄)" }).click();
    // 취득원인 매매만 선택 — 환산취득가 미선택(기본 실거래가) → 특례 게이트 OFF
    await expandAssetSection(page, 3);
    await page.getByRole("radio", { name: "매매" }).first().click();

    await expandAssetSection(page, 2);
    await page.getByTestId("expr-cause-radio").click();

    await expect(page.getByText("보상산정 기초 기준시가")).toHaveCount(0);
  });
});
