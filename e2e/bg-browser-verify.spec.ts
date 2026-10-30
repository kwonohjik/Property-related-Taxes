/**
 * E2E — 함께 부담부증여 화면 확인(묶음 C · 계획서 `docs/00-pm/bg-browser-verify.plan.md`): 코드로만 확인했던 화면 동작을 브라우저에서 고정한다.
 *
 *  · BV-1 지분 컴패니언 카드의 채무 안내 — 「이 물건에 설정된 금액 중 이 지분에 대응하는 인수분」 한 문단이 뜬다(종전에는 「인수분」과 「이 물건에 설정된 금액」 두 문단이 따로 떠 갈려 읽혔다 — `bg-single-fractional-and-debt-excess.plan.md` 3).
 *  · BV-2 ⑤ 상속 라디오 — 상속개시일이 1985.1.1. 이후면 환산취득가액이 비활성이고 안내가 뜬다. 상속개시일 칸에 옛 값(1983)이 남아도 토지 파트 취득일로 판정한다(#2742).
 *  · BV-3 담보 승 자산 — ⑤ 가 실지취득가액 입력을 숨기고 「취득시 기준시가 × 채무비율」 안내를 띄운다(묶음 · 단건 동일). 보충 승 묶음은 입력이 보인다.
 *  · BV-4 사이드바(⑥) — 일반건물 부담부증여 함께 양도 묶음은 계산 후 취득가액이 카드 값(150,000,000씩)이다(종전에는 「-」였다 — `bg-sidebar-gb-bundle-and-gate.plan.md` Q-1).
 *  · BV-6 주 자산(첫 자산)에 채무가 없는 묶음 — ⑧ 통과 → 끝까지 계산(종전 ⑫ `transferPrice` 400 · `bg-bundle-primary-zero-debt.plan.md`).
 *  · BV-5 담보 승 묶음(⑧ 균일 승자 과차단 해제 · 같은 계획서 Q-2) — 화면에서 끝까지 계산되고(⑧ 통과) 결과 화면이 응답의 증여가액(합 2,400,000,000)과 같다. 혼합 승자는 막힌다.
 *
 * 실행(워크트리): E2E_PORT=3302 npx playwright test e2e/bg-browser-verify.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWizard } from "./_helpers/split-acq-display";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const gb = (id: number, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(id), addressJibun: `서울 강남구 테스트동 ${id}-${id}`, assetKind: "general_building", acquisitionCause: "purchase", acquisitionDate: "2015-03-01", gbBuildingAcquisitionCause: "purchase",
  gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential", gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "200000000",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "100000000", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000",
  bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "250000000", bgActualAcquisitionBuilding: "250000000", ...over,
});
const MORT = { bgMortgageDebtAmount: "1200000000", bgMortgageSetAmount: "1200000000" };
const seed = (assets: unknown[], companion = true) => ({
  state: { formData: { assets, ...(companion ? { assetSplitMode: "companion" } : {}), transferDate: "2026-03-01", filingDate: "2026-04-30", contractTotalPrice: "", householdHousingCount: "2", isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false }, pendingMigration: false },
  version: 0,
});
/** 접힌 영역까지 포함한 화면 텍스트(`textContent`) — 자산별 펼침은 닫힌 상태에서 `innerText` 에 빠진다. */
const fullText = async (page: Page) => (await page.evaluate(() => document.body.textContent ?? "")).replace(/\s+/g, " ");
async function ready(page: Page, assets: unknown[], companion = true) {
  await seedWizard(page, seed(assets, companion));
  await page.waitForFunction(() => { const el = document.querySelector("input"); return !!el && Object.keys(el).some((k) => k.startsWith("__react")); });
}

