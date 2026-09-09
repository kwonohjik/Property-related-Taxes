/**
 * 정적 가드 — **홈 이동은 `HomeButton`만 쓴다**. native `<Link href="/">` 금지 (RU-3).
 *
 * `components/calc/CLAUDE.md:87·346`이 정한 규칙:
 *
 * > 집 아이콘(`Home`) + `rounded-full` 테두리 pill 단일 표준.
 * > **신규 작성 금지**: native `<Link href="/">`, `<button onClick={()=>router.push("/")}>`,
 * > `ChevronLeft`/`←` 홈링크. 전부 `<HomeButton>`으로.
 * > `variant`: `pill`(기본, **헤더·breadcrumb**) / `block`(전체폭)
 *
 * 🔴 신설 이유 (critic:rules, 2026-09-10):
 *   규칙은 「신규 작성 금지」인데 **강제하는 것이 없었다**. `components/ui/home-link.tsx`를
 *   폐지한 PR #708 이후에도 `app/guide/layout.tsx`의 breadcrumb가 native `<Link href="/">`로
 *   남아 있었다 — 규칙이 `pill`을 「헤더·**breadcrumb**」용으로 명시하고 있는데도 그렇다.
 *   좁거나 없는 가드는 지켜지지 않는다([[feedback_rule_wider_than_its_guard]]).
 *
 * ## ⛔ 대상이 아닌 것
 *
 * 1. **`HomeButton.tsx` 자신** — 표준 구현체다.
 * 2. **`router.push("/")` 프로그래매틱 내비게이션** — 규칙이 금지한 것은
 *    `<button onClick={…}>` 형태의 **렌더된 홈 어포던스**다. 로그아웃 리다이렉트나
 *    마법사 back 핸들러의 `router.push("/")`는 어포던스가 아니라 흐름 제어라서
 *    같은 잣대로 셀 수 없다. 그 축을 세려면 「렌더되는가」를 먼저 판정해야 하므로
 *    이 가드는 손대지 않는다 — 판정하지 않은 코드에 하드게이트를 걸면 안 된다.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) {
      if (name !== "node_modules") walk(rel, out);
    } else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

/**
 * 루트로 가는 native 링크인가.
 *
 * ⚠️ 속성 순서를 가정하지 않는다 — `<Link className=… href="/">`도 같은 위반이다.
 *    여는 태그 전체를 훑지 않고 `href="/"` 토큰만 본다(다음 줄로 넘어간 속성도 잡힌다).
 *    `href="/calc/..."`처럼 하위 경로는 잡지 않는다 — 닫는 따옴표를 요구한다.
 */
export function isNativeHomeHref(line: string): boolean {
  return /href=\{?["'`]\/["'`]\}?/.test(line);
}

interface Site {
  file: string;
  line: number;
  text: string;
}

const violations: Site[] = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    if (/__tests__|\.test\.|\.spec\./.test(file)) continue;
    if (file.endsWith("components/calc/shared/HomeButton.tsx")) continue; // 표준 구현체
    readFileSync(join(ROOT, file), "utf8")
      .split("\n")
      .forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*")) return; // 주석이 규칙을 «인용»한다
        if (!isNativeHomeHref(line)) return;
        violations.push({ file, line: i + 1, text: t.slice(0, 120) });
      });
  }
}

describe("홈 이동 단일 표준 — native <Link href=\"/\"> 금지", () => {
  it("🔴 native 홈 링크가 0건이다 (components/calc/CLAUDE.md:346)", () => {
    const msg = violations.map((v) => `  ${v.file}:${v.line}\n    ${v.text}`).join("\n");
    expect(
      violations,
      `native 홈 링크 ${violations.length}건 — <HomeButton>으로 바꿀 것:\n${msg}`,
    ).toHaveLength(0);
  });
});

describe("가드 자체의 구별력 — 규칙이 실제로 무언가를 잡는가", () => {
  it("🔑 native 홈 링크를 잡는다", () => {
    expect(isNativeHomeHref('<Link href="/" className="hover:text-foreground">')).toBe(true);
    expect(isNativeHomeHref("<a href='/'>홈</a>")).toBe(true);
  });

  it("🔑 속성 순서를 가정하지 않는다", () => {
    expect(isNativeHomeHref('<Link className="text-xs" href="/">')).toBe(true);
  });

  it("🔑 하위 경로는 잡지 않는다 — 홈 링크만이 대상이다", () => {
    expect(isNativeHomeHref('<Link href="/calc/transfer-tax">')).toBe(false);
    expect(isNativeHomeHref('<Link href="/guide">')).toBe(false);
    expect(isNativeHomeHref('<Link href={`/law/${id}`}>')).toBe(false);
  });
});
