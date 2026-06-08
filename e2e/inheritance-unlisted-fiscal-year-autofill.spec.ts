/**
 * E2E: 비상장주식 V2 사업연도 자동 채움
 *
 * 시나리오:
 *   T-FY-AUTO-1: 상속개시일 2022-02-02 입력 → V2 진입 시
 *                사업연도 라벨 "2021"/"2020"/"2019" 자동 표시
 *                종료일 2021-12-31 / 2020-12-31 / 2019-12-31 자동 표시
 *   T-FY-AUTO-2: 자동값 수정 후 보존 — 사업연도 라벨 수정 → 다른 필드 변경 후에도 유지
 *   T-FY-AUTO-3: 간편→정식→간편→정식 재진입 시 자동값 보존 (mode만 변경)
 *
 * 헬퍼: inheritance-unlisted-v2-convenience-fields.spec.ts 동일 패턴 재사용
 */
import { test, expect, type Page } from "@playwright/test";

async function gotoStep0AndFillDeathDate(page: Page, year: string, month: string, day: string) {
  await page.goto("/calc/inheritance-tax");

  // Step0: 상속개시일 입력
  await page.getByLabel("연도").first().fill(year);
  await page.getByLabel("월").first().fill(month);
  await page.getByLabel("일").first().fill(day);

  // 상속인 추가 (최소 1명 필수)
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("700101-1000000");
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function openV2FormalCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

test.describe("비상장주식 V2 사업연도 자동 채움", () => {
  test("T-FY-AUTO-1: 상속개시일 2022-02-02 → V2 진입 시 1년전 라벨 '2021' + 종료일 2021-12-31 자동 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2022", "2", "2");
    await openV2FormalCard(page);

    // 섹션3 "사업연도별 순손익액" 영역이 보여야 함
    await expect(page.getByText("사업연도별 순손익액", { exact: false })).toBeVisible();

    // 1년전 (슬롯[0]) 라벨 input — value="2021"
    const labelInputs = page.locator('input[placeholder="사업연도 라벨"]');
    await expect(labelInputs.nth(0)).toHaveValue("2021");
    await expect(labelInputs.nth(1)).toHaveValue("2020");
    await expect(labelInputs.nth(2)).toHaveValue("2019");
  });

  test("T-FY-AUTO-1b: 2022-02-02 → 개시일 자동 채움으로 isShortYear 안내 없음 (12개월 가정)", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2022", "2", "2");
    await openV2FormalCard(page);

    // 개시일이 (Y-1)-01-01으로 채워졌고 종료일이 (Y-1)-12-31이면 12개월 → isShortYear=false
    // → "사업연도 X개월 → 연환산" amber 안내 문구가 표시되지 않아야 함
    await expect(page.getByText(/사업연도.*개월.*연환산/)).not.toBeVisible();

    // 3개 슬롯 라벨 모두 확인 (T-FY-AUTO-1 보강)
    const labelInputs = page.locator('input[placeholder="사업연도 라벨"]');
    await expect(labelInputs.nth(0)).toHaveValue("2021");
    await expect(labelInputs.nth(1)).toHaveValue("2020");
    await expect(labelInputs.nth(2)).toHaveValue("2019");
  });

  test("T-FY-AUTO-2: 자동값 수정 후 보존 — 라벨 수정 → 법인명 입력 후에도 유지", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2022", "2", "2");
    await openV2FormalCard(page);

    // 자동 채워진 라벨을 확인
    const labelInput = page.locator('input[placeholder="사업연도 라벨"]').nth(0);
    await expect(labelInput).toHaveValue("2021");

    // 라벨 수정
    await labelInput.clear();
    await labelInput.fill("2021(6개월)");
    await labelInput.press("Tab");

    // 법인명 입력 (다른 필드 변경)
    const corpNameInput = page.getByPlaceholder("법인명");
    if (await corpNameInput.isVisible()) {
      await corpNameInput.fill("테스트법인");
    }

    // 수정된 라벨이 유지되어야 함
    await expect(labelInput).toHaveValue("2021(6개월)");
  });

  test("T-FY-AUTO-3: 간편→정식 최초 진입 시 자동 채움, 간편 복귀 후 재진입 시 보존", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2022", "2", "2");

    // 비상장주식 추가
    await page.getByRole("button", { name: /주식·지분 추가/ }).click();
    await page.getByRole("button", { name: /비상장주식/ }).click();

    // 간편평가가 기본 선택됨 — 정식평가로 전환
    await page.getByText("정식평가", { exact: true }).click();

    // 자동 채움 확인
    const labelInputs = page.locator('input[placeholder="사업연도 라벨"]');
    await expect(labelInputs.nth(0)).toHaveValue("2021");

    // 간편 복귀
    await page.getByText("간편평가", { exact: true }).click();

    // V2 카드가 사라져야 함 (간편 모드)
    await expect(page.getByText("사업연도별 순손익액")).not.toBeVisible();

    // 정식평가 재진입 — C-5: V2 보존, mode만 변경
    await page.getByText("정식평가", { exact: true }).click();

    // 이전에 자동 채워진 라벨이 보존되어야 함
    await expect(page.locator('input[placeholder="사업연도 라벨"]').nth(0)).toHaveValue("2021");
  });
});
