/**
 * E2E: 대체주택 비과세 특례 §156의2⑤ — 사례 43
 *
 * 실제 양도세 위저드 플로우(transfer-nbl-academy-land.spec.ts 검증 패턴):
 *   getByTestId("transfer-date") · expandAssetSection · 자산 "주택" · getInputByLabel
 *   · 사이드바 "보유 상황"→"감면·공제"→"가산세" · 주택수 "2채" · "세금 계산하기"(마지막 단계)
 * ★ ToggleCard 토글은 setChecked(true) (.click()/Space 이중발화로 안 먹음 — memory feedback_e2e_togglecard_setchecked)
 *
 * RH-E2E-1: 토글 ON + 4필드 → 전액 비과세(3.2억<12억)
 * RH-E2E-2: 토글 OFF → API body 에 replacementHouse 없음 (⑬ 게이팅)
 * RH-E2E-3: 토글 ON + 날짜 미입력 → validation 차단(⑧)
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** CurrencyInput(htmlFor 미연결) → label 부모 div 탐색 후 input */
function getInputByLabel(page: Page, labelText: string) {
  return page.locator(`label:has-text("${labelText}")`).locator("xpath=..").locator("input");
}

/** Step1 주택 자산 (사례 43: 양도 3.2억 / 취득 2017-04-13 2.5억) */
async function fillStep1Housing(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
  await page.getByTestId("transfer-date").getByLabel("월").fill("02");
  await page.getByTestId("transfer-date").getByLabel("일").fill("23");
  await page.getByTestId("filing-date").getByLabel("연도").fill("2026");
  await page.getByTestId("filing-date").getByLabel("월").fill("04");
  await page.getByTestId("filing-date").getByLabel("일").fill("30");
  await expandAssetSection(page, 1);
  await expandAssetSection(page, 2);
  await expandAssetSection(page, 3);
  await page.getByRole("button", { name: "주택", exact: true }).first().click();
  await getInputByLabel(page, "양도가액 (원)").first().fill("320000000");
  await page.getByRole("button", { name: "매매", exact: true }).click();
  await page.getByLabel("연도", { exact: true }).nth(2).fill("2017");
  await page.getByLabel("월", { exact: true }).nth(2).fill("04");
  await page.getByLabel("일", { exact: true }).nth(2).fill("13");
  await getInputByLabel(page, "취득가액 (원)").first().fill("250000000");
}

/** Step4 이동 + 1세대 + 2채 (대체주택 ToggleCard 노출 조건) */
async function gotoStep4Household2(page: Page) {
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await expect(page.getByText("세대 보유 주택 수")).toBeVisible();
  await page.getByRole("switch", { name: "1세대 해당" }).setChecked(true);
  await page.getByRole("button", { name: "2채", exact: true }).click();
}

/** 대체주택 특례 토글 ON + 4필드 (사례 43) */
async function fillReplacementHouse(page: Page) {
  await page.getByRole("switch", { name: /대체주택 비과세 특례 해당/ }).setChecked(true);
  const approval = page.getByText("사업시행계획인가일").locator("xpath=..");
  await approval.getByLabel("연도").fill("2015");
  await approval.getByLabel("월").fill("05");
  await approval.getByLabel("일").fill("16");
  const completion = page.getByText("신축주택 준공일").locator("xpath=..");
  await completion.getByLabel("연도").fill("2023");
  await completion.getByLabel("월").fill("04");
  await completion.getByLabel("일").fill("17");
  await page.getByText("대체주택 거주개월수").locator("xpath=..").locator("input").fill("106");
  await page.getByRole("switch", { name: /신축주택 1년 이상 거주 예정/ }).setChecked(true);
}

/** 남은 단계 이동 후 계산 */
async function navigateAndCalc(page: Page) {
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await page.getByRole("button", { name: "가산세" }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
}

test.describe("대체주택 비과세 특례 §156의2⑤ (사례 43)", () => {
  test("RH-E2E-1: 토글 ON + 4필드 → 전액 비과세", async ({ page }) => {
    await fillStep1Housing(page);
    await gotoStep4Household2(page);
    await fillReplacementHouse(page);
    await expect(page.getByText(/§156의2⑬/)).toBeVisible(); // 사후관리 경고
    await navigateAndCalc(page);
    await expect(page.getByText(/비과세/).first()).toBeVisible({ timeout: 15000 });
  });

  test("RH-E2E-2: 토글 OFF → API body 에 replacementHouse 없음 (⑬ 게이팅)", async ({ page }) => {
    const bodies: Record<string, unknown>[] = [];
    await page.route("**/api/calc/transfer", async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.continue();
    });
    await fillStep1Housing(page);
    await gotoStep4Household2(page);
    // 대체주택 토글 OFF 유지 (기본) → 2주택 과세
    await navigateAndCalc(page);
    await expect(async () => {
      expect(bodies.length).toBeGreaterThan(0);
      expect(bodies[bodies.length - 1]).not.toHaveProperty("replacementHouse");
    }).toPass({ timeout: 10000 });
  });

  test("RH-E2E-3: 토글 ON + 날짜 미입력 → validation 차단(⑧)", async ({ page }) => {
    await fillStep1Housing(page);
    await gotoStep4Household2(page);
    // 대체주택 토글만 ON, 4필드 미입력
    await page.getByRole("switch", { name: /대체주택 비과세 특례 해당/ }).setChecked(true);
    await navigateAndCalc(page);
    await expect(page.getByText(/사업시행계획인가일을 입력/)).toBeVisible({ timeout: 5000 });
  });
});
