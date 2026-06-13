/**
 * E2E: 상속세 Step4 공제 체크리스트 패널 동작 검증 (2026-06-13)
 *
 * 설계:
 *  - 디폴트 접힘: Step4 진입 시 그룹 4개 모두 접힘. 체크리스트 패널 + 그룹 헤더만 노출.
 *  - 자동 항목(배우자·금융·동거주택·영농): 칩 클릭 → 그룹 A 자동 펼침 + 입력란 노출
 *  - 수동 항목: 칩 체크 → 해당 그룹 자동 펼침 + 입력 섹션 노출, 해제 시 섹션 숨김(값 보존)
 *  - casualtyLoss 칩 = casualtyLossEnabled 직접 토글 (단일 진실)
 *
 * 검증 시나리오:
 *  ① 배우자 추가 → Step4에 배우자 §19 입력란 노출 (체크박스 없이 자동, 칩 클릭→그룹A 펼침)
 *  ② 수동 외국납부 칩 체크 → 그룹 C 자동 펼침 → 입력란 노출 → 입력 → 결과에 공제 반영
 *  ③ 수동 칩 해제 → 입력란 숨김 + 값 보존(재체크 시 복구) + 계산에서 제외
 *  ④ 그룹 C 헤더 열기 → 수동 항목 모두 비체크 시 안내문 노출
 */

import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  addLandAsset,
  nextSteps,
  calcAndWaitResult,
  addHeir,
} from "./_helpers/tax-flow";

/** Step0(2024-06-10 + 자녀1) → Step1(토지 30억) → 다음×3 → Step4 */
async function gotoStep4(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });

  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

  await addLandAsset(page, { area: "300", unitPrice: "10000000" });
  await nextSteps(page, 3); // → Step2 → Step3 → Step4
}

/** Step0(2024-06-10 + 배우자1) → Step1(토지 20억) → 다음×3 → Step4 */
async function gotoStep4WithSpouse(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });

  await addHeir(page, "heir", "spouse");
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

  await addLandAsset(page, { area: "200", unitPrice: "10000000" });
  await nextSteps(page, 3); // → Step4
}

test.describe("Step4 공제 체크리스트 — 자동 항목 칩 클릭 → 그룹 A 펼침 + 입력란 노출", () => {
  test("CL-E2E-1: 배우자 추가 → 칩 클릭 → Step4 배우자 §19 입력란 노출", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoStep4WithSpouse(page);

    // 체크리스트 패널 배우자 칩: "자동 도출" 배지 (autoDetected=true)
    // 배우자 칩은 button으로 변경됨 — button role로 찾기
    const spouseChip = page.getByRole("button", { name: /배우자 공제 §19/ }).first();
    await expect(spouseChip).toBeVisible();
    await expect(spouseChip.getByText("자동 도출")).toBeVisible();

    // 칩 클릭 → 그룹 A 펼침 → 배우자 입력란 노출
    await spouseChip.click();
    await expect(page.getByText("배우자 실제 상속액 (§19)")).toBeVisible();
  });

  test("CL-E2E-2: 금융·동거주택·영농 — 칩 클릭 → 그룹 A 펼침 → 입력란 노출", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStep4(page);

    // 디폴트 접힘 — 자녀만 있어도 처음엔 입력란 미노출
    await expect(page.getByText("순 금융재산 (§22 금융재산공제용)")).toBeHidden();

    // 자동 항목 칩(금융재산) 클릭 → 그룹 A 자동 펼침
    await page.getByRole("button", { name: /금융재산공제 §22/ }).click();

    // 그룹 A 펼침 → 입력란 노출
    await expect(page.getByText("순 금융재산 (§22 금융재산공제용)")).toBeVisible();
    await expect(page.getByText("동거주택 공시가격 (§23의2)")).toBeVisible();
    await expect(page.getByText("영농상속재산가액 (§18의3)")).toBeVisible();
  });
});

test.describe("Step4 공제 체크리스트 — 수동 항목 게이팅", () => {
  test("CL-E2E-3: 외국납부 칩 체크 → 입력란 노출 → 결과 반영", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStep4(page);

    // 초기: 외국납부 입력란 미노출
    await expect(page.getByText("외국납부세액공제 (§29)")).not.toBeVisible();

    // 체크리스트 칩 클릭 → 노출
    await page.getByText("외국납부세액공제 §29").click();
    await expect(page.getByText("외국납부세액공제 (§29)")).toBeVisible();

    // 입력
    await page.getByLabel("외국에서 납부한 상속세액").fill("50000000");
    await page.getByLabel("국외 상속재산 과세표준").fill("200000000");

    await calcAndWaitResult(page);

    // 결과: 외국납부세액공제 행 노출
    await expect(page.getByText("외국납부세액공제", { exact: true })).toBeVisible();
  });

  test("CL-E2E-4: 수동 칩 해제 → 섹션 숨김 + 값 보존 + 재체크 시 복구", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoStep4(page);

    // 외국납부 칩 체크 → 노출
    await page.getByText("외국납부세액공제 §29").click();
    await expect(page.getByText("외국납부세액공제 (§29)")).toBeVisible();

    // 값 입력
    await page.getByLabel("외국에서 납부한 상속세액").fill("50000000");

    // 칩 해제 → 섹션 숨김
    await page.getByText("외국납부세액공제 §29").click();
    await expect(page.getByText("외국납부세액공제 (§29)")).not.toBeVisible();

    // 재체크 → 섹션 복구 + 값 유지 (store에 보존됨)
    await page.getByText("외국납부세액공제 §29").click();
    await expect(page.getByText("외국납부세액공제 (§29)")).toBeVisible();
    await expect(page.getByLabel("외국에서 납부한 상속세액")).toHaveValue("50,000,000");
  });

  test("CL-E2E-5: 그룹 C 헤더 클릭 → 수동 항목 모두 비체크 시 안내문 노출", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStep4(page);

    // 디폴트 접힘 — 안내문은 그룹 C 본문 안에 있으므로 처음엔 미노출
    await expect(
      page.getByText("외국납부세액공제·단기재상속공제가 해당하면 위 체크리스트에서 선택하세요."),
    ).toBeHidden();

    // 그룹 C 헤더 클릭 → 펼침
    await page.getByRole("button", { name: /신고 상태·외국납부/ }).click();

    // 수동 항목 모두 비체크(초기 상태) → C그룹 안내문 노출
    await expect(
      page.getByText("외국납부세액공제·단기재상속공제가 해당하면 위 체크리스트에서 선택하세요."),
    ).toBeVisible();

    // 칩 체크 → C그룹이 이미 열려 있고 입력란 노출 + 안내문 사라짐
    await page.getByText("외국납부세액공제 §29").click();
    await expect(
      page.getByText("외국납부세액공제·단기재상속공제가 해당하면 위 체크리스트에서 선택하세요."),
    ).not.toBeVisible();
  });
});
