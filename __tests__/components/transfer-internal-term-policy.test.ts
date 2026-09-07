/**
 * anchor: 양도세 UI — 사용자 노출 문구에 내부 영어 용어 금지 (정적 가드).
 *
 * 계기(2026-09-08 · UI 리뷰 대장 재감사): 대장 항목 `internal-term-exposed`가 「종결」로
 * 집계돼 있었으나 `MixedUseAssetMajorStdPrice.tsx`에 3건이 살아 있었다(대장은 `:143` 1건으로
 * 잡았고 줄이 밀리며 「증거 소멸」로 오분류). 이어서 전수 재열거하니 같은 축이 **8개 용어**로
 * 퍼져 있었다 — LTHD·base·legacy·prior·zeroBranch·Scenario·carve-out·override.
 *
 * 🔴 **1차 열거가 과소계수였다.** prop 리터럴만 훑는 스캐너는 **여러 줄에 걸친 JSX 텍스트**를
 *    통째로 놓쳤다(`RedevelopmentResidenceSplitSection:92`). 그래서 이 가드는 형태를 열거하지
 *    않는다 — 주석을 걷어낸 뒤 «한글이 든 모든 문자열·텍스트»를 본다.
 *    [[feedback_enumerate_forms_vs_conservative_superset]]
 *
 * 🔑 **정적 분석**이라 jsdom·렌더가 필요 없다 → pre-push와 CI 전체 테스트 양쪽에서 자동으로
 *    잡힌다(placeholder 정책 가드·법령 커버리지 가드와 같은 층위).
 *
 * ⚠️ 범위는 **양도세 UI 표면**이다(리뷰 대장 파티션과 동일 — `.claude/skills/review-chunk`).
 *    상속·증여 UI에는 같은 축이 훨씬 넓게 남아 있다(legacy·override 30건 이상) — 그쪽을
 *    정리할 때 ROOTS를 넓힌다. 지금 넓히면 상시 빨간불이 되어 게이트 구실을 못 한다.
 *
 * ⚠️ 금지어를 빼거나 예외 목록을 만들어 통과시키지 말 것. 걸리면 **문구를 한국어로 바꾸는
 *    것**이 처방이다. 식별자(`LTHD_EXCLUSION_LABEL`·`areaScenario`)는 애초에 대상이 아니다 —
 *    이 스캐너는 문자열·텍스트만 본다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** 양도세 UI 표면 — 리뷰 대장이 나눈 파티션 그대로. */
const ROOTS = [
  "components/calc/transfer",
  "components/calc/results/transfer",
  "app/calc/transfer-tax",
];

/**
 * 내부 식별자·영어 용어. 한국어 문장에 섞이면 사용자가 화면에서 찾을 수 없는 이름이 된다.
 * (루트 CLAUDE.md 「내부 id 노출 금지」 · `feedback_no_internal_id_in_result`)
 *
 * 정당한 약어·고유명사(PDF·API·KSIC·APT·IMF·NTS·RTMS·Vworld)는 넣지 않는다.
 */
