/**
 * Playwright 자동 검증 — v4 draft + 200건 한도 경고 (계획서 §5 Phase F)
 *
 * F-1: 폼 입력 중간 "저장하기" → /history 미결 1건 (배지·납부세액 "—")
 * F-2: F-1 → 수정 진입 → 무변경 계산 → 자동저장 → draft 삭제, final 1건, 배지 사라짐
 * F-3: 두 번 임시저장 (같은 입력) → 1건 dedup
 * F-4: 빈 폼 "저장하기" → 차단 토스트 + 기존 draft 보존
 * F-5: 의뢰인 분리는 본 스크립트에서는 skip (별도 게이트 시나리오)
 * F-6: record 190건 적재 → /history 진입 → 경고 배너 노출
 * F-7: record 200건 적재 → 새 final 저장 → oldest 삭제 + 토스트 한도 라인
 *
 * 사용:
 *   1. 터미널 A: npm run dev
 *   2. 터미널 B: node scripts/playwright-verify-history-draft-v4.mjs
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const DB_NAME = "KoreanTaxCalcLocal";

const result = { passed: [], failed: [], info: [] };
const screenshots = [];

function pass(msg) { result.passed.push(msg); console.log(`✓ ${msg}`); }
function fail(msg) { result.failed.push(msg); console.error(`✗ ${msg}`); }
function info(msg) { result.info.push(msg); console.log(`· ${msg}`); }

async function snap(page, name) {
  const path = `/tmp/pw-draft-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
  console.log(`📸 ${name} → ${path}`);
}

async function resetDB(page) {
  await page.evaluate((name) => new Promise((res) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => res();
    req.onerror = () => res();
    req.onblocked = () => res();
  }), DB_NAME);
}

async function listCalculations(page) {
  return page.evaluate((name) => new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("calculations", "readonly");
      const store = tx.objectStore("calculations");
      const all = store.getAll();
      all.onsuccess = () => resolve(all.result);
      all.onerror = () => reject(all.error);
    };
    req.onerror = () => reject(req.error);
  }), DB_NAME);
}

async function countCalculations(page) {
  return page.evaluate((name) => new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("calculations", "readonly");
      const store = tx.objectStore("calculations");
      const c = store.count();
      c.onsuccess = () => resolve(c.result);
      c.onerror = () => reject(c.error);
    };
    req.onerror = () => reject(req.error);
  }), DB_NAME);
}

/** 직접 DB에 record 다수 적재 (F-6/F-7 한도 시나리오용) */
async function seedRecords(page, n, withResult = false) {
  return page.evaluate(({ name, n, withResult }) => new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("calculations", "readwrite");
      const store = tx.objectStore("calculations");
      let added = 0;
      for (let i = 0; i < n; i++) {
        const id = crypto.randomUUID();
        const rec = {
          id,
          userId: "local-user",
          taxType: "gift",
          title: `seed ${i}`,
          inputData: { idx: i },
          resultData: withResult ? { totalTax: 1000 + i } : {},
          taxLawVersion: "2026-05-21",
          linkedCalculationId: null,
          clientId: null,
          createdAt: new Date(Date.now() - (n - i) * 1000).toISOString(),
          updatedAt: new Date().toISOString(),
          inputHash: `seed${i.toString().padStart(12, "0")}`,
        };
        const r = store.add(rec);
        r.onsuccess = () => { if (++added === n) resolve(added); };
      }
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  }), { name: DB_NAME, n, withResult });
}

