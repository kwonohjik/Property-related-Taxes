/**
 * E2E: 부담부증여 양도소득세 — 취득가액 「매매사례가액(K-6)·감정가액(K-7)」 (증여세 마법사)
 *
 * 양도세 화면(`transfer-burdened-gift-presumed-acquisition.spec.ts`)과 같은 엔진·Zod를 쓰지만 입력 모델이 달라
 * (증여 category는 general_building이 없어 금액이 **한 칸**) 마법사 쪽을 따로 고정한다.
 * 계획서: docs/00-pm/burdened-gift-appraisal-gift-wizard.plan.md
 *
 *   PG-1. 라디오 4옵션 · 선택 시 입력 칸·개산공제 안내 · 감정가액에서만 신축 위젯 · 매매사례가액으로 바꾸면 값 초기화
 *   PG-2. 감정가액 + 신축 → body에 방식·금액·신축 필드가 실리고 실비는 0
 *   PG-3. 매매사례가액 → body에 신축 필드가 실리지 않는다(조문에 없음)
 *   PG-4. 감정가액 + 증축(85㎡ 초과) 5년 이내 → 안내 카드(계산 불가)
 *
 * 셀렉터·모킹 정책은 `gift-burdened-transfer.spec.ts` 머리 주석과 같다(API는 모킹, body만 검증).
 */
import { test, expect } from "@playwright/test";
import { fillAndVerify } from "./_helpers/tax-flow";
import {
  addApartmentWithDebt,
  enableBurdenedTransferToggle,
  fillApartmentTransferInfo,
  giftStep0,
  setupTransferApiMock,
} from "./_helpers/gift-burdened-transfer";

type Dialog = Awaited<ReturnType<typeof addApartmentWithDebt>>;

async function openMarketApartment(page: Parameters<typeof giftStep0>[0]): Promise<Dialog> {
  await giftStep0(page);
  const dialog = await addApartmentWithDebt(page); // 증여재산 평가: 시가 8억 · 채무 2억
  await enableBurdenedTransferToggle(dialog);
  await fillApartmentTransferInfo(dialog, { acquisitionMethod: "none" });
  return dialog;
}

const presumedInput = (dialog: Dialog) => dialog.getByTestId("bg-presumed-acq-total");

async function fillBuildingDate(dialog: Dialog, y: string, m: string, d: string) {
  await dialog.getByRole("textbox", { name: "연도" }).last().fill(y);
  await dialog.getByRole("textbox", { name: "월" }).last().fill(m);
  await dialog.getByRole("textbox", { name: "일" }).last().fill(d);
}

async function calculate(page: Parameters<typeof giftStep0>[0], dialog: Dialog) {
  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  const transferResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  await transferResponse;
}

