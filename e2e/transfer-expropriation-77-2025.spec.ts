/**
 * transfer-expropriation-77-2025.spec.ts
 *
 * 비자발적 양도 감면 UI 검증 (2025 개정 + 신규 조문):
 *  - §77 공익수용: 2025.1.1 이후 양도분 개정 감면율(현금 15%/채권 20~45%) 라벨 노출
 *  - §77의3 개발제한구역 매수 토지: 입력 카드 + 구역상태 라디오 + 해제분 조건부 필드
 *  - §77의2 대토보상 과세특례: 입력 카드(현금/대토 보상액)
 *
 * 실행(비-worktree, 기본 3000): npx playwright test e2e/transfer-expropriation-77-2025.spec.ts
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function inputByLabel(scope: Page | Locator, labelText: string): Locator {
  return scope
    .locator(`label:has-text("${labelText}")`)
    .locator("xpath=..")
    .locator("input")
    .first();
}

/** 토지 자산 최소 입력 후 감면·공제 단계로 이동 (양도일 2026 → §77 개정율 적용 조건) */
async function gotoReductionStep(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  // 양도일 2026-05-01 (2025.1.1 이후 → §77 개정 감면율)
  await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
  await page.getByTestId("transfer-date").getByLabel("월").fill("05");
  await page.getByTestId("transfer-date").getByLabel("일").fill("01");

  await expandAssetSection(page, 1);
  await expandAssetSection(page, 2);
  await expandAssetSection(page, 3);

  // 단순토지 → 독립 나대지 → 면적 → 양도가액
  await page.getByRole("button", { name: "단순토지" }).click();
  await page.getByText("독립 나대지", { exact: true }).click();
  await page.getByPlaceholder("면적 입력").first().fill("300");
  await inputByLabel(page, "양도가액 (원)").fill("1000000000");

  // 매매 → 환산취득가 → 취득일 2003-03-27
  await page.getByRole("radio", { name: "매매", exact: true }).click();
  await page.getByRole("radio", { name: "환산취득가" }).click();
  await page.getByLabel("연도", { exact: true }).nth(2).fill("2003");
  await page.getByLabel("월", { exact: true }).nth(2).fill("03");
  await page.getByLabel("일", { exact: true }).nth(2).fill("27");

  // 감면·공제 단계로 이동
  await page.getByRole("button", { name: "감면·공제" }).first().click();
}

