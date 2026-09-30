/**
 * 양도세 검증 오류 → 수정할 입력칸으로 이동 (Phase 1, 2026-09-30)
 *
 * 계획서: `docs/00-pm/transfer-validation-field-jump.plan.md`
 * 선행: `transfer-validation-issue-panel.spec.ts` (하단 sticky 목록)
 *
 * 🔑 「이동했다」의 증거는 포커스(`toBeFocused`)와 뷰포트(`toBeInViewport`)다 — 스크롤만으로는
 *    어느 입력칸인지 증명되지 않는다.
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-validation-field-jump.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { FIELD_JUMP_CASES, fallbackControlForm } from "./_helpers/validation-field-jump-cases";
import { ACQ_FIELD_JUMP_CASES } from "./_helpers/validation-field-jump-cases-acq";
import { P3_FIELD_JUMP_CASES } from "./_helpers/validation-field-jump-cases-p3";

async function ready(page: Page) {
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // dev 서버 Next.js 표시기 배지가 하단 버튼을 덮는다(선행 PR 실측)
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  // hydration 전 클릭은 조용히 유실된다(e2e/CLAUDE.md §6)
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

async function openEmpty(page: Page) {
  await page.goto("/calc/transfer-tax?new=1");
  await ready(page);
}

/** ⚠️ 앱 기본 폼에서 출발한다 — 최소 필드만 손으로 적으면 신규 배열 필드 누락으로 화면이 죽는다. */
async function seedAndOpen(page: Page, patch: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const formData = { ...createDefaultTransferFormData(), ...patch };
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 },
  );
  await page.reload();
  await ready(page);
}

const panel = (page: Page) => page.getByTestId("validation-issues");
const next = (page: Page) => page.getByRole("button", { name: "다음", exact: true });

test.describe("검증 오류 → 입력칸 이동", () => {
  test("Q-2=a 「다음」 실패 즉시 첫 오류(양도일) 입력칸에 커서", async ({ page }) => {
    await openEmpty(page);
    await next(page).click();

    const year = page.getByTestId("transfer-date").getByLabel("연도", { exact: true });
    await expect(year).toBeFocused();
    await expect(year).toBeInViewport();
  });

  test("폼 전역 오류 클릭 → 단건은 자산 카드의 양도가액 칸 (접힌 ②를 펼쳐서)", async ({ page }) => {
    // 단건 모드엔 「총 양도가액」 카드가 없다(`Step1.tsx` splitMode !== "none" 게이트) —
    // 자산 카드 ②의 「양도가액」이 그 값이다(`Step1.updateAssets`가 contractTotalPrice로 동기화).
    // 자산 카드에 **다른 오류가 없게** 채운다 → 카드 섹션이 강제로 펼쳐지지 않아(D-5 미발동)
    // 접힌 ② 안의 칸을 D-4가 직접 펼쳐야 한다. (probe 실측: 이 입력의 오류는 총 양도가액 1건뿐)
    await seedAndOpen(page, {
      assets: [
        {
          ...makeDefaultAsset(1),
          addressJibun: "서울 강남구 테스트동 1-1",
          acquisitionDate: "2015-03-01",
          fixedAcquisitionPrice: "300000000",
          useEstimatedAcquisition: false,
          isAppraisalAcquisition: false,
        },
      ],
      transferDate: "2024-03-01",
      contractTotalPrice: "",
    });
    const input = page.locator('[data-asset-card-index="0"] [data-testid="companion-actual-sale-price"]');
    await expect(input).toBeHidden(); // 접힌 섹션 ② 안 — 이 전제가 깨지면 펼침 경로를 검증하지 못한다

    await next(page).click();
    await expect(input).toBeFocused(); // Q-2=a 자동 이동
    await panel(page).getByRole("button", { name: "총 양도가액을 입력하세요." }).click();
    await expect(input).toBeFocused();
    await expect(input).toBeInViewport();
  });

  test("폼 전역 오류 클릭 → 다건은 「총 양도가액」 카드", async ({ page }) => {
    await seedAndOpen(page, {
      assets: [makeDefaultAsset(1), makeDefaultAsset(2)],
      transferDate: "2024-03-01",
      contractTotalPrice: "",
    });
    await next(page).click();
    await panel(page).getByRole("button", { name: "총 양도가액을 입력하세요." }).click();

    // 라벨이 **정확히** 「총 양도가액」인 카드 — 안내문에 같은 문구를 담은 카드가 먼저 잡힌다
    const input = page
      .locator('[data-slot="field-card"]', { has: page.getByText("총 양도가액", { exact: true }) })
      .locator("input");
    await expect(input).toBeFocused();
    await expect(input).toBeInViewport();
  });

  test("D-5 자산 2의 오류 클릭 → 접혀 있던 자산 2 카드를 펼치고 그 입력칸", async ({ page }) => {
    await seedAndOpen(page, {
      assets: [makeDefaultAsset(1), makeDefaultAsset(2)],
      transferDate: "2024-03-01",
      contractTotalPrice: "1000000000",
    });
    await next(page).click();
    const item = panel(page).getByRole("button", { name: /^자산 2: 소재지를 입력하세요/ });
    await expect(item).toBeVisible();

    // D-5 고유 효과 — 첫 오류 카드뿐 아니라 자산 2 카드에도 **자기** 오류 배너가 뜬다.
    // (입력칸 이동 자체는 D-4의 섹션 펼치기로도 되므로, 이 단언이 D-5를 구별한다)
    const card2 = page.locator('[data-asset-card-index="1"]');
    await expect(card2.locator("p").first()).toHaveText(/^자산 2: 소재지를 입력하세요/);

    await item.click();
    const focusedInCard2 = card2.locator("input:focus");
    await expect(focusedInCard2).toHaveCount(1);
    await expect(focusedInCard2).toBeInViewport();
  });

  test("D-7 1단계 오류도 클릭하면 그 입력으로 (세대 보유 주택 수)", async ({ page }) => {
    await seedAndOpen(page, { householdHousingCount: "" });
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await next(page).click();

    // Q-2=a — 누르자마자 첫 오류로 간다
    const group = page.getByTestId("household-house-count-buttons");
    await expect(group.locator(":focus")).toHaveCount(1);
    await expect(group).toBeInViewport();
  });

  test("필드 미부착 오류는 현행처럼 자산 카드로 후퇴한다 (퇴행 0)", async ({ page }) => {
    // 지분 단독 불가 — 칸 하나가 아닌 조합 오류라 field가 영영 없다(대조군 근거는 헬퍼 주석)
    await seedAndOpen(page, fallbackControlForm());
    await next(page).click();
    await expect(panel(page).getByText(/^자산: 지분 모드 자산/)).toBeVisible();

    const card = page.locator('[data-asset-card-index="0"]');
    const banner = card.locator("p").first();
    await expect(banner).toBeInViewport();
    // 입력칸으로 가지 않았다 — 카드 안에 포커스된 입력이 없다
    await expect(card.locator("input:focus")).toHaveCount(0);
  });
});

