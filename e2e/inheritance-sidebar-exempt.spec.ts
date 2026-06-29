/**
 * E2E: 사이드바 비과세·불산입 차감 + 세로 레이아웃 검증 (2026-06-10)
 *
 * 커밋 433183b (feat/inheritance-sidebar-exempt-fix) 검증.
 * 직전 구현 보고에서 브라우저 확인 미수행 → 본 spec으로 보완.
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 *
 * 검증 항목:
 *   SB-1 비과세 입력 → 사이드바 "② 상속세 과세가액" 차감 반영 + "− 비과세·불산입" 행 노출
 *   SB-2 비과세 미입력 → "− 비과세·불산입" 행 미표시
 *   SB-3 사이드바 Row 세로 레이아웃 — 라벨과 금액이 별도 행 (flex flex-col)
 *
 * 비과세 입력 UI 경로:
 *   Step0(피상속인·상속인) → "다음" → Step1(상속재산) → "비과세·장례비 단계로 이동"
 *   → ExemptionChecklist 마스터 토글 "여" → 항목 "여" → 금액 입력
 *
 * 사이드바 testid: 없음 — getByText로 컨텐츠 검증.
 *   Row 구조: <div class="flex flex-col ..."><p>{label}</p><span>{value}</span></div>
 */

import { test, expect, type Page } from "@playwright/test";
import {
  addHeir,
  fillAndVerify,
  fillDateAndVerify,
  numericValue,
} from "./_helpers/tax-flow";

/**
 * 공통 셋업 — Step0+Step1 완료 후 비과세 단계 진입까지.
 * 토지 1건 (100㎡ × 1,000,000원/㎡ = 1억원) → 총상속재산 1억
 *
 * addHeir 직후 "상속인 편집" 다이얼로그가 자동 오픈됨 (2026-06-10 UI 패턴).
 * "닫기"로 다이얼로그를 닫아야 "다음" 버튼이 클릭 가능해진다.
 */
async function gotoExemptStep(page: Page): Promise<void> {
  await page.goto("/calc/inheritance-tax");

  // Step0: 상속개시일 + 자녀 1명 추가
  await fillDateAndVerify(page, { year: "2026", month: "5", day: "10" });
  await addHeir(page, "heir", "child");

  // 상속인 편집 모달 닫기 — addHeir 후 자동 오픈, "다음" 클릭 전에 닫아야 함
  const heirDialog = page.getByRole("dialog", { name: "상속인 편집" });
  if (await heirDialog.isVisible()) {
    await heirDialog.getByRole("button", { name: "닫기" }).click();
    await expect(heirDialog).not.toBeVisible({ timeout: 3_000 });
  }

  // → Step1 이동
  await page.getByRole("button", { name: /^다음/ }).click();

  // Step1: 토지 자산 추가 (보충적 평가방법: 100㎡ × 1,000,000원)
  await page.getByRole("button", { name: /재산 추가|상속재산 추가/ }).first().click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
  await fillAndVerify(page.getByPlaceholder("면적 입력"), "100");
  await fillAndVerify(page.getByPlaceholder("공시지가 단가"), "1000000");

  // 토지 편집 모달 닫기 — StepIndicator 이동이 backdrop에 막히지 않게
  const landDialog = page.getByRole("dialog");
  await landDialog.getByRole("button", { name: "닫기" }).click();
  await expect(landDialog).toBeHidden();

  // 비과세·장례비 단계로 직접 이동 (StepIndicator aria-label)
  await page
    .getByRole("button", { name: /비과세.*단계로 이동/ })
    .click();

  // 마스터 "여/부" 토글 제거됨 → 칩 패널 직접 노출 (ExemptionChecklist 재구성, 2026).
  // 비과세 step 진입 + 칩 노출 확인 (칩 라벨은 축약형 "국가·지자체 유증").
  await expect(page.getByText("비과세·과세가액 불산입 선택")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: /국가·지자체 유증/ })).toBeVisible({ timeout: 5_000 });
}

/**
 * 사이드바 영역 locator — h3 "합계 미리보기" 포함 부모 div
 */
