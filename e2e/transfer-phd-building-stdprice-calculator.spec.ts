/**
 * E2E: 3시점 PHD 건물 기준시가 "계산기" 버튼 활성화 (양도) — 2026-07-06
 *
 * 계획서: docs/02-design/features/phd-three-point-building-std-price-calculator.plan.md
 *
 * 검증:
 *   T1. 개별주택가격 미공시(§164⑤) 3-시점 위젯의 각 건물기준시가 필드 옆에
 *       "건물 기준시가 계산" 버튼이 노출되고(3시점 = 3개), 클릭 시 양도 모드 모달이 열린다
 *       (lockedTaxType="transfer" → 세목 라디오 숨김).
 *   T2. 취득시 섹션에서 모달 계산(양도 2시점) → "취득시 적용" 클릭 시
 *       취득시 건물기준시가 CurrencyInput에 산정 금액이 자동 채워진다(onApply 배선).
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 * 비-worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-phd-building-stdprice-calculator.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

// 양도세 마법사 → 주택 자산 + 환산취득가 + PHD §164⑤ 토글 ON → 3시점 위젯 노출
async function gotoPhdWidget(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  // ① 기본 — 자산 종류 주택(기본값일 수 있으나 명시)
  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: "주택", exact: true }).first().click();

  // ③ 취득 — 매매 → 환산취득가 (useEstimatedAcquisition ON)
  await expandAssetSection(page, 3);
  await page.getByRole("button", { name: "매매", exact: true }).click();
  await page.getByRole("button", { name: "환산취득가" }).click();

  // PHD §164⑤ ToggleCard ON
  await page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: "취득 당시 개별주택가격 미공시" })
    .getByRole("switch")
    .click();
}

// PHD 3시점 위젯 루트 스코프 (헤더 텍스트로 한정)
function phdSection(page: Page) {
  return page
    .locator("div.rounded-md")
    .filter({ hasText: "주택공시가격 미공시 취득 (3-시점 환산)" })
    .first();
}

test.describe("PHD 3시점 건물 기준시가 계산기 버튼 (양도)", () => {
  test("T1: 3시점 건물기준시가 필드에 계산기 버튼 노출 + 양도 모드 모달 열림", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoPhdWidget(page);

    const phd = phdSection(page);
    await expect(phd).toBeVisible();

    // 3시점(취득·최초공시·양도) 각각에 "건물 기준시가 계산" 버튼 → 3개
    const calcButtons = phd.getByRole("button", { name: "건물 기준시가 계산" });
    await expect(calcButtons).toHaveCount(3);

    // 취득시(첫 번째) 버튼 클릭 → 양도 모드 모달 열림
    await calcButtons.first().click();
    const modal = page.getByRole("dialog").filter({ hasText: "계산 후 적용할 시점의 금액" });
    await expect(modal).toBeVisible();

    // lockedTaxType="transfer" → 세목 라디오("상속·증여") 미노출 확인
    await expect(modal.getByText("상속·증여", { exact: false })).toHaveCount(0);

    // 양도 모드 = 취득·양도 2시점 계산 버튼 존재
    await expect(modal.getByRole("button", { name: "기준시가 계산하기" })).toBeVisible();
  });

  test("T2: 취득시 모달 계산 → '취득시 적용' → 취득시 건물기준시가 필드 자동 채움", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await gotoPhdWidget(page);

    const phd = phdSection(page);
    await phd.getByRole("button", { name: "건물 기준시가 계산" }).first().click();

    const modal = page.getByRole("dialog").filter({ hasText: "계산 후 적용할 시점의 금액" });
    await expect(modal).toBeVisible();

    // 양도 2시점 계산 (building-standard-price.spec BSP-06 패턴)
    await modal.getByPlaceholder("신축연도 (4자리)").fill("2010");
    await modal.getByPlaceholder("건물 연면적").fill("100");

    // 취득연도(첫 연도 Select) 2015
    await modal.getByText("연도 선택").first().click();
    await page.getByRole("option", { name: "2015년" }).first().click();

    // 취득 구조·용도
    await modal.getByText("구조 선택").first().click();
    await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
    await modal.getByText("용도 선택").first().click();
    await page.getByRole("option", { name: /아파트/ }).first().click();
    await modal.getByPlaceholder("원/㎡").first().fill("5000000");

    // 양도연도 (취득분 선택 후 남은 "연도 선택" = .first()) — 미선택 시 양도 구조/용도가 disabled
    await modal.getByText("연도 선택").first().click();
    await page.getByRole("option", { name: "2025년" }).first().click();

    // 양도 구조·용도 (취득분 선택 후 남은 "구조/용도 선택" = .first())
    await modal.getByText("구조 선택").first().click();
    await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
    await modal.getByText("용도 선택").first().click();
    await page.getByRole("option", { name: /아파트/ }).first().click();
    await modal.getByPlaceholder("원/㎡").nth(1).fill("7500000");

    await modal.getByRole("button", { name: "기준시가 계산하기" }).click();

    // "취득시 적용 (금액)" 버튼 노출 → 금액 캡처 후 적용
    const applyBtn = modal.getByRole("button", { name: /취득시 적용/ });
    await expect(applyBtn).toBeVisible();
    const label = await applyBtn.innerText();
    const amount = label.match(/\(([\d,]+)\)/)?.[1];
    expect(amount).toBeTruthy();

    await applyBtn.click();
    await expect(modal).toBeHidden();

    // 취득시(첫 번째) 건물기준시가 CurrencyInput에 산정 금액 반영.
    // FieldCard 구조(라벨→입력→hint) — 건물기준시가 hint 바로 앞 input이 해당 필드.
    const acqBuildingInput = phd
      .getByText("국세청 건물기준시가 (원) — 양도·취득 당시 기준시가", { exact: true })
      .first()
      .locator("xpath=preceding::input[1]");
    await expect(acqBuildingInput).toHaveValue(amount!);
  });
});