/**
 * field 부착 메시지 전수(Phase 1 키 · Phase 2 취득 메시지) — 「그 오류를 누르면 그 키의 입력칸에 커서」.
 * 입력은 `_helpers/validation-field-jump-cases*.ts`(오류 발생은 vitest가 먼저 고정).
 */
test.describe("검증 오류 → 입력칸 이동 (키 전수)", () => {
  for (const c of [...FIELD_JUMP_CASES, ...ACQ_FIELD_JUMP_CASES, ...P3_FIELD_JUMP_CASES]) {
    test(c.name ?? c.field, async ({ page }) => {
      test.skip(!!c.unreachableInUi, c.unreachableInUi);
      await seedAndOpen(page, c.form());
      if (c.prepare) await c.prepare(page);
      if (c.step === 1) await page.getByRole("button", { name: "보유 상황" }).first().click();
      if (c.step === 3) await page.getByRole("button", { name: "가산세" }).first().click();
      await (c.step === 3 ? page.getByRole("button", { name: /세금 계산하기/ }) : next(page)).click();

      const item = panel(page).getByRole("button", { name: c.message });
      await expect(item).toBeVisible();
      await item.click();

      // 포커스가 그 키의 앵커 안(자산 수준이면 그 카드 안)에 있고 화면에 보인다.
      // 「안」으로 본다 — 면적 칸처럼 앵커가 겹치는 곳이 있어 가장 가까운 앵커만 비교하면 틀린다.
      await expect
        .poll(() =>
          page.evaluate((key) => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body) return null;
            return {
              inField: !!el.closest(`[data-field="${CSS.escape(key)}"]`),
              card: el.closest("[data-asset-card-index]")?.getAttribute("data-asset-card-index") ?? null,
            };
          }, c.field),
        )
        .toMatchObject(c.assetIndex != null ? { inField: true, card: String(c.assetIndex) } : { inField: true });
      await expect(page.locator(":focus")).toBeInViewport();
    });
  }
});
