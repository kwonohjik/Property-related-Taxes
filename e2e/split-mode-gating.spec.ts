/**
 * E2E: 토지/건물 분리 — 취득가액 산정 방식별 게이팅 + 순서.
 *
 * 계획서: docs/02-design/features/land-building-split-mode-gating-and-salescase-drift.plan.md (§3-C)
 *
 * - 「취득가액 산정 방식」이 「취득·양도가액 분리 방식」보다 **위**(UI 순서 = 엔진 로직 순서)
 * - 취득가액 칸: 실거래가·감정가액=노출 / 환산·매매사례=숨김 / 부담부증여=숨김(transferType 축)
 * - 양도가액 칸은 산정 방식 무관 항상 노출
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

async function setupSplitAsset(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: "주택", exact: true }).first().click();
  await expandAssetSection(page, 3);
  await page.getByRole("button", { name: "매매", exact: true }).click();
  await page.getByRole("switch", { name: /토지·건물 취득일 다름/ }).click();
  // 분리 방식 → 직접 입력
  await page.getByRole("button", { name: "직접 입력", exact: true }).click();
}

const landAcq = (p: Page) => p.getByTestId("split-land-acq-price");
const landTransfer = (p: Page) => p.getByTestId("split-land-transfer-price");

test.describe("분리 방식 — 산정 방식별 게이팅", () => {
  test("순서: 「취득가액 산정 방식」이 「분리 방식」보다 위", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    const acqFirst = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("label, p, div"));
      const find = (t: string) => all.find((e) => e.textContent?.trim() === t);
      const acq = find("취득가액 산정 방식");
      const split = find("취득·양도가액 분리 방식");
      if (!acq || !split) return null;
      return !!(acq.compareDocumentPosition(split) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(acqFirst, "산정 방식이 분리 방식보다 먼저여야 함").toBe(true);
  });

  test("실거래가(기본) → 취득가액 칸 노출", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await expect(landAcq(page)).toBeVisible();
    await expect(landTransfer(page), "양도가액 칸은 항상 노출").toBeVisible();
  });

  test("감정가액 → 취득가액 칸 노출 (실거래가와 동일 그룹)", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await page.getByRole("button", { name: "감정가액" }).click();
    await expect(landAcq(page)).toBeVisible();
  });

  test("환산취득가 → 취득가액 칸 숨김 + 양도시 기준시가 칸", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await page.getByRole("button", { name: "환산취득가" }).click();
    await expect(landAcq(page)).toHaveCount(0);
    await expect(page.getByText("토지 양도시 기준시가")).toBeVisible();
    await expect(landTransfer(page), "양도가액 칸은 항상 노출").toBeVisible();
  });

  test("매매사례가액 → 취득가액 칸 숨김 + 안분 안내", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await page.getByRole("button", { name: "매매사례가액" }).click();
    await expect(landAcq(page), "추계액은 토지/건물 개별 실지가액이 없다").toHaveCount(0);
    await expect(page.getByTestId("split-salescase-note")).toBeVisible();
    await expect(landTransfer(page), "양도가액 칸은 항상 노출").toBeVisible();
  });

  test("부담부증여 → 취득가액 칸 숨김 (§159 자동 산정 · transferType 축)", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    // ② 양도정보에서 부담부증여 선택 — 3지선다는 inline RadioCardGroup(라벨 "부담부증여 (소령 §159)")
    await expandAssetSection(page, 2);
    await page.getByRole("radio", { name: /부담부증여/ }).check();
    await expandAssetSection(page, 3);
    await expect(landAcq(page)).toHaveCount(0);
    await expect(page.getByTestId("split-burdened-note")).toBeVisible();
    // 분리 방식 자체는 살아 있어야 한다(기능 제거 금지)
    await expect(landTransfer(page), "부담부증여도 양도가액 분리는 유효").toBeVisible();
  });
});
