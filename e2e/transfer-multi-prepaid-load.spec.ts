/**
 * 다건 양도세 — 이력 불러오기 + 기납부세액 자동채움 (Phase 2) 실플로우 E2E
 *
 * 이력(IndexedDB)에 단건 양도 record 시드 → /calc/transfer-tax/multi 진입(마운트 edit 모드)
 *   → edit 헤더 [이력에서 불러오기] → 모달에서 단건 선택 → 자산 append
 *   → 공통 설정에서 기납부세액 "자동 (참고)" 배지 노출(record 결정세액 자동채움).
 *
 * IndexedDB 시드는 Dexie DB 생성 후(/history waitForFunction) — feedback_e2e_client_nav_no_reload_vs_sessionstorage_race.
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-multi-prepaid-load.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

import { putCalculationRecord } from "./_helpers/history-seed";
import { openHistoryModal } from "./_helpers/navigation";

/** 단건 양도 이력 record A — 신고일 빠름(기신고분). resultData는 { mode:"single", result } */
const SINGLE_RECORD = {
  id: "e2e-single-load-1",
  userId: "local-user",
  taxType: "transfer",
  title: "단건 양도 A (E2E)",
  inputData: {
    assets: [{ assetKind: "land", addressJibun: "서울 강남구 대치동 2-2" }],
    transferDate: "2026-01-10",
    filingDate: "2026-03-31",
  },
  resultData: { mode: "single", result: { determinedTax: 12340000, localIncomeTax: 1234000 } },
  taxLawVersion: "2026",
  linkedCalculationId: null,
  clientId: null,
  createdAt: "2026-07-04T00:00:00.000Z",
  updatedAt: "2026-07-04T00:00:00.000Z",
};

/** 단건 양도 이력 record B — 신고일 늦음(확정신고분). 신고일 필터 시 기납부 제외 대상. */
const SINGLE_RECORD_LATE = {
  id: "e2e-single-load-2",
  userId: "local-user",
  taxType: "transfer",
  title: "단건 양도 C (E2E)",
  inputData: {
    assets: [{ assetKind: "land", addressJibun: "서울 서초구 방배동 5-5" }],
    transferDate: "2026-04-20",
    filingDate: "2026-06-30",
  },
  resultData: { mode: "single", result: { determinedTax: 9990000, localIncomeTax: 999000 } },
  taxLawVersion: "2026",
  linkedCalculationId: null,
  clientId: null,
  createdAt: "2026-07-04T00:30:00.000Z",
  updatedAt: "2026-07-04T00:30:00.000Z",
};

/** 다건 양도 이력 record — resultData는 AggregateTransferResult(mode 래퍼 없음). */
const MULTI_RECORD = {
  id: "e2e-multi-load-1",
  userId: "local-user",
  taxType: "transfer",
  title: "다건 양도 B (E2E)",
  inputData: {
    __multiTransfer: true,
    taxYear: 2026,
    properties: [
      {
        propertyId: "mp1",
        propertyLabel: "건1",
        completionPercent: 100,
        form: {
          assets: [{ assetKind: "land", addressJibun: "서울 서초구 서초동 3-3" }],
          transferDate: "2026-04-20",
        },
      },
    ],
    activePropertyIndex: 0,
    activeStep: "settings",
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "MAX_BENEFIT",
  },
  resultData: {
    determinedTax: 30000000,
    localIncomeTax: 3000000,
    totalTax: 33000000,
    properties: [{ propertyId: "mp1" }],
  },
  taxLawVersion: "2026",
  linkedCalculationId: null,
  clientId: null,
  createdAt: "2026-07-04T01:00:00.000Z",
  updatedAt: "2026-07-04T01:00:00.000Z",
};

async function seedRecord(page: Page, record: unknown) {
  await putCalculationRecord(page, record);
}

test.describe("다건 양도세 — 이력 불러오기 + 기납부 자동채움", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/history");
    await seedRecord(page, SINGLE_RECORD);
    await seedRecord(page, SINGLE_RECORD_LATE);
    await seedRecord(page, MULTI_RECORD);
  });

  // 신고일 상이 단건 2건 로드 → 신고일 빠른 A만 기납부(§111③) 자동 파생 → 배지 노출.
  test("단건 2건(신고일 상이) 불러오기 → 기신고분만 기납부 자동 배지", async ({ page }) => {
    await page.goto("/calc/transfer-tax/multi");

    // 마운트 edit 모드 → 불러오기: A(신고일 빠름)
    await openHistoryModal(
      page,
      page.getByTestId("multi-load-history-btn").first(),
      page.getByText("단건 양도 A (E2E)"),
    );
    await page.getByTestId(`load-record-${SINGLE_RECORD.id}`).click();
    await expect(page.getByText("양도 1번")).toBeVisible({ timeout: 15000 });

    // 두 번째 불러오기: C(신고일 늦음 = 확정신고분)
    await openHistoryModal(
      page,
      page.getByTestId("multi-load-history-btn").first(),
      page.getByText("단건 양도 C (E2E)"),
    );
    await page.getByTestId(`load-record-${SINGLE_RECORD_LATE.id}`).click();
    await expect(page.getByText("양도 2번")).toBeVisible({ timeout: 15000 });

    // 공통 설정 → 기납부세액 자동 배지(A 예정세액만 파생, C 제외)
    await page.getByRole("button", { name: /공통 설정으로/ }).click();
    await expect(page.getByTestId("prior-paid-tax-auto-badge")).toBeVisible({ timeout: 15000 });
  });

  // 다건 record 통째 로드 → 자산별 예정세액 부재 → auto-fill 없음(§7-2) → 배지 미노출.
  test("다건 이력 불러오기 → 세션 replace, 기납부 auto-fill 없음(배지 부재)", async ({ page }) => {
    await page.goto("/calc/transfer-tax/multi");

    await openHistoryModal(
      page,
      page.getByTestId("multi-load-history-btn").first(),
      page.getByText("다건 양도 B (E2E)"),
    );
    await page.getByTestId(`load-record-${MULTI_RECORD.id}`).click();

    // replace 후 공통 설정 단계(예정신고 기납부세액 패널) — 자산별 예정세액 부재라 자동 배지 없음
    await expect(page.getByText("예정신고 기납부세액").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("prior-paid-tax-auto-badge")).toHaveCount(0);
  });
});
