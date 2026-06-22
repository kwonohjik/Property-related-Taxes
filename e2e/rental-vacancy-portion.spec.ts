/**
 * E2E: §61⑤ 임대보증금 평가특례 — 미임대(공실) 부분 입력 UI (2026-06-22)
 *
 * 계획서: docs/00-pm/rental-conversion-vacancy-portion.plan.md
 * 설계: docs/02-design/features/rental-conversion-vacancy-portion.{engine,ui}.design.md
 *
 * 검증: 상업용 건물(real_estate_building) 보충평가 경로 B(건물+부수토지 분리) + 월 임대료>0일 때
 *       EstateBodySupplementaryValuation 경로 B 블록 내에 "일부만 임대 중(미임대 공실)" ToggleCard가
 *       노출되고, 미임대 면적·건물 기준시가 입력 + 부수토지 미입력 시 안내가 표시된다.
 *       (엔진 합산 산식 858,100,000은 단위 anchor rental-vacancy-portion.test.ts [VAC-1]이 커버)
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · 공유 컴포넌트라 상속 플로우로 검증(증여 동일).
 * 함정: 미임대 토글은 monthlyRent(형제 담보·임대 카드에서 write)>0 + 경로 B 동시 충족 시 노출.
 *       FieldCard로 감싼 CurrencyInput/DecimalInput은 getByLabel 불가 → fieldInput 헬퍼(field-card ancestor).
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, closeHeirEditModal } from "./_helpers/tax-flow";

function fieldInput(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .locator("xpath=ancestor::div[@data-slot='field-card']//input");
}

async function gotoStep1WithChild(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await closeHeirEditModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function addCommercialBuildingCard(page: Page) {
  await page.getByRole("button", { name: /재산 추가|상속재산 추가/ }).first().click();
  await page.getByRole("button", { name: /상업용 건물/ }).first().click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
}

const VACANCY_TITLE = "일부만 임대 중 (미임대 공실 있음)";

test.describe("§61⑤ 미임대(공실) 부분 입력", () => {
  test("경로 B + 월 임대료>0 시 미임대 토글 노출 → 미임대 입력 + 부수토지 미입력 안내", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addCommercialBuildingCard(page);

    // 보충평가 ON → 경로 B(분리) 선택
    await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
    await page.locator('[data-testid^="cb-route-separate-"]').click();

    // 월 임대료 입력 전: 미임대 토글 미노출 (monthlyRent 게이트)
    await expect(page.getByText(VACANCY_TITLE, { exact: true })).toHaveCount(0);

    // 담보·임대 토글 ON → 월 임대료 입력 (형제 카드 CollateralLeaseFields)
    await page.getByRole("switch", { name: /담보·임대/ }).click();
    await fieldInput(page, "월 임대료 (원)").fill("2000000");

    // 미임대 토글 노출 (경로 B + monthlyRent>0)
    await expect(page.getByText(VACANCY_TITLE, { exact: true })).toBeVisible();
    await page.getByRole("switch", { name: /일부만 임대 중/ }).click();

    // 미임대 면적·건물 기준시가 입력
    await fieldInput(page, "전체 건물 연면적 (㎡)").fill("720");
    await fieldInput(page, "미임대 건물 연면적 (㎡)").fill("180");
    await fieldInput(page, "미임대분 건물 기준시가").fill("75600000");

    // 부수토지 개별공시지가 미입력 → 안내 경고 (자동 안분 분모 부재)
    await expect(page.getByText(/부수토지 개별공시지가 미입력/)).toBeVisible();
  });

  test("경로 A(일괄고시)에서는 월 임대료>0이어도 미임대 토글 미노출", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addCommercialBuildingCard(page);

    // 보충평가 ON (경로 A 기본값 유지 — 분리 미선택)
    await page.getByRole("switch", { name: /보충적 평가방법/ }).click();

    // 월 임대료 입력
    await page.getByRole("switch", { name: /담보·임대/ }).click();
    await fieldInput(page, "월 임대료 (원)").fill("2000000");

    // 경로 A에서는 미임대 토글 미노출
    await expect(page.getByText(VACANCY_TITLE, { exact: true })).toHaveCount(0);
  });
});
