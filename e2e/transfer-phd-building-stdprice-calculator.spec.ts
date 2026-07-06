/**
 * E2E: PHD 3시점 건물기준시가 "일괄 계산" 버튼 (양도 §164⑤) — 2026-07-06 재작성
 *
 * 계획서: docs/02-design/features/phd-building-stdprice-3point-batch-calculator.plan.md
 * (구 필드별 버튼(PR#519) → 3시점 일괄 버튼 1개로 전환. 버그 1·2·3 수정.)
 *
 * 검증:
 *   T1. 단일 주택 PHD 위젯에 "3시점 건물기준시가 일괄 계산" 버튼 1개 노출 +
 *       구 필드별 "건물 기준시가 계산" 버튼 미노출(게이팅).
 *   T2. 양도일만 설정 → 모달에서 건물정보 1회 + 양도 공시지가 입력 → 계산 →
 *       "모두 적용" 시 산출된 양도시 건물기준시가만 필드에 채워짐(취득/최초공시는 연도 미상 → 미변경).
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 * 비-worktree 실행: E2E_PORT=3000 npx playwright test e2e/transfer-phd-building-stdprice-calculator.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";

async function gotoPhdWidget(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: "주택", exact: true }).first().click();

  await expandAssetSection(page, 3);
  await page.getByRole("button", { name: "매매", exact: true }).click();
  await page.getByRole("button", { name: "환산취득가" }).click();

  await page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: "취득 당시 개별주택가격 미공시" })
    .getByRole("switch")
    .click();
}

// exact 라벨 날짜 채움 — 스위치 aria-label("…취득일 다름")의 "일" substring 오매칭 회피
async function fillDateExact(
  scope: ReturnType<Page["locator"]>,
  d: { year: string; month: string; day: string },
) {
  await scope.getByLabel("연도", { exact: true }).first().fill(d.year);
  await scope.getByLabel("월", { exact: true }).first().fill(d.month);
  await scope.getByLabel("일", { exact: true }).first().fill(d.day);
}

function phdSection(page: Page) {
  // PHD 패널 루트(bg-primary/5)로 한정 — div.rounded-md 최외곽은 섹션3까지 포함되어 날짜 스코프 오염
  return page
    .locator('div.bg-primary\\/5')
    .filter({ hasText: "주택공시가격 미공시 취득 (3-시점 환산)" })
    .first();
}

test.describe("PHD 3시점 건물기준시가 일괄 계산 (양도)", () => {
  test("T1: 일괄 계산 버튼 1개 노출 + 필드별 버튼 미노출", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoPhdWidget(page);

    const phd = phdSection(page);
    await expect(phd).toBeVisible();

    await expect(phd.getByRole("button", { name: "3시점 건물기준시가 일괄 계산" })).toHaveCount(1);
    // 구 필드별 버튼은 게이팅으로 제거됨
    await expect(phd.getByRole("button", { name: "건물 기준시가 계산" })).toHaveCount(0);
  });

  test("T2: 양도일 설정 → 모달 계산 → 모두 적용 → 양도시 필드만 채움", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoPhdWidget(page);

    // 양도일 2025 (양도연도 도출) — 취득일·최초고시일 미설정 → 두 시점 계산 제외
    await page.getByTestId("transfer-date").getByLabel("연도", { exact: true }).fill("2025");
    await page.getByTestId("transfer-date").getByLabel("월", { exact: true }).fill("05");
    await page.getByTestId("transfer-date").getByLabel("일", { exact: true }).fill("01");

    const phd = phdSection(page);
    await phd.getByRole("button", { name: "3시점 건물기준시가 일괄 계산" }).click();

    const modal = page.getByRole("dialog").filter({ hasText: "3시점 건물 기준시가 일괄 계산" });
    await expect(modal).toBeVisible();

    // 건물 정보 1회
    await modal.getByText("구조 선택").first().click();
    await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
    await modal.getByText("용도 선택").first().click();
    await page.getByRole("option", { name: /아파트/ }).first().click();
    await modal.getByPlaceholder("연면적").fill("100");
    await modal.getByPlaceholder("신축연도 (4자리)").fill("2010");

    // 양도시 공시지가만 입력 (취득/최초공시는 연도 미상) — 시점별 원/㎡ 3칸 중 마지막=양도
    await modal.getByPlaceholder("원/㎡").last().fill("3486000");

    await modal.getByRole("button", { name: "3시점 계산하기" }).click();

    // 양도시 산출값 노출 + "모두 적용 (1개 시점)"
    const applyBtn = modal.getByRole("button", { name: /모두 적용/ });
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toContainText("1개");
    await applyBtn.click();
    await expect(modal).toBeHidden();

    // 양도시 건물기준시가 필드 채워짐(값 > 0), 취득시는 빈 값 유지
    const transferBuildingInput = phd
      .getByText("국세청 건물기준시가 (원) — 양도·취득 당시 기준시가", { exact: true })
      .last()
      .locator("xpath=preceding::input[1]");
    await expect(transferBuildingInput).not.toHaveValue("");
    const acqBuildingInput = phd
      .getByText("국세청 건물기준시가 (원) — 양도·취득 당시 기준시가", { exact: true })
      .first()
      .locator("xpath=preceding::input[1]");
    await expect(acqBuildingInput).toHaveValue("");
  });

  test("T3: 단독주택 3시점(취득 2003·최초고시 2005·양도 2025) 모두 계산·적용", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일 2025
    await fillDateAndVerify(page, { year: "2025", month: "05", day: "01" }, {
      scope: page.getByTestId("transfer-date"),
    });

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).first().click();

    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("button", { name: "환산취득가" }).click();

    // 취득일 2003 (< 2005.4.29 → 개별주택가격 미공시 PHD 자동 활성)
    await fillDateExact(page.locator('[data-asset-card-index="0"] [data-asset-section="3"]'), {
      year: "2003",
      month: "06",
      day: "15",
    });

    // PHD 토글이 자동 체크 안됐으면 수동 ON
    const phdToggle = page
      .locator('[data-slot="toggle-card"]')
      .filter({ hasText: "취득 당시 개별주택가격 미공시" })
      .getByRole("switch");
    if ((await phdToggle.getAttribute("aria-checked")) !== "true") {
      await phdToggle.click();
    }

    const phd = phdSection(page);
    await expect(phd).toBeVisible();

    // 최초 고시일 2005-04-30 (PHD 섹션 내 유일한 DateInput)
    await fillDateExact(phd, { year: "2005", month: "04", day: "30" });

    // 일괄 계산 모달
    await phd.getByRole("button", { name: "3시점 건물기준시가 일괄 계산" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "3시점 건물 기준시가 일괄 계산" });
    await expect(modal).toBeVisible();

    await modal.getByText("구조 선택").first().click();
    await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
    await modal.getByText("용도 선택").first().click();
    await page.getByRole("option", { name: /단독|다가구|주택/ }).first().click();
    await modal.getByPlaceholder("연면적").fill("150");
    await modal.getByPlaceholder("신축연도 (4자리)").fill("2000");

    // 시점별 공시지가 3칸(취득/최초공시/양도)
    const landInputs = modal.getByPlaceholder("원/㎡");
    await landInputs.nth(0).fill("2000000");
    await landInputs.nth(1).fill("2200000");
    await landInputs.nth(2).fill("3486000");

    await modal.getByRole("button", { name: "3시점 계산하기" }).click();

    // 3시점 모두 산출 → "모두 적용 (3개 시점)"
    const applyBtn = modal.getByRole("button", { name: /모두 적용/ });
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toContainText("3개");

    // 산출값 로깅(관찰용)
    const shown = await modal.locator("span.font-mono").allInnerTexts();
    console.log("[T3] 3시점 산출값:", shown.join(" / "));

    await applyBtn.click();
    await expect(modal).toBeHidden();

    // 3개 건물기준시가 필드 모두 채워짐(빈 값 아님)
    const buildingInputs = phd
      .getByText("국세청 건물기준시가 (원) — 양도·취득 당시 기준시가", { exact: true })
      .locator("xpath=preceding::input[1]");
    await expect(buildingInputs.nth(0)).not.toHaveValue("");
    await expect(buildingInputs.nth(1)).not.toHaveValue("");
    await expect(buildingInputs.nth(2)).not.toHaveValue("");
    const values = await buildingInputs.allInnerTexts().catch(() => []);
    const vals2 = await Promise.all(
      [0, 1, 2].map((i) => buildingInputs.nth(i).inputValue()),
    );
    console.log("[T3] 적용된 3필드 값:", vals2.join(" / "), values);
  });

  test("T4: 겸용 PHD — 일괄 모달 주택/상가 UI 렌더 + 양도 상가건물 산출", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일 2025 · 취득일 2010(≥2001)
    await fillDateAndVerify(page, { year: "2025", month: "05", day: "01" }, {
      scope: page.getByTestId("transfer-date"),
    });

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).first().click();

    // 겸용주택 분리계산 ON (자산 카드 상단 — section 1 열린 상태)
    await page.getByRole("switch", { name: "겸용주택 분리계산" }).click();

    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("button", { name: "환산취득가" }).click();

    await fillDateExact(page.locator('[data-asset-card-index="0"] [data-asset-section="3"]'), {
      year: "2010",
      month: "06",
      day: "15",
    });

    // 면적 입력 (겸용 확장 패널)
    await page.getByPlaceholder("양도시 주거용 합계 면적").fill("120");
    await page.getByPlaceholder("양도시 비주택 합계 면적").fill("80");
    await page.getByPlaceholder("건축물대장의 건축면적").fill("100");

    // PHD(개별주택가격 미공시) ON
    await page.getByRole("switch", { name: /개별주택가격 미공시/ }).click();

    // 겸용 PHD 일괄 버튼 (주택·상가 라벨)
    const batchBtn = page.getByRole("button", { name: "3시점 주택·상가 건물기준시가 일괄 계산" });
    await expect(batchBtn).toHaveCount(1);
    await batchBtn.click();

    const modal = page.getByRole("dialog").filter({ hasText: "3시점 건물 기준시가 일괄 계산" });
    await expect(modal).toBeVisible();
    // 겸용 UI: 부분 추가 + 카테고리(주택/상가)
    await expect(modal.getByRole("button", { name: "+ 부분 추가" })).toHaveCount(1);
    await expect(modal.getByRole("button", { name: "상가", exact: true }).first()).toBeVisible();

    // 신축연도 + 부분1 주택
    await modal.getByPlaceholder("신축연도 (4자리)").fill("2010");
    await modal.getByText("구조 선택").first().click();
    await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
    await modal.getByText("용도 선택").first().click();
    await page.getByRole("option", { name: /단독|다가구|주택/ }).first().click();
    await modal.getByPlaceholder("연면적").first().fill("120");

    // 부분2 상가
    await modal.getByRole("button", { name: "+ 부분 추가" }).click();
    // 두 번째 행 카테고리 상가로
    await modal.getByRole("button", { name: "상가", exact: true }).nth(1).click();
    await modal.getByText("구조 선택").first().click();
    await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
    await modal.getByText("용도 선택").first().click();
    await page.getByRole("option", { name: /근린생활/ }).first().click();
    await modal.getByPlaceholder("연면적").last().fill("80");

    // 양도 공시지가
    await modal.getByPlaceholder("원/㎡").last().fill("3486000");

    await modal.getByRole("button", { name: "3시점 계산하기" }).click();

    // 양도시 상가건물 산출 노출 + 모두 적용
    await expect(modal.getByText("양도시 상가건물 기준시가")).toBeVisible();
    const applyBtn = modal.getByRole("button", { name: /모두 적용/ });
    await expect(applyBtn).toBeVisible();
    const shown = await modal.locator("span.font-mono").allInnerTexts();
    console.log("[T4] 겸용 산출값:", shown.join(" / "));
    await applyBtn.click();
    await expect(modal).toBeHidden();
  });
});
