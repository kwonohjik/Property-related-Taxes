#!/usr/bin/env node
//
// check-dark-pairs.mjs — 라이트 전용 유채색 톤 글자·배경 클래스 차단.
//
// 앱은 사용자가 켤 수 있는 다크 테마를 제공한다(헤더 테마 버튼). `text-amber-700`처럼 라이트용
// 톤 글자색만 있고 같은 클래스 목록에 `dark:text-`가 없으면, 다크 바탕에서 글자가 배경과 겹쳐
// 읽히지 않는다(전체 E2E 다크 측정 — docs/00-pm/ui-narrow-width-and-dark-mode-residual.plan.md ③).
// 2026-10-19 기존 2,591곳에 다크 짝을 넣고 0건이 되었다 → 0 유지.
//
// 규칙(같은 문자열 리터럴 = 같은 클래스 목록 기준):
//   · 톤 글자 `text-{tone}-{400~950}` → `dark:text-*`가 함께 있어야 한다
//   · 밝은 톤 배경 `bg-{tone}-{50~300}` → `dark:bg-*`가 함께 있어야 한다
//   · 예외: 불투명 밝은 배경 + 톤 글자 = 자체 대비 배지(양 테마 같은 밝은 알약) — 짝 불필요
//   · 무채색(slate·gray·neutral·zinc·stone)은 대상 아님 — 공식 서식 재현이 쓴다
//   · `components/calc/shared/tones.ts`는 톤 정본이라 제외
//
// 사용법: node scripts/check-dark-pairs.mjs [경로...]   # 기본 범위: app components lib
// 하드블록: .husky/pre-push (폰트·톤 게이트와 같은 층위)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TONES = "amber|orange|red|rose|violet|purple|sky|blue|emerald|green|indigo|teal|cyan|yellow|lime|pink|fuchsia";
const TEXT = new RegExp(`^text-(${TONES})-(400|500|600|700|800|900|950)(/\\d+)?$`);
const BG = new RegExp(`^bg-(${TONES})-(50|100|200|300)(/\\d+)?$`);
const LIT = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;

/** 클래스 목록 하나의 위반 토큰 */
export function unpaired(classList) {
  const toks = classList.split(/\s+/).filter(Boolean);
  const texts = toks.filter((t) => TEXT.test(t));
  const bgs = toks.filter((t) => BG.test(t));
  if (texts.length && bgs.some((t) => !t.includes("/"))) return [];
  const out = [];
  if (!toks.some((t) => t.startsWith("dark:text-"))) out.push(...texts);
  if (!toks.some((t) => t.startsWith("dark:bg-"))) out.push(...bgs);
  return out;
}

const hasTone = (s) => s.split(/\s+/).some((t) => TEXT.test(t) || BG.test(t));

/** 소스 하나의 위반 — 문자열 리터럴마다, 템플릿은 `${}` 바깥 조각과 안쪽 리터럴을 따로 본다 */
export function scan(src) {
  const found = [];
  for (const m of src.matchAll(LIT)) {
    if (m[3] !== undefined) {
      for (const part of m[3].split(/(\$\{[^}]*\})/)) {
        if (part.startsWith("${")) found.push(...scan(part));
        else if (hasTone(part)) found.push(...unpaired(part));
      }
    } else {
      const body = m[1] ?? m[2];
      // 한글이 든 리터럴은 클래스 목록이 아니라 문구다
      if (hasTone(body) && !/[가-힣]/.test(body)) found.push(...unpaired(body));
    }
  }
  return found;
}

// 판별력 자기 점검 — 규칙이 무너지면 게이트가 조용히 0건을 내므로 먼저 확인한다
const SELF = [
  ['"text-amber-700"', 1],
  ['"text-amber-700 dark:text-amber-300"', 0],
  ['"bg-sky-50 text-sky-700"', 0], // 자체 대비 배지
  ['"bg-sky-50/40 text-sky-700"', 2],
  ['"bg-rose-100 p-2"', 1],
  ['"text-slate-700"', 0],
  ["`p-2 ${on ? \"text-violet-600\" : \"\"}`", 1],
  ['"참고 text-amber-700"', 0],
];
for (const [src, n] of SELF) {
  if (scan(src).length !== n) {
    console.error(`✗ check-dark-pairs 자기 점검 실패: ${src} → ${scan(src).length}건(기대 ${n})`);
    process.exit(1);
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules") walk(p, out);
    } else if (/\.tsx?$/.test(name) && !p.endsWith("shared/tones.ts")) out.push(p);
  }
  return out;
}

const paths = process.argv.slice(2);
const violations = [];
for (const base of paths.length ? paths : ["app", "components", "lib"]) {
  for (const file of walk(base)) {
    // 여러 줄 템플릿 리터럴이 있어 파일 전체를 본다. 줄 번호는 리터럴 시작 위치다.
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(LIT)) {
      const hits = scan(m[0]);
      if (hits.length) violations.push(`${file}:${src.slice(0, m.index).split("\n").length}  ${hits.join(" ")}`);
    }
  }
}

if (violations.length) {
  console.error(`✗ 다크 짝 없는 톤 클래스 ${violations.length}곳 — 같은 클래스 목록에 dark:text-·dark:bg- 짝을 넣을 것:`);
  console.error(violations.join("\n"));
  process.exitCode = 1; // exit()는 파이프로 넘긴 긴 출력을 자른다
} else {
  console.log("✓ 다크 짝 없는 톤 클래스 0곳");
}
