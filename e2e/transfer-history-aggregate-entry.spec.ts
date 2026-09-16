/**
 * 이력 화면 → **다건 합산**으로 재계산 (진입점) 실플로우 E2E
 *
 * 계획서: `docs/00-pm/transfer-history-multi-aggregate-entry.plan.md`
 *
 * 단건 양도세 이력 3건 시드(2026 ×2 · 2025 ×1) → `/history`에서 카드 「합산」
 *   → 같은 양도인·같은 과세연도 이력을 체크 → 「2건 합산하기」
 *   → `/calc/transfer-tax/multi`에 **양도일 오름차순**으로 2건 편입
 *   → 공통 설정에서 기납부세액(§111③) 「자동 (참고)」 배지.
 *
 * ⚠️ 이 spec이 지키는 것은 **엔진이 아니라 진입 경로**다. 편입 순서·과세연도·기납부 파생은
 *    vitest anchor가 단위로 고정하고, 여기서는 「화면에서 실제로 그렇게 이어지는가」를 본다.
 *
 * IndexedDB 시드는 Dexie DB 생성 후(/history 진입 후) — `putCalculationRecord`가 재시도한다.
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-history-aggregate-entry.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

import { putCalculationRecord } from "./_helpers/history-seed";

/** 단건 양도세 이력 — 저장되는 모양 그대로(`mode:"single"` + result) */
function singleRecord(o: {
  id: string;
  transferDate: string;
  filingDate: string;
  determinedTax: number;
  localIncomeTax: number;
  createdAt: string;
}) {
  return {
    id: o.id,
    userId: "local-user",
    taxType: "transfer",
    title: `양도소득세 — ${o.transferDate} (E2E)`,
    inputData: {
      assets: [
        {
          // 🔑 팩토리를 거친다 — 실제 저장 record는 마법사 폼이라 지분율 등 기본값이 모두 있다.
          //    손으로 최소 필드만 적으면 ⑧이 「공유 지분율을 입력하세요」로 막는다.
          ...makeDefaultAsset(1),
          assetKind: "land",
          addressJibun: "서울 강남구 대치동 2-2",
          acquisitionDate: "2015-03-02",
          // ⑧ 필수 — 실제 저장 record는 계산을 마친 폼이라 취득가액이 있다(시드를 실제와 맞춘다)
          fixedAcquisitionPrice: "500000000",
        },
      ],
      transferDate: o.transferDate,
      filingDate: o.filingDate,
      contractTotalPrice: "1500000000",
      householdHousingCount: "1",
    },
    resultData: {
      mode: "single",
      result: { determinedTax: o.determinedTax, localIncomeTax: o.localIncomeTax },
    },
    taxLawVersion: o.transferDate.slice(0, 4),
    linkedCalculationId: null,
    clientId: null,
    createdAt: o.createdAt,
    updatedAt: o.createdAt,
  };
}

/** 기준 — 첨부 화면의 2026.10.05분(확정신고분: 신고일이 가장 늦다) */
const BASE = singleRecord({
  id: "e2e-agg-base",
  transferDate: "2026-10-05",
  filingDate: "2026-12-31",
  determinedTax: 23_017_500,
  localIncomeTax: 2_301_750,
  createdAt: "2026-09-16T07:34:00.000Z",
});
/** 합산 대상 — 2026.01.05분(예정신고분: 신고일이 빠르다 → §111③ 기납부) */
const EARLIER = singleRecord({
  id: "e2e-agg-earlier",
  transferDate: "2026-01-05",
  filingDate: "2026-03-31",
  determinedTax: 100_540_000,
  localIncomeTax: 10_054_000,
  createdAt: "2026-09-16T07:30:00.000Z",
});
/** 과세연도 불일치 — 선택 불가여야 한다 */
const PRIOR_YEAR = singleRecord({
  id: "e2e-agg-2025",
  transferDate: "2025-03-02",
  filingDate: "2025-05-31",
  determinedTax: 5_000_000,
  localIncomeTax: 500_000,
  createdAt: "2026-09-16T07:20:00.000Z",
});

test.describe("이력 → 다건 합산 진입", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/history");
    await putCalculationRecord(page, BASE);
    await putCalculationRecord(page, EARLIER);
    await putCalculationRecord(page, PRIOR_YEAR);
    await page.reload();
    await expect(page.getByTestId(`aggregate-${BASE.id}`)).toBeVisible({ timeout: 15000 });
  });

  test("같은 연도 단건 2건 선택 → 양도일 오름차순 편입 + 기납부 자동 파생", async ({ page }) => {
    await page.getByTestId(`aggregate-${BASE.id}`).click();
    await expect(page.getByTestId("history-aggregate-modal")).toBeVisible({ timeout: 15000 });

    // 기준은 이미 선택돼 있고, 같은 연도 1건을 더 고른다
    await page.getByTestId(`aggregate-record-${EARLIER.id}`).click();
    await expect(page.getByTestId("aggregate-confirm")).toHaveText(/2건 합산하기/);
    await page.getByTestId("aggregate-confirm").click();

    await expect(page).toHaveURL(/\/calc\/transfer-tax\/multi/, { timeout: 15000 });
    await expect(page.getByText("양도 1번")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("양도 2번")).toBeVisible();

    // [D6] DOM 순서 = 양도일 오름차순 (1번이 예정신고분)
    expect(await page.getByText(/^양도일: /).allTextContents()).toEqual([
      "양도일: 2026-01-05",
      "양도일: 2026-10-05",
    ]);

    // 공통 설정 — 신고일이 빠른 01.05분만 기납부(§111③)로 자동 파생
    await page.getByRole("button", { name: /공통 설정으로/ }).click();
    await expect(page.getByTestId("prior-paid-tax-auto-badge")).toBeVisible({ timeout: 15000 });
  });

  test("[D3] 과세연도가 다른 이력은 사유와 함께 선택 불가", async ({ page }) => {
    await page.getByTestId(`aggregate-${BASE.id}`).click();
    await expect(page.getByTestId("history-aggregate-modal")).toBeVisible({ timeout: 15000 });

    const prior = page.getByTestId(`aggregate-record-${PRIOR_YEAR.id}`);
    await expect(prior).toBeDisabled();
    await expect(prior).toContainText("2025년");

    // 기준 1건만 선택된 상태 → 합산 버튼은 열리지 않는다(합산은 2건 이상)
    await expect(page.getByTestId("aggregate-confirm")).toBeDisabled();
  });
});