test.describe("비자발적 양도 감면 UI (§77 2025 개정 · §77의2 · §77의3)", () => {
  test("§77 공익수용 — 2026 양도분에 개정 감면율(현금 15%/채권 20%) 노출", async ({ page }) => {
    await gotoReductionStep(page);

    // 공익사업 수용 감면(§77) 토글 ON
    await page.getByRole("switch", { name: /공익사업 수용 감면/ }).click();

    // 개정 감면율 안내 (2025.1.1 이후 양도 → 15/20/35/45)
    await expect(page.getByText(/현금 15%, 채권 20%/)).toBeVisible();
    await expect(page.getByText(/2025\.1\.1 이후 양도분 개정율/)).toBeVisible();
    // 만기특약 라디오 라벨도 개정율
    await expect(page.getByText("없음 (20%)")).toBeVisible();
    await expect(page.getByText("5년 (45%)")).toBeVisible();

    console.log("✅ §77 2026 양도분 개정 감면율 라벨 노출 확인");
  });

  test("§77의3 개발제한구역 매수 토지 — 카드·구역상태 라디오·해제분 조건부 필드", async ({ page }) => {
    await gotoReductionStep(page);

    await page.getByRole("switch", { name: /개발제한구역 매수 토지 감면/ }).click();

    // 입력 카드 헤더 + 안내
    await expect(page.getByText("개발제한구역 매수 토지 감면 (조특법 §77의3)")).toBeVisible();
    await expect(page.getByText(/40%\(지정일 이전 취득\+거주\)/)).toBeVisible();

    // 구역 상태 라디오 2종
    await expect(page.getByText("구역 내 매수·협의매수", { exact: true })).toBeVisible();
    const releasedRadio = page.getByText("해제 후 협의매수·수용", { exact: true });
    await expect(releasedRadio).toBeVisible();

    // in_zone 기본: 해제일 필드 미노출
    await expect(page.getByText("개발제한구역 해제일")).toHaveCount(0);

    // 해제분 선택 → 해제일 + 경제자유구역 토글 노출
    await releasedRadio.click();
    await expect(page.getByText("개발제한구역 해제일")).toBeVisible();
    await expect(page.getByRole("switch", { name: /경제자유구역 등 지정/ })).toBeVisible();

    // 거주요건 토글
    await expect(page.getByRole("switch", { name: /취득일~매수\/고시일 소재지 거주/ })).toBeVisible();

    console.log("✅ §77의3 입력 카드·조건부 필드 확인");
  });

  test("§77의2 대토보상 과세특례 — 입력 카드(현금/대토 보상액)", async ({ page }) => {
    await gotoReductionStep(page);

    await page.getByRole("switch", { name: /대토보상 과세특례/ }).click();

    await expect(page.getByText("대토보상 과세특례 (조특법 §77의2)")).toBeVisible();
    await expect(page.getByText(/대토\(토지\)보상 받는 부분의 양도세 40% 세액감면/)).toBeVisible();
    await expect(page.getByText("대토(토지) 보상액")).toBeVisible();

    console.log("✅ §77의2 입력 카드 확인");
  });

  test("§77 공익수용 — 결과 화면에 감면세액 산출근거 상세 카드(①~⑤ 산식) 노출", async ({ page }) => {
    // 실거래가 모드로 자체 셋업 (환산 기준시가 미입력 재검증 차단 회피)
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
    await page.getByTestId("transfer-date").getByLabel("월").fill("05");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");

    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await expandAssetSection(page, 3);

    await page.getByRole("button", { name: "단순토지" }).click();
    await page.getByText("독립 나대지", { exact: true }).click();
    await page.getByPlaceholder("면적 입력").first().fill("300");
    await inputByLabel(page, "양도가액 (원)").fill("1000000000");

    // 매매 → 실거래가 → 취득일 2003-03-27 → 취득가액 3억
    await page.getByRole("radio", { name: "매매", exact: true }).click();
    await page.getByRole("radio", { name: "실거래가 계약서상 실거래가" }).click();
    await page.getByLabel("연도", { exact: true }).nth(2).fill("2003");
    await page.getByLabel("월", { exact: true }).nth(2).fill("03");
    await page.getByLabel("일", { exact: true }).nth(2).fill("27");
    await inputByLabel(page, "취득가액 (원)").fill("300000000");

    // 감면·공제 이동 → §77 ON + 현금 보상액 전액
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await page.getByRole("switch", { name: /공익사업 수용 감면/ }).click();
    await inputByLabel(page, "현금 보상액").fill("1000000000");

    const approvalScope = page.locator("label:has-text('사업인정고시일')").locator("xpath=..");
    await approvalScope.getByLabel("연도", { exact: true }).fill("2024");
    await approvalScope.getByLabel("월", { exact: true }).fill("01");
    await approvalScope.getByLabel("일", { exact: true }).fill("15");

    // 가산세 단계로 이동 후 최종 계산
    await page.getByRole("button", { name: "다음" }).click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();

    // 결과 상세 카드 — 헤더 + ①보상구성 + ⑤ 산식
    await expect(
      page.getByText("공익사업 수용 감면 상세 (조특법 §77)"),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("① 보상 구성")).toBeVisible();
    // ④ 자산별 감면금액 산출과정 (보상분 소득 − 기본공제) × 감면율
    await expect(
      page.getByText("④ 자산별 감면금액 = (보상분 소득 − 기본공제) × 감면율"),
    ).toBeVisible();
    await expect(page.getByText(/현금 = \(.+ − .+\) × \d+% =/)).toBeVisible();
    /**
     * ⑤ 감면세액 산식 — 🔄 2026-08-23 정정 (PR #1240 분수 표기 통일과 함께 갱신되지 않았다)
     *
     * `TransferReductionRows.tsx:136`이 `산출세액 × 감면대상소득금액 / 과세표준` →
     * `산출세액 × <Frac top="감면대상소득금액" bottom="과세표준" />`로 바뀌었다.
     * `Frac`은 분자·분모를 별도 `<span>`으로 쌓아 `/`를 렌더하지 않으므로 종전 완전일치
     * 문자열은 **영구히 매칭될 수 없다**. 분수 표기에서도 성립하는 형태로 바꾼다.
     */
    const reductionFormula = page.getByText("⑤ 감면세액 = 산출세액 ×");
    await expect(reductionFormula).toBeVisible();
    /**
     * 🔄 2026-09-03 정정 — 분자 이름이 「감면대상소득금액」에서 바뀌었다.
     * §90①의 **B**가 「감면대상 양도소득금액」이고 부표1 ⑲도 그 B라, 같은 낱말이 한 화면에서
     * 두 뜻으로 쓰이고 있었다(카드 28,550,000 ↔ ⑲ 288,000,000). 기본공제·감면율이 이미
     * 반영됐음을 이름에 박아 충돌을 없앴다 — `RATED_REDUCIBLE_INCOME_LABEL` 단일 소스.
     */
    await expect(
      reductionFormula.getByText("감면대상소득 (기본공제 차감·감면율 반영)", { exact: true }),
    ).toBeVisible();
    await expect(reductionFormula.getByText("과세표준", { exact: true })).toBeVisible();
    // ⑲와 다른 수임을 화면이 스스로 밝힌다 — 침묵하면 사용자가 어느 쪽이 틀렸는지 알 수 없다.
    await expect(
      page.getByText("신고서 ⑲ 「세액감면대상금액」은 기본공제·감면율을 반영하기 前 금액", {
        exact: false,
      }),
    ).toBeVisible();

    // 별지84호 부표2 — ⑲ 세액감면대상금액 = 양도소득금액 전액(§90①·감면율 前),
    // 감면후 소득금액 = 양도소득금액(§90① 소득 미차감). rate-곱값(53,425,403) 금지.
    const rowTotal = (label: RegExp) =>
      page
        .locator("tr", { has: page.locator("td").filter({ hasText: label }) })
        .first()
        .locator("td")
        .last();
    const incomeText = (await rowTotal(/^양도소득금액$/).innerText()).trim();
    await expect(rowTotal(/^세액감면대상금액$/)).toHaveText(incomeText);
    await expect(rowTotal(/^감면후 소득금액$/)).toHaveText(incomeText);

    console.log(`✅ §77 부표2 ⑲ 세액감면대상금액 = 감면후 소득금액 = 양도소득금액(${incomeText})`);
  });
});
