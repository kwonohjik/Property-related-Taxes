/**
 * E2E: 상속세 사전증여 후속 B·C
 *
 * B — 상속세 모드 giftTaxBase 직접 입력: 자녀 수증 시 "과세표준 산정 방식"
 *     RadioCardGroup 노출 → 직접 입력 선택 → 증여 과세표준 입력 → 계산.
 * C — 증여 당시 미성년 토글: 자녀(birthDate 미입력) 수증 시 "증여 당시 미성년이었음"
 *     ToggleCard 노출 → ON → 계산 (§53 직계존속 미성년 2천 분기).
 *
 * Plan:   docs/00-pm/inheritance-prior-gift-followup-3items.plan.md
 * UI 설계: docs/02-design/features/inheritance-prior-gift-followup-3items.ui.design.md
 */
import { test, expect } from "@playwright/test";
import { addHeir, addLandAsset, closePriorGiftModal } from "./_helpers/tax-flow";

async function gotoStep3WithChild(page: import("@playwright/test").Page) {
  await page.goto("/calc/inheritance-tax");

  // Step0: 상속개시일 2024-6-1 + 자녀 1명
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("1");
  // 자녀를 주민번호 없이 추가 → birthDate 미도출 → C의 "증여 당시 미성년" 수동 토글 노출 조건 충족.
  // (RRN 입력 시 HeirEditor가 birthDate를 자동 도출 → MinorAtGiftToggleBlock이 자동판정 안내로 분기되어 토글 미표시)
  // Step0 진행은 deathDate + 상속인 1명만 요구(collectStepErrors step 0) — RRN 미입력도 네비 가능.
  await addHeir(page, "heir", "child", { residentNumber: "" });
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

  // Step1: 토지 자산 3억 (자산 종류 picker 라벨 변경 + 추가 직후 편집 모달 자동 오픈 →
  // 공용 addLandAsset 헬퍼로 면적·단가 입력 후 모달 자동 닫음). 추정상속재산 산정용 estate.
  await addLandAsset(page, { area: "300", unitPrice: "1000000" });
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step2
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step3 (사전증여)

  // Step3: 사전증여 추가 (추가 직후 편집 모달 자동 오픈)
  await page.getByRole("button", { name: /사전증여 추가/ }).click();
  await expect(page.getByTestId("prior-gift-edit-dialog")).toBeVisible({
    timeout: 5_000,
  });

  // 증여일 2023-6-10 (모달 내부 — .last())
  await page.getByRole("textbox", { name: "연도" }).last().fill("2023");
  await page.getByRole("textbox", { name: "월" }).last().fill("6");
  await page.getByRole("textbox", { name: "일" }).last().fill("10");

  // 수증자 = 자녀 → doneeRelation lineal_descendant 파생
  const doneeSelect = page
    .getByRole("combobox")
    .filter({ has: page.getByRole("option", { name: "자녀", exact: true }) });
  await doneeSelect.selectOption({ label: "자녀" });
}

test.describe("상속세 사전증여 후속 B·C", () => {
  test("B: 자녀 수증 → 과세표준 산정 방식 노출 → 직접 입력 → 증여 과세표준 입력 → 계산", async ({
    page,
  }) => {
    await gotoStep3WithChild(page);

    // 증여재산가액 입력
    await page.getByPlaceholder("금액 입력").last().fill("150000000");

    // B 위젯: "과세표준 산정 방식" 노출
    await expect(page.getByText("과세표준 산정 방식")).toBeVisible();

    // 직접 입력 선택
    await page.getByText("직접 입력 (증여세 신고서 과세표준)").click();

    // 증여 과세표준 입력란 노출 + 입력
    const taxBaseInput = page
      .getByText("증여 과세표준", { exact: true })
      .locator("..")
      .getByRole("textbox");
    await expect(taxBaseInput).toBeVisible();
    await taxBaseInput.fill("50000000");

    // 계산 진행 (편집 모달 닫고 다음 → 결과까지)
    await closePriorGiftModal(page);
    await page.getByRole("button", { name: /^다음/ }).click();
    // 결과/후속 단계 도달 — 크래시 없이 진행됨을 확인
    await expect(page.getByText("과세표준 산정 방식")).toHaveCount(0);
  });

  test("C: 자녀(생년월일 미입력) 수증 → '증여 당시 미성년' 토글 노출 → ON", async ({
    page,
  }) => {
    await gotoStep3WithChild(page);

    await page.getByPlaceholder("금액 입력").last().fill("100000000");

    // C 토글: birthDate 미입력 자녀 → "증여 당시 미성년이었음" 노출 (ToggleCard — Switch role)
    const minorToggle = page.getByRole("switch", { name: "증여 당시 미성년이었음" });
    await expect(minorToggle).toBeVisible();

    // 토글 ON
    await minorToggle.click();

    // 자동 도출 모드(기본)이므로 계산 진행 가능 (편집 모달 닫고 다음)
    await closePriorGiftModal(page);
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("증여 당시 미성년이었음")).toHaveCount(0);
  });
});