test.describe("부담부증여 양도세 — 매매사례가액·감정가액 (K-6/K-7, 증여세 마법사)", () => {
  test("PG-1: 라디오 4옵션 · 입력 칸 · 감정가액에서만 신축 위젯 · 방식 전환 시 값 초기화", async ({ page }) => {
    test.setTimeout(120_000);
    await setupTransferApiMock(page);
    const dialog = await openMarketApartment(page);

    for (const id of ["actual", "sales-case", "appraisal", "converted"]) {
      await expect(dialog.getByTestId(`bg-acq-method-${id}`)).toBeVisible();
    }

    // 감정가액 → 입력 칸 + 개산공제 안내 + 신축 위젯
    await dialog.getByTestId("bg-acq-method-appraisal").check();
    await expect(presumedInput(dialog)).toBeVisible();
    await expect(dialog.getByTestId("bg-presumed-expense-notice")).toContainText("자본적지출·양도비는 공제하지 않습니다");
    await expect(dialog.getByRole("switch", { name: /신축·증축 건물/ })).toBeVisible();
    await fillAndVerify(presumedInput(dialog), "250000000");

    // 매매사례가액으로 전환 → 금액 초기화 + 신축 위젯 사라짐(§114조의2 대상 아님)
    await dialog.getByTestId("bg-acq-method-sales-case").check();
    await expect(presumedInput(dialog)).toHaveValue("");
    await expect(dialog.getByRole("switch", { name: /신축·증축 건물/ })).toHaveCount(0);

    // 환산·실지로 가면 새 입력 블록이 사라진다(회귀 0)
    await dialog.getByTestId("bg-acq-method-converted").check();
    await expect(dialog.getByTestId("bg-presumed-expense-notice")).toHaveCount(0);
    await dialog.getByTestId("bg-acq-method-actual").check();
    await expect(dialog.getByTestId("bg-presumed-expense-notice")).toHaveCount(0);
  });

  test("PG-2: 감정가액 + 신축 → body 방식·금액·신축 필드 · 실비 0", async ({ page }) => {
    test.setTimeout(120_000);
    const mock = await setupTransferApiMock(page);
    const dialog = await openMarketApartment(page);
    await dialog.getByTestId("bg-acq-method-appraisal").check();
    await fillAndVerify(presumedInput(dialog), "250000000");
    const selfBuilt = dialog.getByRole("switch", { name: /신축·증축 건물/ });
    await selfBuilt.click();
    await expect(selfBuilt).toHaveAttribute("aria-checked", "true");
    await fillBuildingDate(dialog, "2021", "1", "10");
    await calculate(page, dialog);

    expect(mock.bodies.length, "양도세 API 호출").toBeGreaterThan(0);
    const body = mock.bodies[0];
    const info = body.burdenedGiftInfo as Record<string, unknown>;
    expect(info.acquisitionMethod).toBe("appraisal");
    expect(info.presumedAcquisitionTotal).toBe(250_000_000);
    expect(info.actualAcquisitionTotal).toBeUndefined();
    expect(body.isSelfBuilt).toBe(true);
    expect(body.buildingType).toBe("new");
    expect(body.constructionDate).toBe("2021-01-10");
    expect(body.capitalExpenditure).toBe(0);
    expect(body.transferExpense).toBe(0);
  });

  test("PG-3: 매매사례가액 → body 금액만, 신축 필드는 실리지 않는다", async ({ page }) => {
    test.setTimeout(120_000);
    const mock = await setupTransferApiMock(page);
    const dialog = await openMarketApartment(page);
    await dialog.getByTestId("bg-acq-method-sales-case").check();
    await fillAndVerify(presumedInput(dialog), "250000000");
    await calculate(page, dialog);

    const body = mock.bodies[0];
    const info = body.burdenedGiftInfo as Record<string, unknown>;
    expect(info.acquisitionMethod).toBe("salesCase");
    expect(info.presumedAcquisitionTotal).toBe(250_000_000);
    expect(body.isSelfBuilt).toBeUndefined();
  });

  test("PG-4: 감정가액 + 증축(85㎡ 초과) 5년 이내 → 계산 불가 안내", async ({ page }) => {
    test.setTimeout(120_000);
    await setupTransferApiMock(page);
    const dialog = await openMarketApartment(page);
    await dialog.getByTestId("bg-acq-method-appraisal").check();
    await fillAndVerify(presumedInput(dialog), "250000000");
    const selfBuilt = dialog.getByRole("switch", { name: /신축·증축 건물/ });
    await selfBuilt.click();
    await dialog.getByTestId("bg-building-type-extension").click();
    await fillBuildingDate(dialog, "2022", "1", "1");
    await fillAndVerify(dialog.getByTestId("bg-extension-floor-area"), "100");
    await expect(dialog.getByTestId("bg-appraisal-extension-blocked")).toContainText("증축한 부분만의 감정가액을 입력하는 칸이 아직 없어");
    // 증축부분 취득시 기준시가 칸은 환산 전용 — 감정가액에서는 뜨지 않는다
    await expect(dialog.getByTestId("bg-extension-std-price-at-acq")).toHaveCount(0);
  });
});
