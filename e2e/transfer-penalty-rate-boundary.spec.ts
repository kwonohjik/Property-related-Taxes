/**
 * C22 — 납부지연가산세 이자율 개정 시행일 경계(2019-02-12·2022-02-15) 구간분할 UI E2E
 *
 * 감사 결정사항: 경과기간이 이자율 개정 시행일을 걸치면 구간별 일 이자율을 적용해 분할·합산
 * (calculateDelayedPaymentPenalty의 breakdown, lib/tax-engine/transfer-tax-penalty.ts:300-316).
 * 입력 경로: 수정신고(AmendmentBlock) "납부지연가산세 적용" 토글 — 법정신고기한(납부기한 대용)
 * ~ 수정신고 납부(예정)일 경과기간이 2022-02-15를 걸치는 시나리오.
 *
 * 결과 표시 위치 — 실측 정정: 과제 지시서는 TransferTaxCalculator.tsx:617-634의 인라인
 * "지연납부가산세" 카드(가산세 계산하기 enablePenalty 토글 경로)를 지목했으나, 그 카드는
 * amendmentMode=false 전용(lib/calc/transfer-tax-api.ts:524 `!form.amendmentMode` 게이트라
 * amendmentMode=true에서는 delayedPaymentDetails가 API로 전송되지 않아 penaltyResult가
 * 항상 null). AmendmentBlock 입력 경로의 실제 결과는 결과 화면의
 * AmendmentResultCard(components/calc/results/transfer/AmendmentResultCard.tsx) "납부지연가산세"
 * 행으로 렌더된다 — 본 스펙은 그 실제 렌더 위치를 검증한다.
 *
 * 기대값 독립 도출(엔진 산식, PENALTY_CONST 상수 기반 — 엔진 출력 비복사):
 *   납부기한 2021-12-01 → 납부일 2022-06-01 = 경과 182일
 *   2022-02-15 경계 이전 구간(0.00025) 75일 + 이후 구간(0.00022) 107일 (75+107=182)
 *   가산세 = floor(추가납부세액×75×0.00025) + floor(추가납부세액×107×0.00022)
 *   (구간분할 없는 옛 단일율 계산과 값이 달라야 함 — floor(추가납부세액×182×0.00022))
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-penalty-rate-boundary.spec.ts
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

/**
 * Row 값 조회 — 정확히 일치하는 라벨 span의 다음 형제 span(font-mono 금액) 텍스트.
 * 요약 Row(항상 노출) 다음에 "산출근거" 접힘 섹션(steps.map, 기본 hidden)에도 동일 라벨의
 * 행이 재등장할 수 있어 DOM 순서상 먼저 렌더되는 요약 Row(.first())를 사용한다.
 */
function rowValue(page: Page, exactLabel: string): Locator {
  return page
    .locator(`span:text-is("${exactLabel}")`)
    .locator("xpath=following-sibling::span[1]")
    .first();
}

function parseKRW(text: string): number {
  return Number(text.replace(/[^0-9-]/g, ""));
}

