import { test, expect, type Page } from "@playwright/test";

import { clickAndExpectUrl } from "./_helpers/navigation";

/**
 * E2E: 현물출자 §39의3 — 당사자 명부(roster) 저가 2단계·고가 per-donee·gross(roster無).
 * 설계: docs/02-design/features/gift-inkind-contribution-39-3.ui.design.md
 * 교재 계산사례 1(저가 450M)·2(고가 225M)·3저가(gross 4M).
 */

async function openContribution(page: Page) {
  await page.goto("/calc/gift-deemed");
  await page.getByTestId("deemed-type-contribution").click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도").fill("2025");
  await dialog.getByLabel("월").fill("7");
  await dialog.getByLabel("일", { exact: true }).fill("1");
  return dialog;
}

test.describe("현물출자 §39의3 — 당사자 명부 roster", () => {
  test("계산사례1 저가 roster — gross 500M·A 275M·B 175M·과세 450M + 증여세 handoff", async ({ page }) => {
    const dialog = await openContribution(page);
    // 저가(①1호) 기본값. 5개 공통 입력
    await dialog.getByPlaceholder("현물출자 전 1주당 평가가액 (원)").fill("20000");
    await dialog.getByPlaceholder("현물출자 전 발행주식총수").fill("100000");
    await dialog.getByPlaceholder("신주 1주당 인수가액 (원)").fill("10000");
    await dialog.getByPlaceholder("현물출자 주식수").fill("100000");
    await dialog.getByPlaceholder("배정받은 신주수").fill("100000");
    // 증여자 명부 ON
    await dialog.getByRole("switch", { name: /증여자 명부 직접 입력/ }).click();
    // 증여자 2명 추가 (A 55,000 부 / B 35,000 형제자매)
    await dialog.getByRole("button", { name: /증여자 추가/ }).click();
    await dialog.getByRole("button", { name: /증여자 추가/ }).click();
    await dialog.getByLabel("증여자 1 성명").fill("A");
    await dialog.getByPlaceholder("주식수 입력").nth(0).fill("55000");
    await dialog.getByLabel("1번 관계").selectOption("father");
    await dialog.getByLabel("증여자 2 성명").fill("B");
    await dialog.getByPlaceholder("주식수 입력").nth(1).fill("35000");
    await dialog.getByLabel("2번 관계").selectOption("sibling");

    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();

    // 과세 증여재산가액 = 450M
    await expect(page.getByTestId("deemed-result-value")).toContainText("450,000,000");
    // gross echo = 500M
    await expect(page.getByTestId("deemed-contribution-gross")).toContainText("500,000,000");
    // per-party 표: A 275M, B 175M
    const breakdown = page.getByTestId("deemed-contribution-breakdown");
    await expect(breakdown).toContainText("275,000,000");
    await expect(breakdown).toContainText("175,000,000");

    // 증여세 본세 handoff (저가 = 동시증여 다건)
    await clickAndExpectUrl(page, page.getByTestId("deemed-to-wizard"), /\/calc\/gift-tax/);
  });

  test("계산사례2 고가 roster per-donee — B 175M·C 50M·합 225M", async ({ page }) => {
    const dialog = await openContribution(page);
    await dialog.getByTestId("con-case-high").click();
    await dialog.getByPlaceholder("현물출자 전 1주당 평가가액 (원)").fill("5000");
    await dialog.getByPlaceholder("현물출자 전 발행주식총수").fill("100000");
    await dialog.getByPlaceholder("신주 1주당 인수가액 (원)").fill("20000");
    await dialog.getByPlaceholder("현물출자 주식수").fill("50000");
    await dialog.getByPlaceholder("인수 신주수").fill("50000");
    // 수증자 명부 ON
    await dialog.getByRole("switch", { name: /수증자 명부 직접 입력/ }).click();
    await dialog.getByRole("button", { name: /수증자 추가/ }).click();
    await dialog.getByRole("button", { name: /수증자 추가/ }).click();
    await dialog.getByLabel("수증자 1 성명").fill("B");
    await dialog.getByPlaceholder("주식수 입력").nth(0).fill("35000");
    await dialog.getByLabel("수증자 2 성명").fill("C");
    await dialog.getByPlaceholder("주식수 입력").nth(1).fill("10000");

    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();

    await expect(page.getByTestId("deemed-result-value")).toContainText("225,000,000");
    const breakdown = page.getByTestId("deemed-contribution-breakdown");
    await expect(breakdown).toContainText("175,000,000");
    await expect(breakdown).toContainText("50,000,000");

    // 고가 수증자는 각자 독립 납세의무자 → 이관 대상 1명 선택 (Phase B ⑫)
    const selector = page.getByTestId("con-high-donee-selector");
    await expect(selector).toBeVisible();
    await expect(selector.locator("option")).toHaveCount(2);
    await selector.selectOption("1"); // 둘째 수증자 C

    await clickAndExpectUrl(page, page.getByTestId("deemed-to-wizard"), /\/calc\/gift-tax/);
    // 마법사 2단계(증여재산)에 **선택한 C**의 50,000,000이 들어왔는지 — 첫 행 B(175,000,000) 고정이 아님.
    // (sessionStorage는 마법사 마운트 시 소비·삭제되므로 화면으로 확인한다)
    await page.getByRole("button", { name: "다음" }).click();
    const assets = page.getByText("현물출자에 따른 이익 — C 수증자분");
    await expect(assets).toBeVisible();
    await expect(page.getByText("50,000,000").first()).toBeVisible();
  });

  test("Phase D 저가 상장 Min — 이론 15,000 → 평가 13,000 · gross 300,000,000", async ({ page }) => {
    const dialog = await openContribution(page);
    // 저가(①1호) 기본값 — 이론값 = (20,000×100,000 + 10,000×100,000) ÷ 200,000 = 15,000
    await dialog.getByPlaceholder("현물출자 전 1주당 평가가액 (원)").fill("20000");
    await dialog.getByPlaceholder("현물출자 전 발행주식총수").fill("100000");
    await dialog.getByPlaceholder("신주 1주당 인수가액 (원)").fill("10000");
    await dialog.getByPlaceholder("현물출자 주식수").fill("100000");
    await dialog.getByPlaceholder("배정받은 신주수").fill("100000");
    // 주권상장법인 토글 ON → 종가평균 13,000 (< 이론 15,000 ⇒ §29②1가 단서 발동)
    await dialog.getByRole("switch", { name: /주권상장법인등/ }).click();
    await dialog.getByPlaceholder("현물출자 납입일 전후 각 2개월 종가평균 (원)").fill("13000");

    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();

    // (13,000 − 10,000) × 100,000 = 300,000,000 (비상장이면 500,000,000)
    await expect(page.getByTestId("deemed-result-value")).toContainText("300,000,000");
    // breakdown에 이론값 행 + 단서 근거가 표시된다
    const result = page.getByTestId("deemed-result");
    await expect(result).toContainText("산식 이론값");
    await expect(result).toContainText("15,000");
    await expect(result).toContainText("상증령 §29②1가 단서");
  });

  test("계산사례3 저가 roster無 — gross 4,000,000 + 자기지분 경고", async ({ page }) => {
    const dialog = await openContribution(page);
    await dialog.getByPlaceholder("현물출자 전 1주당 평가가액 (원)").fill("1000");
    await dialog.getByPlaceholder("현물출자 전 발행주식총수").fill("20000");
    await dialog.getByPlaceholder("신주 1주당 인수가액 (원)").fill("600");
    await dialog.getByPlaceholder("현물출자 주식수").fill("20000");
    await dialog.getByPlaceholder("배정받은 신주수").fill("20000");
    // roster 미사용 (OFF 기본)
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();

    await expect(page.getByTestId("deemed-result-value")).toContainText("4,000,000");
    // roster無 → 자기지분 포함 전액 amber 경고
    await expect(page.getByTestId("deemed-contribution-roster-warning")).toBeVisible();
  });
});
