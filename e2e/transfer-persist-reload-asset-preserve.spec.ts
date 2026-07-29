/**
 * persist rehydration — 새로고침(F5) 시 자산 데이터 보존 회귀 방어 (E2E).
 *
 * 버그: merge 오판별로 정상 formData도 legacy로 분류 → migrateLegacyForm이 assets 폐기.
 * sessionStorage 원본은 보존되나 rehydrate된 store가 빈 주택 1개로 리셋됨.
 * → 검증은 "reload 후 store 상태"를 관찰해야 한다(sessionStorage 원본 직접 읽기는 무의미:
 *   원본은 항상 2자산 유지 → 버그 검출 불가).
 *
 * 방식: 2자산 시딩 → reload(merge 실행) → 폼-전역 필드 입력(set())으로 merge된 store 상태를
 * sessionStorage에 재기록 유도 → 재기록된 store.formData.assets 관찰.
 * 입력이 실제 재기록을 유발했음은 transferDate가 새 값으로 바뀐 것으로 확증(스테일 시드와 구분).
 *
 * worktree 실행: E2E_PORT=3200 npx playwright test e2e/transfer-persist-reload-asset-preserve.spec.ts
 */
import { test, expect } from "@playwright/test";

const STORE_KEY = "transfer-tax-wizard";

async function fillTransferDate(page: import("@playwright/test").Page, y: string, m: string, d: string) {
  await page.getByTestId("transfer-date").getByLabel("연도").fill(y);
  await page.getByTestId("transfer-date").getByLabel("월").fill(m);
  await page.getByTestId("transfer-date").getByLabel("일").fill(d);
}

test.describe("양도세 마법사 persist — 새로고침 자산 보존", () => {
  test("자산 2개 입력 후 새로고침해도 자산·값이 보존된다(빈 주택 1개로 리셋되지 않음)", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // persist는 최초 set() 때 기록 → 날짜 입력 1회로 저장 유발 후 시딩.
    await fillTransferDate(page, "2023", "01", "01");
    await expect
      .poll(async () => page.evaluate((key) => (sessionStorage.getItem(key) ? 1 : 0), STORE_KEY))
      .toBe(1);

    // ── ① 자산 2개(상가 3억 + 토지 2억)·합계 10억을 정상 상태로 주입 ──
    const seeded = await page.evaluate((key) => {
      const stored = JSON.parse(sessionStorage.getItem(key) ?? "{}");
      const fd = stored?.state?.formData;
      if (!fd?.assets?.[0]) return { ok: false };
      fd.assets[0].assetKind = "commercial_building";
      fd.assets[0].fixedAcquisitionPrice = "300000000";
      const second = JSON.parse(JSON.stringify(fd.assets[0]));
      second.assetId = "asset-seed-2"; // 고유 id (React key 충돌 방지)
      second.assetKind = "land";
      second.fixedAcquisitionPrice = "200000000";
      second.assetLabel = "자산 2";
      fd.assets.push(second);
      fd.contractTotalPrice = "1000000000";
      sessionStorage.setItem(key, JSON.stringify(stored));
      return { ok: true, count: fd.assets.length };
    }, STORE_KEY);
    expect(seeded.ok).toBe(true);
    expect(seeded.count).toBe(2);

    // ── ② 새로고침 → store rehydration(merge) 실행 ──
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // ── ③ 폼-전역 필드에 '새 값' 입력 → merge된 store 상태를 재기록 유도 ──
    await fillTransferDate(page, "2024", "06", "01");
    // transferDate가 시드값(2023-...) → 2024-...로 바뀌면 재기록이 실제로 일어난 것.
    await expect
      .poll(async () =>
        page.evaluate((key) => {
          const s = JSON.parse(sessionStorage.getItem(key) ?? "{}");
          return String(s?.state?.formData?.transferDate ?? "").startsWith("2024") ? 1 : 0;
        }, STORE_KEY)
      )
      .toBe(1);

    // ── ④ 재기록된(=merge 결과) store 상태 관찰: 자산 2개·값 보존 확인 ──
    const after = await page.evaluate((key) => {
      const fd = JSON.parse(sessionStorage.getItem(key) ?? "{}")?.state?.formData ?? {};
      const assets = fd.assets ?? [];
      return {
        count: assets.length,
        kind0: assets[0]?.assetKind,
        price0: assets[0]?.fixedAcquisitionPrice,
        kind1: assets[1]?.assetKind,
        price1: assets[1]?.fixedAcquisitionPrice,
        contractTotalPrice: fd.contractTotalPrice,
      };
    }, STORE_KEY);

    // 버그(수정 전)라면 count=1·kind0="housing"·price0=""로 실패한다.
    expect(after.count).toBe(2);
    expect(after.kind0).toBe("commercial_building");
    expect(after.price0).toBe("300000000");
    expect(after.kind1).toBe("land");
    expect(after.price1).toBe("200000000");
    expect(after.contractTotalPrice).toBe("1000000000");
  });
});
