/**
 * transfer-nbl-factory-land.spec.ts
 *
 * 공장용 건축물 부속토지 기준면적 초과분 비사업용 중과 (Phase D).
 *
 * 근거: 「소득세법」 §104의3①4호나목 → 「지방세법」 §106①2호·3호
 *       → 시행령 §102①1호(별표6 — 연면적 × 100 ÷ 기준공장면적률) / §101①1호(바닥면적 × 배율)
 *
 * 경로: 양도세 → 단순토지 → 보유 상황 → 비사업용 토지 ON → 판정 도움 필요
 *       → 지목 "기타 토지" → 공장 토글 ON → 소재 지역 선택 → 면적 입력 → 미리보기 단언
 *
 * ⚠️ 미리보기는 엔진과 같은 순수 함수(`computeFactoryStandardArea`)를 쓴다. 여기서 보는
 *    숫자가 곧 판정 값이다.
 *
 * 실행: npx playwright test e2e/transfer-nbl-factory-land.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 기타 토지 + NBL 정밀판정까지 진입 */
async function gotoOtherLandJudgment(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
  await page.getByTestId("transfer-date").getByLabel("월").fill("02");
  await page.getByTestId("transfer-date").getByLabel("일").fill("18");

  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: "단순토지" }).click();
  await page.getByText("독립 나대지", { exact: true }).click();
  await page.getByPlaceholder("면적 입력").first().fill("5000");

  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await page.getByRole("switch", { name: /비사업용 토지/ }).click();
  await page.getByText("판정 도움 필요", { exact: true }).click();

  // 토지 지목 → 기타 토지
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "기타 토지 (나대지·잡종지)" }).click();
}

const factory = (page: Page) => page.getByTestId("nbl-factory-section");

test.describe("공장용 건축물 부속토지 기준면적", () => {
  test("토글 OFF에서는 입력이 열리지 않는다", async ({ page }) => {
    await gotoOtherLandJudgment(page);
    await expect(factory(page)).toBeVisible();
    // 섹션 자체는 보이되 입력은 닫혀 있다
    await expect(page.getByTestId("nbl-factory-total-land-area")).toHaveCount(0);
  });

  test("별표6 경로 — 연면적 1,200㎡ ÷ 12% → 기준 12,000㎡ · 초과 40%", async ({ page }) => {
    await gotoOtherLandJudgment(page);

    await page.getByRole("switch", { name: /공장용 건축물의 부속토지/ }).click();
    await page.getByText(/읍·면지역\(군 지역 포함\)/).click();

    await page.getByTestId("nbl-factory-total-land-area").fill("20000");
    await page.getByTestId("nbl-factory-segment-add").click();
    await page.getByTestId("nbl-factory-segment-floor-0").fill("1200");
    await page.getByTestId("nbl-factory-segment-rate-0").fill("12");

    // 기준면적 = 10,000(별표6 1호) + 2,000(3호가2 20% 한도 내 인정) = 12,000
    await expect(page.getByTestId("nbl-factory-preview-standard")).toHaveText("12,000");
    // 공장 전체 20,000 − 12,000 = 8,000 (40%)
    const excess = page.getByTestId("nbl-factory-preview-excess");
    await expect(excess).toContainText("8,000");
    await expect(excess).toContainText("40.00%");
  });

  test("제한지역 토글이 추가 인정한도를 10%로 좁힌다 (12,000 → 11,000)", async ({ page }) => {
    await gotoOtherLandJudgment(page);

    await page.getByRole("switch", { name: /공장용 건축물의 부속토지/ }).click();
    await page.getByText(/읍·면지역\(군 지역 포함\)/).click();
    await page.getByTestId("nbl-factory-total-land-area").fill("20000");
    await page.getByTestId("nbl-factory-segment-add").click();
    await page.getByTestId("nbl-factory-segment-floor-0").fill("1200");
    await page.getByTestId("nbl-factory-segment-rate-0").fill("12");
    await expect(page.getByTestId("nbl-factory-preview-standard")).toHaveText("12,000");

    await page.getByRole("switch", { name: /공장 신설 제한지역 소재/ }).click();
    await expect(page.getByTestId("nbl-factory-preview-standard")).toHaveText("11,000");
  });

  test("§101①1호 경로 — 바닥면적 1,000㎡ × 일반주거 4배 → 4,000㎡", async ({ page }) => {
    await gotoOtherLandJudgment(page);

    // 용도지역: 일반주거지역 (배율 4배) — 두 번째 combobox
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "일반주거지역" }).click();

    await page.getByRole("switch", { name: /공장용 건축물의 부속토지/ }).click();
    await page.getByText(/그 밖의 특별시·광역시/).click();

    await page.getByTestId("nbl-factory-total-land-area").fill("20000");
    await page.getByTestId("nbl-factory-footprint").fill("1000");

    await expect(page.getByTestId("nbl-factory-preview-standard")).toHaveText("4,000");
    // 별표6 경로 입력은 이 경로에서 보이지 않는다 (연면적/바닥면적 혼동 방지)
    await expect(page.getByTestId("nbl-factory-segment-add")).toHaveCount(0);
  });

  test("허가·사용승인 미이행이면 면적과 무관하게 전량 비사업용", async ({ page }) => {
    await gotoOtherLandJudgment(page);

    await page.getByRole("switch", { name: /공장용 건축물의 부속토지/ }).click();
    await page.getByText(/읍·면지역\(군 지역 포함\)/).click();
    await page.getByTestId("nbl-factory-total-land-area").fill("20000");
    await page.getByTestId("nbl-factory-segment-add").click();
    await page.getByTestId("nbl-factory-segment-floor-0").fill("1200");
    await page.getByTestId("nbl-factory-segment-rate-0").fill("12");
    await expect(page.getByTestId("nbl-factory-preview-standard")).toBeVisible();

    await page.getByRole("switch", { name: /허가·사용승인을 받지 않은/ }).click();

    const preview = page.getByTestId("nbl-factory-preview");
    await expect(preview).toContainText("전량이 비사업용");
    // 면적 미리보기는 사라진다 (단서가 배율 판단을 대체한다)
    await expect(page.getByTestId("nbl-factory-preview-standard")).toHaveCount(0);
  });

  test("값이 모자라면 미리보기를 띄우지 않는다 (추정 표시 금지)", async ({ page }) => {
    await gotoOtherLandJudgment(page);

    await page.getByRole("switch", { name: /공장용 건축물의 부속토지/ }).click();
    await page.getByText(/읍·면지역\(군 지역 포함\)/).click();
    await page.getByTestId("nbl-factory-total-land-area").fill("20000");
    // 업종 미입력 상태
    await expect(page.getByTestId("nbl-factory-preview")).toHaveCount(0);
  });
});
