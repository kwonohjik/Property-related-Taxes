/**
 * E2E: 부담부증여 양도소득세 통합 표시
 *
 * 시나리오:
 *   BT-E2E-1: 아파트 부담부증여 → 양도소득세 토글 ON → 취득정보 입력 → 계산 → 결과 카드 확인
 *   BT-E2E-2: 토글 ON 취득일 미입력 → validateStep 차단(계산 전 오류)
 *   BT-E2E-3: 토글 ON 기준시가 0 → validateStep 차단
 *   BT-E2E-4: 토지 자산 → 비사업용 토지 토글 ON → 계산 → 결과 카드 확인
 *   BT-E2E-5: 비주택 건물 → isHousing OFF → 계산 → 결과 카드 확인
 *   BT-E2E-6: 다자산 두 번째 토글 ON 시도 → 차단 배너 표시
 *
 * 정책:
 *   - worktree E2E_PORT=3102 (feedback_e2e_worktree_port_isolation)
 *   - spec 통과로 브라우저 확인 충족 (feedback_browser_verify_with_playwright)
 *   - ToggleCard.data-testid → DOM에 미전달 → getByRole("switch", { name }) 사용
 *   - CurrencyInput(hideLabel) → aria-label={label} → getByRole("textbox", { name }) 사용
 *   - DecimalInput(aria-label 없음) → wrapper[data-testid] input → locator("[data-testid] input")
 *   - LandPriceLookupField → wrapper[data-testid] input → locator("[data-testid] input")
 *   - 모달 닫기 → backdrop 클릭 대신 "닫기" 버튼
 *   - 양도세 API → route intercept 모킹 (transfer-region-code.spec.ts 패턴)
 *     이유: /api/calc/transfer는 Supabase DB 세율 로드 필수 → 로컬 테스트 환경 DB 미보장
 *     검증: API body 올바른 값 포함 여부 + 모킹 응답으로 결과 카드 렌더링 확인
 */
import { test, expect } from "@playwright/test";
import { fillAndVerify, fillDateAndVerify } from "./_helpers/tax-flow";

// ─── 모킹 응답 ────────────────────────────────────────────────────────────────

/**
 * 최소 TransferTaxResult 모킹 응답.
 * callGiftBurdenedTransferAPI에서 res.ok 체크 후 json()으로 파싱 → BurdenedTransferTaxResultCard에 전달.
 * BurdenedTransferTaxResultCard가 사용하는 필드 최소 구성.
 */
const MOCK_TRANSFER_RESULT = {
  isExempt: false,
  transferGain: 100_000_000,
  taxableGain: 100_000_000,
  usedEstimatedAcquisition: false,
  longTermHoldingDeduction: 0,
  longTermHoldingRate: 0,
  lthdStartDate: "2010-03-15",
  taxBase: 97_500_000,
  appliedRate: 0.35,
  progressiveDeduction: 15_000_000,
  calculatedTax: 19_125_000,
  reductionAmount: 0,
  determinedTax: 19_125_000,
  localIncomeTax: 1_912_500,
  totalTax: 21_037_500,
  warnings: [],
  // 결과 카드의 양도가액·취득가액·필요경비 행 렌더용 (§159①1호 안분 결과)
  transferBurdenedGiftBreakdown: {
    acquisitionMethodUsed: "standard_price",
    assumedDebtAmount: 200_000_000,
    debtRatio: 0.25,
    perAsset: {
      land: {
        transferPrice: 0,
        acquisitionPrice: 0,
        estimatedDeduction: 0,
      },
      building: {
        transferPrice: 200_000_000,
        acquisitionPrice: 97_000_000,
        estimatedDeduction: 3_000_000,
      },
    },
  },
};

/**
 * 양도세 API route intercept 설정.
 * POST /api/calc/transfer를 가로채 MOCK_TRANSFER_RESULT를 반환.
 * request body를 캡처해 검증에 사용.
 *
 * @returns capturedBody 배열 — route intercept 후 채워짐
 */
async function setupTransferApiMock(
  page: Parameters<typeof fillDateAndVerify>[0],
): Promise<{ bodies: Record<string, unknown>[] }> {
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/calc/transfer**", async (route) => {
    if (route.request().method() === "POST") {
      try {
        const raw = route.request().postData() ?? "{}";
        bodies.push(JSON.parse(raw));
      } catch {
        bodies.push({});
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        // 실제 라우트 응답 형태와 일치 — { data: { mode, result } } 봉투.
        // (과거 raw result 반환이 client의 봉투 추출 버그를 가렸음 — 회귀 방지)
        body: JSON.stringify({ data: { mode: "single", result: MOCK_TRANSFER_RESULT } }),
      });
    } else {
      await route.continue();
    }
  });
  return { bodies };
}

