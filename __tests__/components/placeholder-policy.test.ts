/**
 * anchor: placeholder 정책 정적 가드 (2026-09-07 · hint 삭제 캠페인 3라운드).
 *
 * components/calc/CLAUDE.md 두 규칙을 **소스 전수 스캔**으로 지킨다:
 *   ① placeholder에 숫자 예시 금지 — 형식 설명은 한국어로 (「예: 91.78」류)
 *   ② placeholder가 라벨을 그대로 되풀이하지 않는다 (라벨 + 단위 + placeholder 3중 중복)
 *
 * 🔑 이 가드는 **정적 분석**이라 jsdom·렌더가 필요 없다. 그래서 pre-push와 CI 전체 테스트
 *    양쪽에서 자동으로 잡힌다(법령 커버리지 가드와 같은 층위).
 *
 * ⚠️ 허용 목록을 늘려 통과시키지 말 것. 새 placeholder가 여기 걸리면 **문구를 고치는 것**이
 *    처방이다 — 그러라고 만든 규칙이다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["components/calc", "app/calc", "components/ui"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** 소스 전부에서 placeholder 문자열 리터럴을 뽑는다(표현식 안의 리터럴 포함). */
function collectPlaceholders(): { file: string; text: string }[] {
  const found: { file: string; text: string }[] = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf-8");
      const re = /\bplaceholder=(?:"([^"]*)"|\{([^}]*)\})/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        if (m[1] !== undefined) {
          found.push({ file, text: m[1] });
        } else if (m[2] !== undefined) {
          for (const lit of m[2].matchAll(/"([^"]*)"|`([^`]*)`/g)) {
            const t = lit[1] ?? lit[2];
            if (t) found.push({ file, text: t });
          }
        }
      }
    }
  }
  return found;
}

describe("placeholder 정책 — 정적 가드", () => {
  const all = collectPlaceholders();

  it("스캐너가 실제로 무언가를 본다 (구별력 확보)", () => {
    // 대상이 0건이면 아래 두 단언은 무엇이든 통과한다 — 그 상태를 먼저 배제한다.
    expect(all.length).toBeGreaterThan(300);
  });

  it("🔑 ① 숫자 예시를 쓰지 않는다 (「예: 1350.00」류)", () => {
    // 「예:」 뒤에 숫자가 오는 형태만 본다. 「6자리 숫자」처럼 형식을 한국어로 쓴 것은 정상이다.
    const bad = all.filter((p) => /(예\s*[:：]|예시)\s*[^가-힣]{0,3}\d/.test(p.text));
    expect(bad.map((b) => `${b.file}  ${b.text}`)).toEqual([]);
  });

  /**
   * ② 라벨 동어반복 **래칫**.
   *
   * 3라운드에서 「테스트 셀렉터가 물지 않은」 57건을 지웠고, 나머지는 `getByPlaceholder(...)`가
   * 물고 있어 셀렉터 이관이 선행돼야 한다(4라운드). 그래서 0을 요구할 수 없다 —
   * **줄어들기만 한다**는 것을 지킨다(E2E `known-failures` 목록과 같은 규약).
   *
   * ⚠️ 이 수를 **올려서 통과시키지 말 것.** 새 placeholder가 라벨을 되풀이하면 문구를 고친다.
   *
   * 🔴 여는 태그는 **정규식으로 못 자른다** — 속성 표현식 안의 `{x > 0 ? …}`가 `>`로 끝나
   *    `[^>]*`가 요소를 조기 종료시킨다(실측: 그 방식은 132건 중 1건만 봤다).
   *    그래서 중괄호·따옴표를 세는 스캐너를 쓴다.
   */
  // 2026-09-07 실측값. 이 수는 **줄이기만 한다**.
  //   56 → 58: 3라운드가 지운 2건을 되돌렸다(accessible name이 placeholder에서 왔다).
  //   58 → 19: 4라운드가 CurrencyInput의 접근성 이름을 라벨에서 내도록 고친 뒤
  //            금액 칸 39건을 지우고 셀렉터를 `getByLabel`로 이관했다.
  //
  // 남은 19건은 **금액이 아닌 칸**(주식수·발행주식총수·신주수)이다. CurrencyInput의
  // 기본 placeholder가 「금액 입력」이라 지우면 더 틀린다 ⇒ 이 수는 여기서 더 안 내려간다.
  // 더 줄이려면 주식수 칸을 다른 컴포넌트로 옮기는 별도 작업이 필요하다.
  const ECHO_MAX = 19;

  /** `<Tag` 부터 여는 태그의 끝(`>` 또는 `/>`)까지 — 문자열·중괄호 안의 `>`는 건너뛴다. */
  function openTag(src: string, i: number): string {
    let j = i;
    let depth = 0;
    while (j < src.length) {
      const ch = src[j];
      if (ch === '"' || ch === "'" || ch === "`") {
        const q = ch;
        j += 1;
        while (j < src.length && src[j] !== q) j += src[j] === "\\" ? 2 : 1;
      } else if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) return src.slice(i, j + 1);
      j += 1;
    }
    return src.slice(i, j);
  }

  it("🔑 ② 라벨 동어반복 placeholder가 늘지 않는다", () => {
    const norm = (t: string) =>
      t.replace(/[\s()（）[\]·,.\-—:：/]|입력|하세요|원|㎡|%/g, "");
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const src = readFileSync(file, "utf-8");
        for (const m of src.matchAll(/<[A-Z][A-Za-z0-9]*\b/g)) {
          const tag = openTag(src, m.index!);
          const lm = /\blabel="([^"]*)"/.exec(tag);
          const pm = /\bplaceholder="([^"]*)"/.exec(tag);
          if (!lm || !pm || !lm[1] || !pm[1]) continue;
          if (norm(lm[1]) === norm(pm[1])) hits.push(`${file}  ${lm[1]}`);
        }
      }
    }
    expect(hits.length).toBeLessThanOrEqual(ECHO_MAX);
  });
});
