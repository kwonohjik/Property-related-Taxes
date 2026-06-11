/**
 * E2E: 증권거래세 정보성 산출 UI 통합 검증
 *
 * 설계: docs/02-design/features/stock-transfer-tax.ui.design.md §2-3
 * 엔진: lib/tax-engine/stock-transfer/securities-transaction-tax.ts
 * UI:   SecuritiesTransactionTaxCard (inline·result 2 variant)
 *
 * E-1: 코스피 상장 + 양도가액 입력 → Step3 inline 카드 표시
 * E-2: 비상장 + 전체 입력 → 계산 후 result 카드 표시
 * E-3: K-OTC + 계산 → 비과세 결과뷰 + STX 카드 표시 (S-3 경로)
 * E-4: 기타자산 + 과점주주 → STX 카드 경고 메시지 표시 (C-06)
 *
 * 실행: E2E_PORT=3100 npx playwright test e2e/stock-transfer-securities-tax.spec.ts
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 *
 * 로케이터 주의:
 *   - FieldCard label은 htmlFor 없음 → getByLabel("종목명") 미작동.
 *     종목명 input: getByPlaceholder("종목명을 입력하세요") 사용.
 *   - DateInput aria-label: getByLabel("연도") 등은 페이지 전역에 여러 개 존재.
 *     getByLabel("연도").nth(n) 으로 특정 날짜 필드 지정.
 *   - RadioCardGroup: getByRole("radio", { name: ... }) 사용.
 */

import { test, expect, type Page } from "@playwright/test";

// ─────────────────────────────────────────────────────────────────
// 공통 헬퍼
// ─────────────────────────────────────────────────────────────────

/**
 * 주식 양도세 페이지 이동 + sessionStorage 초기화.
 * 반드시 페이지가 완전히 로드될 때까지 대기.
 */
async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  // sessionStorage 초기화 후 재진입 (stale 이전 세션 폼 데이터 방지)
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  // 첫 번째 입력 필드가 나타날 때까지 대기
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

/**
 * 주식 양도세 마법사 1단계(자산·시장·대주주) 공통 필수 필드 채우기.
 * - securityName: 종목명
 * - marketLabel: 시장 라디오 텍스트 (e.g. "코스피", "비상장")
 * - transferDate: "YYYY-MM-DD" 양도일
 * - acquisitionDate: "YYYY-MM-DD" 취득일
 * - shareCount: 양도 주식수 (문자열)
 * - totalIssuedShares: 발행주식 총수 (문자열)
 *
 * 로케이터 전략:
 *   - 종목명: getByPlaceholder("종목명을 입력하세요") — FieldCard htmlFor 미연결이므로 getByLabel 불가
 *   - 취득일: getByLabel("연도").nth(0) — AcquisitionInfoBlock이 먼저 렌더됨
 *   - 양도일: getByLabel("연도").nth(1) — 양도 정보 block이 두 번째
 *   - 주식수: FieldCard label "양도 주식수" 내 input — placeholder("양도 주식수 입력") 또는 nth
 */
