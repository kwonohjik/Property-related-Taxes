/**
 * E2E: 상속세 물납 (상증법 §73 / 상증령 §73·§74)
 *
 * 검증:
 *   1. Step4(공제·세액공제) 끝 "물납 신청" 토글 노출
 *   2. 토글 ON + 계산 → 결과에 요건 충족·허용한도·충당순서 카드 표시
 *   3. 토글 OFF → 물납 카드 없음
 *
 * 시나리오: 자녀 1명 — 토지 30억(공시지가 10,000,000원/㎡ × 300㎡)
 *   → 부동산 100% (요건1 충족) · 금융재산 0 (요건3 충족) · 결정세액 > 2천만(요건2)
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */
import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  addLandAsset as addLandAssetHelper,
  nextSteps,
  calcAndWaitResult,
  addHeir,
} from "./_helpers/tax-flow";

async function fillStep0WithChild(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1
}

async function addLandAsset(page: Page) {
  await addLandAssetHelper(page, { area: "300", unitPrice: "10000000" });
}

async function gotoStep4(page: Page) {
  await nextSteps(page, 3); // → Step2 → Step3 → Step4
}

test.describe("물납 (§73)", () => {
  test("PIK-E2E-1: 토글 ON → 결과 요건·허용한도·충당순서 표시", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await fillStep0WithChild(page);
    await addLandAsset(page);
    await gotoStep4(page);

    // 그룹 D(납부 방법) 헤더 클릭 → 펼침 (디폴트 접힘 대응)
    await page.getByRole("button", { name: /납부 방법/ }).click();

    // Step4 — 물납 신청 토글 노출
    const toggle = page.getByText("물납 신청 (상증법 §73)");
    await expect(toggle).toBeVisible();
    // ToggleCard switch — 제목 텍스트 클릭은 토글 무효(BaseUI), 인접 §73 인용링크가 가로챔
    await page.getByRole("switch", { name: /물납 신청/ }).click(); // ON → 펼침

    // 보정 입력 노출 확인
    await expect(page.getByText("관리·처분 부적당 제외액")).toBeVisible();

    // 계산 → 결과
    await calcAndWaitResult(page);

    // 물납 안내 카드 — 요건 충족 + 허용한도 + 충당순서
    await expect(page.getByText("물납 안내 (상증법 §73)")).toBeVisible();
    await expect(page.getByText("물납 신청 가능")).toBeVisible();
    await expect(page.getByText("물납 허용한도 (§73①, 적은 금액)")).toBeVisible();
    await expect(
      page.getByText("충당순서 (§74②, 정당사유 없는 한)"),
    ).toBeVisible();
  });

  test("PIK-E2E-2: 토글 OFF → 물납 카드 없음", async ({ page }) => {
    test.setTimeout(90_000);

    await fillStep0WithChild(page);
    await addLandAsset(page);
    await gotoStep4(page);

    // 물납 토글 켜지 않고 바로 계산
    await calcAndWaitResult(page);

    // 결과 화면 진입(연부연납 안내는 적격이라 표시) — 물납 카드만 없음
    await expect(page.getByText("연부연납 안내 (상증법 §71)")).toBeVisible();
    await expect(page.getByText("물납 안내 (상증법 §73)")).toHaveCount(0);
  });
});
