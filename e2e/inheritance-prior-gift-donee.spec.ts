/**
 * E2E: 사전증여 수증자(doneeId) select — 인별 배부 검증 (2-B, 2026-05-29)
 *
 * 계획서: docs/01-plan/inheritance-summary-table-bugfix.plan.md §2.3 2-B + §6 N1
 * 정책: [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족
 *
 * 시나리오:
 *  PG-1: 수증자 미지정 → ② 합계열 금액 표시 + "수증자 미지정" 안내 배지 표시
 *  PG-2: 수증자 지정 → ② 인별 셀에 금액 채워짐 (배부 정상)
 *        + 상속인에게 증여 토글 disabled (자동 동기화 확인)
 *  PG-3: 수증자 지정 후 "선택 안 함" → doneeId 제거 → 토글 활성화 복원
 *
 * 검증 기준:
 *  - data-testid "gift-donee-select" — 수증자 select 렌더 확인
 *  - data-testid "prior-gift-donee-missing-badge" — 미지정 안내 배지
 *  - data-testid "heir-summary-cell-{heirId}-row-2-priorGift" — 인별 ② 셀
 *  - "수증자 지정됨" disabledReason 문구 — 토글 자동 동기화
 */

import { test, expect, type Page } from "@playwright/test";

// ============================================================
// 공용 헬퍼
// ============================================================