// ─── 공용 헬퍼 ────────────────────────────────────────────────────────────────

/** 증여세 Step0 진행 — 증여일 + 증여자 관계 선택 */
async function giftStep0(page: Parameters<typeof fillDateAndVerify>[0]) {
  await page.goto("/calc/gift-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "15" });
  // 첫 번째 select = 증여자 관계 (부/모/직계존속 등) → index 1 = 父
  await page.locator("select").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1
}

/**
 * 아파트 추가 + 채무 입력.
 * 모달을 닫지 않고 dialog locator 반환 — 추가 입력은 호출자가 처리.
 */
async function addApartmentWithDebt(page: Parameters<typeof fillDateAndVerify>[0]) {
  await page.getByRole("button", { name: /증여재산 추가/ }).click();
  // 카테고리: 주택(아파트 = 주택)
  await page.getByRole("button", { name: /주택$/ }).first().click();

  await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
  const dialog = page.getByRole("dialog");

  // 자산명
  const nameInput = dialog.getByPlaceholder(/강남 아파트|본가 토지/);
  await nameInput.fill("서울 아파트");

  // 시가 입력 — ToggleCard switch
  const marketToggle = dialog.getByRole("switch", { name: /^시가 \(매매/ });
  const marketChecked = await marketToggle.getAttribute("aria-checked");
  if (marketChecked !== "true") await marketToggle.click();
  const marketValueInput = dialog.getByRole("textbox", { name: "시가 (매매·수용·경매가액)" });
  await fillAndVerify(marketValueInput, "800000000");

  // 담보·임대 토글 펼침
  const collateralToggle = dialog.getByRole("switch", { name: /담보·임대/ });
  const collateralChecked = await collateralToggle.getAttribute("aria-checked");
  if (collateralChecked !== "true") await collateralToggle.click();

  // §47① 수증자 인수 채무액
  const debtInput = dialog.getByRole("textbox", { name: "수증자 인수 채무액 (§47①)" });
  await expect(debtInput).toBeVisible();
  await fillAndVerify(debtInput, "200000000");

  // §47③ 안내 확인
  await expect(dialog.getByText("§47③ 주의")).toBeVisible();

  return dialog;
}

/**
 * 양도소득세 토글 ON.
 * ToggleCard 내부 Switch는 data-testid가 전달되지 않으므로 role-based selector 사용.
 */
async function enableBurdenedTransferToggle(
  dialog: Awaited<ReturnType<typeof addApartmentWithDebt>>,
) {
  const transferToggle = dialog.getByRole("switch", { name: /양도소득세 함께 계산/ });
  await expect(transferToggle).toBeVisible();
  const checked = await transferToggle.getAttribute("aria-checked");
  if (checked !== "true") await transferToggle.click();
  await expect(transferToggle).toHaveAttribute("aria-checked", "true");
}

/**
 * 아파트 주택 기준시가 취득 정보 입력.
 * 1세대1주택 ON + 거주기간 입력 포함.
 *
 * 선택자 정책:
 *   - CurrencyInput(hideLabel) → aria-label 보존 → getByRole("textbox", { name })
 *   - ToggleCard Switch → getByRole("switch", { name })
 *   - DecimalInput(거주기간) → wrapper[data-testid] 내 input → locator("[data-testid] input")
 */
async function fillApartmentTransferInfo(
  dialog: Awaited<ReturnType<typeof addApartmentWithDebt>>,
) {
  // 취득일 입력 — DateInput은 연/월/일 3개 textbox. last()로 가장 마지막(취득일) 세트 사용.
  const yearInput = dialog.getByRole("textbox", { name: "연도" }).last();
  const monthInput = dialog.getByRole("textbox", { name: "월" }).last();
  const dayInput = dialog.getByRole("textbox", { name: "일" }).last();
  await yearInput.fill("2010");
  await monthInput.fill("3");
  await dayInput.fill("15");
  await expect(yearInput).toHaveValue("2010");

  // 취득시 공동주택공시가격 — CurrencyInput aria-label={label} 방식
  const stdPriceInput = dialog.getByRole("textbox", { name: "취득시 공동주택공시가격 (원)" });
  await expect(stdPriceInput).toBeVisible();
  await fillAndVerify(stdPriceInput, "300000000");

  // 양도시 공동주택공시가격 — item.standardPrice (§159 안분 필수, 신규 필드)
  const transferStdPriceInput = dialog.getByRole("textbox", { name: "양도시 공동주택공시가격 (원)" });
  await expect(transferStdPriceInput).toBeVisible();
  await fillAndVerify(transferStdPriceInput, "350000000");

  // 1세대1주택 ON — ToggleCard switch
  const oneHouseToggle = dialog.getByRole("switch", { name: /1세대 1주택/ });
  await expect(oneHouseToggle).toBeVisible();
  const oneHouseChecked = await oneHouseToggle.getAttribute("aria-checked");
  if (oneHouseChecked !== "true") await oneHouseToggle.click();

  // 거주기간 (개월) — DecimalInput은 aria-label 없어 wrapper[data-testid] 내 input 접근
  const residenceWrapper = dialog.locator("[data-testid='bg-transfer-residence']");
  await expect(residenceWrapper).toBeVisible();
  const residenceInput = residenceWrapper.locator("input");
  await residenceInput.fill("120");
  await expect(residenceInput).toHaveValue("120");
}

// ─── 테스트 ────────────────────────────────────────────────────────────────────

test.describe("부담부증여 양도소득세 통합 표시", () => {
  test(
    "[BT-E2E-1] 아파트 부담부증여 → 양도소득세 토글 ON → 계산 → 결과 카드 확인",
    async ({ page }) => {
      test.setTimeout(120_000);

      // 양도세 API 모킹 (transfer-region-code.spec.ts 패턴)
      const mock = await setupTransferApiMock(page);

      await giftStep0(page);
      const dialog = await addApartmentWithDebt(page);
      await enableBurdenedTransferToggle(dialog);
      await fillApartmentTransferInfo(dialog);

      // 모달 닫기
      await dialog.getByRole("button", { name: "닫기" }).click();
      await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

      // Step1 → Step2 → Step3 → 계산
      await page.getByRole("button", { name: /^다음/ }).click();
      await page.getByRole("button", { name: /^다음/ }).click();

      // 계산하기 — 증여세 POST 대기 (양도세는 intercept됨)
      const giftResponse = page.waitForResponse(
        (r) => r.url().includes("/api/calc/gift") && r.request().method() === "POST",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: /계산하기/ }).click();

      const gResp = await giftResponse;
      expect(gResp.ok(), `증여세 API 비정상 ${gResp.status()}`).toBe(true);

      // 결과 카드 확인 — 모킹 응답으로 BurdenedTransferTaxResultCard 렌더링됨
      // h4 카드 타이틀 확인 (BurdenedTransferTaxResultCard 렌더링됨)
      await expect(
        page.getByText("부담부증여 양도소득세 (채무인수분)"),
      ).toBeVisible({ timeout: 10_000 });
      // "양도차익" 정확히 일치 (strict: "과세 양도차익"과 구분)
      await expect(page.getByText("양도차익", { exact: true })).toBeVisible();
      // 양도가액·취득가액·필요경비 행 표시 (§159①1호 안분 결과)
      await expect(page.getByText("양도가액 (채무인수분)")).toBeVisible();
      await expect(page.getByText("취득가액 (채무인수분)")).toBeVisible();
      await expect(page.getByText("필요경비", { exact: true })).toBeVisible();
      await expect(page.getByText("총 납부세액")).toBeVisible();

      // 세부담 비교 카드 — 단순증여 vs 부담부증여 (burdened-gift-comparison)
      const comparisonCard = page.locator(
        "[data-print-id='burdened-gift-comparison']",
      );
      await expect(comparisonCard).toBeVisible({ timeout: 10_000 });
      await expect(
        comparisonCard.getByText("단순증여 vs 부담부증여 세부담 비교"),
      ).toBeVisible();
      await expect(comparisonCard.getByText("세부담 차이")).toBeVisible();
      await expect(comparisonCard.getByText("양도소득세")).toBeVisible();

      // API body 검증 — 올바른 값이 전달됨
      expect(mock.bodies.length, "양도세 API 호출 횟수").toBeGreaterThan(0);
      const body = mock.bodies[0];
      expect(body.transferType).toBe("burdened_gift");
      expect(body.propertyType).toBe("housing");
      expect(body.transferPrice).toBeGreaterThan(0); // assumedDebtForGift 기반
      expect(
        (body.burdenedGiftInfo as Record<string, unknown>)?.buildingStdPriceAtAcquisition,
        "공동주택공시가격이 취득시 기준시가로 전달됨",
      ).toBe(300_000_000);
    },
  );

  test(
    "[BT-E2E-2] 토글 ON 취득일 미입력 → validateStep 차단",
    async ({ page }) => {
      test.setTimeout(90_000);
      await giftStep0(page);
      const dialog = await addApartmentWithDebt(page);
      await enableBurdenedTransferToggle(dialog);

      // 취득일 입력하지 않고 기준시가만 입력
      const stdPriceInput = dialog.getByRole("textbox", { name: "취득시 공동주택공시가격 (원)" });
      await expect(stdPriceInput).toBeVisible();
      await fillAndVerify(stdPriceInput, "300000000");

      // 모달 닫기
      await dialog.getByRole("button", { name: "닫기" }).click();
      await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

      // 다음 단계로 이동 시도 (Step1 → Step2)
      await page.getByRole("button", { name: /^다음/ }).click();

      // validateStep 차단 오류 메시지 확인
      await expect(
        page.getByText(/취득일을 입력하세요|취득일이 필요합니다/),
      ).toBeVisible({ timeout: 5_000 });
    },
  );

  test(
    "[BT-E2E-3] 토글 ON 기준시가 0 → validateStep 차단",
    async ({ page }) => {
      test.setTimeout(90_000);
      await giftStep0(page);
      const dialog = await addApartmentWithDebt(page);
      await enableBurdenedTransferToggle(dialog);

      // 취득일만 입력하고 기준시가는 입력하지 않음
      const yearInput = dialog.getByRole("textbox", { name: "연도" }).last();
      const monthInput = dialog.getByRole("textbox", { name: "월" }).last();
      const dayInput = dialog.getByRole("textbox", { name: "일" }).last();
      await yearInput.fill("2010");
      await monthInput.fill("3");
      await dayInput.fill("15");
      await expect(yearInput).toHaveValue("2010");

      // 모달 닫기
      await dialog.getByRole("button", { name: "닫기" }).click();
      await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

      // 다음 단계로 이동 시도
      await page.getByRole("button", { name: /^다음/ }).click();

      // validateStep 차단 오류 메시지 확인
      await expect(
        page.getByText(/기준시가|취득시.*기준시가/),
      ).toBeVisible({ timeout: 5_000 });
    },
  );

  test(
    "[BT-E2E-4] 토지 자산 + 비사업용 토지 ON → 계산 → 결과 카드 확인",
    async ({ page }) => {
      test.setTimeout(120_000);

      // 양도세 API 모킹
      const mock = await setupTransferApiMock(page);

      await giftStep0(page);

      // 토지 자산 추가
      await page.getByRole("button", { name: /증여재산 추가/ }).click();
      await page.getByRole("button", { name: /토지/ }).first().click();
      await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
      const dialog = page.getByRole("dialog");

      // 자산명
      const nameInput = dialog.getByPlaceholder(/강남 아파트|본가 토지/);
      await nameInput.fill("서울 토지");

      // 시가 입력
      const marketToggle = dialog.getByRole("switch", { name: /^시가 \(매매/ });
      const marketChecked = await marketToggle.getAttribute("aria-checked");
      if (marketChecked !== "true") await marketToggle.click();
      const marketValueInput = dialog.getByRole("textbox", { name: "시가 (매매·수용·경매가액)" });
      await fillAndVerify(marketValueInput, "500000000");

      // 담보·임대 토글 펼침
      const collateralToggle = dialog.getByRole("switch", { name: /담보·임대/ });
      const collateralChecked = await collateralToggle.getAttribute("aria-checked");
      if (collateralChecked !== "true") await collateralToggle.click();

      // §47① 채무
      const debtInput = dialog.getByRole("textbox", { name: "수증자 인수 채무액 (§47①)" });
      await fillAndVerify(debtInput, "100000000");

      // 양도소득세 토글 ON — ToggleCard switch role
      const transferToggle = dialog.getByRole("switch", { name: /양도소득세 함께 계산/ });
      await expect(transferToggle).toBeVisible();
      const transferChecked = await transferToggle.getAttribute("aria-checked");
      if (transferChecked !== "true") await transferToggle.click();
      await expect(transferToggle).toHaveAttribute("aria-checked", "true");

      // 취득일
      const yearInput = dialog.getByRole("textbox", { name: "연도" }).last();
      const monthInput = dialog.getByRole("textbox", { name: "월" }).last();
      const dayInput = dialog.getByRole("textbox", { name: "일" }).last();
      await yearInput.fill("2005");
      await monthInput.fill("1");
      await dayInput.fill("10");
      await expect(yearInput).toHaveValue("2005");

      // 토지: LandPriceLookupField wrapper[data-testid] 내 CurrencyInput (공시지가 원/㎡)
      // CurrencyInput은 role="textbox". first()는 hidden input일 수 있어 role 사용.
      const stdPriceWrapper = dialog.locator("[data-testid='bg-transfer-acq-stdprice']");
      await expect(stdPriceWrapper).toBeVisible();
      const stdPriceInput = stdPriceWrapper.getByRole("textbox").first();
      await stdPriceInput.fill("200000");
      await stdPriceInput.press("Tab"); // blur → CurrencyInput 포맷팅 트리거
      // CurrencyInput은 blur 시 쉼표 포맷 적용 — raw value와 포맷 중 하나
      await expect(stdPriceInput).toHaveValue(/200/);

      // 양도시(증여시) 개별공시지가 — 표준모드 land §159 분모 (신규 필수 차단 필드)
      const transferStdLand = dialog.locator(
        "[data-testid='bg-transfer-transfer-stdprice-land']",
      );
      await expect(transferStdLand).toBeVisible();
      const transferStdLandInput = transferStdLand.getByRole("textbox").first();
      await transferStdLandInput.fill("250000");
      await transferStdLandInput.press("Tab");
      await expect(transferStdLandInput).toHaveValue(/250/);

      // 비사업용 토지 ON — ToggleCard switch role
      const nonBizToggle = dialog.getByRole("switch", { name: /비사업용 토지/ });
      await expect(nonBizToggle).toBeVisible();
      const nonBizChecked = await nonBizToggle.getAttribute("aria-checked");
      if (nonBizChecked !== "true") await nonBizToggle.click();

      // 모달 닫기
      await dialog.getByRole("button", { name: "닫기" }).click();
      await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

      // Step1 → Step2 → Step3 → 계산
      await page.getByRole("button", { name: /^다음/ }).click();
      await page.getByRole("button", { name: /^다음/ }).click();

      const giftResponse = page.waitForResponse(
        (r) => r.url().includes("/api/calc/gift") && r.request().method() === "POST",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: /계산하기/ }).click();

      const gResp = await giftResponse;
      expect(gResp.ok(), `증여세 API 비정상 ${gResp.status()}`).toBe(true);

      await expect(
        page.getByText("부담부증여 양도소득세 (채무인수분)"),
      ).toBeVisible({ timeout: 10_000 });

      // API body 검증 — 토지 propertyType + 비사업용 토지 플래그
      expect(mock.bodies.length, "양도세 API 호출 횟수").toBeGreaterThan(0);
      const body = mock.bodies[0];
      expect(body.transferType).toBe("burdened_gift");
      expect(body.propertyType).toBe("land");
      expect(body.isNonBusinessLand).toBe(true);
    },
  );

  test(
    "[BT-E2E-5] 비주택 건물 + isHousing OFF → 계산 → 결과 카드 확인",
    async ({ page }) => {
      test.setTimeout(120_000);

      // 양도세 API 모킹
      const mock = await setupTransferApiMock(page);

      await giftStep0(page);

      // 건물(비주택) 자산 추가
      await page.getByRole("button", { name: /증여재산 추가/ }).click();
      await page.getByRole("button", { name: /건물$/ }).first().click();
      await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
      const dialog = page.getByRole("dialog");

      const nameInput = dialog.getByPlaceholder(/강남 아파트|본가 토지/);
      await nameInput.fill("서울 상가건물");

      // 시가 입력
      const marketToggle = dialog.getByRole("switch", { name: /^시가 \(매매/ });
      if ((await marketToggle.getAttribute("aria-checked")) !== "true") {
        await marketToggle.click();
      }
      const marketValueInput = dialog.getByRole("textbox", { name: "시가 (매매·수용·경매가액)" });
      await fillAndVerify(marketValueInput, "600000000");

      // 담보·임대
      const collateralToggle = dialog.getByRole("switch", { name: /담보·임대/ });
      if ((await collateralToggle.getAttribute("aria-checked")) !== "true") {
        await collateralToggle.click();
      }
      const debtInput = dialog.getByRole("textbox", { name: "수증자 인수 채무액 (§47①)" });
      await fillAndVerify(debtInput, "150000000");

      // 양도소득세 토글 ON — ToggleCard switch role
      const transferToggle = dialog.getByRole("switch", { name: /양도소득세 함께 계산/ });
      await expect(transferToggle).toBeVisible();
      if ((await transferToggle.getAttribute("aria-checked")) !== "true") {
        await transferToggle.click();
      }
      await expect(transferToggle).toHaveAttribute("aria-checked", "true");

      // isHousing: 건물 카드에서 주택 여부 toggle — 비주택이므로 OFF 유지
      const isHousingToggle = dialog.getByRole("switch", { name: /주택 여부/ });
      await expect(isHousingToggle).toBeVisible();
      // 기본 OFF이면 그대로 유지 (비주택 경로)
      const housingChecked = await isHousingToggle.getAttribute("aria-checked");
      if (housingChecked === "true") await isHousingToggle.click();

      // 취득일 + 기준시가 (비주택 건물 = NonHousingFieldSet)
      const yearInput = dialog.getByRole("textbox", { name: "연도" }).last();
      const monthInput = dialog.getByRole("textbox", { name: "월" }).last();
      const dayInput = dialog.getByRole("textbox", { name: "일" }).last();
      await yearInput.fill("2008");
      await monthInput.fill("5");
      await dayInput.fill("20");
      await expect(yearInput).toHaveValue("2008");

      // CurrencyInput aria-label="취득시 건물 기준시가 (원)"
      const stdPriceInput = dialog.getByRole("textbox", { name: "취득시 건물 기준시가 (원)" });
      await expect(stdPriceInput).toBeVisible();
      await fillAndVerify(stdPriceInput, "180000000");

      // 양도시 건물 기준시가 — item.standardPrice (§159 안분 필수, 신규 필드)
      const transferStdPriceInput = dialog.getByRole("textbox", { name: "양도시 건물 기준시가 (원)" });
      await expect(transferStdPriceInput).toBeVisible();
      await fillAndVerify(transferStdPriceInput, "500000000");

      // 모달 닫기
      await dialog.getByRole("button", { name: "닫기" }).click();
      await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

      // 계산
      await page.getByRole("button", { name: /^다음/ }).click();
      await page.getByRole("button", { name: /^다음/ }).click();

      const giftResponse = page.waitForResponse(
        (r) => r.url().includes("/api/calc/gift") && r.request().method() === "POST",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: /계산하기/ }).click();

      const gResp = await giftResponse;
      expect(gResp.ok(), `증여세 API 비정상 ${gResp.status()}`).toBe(true);

      await expect(
        page.getByText("부담부증여 양도소득세 (채무인수분)"),
      ).toBeVisible({ timeout: 10_000 });

      // API body 검증 — 비주택 건물 propertyType
      expect(mock.bodies.length, "양도세 API 호출 횟수").toBeGreaterThan(0);
      const body = mock.bodies[0];
      expect(body.transferType).toBe("burdened_gift");
      expect(body.propertyType).toBe("building"); // isHousing=false → building
    },
  );

  test(
    "[BT-E2E-6] 두 번째 부담부증여 자산 토글 ON 시도 → 차단 배너 표시",
    async ({ page }) => {
      test.setTimeout(120_000);
      await giftStep0(page);

      // 첫 번째 아파트 자산 추가 + 토글 ON
      const dialog1 = await addApartmentWithDebt(page);
      await enableBurdenedTransferToggle(dialog1);
      await fillApartmentTransferInfo(dialog1);
      await dialog1.getByRole("button", { name: "닫기" }).click();
      await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

      // 두 번째 아파트 자산 추가
      await page.getByRole("button", { name: /증여재산 추가/ }).click();
      await page.getByRole("button", { name: /주택$/ }).first().click();
      await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
      const dialog2 = page.getByRole("dialog");

      const nameInput = dialog2.getByPlaceholder(/강남 아파트|본가 토지/);
      await nameInput.fill("경기 아파트");

      const marketToggle = dialog2.getByRole("switch", { name: /^시가 \(매매/ });
      if ((await marketToggle.getAttribute("aria-checked")) !== "true") {
        await marketToggle.click();
      }
      await fillAndVerify(
        dialog2.getByRole("textbox", { name: "시가 (매매·수용·경매가액)" }),
        "500000000",
      );

      const collateralToggle = dialog2.getByRole("switch", { name: /담보·임대/ });
      if ((await collateralToggle.getAttribute("aria-checked")) !== "true") {
        await collateralToggle.click();
      }
      await fillAndVerify(
        dialog2.getByRole("textbox", { name: "수증자 인수 채무액 (§47①)" }),
        "100000000",
      );

      // 차단 배너가 표시되어야 함 (다른 자산에 이미 ON)
      await expect(
        dialog2.getByText(/양도소득세 동시 계산.*1건만 지원/),
      ).toBeVisible({ timeout: 5_000 });
    },
  );
});

// ─── 취득가액 산정방식 K-4/K-5 (실지·환산 모드) ──────────────────────────────────
test.describe("부담부증여 양도세 — 취득가액 산정방식 K-4/K-5 (증여세 마법사)", () => {
  test(
    "[AM-E2E-1] 시가 평가 선택 → 산정방식(K-4/K-5) 노출·전환 + 조건부 필드 표시/숨김",
    async ({ page }) => {
      test.setTimeout(120_000);
      await setupTransferApiMock(page);
      await giftStep0(page);
      const dialog = await addApartmentWithDebt(page);
      await enableBurdenedTransferToggle(dialog);
      await fillApartmentTransferInfo(dialog);

      // 기본 = 기준시가 모드(K-1~K-3): 시가(분모 C) 입력·산정방식 라디오 숨김
      // ★ RadioCardGroup radio의 accessible name = label+description → testId로 셀렉트
      const marketValueInput = dialog.getByRole("textbox", { name: "양도시 시가" });
      const actualRadio = dialog.getByTestId("bg-acq-method-actual");
      await expect(marketValueInput).toBeHidden();
      await expect(actualRadio).toBeHidden();

      // 평가방식 = 시가 평가(K-4/K-5) 선택 → 시가·산정방식 노출
      await dialog.getByTestId("bg-valuation-mode-market").check();
      await expect(marketValueInput).toBeVisible();
      await fillAndVerify(marketValueInput, "500000000");
      const convertedRadio = dialog.getByTestId("bg-acq-method-converted");
      await expect(actualRadio).toBeVisible();
      await expect(convertedRadio).toBeVisible();

      // 산정방식 = 실지(K-4): 실지취득가액 박스 노출
      await actualRadio.check();
      const actualTotalInput = dialog.getByRole("textbox", { name: "실지취득가액 합계" });
      await expect(actualTotalInput).toBeVisible();
      await expect(dialog.getByRole("textbox", { name: "자본적 지출" })).toBeVisible();

      // 산정방식 = 환산(K-5): 실지 박스 숨김 + 환산 안내 노출
      await convertedRadio.check();
      await expect(actualTotalInput).toBeHidden();
      await expect(dialog.getByText(/환산취득가 =/)).toBeVisible();

      // 평가방식 = 기준시가로 복귀: 시가·산정방식 숨김 (조건부 회귀)
      await dialog.getByTestId("bg-valuation-mode-standard").check();
      await expect(marketValueInput).toBeHidden();
      await expect(actualRadio).toBeHidden();
    },
  );

  test(
    "[AM-E2E-2] K-4 시가+실지 → 계산 → API body acquisitionMethod·valuationMode·실비 최상위 전달",
    async ({ page }) => {
      test.setTimeout(120_000);
      const mock = await setupTransferApiMock(page);
      await giftStep0(page);
      const dialog = await addApartmentWithDebt(page);
      await enableBurdenedTransferToggle(dialog);
      await fillApartmentTransferInfo(dialog);

      // 시가 평가 + 실지(K-4) + 자본적지출 (라디오는 testId 셀렉트)
      await dialog.getByTestId("bg-valuation-mode-market").check();
      await fillAndVerify(dialog.getByRole("textbox", { name: "양도시 시가" }), "500000000");
      await dialog.getByTestId("bg-acq-method-actual").check();
      await fillAndVerify(
        dialog.getByRole("textbox", { name: "실지취득가액 합계" }),
        "200000000",
      );
      await fillAndVerify(dialog.getByRole("textbox", { name: "자본적 지출" }), "5000000");

      await dialog.getByRole("button", { name: "닫기" }).click();
      await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

      await page.getByRole("button", { name: /^다음/ }).click();
      await page.getByRole("button", { name: /^다음/ }).click();

      const giftResponse = page.waitForResponse(
        (r) => r.url().includes("/api/calc/gift") && r.request().method() === "POST",
        { timeout: 30_000 },
      );
      // 부담부증여 양도세는 gift 결과 후 호출됨 → transfer 응답을 명시 대기 (타이밍 보장)
      const transferResponse = page.waitForResponse(
        (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: /계산하기/ }).click();
      const gResp = await giftResponse;
      expect(gResp.ok(), `증여세 API 비정상 ${gResp.status()}`).toBe(true);
      await transferResponse;

      // API body 검증 — K-4 실지·환산 필드 + 실비 최상위
      expect(mock.bodies.length, "양도세 API 호출").toBeGreaterThan(0);
      const body = mock.bodies[0];
      const bgInfo = body.burdenedGiftInfo as Record<string, unknown>;
      expect(bgInfo.valuationMode).toBe("sangjeungbeop_market");
      expect(bgInfo.acquisitionMethod).toBe("actual");
      expect(bgInfo.actualAcquisitionTotal).toBe(200_000_000);
      expect(bgInfo.marketValueAtTransfer).toBe(500_000_000);
      // ★ 실비는 burdenedGiftInfo 밖 body 최상위 (엔진 top-level 소비)
      expect(body.capitalExpenditure).toBe(5_000_000);
    },
  );
});

// ─── §114조의2 신축·증축 환산 5% 가산세 ──────────────────────────────────────────
test.describe("부담부증여 양도세 — §114조의2 신축 가산세 (증여세 마법사)", () => {
  test(
    "[P114-E2E] K-5 환산 + 신축 토글 → 신축일 입력 → body isSelfBuilt·constructionDate·converted 전달",
    async ({ page }) => {
      test.setTimeout(120_000);
      const mock = await setupTransferApiMock(page);
      await giftStep0(page);
      const dialog = await addApartmentWithDebt(page);
      await enableBurdenedTransferToggle(dialog);
      await fillApartmentTransferInfo(dialog);

      // 시가 평가 + 환산(K-5)
      await dialog.getByTestId("bg-valuation-mode-market").check();
      await fillAndVerify(dialog.getByRole("textbox", { name: "양도시 시가" }), "500000000");
      await dialog.getByTestId("bg-acq-method-converted").check();

      // 신축·증축 토글 ON → 신축 위젯 노출
      const selfBuiltToggle = dialog.getByRole("switch", { name: /신축·증축 건물/ });
      await expect(selfBuiltToggle).toBeVisible();
      await selfBuiltToggle.click();
      await expect(selfBuiltToggle).toHaveAttribute("aria-checked", "true");

      // 신축(new)이 기본 — buildingType=new로 body 전달 확인 (증축은 별도 테스트)
      // 신축일 입력 (K-5 박스 내 DateInput — 신축 토글 후 마지막 연/월/일 세트)
      await dialog.getByRole("textbox", { name: "연도" }).last().fill("2021");
      await dialog.getByRole("textbox", { name: "월" }).last().fill("1");
      await dialog.getByRole("textbox", { name: "일" }).last().fill("10");

      await dialog.getByRole("button", { name: "닫기" }).click();
      await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

      await page.getByRole("button", { name: /^다음/ }).click();
      await page.getByRole("button", { name: /^다음/ }).click();

      const giftResponse = page.waitForResponse(
        (r) => r.url().includes("/api/calc/gift") && r.request().method() === "POST",
        { timeout: 30_000 },
      );
      const transferResponse = page.waitForResponse(
        (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: /계산하기/ }).click();
      await giftResponse;
      await transferResponse;

      // body 검증 — §114조의2 신축필드 최상위 전달 + K-5 converted
      expect(mock.bodies.length, "양도세 API 호출").toBeGreaterThan(0);
      const body = mock.bodies[0];
      expect(body.isSelfBuilt).toBe(true);
      expect(body.buildingType).toBe("new");
      expect(body.constructionDate).toBe("2021-01-10");
      expect((body.burdenedGiftInfo as Record<string, unknown>).acquisitionMethod).toBe(
        "converted",
      );
    },
  );

  test(
    "[P114-E2E-증축] K-5 환산 + 증축 선택 → 면적·증축기준시가 입력 → body buildingType=extension·extensionFloorArea·extensionStdPriceAtAcquisition 전달",
    async ({ page }) => {
      test.setTimeout(120_000);
      const mock = await setupTransferApiMock(page);
      await giftStep0(page);
      const dialog = await addApartmentWithDebt(page);
      await enableBurdenedTransferToggle(dialog);
      await fillApartmentTransferInfo(dialog);

      // 시가 평가 + 환산(K-5)
      await dialog.getByTestId("bg-valuation-mode-market").check();
      await fillAndVerify(dialog.getByRole("textbox", { name: "양도시 시가" }), "500000000");
      await dialog.getByTestId("bg-acq-method-converted").check();

      // 신축·증축 토글 ON
      const selfBuiltToggle = dialog.getByRole("switch", { name: /신축·증축 건물/ });
      await selfBuiltToggle.click();
      await expect(selfBuiltToggle).toHaveAttribute("aria-checked", "true");

      // 증축 선택 (Phase 2 — 활성화됨). RadioCardGroup은 click으로 선택 + 위젯 노출 대기
      await dialog.getByTestId("bg-building-type-extension").click();
      await expect(dialog.getByTestId("bg-extension-floor-area")).toBeVisible();

      // 증축일 입력 (K-5 박스 내 DateInput — 토글 후 마지막 연/월/일 세트)
      await dialog.getByRole("textbox", { name: "연도" }).last().fill("2022");
      await dialog.getByRole("textbox", { name: "월" }).last().fill("1");
      await dialog.getByRole("textbox", { name: "일" }).last().fill("1");

      // 증축 바닥면적(85㎡ 초과 게이트) + 증축부분 취득시 기준시가
      await fillAndVerify(dialog.getByTestId("bg-extension-floor-area"), "100");
      await fillAndVerify(dialog.getByTestId("bg-extension-std-price-at-acq"), "36000000");

      await dialog.getByRole("button", { name: "닫기" }).click();
      await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

      await page.getByRole("button", { name: /^다음/ }).click();
      await page.getByRole("button", { name: /^다음/ }).click();

      const giftResponse = page.waitForResponse(
        (r) => r.url().includes("/api/calc/gift") && r.request().method() === "POST",
        { timeout: 30_000 },
      );
      const transferResponse = page.waitForResponse(
        (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: /계산하기/ }).click();
      await giftResponse;
      await transferResponse;

      // body 검증 — §114조의2 증축필드 최상위 전달
      expect(mock.bodies.length, "양도세 API 호출").toBeGreaterThan(0);
      const body = mock.bodies[0];
      expect(body.isSelfBuilt).toBe(true);
      expect(body.buildingType).toBe("extension");
      expect(body.extensionFloorArea).toBe(100);
      expect(body.extensionStdPriceAtAcquisition).toBe(36_000_000);
      expect((body.burdenedGiftInfo as Record<string, unknown>).acquisitionMethod).toBe(
        "converted",
      );
    },
  );
});
