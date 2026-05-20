import { chromium } from "playwright";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

await page.goto("http://localhost:3000/calc/gift-tax", { waitUntil: "networkidle" });

// CSS 규칙이 로드됐는지 확인
const cssCheck = await page.evaluate(() => {
  const results = { found: false, height: null, overflow: null, error: null };
  try {
    // 동적으로 div 생성하여 클래스 적용 후 computed style 확인
    const el = document.createElement("div");
    el.className = "horizontal-scroll-visible";
    el.style.width = "100px";
    el.innerHTML = '<div style="width: 500px; height: 20px;">x</div>';
    document.body.appendChild(el);
    const cs = window.getComputedStyle(el);
    results.overflow = cs.overflowX;
    // ::-webkit-scrollbar는 pseudo-element라 getComputedStyle로 접근 가능
    const sb = window.getComputedStyle(el, "::-webkit-scrollbar");
    results.height = sb.height;
    // 스크롤바 발생 조건: scrollWidth > clientWidth
    results.scrollWidth = el.scrollWidth;
    results.clientWidth = el.clientWidth;
    results.offsetHeight = el.offsetHeight;
    document.body.removeChild(el);
    results.found = cs.overflowX === "scroll";
  } catch (e) {
    results.error = String(e);
  }
  return results;
});

console.log("CSS check:", JSON.stringify(cssCheck, null, 2));

// 페이지 내 어디서든 .horizontal-scroll-visible 클래스 적용된 요소 찾기 (현재 미렌더 — 결과 화면에만 존재)
const hasClass = await page.evaluate(() => {
  return !!document.querySelector(".horizontal-scroll-visible");
});
console.log(".horizontal-scroll-visible element present:", hasClass);

// 글로벌 stylesheet에서 규칙 검색
const ruleFound = await page.evaluate(() => {
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.cssText && rule.cssText.includes("horizontal-scroll-visible")) {
          return rule.cssText;
        }
      }
    } catch {}
  }
  return null;
});
console.log("CSS rule found in sheets:", ruleFound ? ruleFound.substring(0, 200) : "NOT FOUND");

await browser.close();
