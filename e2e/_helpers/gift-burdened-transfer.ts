/**
 * 부담부증여 양도소득세 E2E 공용 헬퍼 — `gift-burdened-transfer.spec.ts`에서 옮겼다(동작 그대로).
 *
 * 2026-09-28 E-1 잔여: 800줄 정책(원 spec 1,033줄)으로 새 시나리오를 별도 spec
 * (`gift-burdened-transfer-remaining-e1r.spec.ts`)에 두면서 두 spec이 같은 헬퍼를 쓰도록 분리했다.
 * 선택자 정책은 원 spec 상단 주석을 따른다.
 */
import { expect } from "@playwright/test";
import { fillAndVerify, fillDateAndVerify } from "./tax-flow";

// ─── 모킹 응답 ────────────────────────────────────────────────────────────────

/**
 * 최소 TransferTaxResult 모킹 응답.
 * callGiftBurdenedTransferAPI에서 res.ok 체크 후 json()으로 파싱 → BurdenedTransferTaxResultCard에 전달.
 * BurdenedTransferTaxResultCard가 사용하는 필드 최소 구성.
 */
export const MOCK_TRANSFER_RESULT = {
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
export async function setupTransferApiMock(
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
export async function giftStep0(page: Parameters<typeof fillDateAndVerify>[0]) {
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
export async function addApartmentWithDebt(page: Parameters<typeof fillDateAndVerify>[0]) {
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

  // 인수 채무의 **내역** — 양도세 §159의 양도가액 B가 이 칸에서 나온다(④가 `mortgageDebtAmount`로
  // 싣는다). 종전 픽스처는 §47①만 채워 B=0인 채로 돌았고, 모킹 spec이라 그 0을 못 봤다(F26).
  // ⑧ C-4b가 「§47① = 임대보증금 + 저당권 채무액」을 요구하므로 합계를 맞춘다.
  await fillAndVerify(
    dialog.getByRole("textbox", { name: "저당권 등에 의해 담보된 채권액" }),
    "200000000",
  );

  // §47③ 안내 확인
  await expect(dialog.getByText("§47③ 주의")).toBeVisible();

  return dialog;
}

/**
 * 양도소득세 토글 ON.
 * ToggleCard 내부 Switch는 data-testid가 전달되지 않으므로 role-based selector 사용.
 */
export async function enableBurdenedTransferToggle(
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
export async function fillApartmentTransferInfo(
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
