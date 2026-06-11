/**
 * 취득세 E2E — R1 수정 검증
 *
 * 대상 케이스:
 * 1. 황금 경로 — 주택 매매 1주택자(6억) 기본세율 1% 결과 확인
 * 2. 일시적 2주택 validation 차단 — 지역 미선택 시 "다음" 차단 (R1 M-3 신규)
 * 3. 과점주주 상장법인 비과세 — 유가증권·코스닥 상장 토글 ON → 비과세 결과 (R1 Phase 4)
 *
 * NOTE:
 * - INITIAL_FORM 기본값: propertyType=housing, acquisitionCause=purchase, acquiredBy=individual
 * - individual 기본에서 Step4(법인·특수) skip → Step3→Step5 직접 이동
 * - TaxHelp(ⓘ) trailing이 있는 ToggleCard의 switch는 accessible name이 없음
 *   → getByRole("switch", { name: /.../ }) 대신 card-level locator 사용
 *
 * 실행: E2E_PORT=3100 npx playwright test e2e/acquisition-tax.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { fillAndVerify } from "./_helpers/tax-flow";

/** ToggleCard를 card title text로 찾아 내부 switch를 반환 */
function toggleSwitch(page: Page, titleText: string | RegExp) {
  return page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: titleText })
    .getByRole("switch");
}

