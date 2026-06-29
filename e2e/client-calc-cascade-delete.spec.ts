/**
 * 의뢰인 ↔ 계산 이력 생명주기 연동 (Cascade Delete + Restore) E2E
 *
 * 계획서: docs/00-pm/client-calc-cascade-delete-restore.plan.md §7
 * 결정: D1(마지막 1건일 때만 cascade) · D3(연결 계산 있으면 단독 삭제 차단) · D2(백업 import 복원)
 *
 * 셋업: 백업 import로 세무사 모드(userProfile.mode) + 의뢰인 2명 + 계산 3건을 주입.
 *   - 김철수(c-kim): 계산 2건 → 1건 삭제해도 유지(A)
 *   - 이영희(c-lee): 계산 1건 → 그 1건 삭제 시 cascade 삭제(B)
 * mode는 useUserProfile 훅이 IndexedDB에서 로드 → import 후 reload로 반영.
 *
 * 실행: npx playwright test e2e/client-calc-cascade-delete.spec.ts
 */

import { test, expect } from "@playwright/test";

const NOW = "2026-06-01T00:00:00.000Z";

function calc(
  id: string,
  title: string,
  clientId: string,
  taxType: string
) {
  return {
    id,
    userId: "local-user",
    taxType,
    title,
    // 각 계산을 고유하게 — inputData/resultData가 동일하면 import dedup(contentHash)으로 스킵됨.
    inputData: { _seq: id },
    resultData: { totalPayable: 100000, _seq: id },
    taxLawVersion: "2026-06-01",
    linkedCalculationId: null,
    clientId,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const BACKUP = {
  format: "korean-tax-calc-backup",
  version: 1,
  dbVersion: 6,
  exportedAt: NOW,
  userProfile: {
    id: "local-user",
    displayName: "테스트 세무사",
    birthDate: null,
    mode: "professional",
    createdAt: NOW,
    updatedAt: NOW,
  },
  clients: [
    {
      id: "c-kim",
      userId: "local-user",
      name: "김철수",
      birthDate: null,
      phone: null,
      email: null,
      memo: null,
      lastUsedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "c-lee",
      userId: "local-user",
      name: "이영희",
      birthDate: null,
      phone: null,
      email: null,
      memo: null,
      lastUsedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  calculations: [
    calc("kim-1", "김철수 재산세 A", "c-kim", "property"),
    calc("kim-2", "김철수 양도세 B", "c-kim", "transfer"),
    calc("lee-1", "이영희 재산세 C", "c-lee", "property"),
  ],
};

/** 백업 주입(/history에서 import → 병합) 후 mode 반영을 위해 reload. */
async function seed(page: import("@playwright/test").Page) {
  await page.goto("/history");
  await page.getByTestId("history-import-file").setInputFiles({
    name: "cascade-seed.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(BACKUP)),
  });
  await page.getByTestId("history-import-merge").click();
  await expect(page.getByText(/가져오기 완료/)).toBeVisible({ timeout: 10_000 });
}

test.describe("의뢰인 ↔ 계산 cascade delete", () => {
  test("D3 — 연결 계산 있는 의뢰인은 프로필에서 단독 삭제 차단", async ({ page }) => {
    await seed(page);
    await page.goto("/profile");

    // userProfile.mode=professional → 의뢰인 관리 섹션 노출
    const kimRow = page.locator("li").filter({ hasText: "김철수" });
    await expect(kimRow).toBeVisible({ timeout: 10_000 });

    // 김철수(계산 2건) 단독 삭제 시도 → 차단 Dialog
    await kimRow.getByRole("button", { name: "삭제" }).click();
    await expect(
      page.getByText("의뢰인을 삭제할 수 없습니다")
    ).toBeVisible();
    await expect(
      page.getByText(/계산 이력 2건과 연결되어 있습니다/)
    ).toBeVisible();

    // 확인 닫기 → 의뢰인 잔존
    await page.getByRole("button", { name: "확인" }).click();
    await expect(kimRow).toBeVisible();
  });

  test("D1/B — 의뢰인의 마지막 계산 삭제 시 의뢰인도 cascade 삭제", async ({
    page,
  }) => {
    await seed(page);
    await page.reload(); // mode=professional 반영 → 의뢰인 칩·필터 활성

    // 이영희 계산 카드 + 의뢰인 칩 노출 (삭제 버튼 포함 카드로 한정)
    const leeCard = page
      .locator("div")
      .filter({ hasText: "이영희 재산세 C" })
      .filter({ has: page.getByRole("button", { name: "삭제" }) })
      .last();
    await expect(leeCard).toBeVisible({ timeout: 10_000 });

    // 이영희의 마지막(유일) 계산 삭제 → confirm
    await leeCard.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByText("이력 삭제")).toBeVisible();
    // cascade 고지 문구
    await expect(
      page.getByText(/의뢰인의 마지막 계산이면 의뢰인도 함께 삭제됩니다/)
    ).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();

    // 계산 카드 사라짐
    await expect(page.getByText("이영희 재산세 C")).toHaveCount(0);

    // 프로필에서도 이영희 cascade 삭제 확인 (김철수는 유지)
    await page.goto("/profile");
    await expect(page.locator("li").filter({ hasText: "김철수" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("li").filter({ hasText: "이영희" })).toHaveCount(0);
  });

  test("A — 마지막 1건이 아니면 의뢰인 유지", async ({ page }) => {
    await seed(page);
    await page.reload();

    // 김철수 계산 2건 중 1건(재산세 A) 삭제
    const kimCardA = page
      .locator("div")
      .filter({ hasText: "김철수 재산세 A" })
      .filter({ has: page.getByRole("button", { name: "삭제" }) })
      .last();
    await expect(kimCardA).toBeVisible({ timeout: 10_000 });
    await kimCardA.getByRole("button", { name: "삭제" }).click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByText("김철수 재산세 A")).toHaveCount(0);

    // 잔여 계산(양도세 B) + 김철수 유지
    await expect(page.getByText("김철수 양도세 B")).toBeVisible();
    await page.goto("/profile");
    await expect(page.locator("li").filter({ hasText: "김철수" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("C — 전체 삭제 시 계산 참조 의뢰인 cascade 삭제", async ({ page }) => {
    await seed(page);
    await page.reload();
    await expect(page.getByText("이영희 재산세 C")).toBeVisible({
      timeout: 10_000,
    });

    // 전체 삭제 → cascade 고지 → 확인
    await page.getByRole("button", { name: "전체 삭제" }).click();
    await expect(page.getByText("전체 이력 삭제")).toBeVisible();
    await expect(
      page.getByText(/연결된 의뢰인도 함께 삭제됩니다/)
    ).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByText("김철수 양도세 B")).toHaveCount(0);

    // 의뢰인 2명 모두 삭제됨 (계산 0건으로 등록만 된 의뢰인 없음)
    await page.goto("/profile");
    await expect(page.getByText("김철수")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText("이영희")).toHaveCount(0);
  });
});
