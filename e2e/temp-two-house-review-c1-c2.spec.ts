/**
 * temp-two-house-review-c1-c2.spec.ts — 2026-11-12 일시적 2주택 리뷰 C-1·C-2 브라우저 확인 (판정 메뉴 ③)
 *
 * C-1 §155⑯ 「신규 주택 소재지」는 보유 주택 목록의 신규 주택 행 주소로 판정한다 — 행에 주소가 있으면 위젯은 별도 주소 칸 대신
 *     그 사실을 알리고, 연접 안내·요건 카드·판정 결과가 행 주소(이천 — 세종과 비연접)를 따른다.
 * C-2 신규 주택 취득일이 직접 선언(옛 기록·AI 추출)에서 왔으면 출처를 「직접 선언」으로 말하고 지울 수 있다.
 *
 * 실행: E2E_PORT=3123 npx playwright test e2e/temp-two-house-review-c1-c2.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { gotoJudgmentStep2 } from "./_helpers/judgment-seed";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";

const SALE_ASSET = {
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2018-01-01",
  fixedAcquisitionPrice: "700000000",
  transferPrice: "2000000000",
  residencePeriodYears: "3",
};

/** 판정 메뉴 ③ — 양도 2026-06-01 · 종전(양도) 주택 2018-01-01 */
async function gotoStep2(page: Page, over: Record<string, unknown>) {
  await gotoJudgmentStep2(page, {
    assets: [SALE_ASSET],
    transferDate: "2026-06-01",
    filingDate: "2026-08-31",
    contractTotalPrice: "2000000000",
    isRegulatedArea: false,
    isUnregistered: false,
    ...over,
  });
}

test("C-1: 명부 행 주소(이천)로 ⑯ 연접 판정 — 별도 주소 칸 없음 · 세종 이전과 비연접 → 과세", async ({ page }) => {
  await gotoStep2(page, {
    publicInstitutionRelocation: true,
    relocatedInstitutionJibun: "세종특별자치시 어진동 1",
    relocatedSigunguCode: "3611000000",
    // 신규 주택 2022-06-01 — 3년 지남 · 5년 안: ⑯ 지역 요건이 결론을 가른다
    houses: [
      {
        id: "h1",
        region: "capital",
        regionCode: "4150025000",
        acquisitionOrigin: "general",
        acquisitionDate: "2022-06-01",
        officialPrice: "300000000",
        isInherited: false,
        isLongTermRental: false,
      },
    ],
  });
  await expect(page.getByTestId("relocation-new-house-from-roster")).toBeVisible();
  await expect(page.getByTestId("relocation-region-verdict")).toContainText("연접하지 않습니다");
  await expect(page.getByTestId("temp-two-house-verdict")).toContainText("미충족");
  await page.getByTestId("one-house-judge-cta").click();
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
});

test("C-2: 직접 선언 신규 주택 취득일 — 출처를 「직접 선언」으로 말하고, 지우면 일시적 2주택 블록이 사라진다", async ({ page }) => {
  await gotoStep2(page, {
    temporaryTwoHouseSpecial: true,
    newHouseAcquisitionDate: "2022-06-01",
    // 명부 행은 양도 주택보다 먼저 취득 — 신규 주택으로 도출되지 않는다(선언 폴백 경로)
    houses: [
      { id: "h1", region: "capital", acquisitionOrigin: "general", acquisitionDate: "2010-01-01", officialPrice: "300000000", isInherited: false, isLongTermRental: false },
    ],
  });
  await expect(page.getByTestId("temp-two-house-declared-source")).toContainText("직접 선언된");
  await expect(page.getByText(/자동으로 찾아 반영합니다/)).toHaveCount(0);
  await page.getByTestId("temp-two-house-declared-clear").click();
  await expect(page.getByTestId("temp-two-house-declared-source")).toHaveCount(0);
  await expect(page.getByTestId("temp-two-house-prev-acq-date")).toHaveCount(0);
  const stored = await page.evaluate(() => {
    const f = JSON.parse(sessionStorage.getItem("one-house-judgment-wizard")!).state.formData;
    return { special: f.temporaryTwoHouseSpecial, date: f.newHouseAcquisitionDate };
  });
  expect(stored).toEqual({ special: false, date: "" });
});