test.describe("양도세 납부지연가산세 이자율 경계 구간분할 UI", () => {
  test("수정신고 + 납부기한·납부일 2022-02-15 경계 straddle → 구간분할 합산 결과", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // ── 당초 신고 대상 자산 — 독립 나대지, 양도가 10억(2023-05-01) / 취득가 3억(2010-03-27) ──
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2023");
    await page.getByTestId("transfer-date").getByLabel("월").fill("05");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");

    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await expandAssetSection(page, 3);

    await page.getByRole("button", { name: "단순토지" }).click();
    await page.getByText("독립 나대지", { exact: true }).click();
    await page.getByPlaceholder("면적 입력").first().fill("300");
    await inputByLabel(page, "양도가액 (원)").fill("1000000000");

    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("button", { name: "실거래가 계약서상 실거래가" }).click();
    await page.getByLabel("연도", { exact: true }).nth(2).fill("2010");
    await page.getByLabel("월", { exact: true }).nth(2).fill("03");
    await page.getByLabel("일", { exact: true }).nth(2).fill("27");
    await inputByLabel(page, "취득가액 (원)").fill("300000000");

    // ── 자산 데이터를 유지한 채 수정신고 모드 주입 ──
    //
    // 주의(발견된 버그 회피 — 아래 "실제 UI 버그" 참고): merge()의 레거시 판별이
    // `"acquisitionMethod" in legacyForm` 등 4개 키 존재 여부만 검사하는데, 이 키들은
    // defaultFormData에 항상 존재하므로 UI로 채운 실제 formData를 그대로 sessionStorage에
    // 두고 새로고침하면 항상 legacy 분기로 오분류되어 assets가 기본값(주택 백지)으로
    // 소실된다. 우회: assets 배열만 추출해 그 4개 deprecated 키를 포함하지 않는 "clean"
    // 최소 seed로 재구성한다(기존 amendment E2E 스펙들과 동일한 최소 seed 패턴).
    const cleanSeed = await page.evaluate(() => {
      const raw = sessionStorage.getItem("transfer-tax-wizard");
      if (!raw) throw new Error("wizard sessionStorage not found");
      const parsed = JSON.parse(raw);
      return {
        state: {
          formData: {
            assets: parsed.state.formData.assets,
            contractTotalPrice: parsed.state.formData.contractTotalPrice,
            transferDate: parsed.state.formData.transferDate,
            amendmentMode: true,
            correctionKind: "amend",
            // 당초 결정세액은 검증상 0보다 커야 하되(§48 validate), additionalTax>0 확보 위해 소액으로.
            originalDeterminedTax: "10000",
            applyUnderReportingPenalty: false,
            applyLatePaymentPenalty: true,
            statutoryFilingDeadline: "2021-12-01", // 납부기한 대용
            amendedPaymentDate: "2022-06-01", // 실제 납부(예정)일
          },
          pendingMigration: false,
        },
        version: 0,
      };
    });
    await page.evaluate((seed) => {
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(seed));
    }, cleanSeed);
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // ── 가산세 스텝 — AmendmentBlock 렌더 확인 ──
    await page.getByRole("button", { name: "가산세", exact: true }).click();
    await expect(page.getByText("⑤ 수정신고")).toBeVisible();
    await expect(page.getByText(/납부지연가산세 적용/)).toBeVisible();
    await expect(inputByLabel(page, "수정신고 납부(예정)일").first()).toBeVisible();

    // ── 계산 실행 ──
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await expect(page.getByText("수정신고 추가 납부세액")).toBeVisible({ timeout: 20000 });

    // ── 추가 납부 본세(=additionalTax) 및 납부지연가산세 총액 읽기 ──
    const additionalTaxText = await rowValue(page, "추가 납부 본세").innerText();
    const additionalTax = parseKRW(additionalTaxText);
    expect(additionalTax).toBeGreaterThan(0);

    await expect(page.getByText("납부지연가산세", { exact: true })).toBeVisible();
    const penaltyText = await rowValue(page, "납부지연가산세").innerText();
    const penalty = parseKRW(penaltyText);
    expect(penalty).toBeGreaterThan(0);

    // ── 독립 도출 기대값 (엔진 산식 — 구간분할) ──
    const seg1 = Math.floor(additionalTax * 75 * 0.00025); // 2019-02-12~2022-02-15 이전 구간
    const seg2 = Math.floor(additionalTax * 107 * 0.00022); // 2022-02-15 이후 구간
    const expectedSplit = seg1 + seg2;

    // 옛(단일율) 방식 — 회귀 방지를 위한 대조값
    const naiveSingleRate = Math.floor(additionalTax * 182 * 0.00022);

    expect(penalty).toBe(expectedSplit);
    expect(penalty).not.toBe(naiveSingleRate);
  });
});
