/**
 * transfer-nbl-revenue-deemed-common.spec.ts
 *
 * §168의11③1호 간주임대료 + §168의11③2호 공통수입 안분 — 입력→계산→결과 풀플로우.
 *
 * 검증:
 *  1) ⑫⑬⑭ — 계산 요청 body.nonBusinessLandRaw 에 신규 nbl* 필드가 실려 엔진에 도달(침묵 strip 방지).
 *  2) 결과 — NonBusinessLandResultCard 에 간주임대료·공통수입 안분 echo 노출.
 *
 * 실행: E2E_PORT=3003 npx playwright test e2e/transfer-nbl-revenue-deemed-common.spec.ts
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** FieldCard/CurrencyInput 라벨 → 내부 input (scope 한정 가능) */
function inputByLabel(scope: Page | Locator, labelText: string): Locator {
  return scope
    .locator(`label:has-text("${labelText}")`)
    .locator("xpath=..")
    .locator("input")
    .first();
}

test.describe("§168의11③1·2호 간주임대료·공통수입 안분 — 풀플로우", () => {
  test("입력 → 계산 요청 body 신규필드 도달 + 결과 echo", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일 2026-02-18
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
    await page.getByTestId("transfer-date").getByLabel("월").fill("02");
    await page.getByTestId("transfer-date").getByLabel("일").fill("18");

    // 점진적 노출 — 기본정보(①)·양도정보(②)·취득정보(③) 펼침
    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await expandAssetSection(page, 3);

    // 자산: 토지·농지 → 독립 나대지 → 면적
    await page.getByRole("button", { name: "단순토지" }).click();
    await page.getByText("독립 나대지", { exact: true }).click();
    await page.getByPlaceholder("면적 입력").first().fill("314.1");

    // 양도가액
    await inputByLabel(page, "양도가액 (원)").fill("2000000000");

    // 취득원인 매매 → 환산취득가
    await page.getByRole("radio", { name: "매매", exact: true }).click();
    await page.getByRole("radio", { name: "환산취득가" }).click();

    // 취득일 1997-02-03 (세 번째 DateInput 그룹)
    await page.getByLabel("연도", { exact: true }).nth(2).fill("1997");
    await page.getByLabel("월", { exact: true }).nth(2).fill("02");
    await page.getByLabel("일", { exact: true }).nth(2).fill("03");

    // 취득시/양도시 기준시가 단가
    await page.getByPlaceholder("공시지가 단가").first().fill("637000");
    await page.waitForTimeout(150);
    await page.getByPlaceholder("공시지가 단가").nth(1).fill("893300");
    await page.waitForTimeout(150);

    // 보유 상황(Step4)
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await page.getByRole("switch", { name: /비사업용 토지/ }).click();
    await page.getByText("판정 도움 필요", { exact: true }).click();

    // 토지 지목 → 기타 토지
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "기타 토지 (나대지·잡종지)" }).click();

    // 용도지역 (NBL detailed 필수 — 미설정 시 raw 미전송·검증 차단)
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "일반주거지역" }).click();

    // 재산세 과세 분류 (기타토지 필수 — PR-1/A1-01. 미선택 시 매퍼가 「종합합산」으로 접어
    // 조용히 비사업용 중과가 붙던 것을 ⑧에서 차단하도록 바꿨다)
    const propertyTaxSection = page
      .locator("div.rounded-lg")
      .filter({ hasText: "재산세 과세 분류" });
    await propertyTaxSection.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "종합합산" }).click();

    // §168의11② 업종 → 주차장운영업(3%)
    const revenueSection = page
      .locator("div.rounded-lg")
      .filter({ hasText: "§168의11② 수입금액비율" });
    await revenueSection.getByRole("combobox").click();
    await page.getByRole("option", { name: "주차장운영업 (3%)" }).click();

    // 당해 수입금액·토지가액 (validation 필수)
    await page.getByLabel("당해 수입금액", { exact: true }).fill("50000000");
    await page.getByLabel("당해 토지가액", { exact: true }).fill("1000000000");

    // §168의11③1호 간주임대료 — 보증금·임대일수
    await page.getByLabel("당해 보증금", { exact: true }).fill("500000000");
    await inputByLabel(revenueSection, "당해 임대 과세대상기간").fill("365");

    // §168의11③2호 공통수입 안분 토글 ON + 당해 쌍
    await page.getByRole("switch", { name: /공통수입 안분/ }).click();
    await page.getByLabel("당해 공통수입금액", { exact: true }).fill("30000000");
    await page.getByLabel("당해 그 밖의 토지가액", { exact: true }).fill("200000000");

    // ── 계산 요청 body 캡처 (⑫⑬⑭) ──
    let capturedRaw: Record<string, unknown> | undefined;
    await page.route("**/api/calc/transfer", async (route) => {
      const body = route.request().postDataJSON?.() as { nonBusinessLandRaw?: Record<string, unknown> } | undefined;
      capturedRaw = body?.nonBusinessLandRaw;
      await route.continue();
    });

    // 가산세 단계까지 이동 후 계산
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await page.getByRole("button", { name: "가산세" }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();

    await page.locator('p:has-text("총 납부세액")').last().waitFor({ timeout: 15000 });

    // ── 1) body 신규필드 도달 단언 ──
    expect(capturedRaw, "nonBusinessLandRaw 가 요청 body 에 있어야 함").toBeTruthy();
    expect(capturedRaw?.nblRevenueCurrentDeposit, "당해 보증금 필드 도달").toBeTruthy();
    expect(String(capturedRaw?.nblRevenueCurrentRentDays)).toContain("365");
    expect(capturedRaw?.nblRevenueCommonApportion, "공통안분 토글 도달").toBe(true);
    expect(capturedRaw?.nblRevenueCommonRevenue, "공통수입금액 도달").toBeTruthy();
    expect(capturedRaw?.nblRevenueOtherLandValue, "그 밖의 토지가액 도달").toBeTruthy();

    // ── 2) 결과 카드 echo 노출 ──
    await expect(page.getByText("§168의11③1호 간주임대료 합산")).toBeVisible();
    await expect(page.getByText("§168의11③2호 공통수입 안분")).toBeVisible();

    console.log("✅ 간주임대료·공통안분 body 도달 + 결과 echo 확인");
  });
});
