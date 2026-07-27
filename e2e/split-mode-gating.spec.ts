/**
 * E2E: 토지/건물 취득·양도가액 독립 산정 — 파트별 게이팅.
 *
 * 계획서: docs/02-design/features/transfer-land-building-independent-valuation-mode.plan.md
 * UI: components/calc/transfer/LandBuildingSplitSection.tsx
 *
 * 2026-07-28 재작성 — 구 UI(자산 전체 "취득가액 산정 방식" 라디오 + "직접 입력" 버튼)를
 * 폐지하고 파트별(토지·건물 각각 4방식) 독립 선택 UI로 교체한 데 따른 spec 재작성.
 *
 * 새 UI 구조:
 *  - 토지 취득 방식: `part-acq-mode-land` (실거래가·환산취득가·감정가액·매매사례가액)
 *  - 건물 취득 방식: `part-acq-mode-building` (동일 4옵션, 토지와 완전 독립)
 *  - 양도 방식: `sale-split-mode` (구분양도(직접입력) | 일괄양도(양도시 기준시가 안분)) — 기본값 "일괄양도"
 *  - 부담부증여(② 양도정보 라디오) 선택 시 파트별 모드 선택 자체가 사라지고 안내만 표시
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
}

const landAcqGroup = (p: Page) => p.getByTestId("part-acq-mode-land");
const buildingAcqGroup = (p: Page) => p.getByTestId("part-acq-mode-building");
const saleSplitGroup = (p: Page) => p.getByTestId("sale-split-mode");
const landAcq = (p: Page) => p.getByTestId("split-land-acq-price");
const landTransfer = (p: Page) => p.getByTestId("split-land-transfer-price");
const landSalesCase = (p: Page) => p.getByTestId("split-land-salescase-value");
const landTransferStdPrice = (p: Page) => p.getByText("토지 양도시 기준시가");

test.describe("파트별 취득 방식 게이팅 — 토지", () => {
  test("실거래가(기본) → 취득가액 칸 노출, 양도가액 칸은 일괄양도 기본이라 숨김", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await expect(landAcqGroup(page)).toBeVisible();
    await expect(buildingAcqGroup(page)).toBeVisible();
    await expect(saleSplitGroup(page)).toBeVisible();
    await expect(landAcq(page)).toBeVisible();
    // 양도 방식 기본값은 "일괄양도 (양도시 기준시가 안분)" — 구분양도 직접입력 칸은 미노출
    await expect(landTransfer(page), "기본값은 일괄양도이므로 양도가액 직접입력 칸 숨김").toHaveCount(0);
  });

  test("감정가액 → 취득가액 칸 노출 (실거래가와 동일 그룹)", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await landAcqGroup(page).getByRole("radio", { name: "감정가액" }).check();
    await expect(landAcq(page)).toBeVisible();
  });

  test("환산취득가 → 취득가액 칸 숨김 + 양도시 기준시가 칸 노출", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await landAcqGroup(page).getByRole("radio", { name: "환산취득가" }).check();
    await expect(landAcq(page)).toHaveCount(0);
    await expect(landTransferStdPrice(page)).toBeVisible();
  });

  test("매매사례가액 → 취득가액 칸 숨김 + 매매사례가 칸 + 안분 안내", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await landAcqGroup(page).getByRole("radio", { name: "매매사례가액" }).check();
    await expect(landAcq(page), "추계액은 토지/건물 개별 실지가액이 없다").toHaveCount(0);
    await expect(landSalesCase(page)).toBeVisible();
    await expect(page.getByText("미입력 시 취득시 기준시가 비율로 안분")).toBeVisible();
  });
});

test.describe("양도 방식 게이팅 — 취득과 독립", () => {
  test("구분양도(직접입력) → 토지·건물 양도가액 칸 노출", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await saleSplitGroup(page).getByRole("radio", { name: "구분양도 (직접입력)" }).check();
    await expect(landTransfer(page)).toBeVisible();
    await expect(page.getByTestId("split-building-transfer-price")).toBeVisible();
  });

  test("일괄양도(안분) → 양도시 기준시가 칸 노출, 직접입력 칸 숨김", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await saleSplitGroup(page).getByRole("radio", { name: "일괄양도 (양도시 기준시가 안분)" }).check();
    await expect(landTransfer(page)).toHaveCount(0);
    await expect(landTransferStdPrice(page)).toBeVisible();
  });
});

test("부담부증여 → 파트별 모드 선택 자체 숨김 + 취득·양도가액 칸 모두 숨김 (§159 안분 기준)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await setupSplitAsset(page);
  // ② 양도정보에서 부담부증여 선택 — 3지선다는 inline RadioCardGroup(라벨 "부담부증여 (소령 §159)")
  await expandAssetSection(page, 2);
  await page.getByRole("radio", { name: /부담부증여/ }).check();
  await expandAssetSection(page, 3);
  // 부담부증여는 양도가/취득가 모두 §159 기준시가 비율로 엔진이 자동 산정하므로
  // 파트별 취득 방식 라디오·양도 방식 라디오 자체가 노출되지 않고 안내만 표시된다.
  await expect(landAcqGroup(page)).toHaveCount(0);
  await expect(buildingAcqGroup(page)).toHaveCount(0);
  await expect(saleSplitGroup(page)).toHaveCount(0);
  await expect(landAcq(page)).toHaveCount(0);
  await expect(landTransfer(page)).toHaveCount(0);
  await expect(page.getByTestId("split-burdened-note")).toBeVisible();
});
