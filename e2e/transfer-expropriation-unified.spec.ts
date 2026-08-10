/**
 * 양도세 공익수용·협의매수 단일 입력 통합 — Phase 1 E2E
 *
 * 토지 자산 ②양도정보의 "양도원인=공익수용" 선택 시:
 *  - 현금/채권보상 인라인 노출
 *  - §77 감면 자동 활성(composite onChange → asset.reductions)
 * 설계: docs/02-design/features/transfer-public-expropriation-unified.ui.design.md
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/transfer-expropriation-unified.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

test.describe("양도세 공익수용 통합 — Step1 양도원인", () => {
  test("토지 양도원인=공익수용 → 현금/채권보상 노출 + §77 감면 자동 활성", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await page.getByTestId("transfer-date").getByLabel("연도").fill("2023");
    await page.getByTestId("transfer-date").getByLabel("월").fill("05");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");

    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await page.getByRole("button", { name: "단순토지" }).click();
    await page.getByText("독립 나대지", { exact: true }).click();

    // ②양도정보 — 양도원인=공익수용·협의매수
    await page.getByTestId("expr-cause-radio").click();

    // 현금/채권보상 인라인 노출 + 고시일 위젯
    await expect(page.getByTestId("expr-notice-date")).toBeVisible();
    await expect(page.getByText("현금보상액").first()).toBeVisible();
    await expect(page.getByText("채권보상액").first()).toBeVisible();

    // 고시일 입력
    const notice = page.getByTestId("expr-notice-date");
    await notice.getByLabel("연도").fill("2005");
    await notice.getByLabel("월").fill("03");
    await notice.getByLabel("일").fill("10");

    // 실지취득가(환산 아님) → #3 환산 특례 게이트 OFF: 보상산정 기초 기준시가 미노출
    await expect(page.getByText("보상산정 기초 기준시가")).toHaveCount(0);

    // 감면·공제 단계 이동 → §77 감면 자동 활성(ON)
    await page.getByRole("button", { name: "감면·공제" }).click();
    await expect(
      page.getByRole("switch", { name: /공익사업 수용 감면/ }),
    ).toBeChecked();
    // ①양도정보 고시일(2005)이 §77 서브패널 사업인정고시일에 자동 반영 (display fallback)
    await expect(page.getByTestId("expr-77-notice-date").getByLabel("연도")).toHaveValue("2005");
  });

  test("환산모드 + 수용 + 양도≥2009.02.04 → 보상 2필드 노출 (소득령 §164⑨ 1호)", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await page.getByTestId("transfer-date").getByLabel("연도").fill("2023");
    await page.getByTestId("transfer-date").getByLabel("월").fill("05");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");

    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "단순토지" }).click();
    await page.getByText("독립 나대지", { exact: true }).click();

    // 매매 → 환산취득가 (useEstimatedAcquisition ON)
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("radio", { name: "환산취득가" }).click();
    await page.waitForTimeout(300);

    // ②양도정보 — 양도원인=공익수용
    await page.getByTestId("expr-cause-radio").click();

    // #3 게이트 충족(환산+수용+양도 2023≥2009.02.04) → 보상 2필드 노출
    await expect(page.getByText("보상가액").first()).toBeVisible();
    await expect(page.getByText("보상산정 기초 기준시가")).toBeVisible();
    // min[] 3후보 모두 표시 — ① 공시지가(위 양도가액에서 입력, 읽기전용 참조)까지 노출 ("셋 중" 일치)
    await expect(page.getByText("① 공시지가 (양도시 기준시가)")).toBeVisible();
  });

  test("비토지(주택) 양도원인=공익수용 → §77 감면 활성 (토지 전용 게이팅 버그 수정)", async ({ page }) => {
    // §77(조특법)은 "토지등"(건물 포함) 대상 → 주택·건물 수용도 감면 대상.
    // 수정 전: 공익수용 라디오가 assetKind==="land" 전용이라 주택은 §77 진입 불가.
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await page.getByTestId("transfer-date").getByLabel("연도").fill("2023");
    await page.getByTestId("transfer-date").getByLabel("월").fill("05");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");

    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    // 기본 자산종류 = 주택(housing) — 토지 미선택. 비토지에서 공익수용 노출을 검증.

    // ②양도정보 — 양도원인=공익수용·협의매수 (주택에서도 노출되어야 함)
    await page.getByTestId("expr-cause-radio").click();

    // 현금/채권보상 인라인 노출 — §77 감면율 입력 경로가 비토지에도 존재
    await expect(page.getByTestId("expr-notice-date")).toBeVisible();
    await expect(page.getByText("현금보상액").first()).toBeVisible();
    await expect(page.getByText("채권보상액").first()).toBeVisible();

    // 이 케이스는 **환산 모드가 아니므로**(위에서 미선택) 특례 게이트가 OFF다.
    // 주택 + 환산 조합의 노출 여부는 아래 "주택 + 수용 + 환산" 테스트가 별도로 고정한다.
    await expect(page.getByText("보상산정 기초 기준시가")).toHaveCount(0);

    // 감면·공제 단계 → §77 감면 자동 활성(ON)
    await page.getByRole("button", { name: "감면·공제" }).click();
    await expect(
      page.getByRole("switch", { name: /공익사업 수용 감면/ }),
    ).toBeChecked();
  });

  test("건물 + 수용 + 환산 → 보상 2필드 노출 (P3 게이트 확대 — 나목)", async ({ page }) => {
    // §164⑨은 §99①1호 가목~라목 대상 → 건물(나목)도 특례 대상.
    // 종전엔 UI가 `assetKind === "land"`로만 게이트해 **법령보다 좁았다**(계획 D1).
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const td = page.getByTestId("transfer-date");
    await td.getByLabel("연도").fill("2023");
    await td.getByLabel("월").fill("05");
    await td.getByLabel("일").fill("01");

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "건물(토지 제외)" }).click(); // 나목

    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("radio", { name: "환산취득가" }).click();

    await expandAssetSection(page, 2);
    await page.getByTestId("expr-cause-radio").click();

    await expect(page.getByText("보상산정 기초 기준시가")).toBeVisible();
  });

  test("주택 + 수용 + 환산 → 보상 총액 2필드 **노출** (라목 총액 트랙 P5 완료)", async ({ page }) => {
    // 주택(라목)은 개별주택가격이 총액이라 원/㎡가 아닌 **총액 3후보** min[]를 쓴다(P5 총액 트랙, 머지 완료).
    // 주택 + 수용 + 환산 시 "주택 총액" 블록(보상액 총액·보상기초 총액)이 노출된다.
    // (구 스펙은 P5 미구현 전제로 "미노출"을 단언했으나 P5 완료로 뒤집힘 — unstale 2026-07-16.)
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const td = page.getByTestId("transfer-date");
    await td.getByLabel("연도").fill("2023");
    await td.getByLabel("월").fill("05");
    await td.getByLabel("일").fill("01");

    await expandAssetSection(page, 1);
    await expandAssetSection(page, 3);
    // 기본 자산종류 = 주택(housing)
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("radio", { name: "환산취득가" }).click();

    await expandAssetSection(page, 2);
    await page.getByTestId("expr-cause-radio").click();

    await expect(page.getByText("보상산정 기초 기준시가 총액")).toBeVisible();
  });

  test("현금+채권 보상 → 양도가액 자동 반영 (수용 양도가액 = 보상총액)", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await page.getByTestId("transfer-date").getByLabel("연도").fill("2023");
    await page.getByTestId("transfer-date").getByLabel("월").fill("05");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");

    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);

    // 공익수용 선택 후 현금 5억 → 양도가액 5억 자동, 채권 2억 추가 → 7억 자동
    await page.getByTestId("expr-cause-radio").click();
    await page.getByTestId("expr-cash").fill("500000000");
    await expect(page.getByTestId("companion-actual-sale-price")).toHaveValue("500,000,000");
    await page.getByTestId("expr-bond").fill("200000000");
    await expect(page.getByTestId("companion-actual-sale-price")).toHaveValue("700,000,000");
    // (사용자가 양도가액을 직접 수정하면 보존 — deriveFromCompensation의 직전자동값 비교로 clobber 방지.
    //  CurrencyInput은 controlled+포맷이라 Playwright 값 교체가 flaky → 보존 로직은 단위/코드 검증으로 대체)
  });
});
