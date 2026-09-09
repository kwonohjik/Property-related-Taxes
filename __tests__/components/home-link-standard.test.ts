/**
 * 정적 가드 — **홈 이동은 `HomeButton`만 쓴다** (RU-3).
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
 *   좁거나 없는 가드는 지켜지지 않는다(memory `feedback_rule_wider_than_its_guard`).
 *
 * ## `router.push("/")` 축 — 전수 판정 후 추가
 *
 * 처음엔 이 축을 뺐다. 「로그아웃 리다이렉트 같은 흐름 제어와 렌더된 어포던스를 같은
 * 잣대로 셀 수 없다」는 이유였고, **판정하지 않은 코드에 하드게이트를 걸지 않기**
 * 위해서였다. 그 뒤 6곳을 전수 판정했다:
 *
 * | 곳 | 판정 |
 * |---|---|
 * | `TransferTaxCalculator:223` · `PropertyTaxForm:100` · `comprehensive:440` · `stock:143` | **사문화 — 제거** |
 * | `ProfileClient:47` (프로필 저장 후 리다이렉트) | 흐름 제어 — 면제 |
 * | `HomeButton.tsx:54` (`confirmMessage` 경로) | 표준 구현체 — 면제 |
 *
 * 넷이 죽어 있던 이유는 하나다. **2026-07-25 `WizardBackNav` 통합**이 step 0을
 * `HomeButton` 직접 렌더로 바꾸면서 `onBack`을 부르지 않게 됐는데(`WizardNav.tsx:56`,
 * anchor `__tests__/components/wizard-nav.test.tsx:46`), 그보다 먼저 쓰인 각 세목의
 * `handleBack`에는 `if (step === 0) router.push("/")`가 그대로 남았다. 지우지 않으면
 * 읽는 사람이 「step 0 뒤로가기 = 홈」이라 오독한다 — 실제로는 `HomeButton`이 처리한다.
 *
 * ⇒ 판정이 끝났으므로 이 축도 잠근다. **면제는 늘리지 않는다.**
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

/** 코드가 프로그램적으로 홈으로 보내는가 — `router.push("/")` · `router.replace("/")`. */
export function isProgrammaticHomePush(line: string): boolean {
  return /router\.(push|replace)\(\s*["'`]\/["'`]\s*\)/.test(line);
}

/**
 * 🔒 `router.push("/")` 면제 — 전수 판정 결과 «어포던스가 아닌» 둘뿐이다.
 * **늘리지 않는다.** 새로 필요하면 왜 렌더된 홈 버튼이 아닌지 여기에 먼저 적을 것.
 */
export const HOME_PUSH_EXEMPT: Record<string, string> = {
  "app/profile/ProfileClient.tsx": "프로필 저장 성공 후 리다이렉트 — 사용자가 누르는 홈 버튼이 아니다",
  "components/calc/shared/HomeButton.tsx": "표준 구현체 자신(confirmMessage 경로)",
};

interface Site {
  file: string;
  line: number;
  text: string;
}

const violations: Site[] = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    if (/__tests__|\.test\.|\.spec\./.test(file)) continue;
    if (file in HOME_PUSH_EXEMPT && file.endsWith("HomeButton.tsx")) continue; // 표준 구현체
    readFileSync(join(ROOT, file), "utf8")
      .split("\n")
      .forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*")) return; // 주석이 규칙을 «인용»한다
        if (isNativeHomeHref(line)) {
          violations.push({ file, line: i + 1, text: t.slice(0, 120) });
          return;
        }
        if (isProgrammaticHomePush(line) && !(file in HOME_PUSH_EXEMPT)) {
          violations.push({ file, line: i + 1, text: t.slice(0, 120) });
        }
      });
  }
}

describe('홈 이동 단일 표준 — native <Link href="/"> · router.push("/") 금지', () => {
  it("🔴 표준 밖 홈 이동이 0건이다 (components/calc/CLAUDE.md:346)", () => {
    const msg = violations.map((v) => `  ${v.file}:${v.line}\n    ${v.text}`).join("\n");
    expect(
      violations,
      `표준 밖 홈 이동 ${violations.length}건 — <HomeButton>으로 바꿀 것:\n${msg}`,
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
    expect(isNativeHomeHref("<Link href={`/law/${id}`}>")).toBe(false);
  });

  it("🔑 프로그래매틱 홈 이동을 잡는다", () => {
    expect(isProgrammaticHomePush('    router.push("/");')).toBe(true);
    expect(isProgrammaticHomePush("router.replace('/')")).toBe(true);
  });

  it("🔑 하위 경로·변수 경로는 잡지 않는다", () => {
    expect(isProgrammaticHomePush('router.push("/calc/transfer-tax")')).toBe(false);
    expect(isProgrammaticHomePush("router.push(href)")).toBe(false);
  });

  it("🔒 면제는 2곳뿐이다 — 늘리지 않는다", () => {
    expect(Object.keys(HOME_PUSH_EXEMPT)).toHaveLength(2);
  });
});
