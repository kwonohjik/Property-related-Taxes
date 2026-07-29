/**
 * transfer-multi-house-detail.spec.ts
 *
 * 양도세 마법사 → Step 4(보유 상황) → "다른 보유 주택 목록" 테이블+모달 + 중과 한시 유예 UI E2E
 *
 * 섹션 노출 조건: 주(主)자산이 housing-like(기본 "housing") + householdHousingCount >= 2.
 * → 보유 상황 단계로 이동 후 "2채" 버튼 클릭으로 섹션을 띄운다.
 *
 * 셀렉터 전략 (견고성):
 *  - ToggleCard는 <label>이 <Switch role=switch>와 title을 함께 감싼다.
 *    accessible name이 title에 연결되지 않으므로, data-slot="toggle-card" 카드를
 *    title 텍스트(hasText)로 찾아 내부 switch를 클릭한다.
 *  - ON 시 children(상속개시일 등)이 렌더되므로 가시성으로 상태를 검증한다.
 *
 * 실행: E2E_PORT=3103 npx playwright test e2e/transfer-multi-house-detail.spec.ts
 */

import { test, expect, type Page, type Locator } from "@playwright/test";

/** 보유 상황(Step 4)으로 이동 + 주택수 2채 설정 → "다른 보유 주택 목록" 섹션 노출 */
async function gotoHoldingStepWithTwoHouses(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // 스텝퍼 자유 이동(onStepClick=setStep) — Step1 미입력이어도 이동 가능
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  // 세대 보유 주택 수 "2채" 버튼 클릭
  await page.getByRole("button", { name: "2채", exact: true }).click();
  // 섹션 노출 확인 (SectionHeader + 내부 <p> 2곳 매칭 → first)
  await expect(page.getByText("다른 보유 주택 목록", { exact: false }).first()).toBeVisible();
}

/**
 * ToggleCard 토글 — Switch는 aria-labelledby로 "title + description"을 accessible name으로 가진다.
 * title 부분문자열 정규식으로 직접 타게팅(중첩 카드도 정확히 구분).
 */
async function toggleCardByTitle(scope: Locator | Page, title: string) {
  await scope.getByRole("switch", { name: new RegExp(title) }).click();
}