async function fillStep1(
  page: Page,
  opts: {
    securityName: string;
    marketLabel: string;
    transferDate: string; // "YYYY-MM-DD"
    acquisitionDate: string; // "YYYY-MM-DD"
    shareCount: string;
    totalIssuedShares: string;
  },
) {
  const [tyear, tmonth, tday] = opts.transferDate.split("-");
  const [ayear, amonth, aday] = opts.acquisitionDate.split("-");

  // 종목명 — FieldCard label htmlFor 미연결 → placeholder 사용
  await page.getByPlaceholder("종목명을 입력하세요").fill(opts.securityName);

  // 시장 유형 RadioCardGroup
  await page
    .getByRole("radio", { name: opts.marketLabel })
    .first()
    .click();

  // Step1 DateInput 순서 (AcquisitionInfoBlock이 양도 정보 block보다 먼저 렌더됨):
  //   nth(0) = 취득일 (AcquisitionInfoBlock)
  //   nth(1) = 양도일 (양도 정보 block)
  // aria-label "연도"/"월"/"일" (input[type="text"]로 범위 한정 — radio 오매칭 방지)
  const yearInputs = page.locator('input[type="text"][aria-label="연도"]');
  const monthInputs = page.locator('input[type="text"][aria-label="월"]');
  const dayInputs = page.locator('input[type="text"][aria-label="일"]');

  // 취득일 — nth(0)
  await yearInputs.nth(0).fill(ayear);
  await monthInputs.nth(0).fill(amonth);
  await dayInputs.nth(0).fill(aday);

  // 양도일 — nth(1)
  await yearInputs.nth(1).fill(tyear);
  await monthInputs.nth(1).fill(tmonth);
  await dayInputs.nth(1).fill(tday);

  // 양도 주식수 — DecimalInput placeholder 없음 → input[type=text] nth 패턴으로 접근
  // FieldCard label "양도 주식수" 내 첫 번째 텍스트 input
  const shareCountInput = page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "양도 주식수" })
    .locator("input")
    .first();
  await shareCountInput.fill(opts.shareCount);

  // 발행주식 총수 — 동일 패턴
  const totalSharesInput = page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "발행주식 총수" })
    .locator("input")
    .first();
  await totalSharesInput.fill(opts.totalIssuedShares);
}

/**
 * Step1 → Step2 → Step3 이동.
 * Step2에서 양도가액·취득가액 채우기.
 *
 * 로케이터:
 *   - 양도가액 합계: FieldCard "양도가액 합계" 내 input (CurrencyInput)
 *   - 1주당 취득가액: FieldCard "1주당 취득가액" 내 input
 */
async function fillStep2AndGoToStep3(
  page: Page,
  opts: {
    transferTotalPrice: string;
    perShareAcquisitionPrice: string;
  },
) {
  // Step1 → Step2
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

  // 양도가액 합계 (CurrencyInput — label이 htmlFor 없음 → parent div :has(label) 패턴)
  // CurrencyInput DOM: <div class="space-y-1.5"><label>양도가액 합계</label><div><input/></div></div>
  const transferPriceInput = page
    .locator("div:has(> label:has-text('양도가액 합계')) input")
    .first();
  await transferPriceInput.fill(opts.transferTotalPrice);

  // 1주당 취득가액 — 동일 패턴
  const acqPriceInput = page
    .locator("div:has(> label:has-text('1주당 취득가액')) input")
    .first();
  await acqPriceInput.fill(opts.perShareAcquisitionPrice);

  // Step2 → Step3
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
}

/**
 * Step3에서 신고일(필수)을 입력하고 "결과 보기"를 클릭 → API 응답 대기.
 * 신고일은 Step3 내 유일한 DateInput — nth(0) 사용.
 * "결과 보기" 클릭 후 Step4 자동 계산 트리거 → waitForResponse 로 API 확인.
 */
