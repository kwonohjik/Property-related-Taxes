/**
 * 함께 양도(컴패니언) 자산의 「토지·건물 소유자 다름」 — 취득시 기준시가 채널 (2026-10-07)
 *
 * 컴패니언 카드도 소유자 분리 칸(㎡당 개별공시지가·면적·기준시가 총액)을 받는데, ④가 싣지 않고 ⑫·⑭에 칸이 없어
 * 엔진이 분리 계산을 포기했다 → `selfOwns` 무시 → 비소유 파트까지 과세(침묵 오답).
 * vitest anchor(`__tests__/api/transfer.route.companion-owner-split-std-channel.anchor.test.ts`)가 ④→⑫→⑭→엔진을
 * 고정하고, 여기서는 **화면 입력 → 실제 request body → 결과 카드**를 확인한다.
 *
 * worktree 실행: E2E_PORT=3127 npx playwright test e2e/transfer-companion-owner-split-std-channel.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { bundle } from "./_helpers/validation-field-jump-cases";

async function seedFormAndOpen(page: Page, formData: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  // hydration 전 클릭은 조용히 유실된다(e2e/CLAUDE.md §6)
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

/** 둘째 자산 = 일반 건물 · 건물만 본인 소유 · 2015-03-01 매매 1억(동시 취득) · 취득시 토지분 1,000,000 × 100㎡ = 1억 */
const withCompanion = bundle({
  assetKind: "building",
  selfOwns: "building_only",
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "",
  acquisitionArea: "100",
  transferArea: "100",
  standardPricePerSqmAtAcq: "1000000",
  standardPriceAtAcq: "160000000",
  landStandardPriceAtTransfer: "60000000",
  buildingStandardPriceAtTransfer: "40000000",
});
// 자산 1(주택)도 함께 양도 안분 키가 필요하다 — 양도가액 5억을 기준시가 3억 : 1억으로 나눈다.
const ownerSplitCompanion = {
  ...withCompanion,
  assets: [{ ...withCompanion.assets[0], standardPriceAtTransfer: "300000000" }, withCompanion.assets[1]],
};

test.describe("컴패니언 소유자 분리 — 취득시 기준시가가 엔진에 닿는다", () => {
  test("request body에 ㎡당 공시지가·면적·총액이 실리고 · 결과가 건물 파트만 과세한다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedFormAndOpen(page, ownerSplitCompanion);
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    const reqPromise = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
    const resPromise = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
    await page.getByRole("button", { name: "세금 계산하기" }).click();

    const body = (await reqPromise).postDataJSON() as { companionAssets: Record<string, unknown>[] };
    const c = body.companionAssets[0];
    expect(c.selfOwns).toBe("building_only");
    expect(c.standardPricePerSqmAtAcquisition).toBe(1_000_000);
    expect(c.acquisitionArea).toBe(100);
    expect(c.standardPriceAtAcquisition).toBe(160_000_000);

    const res = await resPromise;
    expect(res.status()).toBe(200);
    const json = (await res.json()) as {
      data: { aggregated: { properties: { propertyId: string; transferGain: number; splitDetail?: { selfOwns?: string; building: { gain: number } } | null }[] } };
    };
    const card = json.data.aggregated.properties.find((p) => p.propertyId === c.assetId)!;
    expect(card.splitDetail?.selfOwns).toBe("building_only");
    expect(card.transferGain).toBe(card.splitDetail!.building.gain);
  });
});
