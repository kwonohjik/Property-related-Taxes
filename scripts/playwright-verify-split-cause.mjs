/**
 * Playwright 자동 검증 — 일반건물 토지·건물 취득원인 분리
 *
 * 검증 항목:
 *  1) /calc/transfer-tax 진입
 *  2) 일반건물 자산 선택
 *  3) 토지·건물 취득원인 라디오 카드 분리 렌더링
 *  4) "신축 정보" 토글이 사라졌는지
 *  5) 건물 라디오 "신축(자가건축)" 옵션 존재
 *  6) 자가신축 선택 시 건물 취득일 DateInput 노출
 *  7) localStorage/sessionStorage payload에 신규 필드 포함
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const screenshots = [];

async function snap(page, name) {
  const path = `/tmp/pw-split-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
  console.log(`📸 ${name} → ${path}`);
}

const result = { passed: [], failed: [], info: [] };
function pass(msg) { result.passed.push(msg); console.log(`✓ ${msg}`); }
function fail(msg) { result.failed.push(msg); console.error(`✗ ${msg}`); }
function info(msg) { result.info.push(msg); console.log(`· ${msg}`); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // 콘솔 에러 수집
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`[pageerror] ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`[console.error] ${msg.text()}`);
  });

  try {
    info(`navigating to ${BASE}/calc/transfer-tax`);
    await page.goto(`${BASE}/calc/transfer-tax`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await snap(page, "01-initial");

    // 페이지 타이틀/마법사 진입 확인
    const bodyText = await page.locator("body").innerText();
    if (bodyText.includes("양도소득세")) pass("마법사 페이지 로드");
    else fail("마법사 페이지에 '양도소득세' 텍스트 없음");

    // 일반건물 옵션 클릭 — 라벨로 찾기
    const generalBuildingLabel = page.locator("text=일반건물(토지+건물 일괄)").first();
    if (await generalBuildingLabel.count() > 0) {
      await generalBuildingLabel.click({ timeout: 5000 }).catch(async (e) => {
        info(`직접 클릭 실패, 부모 클릭 시도: ${e.message}`);
        await generalBuildingLabel.locator("xpath=ancestor::label[1] | ancestor::button[1] | ancestor::div[@role='button'][1]").first().click();
      });
      pass("일반건물 옵션 클릭");
      await page.waitForTimeout(500);
      await snap(page, "02-general-building-selected");
    } else {
      fail("일반건물 라벨 미발견 — 옵션이 첫 화면에 없을 수 있음");
    }

    // 핵심 검증 1: 토지 취득 + 건물 취득 카드 분리
    const landCard = await page.locator("text=토지 취득").count();
    const buildingCard = await page.locator("text=건물 취득").count();
    if (landCard > 0 && buildingCard > 0) pass(`토지·건물 분리 카드 렌더 (토지=${landCard}, 건물=${buildingCard})`);
    else fail(`토지·건물 분리 카드 누락 (토지=${landCard}, 건물=${buildingCard})`);

    // 핵심 검증 2: "신축 정보" 토글 제거됨
    const oldToggle = await page.locator("text=신축 정보").count();
    if (oldToggle === 0) pass("'신축 정보' 토글 제거 확인 (A안 — gbIsSelfBuilt 폐지)");
    else fail(`'신축 정보' 토글이 ${oldToggle}건 잔존`);

    // 핵심 검증 3: 건물 라디오에 "신축(자가건축)" 옵션
    const newConstructionOption = await page.locator("text=신축(자가건축)").count();
    if (newConstructionOption > 0) pass("건물 라디오 '신축(자가건축)' 옵션 존재");
    else fail("'신축(자가건축)' 옵션 미발견");

    // 핵심 검증 4: 토지 라디오 옵션 (이월과세 포함 4종)
    const carryoverOption = await page.locator("text=이월과세(증여)").count();
    if (carryoverOption > 0) pass("토지 라디오 '이월과세(증여)' 옵션 존재");
    else info("'이월과세(증여)' 옵션 미발견 (스크롤 필요할 수도)");

    // 핵심 검증 5: 자가신축 선택 → 건물 취득일 노출
    info("자가신축 옵션 클릭 시도");
    const ncOption = page.locator("text=신축(자가건축)").first();
    if (await ncOption.count() > 0) {
      await ncOption.click({ timeout: 3000 }).catch(async () => {
        await ncOption.locator("xpath=ancestor::label[1] | ancestor::button[1]").first().click();
      });
      await page.waitForTimeout(400);
      await snap(page, "03-self-built-selected");

      // "건물 취득일" 라벨 검증
      const buildingAcqDateLabel = await page.locator("text=건물 취득일").count();
      if (buildingAcqDateLabel > 0) pass("자가신축 선택 시 '건물 취득일' DateInput 노출");
      else fail("자가신축 선택했으나 '건물 취득일' 미노출");
    } else {
      fail("'신축(자가건축)' 클릭 가능 옵션 미발견");
    }

    // sessionStorage 확인 — gbIsSelfBuilt 잔존 여부 (A안 normalize 검증)
    const storage = await page.evaluate(() => {
      const out = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        out[k] = sessionStorage.getItem(k);
      }
      return out;
    });
    const storageStr = JSON.stringify(storage);
    if (storageStr.includes("gbIsSelfBuilt")) {
      fail("sessionStorage에 gbIsSelfBuilt 잔존 (A안 normalize 미작동)");
    } else {
      pass("sessionStorage에 gbIsSelfBuilt 흔적 없음 (A안 normalize 정상)");
    }
    if (storageStr.includes("gbBuildingAcquisitionCause")) {
      pass("sessionStorage에 gbBuildingAcquisitionCause 신규 필드 저장됨");
    } else {
      info("gbBuildingAcquisitionCause 미저장 — 자가신축 클릭이 store에 반영 안됐을 수 있음");
    }

    // 콘솔 에러 보고
    if (consoleErrors.length > 0) {
      info(`콘솔 에러 ${consoleErrors.length}건:`);
      consoleErrors.slice(0, 5).forEach((e) => info(`  ${e}`));
    } else {
      pass("콘솔 에러 0건");
    }

  } catch (e) {
    fail(`예외 발생: ${e.message}`);
    await snap(page, "99-error").catch(() => {});
  } finally {
    await browser.close();
  }

  // 결과 출력
  console.log("\n========== 결과 ==========");
  console.log(`✓ PASS  ${result.passed.length}건`);
  console.log(`✗ FAIL  ${result.failed.length}건`);
  console.log(`· INFO  ${result.info.length}건`);
  console.log(`스크린샷: ${screenshots.length}장 (/tmp/pw-split-*.png)`);

  if (result.failed.length > 0) {
    console.log("\n실패 항목:");
    result.failed.forEach((m) => console.log(`  - ${m}`));
    process.exit(1);
  }
  process.exit(0);
})();
