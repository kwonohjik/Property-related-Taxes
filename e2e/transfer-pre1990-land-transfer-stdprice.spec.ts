/**
 * transfer-pre1990-land-transfer-stdprice.spec.ts
 *
 * 회귀 방지: 1990.8.30. 이전 취득 토지(환산 모드)에서 양도시 기준시가를
 * 상위 standardPriceAtTransfer로 입력하면 "양도당시 개별공시지가를 입력하세요"
 * 차단 없이 계산이 진행되어야 한다.
 *
 * 과거 버그: validation이 입력 UI가 없는 pre1990PricePerSqm_atTransfer 필드를
 * 요구해, 양도시 기준시가를 정상 입력해도 영구 차단됨. (수정: standardPriceAtTransfer 검사)
 *
 * pre1990 입력 흐름 셀렉터는 probe로 실측 확정.
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function getInputByLabel(page: Page, labelText: string) {
  return page.locator(`label:has-text("${labelText}")`).locator("xpath=..").locator("input");
}

test.describe("1990.8.30 이전 취득 토지 환산 — 양도시 기준시가", () => {
  test("양도시 기준시가 입력 시 차단 없이 계산 도달", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일 2026-02-18 / 신고일 2026-04-30
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
    await page.getByTestId("transfer-date").getByLabel("월").fill("02");
    await page.getByTestId("transfer-date").getByLabel("일").fill("18");
    await page.getByTestId("filing-date").getByLabel("연도").fill("2026");
    await page.getByTestId("filing-date").getByLabel("월").fill("04");
    await page.getByTestId("filing-date").getByLabel("일").fill("30");

    // 점진적 노출(전부 접힘) — 입력할 섹션 펼침: ① 기본 / ② 양도 / ③ 취득
    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await expandAssetSection(page, 3);

    // 토지·농지 → 독립 나대지 → 면적 2417 → 양도가액 20억
    await page.getByRole("button", { name: "단순토지" }).click();
    await page.getByText("독립 나대지", { exact: true }).click();
    await page.getByPlaceholder("면적 입력").first().fill("2417");
    await getInputByLabel(page, "양도가액 (원)").fill("2000000000");

    // 매매 → 환산취득가
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "환산취득가" }).click();
    await page.waitForTimeout(300);

    // 취득일 1985-03-01 (< 1990-08-30) → pre1990 환산 자동 활성화
    await page.getByLabel("연도", { exact: true }).nth(2).fill("1985");
    await page.getByLabel("월", { exact: true }).nth(2).fill("03");
    await page.getByLabel("일", { exact: true }).nth(2).fill("01");
    await page.waitForTimeout(700);

    // pre1990 입력: 1990.8.30. 개별공시지가 + 토지등급 3개(등급번호 모드 기본).
    // 등급 입력은 label 기반 타겟 — placeholder는 gradeMode에 따라 "등급 번호"/"등급가액"으로 가변.
    await page.getByPlaceholder("㎡당 가액 입력").fill("100000");
    await getInputByLabel(page, "현재 등급").first().fill("100"); // 1990.8.30. 현재 등급
    await getInputByLabel(page, "직전 등급").first().fill("100"); // 1990.8.30. 직전 등급
    await getInputByLabel(page, "취득시 유효 등급").first().fill("100"); // 취득시 유효 등급

    // 양도시 기준시가: 양도시 섹션 스코프의 ㎡당 단가 222,200 (× 2417 = 537,057,400)
    await page
      .locator('div:has(> label:has-text("양도시 기준시가"))')
      .getByPlaceholder("공시지가 단가")
      .fill("222200");
    await page.waitForTimeout(300);

    // 사이드바로 단계 이동 — 자산 단계 validation이 여기서 실행됨(차단 시 이동 불가)
    await page.getByRole("button", { name: "보유 상황" }).first().click();

    // 핵심 단언 1: 과거 버그의 차단 메시지가 뜨지 않아야 (자산 validation 통과)
    await expect(page.getByText(/양도당시 개별공시지가/)).toHaveCount(0);

    // 나머지 단계 이동 후 계산
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await page.getByRole("button", { name: "가산세" }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();

    // 핵심 단언 2: 계산 결과(총 납부세액)가 렌더되어야 — 차단 없이 도달
    await page.locator('p:has-text("총 납부세액")').last().waitFor({ timeout: 15000 });
    const totalTax = await page
      .locator('p:has-text("총 납부세액")')
      .last()
      .locator("xpath=following-sibling::p[1]")
      .textContent();
    expect((totalTax ?? "").trim()).not.toBe("");

    // 핵심 단언 3 (R1-b 추출 회귀 가드): 1990 환산 산출근거 카드가 **여전히** 렌더된다.
    //   이 블록은 `TransferTaxResultView` 인라인에서 `Pre1990LandValuationDetailCard`로
    //   추출됐다(일괄 자산별 카드 재사용 목적). 추출로 단건 화면이 비면 곧바로 잡힌다.
    // 인쇄용 숨김 사본이 함께 있으므로 **가시성으로 한정**한다 (e2e/CLAUDE.md §3 —
    // .first()/.last()는 DOM 순서 가정이라 취약; 실제로 첫 매치가 hidden이었다).
    const visible = (re: string | RegExp) => page.getByText(re).filter({ visible: true });
    await expect(visible("1990.8.30. 이전 취득 토지 기준시가 환산")).toBeVisible();
    await expect(visible("취득시 등급가액")).toBeVisible();
    await expect(visible(/분모 \(min\(평균, 현재\)\)/)).toBeVisible();
  });
});