const FORBIDDEN: { term: string; re: RegExp; 정본: string }[] = [
  { term: "override", re: /\boverride\b/i, 정본: "직접 입력" },
  { term: "LTHD", re: /\bLTHD\b/, 정본: "장기보유특별공제" },
  { term: "zeroBranch", re: /\bzeroBranch\b/, 정본: "0 적용·0 처리" },
  { term: "carve-out", re: /\bcarve-out\b/i, 정본: "예외" },
  { term: "legacy", re: /\blegacy\b/i, 정본: "이전 입력 형식" },
  { term: "Scenario", re: /\bScenario\b/, 정본: "시나리오" },
  { term: "base", re: /\bbase\b/i, 정본: "기준액·근거" },
  { term: "prior", re: /\bprior\b/i, 정본: "종전분" },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** 주석 줄을 빈 줄로 바꾼다. 애매하면 「주석 아님」으로 남겨 과소계수를 막는다. */
function stripComments(src: string): string[] {
  const lines = src.split("\n");
  let depth = 0;
  return lines.map((line) => {
    const t = line.trim();
    if (depth > 0) {
      if (line.includes("*/")) { depth = 0; return line.slice(line.indexOf("*/") + 2); }
      return "";
    }
    if (t.startsWith("//")) return "";
    if (t.startsWith("{/*") || t.startsWith("/*")) {
      if (!line.includes("*/")) depth = 1;
      return "";
    }
    const o = line.lastIndexOf("/*"), c = line.lastIndexOf("*/");
    if (o !== -1 && o > c) { depth = 1; return line.slice(0, o); }
    return line.replace(/\s\/\/(?!\/).*$/, "");
  });
}

const HANGUL = /[가-힣]/;

/**
 * 사용자에게 렌더되는 prop. `foo="..."`(JSX)와 `foo: "..."`(객체 — 명세서 빌더가 쓴다) 둘 다.
 *
 * 🔴 **이 채널은 한글을 요구하지 않는다.** 결함의 원형이 `<Row label="LTHD" />`,
 *    즉 **한글이 한 글자도 없는 문자열**이었다 — 한글을 요구하는 스캐너는 그것을 통째로
 *    건너뛴다(뮤테이션 프로브에서 구별력 0으로 드러났다).
 *    [[feedback_mutation_zero_discrimination_is_not_proof]]
 */
const VISIBLE_PROPS =
  "title|label|hint|description|placeholder|aria-label|summary|unit|disabledReason|warning|legal|formula|note|prefix|reason";

/**
 * 사용자에게 «렌더되는» 조각만 남긴다.
 * `${...}`·`{...}`는 값이 찍히는 자리이므로 통째로 걷어낸다 — 그 안의 식별자
 * (`${base.toLocaleString()}`)는 화면에 이름으로 나오지 않는다.
 */
function collectRenderedText(): { file: string; line: number; text: string }[] {
  const out: { file: string; line: number; text: string }[] = [];
  const propRe = new RegExp(`\\b(?:${VISIBLE_PROPS})\\s*[=:]\\s*"([^"]*)"`, "g");

  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const lines = stripComments(readFileSync(file, "utf-8"));
      lines.forEach((line, i) => {
        const push = (raw: string, requireHangul: boolean) => {
          const text = raw.replace(/\$\{[^}]*\}/g, "").replace(/\{[^}]*\}/g, "");
          if (!text.trim()) return;
          if (requireHangul && !HANGUL.test(text)) return;
          out.push({ file, line: i + 1, text });
        };

        // ① 노출 prop의 직접 리터럴 — 한글 불요
        for (const m of line.matchAll(propRe)) push(m[1], false);

        // ② 그 밖의 모든 문자열 리터럴 — 코드 잡음을 걸러내려 한글을 요구한다
        for (const m of line.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) {
          push(m[1] ?? m[2] ?? m[3] ?? "", true);
        }

        // ③ JSX 텍스트 노드
        for (const m of line.matchAll(/>([^<>]*)</g)) push(m[1], true);

        // ④ 여러 줄 JSX 본문 — 태그·표현식·따옴표가 **하나도** 없는 줄만 본문으로 본다.
        //    따옴표가 있으면 ①②가 이미 실제 문구를 잡았고, 줄을 통째로 넣으면
        //    `legacy: "종전 감면율 …"` 같은 **객체 키**가 문구로 오인된다(실제로 걸렸다).
        const t = line.trim();
        if (t && !/[<>{}="'`]/.test(t)) push(t, true);
      });
    }
  }
  return out;
}

describe("양도세 UI — 내부 영어 용어 노출 금지 (정적 가드)", () => {
  const all = collectRenderedText();

  it("스캐너가 실제로 무언가를 본다 (구별력 확보)", () => {
    // 대상이 0건이면 아래 단언은 무엇이든 통과한다 — 그 상태를 먼저 배제한다.
    // [[feedback_mutation_zero_discrimination_is_not_proof]]
    expect(all.length).toBeGreaterThan(1000);
  });

  it("스캐너가 «여러 줄 JSX 텍스트»를 본다 — 1차 열거가 놓쳤던 형태", () => {
    // prop 리터럴만 보는 스캐너는 이 줄을 통째로 놓쳤다. 그 사각지대가 닫혔는지 고정한다.
    const multiline = all.filter(
      (s) =>
        s.file.endsWith("RedevelopmentResidenceSplitSection.tsx") &&
        s.text.includes("청산금납부분") &&
        s.text.includes("장기보유특별공제"),
    );
    expect(multiline.length).toBeGreaterThan(0);
  });

  it("스캐너가 ToneCard title을 본다 — 결함이 있던 그 자리", () => {
    const titles = all
      .filter((s) => s.file.endsWith("mixed-use/MixedUseAssetMajorStdPrice.tsx"))
      .map((s) => s.text);
    expect(titles).toContain("증여일 신고가액 직접 입력 (선택)");
    expect(titles).toContain("상속개시일 신고가액 직접 입력 (선택, 상가 전체)");
    expect(titles).toContain("증여일 신고가액 직접 입력 (선택, 상가 전체)");
  });

  it.each(FORBIDDEN)("🔑 사용자 문구에 `$term`가 없다 (정본: $정본)", ({ re }) => {
    const bad = all.filter((s) => re.test(s.text));
    expect(bad.map((b) => `${b.file}:${b.line}  ${b.text.trim()}`)).toEqual([]);
  });
});
