/**
 * anchor: 사용자에게 보이는 문구에 **함수 표기 `min(`·`max(`가 없다** — 전 세목.
 *
 * ## 지시
 *
 * 결과 화면 산식은 한국어 풀어쓰기가 정본이다(변수 약어·`floor()` 금지 —
 * [[feedback_result_view_korean_formula]]). `min(A, B)`는 `floor(`와 같은 **함수 표기**이고,
 * 정본은 「A와 B 중 큰 금액 / 작은 금액」이다.
 *
 * ## 계기 — 양도세 규칙이 «세 겹»으로 좁아 나머지 세목이 통째로 밖에 있었다
 *
 * 2026-09-08 `transfer-result-display-convention` D-4에 이 규칙을 넣고 「양도세 종결」이라
 * 보고했다. 그 판정은 세 번 좁았다:
 *
 * | 좁힘 | 놓친 것 |
 * |---|---|
 * | ① 대소문자 구분 `\b(min\|max)\(` | `MIN(`·`Min(`·`MAX[MIN(` 전부 |
 * | ② `TARGETS`가 양도세 표시 경로뿐 | 상속·증여·주식·종부세 |
 * | ③ 한글이 있는 조각만 수집 | `[= Min(◇, ◇)]`처럼 값만 든 산식 |
 *
 * 실측은 **14건 → 56건**으로 4배가 됐다. 그중 3건은 양도세 표면에 남아 있었다
 * (`CommercialBuildingValuationDetailCard:250` · `DetailedStatementFormulaBuilders:238` ·
 * `BurdenedGiftBlock:738`) — 「종결」 보고가 곧 판정 수단의 범위였을 뿐이다.
 * [[feedback_closure_claim_scoped_to_verified_subset]] ·
 * [[feedback_enumerate_forms_vs_conservative_superset]]
 *
 * ⇒ 이 앵커는 **전 세목**(`components/calc` + `lib/tax-engine`)을 본다. D-4의 양도세 규칙은
 *   이제 이 검사의 부분집합이지만, 세목별 규약 문서로서 그대로 둔다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["components/calc", "lib/tax-engine"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/**
 * 함수 호출 표기 — **대소문자 무관**. 선행 문자 조건이 `Math.min(`·`formatMax(` 같은
 * **식별자 일부**를 배제한다(그것들은 코드이고 화면엔 값이 찍힌다).
 */
const MINMAX_CALL = /(^|[^A-Za-z0-9_.])(min|max)\s*\(/i;

/** Tailwind `max-w-[min(...)]`·`minmax(0,1fr)`·JS `Math.min(` — 코드/스타일이지 문구가 아니다. */
const NOISE = /max-w-|min-w-|max-h-|min-h-|minmax\(|Math\.(min|max)\(/;

/**
 * 주석은 제외한다 — 이력 주석이 **종전 문자열을 인용**하고 있고 그것은 지워선 안 된다
 * (예: 「종전에는 `Min(⑨, ⑩)`이라 적었다」).
 */
function displayLines(file: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let depth = 0;
  readFileSync(file, "utf-8")
    .split("\n")
    .forEach((raw, i) => {
      const t = raw.trim();
      if (depth > 0) {
        if (raw.includes("*/")) depth = 0;
        return;
      }
      if (t.startsWith("//")) return;
      if (t.startsWith("/*") || t.startsWith("{/*")) {
        if (!raw.includes("*/")) depth = 1;
        return;
      }
      // ⚠️ `* Max(…)`를 «주석»으로 넘기면 안 된다 — JSX 각주가 그 모양이다
      //    (`BurdenedGiftBlock:738`이 실제로 그랬고, 그래서 1차 집계에서 주석으로 오분류됐다).
      //    블록 주석 안(depth>0)은 위에서 이미 걸렀으므로 여기서 `*` 시작을 막지 않는다.
      //
      // ⚠️ **줄 끝 주석**도 걷어낸다 — 타입 선언의 `cappedTax: number; // min(a, b)` 같은
      //    설명 주석 10건이 「표시 문구」로 잡혔다(줄 시작만 보던 첫 판에서 실제로 그랬다).
      //    `://`(URL)는 남긴다.
      out.push({ line: i + 1, text: raw.replace(/(^|[^:])\/\/.*$/, "$1") });
    });
  return out;
}

/** 문자열 리터럴 + JSX 텍스트 노드 — 화면에 도달하는 조각. */
function displayFragments(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  for (const m of text.matchAll(/>([^<>]*)</g)) out.push(m[1]);
  const t = text.trim();
  if (t && !/[<>{}="'`]/.test(t)) out.push(t);
  return out;
}

const FILES = ROOTS.flatMap((r) => walk(r));

/**
 * 정당한 예외 — **원본 재현**뿐이다. 표기를 바꾸면 인용이 아니게 되는 것들.
 * (현재 0건. 별지 서식 replica에서 실제로 `Min(`을 쓰는 원본이 나오면 여기에 사유와 함께 적는다.)
 */
const ALLOWLIST: { file: string; snippet: string; 사유: string }[] = [];

describe("함수 표기 min(·max( 금지 — 전 세목", () => {
  it("스캐너가 실제로 전 세목을 본다 (구별력 확보)", () => {
    // 대상이 비면 아래 단언이 공허하게 통과한다. 실측 2026-09-08 기준 2,000 이상.
    expect(FILES.length).toBeGreaterThan(1000);
    expect(FILES.some((f) => f.includes("/inheritance/"))).toBe(true);
    expect(FILES.some((f) => f.includes("/deemed-gift/"))).toBe(true);
    expect(FILES.some((f) => f.includes("/transfer"))).toBe(true);
  });

  it("정규식이 대소문자를 가리지 않는다 (①번 사각지대 고정)", () => {
    for (const s of ["Min(⑨, ⑩)", "MAX(공모가, 보충적)", "max(0, x)", "MAX[MIN(㉠, ㉡), 2천만]"]) {
      expect(MINMAX_CALL.test(s), s).toBe(true);
    }
    // 코드는 잡지 않는다
    for (const s of ["Math.min(a, b)", "Math.max(0, n)", "formatMax(v)"]) {
      expect(MINMAX_CALL.test(s), s).toBe(false);
    }
  });

  it("🔑 표시 문구에 함수 표기 `min(`·`max(`가 없다", () => {
    const hits: string[] = [];
    for (const file of FILES) {
      for (const { line, text } of displayLines(file)) {
        if (NOISE.test(text)) continue;
        for (const raw of displayFragments(text)) {
          // 표현식 자리를 지운다 — `${…}`(템플릿)와 `{…}`(JSX) 둘 다 값이 찍히는 자리다.
          const shown = raw.replace(/\$\{[^}]*\}/g, "◇").replace(/\{[^}]*\}/g, "◇");
          if (!MINMAX_CALL.test(shown)) continue;
          if (ALLOWLIST.some((a) => file.endsWith(a.file) && shown.includes(a.snippet))) continue;
          hits.push(`${file}:${line}  ${shown.trim().slice(0, 120)}`);
        }
      }
    }
    expect([...new Set(hits)]).toEqual([]);
  });
});
