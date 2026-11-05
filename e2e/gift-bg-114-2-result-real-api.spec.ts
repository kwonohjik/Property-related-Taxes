/**
 * 브라우저 확인(V-7 PR-2 잔여) — 증여세 마법사 부담부증여 일체 주택 신축 × 환산(K-5)의 **결과 화면 가산세 금액**을 실제 양도세 API로 확인한다.
 *
 * 계획서: docs/02-design/features/bg-housing-114-2-building-base.plan.md §7
 * 종전 `gift-burdened-transfer-acq-method.spec.ts` [P114-E2E]는 양도세 API를 모킹해 요청 body까지만 봤다. 여기서는 모킹하지 않는다
 * (화면 → ④ → ⑫ → 엔진 → 결과 카드 ⑦).
 *
 * 시료: 증여일(=양도일) 2024-06-15 · 시가 800,000,000 · 인수 채무 200,000,000(채무비율 0.25) · 신축 2021-01-10(취득일 같음)
 *   · 주택 공시가격 취득 당시 300,000,000 · 양도 당시 350,000,000 · 건물분 칸: 토지 ㎡당 1,000,000 × 100㎡ · 건물 기준시가 100,000,000(취득·양도 같음)
 * 손계산(엔진 헬퍼 `bgHousingBuildingPenaltyBase` 산식 S_b × B_acq ÷ B_tr):
 *   S = 800,000,000 × 0.25 = 200,000,000 → 건물분 S_b = 200,000,000 × 1억 ÷ 2억 = 100,000,000
 *   B_acq = 300,000,000 − ⌊300,000,000 × 1억 ÷ 2억⌋ = 150,000,000 · B_tr = 350,000,000 − 175,000,000 = 175,000,000
 *   기준액 = ⌊100,000,000 × 150,000,000 ÷ 175,000,000⌋ = 85,714,285 → 가산세 ⌊× 5%⌋ = 4,285,714
 *   (V-7 전 주택 전체: 200,000,000 × 3억 ÷ 3.5억 = 171,428,571 → 8,571,428)
 * 스크린샷: `e2e/_artifacts/v7-browser/gift-result.png`. headless 자동 확인이다(사람이 눈으로 본 것은 아니다).
 */
import { test, expect } from "@playwright/test";
import { fillAndVerify } from "./_helpers/tax-flow";
import { addApartmentWithDebt, enableBurdenedTransferToggle, giftStep0 } from "./_helpers/gift-burdened-transfer";

const PENALTY_LABEL = "감정가액 또는 환산취득가액 적용 가산세 (§114조의2①)";

test("GBV-1 증여세 마법사 · 일체 주택 신축 × 환산 — 실제 API 결과 화면 가산세 4,285,714(건물분)", async ({ page }) => {
  test.setTimeout(180_000);
  await giftStep0(page);
  const dialog = await addApartmentWithDebt(page);
  await enableBurdenedTransferToggle(dialog);

  // 취득일(=신축일) · 취득·양도 당시 공동주택공시가격
  await dialog.getByRole("textbox", { name: "연도" }).last().fill("2021");
  await dialog.getByRole("textbox", { name: "월" }).last().fill("1");
  await dialog.getByRole("textbox", { name: "일" }).last().fill("10");
  await fillAndVerify(dialog.getByRole("textbox", { name: "취득시 공동주택공시가격 (원)" }), "300000000");
  await fillAndVerify(dialog.getByRole("textbox", { name: "양도시 공동주택공시가격 (원)" }), "350000000");

  // 환산(K-5) + 신축
  await dialog.getByTestId("bg-acq-method-converted").check();
  const selfBuiltToggle = dialog.getByRole("switch", { name: /신축·증축 건물/ });
  await selfBuiltToggle.click();
  await expect(selfBuiltToggle).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("textbox", { name: "연도" }).last().fill("2021");
  await dialog.getByRole("textbox", { name: "월" }).last().fill("1");
  await dialog.getByRole("textbox", { name: "일" }).last().fill("10");

  // 건물분 칸(V-7)
  await expect(dialog.getByTestId("gift-bg-self-built-housing")).toBeVisible();
  await dialog.getByTestId("gift-bg-sbh-land-persqm-acq").fill("1000000");
  await dialog.getByTestId("gift-bg-sbh-land-area").fill("100");
  await dialog.getByTestId("gift-bg-sbh-building-std-acq").fill("100000000");
  await dialog.getByTestId("gift-bg-sbh-land-persqm-transfer").fill("1000000");
  await dialog.getByTestId("gift-bg-sbh-building-std-transfer").fill("100000000");

  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();

  const transferResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const res = await transferResponse;
  const body = JSON.parse(res.request().postData() ?? "{}") as Record<string, unknown>;
  const json = (await res.json()) as { data?: { result?: Record<string, unknown> }; error?: unknown };
  expect(res.status(), JSON.stringify(json.error ?? null)).toBe(200);
  const result = json.data!.result!;

  // 요청 body — 건물분 칸이 실렸다
  expect(body.isSelfBuilt).toBe(true);
  expect(body.selfBuiltHousing).toEqual({
    landPricePerSqmAtAcquisition: 1_000_000, landArea: 100, buildingStdPriceAtAcquisition: 100_000_000,
    landStdPriceAtTransfer: 100_000_000, buildingStdPriceAtTransfer: 100_000_000,
  });
  // 엔진 응답 — 건물분 기준액의 5%
  expect(result.penaltyTax).toBe(4_285_714);

  // 결과 화면 — 가산세 행이 응답과 같은 금액을 보인다
  const label = page.getByText(PENALTY_LABEL, { exact: true });
  await expect(label).toBeVisible({ timeout: 30_000 });
  const row = label.locator("xpath=..");
  await expect(row).toContainText("4,285,714");
  await row.locator("xpath=..").screenshot({ path: "e2e/_artifacts/v7-browser/gift-result.png" });
});
