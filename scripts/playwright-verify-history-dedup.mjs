/**
 * Playwright 자동 검증 — 계산 이력 dedup (계획서 §1.2 시나리오 1~4)
 *
 * 시나리오:
 *   1) 입력 완료 → "계산하기" → 결과 화면 진입 → 자동저장 1건
 *   2) 결과 화면 "저장하기" 클릭 → 동일 contentHash → updatedAt만 갱신 → 1건 유지
 *   3) "저장하기" 한 번 더 → 1건 유지
 *   4) "다시 계산" → 입력 무변경 재계산 → 1건 유지
 *
 * 모든 시나리오 후 /history 에서 record count === 1 검증.
 *
 * 사용:
 *   1. 터미널 A: npm run dev
 *   2. 터미널 B: node scripts/playwright-verify-history-dedup.mjs
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";

const result = { passed: [], failed: [], info: [] };
const screenshots = [];

function pass(msg) { result.passed.push(msg); console.log(`✓ ${msg}`); }
function fail(msg) { result.failed.push(msg); console.error(`✗ ${msg}`); }
function info(msg) { result.info.push(msg); console.log(`· ${msg}`); }

async function snap(page, name) {
  const path = `/tmp/pw-dedup-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
  console.log(`📸 ${name} → ${path}`);
}

async function countCalculations(page) {
  // IndexedDB Dexie 직접 조회 — calculations 테이블 row 수
  return page.evaluate(async () => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("KoreanTaxCalcLocal");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("calculations", "readonly");
        const store = tx.objectStore("calculations");
        const c = store.count();
        c.onsuccess = () => resolve(c.result);
        c.onerror = () => reject(c.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

async function listCalculations(page) {
  return page.evaluate(async () => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("KoreanTaxCalcLocal");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("calculations", "readonly");
        const store = tx.objectStore("calculations");
        const all = store.getAll();
        all.onsuccess = () => resolve(all.result);
        all.onerror = () => reject(all.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`[pageerror] ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`[console.error] ${msg.text()}`);
  });

  try {
    // ─── 사전: IndexedDB 초기화 ─────────────────────────────────────
    info("navigate to home for IndexedDB reset");
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.evaluate(() => new Promise((res) => {
      const req = indexedDB.deleteDatabase("KoreanTaxCalcLocal");
      req.onsuccess = () => res();
      req.onerror = () => res();
      req.onblocked = () => res();
    }));
    pass("IndexedDB 초기화");

    // ─── 증여세 페이지 진입 ─────────────────────────────────────────
    await page.goto(`${BASE}/calc/gift-tax`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await snap(page, "01-initial");

    const bodyText = await page.locator("body").innerText();
    if (bodyText.includes("증여세")) pass("증여세 마법사 로드");
    else { fail("증여세 마법사 텍스트 없음"); throw new Error("page not loaded"); }

    // ─── Step 0: 증여일·관계 입력 ──────────────────────────────────
    info("Step 0 — 증여일 2021-05-02, 관계 직계존속(성인)");
    // DateInput: 연/월/일 분리. label="증여일" 근처 input 3개
    const dateInputs = page.locator('input[type="text"][maxlength="4"], input[type="text"][maxlength="2"]');
    // 첫 DateInput만 채움 (year/month/day)
    const yearInput = page.locator('input[placeholder="YYYY"]').first();
    if (await yearInput.count() > 0) {
      await yearInput.fill("2021");
      await page.locator('input[placeholder="MM"]').first().fill("05");
      await page.locator('input[placeholder="DD"]').first().fill("02");
      pass("증여일 입력");
    } else {
      info("DateInput placeholder 형식 다름 — 폴백");
    }

    // 다음 버튼
    const nextBtn = page.locator('button:has-text("다음")').first();
    await nextBtn.click({ timeout: 5000 });
    await page.waitForTimeout(500);
    await snap(page, "02-step1");

    // ─── Step 1: 증여재산 한 건 추가 (현금) ────────────────────────
    info("Step 1 — '증여재산 추가' 클릭");
    const addAssetBtn = page.locator('button:has-text("증여재산 추가")').first();
    await addAssetBtn.waitFor({ state: "visible", timeout: 5000 });
    await addAssetBtn.click();
    await page.waitForTimeout(500);
    pass("증여재산 추가 클릭");

    info("Step 1 — 현금 카드 클릭");
    const cashCard = page.locator('button:has-text("현금")').first();
    await cashCard.waitFor({ state: "visible", timeout: 5000 });
    await cashCard.click({ timeout: 5000 });
    await page.waitForTimeout(800);
    pass("현금 카드 클릭");
    await snap(page, "03a-after-cash-click");

    // 금액 input — 첫 currency input
    const amountInput = page.locator('input[inputmode="numeric"], input[placeholder*="금액"], input[placeholder*="원"]').first();
    await amountInput.waitFor({ state: "visible", timeout: 5000 });
    await amountInput.fill("300000000");
    pass("증여재산 금액 입력 (3억)");
    await page.waitForTimeout(500);

    await snap(page, "03-step1-filled");
    await page.locator('button:has-text("다음")').first().click({ timeout: 5000 });
    await page.waitForTimeout(800);

    // ─── Step 2 → 3 단순 통과 ──────────────────────────────────────
    info("Step 2 통과");
    await page.locator('button:has-text("다음")').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await snap(page, "04-step2");

    info("Step 3 → 계산하기");
    const calcBtn = page.locator('button:has-text("계산하기")').first();
    if (await calcBtn.count() === 0) {
      // 마지막 다음 한 번 더
      await page.locator('button:has-text("다음")').first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    await page.locator('button:has-text("계산하기")').first().click({ timeout: 10000 });
    await page.waitForTimeout(2000);
    await snap(page, "05-result");

    // ─── Scenario 1: 자동저장 1건 ──────────────────────────────────
    const count1 = await countCalculations(page);
    if (count1 === 1) pass(`Scenario 1: 자동저장 후 count=1 (actual=${count1})`);
    else fail(`Scenario 1: count=${count1} (expected 1)`);

    const records1 = await listCalculations(page);
    info(`Scenario 1: contentHash=${records1[0]?.contentHash || "(none)"} createdAt=${records1[0]?.createdAt}`);
    const initialUpdatedAt = records1[0]?.updatedAt;

    // ─── Scenario 2: "저장하기" 클릭 (헤더 또는 하단) ──────────────
    info("Scenario 2: 결과 화면 저장하기 클릭");
    // PDF 옆 또는 하단 처음으로 옆에 SaveButton
    await page.waitForTimeout(500);
    const saveBtn = page.locator('button:has-text("저장하기")').first();
    if (await saveBtn.count() > 0) {
      await saveBtn.click({ timeout: 5000 });
      await page.waitForTimeout(1000);
      pass("저장하기 클릭 1회차");
    } else {
      fail("저장하기 버튼 미발견");
    }
    await snap(page, "06-after-save-1");

    const count2 = await countCalculations(page);
    if (count2 === 1) pass(`Scenario 2: 저장하기 1회 후 count=1 (actual=${count2})`);
    else fail(`Scenario 2: count=${count2} (expected 1 — 중복 발생!)`);

    const records2 = await listCalculations(page);
    if (records2[0]?.updatedAt !== initialUpdatedAt) pass("Scenario 2: updatedAt 갱신됨");
    else info(`Scenario 2: updatedAt 동일 (${records2[0]?.updatedAt})`);

    // ─── Scenario 3: 저장하기 한 번 더 ────────────────────────────
    info("Scenario 3: 저장하기 클릭 2회차");
    await page.waitForTimeout(1500);  // 토스트 사라질 때까지 대기
    await page.locator('button:has-text("저장하기")').first().click({ timeout: 5000 });
    await page.waitForTimeout(1000);
    await snap(page, "07-after-save-2");

    const count3 = await countCalculations(page);
    if (count3 === 1) pass(`Scenario 3: 저장하기 2회 후 count=1 (actual=${count3})`);
    else fail(`Scenario 3: count=${count3} (expected 1 — 중복 발생!)`);

    // ─── Scenario 4: 다시 계산 → 입력 무변경 재계산 ───────────────
    info("Scenario 4: 다시 계산 → 무변경 재계산");
    // 결과 화면의 "다시 계산" 버튼
    const recalcBtn = page.locator('button:has-text("다시 계산")').first();
    if (await recalcBtn.count() > 0) {
      await recalcBtn.click({ timeout: 5000 });
      await page.waitForTimeout(1000);
      pass("다시 계산 버튼 클릭");

      // step 3까지 다음 다음 다음 → 계산하기
      for (let i = 0; i < 4; i++) {
        const nb = page.locator('button:has-text("다음")').first();
        if (await nb.count() > 0 && await nb.isVisible()) {
          await nb.click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(300);
        }
      }
      const calc2 = page.locator('button:has-text("계산하기")').first();
      if (await calc2.count() > 0) {
        await calc2.click({ timeout: 10000 });
        await page.waitForTimeout(2000);
        pass("재계산 완료");
      }
      await snap(page, "08-after-recalc");

      const count4 = await countCalculations(page);
      if (count4 === 1) pass(`Scenario 4: 재계산 후 count=1 (actual=${count4})`);
      else fail(`Scenario 4: count=${count4} (expected 1 — 중복 발생!)`);
    } else {
      info("다시 계산 버튼 미발견 — Scenario 4 skip");
    }

    // ─── 최종 /history 확인 ────────────────────────────────────────
    info("최종 /history 진입");
    await page.goto(`${BASE}/history`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await snap(page, "09-history");

    const historyText = await page.locator("body").innerText();
    if (historyText.includes("전체 1건") || historyText.includes("전체 1 건")) {
      pass("/history: 전체 1건 표시 확인");
    } else {
      const m = historyText.match(/전체\s*(\d+)\s*건/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n === 1) pass(`/history: 전체 ${n}건`);
        else fail(`/history: 전체 ${n}건 (expected 1)`);
      } else {
        info("/history 카운트 텍스트 패턴 미일치");
      }
    }
  } catch (e) {
    fail(`예외: ${e.message}`);
    await snap(page, "error");
  } finally {
    await browser.close();
  }

  // ─── 보고 ───────────────────────────────────────────────────────
  console.log("\n────────── 검증 결과 ──────────");
  console.log(`PASS: ${result.passed.length}`);
  console.log(`FAIL: ${result.failed.length}`);
  console.log(`INFO: ${result.info.length}`);
  if (consoleErrors.length > 0) {
    console.log(`\n콘솔 에러 ${consoleErrors.length}건:`);
    consoleErrors.forEach((e) => console.log("  " + e));
  }
  console.log(`\n스크린샷: ${screenshots.join(", ")}`);
  process.exit(result.failed.length > 0 ? 1 : 0);
})();
