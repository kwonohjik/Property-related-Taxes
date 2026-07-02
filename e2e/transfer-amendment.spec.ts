/**
 * 양도소득세 수정신고(경정) — 입력 UI E2E
 *
 * 검증: amendmentMode 시 ① 상단 배너 ② 가산세 스텝이 AmendmentBlock으로 교체
 *   (당초 결정세액·법정신고기한·§48② 감면방식) ③ 기존 무신고/과소신고 패널 미노출.
 * 엔진 계산 정확성은 vitest(__tests__/tax-engine/transfer/amendment.test.ts)로 커버.
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-amendment.spec.ts
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

/** 나대지 10억(취득 3억) 과세 양도를 UI로 입력 후 계산 → 당초 신고 결과 */
async function seedOriginalLandReturn(page: Page) {
  await page.goto("/calc/transfer-tax");
  await fillOriginalLandReturn(page);
}

/** 이미 계산기 화면(자산 목록)에 있는 상태에서 폼을 채우고 계산 (goto 없음 — 세무사 모드 seeding용) */
async function fillOriginalLandReturn(page: Page) {
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
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

  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
}

test.describe("양도소득세 수정신고 입력 UI", () => {
  test("amendmentMode → 배너 + AmendmentBlock 노출, 기존 가산세 패널 미노출", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 수정신고 모드 + 최소 자산을 직접 주입 (이력 hydration과 동등한 상태)
    await page.evaluate(() => {
      sessionStorage.setItem(
        "transfer-tax-wizard",
        JSON.stringify({
          state: {
            formData: {
              assets: [{ assetKind: "housing", addressJibun: "서울 강남구 대치동 1-1" }],
              transferDate: "2022-05-01",
              amendmentMode: true,
              originalDeterminedTax: "30000000",
              statutoryFilingDeadline: "2023-05-31",
            },
            pendingMigration: false,
          },
          version: 0,
        }),
      );
    });
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // ① 배너
    await expect(page.getByText(/수정신고 작성 중/)).toBeVisible();

    // 가산세 스텝으로 점프
    await page.getByRole("button", { name: "가산세", exact: true }).click();

    // ② AmendmentBlock — 항상 보이는 요소 (당초 결정세액·법정신고기한·두 토글)
    await expect(page.getByText("⑤ 수정신고")).toBeVisible();
    await expect(page.getByText(/당초 결정세액/).first()).toBeVisible();
    await expect(page.getByText(/신고불성실가산세 적용/)).toBeVisible();
    await expect(page.getByText(/납부지연가산세 적용/)).toBeVisible();

    // 신고불성실 토글 ON → §48② 감면방식 노출 (children은 ON일 때만 렌더)
    await page.getByText(/신고불성실가산세 적용/).click();
    await expect(page.getByText(/§48② 자진수정 감면/)).toBeVisible();

    // ③ 기존 무신고/과소신고 패널 미노출 (상호배타)
    await expect(page.getByText("가산세 계산하기")).toHaveCount(0);
  });

  test("§48② 자동감면 — 수정신고일 입력 시 경과기간별 감면율 자동 표시", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate(() => {
      sessionStorage.setItem(
        "transfer-tax-wizard",
        JSON.stringify({
          state: {
            formData: {
              assets: [{ assetKind: "land", addressJibun: "서울 강남구 대치동 1-1" }],
              transferDate: "2023-05-01",
              amendmentMode: true,
              originalDeterminedTax: "30000000",
              statutoryFilingDeadline: "2024-05-31",
            },
            pendingMigration: false,
          },
          version: 0,
        }),
      );
    });
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.getByRole("button", { name: "가산세", exact: true }).click();

    // 신고불성실 ON → §48② 감면 모드 선택
    await page.getByText(/신고불성실가산세 적용/).click();
    await page.getByText(/§48② 자진수정 감면/).click();

    // 수정신고일 2024-09-15 (기한 2024-05-31 후 3개월 초과 6개월 이내 → 50% 감면)
    const filingScope = page.locator("label:has-text('수정신고일')").locator("xpath=..");
    await filingScope.getByLabel("연도", { exact: true }).fill("2024");
    await filingScope.getByLabel("월", { exact: true }).fill("09");
    await filingScope.getByLabel("일", { exact: true }).fill("15");

    // 엔진 헬퍼(resolveAmendmentReductionRate) 단일진실 프리뷰 — 50% 감면
    await expect(page.getByText(/50% 감면/)).toBeVisible();
  });

  test("이력 → 수정신고 작성 → 배너 + 당초 결정세액 자동 prefill (faithful 진입)", async ({ page }) => {
    // 1. 당초 신고 계산 → 결과 마운트 → 자동 저장
    await seedOriginalLandReturn(page);
    await expect(page.getByRole("button", { name: "다시 계산하기" })).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1200); // IndexedDB auto-save 커밋 대기

    // 2. 이력 진입 → 레코드 열기
    await page.goto("/history");
    const record = page.locator("div.cursor-pointer").first();
    await expect(record).toBeVisible({ timeout: 15000 });
    await record.click();

    // 3. "수정신고 작성" (single-mode guard 통과) → handleAmend
    await page.getByTestId("drawer-amend").click();

    // 4. 배너 + 계산기 진입
    await expect(page.getByText(/수정신고 작성 중/)).toBeVisible({ timeout: 15000 });

    // 5. 가산세 스텝 — 당초 결정세액이 이력에서 자동 prefill(>0)
    await page.getByRole("button", { name: "가산세", exact: true }).click();
    const origInput = inputByLabel(page, "당초 결정세액");
    await expect(origInput).not.toHaveValue("");
    await expect(origInput).not.toHaveValue("0");
  });
});