test.describe("다주택 중과세 세대 보유 주택 상세 입력 UI", () => {
  test("주택 추가 모달: 기본정보·상속·장기임대 섹션 + 신규 필드 렌더", async ({ page }) => {
    await gotoHoldingStepWithTwoHouses(page);

    // 주택 추가 → 모달 자동 오픈
    await page.getByRole("button", { name: /주택 추가/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // ① 기본정보: 3섹션 헤더 존재
    await expect(dialog.getByText("기본 정보", { exact: false })).toBeVisible();
    await expect(dialog.getByText("상속 정보", { exact: false })).toBeVisible();
    await expect(dialog.getByText("장기임대 정보", { exact: false })).toBeVisible();

    // 지역: 지방 선택 (RadioCardGroup label 텍스트 클릭)
    await dialog.getByText("지방", { exact: true }).click();

    // 미분양주택 chip 토글 → ON
    await toggleCardByTitle(dialog, "미분양주택");

    // ② 상속 토글 ON → 상속개시일 라벨(children) 노출 (exact: 설명문 substring 충돌 회피)
    await toggleCardByTitle(dialog, "상속주택");
    await expect(dialog.getByText("상속개시일", { exact: true })).toBeVisible();

    // ③ 장기임대 토글 ON → 등록사업자 토글 노출
    await toggleCardByTitle(dialog, "장기임대 등록주택");
    await expect(dialog.getByText("임대사업자 정식 등록", { exact: true })).toBeVisible();

    // 등록사업자 ON → 등록일 2종 + 임대기간 노출
    await toggleCardByTitle(dialog, "임대사업자 정식 등록");
    await expect(dialog.getByText("임대사업자 등록일", { exact: true })).toBeVisible();
    await expect(dialog.getByText("사업자 등록일", { exact: true })).toBeVisible();
    await expect(dialog.getByText("임대기간 (년)", { exact: true })).toBeVisible();

    // 임대기간 입력 (DecimalInput — placeholder)
    const periodInput = dialog.getByPlaceholder("임대기간 입력");
    await periodInput.fill("8");
    await expect(periodInput).toHaveValue("8");

    // 완료 → 모달 닫힘
    await dialog.getByRole("button", { name: "완료" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    // 테이블에 신규 행(편집 버튼) + 특례 배지 표시 — 테이블 스코프로 한정
    const housesTable = page.getByRole("table").first();
    await expect(housesTable.getByRole("button", { name: /편집/ })).toBeVisible();
    await expect(housesTable.getByText("미분양", { exact: true })).toBeVisible();
    await expect(housesTable.getByText("상속", { exact: true })).toBeVisible();
    await expect(housesTable.getByText("장기임대", { exact: true })).toBeVisible();
  });

  test("중과 한시 유예(gracePeriod) 토글 ON → 매매계약일·토지거래허가 노출", async ({ page }) => {
    await gotoHoldingStepWithTwoHouses(page);

    // gracePeriod 노출 조건: 1세대 + 주택수 2 + 보유 항목 1건 이상.
    // → 주택을 1건 추가(모달 즉시 닫기)하여 houses.length > 0 충족시킨다.
    await page.getByRole("button", { name: /주택 추가/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 3000 });
    await page.getByRole("dialog").getByRole("button", { name: "완료" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 3000 });

    // gracePeriod 섹션: 1세대(기본 ON) + 주택수 2 + houses>0 → 노출
    await expect(page.getByText("중과세 한시 유예 조건 입력", { exact: false })).toBeVisible();

    // 토글 ON
    await toggleCardByTitle(page, "중과세 한시 유예 조건 입력");

    // 세부 조건 노출
    await expect(page.getByText("매매계약일", { exact: false })).toBeVisible();
    await expect(page.getByText("토지거래허가구역", { exact: false })).toBeVisible();
  });

  test("장기임대 9유형 선택(마목) → 유형별 요건 필드 노출", async ({ page }) => {
    await gotoHoldingStepWithTwoHouses(page);
    await page.getByRole("button", { name: /주택 추가/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // 장기임대 등록주택 ON → rentalType 선택 노출
    await dialog.getByRole("switch", { name: /장기임대 등록주택/ }).click();
    await expect(dialog.getByText("장기임대주택 유형", { exact: false })).toBeVisible();

    // 마목(장기일반 매입임대 10년) 선택 — RadioCardGroup 옵션 텍스트 클릭
    await dialog.getByText("장기일반 매입임대", { exact: false }).click();

    // 마목 유형별 필드 노출: 임대개시 공시가격 · 5%룰 · 결격 사유
    await expect(dialog.getByText("임대개시 당시 공시가격", { exact: false })).toBeVisible();
    await expect(dialog.getByText("임대료 증액 5% 이하 충족", { exact: false })).toBeVisible();
  });

  test("사목(G) 선택 → base 목 selector + base 목 선택 시 요건 필드 동적 노출", async ({ page }) => {
    await gotoHoldingStepWithTwoHouses(page);
    await page.getByRole("button", { name: /주택 추가/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 3000 });

    await dialog.getByRole("switch", { name: /장기임대 등록주택/ }).click();
    await expect(dialog.getByText("장기임대주택 유형", { exact: false })).toBeVisible();

    // 사목(자진·자동 말소 후 양도) 선택 → base 목 selector + 말소 게이트 노출
    await dialog.getByText("자진·자동 말소 후 양도", { exact: false }).click();
    await expect(dialog.getByText("말소 전 base 목", { exact: false })).toBeVisible();
    await expect(dialog.getByText("자진·자동 말소일", { exact: false })).toBeVisible();
    // base 목 미선택 시 base 요건 필드 없음
    await expect(dialog.getByText("임대개시 당시 공시가격", { exact: false })).toHaveCount(0);

    // base 마목 선택 → 마목 "해당 목의 다른 요건"(임대개시 공시가격·5%룰) 동적 노출
    await dialog.getByText("마목(장기일반)", { exact: false }).click();
    await expect(dialog.getByText("임대개시 당시 공시가격", { exact: false })).toBeVisible();
    await expect(dialog.getByText("임대료 증액 5% 이하 충족", { exact: false })).toBeVisible();
  });

  test("모달 ④ 특수 배제 — 부득이한 사유 토글 ON → 거주기간 노출", async ({ page }) => {
    await gotoHoldingStepWithTwoHouses(page);
    await page.getByRole("button", { name: /주택 추가/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 3000 });

    await expect(dialog.getByText("특수 배제 사유", { exact: false })).toBeVisible();
    await dialog.getByRole("switch", { name: /부득이한 사유 취득 주택/ }).click();
    await expect(dialog.getByText("거주기간 (년)", { exact: false })).toBeVisible();
    await expect(dialog.getByText("사유 해소일", { exact: false })).toBeVisible();
  });

  test("양도 주택 3주택+ 전용 배제 특례 — 주택수 3채 시 섹션 노출", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    // 주택수 3채 이상
    await page.getByRole("button", { name: "3채 이상", exact: true }).click();

    await expect(page.getByText("양도 주택 중과배제 특례", { exact: false })).toBeVisible();
    // 사원용 주택 토글 ON → 무상 제공 기간 노출
    await page.getByRole("switch", { name: /사원용 주택/ }).click();
    await expect(page.getByText("무상 제공 기간 (년)", { exact: false })).toBeVisible();
  });

  test("분양권·입주권 추가 → 종류·취득일·지역 입력 노출", async ({ page }) => {
    await gotoHoldingStepWithTwoHouses(page);

    // 분양권·입주권 섹션 노출 확인
    await expect(page.getByText("분양권·입주권", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/2021\.1\.1 이후 취득/)).toBeVisible();

    // 추가 (houses "+ 주택 추가"와 구분되는 "+ 추가")
    await page.getByRole("button", { name: "+ 추가", exact: true }).click();

    // 입력 행 노출: 종류 RadioCardGroup 옵션(조합원입주권 — exact: 힌트 문구 substring 충돌 회피)·삭제 버튼
    await expect(page.getByText("조합원입주권", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /분양권·입주권 1 삭제/ })).toBeVisible();
  });
});