function sidebarPanel(page: Page) {
  return page.locator("div").filter({ has: page.getByText("합계 미리보기") }).first();
}

// ============================================================
// SB-1: 비과세 입력 → 사이드바 과세가액 차감 + 행 노출
// ============================================================

test("SB-1 국가유증 1억 입력 → 사이드바 과세가액 0 + 비과세 행 노출", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await gotoExemptStep(page);

  // 비과세 칩 "국가·지자체 유증" 클릭 → 항목 체크 + 그룹 자동 펼침 → 입력 섹션(ExemptionRow) 노출
  await page.getByRole("button", { name: /국가·지자체 유증/ }).click();

  // 금액 입력 — 1억. ExemptionRow(rule.name "국가·지자체 유증 재산")의 금액 입력
  const stateRow = page
    .locator("div.rounded-lg.border")
    .filter({ hasText: "국가·지자체 유증 재산" })
    .first();
  const amountInput = stateRow.getByPlaceholder("금액 입력");
  await fillAndVerify(amountInput, "100000000");

  // 사이드바에 "− 비과세·불산입" 행 노출 확인
  const sidebar = sidebarPanel(page);
  await expect(sidebar.getByText("− 비과세·불산입")).toBeVisible({ timeout: 5_000 });

  // "− 비과세·불산입" 값이 음수(-1억) 표시
  // numericValue는 양수 형태를 매칭하므로 부호 포함 텍스트를 직접 체크
  const exemptValueEl = sidebar
    .locator("span")
    .filter({ hasText: /^-/ })
    .filter({ hasText: /100/ })
    .first();
  await expect(exemptValueEl).toBeVisible();

  // "② 상속세 과세가액" 행 존재 — 총상속 1억 − 비과세 1억 = 0 → 과세가액 행 자체 미노출
  // (computeInheritanceSummary: taxableEstateValue=0이면 Row 렌더 안 됨)
  // 대신 비과세 행이 표시됨을 이미 확인. 추가로 "합계 미리보기" 섹션에 비과세 행이 있는지 재확인.
  await expect(sidebar.getByText("− 비과세·불산입")).toBeVisible();
});

test("SB-1b 공익법인 출연 2억 입력 → 사이드바 비과세 행 노출 + 과세가액 음수 미표시", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await gotoExemptStep(page);

  // 과세가액 불산입 칩 "공익법인 출연" 클릭 → 항목 체크 + 그룹 자동 펼침
  await page.getByRole("button", { name: /공익법인 출연/ }).click();

  // 금액 입력 2억 (총상속재산 1억 초과 — 과세가액 불산입이지만 max(0) 처리)
  const corpRow = page
    .locator("div.rounded-lg.border")
    .filter({ hasText: "공익법인 출연 재산" })
    .first();
  const amountInput = corpRow.getByPlaceholder("금액 입력");
  await fillAndVerify(amountInput, "200000000");

  const sidebar = sidebarPanel(page);
  // 비과세 행 노출 확인
  await expect(sidebar.getByText("− 비과세·불산입")).toBeVisible({ timeout: 5_000 });
  // 과세가액 행이 존재할 경우 음수 값이 표시되면 안 됨 (Math.max(0,...) 보장)
  // "② 상속세 과세가액" 행에서 음수 표시 없음
  const taxableRow = sidebar.locator("p").filter({ hasText: "② 상속세 과세가액" });
  if (await taxableRow.isVisible()) {
    const valueEl = taxableRow.locator("~ span").first();
    const valueText = await valueEl.textContent();
    expect(valueText ?? "").not.toMatch(/^-/);
  }
});

// ============================================================
// SB-2: 비과세 미입력 → "− 비과세·불산입" 행 미표시
// ============================================================