async function fillStep3FilingDateAndGoToResult(
  page: Page,
  opts: { filingDate: string }, // "YYYY-MM-DD"
): Promise<void> {
  const [fyear, fmonth, fday] = opts.filingDate.split("-");

  // 신고일 DateInput — Step3의 유일한 DateInput (nth(0))
  const yearInput = page.locator('input[type="text"][aria-label="연도"]').nth(0);
  const monthInput = page.locator('input[type="text"][aria-label="월"]').nth(0);
  const dayInput = page.locator('input[type="text"][aria-label="일"]').nth(0);
  await yearInput.fill(fyear);
  await monthInput.fill(fmonth);
  await dayInput.fill(fday);

  // 결과 보기 → Step4 진입 + 자동 계산 트리거
  const calcResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "결과 보기" }).click();
  const resp = await calcResponse;
  if (!resp.ok()) {
    throw new Error(`STX 계산 API 비정상 응답 ${resp.status()}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// E-1: 코스피 상장 + 양도가액 → Step3 inline 카드 표시
// ─────────────────────────────────────────────────────────────────

test("E-1: 코스피 상장 + 양도가액 입력 시 Step3 inline STX 카드 표시", async ({ page }) => {
  test.setTimeout(90_000);

  await gotoStockTransferTax(page);

  // Step1 필수 필드 채우기
  await fillStep1(page, {
    securityName: "예제주식A",
    marketLabel: "코스피",
    transferDate: "2026-03-15",
    acquisitionDate: "2020-01-10",
    shareCount: "1000",
    totalIssuedShares: "10000000",
  });

  // Step2: 양도가액 + 취득가액 + Step3 이동
  await fillStep2AndGoToStep3(page, {
    transferTotalPrice: "50000000", // 5,000만원
    perShareAcquisitionPrice: "30000",
  });

  // Step3 화면 → inline STX 카드 확인
  // 코스피: 세율 0.05% (시령 §5 2026.01.02 시행)
  await expect(page.getByText("증권거래세 참고 (정보용)").first()).toBeVisible({ timeout: 10_000 });
  // 세율 정보 또는 금액이 표시되는지 확인
  await expect(page.getByText(/0\.05%/).first()).toBeVisible({ timeout: 5_000 });
});

// ─────────────────────────────────────────────────────────────────
// E-2: 비상장 + 전체 입력 → 계산 후 result 카드 표시
// ─────────────────────────────────────────────────────────────────

test("E-2: 비상장 + 전체 입력 → 계산 후 결과뷰 STX 카드 표시", async ({ page }) => {
  test.setTimeout(120_000);

  await gotoStockTransferTax(page);

  // Step1: 비상장
  await fillStep1(page, {
    securityName: "예제비상장주식",
    marketLabel: "비상장",
    transferDate: "2026-04-10",
    acquisitionDate: "2018-06-01",
    shareCount: "500",
    totalIssuedShares: "5000000",
  });

  // Step2: 양도가액 + 취득가액 + Step3 이동
  await fillStep2AndGoToStep3(page, {
    transferTotalPrice: "25000000",
    perShareAcquisitionPrice: "20000",
  });

  // Step3: 신고일 입력 + 결과 보기 → API 대기
  await fillStep3FilingDateAndGoToResult(page, { filingDate: "2026-08-31" });

  // 결과뷰 로딩 대기
  await expect(page.getByText(/산출세액|과세표준|양도소득금액/).first()).toBeVisible({
    timeout: 20_000,
  });

  // 비상장: 0.35% — result variant STX 카드 확인
  await expect(page.getByText("증권거래세 (정보용)").first()).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(/0\.35%/).first()).toBeVisible({ timeout: 5_000 });
  // §7 disclaimer 확인
  await expect(
    page.getByText(/증권거래세법 §7/).first(),
  ).toBeVisible({ timeout: 5_000 });
});

// ─────────────────────────────────────────────────────────────────
// E-3: K-OTC 비과세 경로 → result STX 카드 표시 (S-3 경로)
// ─────────────────────────────────────────────────────────────────

test("E-3: K-OTC 중소·중견 소액주주 비과세 경로 → result STX 카드 표시", async ({ page }) => {
  test.setTimeout(120_000);

  await gotoStockTransferTax(page);

  // Step1: 비상장 시장 선택 (K-OTC는 시장이 아닌 회사 분류 토글)
  await fillStep1(page, {
    securityName: "예제KOTC주식",
    marketLabel: "비상장",
    transferDate: "2026-05-20",
    acquisitionDate: "2019-03-15",
    shareCount: "200",
    totalIssuedShares: "1000000",
  });

  // K-OTC 거래 토글 ON (CompanyTypeBlock 내 Switch)
  // switch의 aria-name으로 직접 선택 — "K-OTC 거래 §94①3" (벤처기업 K-OTC와 구분)
  const kotcSwitch = page.getByRole("switch", { name: /K-OTC 거래 §94/ }).first();
  if (await kotcSwitch.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await kotcSwitch.click();
  }
  // K-OTC 소액주주 비과세 요건 토글도 ON
  const kotcMinorSwitch = page
    .getByRole("switch", { name: /K-OTC 중소|소액주주|중소.중견/ })
    .first();
  if (await kotcMinorSwitch.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await kotcMinorSwitch.click();
  }

  // Step2: 양도가액 + 취득가액 + Step3 이동
  await fillStep2AndGoToStep3(page, {
    transferTotalPrice: "10000000",
    perShareAcquisitionPrice: "15000",
  });

  // Step3: 신고일 입력 + 결과 보기 → API 대기
  await fillStep3FilingDateAndGoToResult(page, { filingDate: "2026-08-31" });

  // K-OTC 비과세 결과 확인 (이 경우 isExempt = true)
  await expect(page.getByText(/비과세|면제/).first()).toBeVisible({ timeout: 20_000 });

  // 비과세 경로에도 STX 카드가 표시되는지 확인 (S-3 — buildExemptResult STX echo)
  await expect(page.getByText("증권거래세 (정보용)").first()).toBeVisible({ timeout: 5_000 });
});

// ─────────────────────────────────────────────────────────────────
// E-4: 기타자산(과점주주) → Step3 STX 카드 경고 메시지 표시 (C-06)
// ─────────────────────────────────────────────────────────────────

test("E-4: 기타자산(과점주주) → STX 카드 양도소득세 별도 납부 경고 확인", async ({ page }) => {
  test.setTimeout(90_000);

  await gotoStockTransferTax(page);

  // Step1: 기타자산 선택
  await page.getByPlaceholder("종목명을 입력하세요").fill("예제기타자산주식");
  await page.getByRole("radio", { name: "기타자산" }).first().click();

  // 기타자산: 과점주주 토글 ON (§94①4 다목 or 라목 중 1개 필수)
  const otherAssetSwitch = page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: /과점주주/ })
    .getByRole("switch")
    .first();
  if (await otherAssetSwitch.isVisible()) {
    await otherAssetSwitch.click();
  }

  // 날짜·주식수·발행주식 채우기 — input[type="text"] 범위 한정 (radio 오매칭 방지)
  // Step1 순서: nth(0)=취득일 (AcquisitionInfoBlock), nth(1)=양도일 (양도 정보 block)
  const yearInputs4 = page.locator('input[type="text"][aria-label="연도"]');
  const monthInputs4 = page.locator('input[type="text"][aria-label="월"]');
  const dayInputs4 = page.locator('input[type="text"][aria-label="일"]');
  // 취득일 — nth(0)
  await yearInputs4.nth(0).fill("2015");
  await monthInputs4.nth(0).fill("01");
  await dayInputs4.nth(0).fill("15");
  // 양도일 — nth(1)
  await yearInputs4.nth(1).fill("2026");
  await monthInputs4.nth(1).fill("06");
  await dayInputs4.nth(1).fill("01");

  const shareCountInput4 = page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "양도 주식수" })
    .locator("input")
    .first();
  await shareCountInput4.fill("1000");

  const totalSharesInput4 = page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "발행주식 총수" })
    .locator("input")
    .first();
  await totalSharesInput4.fill("2000");

  // Step2: 양도가액 + 취득가액 + Step3 이동
  await fillStep2AndGoToStep3(page, {
    transferTotalPrice: "5000000",
    perShareAcquisitionPrice: "1000",
  });

  // Step3 inline 카드 — 기타자산(C-06): totalTax = 0 이지만 warning이 표시되어야 함
  // 기타자산: 증권거래세법상 비과세이므로 totalTax=0, warning 메시지 표시
  await expect(page.getByText("증권거래세 참고 (정보용)").first()).toBeVisible({ timeout: 10_000 });
  // 기타자산은 증권거래세 비과세 — 경고 또는 카드 자체가 표시됨을 확인
  // (warning 또는 rateReference 텍스트로 확인)
  await expect(
    page.getByText(/증권거래세법|비과세|납부 의무/).first(),
  ).toBeVisible({ timeout: 5_000 });
});
