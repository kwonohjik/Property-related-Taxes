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
import { addHeir, closeHeirEditModal } from "./_helpers/tax-flow";

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

  // 자녀 추가 — 동거주택 토글이 "상속인 편집" 모달 안으로 이전됨 → 모달 유지
  await addHeir(page, "heir", "child", { keepModalOpen: true });

  // 동거주택 토글 ON — Phase 2 G3 블록 노출 조건 (모달 안, ToggleCard=role=switch)
  await page.getByRole("switch", { name: /동거주택 상속공제 해당/ }).click();
  // 모달은 열어 둔다 — G3·P4가 모달 내 CohabitRequirementBlock과 상호작용
}

/** Step0 → Step4로 이동 (3번 다음) */
async function goToStep4WithCohabitChild(page: Page) {
  await setupStep0WithCohabitChild(page); // 모달 OPEN + 동거 ON
  // G4는 Step4 페이지의 CohabitAncillaryLandBlock과 상호작용 → 모달 닫고 이동
  await closeHeirEditModal(page);
  // Step0 → Step1
  await page.getByRole("button", { name: /^다음/ }).click();
  // Step1: 아파트 추가 + 동거주택 체크
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /주택/ }).click();
  // 보충적 평가(주택 기준시가) 토글 ON — 금액 입력 펼침 (2026-06-09 토글 전환)
  await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
  await page.getByPlaceholder("금액 입력").first().fill("800000000");
  // 담보·임대 섹션 토글 ON → 동거주택 공제 대상 체크 (2026-06-09 토글 전환)
  await page.getByRole("switch", { name: /담보·임대/ }).click();
  // 동거주택 공제 대상 토글 — role=switch로 직접 타깃 (getByText는 §23의2 법령 배지를
  // 눌러 법령 모달이 뜸 → #7과 동류의 모호성). ToggleCard, hasCohabitantChild로 활성.
  await page.getByRole("switch", { name: /동거주택 공제 대상/ }).click();
  // 자산 편집도 "주택 편집" 모달(aria-label 없음)로 이전됨 → 닫아야 "다음"이 backdrop에 막히지 않음
  const assetDialog = page.getByRole("dialog");
  await assetDialog.getByRole("button", { name: "닫기" }).click();
  await expect(assetDialog).toBeHidden();
  // → Step2 → Step3 → Step4
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: /^다음/ }).click();
  }
  // Step4(공제·세액공제)는 체크리스트형 progressive disclosure → 동거주택공제 입력 섹션 펼치기
  await page.getByRole("button", { name: /동거주택공제 §23의2/ }).click();
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

    // 수유자 추가 — 세대생략·동거 토글이 "상속인 편집" 모달 안 → 모달 유지
    await addHeir(page, "legatee", undefined, { keepModalOpen: true });

    // 세대생략 토글 ON
    await page.getByText("§27 세대생략 할증 대상").click();

    // legatee + isGenerationSkipBeneficiary=true → isCohabitDeductionEligibleRelation = true → 토글 노출
    await expect(page.getByRole("switch", { name: /동거주택 상속공제 해당/ })).toBeVisible();
  });

  test("E2E-G5-2: 일반 legatee(세대생략 OFF)는 동거주택 토글 미노출", async ({ page }) => {
    await page.goto("/calc/inheritance-tax");
    await page.getByLabel("연도").first().fill("2024");
    await page.getByLabel("월").first().fill("1");
    await page.getByLabel("일").first().fill("1");

    // 수유자 추가 (세대생략 OFF) — 모달 유지하고 모달 안에서 토글 부재 확인
    await addHeir(page, "legatee", undefined, { keepModalOpen: true });

    // 세대생략 OFF → showCohabitant=false → 토글 미노출 (모달 안)
    await expect(page.getByRole("switch", { name: /동거주택 상속공제 해당/ })).toHaveCount(0);
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

// ─────────────────────────────────────────────
// Phase 4 — §23의2② 부득이 사유 배열 입력 위젯
// ─────────────────────────────────────────────

test.describe("Phase 4 — §23의2② 부득이 사유 배열 입력", () => {
  test("E2E-P4-1: 사유 없음 → 토글 ON → 사유 추가 버튼 노출", async ({ page }) => {
    await setupStep0WithCohabitChild(page);

    // 동거 시작일 입력 (기본 세팅)
    const startWrapper = page.getByTestId("cohabit-start-date-input");
    await startWrapper.getByLabel("연도").fill("2010");
    await startWrapper.getByLabel("월").fill("1");
    await startWrapper.getByLabel("일").fill("1");

    // 초기 상태: 사유 토글 OFF → 사유 추가 버튼 미노출
    await expect(page.getByTestId("cohabit-reason-add-button")).not.toBeVisible();

    // 부득이 사유 있음 토글 ON
    await page.getByRole("switch", { name: /부득이한 사유 있음/ }).click();

    // 토글 ON 후: 사유 추가 버튼 노출
    await expect(page.getByTestId("cohabit-reason-add-button")).toBeVisible();
    // 빈 배열 안내 텍스트
    await expect(page.getByText("사유 행이 없습니다")).toBeVisible();
  });

  test("E2E-P4-2: 징집 사유 추가 → 제외(−) 배지 표시", async ({ page }) => {
    await setupStep0WithCohabitChild(page);

    // 부득이 사유 토글 ON
    await page.getByRole("switch", { name: /부득이한 사유 있음/ }).click();

    // 사유 추가
    await page.getByTestId("cohabit-reason-add-button").click();

    // 첫 번째 행 노출 확인
    await expect(page.getByTestId("cohabit-reason-row-0")).toBeVisible();

    // 기본값 conscription → 효과 배지 "제외(−)"
    await expect(page.getByTestId("cohabit-reason-effect-badge-0")).toContainText("제외");
  });

  test("E2E-P4-3: 국외대학원 선택 시 경고 텍스트 표시", async ({ page }) => {
    await setupStep0WithCohabitChild(page);

    // 부득이 사유 토글 ON + 사유 추가
    await page.getByRole("switch", { name: /부득이한 사유 있음/ }).click();
    await page.getByTestId("cohabit-reason-add-button").click();

    // 유형 Select에서 overseas_grad 선택
    await page.getByTestId("cohabit-reason-type-select-0").click();
    await page.getByText("국외 대학원 — 불인정").click();

    // 경고 텍스트 노출
    await expect(page.getByTestId("cohabit-reason-overseas-warning-0")).toBeVisible();
    await expect(page.getByText("부득이한 사유에 해당하지 않습니다")).toBeVisible();
  });

  test("E2E-P4-4: 사유 삭제 → 행 제거됨", async ({ page }) => {
    await setupStep0WithCohabitChild(page);

    // 부득이 사유 토글 ON + 사유 추가
    await page.getByRole("switch", { name: /부득이한 사유 있음/ }).click();
    await page.getByTestId("cohabit-reason-add-button").click();

    // 행 존재 확인
    await expect(page.getByTestId("cohabit-reason-row-0")).toBeVisible();

    // 삭제 버튼 클릭
    await page.getByTestId("cohabit-reason-remove-0").click();

    // 행 제거 확인
    await expect(page.getByTestId("cohabit-reason-row-0")).not.toBeVisible();
    // 빈 안내 텍스트 재노출
    await expect(page.getByText("사유 행이 없습니다")).toBeVisible();
  });
});
