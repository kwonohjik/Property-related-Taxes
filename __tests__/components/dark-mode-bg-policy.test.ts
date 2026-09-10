/**
 * 정적 가드 — **라이트모드 배경 `bg-white`에는 다크 짝이 있어야 한다**.
 *
 * 앱은 사용자가 켤 수 있는 다크 테마를 제공한다(`app/layout.tsx`의 `<ThemeToggle />` ·
 * `app/globals.css`의 `.dark`). `bg-white`는 테마 변수가 아니라 **고정색**이라, 짝이 없으면
 * 다크모드에서 흰 카드 안에 검은 자식이 박힌다(UI 리뷰 대장 R19).
 *
 * ## 규칙
 *
 * 같은 줄(=같은 className)에 `bg-white`·`bg-white/N`이 **variant 없이** 있으면
 * `dark:bg-*`가 함께 있어야 한다. 저장소 최다 패턴을 그대로 쓴다:
 *
 * | 형태 | 짝 |
 * |---|---|
 * | 반투명 `bg-white/N` | `dark:bg-white/5` |
 * | 불투명 `bg-white` | `dark:bg-gray-900` |
 *
 * ## ⛔ 대상이 아닌 것 — 셋 다 «의도된» 상태다
 *
 * 1. **`print:bg-white`·`hover:bg-white` 등 variant** — 라이트모드 배경이 아니다.
 * 2. **하드코딩 전경색이 함께 있는 줄**(`text-black`·`text-slate-900` 등, `dark:text-` 없음)
 *    — 별지서식 재현 페이지와 PDF 버튼이다. **배경만 어둡게 하면 다크 배경 + 다크 글자**가
 *    되어 오히려 못 읽는다. 전경까지 함께 설계해야 하므로 이 가드가 강제하지 않는다.
 *    (공식 서식 replica는 `components/calc/CLAUDE.md`가 「원본 재현 — 변경 금지」로 못박았다.)
 * 3. **`noDark` ToneCard를 쓰는 파일** — `40b71f46`이 「dark 미대응 레거시 **회귀 0**」으로
 *    남긴 서브트리다. 라이트 카드 위에 다크 자식을 얹으면 다크모드에서 **오히려 퇴보**한다.
 *    그 카드들이 dark 대응될 때 함께 푼다.
 *
 * ## 래칫
 *
 * 남은 예외 수를 상한으로 고정한다 — **줄이기만 한다**. 새로 늘리면 실패한다.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "lib"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) {
      if (name !== "node_modules") walk(rel, out);
    } else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

/** variant(`print:`·`hover:`·`dark:`)가 붙지 않은 «라이트모드 배경» bg-white 토큰. */
function bareBgWhite(line: string): RegExpMatchArray[] {
  return [...line.matchAll(/(^|[\s"'`])bg-white(\/\d+)?(?=[\s"'`]|$)/g)];
}

/** 전경색이 하드코딩된 어두운 색인데 dark: 짝이 없다 — 배경만 뒤집으면 못 읽는다. */
function hasUnpairedDarkForeground(line: string): boolean {
  return (
    /text-(black|slate|gray|neutral|zinc|stone)/.test(line) && !/dark:text-/.test(line)
  );
}

interface Site {
  file: string;
  line: number;
  text: string;
  reason: "foreground" | "noDark";
}

const violations: Site[] = [];
const exempt: Site[] = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const raw = readFileSync(join(ROOT, file), "utf8");
    const fileHasNoDark = /noDark/.test(raw);
    raw.split("\n").forEach((line, i) => {
      if (bareBgWhite(line).length === 0) return;
      if (/dark:bg-/.test(line)) return; // 짝 있음 — 정상
      const site = { file, line: i + 1, text: line.trim().slice(0, 120) };
      if (hasUnpairedDarkForeground(line)) exempt.push({ ...site, reason: "foreground" });
      else if (fileHasNoDark) exempt.push({ ...site, reason: "noDark" });
      else violations.push({ ...site, reason: "foreground" });
    });
  }
}

/**
 * 🔒 래칫 — 2026-09-08 실측. **줄이기만 한다.**
 *   foreground 15 · noDark 25
 * 늘리려면 그 예외가 왜 필요한지 이 파일에 근거를 먼저 적을 것.
 */
const EXEMPT_MAX = 40;

describe("다크모드 배경 정책 — bg-white에는 dark: 짝이 있다", () => {
  it("🔴 짝 없는 bg-white가 0건이다", () => {
    const msg = violations
      .map((v) => `  ${v.file}:${v.line}\n    ${v.text}`)
      .join("\n");
    expect(violations, `짝 없는 bg-white ${violations.length}건:\n${msg}`).toHaveLength(0);
  });

  it(`🔒 예외 래칫 — ${EXEMPT_MAX}건 이하 (줄이기만 한다)`, () => {
    expect(exempt.length).toBeLessThanOrEqual(EXEMPT_MAX);
  });

  it("예외는 둘 중 하나의 이유만 갖는다 (근거 없는 예외 금지)", () => {
    for (const e of exempt) expect(["foreground", "noDark"]).toContain(e.reason);
  });
});

describe("가드 자체의 구별력 — 규칙이 실제로 무언가를 잡는가", () => {
  it("🔑 짝 없는 bg-white를 위반으로 판정한다", () => {
    const bad = '<div className="rounded border bg-white p-2">';
    expect(bareBgWhite(bad).length).toBe(1);
    expect(/dark:bg-/.test(bad)).toBe(false);
  });

  it("🔑 짝 있는 것은 통과시킨다", () => {
    const ok = '<div className="rounded bg-white/70 dark:bg-white/5 p-2">';
    expect(/dark:bg-/.test(ok)).toBe(true);
  });

  it("🔑 variant는 라이트모드 배경이 아니다 — 잡지 않는다", () => {
    expect(bareBgWhite('<div className="print:bg-white p-2">').length).toBe(0);
    expect(bareBgWhite('<div className="hover:bg-white p-2">').length).toBe(0);
    expect(bareBgWhite('<div className="dark:bg-white/5 p-2">').length).toBe(0);
  });

  it("🔑 하드코딩 전경색은 면제한다 — 배경만 뒤집으면 못 읽는다", () => {
    expect(hasUnpairedDarkForeground('bg-white p-3 text-black')).toBe(true);
    expect(hasUnpairedDarkForeground('bg-white text-slate-900')).toBe(true);
    // dark: 짝이 있으면 면제 대상이 아니다
    expect(hasUnpairedDarkForeground('bg-white text-slate-900 dark:text-slate-100')).toBe(false);
  });
});
