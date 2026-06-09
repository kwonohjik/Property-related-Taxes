/**
 * E2E: 문화재 비과세 룰 제거 — §12 2호 삭제 정정 (2026-06-05)
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_korean_law_citation_verify]]
 *
 * 현행 상증법 §12에는 문화재 비과세 호가 없음(구 2호 삭제, KoreanLaw 검증).
 * 문화유산은 비과세가 아니라 §74 징수유예로 처리(inheritance-cultural-heritage-deferral.ts).
 * Step2 ExemptionChecklist에서 "국가·시도 지정 문화재" 행이 더 이상 렌더되지 않고,
 * 나머지 §12·§16·§17 비과세 항목은 정상 노출되는지 검증.
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

/** Step0(상속인) → Step1(토지 자산) → Step2(비과세) — 단계 네비 버튼으로 결정적 이동 */
async function gotoExemptionStep(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
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

  // 비과세 마스터 토글 "여" — 선택 시 '과세가액 불산입' 그룹 헤더 노출(상속세)
  await page.getByRole("button", { name: "여", exact: true }).first().click();
  await expect(page.getByText("과세가액 불산입").first()).toBeVisible();
}

test.describe("문화재 비과세 룰 제거 (§12 2호 삭제 정정)", () => {
  test("CP-1: 비과세 체크리스트에 '국가·시도 지정 문화재' 행이 부재", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    // 문화재 룰 자체가 INHERITANCE_EXEMPTION_RULES에서 제거 → 행 렌더 안 됨
    await expect(page.getByText("국가·시도 지정 문화재")).toHaveCount(0);
    await expect(page.getByText("문화재보호법")).toHaveCount(0);
  });

  test("CP-2: 나머지 §12·§16·§17 비과세 항목은 정상 노출 (회귀 방어)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    await expect(page.getByText("국가·지자체 유증 재산")).toBeVisible(); // §12 1호
    await expect(page.getByText("공익신탁 출연 재산")).toBeVisible(); // §17
  });
});
