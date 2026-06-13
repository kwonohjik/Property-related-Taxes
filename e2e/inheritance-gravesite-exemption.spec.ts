/**
 * E2E: 금양임야·묘토 비과세 면적/금액 한도 (상증령 §8③) — 2026-06-13
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 *
 * 버그 수정 검증:
 *  - 면적 한도 정정 (금양임야 9,900㎡ / 묘토 1,980㎡ — 구 1,983/3,966 아님)
 *  - 면적 입력 위젯(DecimalInput) 신규 노출 — 기존엔 면적 입력 경로 부재(잠복)
 *  - 금양임야+묘토 합산 2억원 한도 안내 카드 (§8③ 단서)
 *
 * 체크리스트 UI 업데이트 (2026-06-13):
 *  - 항목 "여" 클릭 대신 체크리스트 칩 클릭으로 선택
 *  - 칩 선택 → 그룹 자동 펼침 → 입력 섹션 노출
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, addLandAsset } from "./_helpers/tax-flow";

/** Step0(상속인) → Step1(토지 자산) → Step2(비과세, 마스터 여) */
async function gotoExemptionStep(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

  // Step1: 토지 1건 (이후 단계 진입 위해 자산 ≥1 필요)
  await addLandAsset(page, { area: "100", unitPrice: "1000000" });

  // Step2 진입 (다음 버튼)
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText(/비과세.*불산입 선택/)).toBeVisible();

  // 비과세 마스터 토글 "여"
  // 체크리스트 패널 노출 확인
  await expect(page.getByText(/비과세.*불산입 선택/)).toBeVisible();
}

test.describe("금양임야·묘토 비과세 면적/금액 한도 (상증령 §8③)", () => {
  test("GFE-1: 금양임야·묘토 항목 + 정정된 면적 한도(9,900/1,980㎡) 노출", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    // 체크리스트에 금양임야·묘토 칩이 보임
    await expect(page.getByRole("button", { name: /금양임야/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /묘토/ }).first()).toBeVisible();

    // 금양임야 칩 클릭 → 비과세 그룹 펼침 → 항목 노출
    await page.getByRole("button", { name: /금양임야/ }).first().click();
    await expect(page.getByText("금양임야 (禁養林野)")).toBeVisible();
    // 면적 한도는 항목 체크 후 입력 섹션에 표시
    await expect(page.getByText(/9,900㎡/).first()).toBeVisible();

    // 묘토 칩 클릭
    await page.getByRole("button", { name: /묘토/ }).first().click();
    await expect(page.getByText("묘토 (墓土)")).toBeVisible();
    await expect(page.getByText(/1,980㎡/).first()).toBeVisible();

    // 구값 회귀 방지
    await expect(page.getByText(/1,983㎡/)).toHaveCount(0);
    await expect(page.getByText(/3,966㎡/)).toHaveCount(0);
  });

  test("GFE-2: 금양임야 칩 체크 → 가액 + 면적(㎡) 입력란 노출 + 한도 초과 안내", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    // 금양임야 칩 클릭 → 그룹 펼침 + 항목 체크
    await page.getByRole("button", { name: /금양임야/ }).first().click();

    // 금양임야 입력 섹션 내 금액 + 면적 입력란 노출
    await expect(page.getByPlaceholder("금액 입력").first()).toBeVisible();
    const areaInput = page.getByPlaceholder("분묘에 속한 면적 (㎡)");
    await expect(areaInput).toBeVisible();

    // 9,900㎡ 초과 입력 → 안분 과세 안내
    await areaInput.fill("15000");
    await expect(page.getByText(/초과 면적 비율만큼/)).toBeVisible();
  });

  test("GFE-3: 금양임야 칩 체크 시 합산 2억원 한도 안내 카드 노출 (§8③ 단서)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    // 금양임야 칩 클릭
    await page.getByRole("button", { name: /금양임야/ }).first().click();

    await expect(
      page.getByText(/금양임야와 묘토의 비과세 합계/),
    ).toBeVisible();
    await expect(page.getByText(/2억원 한도/).first()).toBeVisible();
  });
});