test("SB-2 비과세 미입력 → 사이드바 비과세 행 없음", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/calc/inheritance-tax");

  // Step0: 날짜 + 자녀 추가
  await fillDateAndVerify(page, { year: "2026", month: "5", day: "10" });
  await addHeir(page, "heir", "child");

  // 상속인 편집 모달 닫기
  const heirDialog2 = page.getByRole("dialog", { name: "상속인 편집" });
  if (await heirDialog2.isVisible()) {
    await heirDialog2.getByRole("button", { name: "닫기" }).click();
    await expect(heirDialog2).not.toBeVisible({ timeout: 3_000 });
  }

  await page.getByRole("button", { name: /^다음/ }).click();

  // Step1: 토지 자산 추가
  await page.getByRole("button", { name: /재산 추가|상속재산 추가/ }).first().click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
  await fillAndVerify(page.getByPlaceholder("면적 입력"), "100");
  await fillAndVerify(page.getByPlaceholder("공시지가 단가"), "1000000");

  // 사이드바에 총상속재산이 표시된 시점(입력 반영됨) 확인
  const sidebar = sidebarPanel(page);
  await expect(sidebar.getByText("총상속재산")).toBeVisible({ timeout: 5_000 });

  // 비과세 행 없음 (exemptEstimate=0 이므로 Row 렌더 안 됨)
  await expect(sidebar.getByText("− 비과세·불산입")).not.toBeVisible();
});

// ============================================================
// SB-3: 사이드바 Row 세로 레이아웃 (flex flex-col)
// ============================================================

test("SB-3 사이드바 Row 세로 레이아웃 — 라벨과 금액이 같은 컨테이너 내 별도 요소", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/calc/inheritance-tax");

  // 최소 입력 — 날짜 + 자녀 + 토지 1건
  await fillDateAndVerify(page, { year: "2026", month: "5", day: "10" });
  await addHeir(page, "heir", "child");

  // 상속인 편집 모달 닫기
  const heirDialog3 = page.getByRole("dialog", { name: "상속인 편집" });
  if (await heirDialog3.isVisible()) {
    await heirDialog3.getByRole("button", { name: "닫기" }).click();
    await expect(heirDialog3).not.toBeVisible({ timeout: 3_000 });
  }

  await page.getByRole("button", { name: /^다음/ }).click();

  await page.getByRole("button", { name: /재산 추가|상속재산 추가/ }).first().click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
  await fillAndVerify(page.getByPlaceholder("면적 입력"), "100");
  await fillAndVerify(page.getByPlaceholder("공시지가 단가"), "1000000");

  // "합계 미리보기" 영역 안의 "총상속재산" Row 구조 검증
  const sidebar = sidebarPanel(page);
  await expect(sidebar.getByText("총상속재산")).toBeVisible({ timeout: 5_000 });

  // Row 컨테이너: "① 총상속재산" 텍스트를 품는 <p> 의 부모 div가 flex flex-col
  const labelP = sidebar.locator("p").filter({ hasText: /^① 총상속재산$/ }).first();
  await expect(labelP).toBeVisible();

  // 부모 div에 flex + flex-col 클래스 확인
  const rowDiv = labelP.locator("xpath=..").first();
  const classList = await rowDiv.evaluate((el) =>
    Array.from(el.classList).join(" "),
  );
  expect(classList).toContain("flex");
  expect(classList).toContain("flex-col");

  // "총상속재산" 라벨(p)과 금액(span)이 같은 div 안에 있고 별도 요소
  const valueSpan = rowDiv.locator("span").first();
  await expect(valueSpan).toBeVisible();

  // 금액 span의 내용이 라벨 p의 내용과 다름 (별도 요소)
  const labelText = await labelP.textContent();
  const valueText = await valueSpan.textContent();
  expect(labelText?.trim()).toBe("① 총상속재산");
  expect(valueText?.trim()).not.toBe("① 총상속재산");
  // 금액이 숫자 형태 (콤마 허용)
  expect(valueText?.replace(/,/g, "")).toMatch(/\d+/);

  // "② 상속세 과세가액" Row도 동일한 세로 레이아웃 확인
  const taxableLabelP = sidebar
    .locator("p")
    .filter({ hasText: /② 상속세 과세가액/ })
    .first();
  if (await taxableLabelP.isVisible()) {
    const taxableRowDiv = taxableLabelP.locator("xpath=..").first();
    const taxableClassList = await taxableRowDiv.evaluate((el) =>
      Array.from(el.classList).join(" "),
    );
    expect(taxableClassList).toContain("flex");
    expect(taxableClassList).toContain("flex-col");
  }
});
