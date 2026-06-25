/**
 * 이력 백업 Export/Import E2E
 *
 * 1. 가져오기(픽스처 JSON) → 병합 Dialog → 토스트 + 목록 재등장
 * 2. 내보내기 → 평문 경고 Dialog → 확인 → download 이벤트(파일명)
 * 3. 잘못된 JSON → 오류 토스트
 *
 * IndexedDB는 테스트별 새 컨텍스트라 비어있음 → 가져오기로 데이터 주입.
 * 실행: npx playwright test e2e/history-backup.spec.ts
 *
 * 계획서: docs/00-pm/local-first-storage-backup.plan.md §8
 */

import { test, expect } from "@playwright/test";

const BACKUP = {
  format: "korean-tax-calc-backup",
  version: 1,
  dbVersion: 6,
  exportedAt: "2026-06-25T00:00:00.000Z",
  userProfile: null,
  clients: [],
  calculations: [
    {
      id: "e2e-backup-1",
      userId: "local-user",
      taxType: "property",
      title: "백업테스트 재산세",
      inputData: { road: "서울특별시 강남구 테헤란로 152" },
      resultData: { totalPayable: 168000 },
      taxLawVersion: "2026-06-01",
      linkedCalculationId: null,
      clientId: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  ],
};

test.describe("이력 백업 Export/Import §112", () => {
  test("가져오기(병합) → 목록 재등장 → 내보내기(경고→다운로드)", async ({ page }) => {
    await page.goto("/history");

    // 1. 가져오기 — hidden file input에 직접 주입
    await page.getByTestId("history-import-file").setInputFiles({
      name: "korean-tax-calc-backup_2026-06-25.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(BACKUP)),
    });

    // 병합 선택 Dialog
    await page.getByTestId("history-import-merge").click();

    // 토스트 + 목록 재등장
    await expect(page.getByText(/가져오기 완료/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("백업테스트 재산세")).toBeVisible();

    // 2. 내보내기 — 평문 경고 Dialog
    await page.getByTestId("history-export-button").click();
    await expect(page.getByText(/평문/)).toBeVisible();

    // 확인 → download 이벤트
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("history-export-confirm").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/korean-tax-calc-backup_/);
  });

  test("잘못된 JSON 가져오기 → 오류 토스트", async ({ page }) => {
    await page.goto("/history");
    await page.getByTestId("history-import-file").setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from("{ not valid json"),
    });
    await expect(page.getByText(/읽을 수 없습니다|검증 실패/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("형식 불일치(format 오류) → 검증 실패 토스트", async ({ page }) => {
    await page.goto("/history");
    await page.getByTestId("history-import-file").setInputFiles({
      name: "wrong.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ format: "other", version: 1 })),
    });
    await expect(page.getByText(/검증 실패/)).toBeVisible({ timeout: 10_000 });
  });

  test("암호화 export → import 비밀번호 복호화 round-trip", async ({ page }) => {
    await page.goto("/history");

    // 평문 데이터 주입
    await page.getByTestId("history-import-file").setInputFiles({
      name: "seed.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(BACKUP)),
    });
    await page.getByTestId("history-import-merge").click();
    await expect(page.getByText(/가져오기 완료/)).toBeVisible({ timeout: 10_000 });

    // 암호화 내보내기
    await page.getByTestId("history-export-button").click();
    await page.getByRole("switch", { name: "비밀번호로 암호화" }).click();
    await page.getByTestId("history-export-password").fill("test1234");
    const dl = page.waitForEvent("download");
    await page.getByTestId("history-export-confirm").click();
    const download = await dl;
    expect(download.suggestedFilename()).toMatch(/_encrypted\.json/);
    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    // 암호화 파일 가져오기 → 비밀번호 Dialog
    await page.getByTestId("history-import-file").setInputFiles(filePath!);
    await expect(page.getByTestId("history-import-password")).toBeVisible({ timeout: 10_000 });

    // 잘못된 비밀번호 → 오류
    await page.getByTestId("history-import-password").fill("wrong-pw");
    await page.getByTestId("history-decrypt-confirm").click();
    await expect(page.getByTestId("history-decrypt-error")).toBeVisible({ timeout: 10_000 });

    // 올바른 비밀번호 → 복호화 → 병합 Dialog
    await page.getByTestId("history-import-password").fill("test1234");
    await page.getByTestId("history-decrypt-confirm").click();
    await expect(page.getByTestId("history-import-merge")).toBeVisible({ timeout: 10_000 });
  });
});
