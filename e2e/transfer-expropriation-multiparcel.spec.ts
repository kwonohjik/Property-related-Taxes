/**
 * 다필지 공익수용 §164⑨ 1호 특례 — 필지별 보상 2필드 노출 게이트 E2E.
 *
 * 소득세법 시행령 §164⑨ 1호: 수용 시 양도당시 기준시가를 min[기준시가, 보상액, 보상액 산정
 * 기초 기준시가]로 낮춘다. 다필지는 필지마다 개별공시지가가 달라 **필지별로 독립 판정**되므로
 * 보상 2필드도 자산-수준이 아닌 **필지 카드**에서 입력받는다.
 *
 * 노출 3조건 (AND):
 *   ① 양도원인 = 공익수용        (AssetSectionAcquisition의 showExpropriationMin)
 *   ② 양도일 ≥ 2009.02.04       (동상 — 현행 문언 적용 구간)
 *   ③ 필지 취득방식 = 환산취득가  (ParcelListInput 내부 p.acquisitionMethod)
 *
 * ⚠️ validate(`transfer-tax-validate-asset.ts` validateParcelMode)의 필수 조건과 **동일**해야 한다
 *    — 불일치 시 "UI 통과 ↔ validate 차단" 모순(⑧ 규칙).
 *
 * 엔진 계산 정확성은 anchor가 담당: `__tests__/tax-engine/transfer/expropriation-multiparcel.anchor.test.ts`
 * (세액 86,784,934원 과다 해소 실증). 본 스펙은 **UI 게이트**만 검증한다.
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/transfer-expropriation-multiparcel.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const COMP_PER_SQM = "parcel-0-compensation-per-sqm";
const COMP_BASIS = "parcel-0-compensation-basis-std-price";

/** 토지 자산 + 다필지 모드 진입. transferDate는 폼-전역(양도일). */
async function setupMultiParcelLand(page: Page, transferDate: { y: string; m: string; d: string }) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  const td = page.getByTestId("transfer-date");
  await td.getByLabel("연도").fill(transferDate.y);
  await td.getByLabel("월").fill(transferDate.m);
  await td.getByLabel("일").fill(transferDate.d);

  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: "단순토지" }).click();
  await page.getByText("독립 나대지", { exact: true }).click();

  // ③취득정보 — 다필지 토글(토지 전용). 켜면 필지 1개가 자동 생성되며 기본 산정방식 = 환산취득가.
  await expandAssetSection(page, 3);
  await page.getByRole("switch", { name: /여러 필지를 각각 다른 시기에 취득했나요/ }).click();
  await expect(page.getByText("필지 추가 (1/10)")).toBeVisible();
}

/** ②양도정보 — 양도원인 = 공익수용·협의매수 */
async function selectExpropriation(page: Page) {
  await expandAssetSection(page, 2);
  await page.getByTestId("expr-cause-radio").click();
}

test.describe("다필지 공익수용 §164⑨ 1호 — 필지별 보상 2필드 게이트", () => {
  test("수용 + 양도 2023 + 필지 환산(기본) → 보상 2필드 노출", async ({ page }) => {
    test.setTimeout(90_000);
    await setupMultiParcelLand(page, { y: "2023", m: "05", d: "01" });
    await selectExpropriation(page);

    await expandAssetSection(page, 3);
    await expect(page.getByTestId(COMP_PER_SQM)).toBeVisible();
    await expect(page.getByTestId(COMP_BASIS)).toBeVisible();
    // 근거 표기 — 폐기된 "집행기준 99-164-12"가 아니라 시행령이어야 한다
    await expect(page.getByText("공익수용 양도당시 기준시가 특례 (소득령 §164⑨ 1호)")).toBeVisible();
  });

  test("양도원인 일반(수용 아님) → 미노출", async ({ page }) => {
    test.setTimeout(90_000);
    await setupMultiParcelLand(page, { y: "2023", m: "05", d: "01" });
    // 수용 미선택 — 기본 "general"
    await expect(page.getByTestId(COMP_PER_SQM)).toHaveCount(0);
    await expect(page.getByTestId(COMP_BASIS)).toHaveCount(0);
  });

  test("수용 + 양도 2009.02.03(게이트 경계 직전) → 미노출", async ({ page }) => {
    test.setTimeout(90_000);
    // 현행 3후보 min[]은 현행 문언 전용 — 이전 구간은 미지원(계획 X3).
    await setupMultiParcelLand(page, { y: "2009", m: "02", d: "03" });
    await selectExpropriation(page);

    await expandAssetSection(page, 3);
    await expect(page.getByTestId(COMP_PER_SQM)).toHaveCount(0);
  });

  test("수용 + 양도 2009.02.04(게이트 경계 당일) → 노출", async ({ page }) => {
    test.setTimeout(90_000);
    await setupMultiParcelLand(page, { y: "2009", m: "02", d: "04" });
    await selectExpropriation(page);

    await expandAssetSection(page, 3);
    await expect(page.getByTestId(COMP_PER_SQM)).toBeVisible();
  });

  test("수용 + 필지 산정방식 = 실지취득가 → 미노출 (환산 아님)", async ({ page }) => {
    test.setTimeout(90_000);
    await setupMultiParcelLand(page, { y: "2023", m: "05", d: "01" });
    await selectExpropriation(page);

    await expandAssetSection(page, 3);
    await expect(page.getByTestId(COMP_PER_SQM)).toBeVisible();

    // 필지 취득 원인 → 실지취득가액으로 변경 (§164⑨은 환산 분모 특례 → 실가는 대상 아님)
    await page.getByRole("combobox").filter({ hasText: "환산취득가 (기준시가 비율)" }).click();
    await page.getByRole("option", { name: "실지취득가액" }).click();

    await expect(page.getByTestId(COMP_PER_SQM)).toHaveCount(0);
    await expect(page.getByTestId(COMP_BASIS)).toHaveCount(0);
  });

  test("입력값이 필지별로 독립 보존 (자산-수준 단일 값이 아님)", async ({ page }) => {
    test.setTimeout(90_000);
    await setupMultiParcelLand(page, { y: "2023", m: "05", d: "01" });
    await selectExpropriation(page);
    await expandAssetSection(page, 3);

    await page.getByTestId(COMP_PER_SQM).fill("1500000");
    // 필지 추가 → 2번째 필지는 빈 값(1번째 값이 전파되면 안 됨 — 필지별 독립)
    await page.getByRole("button", { name: /필지 추가/ }).click();
    await expect(page.getByTestId("parcel-1-compensation-per-sqm")).toHaveValue("");
    await expect(page.getByTestId(COMP_PER_SQM)).toHaveValue("1500000");
  });
});
