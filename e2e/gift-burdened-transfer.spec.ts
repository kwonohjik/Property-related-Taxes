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
        body: JSON.stringify(MOCK_TRANSFER_RESULT),
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
      await expect(page.getByText("총 납부세액")).toBeVisible();

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