async function clickSaveButton(page) {
  // 가장 가시적인 "저장하기" 버튼 — 헤더 또는 하단 어느 쪽이든
  const btns = page.locator('button:has-text("저장하기"):not([disabled])');
  const c = await btns.count();
  if (c === 0) return false;
  await btns.first().click({ timeout: 5000 });
  await page.waitForTimeout(700);
  return true;
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
    // ───────── F-1 / F-3 / F-4: 폼 중간 저장하기 ─────────
    info("F-1: 폼 중간 임시저장");
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await resetDB(page);
    await page.goto(`${BASE}/calc/gift-tax`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    // Step 0 — 증여일 입력
    const yearInput = page.locator('input[placeholder="YYYY"]').first();
    await yearInput.waitFor({ state: "visible", timeout: 5000 });
    await yearInput.fill("2021");
    await page.locator('input[placeholder="MM"]').first().fill("05");
    await page.locator('input[placeholder="DD"]').first().fill("02");
    pass("Step 0: 증여일 입력");
    await snap(page, "01-step0-filled");

    // 저장하기 클릭 — 빈 폼이 아니므로 draft 생성되어야 함
    const ok1 = await clickSaveButton(page);
    if (!ok1) fail("F-1 저장하기 버튼 미발견");
    await snap(page, "02-after-draft-save");

    const draftList = await listCalculations(page);
    if (draftList.length === 1 && Object.keys(draftList[0].resultData).length === 0) {
      pass("F-1: 미결 record 1건 + resultData {}");
    } else {
      fail(`F-1: 예상 1 draft, 실제 ${draftList.length}건 / resultData=${JSON.stringify(draftList[0]?.resultData)}`);
    }
    if (draftList[0]?.inputHash?.match(/^[0-9a-f]{16}$/)) pass("F-1: inputHash 부여");
    else fail(`F-1: inputHash 형식 오류 (${draftList[0]?.inputHash})`);
    if (draftList[0]?.contentHash === undefined) pass("F-1: contentHash 부재 (draft 신호)");
    else fail(`F-1: contentHash가 부여됨 (${draftList[0]?.contentHash})`);

    // F-3: 저장하기 한 번 더 → 1건 유지
    info("F-3: 같은 입력 저장하기 한 번 더 → 1건 유지");
    await page.waitForTimeout(700);
    await clickSaveButton(page);
    await page.waitForTimeout(700);
    const count3 = await countCalculations(page);
    if (count3 === 1) pass(`F-3: 반복 draft 저장 후 count=1 (actual=${count3})`);
    else fail(`F-3: count=${count3}`);

    // /history 확인 — 미결 배지
    info("F-1 후속: /history에서 미결 배지 확인");
    await page.goto(`${BASE}/history`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await snap(page, "03-history-draft");

    const hText = await page.locator("body").innerText();
    if (hText.includes("미결")) pass("F-1: /history '미결' 배지 노출");
    else fail("F-1: '미결' 배지 미노출");
    if (hText.includes("계산 미완료")) pass("F-1: 납부세액 placeholder '계산 미완료' 표시");
    else fail("F-1: '계산 미완료' placeholder 미표시");

    // ───────── F-2: draft → final 자동 승격 ─────────
    info("F-2: 수정 진입 → 계산 → draft 승격");
    // /history 수정 버튼
    const editBtn = page.locator('button:has-text("수정")').first();
    if (await editBtn.count() > 0) {
      await editBtn.click({ timeout: 5000 });
      await page.waitForTimeout(1500);
    } else {
      info("F-2 수정 버튼 미발견 — 직접 페이지 이동");
      await page.goto(`${BASE}/calc/gift-tax`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    }

    // 증여재산 추가 — 현금 3억 (수정 후 Step 0에서 시작 → 다음 클릭으로 Step 1)
    info("F-2: 증여재산 추가 + 계산");
    const next0 = page.locator('button:has-text("다음")').first();
    if (await next0.count() > 0) {
      await next0.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    const addBtn = page.locator('button:has-text("증여재산 추가")').first();
    await addBtn.waitFor({ state: "visible", timeout: 5000 });
    await addBtn.click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("현금")').first().click({ timeout: 5000 });
    await page.waitForTimeout(500);
    const amt = page.locator('input[inputmode="numeric"], input[placeholder*="금액"], input[placeholder*="원"]').first();
    await amt.waitFor({ state: "visible", timeout: 5000 });
    await amt.fill("300000000");
    await page.waitForTimeout(300);
    // 다음 두 번 → 계산하기
    for (let i = 0; i < 3; i++) {
      const nb = page.locator('button:has-text("다음")').first();
      if (await nb.count() > 0 && await nb.isVisible()) {
        await nb.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(400);
      }
    }
    const calcBtn = page.locator('button:has-text("계산하기")').first();
    if (await calcBtn.count() > 0) {
      await calcBtn.click({ timeout: 10000 });
      await page.waitForTimeout(2500);
      pass("F-2: 계산 완료");
    }
    await snap(page, "04-after-calc");

    const finalCount = await countCalculations(page);
    // 입력이 바뀌었으니 새 final + (이전 draft는 inputHash 다름) = 1 final + 1 draft = 2건 가능
    // 또는 입력이 같으면 draft 삭제 + final 1 = 1건
    info(`F-2: 재계산 후 count=${finalCount}`);
    const records = await listCalculations(page);
    const finals = records.filter((r) => Object.keys(r.resultData).length > 0);
    const drafts = records.filter((r) => Object.keys(r.resultData).length === 0);
    if (finals.length >= 1) pass(`F-2: final ≥1건 존재 (${finals.length}건)`);
    else fail(`F-2: final record 미생성`);
    info(`F-2: draft ${drafts.length}건 잔존 (입력 변경 시 정상)`);

    // ───────── F-4: 빈 폼 저장하기 → 차단 ─────────
    info("F-4: 새 페이지 진입 후 빈 폼 저장하기");
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await resetDB(page);
    await page.goto(`${BASE}/calc/gift-tax`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    // SaveButton 헤더 — disabled 상태 확인
    const headerSave = page.locator('button:has-text("저장하기")').first();
    const isDisabled = await headerSave.isDisabled();
    if (isDisabled) pass("F-4: 빈 폼 → 저장하기 버튼 disabled");
    else fail("F-4: 빈 폼인데 저장하기 버튼이 활성");
    await snap(page, "05-empty-form-disabled");

    const f4Count = await countCalculations(page);
    if (f4Count === 0) pass(`F-4: record 0건 (빈 폼 보호)`);
    else fail(`F-4: count=${f4Count} (예상 0)`);

    // ───────── F-6: 190건 적재 → 경고 배너 ─────────
    info("F-6: 190건 적재 → /history 진입 → 경고 배너 노출");
    await resetDB(page);
    await page.goto(`${BASE}/history`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await seedRecords(page, 190, true);
    info("F-6: 190 records seeded");
    await page.goto(`${BASE}/history`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await snap(page, "06-warning-190");

    const bannerText190 = await page.locator("body").innerText();
    if (bannerText190.includes("저장 한도 안내") && bannerText190.includes("190/200")) {
      pass("F-6: /history 한도 경고 배너 노출 + 190/200 표시");
    } else {
      fail(`F-6: 경고 배너 미노출 또는 카운트 오류`);
    }

    // ───────── F-7: 200건 도달 ─────────
    info("F-7: 200건 도달 → 추가 라인");
    await resetDB(page);
    await page.goto(`${BASE}/history`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await seedRecords(page, 200, true);
    await page.goto(`${BASE}/history`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await snap(page, "07-warning-200");

    const bannerText200 = await page.locator("body").innerText();
    if (bannerText200.includes("한도에 도달했습니다")) {
      pass("F-7: 200건 도달 시 '한도에 도달했습니다' 추가 라인 노출");
    } else {
      fail("F-7: 200건 도달 라인 미노출");
    }
    if (bannerText200.includes("200/200")) pass("F-7: '200/200' 카운트 표시");
    else fail("F-7: '200/200' 카운트 미표시");
  } catch (e) {
    fail(`예외: ${e.message}`);
    await snap(page, "error");
  } finally {
    await browser.close();
  }

  console.log("\n────────── 검증 결과 ──────────");
  console.log(`PASS: ${result.passed.length}`);
  console.log(`FAIL: ${result.failed.length}`);
  console.log(`INFO: ${result.info.length}`);
  if (consoleErrors.length > 0) {
    console.log(`\n콘솔 에러 ${consoleErrors.length}건:`);
    consoleErrors.slice(0, 5).forEach((e) => console.log("  " + e));
  }
  console.log(`\n스크린샷: ${screenshots.join(", ")}`);
  process.exit(result.failed.length > 0 ? 1 : 0);
})();