// ── 세무사(전문가) 모드 — 수정신고 진입 시 의뢰인 선택 관문 스킵 ──
//
// 당초 신고서(이력 기록)를 이미 선택해 진입하므로 의뢰인은 record.clientId로 확정됨.
// handleAmend가 activeClientId를 자동 세팅 → ProfessionalClientGate 자동 통과.
// (record.clientId === null 이면 세팅 생략 → 관문 노출이 올바른 폴백 — reasoning 커버, 별도 스펙 없음)

const PRO_NOW = "2026-06-01T00:00:00.000Z";
const PRO_BACKUP = {
  format: "korean-tax-calc-backup",
  version: 1,
  dbVersion: 6,
  exportedAt: PRO_NOW,
  userProfile: {
    id: "local-user",
    displayName: "테스트 세무사",
    birthDate: null,
    mode: "professional",
    createdAt: PRO_NOW,
    updatedAt: PRO_NOW,
  },
  clients: [
    {
      id: "c-1",
      userId: "local-user",
      name: "김세무의뢰인",
      birthDate: null,
      phone: null,
      email: null,
      memo: null,
      lastUsedAt: PRO_NOW,
      createdAt: PRO_NOW,
      updatedAt: PRO_NOW,
    },
  ],
  calculations: [],
};

test.describe("세무사 모드 — 수정신고/경정청구 진입 시 의뢰인 관문 스킵", () => {
  test("이력 → 수정신고 작성 → 의뢰인 선택 관문 미노출, 곧바로 배너 진입", async ({ page }) => {
    // 1. 세무사 모드 + 의뢰인 1명 주입 (백업 import) → reload로 mode 반영
    await page.goto("/history");
    await page.getByTestId("history-import-file").setInputFiles({
      name: "pro-seed.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(PRO_BACKUP)),
    });
    await page.getByTestId("history-import-merge").click();
    await expect(page.getByText(/가져오기 완료/)).toBeVisible({ timeout: 10_000 });
    await page.reload();

    // 2. 계산기 진입 → 의뢰인 관문에서 의뢰인 선택 (선택 즉시 관문 통과 → activeClientId=c-1)
    //    이후 page.goto는 메모리 store를 리셋하므로, 같은 페이지에서 곧바로 폼을 채운다.
    await page.goto("/calc/transfer-tax");
    await expect(page.getByRole("heading", { name: "의뢰인 선택" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "김세무의뢰인" }).first().click();

    // 3. 당초 신고 계산 → 저장 (clientId=c-1로 기록)
    await fillOriginalLandReturn(page);
    await expect(page.getByRole("button", { name: "다시 계산하기" })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1200); // IndexedDB auto-save 커밋 대기

    // 4. 이력 진입 (page.goto = 전체 로드 → activeClientId 메모리 초기화 = 관문 재현 조건)
    await page.goto("/history");
    const record = page.locator("div.cursor-pointer").first();
    await expect(record).toBeVisible({ timeout: 15_000 });
    await record.click();
    await page.getByTestId("drawer-amend").click();

    // 5. 검증 — 의뢰인 선택 관문 미노출 + 곧바로 수정신고 배너
    await expect(page.getByText(/수정신고 작성 중/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "의뢰인 선택" })).toHaveCount(0);
  });
});

// ── 이력 카드에서 수정신고·경정청구 직접 진입 + "수정"→"편집" 라벨 ──
// 드로어를 열지 않고 카드 버튼으로 바로 진입. 진입 로직은 드로어와 공유(lib/calc/transfer-amendment-entry).
test.describe("이력 카드 — 수정신고·경정청구 버튼 + 편집 라벨", () => {
  test("카드 수정신고 버튼 → 배너 진입, '편집' 노출·'수정' 미노출", async ({ page }) => {
    await seedOriginalLandReturn(page);
    await expect(page.getByRole("button", { name: "다시 계산하기" })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1200); // IndexedDB auto-save 커밋 대기

    await page.goto("/history");
    // 라벨 변경 — '편집' 노출, '수정'(단독) 미노출
    await expect(page.getByRole("button", { name: "편집", exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "수정", exact: true })).toHaveCount(0);

    // 카드 '수정신고' 버튼 → 곧바로 배너 (드로어 미경유)
    await page.getByRole("button", { name: "수정신고", exact: true }).first().click();
    await expect(page.getByText(/수정신고 작성 중/)).toBeVisible({ timeout: 15_000 });
  });

  test("카드 경정청구 버튼 → sky 배너 진입", async ({ page }) => {
    await seedOriginalLandReturn(page);
    await expect(page.getByRole("button", { name: "다시 계산하기" })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1200);

    await page.goto("/history");
    await page.getByRole("button", { name: "경정청구", exact: true }).first().click();
    await expect(page.getByText(/경정청구 작성 중/)).toBeVisible({ timeout: 15_000 });
  });
});
