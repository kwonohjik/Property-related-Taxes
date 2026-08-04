/**
 * 상업용건물 §164⑥ — **3시점 건물 기준시가 일괄 계산** 배선 E2E (P3).
 *
 * 계획서: docs/02-design/features/building-std-price-modal-multipoint.plan.md §5 P3
 *
 * 검증 대상은 **UI 배선**이다(산출값은 anchor `phd-3point-batch.anchor.test.ts` 담당):
 *   T1 호별 고시 전 취득(2000) → 배치 런처 노출 + 시점별 계산기(종전 런처) **병존**
 *   T2 모달이 상가 라벨("최초고시(2005)")로 열리고 소재지·건축물대장 조회 블록이 있다
 *   T3 §164⑧ 동일연도(취득연도 == 양도연도)면 배치 런처 대신 사유가 표시된다
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/commercial-building-std-batch.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 상가 환산 시드 — `cbEra`는 비워 둔다(취득일에서 자동 판정). */
function seedForm(acquisitionDate: string, transferDate: string) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "commercial_building",
            acquisitionCause: "purchase",
            acquisitionDate,
            useEstimatedAcquisition: true,
            cbEra: "", // 취득일 기준 자동 판정(2005-01-01 경계)
            cbExclusiveArea: "36",
            cbSharedArea: "33.52",
            cbLandArea: "12.57",
          },
        ],
        transferDate,
        filingDate: "2026-07-31",
        contractTotalPrice: "1000000000",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seed(page: Page, acquisitionDate: string, transferDate: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(acquisitionDate, transferDate),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // 환산 블록은 자산 카드 ③ 취득 섹션 안에 있다 — 접혀 있으면 런처가 DOM에는 있어도 보이지 않는다.
  await expandAssetSection(page, 3);
}

test.describe("상가 §164⑥ 3시점 건물 기준시가 일괄 계산", () => {
  test("T1: 고시 전 취득(2000) → 배치 런처 + 시점별 계산기 병존", async ({ page }) => {
    await seed(page, "2000-12-07", "2026-05-01");

    const batch = page.getByTestId("cb-building-std-batch-open");
    await expect(batch).toBeVisible();
    // 종전 1시점 런처는 보조로 남는다(기계식주차·공동주택 환산 경로 보존 — 계획서 §4.2).
    await expect(page.getByRole("button", { name: "건물 기준시가 계산" }).first()).toBeVisible();
  });

  test("T2: 모달이 상가 라벨로 열리고 소재지·건축물대장 조회가 있다", async ({ page }) => {
    await seed(page, "2000-12-07", "2026-05-01");
    await page.getByTestId("cb-building-std-batch-open").click();

    const modal = page.getByRole("dialog").filter({ hasText: "3시점 건물 기준시가 일괄 계산" });
    await expect(modal).toBeVisible();
    // 라벨은 호출부 points[].label — PHD 용어("최초공시일")가 아니라 상가 용어여야 한다.
    await expect(modal.getByText(/최초고시\(2005\)/).first()).toBeVisible();
    await expect(modal.getByText("최초공시일")).toHaveCount(0);
    // L-4 이식 — 소재지·건축물대장 조회
    await expect(modal.getByText("소재지 (공시지가·건축물대장 조회용)")).toBeVisible();
    await expect(modal.getByRole("button", { name: "건축물대장 조회" })).toBeVisible();
    // 취득 2000 ≤2000 → 2001.1.1 기준 공시지가 전용 행
    await expect(modal.getByText("취득시 (2001년 기준) 공시지가")).toBeVisible();
  });

  test("T3: 취득연도 == 양도연도(§164⑧) → 배치 대신 사유 표시", async ({ page }) => {
    await seed(page, "2003-03-02", "2003-11-01");

    await expect(page.getByTestId("cb-building-std-batch-open")).toHaveCount(0);
    await expect(page.getByText(/제164조 제8항/)).toBeVisible();
    // 입력 경로는 남아야 한다(dead-end 금지)
    await expect(page.getByRole("button", { name: "건물 기준시가 계산" }).first()).toBeVisible();
  });
});
