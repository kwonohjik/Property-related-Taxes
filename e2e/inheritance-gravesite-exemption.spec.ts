/**
 * E2E: 금양임야·묘토 비과세 면적/금액 한도 (상증령 §8③) — 2026-06-05
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 *
 * 버그 수정 검증:
 *  - 면적 한도 정정 (금양임야 9,900㎡ / 묘토 1,980㎡ — 구 1,983/3,966 아님)
 *  - 면적 입력 위젯(DecimalInput) 신규 노출 — 기존엔 면적 입력 경로 부재(잠복)
 *  - 금양임야+묘토 합산 2억원 한도 안내 카드 (§8③ 단서)
 */

import { test, expect, type Page } from "@playwright/test";

/** Step0(상속인) → Step1(토지 자산) → Step2(비과세) — 단계 네비 버튼으로 결정적 이동 */
async function gotoExemptionStep(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

  // Step1: 토지 1건 (이후 단계 진입 위해 자산 ≥1 필요)
  await page
    .getByRole("button", { name: /재산 추가|상속재산 추가/ })
    .first()
    .click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
  await page.getByPlaceholder("면적 입력").fill("100");
  await page.getByPlaceholder("공시지가 단가").fill("1000000");

  // 비과세·장례비 단계로 직접 이동
  await page.getByRole("button", { name: /비과세.*단계로 이동/ }).click();
  await expect(page.getByText(/비과세.*해당 여부/)).toBeVisible();

  // 비과세 마스터 토글 "여"
  await page.getByRole("button", { name: "여", exact: true }).first().click();
}

test.describe("금양임야·묘토 비과세 면적/금액 한도 (상증령 §8③)", () => {
  test("GFE-1: 금양임야·묘토 항목 + 정정된 면적 한도(9,900/1,980㎡) 노출", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    await expect(page.getByText("금양임야 (禁養林野)")).toBeVisible();
    await expect(page.getByText("묘토 (墓土)")).toBeVisible();
    // 정정값 9,900㎡(금양임야)·1,980㎡(묘토) — 면적 한도는 항목 '여' 선택 후 면적 입력 라벨에 1회 표기(단일 출처)
    const forestRow = page
      .locator("div.rounded-lg.border")
      .filter({ hasText: "금양임야 (禁養林野)" });
    await forestRow.getByRole("button", { name: "여", exact: true }).click();
    await expect(forestRow.getByText(/9,900㎡/).first()).toBeVisible();
    const graveRow = page
      .locator("div.rounded-lg.border")
      .filter({ hasText: "묘토 (墓土)" });
    await graveRow.getByRole("button", { name: "여", exact: true }).click();
    await expect(graveRow.getByText(/1,980㎡/).first()).toBeVisible();
    // 구값 1,983/3,966 회귀 방지
    await expect(page.getByText(/1,983㎡/)).toHaveCount(0);
    await expect(page.getByText(/3,966㎡/)).toHaveCount(0);
  });

  test("GFE-2: 금양임야 '여' → 가액 + 면적(㎡) 입력란 노출 + 한도 초과 안내", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    const row = page
      .locator("div.rounded-lg.border")
      .filter({ hasText: "금양임야 (禁養林野)" });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "여", exact: true }).click();

    // 가액 + 면적 입력란 둘 다 노출 (D-4: 역할 구분)
    await expect(row.getByPlaceholder("금액 입력")).toBeVisible();
    const areaInput = row.getByPlaceholder("분묘에 속한 면적 (㎡)");
    await expect(areaInput).toBeVisible();

    // 9,900㎡ 초과 입력 → 안분 과세 안내
    await areaInput.fill("15000");
    await expect(row.getByText(/초과 면적 비율만큼/)).toBeVisible();
  });

  test("GFE-3: 금양임야 선택 시 합산 2억원 한도 안내 카드 노출 (§8③ 단서)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    const row = page
      .locator("div.rounded-lg.border")
      .filter({ hasText: "금양임야 (禁養林野)" });
    await row.getByRole("button", { name: "여", exact: true }).click();

    await expect(
      page.getByText(/금양임야와 묘토의 비과세 합계/),
    ).toBeVisible();
    await expect(page.getByText(/2억원 한도/).first()).toBeVisible();
  });
});
