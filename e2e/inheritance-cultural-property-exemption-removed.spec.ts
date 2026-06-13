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
import { addHeir, addLandAsset } from "./_helpers/tax-flow";

/** Step0(상속인) → Step1(토지 자산) → Step2(비과세) — 단계 네비 버튼으로 결정적 이동 */
async function gotoExemptionStep(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click(); // Step0 → Step1
  await addLandAsset(page, { area: "100", unitPrice: "1000000" });
  await page.getByRole("button", { name: /^다음/ }).click(); // Step1 → Step2

  // 마스터 토글 제거 — 체크리스트 패널이 바로 노출
  await expect(page.getByText(/비과세.*불산입 선택/)).toBeVisible();
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

    // 체크리스트 칩(축약 라벨)으로 노출 확인 — 입력 섹션은 디폴트 접힘
    await expect(page.getByRole("button", { name: /국가·지자체 유증/ }).first()).toBeVisible(); // §12 1호
    await expect(page.getByRole("button", { name: /공익신탁 출연/ }).first()).toBeVisible(); // §17
  });
});
