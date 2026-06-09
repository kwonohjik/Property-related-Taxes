/**
 * E2E: 비상장주식 V2 §63②1호 기업공개 준비 중 평가 옵션 (PR-L)
 *
 * 시나리오:
 *   T-L-1 (상속): 토글 ON → 윈도우 미리보기 노출 + "6개월"(상속 windowMonths) 표기
 *   T-L-2 (증여): gift 경로 토글 ON → "3개월"(증여 windowMonths) 표기 → taxKind 주입 검증(R-1)
 *   T-L-3 (상속): 기본 OFF — 미리보기 미표시 + 토글 존재
 *
 * ★ 핵심 검증: taxKind 주입(상속 6개월 / 증여 3개월)이 폼 경로별로 정확히 전달되는지.
 *   (MAX·할증 등 numeric은 엔진 anchor 16건으로 별도 고정 — e2e는 UI 배선·taxKind만.)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-pre-ipo-listing-section-63-2.plan.md
 * UI Design: §9. 진입 헬퍼는 inheritance-estimated-profit.spec.ts 패턴 재사용.
 */
import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

async function gotoInheritanceV2Formal(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("700101-1000000");
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

async function gotoGiftV2Formal(page: Page) {
  await page.goto("/calc/gift-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  // donorRelation은 donor select에서 자동 도출 (G-M3) — 별도 RadioCardGroup 없음
  await page.locator("select").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

// PR-L2(E2): title이 "§63② 기업공개·상장신청 준비 중 법인 — 특례 평가"로 일반화되어
// 구 정규식 /기업공개 준비 중 법인/은 "·상장신청" 삽입으로 깨짐 → "준비 중 법인"(연속 보존)으로 갱신.
const TOGGLE_TITLE = /준비 중 법인/;

test.describe("비상장주식 V2 §63②1호 기업공개 준비 중 평가", () => {
  test("T-L-3: 기본 OFF — 미리보기 미표시 + 토글 존재", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoInheritanceV2Formal(page);
    await expect(page.getByText(TOGGLE_TITLE)).toBeVisible();
    await expect(page.getByTestId("pre-ipo-window-preview")).toHaveCount(0);
  });

  test("T-L-1: 상속 토글 ON → 윈도우 미리보기 + '6개월' 표기", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoInheritanceV2Formal(page);
    await page.getByText(TOGGLE_TITLE).click();
    await expect(page.getByTestId("pre-ipo-listing-form")).toBeVisible();
    const preview = page.getByTestId("pre-ipo-window-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("6개월"); // 상속 windowMonths
  });

  test("T-L-2: 증여 토글 ON → '3개월' 표기 (taxKind 주입 검증)", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoGiftV2Formal(page);
    await page.getByText(TOGGLE_TITLE).click();
    await expect(page.getByTestId("pre-ipo-listing-form")).toBeVisible();
    const preview = page.getByTestId("pre-ipo-window-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("3개월"); // 증여 windowMonths
  });
});

test.describe("비상장주식 V2 §63②2호 거래소 상장신청·협회 등록 (PR-L2)", () => {
  test("T-L2-2: 토글 ON 기본 거래소 상장 → preview '거래소 상장 전'", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoInheritanceV2Formal(page);
    await page.getByText(TOGGLE_TITLE).click();
    await expect(page.getByTestId("pre-ipo-preparation-type")).toBeVisible();
    await expect(page.getByTestId("pre-ipo-window-preview")).toContainText("거래소 상장 전");
  });

  test("T-L2-1: 협회 등록 선택 → preview '협회 등록 전'", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoInheritanceV2Formal(page);
    await page.getByText(TOGGLE_TITLE).click();
    // preparationType 라디오: 협회 등록(K-OTC) 선택
    await page.getByText(/협회 등록\(K-OTC\)/).click();
    await expect(page.getByTestId("pre-ipo-window-preview")).toContainText("협회 등록 전");
  });
});