/** 취득세 API 응답 대기 + 결과 텍스트 확인 */
async function calcAcquisitionAndWait(
  page: Page,
  opts: { resultText?: string | RegExp; timeout?: number } = {},
) {
  // AcquisitionTaxResultView: "납부세액 합계" (미감면) 또는 "최종 납부세액" (감면 후)
  const resultText = opts.resultText ?? /납부세액 합계|최종 납부세액/;
  const timeout = opts.timeout ?? 30_000;

  const calcResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/calc/acquisition") && r.request().method() === "POST",
    { timeout },
  );
  await page.getByRole("button", { name: /취득세 계산/ }).click();
  const resp = await calcResponse;
  expect(resp.ok(), `취득세 계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  await expect(page.getByText(resultText).first()).toBeVisible({ timeout });
}

// ─────────────────────────────────────────────────────────────────
// 1. 황금 경로 — 주택 매매 1주택자 6억
// ─────────────────────────────────────────────────────────────────
test.describe("취득세 — 황금 경로", () => {
  test("주택 매매 1주택자(6억) → 기본세율 1% 취득세 6,000,000원 결과", async ({
    page,
  }) => {
    await page.goto("/calc/acquisition-tax");

    // Step 0: 취득 정보 — 기본값(주택 매매 개인)에 취득가액만 입력
    await fillAndVerify(
      page.getByPlaceholder("계약서상 거래금액"),
      "600000000",
    );
    await page.getByRole("button", { name: /다음/ }).click();

    // Step 1: 물건 상세 — 전용면적 placeholder 노출 확인 후 다음
    await expect(
      page.getByPlaceholder("85㎡ 이하이면 농특세 면제"),
    ).toBeVisible();
    await page.getByRole("button", { name: /다음/ }).click();

    // Step 2: 주택 현황 — 기본값 1주택 그대로, 다음
    await expect(page.getByText("취득 후 보유 주택 수")).toBeVisible();
    await page.getByRole("button", { name: /다음/ }).click();

    // Step 3: 중과 분기 — "조정대상지역 내 주택" 카드 노출 확인 후 다음
    // (individual 기본 → Step4 skip → Step3→Step5)
    await expect(
      page.locator('[data-slot="toggle-card"]').filter({ hasText: "조정대상지역 내 주택" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /다음/ }).click();

    // Step 5: 감면 확인 → 취득세 계산
    await calcAcquisitionAndWait(page);

    // 결과 확인: "납부세액 합계" + 6,000,000원
    await expect(page.getByText(/납부세액 합계|최종 납부세액/).first()).toBeVisible();
    await expect(page.getByText(/6,000,000/).first()).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────
// 2. 일시적 2주택 validation 차단 (R1 M-3 신규 — lib/calc/acquisition-tax-validate.ts)
// ─────────────────────────────────────────────────────────────────
test.describe("취득세 — 일시적 2주택 validation", () => {
  test("지역 미선택 시 다음 차단 → 선택 후 통과", async ({ page }) => {
    await page.goto("/calc/acquisition-tax");

    // Step 0 — 2주택 시나리오 (취득가액 8억)
    await fillAndVerify(
      page.getByPlaceholder("계약서상 거래금액"),
      "800000000",
    );
    await page.getByRole("button", { name: /다음/ }).click();

    // Step 1 — 다음
    await expect(
      page.getByPlaceholder("85㎡ 이하이면 농특세 면제"),
    ).toBeVisible();
    await page.getByRole("button", { name: /다음/ }).click();

    // Step 2 — 2주택 선택
    await expect(page.getByText("취득 후 보유 주택 수")).toBeVisible();
    await page
      .locator("select")
      .filter({ has: page.locator("option", { hasText: "1주택 (기본세율)" }) })
      .selectOption("2");
    await page.getByRole("button", { name: /다음/ }).click();

    // Step 3 — "일시적 2주택" 토글 ON (isMultiHouse=true 시 노출)
    const tmpSwitch = toggleSwitch(page, /일시적 2주택/);
    await expect(tmpSwitch).toBeVisible();
    await tmpSwitch.click();

    // 지역 미선택 상태에서 다음 클릭 → 오류 차단 (<p class="text-sm text-destructive">)
    await page.getByRole("button", { name: /다음/ }).click();
    // 에러 메시지: "일시적 2주택 — 종전 주택 소재 지역(조정/비조정)을 선택하세요."
    const errMsg = page.locator("p.text-destructive", {
      hasText: /일시적 2주택.*종전 주택/,
    });
    await expect(errMsg).toBeVisible();

    // 종전·신규 지역 선택 후 통과 확인
    // "종전 주택 소재 지역" 섹션 안 라디오
    const prevRegionSection = page.locator("div", { hasText: "종전 주택 소재 지역" }).last();
    await prevRegionSection.getByRole("radio", { name: "조정대상지역" }).check();
    // "신규 주택 소재 지역" 섹션 안 라디오
    const newRegionSection = page.locator("div", { hasText: "신규 주택 소재 지역" }).last();
    await newRegionSection.getByRole("radio", { name: "비조정지역" }).check();

    // 다음 클릭 → Step5 진행 (오류 메시지 사라짐 or not present)
    await page.getByRole("button", { name: /다음/ }).click();
    // 오류 메시지가 사라지면 통과 (Step5 진입 확인)
    await expect(errMsg).toBeHidden({ timeout: 5_000 });
  });
});

// ─────────────────────────────────────────────────────────────────
// 3. 과점주주 상장법인 비과세 (R1 Phase 4 — 지방세기본법 §46)
// ─────────────────────────────────────────────────────────────────
test.describe("취득세 — 과점주주 상장법인 비과세", () => {
  test("유가증권·코스닥 상장법인 토글 ON → 비과세 계산 완료", async ({
    page,
  }) => {
    await page.goto("/calc/acquisition-tax");

    // Step 0 — 간주취득 과점주주 선택 (물건유형 자동=건물)
    await page.locator("select").nth(1).selectOption("deemed_major_shareholder");
    await page.getByRole("button", { name: /다음/ }).click();

    // Step 1 — 과점주주 상세 패널
    await expect(page.getByText("과점주주 간주취득 상세")).toBeVisible();

    // 유가증권·코스닥 상장법인 토글 ON
    const listedSwitch = toggleSwitch(page, /유가증권시장·코스닥 상장법인/);
    await expect(listedSwitch).toBeVisible();
    await listedSwitch.click();

    // 상장법인 비과세 안내 텍스트 노출
    await expect(
      page.getByText(/유가증권시장·코스닥시장 상장법인.*과세 대상이 아닙니다/),
    ).toBeVisible();

    // 취득세 계산 (상장법인 = 비과세)
    await calcAcquisitionAndWait(page, {
      resultText: /취득세 결정세액|비과세|0/,
    });
  });
});