test.describe("함께 부담부증여 화면 확인", () => {
  test("BV-1 지분 50% 컴패니언 카드: 합친 안내 한 문단 + 「지분 인수분」 라벨 / 지분 100% 카드는 「이 물건에 설정된 금액」만", async ({ page }) => {
    test.setTimeout(120_000);
    await ready(page, [gb(1), gb(2, { ownershipNumerator: "50", ownershipDenominator: "100" })]);
    await expandAssetSection(page, 2, 0);
    await expandAssetSection(page, 2, 1);
    const t = await fullText(page);
    const merged = "이 물건에 설정된 금액 중 이 지분에 대응하는 인수분을 입력하세요";
    const whole = "이 물건에 설정된 금액을 입력하세요";
    expect(t.split(merged).length - 1).toBe(1); // 지분 카드(자산 2)에만 — 두 규약을 한 문단으로 말한다
    expect(t.split(whole).length - 1).toBe(1); // 자산 1(100%)만 — 지분 카드에는 따로 뜨지 않는다(종전 2건)
    expect(t).not.toContain("공유지분(50%) 부담부증여 — 아래 채무"); // 옛 축 A 단독 문단
    expect(t).toContain("담보차입금 (지분 인수분)");
    expect(t).toContain("담보차입금 (실제 채무잔액)"); // 자산 1(100%)
  });

  test("BV-2 ⑤ 상속 라디오: 상속 2005 · 옛 상속개시일 칸(1983)이 남아도 환산취득가액 비활성 / 매매는 활성 / 1983 상속은 라디오 그룹 없음", async ({ page }) => {
    test.setTimeout(180_000);
    const INH = { acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", hasSeperateLandAcquisitionDate: false };
    const cases: [string, Record<string, unknown>, "활성" | "비활성" | "없음"][] = [
      ["매매", {}, "활성"],
      ["상속 2005", { ...INH, acquisitionDate: "2005-03-10", inheritanceStartDate: "2005-03-10" }, "비활성"],
      ["상속 2005 · 상속개시일 칸 옛 값 1983", { ...INH, acquisitionDate: "2005-03-10", inheritanceStartDate: "1983-01-01" }, "비활성"],
      ["상속 1983", { ...INH, acquisitionDate: "1983-01-01", inheritanceStartDate: "1983-01-01" }, "없음"],
    ];
    for (const [name, over, expected] of cases) {
      await ready(page, [gb(1, { bgAcquisitionMethod: "converted", ...over })], false);
      await expandAssetSection(page, 2, 0);
      const radio = page.getByRole("radio", { name: /환산취득가액/ });
      if (expected === "없음") await expect(radio, name).toHaveCount(0);
      else {
        await expect(radio, name).toHaveCount(1);
        if (expected === "비활성") await expect(radio, name).toBeDisabled();
        else await expect(radio, name).toBeEnabled();
      }
      const t = await fullText(page);
      expect(t.includes("상속받은 자산은 상속개시일 현재 상증법 평가액이 취득가액이라 쓸 수 없습니다"), name).toBe(expected === "비활성");
    }
  });

  test("BV-3 담보 승 자산(묶음 · 단건): ⑤ 가 실지취득가액 입력을 숨기고 「취득시 기준시가 × 채무비율」 안내 / 보충 승 묶음은 입력이 보인다", async ({ page }) => {
    test.setTimeout(180_000);
    const NOTICE = "담보평가액 1,200,000,000원이 시가 1,000,000,000원보다 커서 증여가액이 담보평가액입니다";
    for (const [name, assets, companion, forced] of [
      ["담보 승 묶음", [gb(1, MORT), gb(2, MORT)], true, true],
      ["담보 승 단건", [gb(1, MORT)], false, true],
      ["보충 승 묶음", [gb(1), gb(2)], true, false],
    ] as const) {
      await ready(page, assets as unknown as unknown[], companion);
      await expandAssetSection(page, 2, 0);
      const t = await fullText(page);
      expect(t.includes(NOTICE), name).toBe(forced);
      expect(t.includes("취득가액은 위 산정방식과 관계없이 취득시 기준시가 × 채무비율로 산정하고"), name).toBe(forced);
      expect(t.includes("실지취득가액 입력"), name).toBe(!forced);
    }
  });

  test("BV-4 사이드바(⑥): 일반건물 부담부증여 묶음은 계산 후 취득가액이 카드 값(150,000,000씩)이고 「-」가 아니다", async ({ page }) => {
    test.setTimeout(180_000);
    await ready(page, [gb(1), gb(2)]);
    const respP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    const j = await (await respP).json();
    await page.getByText("합산 과세 내역").first().waitFor({ timeout: 30_000 });
    const cards = j.data.transferBurdenedGiftBreakdown.cards as { breakdown: { perAsset: { land: { acquisitionPrice: number }; building: { acquisitionPrice: number } } } }[];
    expect(cards.map((c) => c.breakdown.perAsset.land.acquisitionPrice + c.breakdown.perAsset.building.acquisitionPrice)).toEqual([150_000_000, 150_000_000]);
    // 입력 단계로 돌아와 사이드바를 읽는다(결과 단계에는 사이드바가 없다).
    for (let k = 0; k < 6 && !(await page.locator("body").innerText()).includes("합계 양도가액"); k++) {
      await page.getByRole("button", { name: /이전/ }).first().click();
      await page.waitForTimeout(400);
    }
    const t = await page.locator("body").innerText();
    const aside = t.slice(t.indexOf("자산 1 — 일반건물"), t.indexOf("합계 양도가액"));
    expect(aside).toContain("300,000,000"); // 양도가액
    expect((aside.match(/취득가액\n\n150,000,000/g) ?? []).length).toBe(2); // 종전 「-」
    expect((aside.match(/취득가액\n\n-/g) ?? []).length).toBe(0);
  });

  test("BV-5 담보 승 묶음: ⑧ 통과 → 끝까지 계산(증여가액 합 = 2,400,000,000) / 혼합 승자는 계산 단계로 못 간다", async ({ page }) => {
    test.setTimeout(240_000);
    await ready(page, [gb(1, MORT), gb(2, MORT)]);
    const respP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    const resp = await respP;
    expect(resp.status()).toBe(200);
    const j = await resp.json();
    expect(j.data.aggregated.burdenedGift.giftValuation.max).toBe(2_400_000_000);
    await page.getByText("합산 과세 내역").first().waitFor({ timeout: 30_000 });

    // 혼합 승자(담보 + 보충) — ⑧이 막아 요청이 나가지 않고 안내가 뜬다.
    await ready(page, [gb(1, MORT), gb(2)]);
    let posted = false;
    page.on("request", (r) => { if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true; });
    await page.getByRole("button", { name: "가산세", exact: true }).first().click().catch(() => undefined);
    await page.getByRole("button", { name: "세금 계산하기" }).click().catch(() => undefined);
    await page.waitForTimeout(1500);
    expect(posted).toBe(false);
    expect(await fullText(page)).toContain("자산 1 담보평가(상증법 §66) · 자산 2 보충적평가: 증여재산 평가 방식이 달라 함께 양도와 같이 계산할 수 없습니다");
  });

  test("BV-6 주 자산(첫 자산)에 채무가 없는 묶음: ⑧ 통과 → 끝까지 계산되고 채무 위치만 다른 거울 쌍과 양도차익이 같다", async ({ page }) => {
    test.setTimeout(240_000);
    const NODEBT = { bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0" };
    const gainOf = async (assets: unknown[]) => {
      await ready(page, assets);
      const respP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
      await page.getByRole("button", { name: "가산세", exact: true }).first().click();
      await page.getByRole("button", { name: "세금 계산하기" }).click();
      const resp = await respP;
      expect(resp.status()).toBe(200);
      const j = await resp.json();
      await page.getByText("합산 과세 내역").first().waitFor({ timeout: 30_000 });
      return j.data.aggregated.totalTransferGain as number;
    };
    const zeroFirst = await gainOf([gb(1, NODEBT), gb(2)]); // 종전 400 `transferPrice: Too small`
    const mirror = await gainOf([gb(1), gb(2, NODEBT)]);
    expect(zeroFirst).toBe(mirror);
    expect(zeroFirst).toBeGreaterThan(0);
  });
});