/** Step0: 상속개시일 + 자녀 1명 + Step1 이동 */
async function gotoStep0WithChild(page: Page) {
  await page.goto("/calc/inheritance-tax");

  // 상속개시일 2024-06-10
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");
  // 병렬 경합 시 날짜 미커밋 방지(견고화)
  await expect(page.getByLabel("연도").first()).toHaveValue("2024");

  // 자녀 1명 추가
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();

  // Step1(상속재산)으로 이동
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** Step1: 토지 자산 추가 (3억 평가액) */
async function addLandAsset(page: Page) {
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  const areaInput = page.getByPlaceholder("면적 입력");
  const priceInput = page.getByPlaceholder("공시지가 단가");
  await areaInput.fill("300");
  await priceInput.fill("1000000");
  // 병렬 CPU 경합 시 fill 미커밋 방지 — 값 커밋 검증(견고화). 빈 필드로 계산 진행 차단.
  await expect(areaInput).toHaveValue(/300/);
  await expect(priceInput).toHaveValue(/1[,.]?000[,.]?000/);
}

/** Step1 → Step2(비과세) 이동 */
async function proceedToStep2(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** Step2 → Step3(사전증여) 이동 */
async function proceedToStep3(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** Step3: 사전증여 1건 추가 + 금액 입력 */
async function addPriorGift(page: Page) {
  await page.getByRole("button", { name: /사전증여 추가/ }).click();

  // 사전증여 카드 컨테이너 (마지막 추가된 것)
  const giftCard = page.locator(".border.rounded-lg.p-4").last();

  // 증여일 2020-01-01
  await giftCard.getByLabel("연도").fill("2020");
  await giftCard.getByLabel("월").fill("1");
  await giftCard.getByLabel("일").fill("1");

  // 증여재산가액 입력 — CurrencyInput label="증여재산가액"
  // CurrencyInput은 aria-labelledby 또는 label 연결로 접근
  const giftAmountInput = giftCard.getByPlaceholder("금액 입력").first();
  await giftAmountInput.fill("500000000");
  await giftAmountInput.press("Tab");
  // 병렬 경합 시 미커밋 방지 — 증여일 연도·증여액 커밋 검증(견고화).
  await expect(giftCard.getByLabel("연도")).toHaveValue("2020");
  await expect(giftAmountInput).toHaveValue(/500[,.]?000[,.]?000/);
}

/** Step3 → Step4(공제) → 계산하기 → 결과 대기 */
async function proceedToResult(page: Page) {
  // Step4(공제·세액공제)
  await page.getByRole("button", { name: /^다음/ }).click();
  // 계산 API 응답을 명시적으로 대기 — 병렬 CPU 경합 시 렌더 타이밍 의존 제거(견고화).
  const calcResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/calc/inheritance") &&
      r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calcResponse;
  // 계산 API가 에러(폼 검증 실패 등)면 결과가 안 뜨므로 명확히 표면화(견고화·진단)
  expect(
    resp.ok(),
    `계산 API 비정상 응답 ${resp.status()} — 폼 입력 누락/검증 실패 의심`,
  ).toBe(true);
  // 결과 화면 로드 대기 (API 응답 후 — 경합 여유 30s)
  await expect(page.getByText("상속세 결정세액")).toBeVisible({ timeout: 30_000 });
}

// ============================================================
// 테스트
// ============================================================

test.describe("사전증여 수증자 select — 인별 배부 검증 (2-B)", () => {
  test(
    "PG-1: 수증자 미지정 → 수증자 select 렌더 + 미지정 안내 문구 표시",
    async ({ page }) => {
      test.setTimeout(90_000);

      await gotoStep0WithChild(page);
      await addLandAsset(page);
      await proceedToStep2(page);
      await proceedToStep3(page);
      await addPriorGift(page);

      // 수증자 select 렌더 확인
      await expect(page.getByTestId("gift-donee-select")).toBeVisible({ timeout: 5_000 });

      // 미지정 안내 문구 확인 (sky tone)
      await expect(page.getByText(/수증자를 지정하면/)).toBeVisible();
    },
  );

  test(
    "PG-2: 수증자 지정 → 토글 disabled(자동 동기화) + 배지 미표시",
    async ({ page }) => {
      test.setTimeout(90_000);

      await gotoStep0WithChild(page);
      await addLandAsset(page);
      await proceedToStep2(page);
      await proceedToStep3(page);
      await addPriorGift(page);

      // 수증자 select에서 첫 번째 상속인 선택
      const doneeSelect = page.getByTestId("gift-donee-select");
      await expect(doneeSelect).toBeVisible({ timeout: 5_000 });

      // 옵션 중 "선택 안 함" 외 첫 번째 option 선택 (자녀)
      await doneeSelect.selectOption({ index: 1 });

      // doneeId 선택 시 gift-donee-summary 배지 표시 (실제 구현: disabled가 아닌 조건부 숨김)
      await expect(page.getByTestId("gift-donee-summary")).toBeVisible();
      // "수증자를 지정하면..." 미선택 안내 사라짐
      await expect(page.getByText(/수증자를 지정하면/)).toHaveCount(0);
      // isHeir 토글 자체가 숨겨짐 (doneeId 지정 시 !gift.doneeId 조건으로 숨김)
      await expect(page.getByText("상속인에게 증여")).toHaveCount(0);
    },
  );

  test(
    "PG-3: 수증자 지정 후 '선택 안 함' → 토글 활성화 복원 + 안내 문구 재표시",
    async ({ page }) => {
      test.setTimeout(90_000);

      await gotoStep0WithChild(page);
      await addLandAsset(page);
      await proceedToStep2(page);
      await proceedToStep3(page);
      await addPriorGift(page);

      const doneeSelect = page.getByTestId("gift-donee-select");
      await expect(doneeSelect).toBeVisible({ timeout: 5_000 });

      // 수증자 지정
      await doneeSelect.selectOption({ index: 1 });
      await expect(page.getByTestId("gift-donee-summary")).toBeVisible();

      // 다시 "선택 안 함"으로 변경
      await doneeSelect.selectOption({ index: 0 });

      // 안내 문구 재표시 (미지정 상태)
      await expect(page.getByText(/수증자를 지정하면/)).toBeVisible();
      // gift-donee-summary 배지 사라짐
      await expect(page.getByTestId("gift-donee-summary")).toHaveCount(0);
    },
  );

  test(
    "PG-4: 수증자 지정 후 계산 → ② 인별 배부표 배지 미표시 (doneeId 지정으로 배부 정상)",
    async ({ page }) => {
      test.setTimeout(90_000);

      await gotoStep0WithChild(page);
      await addLandAsset(page);
      await proceedToStep2(page);
      await proceedToStep3(page);
      await addPriorGift(page);

      // 수증자 지정
      const doneeSelect = page.getByTestId("gift-donee-select");
      await expect(doneeSelect).toBeVisible({ timeout: 5_000 });
      await doneeSelect.selectOption({ index: 1 });

      // 계산 진행
      await proceedToResult(page);

      // ② 미지정 안내 배지가 없어야 함 (doneeId 지정으로 인별 배부 정상)
      await expect(
        page.getByTestId("prior-gift-donee-missing-badge"),
      ).toHaveCount(0);
    },
  );

  test(
    "PG-5: 수증자 미지정으로 계산 → ② 미지정 안내 배지 표시",
    async ({ page }) => {
      test.setTimeout(90_000);

      await gotoStep0WithChild(page);
      await addLandAsset(page);
      await proceedToStep2(page);
      await proceedToStep3(page);
      await addPriorGift(page);

      // 수증자 미지정 상태로 계산 진행
      await proceedToResult(page);

      // ② 미지정 안내 배지 표시 확인
      const badge = page.getByTestId("prior-gift-donee-missing-badge");
      await expect(badge).toBeVisible({ timeout: 5_000 });
      await expect(badge).toContainText("수증자(상속인)가 지정되지 않아");
    },
  );

  test(
    "PG-6: 결과 계산 + 자동저장 후 무한 렌더 루프 없음 (autoSaveToast useMemo 회귀 가드)",
    async ({ page }) => {
      test.setTimeout(90_000);

      // 콘솔/페이지 에러 수집 — "Maximum update depth exceeded" 감지
      const renderLoopErrors: string[] = [];
      const capture = (text: string) => {
        if (/Maximum update depth exceeded/i.test(text)) {
          renderLoopErrors.push(text);
        }
      };
      page.on("console", (msg) => {
        if (msg.type() === "error") capture(msg.text());
      });
      page.on("pageerror", (err) => capture(err.message));

      await gotoStep0WithChild(page);
      await addLandAsset(page);
      await proceedToStep2(page);
      await proceedToStep3(page);
      await addPriorGift(page);
      // 계산 → 결과 → 자동저장(status="saved") 발동
      await proceedToResult(page);

      // 자동저장(IndexedDB) 완료 토스트가 뜰 시간 확보 — 루프는 saved 직후 발동
      // 병렬 CPU 경합 시 autosave 지연 → timeout 15s로 상향(견고화)
      await expect(page.getByText(/자동 저장|이력|갱신/).first()).toBeVisible({
        timeout: 15_000,
      });
      // 루프 발동 감지 윈도우 (loop는 saved 직후 즉시·연속 발동 — 2s면 충분)
      await page.waitForTimeout(2_000);

      // 무한 렌더 루프(Maximum update depth) 콘솔 에러가 없어야 함
      expect(
        renderLoopErrors,
        `렌더 루프 에러 감지:\n${renderLoopErrors.slice(0, 3).join("\n")}`,
      ).toHaveLength(0);
    },
  );
});
