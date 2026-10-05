/**
 * 계산기 — §155④⑤ 합가 전 보유 쪽 입력 + ⑧ 차단 (PR-2, 2026-10-05)
 *
 * 계획서 `docs/00-pm/merge-composition-unknown-unfavorable.plan.md` §3-3.
 *
 * 판정 메뉴(`one-house-judgment-merge-origin.spec.ts`)와 같은 명부 위젯을 계산기 화면
 * (`Step4.tsx` · `SurchargeJudgmentSection.tsx`)에도 연다(PR-2). 「모름」은 불리하게 — 합가 전
 * 취득 행의 소유 쪽을 고르지 않으면 ⑧이 「다음」을 막고, 고르면 합가 비과세가 성립한다.
 *
 * worktree 실행: E2E_PORT=<port> npx playwright test e2e/transfer-calc-merge-origin.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 명부 행 — 합가일(2020-01-01) 전 취득, 소유 쪽은 아직 비워 둔다. */
function otherHouse() {
  return {
    id: "h1",
    region: "capital" as const,
    acquisitionDate: "2015-01-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
  };
}

/** 양도 주택 2015-01-01 취득 · 양도 2026-03-01 · 5억 · 비조정 · 혼인합가 2020-01-01 · 먼저 양도. */
function seedForm() {
  return {
    state: {
      formData: {
        ...createDefaultTransferFormData(),
        assets: [
          {
            ...makeDefaultAsset(1),
            addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2015-01-01",
            fixedAcquisitionPrice: "300000000",
            useEstimatedAcquisition: false,
            residenceInputMode: "direct",
            residencePeriodMonthsAsset: "120",
          },
        ],
        transferDate: "2026-03-01",
        contractTotalPrice: "500000000",
        householdHousingCount: "2",
        isOneHousehold: true,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        residencePeriodMonths: "120",
        houses: [otherHouse()],
        marriageDate: "2020-01-01",
        isFirstTransferredInMerge: true,
      },
      currentStep: 0,
      pendingMigration: false,
    },
    version: 0,
  };
}

async function ready(page: Page) {
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

async function seedAndOpenHoldings(page: Page) {
  await page.goto("/calc/transfer-tax");
  await ready(page);
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm());
  await page.reload();
  await ready(page);
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

const next = (page: Page) => page.getByRole("button", { name: "다음", exact: true });
const panel = (page: Page) => page.getByTestId("validation-issues");

test.describe("계산기 — 합가 전 보유 쪽", () => {
  test("[CM-1] 합가일 입력 → 명부 배지·편집 창 소유 라디오가 뜬다", async ({ page }) => {
    await seedAndOpenHoldings(page);

    const badge = page.getByTestId("house-merge-badge-h1");
    await expect(badge).toHaveAttribute("data-side", "unset");

    await page.getByRole("button", { name: "주택 1 편집" }).click();
    await expect(page.getByTestId("house-merge-origin")).toBeVisible();
  });

  test("[CM-2] 소유 쪽 미입력 → 「다음」이 막히고 검증 패널에 사유가 뜬다", async ({ page }) => {
    await seedAndOpenHoldings(page);

    await next(page).click();
    await expect(
      panel(page).getByRole("button", { name: /혼인 전 보유자를 고르세요/ }),
    ).toBeVisible();
  });

  test("[CM-3] 소유 쪽(배우자 쪽)을 고르면 차단이 풀리고 다음 단계로 간다", async ({ page }) => {
    await seedAndOpenHoldings(page);

    await next(page).click();
    const issue = panel(page).getByRole("button", { name: /혼인 전 보유자를 고르세요/ });
    await expect(issue).toBeVisible();

    await page.getByRole("button", { name: "주택 1 편집" }).click();
    await page.getByTestId("merge-origin-counterpart").check();
    await page.getByRole("button", { name: "완료" }).click();

    await next(page).click();
    await expect(issue).toHaveCount(0);
  });
});
