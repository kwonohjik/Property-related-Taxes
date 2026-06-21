import { test, expect } from "@playwright/test";
import { fillDateAndVerify, nextSteps, calcAndWaitResult } from "./_helpers/tax-flow";

/**
 * E2E: 증여세 대납(代納) gross-up (§36 채무면제이익)
 *
 * 테스트 시나리오:
 *   E-1: 대납 ON → gross-up 적용됨 (applied 섹션 노출, 흐름 표시 확인)
 *   E-2: 대납 ON + 연대납세의무 ON → gross-up 미적용 안내 (amber 카드 노출)
 *   E-3: 동시증여 + 대납 → validateStep 차단 오류 메시지
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 * 포트: E2E_PORT=3103 (worktree 격리)
 *
 * selector 설계 원칙:
 *  - ToggleCard 토글: getByText()는 lawLinks 배지를 클릭해 법조문 모달이 열릴 위험 →
 *    getByRole("switch", { name: ... }) 로 Switch 직접 클릭.
 *  - CurrencyInput 금액 입력: hideLabel 없는 label 요소는 for/id 미연결 →
 *    dialog.getByLabel("현금 금액") 는 aria-label로 연결 (hideLabel=true 시 aria-label 설정됨).
 *    현금 모달에서는 hideLabel=true 이므로 getByLabel("현금 금액") 사용.
 */

async function gotoGiftTax(page: Parameters<typeof fillDateAndVerify>[0]) {
  await page.goto("/calc/gift-tax");
}

async function fillStep0(page: Parameters<typeof fillDateAndVerify>[0]) {
  await fillDateAndVerify(page, { year: "2025", month: "6", day: "15" });
  // 증여자 — 기본값(부, 직계존속 성년) 유지
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1
}

/**
 * 현금 자산 추가 (Step1 증여재산 탭 기준).
 *
 * 플로:
 *  1. "증여재산 추가" 버튼 → 자산 추가 패널 오픈
 *  2. "현금" 카테고리 버튼 → 자산 추가 + 편집 모달 자동 오픈 (PropertyValuationForm E-1 동작)
 *  3. 편집 모달(role="dialog") 안에서 "현금 금액" CurrencyInput에 금액 입력
 *     - EstateBodySimple에서 CurrencyInput label="현금 금액" hideLabel=true → aria-label="현금 금액" 설정됨
 *  4. "닫기" 버튼으로 모달 닫기
 */
