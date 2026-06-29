/**
 * transfer-nbl-revenue-autofetch.spec.ts
 *
 * 검증 목적: §168의11② 수입금액비율 섹션의 "토지가액 자동조회 (당해·직전)" 버튼이
 * 현행 코드에서 실제로 렌더되는지 확인 (커밋 f645a615 검증, image2 stale 의혹).
 *
 * 경로: 양도세 → 토지·농지 → 보유 상황 → 비사업용 토지 ON → 판정 도움 필요
 *       → 토지 지목 "기타 토지" → 업종 선택 → 자동조회 버튼 노출 단언.
 *
 * 실행: E2E_PORT=3002 npx playwright test e2e/transfer-nbl-revenue-autofetch.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

test.describe("§168의11② 수입금액비율 — 토지가액 자동조회 버튼 노출", () => {
  test("기타 토지 + 업종 선택 시 자동조회 버튼이 보인다", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일 2026-02-18 (첫 DateInput 그룹) — transferDate prop·버튼 활성 조건
    await page.getByLabel("연도", { exact: true }).first().fill("2026");
    await page.getByLabel("월", { exact: true }).first().fill("02");
    await page.getByLabel("일", { exact: true }).first().fill("18");

    // 점진적 노출 — 기본정보(①) 펼침 (자산종류·성격·면적). NBL 판정은 보유 상황(Step4)이라 비접힘.
    await expandAssetSection(page, 1);

    // 자산: 토지·농지 → 독립 나대지
    await page.getByRole("button", { name: "토지·농지" }).click();
    await page.getByText("독립 나대지", { exact: true }).click();
    await page.getByPlaceholder("면적 입력").first().fill("314.1");

    // 보유 상황(Step4) 이동
    await page.getByRole("button", { name: "보유 상황" }).first().click();

    // 비사업용 토지 ToggleCard ON (Switch — 접근명에 타이틀 포함)
    await page.getByRole("switch", { name: /비사업용 토지/ }).click();

    // 판정 상태: 판정 도움 필요
    await page.getByText("판정 도움 필요", { exact: true }).click();

    // 토지 지목 Select(첫 combobox) → 기타 토지 (나대지·잡종지)
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "기타 토지 (나대지·잡종지)" }).click();

    // §168의11② 업종 Select — violet 섹션으로 스코프 (§168의11① 라디오의 "해당 없음"과 구분)
    const revenueSection = page
      .locator("div.rounded-lg")
      .filter({ hasText: "§168의11② 수입금액비율" });
    await revenueSection.getByRole("combobox").click();
    await page
      .getByRole("option", { name: "자동차·중장비 정비/운전 학원 (10%)" })
      .click();

    // ── 핵심 단언: 자동조회 버튼 노출 ──
    const autofetchBtn = page.getByRole("button", {
      name: /토지가액 자동조회/,
    });
    await expect(autofetchBtn).toBeVisible({ timeout: 5000 });

    // 당해/직전 토지가액 입력란도 함께 노출 확인
    await expect(page.getByText("당해 토지가액 (양도일 기준시가)")).toBeVisible();
    await expect(page.getByText("직전 토지가액", { exact: true })).toBeVisible();

    // §168의11③3호 연환산 신규 UI 노출 확인
    await expect(page.getByText("당해 과세기간 연환산 (§168의11③3호)")).toBeVisible();
    await expect(page.getByText("당해 사업개시일")).toBeVisible();
    await expect(page.getByText("직전 과세기간 영위일수")).toBeVisible();

    // §168의11③1호 간주임대료 + §168의11③2호 공통수입 안분 신규 UI 노출
    await expect(page.getByText("전세금·보증금 간주임대료 (§168의11③1호)")).toBeVisible();
    await expect(page.getByText("당해 전세금·보증금")).toBeVisible();
    await expect(page.getByText("공통수입 안분 (§168의11③2호)")).toBeVisible();

    console.log("✅ 자동조회 + 연환산 + 간주임대료(③1호) + 공통안분(③2호) UI 노출 확인");
  });
});
