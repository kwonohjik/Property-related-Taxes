/**
 * 주택 기본정보 면적 입력 — Phase 2 게이트 확대 브라우저 확인
 *
 * 종전: 면적 시나리오 섹션이 `assetKind === "land"` 전용이라 주택에서는 면적 칸이 없었고,
 *   `acquisitionArea` 입력은 PHD(§164⑤) 섹션에만 존재했다 → PHD를 끄면 입력 수단 소멸.
 *   그런데 validate-asset.ts:459는 "(자산 기본 정보)에서 입력하세요"로 안내 → 안내↔위치 불일치.
 *
 * 본 스펙이 확인하는 것:
 *   1. 주택 선택 시 ① 기본정보에 면적 입력 칸이 노출된다 (PHD 토글과 무관)
 *   2. 라벨이 「취득·양도 당시 토지 면적 (㎡)」 (원칙 C — 대상어 명시)
 *   3. 환지 시나리오 옵션은 노출되지 않는다 (소득령 §162의2 = 토지 제도)
 *   4. 면적 칸이 화면에 중복 노출되지 않는다
 *
 * 세액 정확성·validate 경로는 vitest anchor가 검증한다
 *   (__tests__/lib/calc/transfer-asset-area-axis.anchor.test.ts).
 *
 * 비-worktree 실행: npx playwright test e2e/transfer-housing-area-basic-info.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

test.describe("주택 기본정보 면적 입력 (Phase 2 게이트 확대)", () => {
  test("주택 선택 → 기본정보에 토지 면적 칸 노출 + 환지 옵션 부재", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await page.getByTestId("transfer-date").getByLabel("연도", { exact: true }).fill("2024");
    await page.getByTestId("transfer-date").getByLabel("월", { exact: true }).fill("06");
    await page.getByTestId("transfer-date").getByLabel("일", { exact: true }).fill("15");

    await expandAssetSection(page, 1);

    // 자산 종류 = 주택 (기본값이 주택이어도 명시 클릭으로 상태 고정)
    await page.getByRole("button", { name: "주택", exact: true }).click();

    // 1) 면적 시나리오 Select가 기본정보에 노출된다
    const scenarioSelect = page.getByTestId("area-scenario-select");
    await expect(scenarioSelect).toBeVisible();

    // 2) 라벨 — 주택은 「토지 면적」으로 대상어 명시
    await expect(page.getByText("취득·양도 당시 토지 면적 (㎡)")).toBeVisible();

    // 3) 환지 옵션 부재 — 허용 목록은 same·partial 뿐
    await scenarioSelect.click();
    await expect(page.getByRole("option", { name: /증환지/ })).toHaveCount(0);
    await expect(page.getByRole("option", { name: /감환지/ })).toHaveCount(0);
    await expect(page.getByRole("option", { name: /일부 양도/ })).toBeVisible();
    await page.keyboard.press("Escape");

    // 4) 면적 입력이 동작하고 화면에 중복 노출되지 않는다
    const areaInput = page.getByPlaceholder("면적 입력");
    await expect(areaInput).toHaveCount(1);
    await areaInput.fill("152.75");
    await expect(areaInput).toHaveValue("152.75");
  });

  test("겸용주택 토글 ON → 기본정보 면적 섹션 미노출 (겸용 전용 섹션이 정본)", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await page.getByTestId("transfer-date").getByLabel("연도", { exact: true }).fill("2024");
    await page.getByTestId("transfer-date").getByLabel("월", { exact: true }).fill("06");
    await page.getByTestId("transfer-date").getByLabel("일", { exact: true }).fill("15");

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).click();

    // 게이트 확대 전제 확인 — 일반 주택에서는 노출
    await expect(page.getByTestId("area-scenario-select")).toBeVisible();

    // 겸용주택 토글 ON → mixedUseTotalLandArea + 겸용 전용 섹션이 전체 면적을 담당하므로
    // 기본정보 면적 섹션은 사라져야 한다(중복 입력 방지).
    await page.getByRole("switch", { name: "겸용주택 분리계산" }).click();
    await expect(page.getByTestId("area-scenario-select")).toHaveCount(0);
  });
});