async function addCashAsset(page: Parameters<typeof fillDateAndVerify>[0], amount: string) {
  await page.getByRole("button", { name: /증여재산 추가/ }).click();
  await page.getByRole("button", { name: /현금$/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // 현금 금액 필드 — EstateBodySimple: CurrencyInput label="현금 금액" hideLabel=true → aria-label
  await dialog.getByLabel("현금 금액").fill(amount);
  await dialog.getByRole("button", { name: "닫기" }).click();
  // 모달이 닫힌 것 확인 (다음 버튼 클릭 전 backdrop 제거 보장)
  await expect(dialog).not.toBeVisible();
}

test.describe("증여세 대납(代納) gross-up (§36)", () => {
  test("E-1: 대납 ON → 결과화면에 gross-up 상세 섹션 노출", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoGiftTax(page);
    await fillStep0(page);

    // Step1: 현금 5억
    await addCashAsset(page, "500000000");
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step2

    // Step2: 비과세 건너뜀
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step3 (공제·세액공제)

    // Step3(공제·세액공제): 대납 ToggleCard ON
    // Switch를 직접 클릭 — getByText()는 lawLinks 배지를 오매칭할 위험
    // 실제 title: "증여자가 수증자의 증여세를 대납(代納)합니까? (§36)"
    const donorPaysSwitch = page.getByRole("switch", {
      name: /증여자가 수증자의 증여세를 대납/,
    });
    await expect(donorPaysSwitch).toBeVisible();
    await donorPaysSwitch.click();

    // 대납 ON 후 연대납세의무 카드 노출 확인
    // 실제 title: "증여자가 해당 증여의 연대납세의무자(§4의2⑥)이었습니까?"
    await expect(
      page.getByRole("switch", { name: /연대납세의무자/ }),
    ).toBeVisible();

    // 계산
    await calcAndWaitResult(page, { taxType: "gift" });

    // 결과 화면 — gross-up 섹션 노출
    await expect(
      page.getByText("대납(代納) gross-up 상세 (§36 채무면제이익)"),
    ).toBeVisible();

    // 흐름 표시 확인 — 신규 라벨 (부분 대납 확장 후)
    await expect(page.getByText(/증여자 대납분 \(총세액 − 수증자 납부\)/)).toBeVisible();
    await expect(page.getByText(/gross-up 후 최종 과세표준/)).toBeVisible();
    await expect(page.getByText(/원본 증여세 과세가액/)).toBeVisible();

    // 반복 횟수 표시 (수렴 비교용 줄)
    await expect(page.getByText(/수렴 비교용, 반복/)).toBeVisible();

    // 흐름 식 표시 — 증여자 대납분 라벨 + 최종 과표
    await expect(page.getByText(/\(증여자 대납분\)/)).toBeVisible();
    await expect(page.getByText(/\(최종 과표\)/)).toBeVisible();
  });

  test("E-2: 대납 ON + 연대납세의무 ON → gross-up 미적용 amber 안내 노출", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await gotoGiftTax(page);
    await fillStep0(page);

    // Step1: 현금 5억
    await addCashAsset(page, "500000000");
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step2

    // Step2: 건너뜀
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step3

    // Step3: 대납 ON
    await page.getByRole("switch", { name: /증여자가 수증자의 증여세를 대납/ }).click();

    // 연대납세의무 ON
    // 실제 title: "증여자가 해당 증여의 연대납세의무자(§4의2⑥)이었습니까?"
    const jointLiabilitySwitch = page.getByRole("switch", { name: /연대납세의무자/ });
    await expect(jointLiabilitySwitch).toBeVisible();
    await jointLiabilitySwitch.click();

    // amber 인라인 안내 노출 (ToggleCard 내 조건부 div)
    // 실제 텍스트: "연대납세의무자가 납부한 세액은 채무면제이익에 해당하지 않아 gross-up 계산이 생략됩니다 (§4의2⑥)."
    await expect(
      page.getByText(/연대납세의무자가 납부한 세액은 채무면제이익에 해당하지 않아/),
    ).toBeVisible();

    // 계산
    await calcAndWaitResult(page, { taxType: "gift" });

    // 결과: gross-up 상세 섹션은 미노출, 대신 amber 안내 노출
    await expect(
      page.getByText("대납(代納) gross-up 상세 (§36 채무면제이익)"),
    ).toHaveCount(0);
    // 실제 결과뷰 amber 텍스트:
    // "gross-up 계산이 적용되지 않았습니다"
    await expect(
      page.getByText(/gross-up 계산이 적용되지 않았습니다/),
    ).toBeVisible();
  });

  test("E-3: 동시증여 ON + 대납 ON → validateStep 차단 오류 메시지", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await gotoGiftTax(page);
    await fillStep0(page);

    // Step1: 현금 5억
    await addCashAsset(page, "500000000");
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step2

    // Step2: 건너뜀
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step3

    // Step3: 동시증여 ON — Switch 직접 클릭
    // getByText() 사용 시 lawLinks="상증령" 배지(§46①)를 클릭해 법조문 모달이 열릴 위험
    // 실제 title: "같은 날 다른 증여자로부터도 받았나요? (동시증여 안분)"
    const simultaneousSwitch = page.getByRole("switch", {
      name: /같은 날 다른 증여자로부터도 받았나요/,
    });
    await simultaneousSwitch.click();

    // ToggleCard children(+ 동시증여 추가 버튼) 노출 확인
    // 실제 버튼 텍스트: "+ 동시증여 추가"
    await expect(page.getByRole("button", { name: /동시증여 추가/ })).toBeVisible();

    // 동시증여 항목 추가 (simultaneousGifts.length > 0 이어야 차단 트리거)
    await page.getByRole("button", { name: /동시증여 추가/ }).click();

    // 동시증여 과세가액 입력 — 비워두면 "과세가액을 입력하세요" 오류가 먼저 나와 대납 차단 미도달
    // CurrencyInput(placeholder="금액 입력", hideLabel 없음) → getByPlaceholder로 찾음
    await page.getByPlaceholder("금액 입력").first().fill("100000000");

    // 대납 ON — Switch 직접 클릭
    // 실제 title: "증여자가 수증자의 증여세를 대납(代納)합니까? (§36)"
    await page.getByRole("switch", { name: /증여자가 수증자의 증여세를 대납/ }).click();

    // "계산하기" 시 validateStep 차단 — 오류 메시지 노출 (계산이 안 됨)
    // validateStep: "동시증여와 대납(代納)은 현재 함께 계산할 수 없습니다"
    await page.getByRole("button", { name: /계산하기/ }).click();
    await expect(
      page.getByText("동시증여와 대납(代納)은 현재 함께 계산할 수 없습니다"),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 부분 대납 신규 케이스 (feat/gift-partial)
  // ─────────────────────────────────────────────────────────────────────

  test("E-4: 부분 대납 — 수증자 납부액 5천만 입력 후 증여자 대납분 섹션 확인", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await gotoGiftTax(page);
    await fillStep0(page);

    // Step1: 현금 5억
    await addCashAsset(page, "500000000");
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step2

    // Step2: 건너뜀
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step3

    // Step3: 대납 ON + 연대의무 OFF(기본) + 수증자 납부액 입력
    await page.getByRole("switch", { name: /증여자가 수증자의 증여세를 대납/ }).click();

    // 연대납세의무 스위치 노출 확인 (대납 ON children 렌더 확인)
    await expect(page.getByRole("switch", { name: /연대납세의무자/ })).toBeVisible();

    // 수증자 본인 납부액 칸 노출 확인 — aria-label="수증자 본인 납부액" (hideLabel=true)
    await expect(page.getByLabel("수증자 본인 납부액")).toBeVisible();

    // 5천만 입력
    await page.getByLabel("수증자 본인 납부액").fill("50000000");

    await calcAndWaitResult(page, { taxType: "gift" });

    // gross-up 섹션 노출
    await expect(page.getByText("대납(代納) gross-up 상세 (§36 채무면제이익)")).toBeVisible();

    // 5행 구조 확인 (신규 행 포함)
    await expect(page.getByText("총 결정세액 (수렴값)")).toBeVisible();
    await expect(page.getByText("수증자 본인 납부")).toBeVisible();
    await expect(page.getByText("증여자 대납분 (총세액 − 수증자 납부)")).toBeVisible();
    await expect(page.getByText("gross-up 후 최종 과세표준")).toBeVisible();

    // 흐름행 — 증여자 대납분 라벨 확인
    await expect(page.getByText(/\(증여자 대납분\)/)).toBeVisible();
    await expect(page.getByText(/\(최종 과표\)/)).toBeVisible();
  });

  test("E-5: 수증자 납부액 ≥ 총세액 → 증여자 대납분 없음 안내 노출", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoGiftTax(page);
    await fillStep0(page);

    // Step1: 현금 5억
    await addCashAsset(page, "500000000");
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step2

    // Step2: 건너뜀
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step3

    // Step3: 대납 ON + 수증자 납부액 2억 (총세액 초과)
    await page.getByRole("switch", { name: /증여자가 수증자의 증여세를 대납/ }).click();
    await expect(page.getByLabel("수증자 본인 납부액")).toBeVisible();
    await page.getByLabel("수증자 본인 납부액").fill("200000000");

    await calcAndWaitResult(page, { taxType: "gift" });

    // D=0 안내 노출
    await expect(page.getByText("재차증여 해당 없음")).toBeVisible();
  });

  test("E-6: 수증자 납부액 미입력 → 전액 대납 기존 동작 회귀 (③행 미노출)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await gotoGiftTax(page);
    await fillStep0(page);

    // Step1: 현금 5억
    await addCashAsset(page, "500000000");
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step2

    // Step2: 건너뜀
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step3

    // Step3: 대납 ON + 수증자 납부액 미입력(기본 빈값)
    await page.getByRole("switch", { name: /증여자가 수증자의 증여세를 대납/ }).click();
    // 수증자 납부액 칸 노출만 확인, 값은 입력 안 함
    await expect(page.getByLabel("수증자 본인 납부액")).toBeVisible();

    await calcAndWaitResult(page, { taxType: "gift" });

    // gross-up 섹션 노출 (전액 대납 기존 동작)
    await expect(page.getByText("대납(代納) gross-up 상세 (§36 채무면제이익)")).toBeVisible();

    // ③행(수증자 본인 납부)은 P=0이므로 미노출
    await expect(page.getByText("수증자 본인 납부")).not.toBeVisible();

    // 기존 라벨이 정밀화되어도 섹션 자체는 표시
    await expect(page.getByText("증여자 대납분 (총세액 − 수증자 납부)")).toBeVisible();
  });
});
