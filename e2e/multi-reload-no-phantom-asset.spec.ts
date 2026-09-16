/**
 * 다건 마법사 — **새로고침해도 빈 자산이 늘지 않는다** (마운트 판정 입력원)
 *
 * 계획서: `docs/00-pm/multi-mount-effect-stale-closure.plan.md`
 *
 * ## 종전 결함 (실측)
 * 마운트 `useEffect(..., [])`가 **첫 렌더(zustand persist 리하이드레이션 전)의 closure**로
 * 판정했다. 그 시점 store는 이미 복원돼 있어 두 값이 어긋났다:
 *   `closure {0,"list"}` ↔ `live {1,"edit"}`
 * ⇒ ① 「자산이 없다」로 오판해 **새로고침마다 빈 자산 +1**(1→2→3, 라벨 전부 「양도 1번」)
 *    ② `activeStep`이 closure에서 `"result"`·`"edit"`가 될 수 없어 **나머지 두 분기가 사장**
 *
 * ## 🔑 이 spec이 유일한 안전망이다
 * 판정 자체는 순수 함수 anchor(`multi-mount-decision.predo.anchor.test.ts`)가 고정하지만,
 * **「무엇을 입력으로 주는가」는 순수 함수가 모른다**. closure로 되돌리는 뮤테이션은
 * anchor를 하나도 깨지 않고 **이 spec만** 깬다.
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/multi-reload-no-phantom-asset.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const KEY = "multi-transfer-tax-wizard";

/** persist된 다건 폼을 직접 조작한다 — 새로고침 경로를 재현하는 유일한 수단 */
async function mutatePersistedForm(page: Page, src: string) {
  await page.evaluate((code) => {
    const raw = sessionStorage.getItem("multi-transfer-tax-wizard");
    if (!raw) throw new Error("persist entry 없음 — 마운트를 기다릴 것");
    const parsed = JSON.parse(raw);
    new Function("form", code)(parsed.state.form);
    sessionStorage.setItem("multi-transfer-tax-wizard", JSON.stringify(parsed));
  }, src);
}

async function readState(page: Page) {
  return page.evaluate((k) => {
    const f = JSON.parse(sessionStorage.getItem(k)!).state.form;
    const wraw = sessionStorage.getItem("transfer-tax-wizard");
    const wf = wraw ? JSON.parse(wraw)?.state?.formData : null;
    return {
      count: f.properties.length as number,
      labels: f.properties.map((p: { propertyLabel: string }) => p.propertyLabel) as string[],
      activeStep: f.activeStep as string,
      activeIndex: f.activePropertyIndex as number,
      wizardTransferDate: (wf?.transferDate ?? null) as string | null,
    };
  }, KEY);
}

test.describe("다건 마법사 새로고침", () => {
  test("🔴 새로고침 3회에도 자산이 늘지 않는다 (종전 1→2→3)", async ({ page }) => {
    await page.goto("/calc/transfer-tax/multi");
    await page.waitForTimeout(2000);
    const before = await readState(page);
    expect(before.count).toBe(1);

    for (let i = 0; i < 3; i++) {
      await page.reload();
      await page.waitForTimeout(1500);
      const after = await readState(page);
      expect(after.count, `새로고침 ${i + 1}회 후 자산 수`).toBe(1);
      expect(after.labels).toEqual(["양도 1번"]);
      expect(after.activeStep).toBe(before.activeStep);
    }
  });

  test("[V-2] 편집 중 새로고침 — 활성 자산과 그 폼이 유지된다", async ({ page }) => {
    await page.goto("/calc/transfer-tax/multi");
    await page.waitForTimeout(2000);
    await mutatePersistedForm(
      page,
      `const p0 = form.properties[0];
       p0.form.transferDate = "2026-01-01";
       const p1 = JSON.parse(JSON.stringify(p0));
       p1.propertyId = "e2e-p2";
       p1.propertyLabel = "양도 2번";
       p1.form.transferDate = "2026-09-09";
       form.properties = [p0, p1];
       form.activePropertyIndex = 1;
       form.activeStep = "edit";`,
    );

    await page.reload();
    await page.waitForTimeout(2000);

    const after = await readState(page);
    // 종전: 자산 3건(라벨 「양도 1번」 중복) · activeIndex 0으로 점프 · wizard에 **빈 폼**
    expect(after.count).toBe(2);
    expect(after.labels).toEqual(["양도 1번", "양도 2번"]);
    expect(after.activeIndex).toBe(1);
    expect(after.wizardTransferDate).toBe("2026-09-09");
  });

  test("[V-1] 결과 단계 새로고침 — 공통 설정으로 되돌린다 (result는 저장되지 않는다)", async ({
    page,
  }) => {
    await page.goto("/calc/transfer-tax/multi");
    await page.waitForTimeout(2000);
    await mutatePersistedForm(page, `form.activeStep = "result";`);

    await page.reload();
    await page.waitForTimeout(2000);

    const after = await readState(page);
    // 종전: 이 복구가 영영 실행되지 않고, 대신 빈 자산이 추가되며 "edit"으로 갔다
    expect(after.activeStep).toBe("settings");
    expect(after.count).toBe(1);
  });
});
