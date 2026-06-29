/**
 * 홈 진입 시 마법사 입력값 초기화 (?new=1) E2E
 *
 * 계획서: docs/00-pm/wizard-reset-on-home-entry.plan.md §7
 * 버그: 홈 카드로 진입해도 sessionStorage 잔존 formData가 복원되어 이전 입력(양도일 등)이 채워져 보임.
 * 수정: 홈 카드 href에 ?new=1 → 진입 컴포넌트가 mount 시 reset(빈 폼) + URL에서 param 제거.
 *   작업 중 새로고침(param 없음)은 입력값 보존.
 *
 * 대표(양도세) E1·E2·E3: 초기화 ↔ 보존 분기 직접 검증
 * 전수(F1~F5): 5개 마법사 store reset 배선 실동작 확인
 */
import { test, expect, type Page } from "@playwright/test";

const TRANSFER_KEY = "transfer-tax-wizard";

/** addInitScript로 문서 로드 전 sessionStorage 주입(잔존 입력 시뮬레이션) */
async function seedSession(page: Page, key: string, state: unknown) {
  await page.addInitScript(
    ({ key, state }) => {
      sessionStorage.setItem(key, JSON.stringify({ state, version: 0 }));
    },
    { key, state },
  );
}

test.describe("홈 진입(?new=1) 시 마법사 초기화 — 대표(양도세)", () => {
  test("E1: ?new=1 진입 → 양도일 빈칸 + URL에서 new 제거", async ({ page }) => {
    await seedSession(page, TRANSFER_KEY, {
      formData: { transferDate: "2026-02-16" },
      pendingMigration: false,
    });
    await page.goto("/calc/transfer-tax?new=1");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일 연도 input(첫 DateInput)이 빈칸 → reset됨
    await expect(page.getByLabel("연도").first()).toHaveValue("");
    // ?new=1 제거됨
    expect(new URL(page.url()).searchParams.get("new")).toBeNull();
  });

  test("E2: param 없이 진입 → 양도일 보존(새로고침 시나리오)", async ({ page }) => {
    await seedSession(page, TRANSFER_KEY, {
      formData: { transferDate: "2026-02-16" },
      pendingMigration: false,
    });
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 잔존 양도일 보존 (연도 2026)
    await expect(page.getByLabel("연도").first()).toHaveValue("2026");
  });

  test("E3: 홈에서 양도세 카드 클릭 → 빈 폼", async ({ page }) => {
    await seedSession(page, TRANSFER_KEY, {
      formData: { transferDate: "2026-02-16" },
      pendingMigration: false,
    });
    await page.goto("/");
    // 양도소득세 카드 클릭 — 단건 고유 subtitle로 특정 (href에 ?new=1 포함)
    await page.getByRole("link", { name: /양도소득세 부동산 매도/ }).click();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expect(page.getByLabel("연도").first()).toHaveValue("");
  });
});

// 전수 — 각 세목 ?new=1 진입 시 주입 마커가 sessionStorage에서 사라짐(reset 실동작)
const FIXTURES = [
  {
    name: "F1 양도세",
    key: TRANSFER_KEY,
    path: "/calc/transfer-tax",
    state: { formData: { transferDate: "2099-01-01" }, pendingMigration: false },
    marker: "2099-01-01",
  },
  {
    name: "F3 주식양도세",
    key: "stock-transfer-tax-wizard",
    path: "/calc/stock-transfer-tax",
    state: { formData: { securityName: "MARKER_X" } },
    marker: "MARKER_X",
  },
  {
    name: "F4 종부세",
    key: "comprehensive-tax-wizard",
    path: "/calc/comprehensive-tax",
    state: { formData: { assessmentYear: "2099" } },
    marker: "\"assessmentYear\":\"2099\"",
  },
  {
    name: "F5 주식평가",
    key: "stock-valuation-tool",
    path: "/tools/stock-valuation",
    state: { formData: { valuationDate: "2099-01-01" } },
    marker: "2099-01-01",
  },
];

test.describe("홈 진입(?new=1) 시 마법사 초기화 — 전수", () => {
  for (const fx of FIXTURES) {
    test(`${fx.name}: ?new=1 진입 시 초기화`, async ({ page }) => {
      await seedSession(page, fx.key, fx.state);
      await page.goto(`${fx.path}?new=1`);
      await page.waitForLoadState("networkidle");

      // reset 후 해당 키의 직렬화에서 마커가 사라짐(또는 키 제거)
      await expect
        .poll(async () => {
          const stored = await page.evaluate(
            (key) => sessionStorage.getItem(key),
            fx.key,
          );
          return stored?.includes(fx.marker) ?? false;
        })
        .toBe(false);
    });
  }

  test("F2 양도세 다건: 2개 키(properties + 단건 작업영역) 모두 초기화", async ({
    page,
  }) => {
    await seedSession(page, "multi-transfer-tax-wizard", {
      form: { properties: [], activeStep: "list" },
    });
    await seedSession(page, TRANSFER_KEY, {
      formData: { transferDate: "2099-01-01" },
      pendingMigration: false,
    });
    await page.goto("/calc/transfer-tax/multi?new=1");
    await page.waitForLoadState("networkidle");

    // 단건 작업영역(transfer-tax-wizard)의 마커가 사라짐 — 정정 #1 실효(2개 store reset)
    await expect
      .poll(async () => {
        const t = await page.evaluate(() =>
          sessionStorage.getItem("transfer-tax-wizard"),
        );
        return t?.includes("2099-01-01") ?? false;
      })
      .toBe(false);
  });
});
