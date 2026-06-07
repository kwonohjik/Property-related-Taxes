/**
 * E2E: §23의2 동거주택공제 Phase 2~3 UI 검증
 *
 * Phase 2 (G3): 동거기간 입력 블록 노출 + 10년 미만 경고
 * Phase 3 (G4): 부수토지 면적한도 입력 블록 노출 + partial 경고
 * G5: 손자녀(세대생략 legatee) 동거주택 토글 노출 확인
 *
 * 서버: E2E_PORT 환경변수 또는 기본 3000
 */
import { test, expect, type Page } from "@playwright/test";

// ─────────────────────────────────────────────
// 공통 헬퍼
// ─────────────────────────────────────────────

/** Step0: 상속개시일 입력 + 자녀 상속인 추가 + 동거주택 토글 ON */
async function setupStep0WithCohabitChild(page: Page) {
  await page.goto("/calc/inheritance-tax");
  // 상속개시일: 2024-06-01
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("1");

  // 자녀 추가
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();

  // 동거주택 토글 ON — Phase 2 G3 블록 노출 조건
  await page.getByText("동거주택 상속공제 해당").click();
}

/** Step0 → Step4로 이동 (3번 다음) */
async function goToStep4WithCohabitChild(page: Page) {
  await setupStep0WithCohabitChild(page);
  // Step0 → Step1
  await page.getByRole("button", { name: /^다음/ }).click();
  // Step1: 아파트 추가 + 동거주택 체크
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /아파트.*공동주택/ }).click();
  await page.getByPlaceholder("금액 입력").first().fill("800000000");
  await page.getByText("시가·감정가·임대보증금·저당권 입력").click();
  await page.getByText("동거주택 공제 대상 (§23의2)").click();
  // → Step2 → Step3 → Step4
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: /^다음/ }).click();
  }
}

// ─────────────────────────────────────────────
// G5: 손자녀(세대생략 legatee) 동거주택 토글 노출
// ─────────────────────────────────────────────

test.describe("G5 — §23의2 적격 관계 (손자녀 legatee)", () => {
  test("E2E-G5-1: 세대생략 손자녀에게도 동거주택 토글 노출됨", async ({ page }) => {
    await page.goto("/calc/inheritance-tax");
    await page.getByLabel("연도").first().fill("2024");
    await page.getByLabel("월").first().fill("1");
    await page.getByLabel("일").first().fill("1");

    // 수유자 추가 — label은 "수유자"
    await page.getByRole("button", { name: /상속인 추가/ }).click();
    await page.getByText("수유자", { exact: true }).click();

    // 세대생략 토글 ON
    await page.getByText("§27 세대생략 할증 대상").click();

    // legatee + isGenerationSkipBeneficiary=true → isCohabitDeductionEligibleRelation = true → 토글 노출
    await expect(page.getByText("동거주택 상속공제 해당")).toBeVisible();
  });

  test("E2E-G5-2: 일반 legatee(세대생략 OFF)는 동거주택 토글 미노출", async ({ page }) => {
    await page.goto("/calc/inheritance-tax");
    await page.getByLabel("연도").first().fill("2024");
    await page.getByLabel("월").first().fill("1");
    await page.getByLabel("일").first().fill("1");

    // 수유자 추가 (세대생략 OFF)
    await page.getByRole("button", { name: /상속인 추가/ }).click();
    await page.getByText("수유자", { exact: true }).click();

    // 세대생략 OFF → showCohabitant=false → 토글 미노출
    await expect(page.getByText("동거주택 상속공제 해당")).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────
// G3: 동거기간 입력 블록 + 10년 미만 경고
// ─────────────────────────────────────────────

test.describe("G3 — 동거기간 입력 블록", () => {
  test("E2E-G3-1: 동거주택 ON 시 동거기간 입력 블록 노출", async ({ page }) => {
    await setupStep0WithCohabitChild(page);
    // CohabitRequirementBlock 노출 확인
    await expect(page.getByTestId("cohabit-requirement-block")).toBeVisible();
    // 동거 시작일 입력 래퍼 div 존재 (DateInput은 내부 연도/월/일 분리)
    await expect(page.getByTestId("cohabit-start-date-input")).toBeVisible();
  });

  test("E2E-G3-2: 동거연수 10년 미만 시 경고 표시", async ({ page }) => {
    await setupStep0WithCohabitChild(page);

    // 동거 시작일 입력 래퍼 안의 연도/월/일 필드
    const startWrapper = page.getByTestId("cohabit-start-date-input");
    await startWrapper.getByLabel("연도").fill("2019");
    await startWrapper.getByLabel("월").fill("1");
    await startWrapper.getByLabel("일").fill("1");

    // 동거연수 미리보기 노출
    await expect(page.getByTestId("cohabit-years-preview")).toBeVisible();
    // 10년 미달 텍스트
    await expect(page.getByText("10년 요건 미달")).toBeVisible();
  });

  test("E2E-G3-3: 동거연수 10년 이상 시 충족 표시", async ({ page }) => {
    await setupStep0WithCohabitChild(page);

    const startWrapper = page.getByTestId("cohabit-start-date-input");
    await startWrapper.getByLabel("연도").fill("2010");
    await startWrapper.getByLabel("월").fill("1");
    await startWrapper.getByLabel("일").fill("1");

    await expect(page.getByTestId("cohabit-years-preview")).toBeVisible();
    await expect(page.getByText("10년 요건 충족")).toBeVisible();
  });
});

// ─────────────────────────────────────────────
// G4: 부수토지 면적한도 입력 블록 + partial 경고
// ─────────────────────────────────────────────

test.describe("G4 — 부수토지 면적한도 입력 블록", () => {
  test("E2E-G4-1: Step4에 CohabitAncillaryLandBlock 노출", async ({ page }) => {
    await goToStep4WithCohabitChild(page);

    // G4 블록 항상 노출 (선택 입력)
    await expect(page.getByTestId("cohabit-ancillary-land-block")).toBeVisible();
  });

  test("E2E-G4-2: 부분 입력 시 partial 경고 표시", async ({ page }) => {
    await goToStep4WithCohabitChild(page);

    // 부수토지 면적만 입력 — div wrapper 안의 input에 fill
    const areaWrapper = page.getByTestId("ancillary-land-area-input");
    await areaWrapper.locator("input").fill("500");

    await expect(page.getByTestId("ancillary-land-partial-warning")).toBeVisible();
  });

  test("E2E-G4-3: 3필드 전부 입력 시 partial 경고 사라짐", async ({ page }) => {
    await goToStep4WithCohabitChild(page);

    await page.getByTestId("ancillary-land-area-input").locator("input").fill("500");
    await page.getByTestId("building-footprint-area-input").locator("input").fill("100");
    // 지역 라디오 선택 — 수도권 주거·상업·공업
    await page.getByText("수도권 주거·상업·공업").click();

    await expect(page.getByTestId("ancillary-land-partial-warning")).not.toBeVisible();
  });
});
