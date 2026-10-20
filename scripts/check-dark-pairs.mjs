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
//   · 예외: 불투명 밝은 배경 + 톤 글자 = 자체 대비 배지(양 테마 같은 밝은 알약) — 짝 불필요.
//     단 ① 배경을 `dark:bg-`로 뒤집었으면 배지가 아니다(배경만 어두워지고 글자는 라이트색으로 남는다)
//     ② 블록 패딩(`p-2`↑·`px-3`↑·`py-1`↑·`space-y-*`·`leading-relaxed`)이 있으면 안내 상자다 — 다크에서 밝게
//        남은 상자 안의 테마색 자식(회색 법령 배지 등)이 밝아져 읽히지 않는다(docs/00-pm/ui-dark-low-contrast-residual.plan.md R2·R4)
//   · 무채색(slate·gray·neutral·zinc·stone) 글자 500~950·배경 50~300도 같은 규칙이다(2026-10-20 확장 —
//     짝이 없으면 다크 바탕에 어두운 글자, 또는 반투명 밝은 층이 깔려 대비 1.0까지 떨어졌다).
//   · 다크에서도 흰 바탕을 유지하는 공식 서식 재현(WHITE_FORM)은 다크 짝 규칙을 보지 않는다 —
//     그 안의 글자·상자를 뒤집으면 흰 바탕에 흰 글자, 흰 바탕에 어두운 상자가 된다(#1550이 반대 방향으로 밟은 함정).
//   · `components/calc/shared/tones.ts`는 톤 정본이라 제외
//   · 낮은 대비 조합 금지(양 테마 공통 — docs/00-pm/ui-dark-low-contrast-residual.plan.md §5):
//     ① `text-muted-foreground/NN` — 회색을 다시 반투명하게 깔면 흰 바탕에서도 1.7~3.9다
//     ② `text-white` + 흰 글자 대비 4.5 미만 톤 배경(`sky-600` 4.02 · `emerald-500` 2.46 등) — 같은 톤 700을 쓸 것
//
// 사용법: node scripts/check-dark-pairs.mjs [경로...]   # 기본 범위: app components lib
// 하드블록: .husky/pre-push (폰트·톤 게이트와 같은 층위)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TONES = "amber|orange|red|rose|violet|purple|sky|blue|emerald|green|indigo|teal|cyan|yellow|lime|pink|fuchsia";
const TEXT = new RegExp(`^text-(${TONES})-(400|500|600|700|800|900|950)(/\\d+)?$`);
const BG = new RegExp(`^bg-(${TONES})-(50|100|200|300)(/\\d+)?$`);
const NEU = "slate|gray|zinc|neutral|stone";
const NTEXT = new RegExp(`^text-(${NEU})-(500|600|700|800|900|950)(/\\d+)?$`);
const NBG = new RegExp(`^bg-(${NEU})-(50|100|200|300)(/\\d+)?$`);
const LIT = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;

// 다크에서도 흰 바탕을 유지하는 공식 서식 재현과 그 안에서만 렌더되는 하위 파일. 루트는 둘 중 하나다:
//   ① `bg-white … text-black`(dark 짝 없음 — `__tests__/components/dark-mode-bg-policy.test.ts`의 예외)
//   ② `dark:bg-white dark:text-black`(다크에서도 흰 바탕을 명시 — 비상장주식 평가서·상장주식 평가서)
// 루트가 서식 밖 UI와 같은 파일에 있으면(BesshiForm4Buppyo3PrintView) 파일을 넣지 않고, 서식 안 글자에 같은 색 dark 짝을 적는다.
export const WHITE_FORM = [
  "components/calc/building-std-price/nts-report/",
  "components/calc/inheritance/deduction-besshi/Besshi1FormTable.tsx",
  "components/calc/inheritance/deduction-besshi/Besshi5FormTable.tsx",
  "components/calc/inheritance/deduction-besshi/Besshi6_2",
  "components/calc/inheritance/deduction-besshi/Buppyo3FormTable.tsx",
  "components/calc/inheritance/listed-stock/besshi/",
  "components/calc/inheritance/listed-stock/ListedStockBesshiResultView.tsx",
  "components/calc/inheritance/unlisted-stock-v2/besshi/",
  "components/calc/results/ExitTaxHoldingReportForm.tsx",
  "components/calc/results/GiftTaxValuationFormTable.tsx",
];

const MUTED_ALPHA = /^(?:[a-z-]+:)*text-muted-foreground\/\d+$/;
// 흰 글자 대비 4.5 미만인 톤 배경(Tailwind v4 색값으로 계산): 400 전부 · 500(indigo 제외) · 600 일부
const WHITE_OK_600 = new Set(["rose", "violet", "blue", "red", "purple", "fuchsia", "pink", "indigo"]);
const WHITE_BG = new RegExp(`^(?:dark:)?bg-(${TONES})-(400|500|600)$`);
const whiteFails = (t) => { const m = t.match(WHITE_BG); if (!m) return false; const s = +m[2]; return s === 400 || (s === 500 && m[1] !== "indigo") || (s === 600 && !WHITE_OK_600.has(m[1])); };

// 안내 상자 모양(블록 패딩) — 알약 배지는 `px-1.5 py-0.5`·`px-2 py-0.5` 수준이다
const BOX = /^(p-([2-9]|1\d)(\.5)?|px-([3-9]|1\d)(\.5)?|py-([1-9]|1\d)(\.5)?|space-y-\S+|leading-relaxed)$/;
const isPill = (toks) => !toks.some((t) => t.startsWith("dark:bg-") || BOX.test(t));

/** 클래스 목록 하나의 위반 토큰 */
export function unpaired(classList, { neutral = true } = {}) {
  const toks = classList.split(/\s+/).filter(Boolean);
  // 흰 바탕 고정(`bg-white`에 dark 짝 없음) 문자열은 양 테마 같은 밝은 상자다 — 무채색 짝 불필요
  const fixedWhite = toks.some((t) => /^bg-white(\/\d+)?$/.test(t)) && !toks.some((t) => t.startsWith("dark:bg-"));
  const useNeutral = neutral && !fixedWhite;
  const texts = toks.filter((t) => TEXT.test(t) || (useNeutral && NTEXT.test(t)));
  const bgs = toks.filter((t) => BG.test(t) || (useNeutral && NBG.test(t)));
  const low = [...toks.filter((t) => MUTED_ALPHA.test(t)), ...(toks.includes("text-white") ? toks.filter(whiteFails) : [])];
  if (texts.length && bgs.some((t) => !t.includes("/")) && isPill(toks)) return low;
  const out = [...low];
  if (!toks.some((t) => t.startsWith("dark:text-"))) out.push(...texts);
  if (!toks.some((t) => t.startsWith("dark:bg-"))) out.push(...bgs);
  return out;
}

const hasTone = (s) => s.split(/\s+/).some((t) => TEXT.test(t) || BG.test(t) || NTEXT.test(t) || NBG.test(t) || MUTED_ALPHA.test(t) || WHITE_BG.test(t));

/** 소스 하나의 위반 — 문자열 리터럴마다, 템플릿은 `${}` 바깥 조각과 안쪽 리터럴을 따로 본다 */
export function scan(src, opts) {
  const found = [];
  for (const m of src.matchAll(LIT)) {
    if (m[3] !== undefined) {
      for (const part of m[3].split(/(\$\{[^}]*\})/)) {
        if (part.startsWith("${")) found.push(...scan(part, opts));
        else if (hasTone(part)) found.push(...unpaired(part, opts));
      }
    } else {
      const body = m[1] ?? m[2];
      // 한글이 든 리터럴은 클래스 목록이 아니라 문구다
      if (hasTone(body) && !/[가-힣]/.test(body)) found.push(...unpaired(body, opts));
    }
  }
  return found;
}

// 판별력 자기 점검 — 규칙이 무너지면 게이트가 조용히 0건을 내므로 먼저 확인한다
const SELF = [
  ['"text-amber-700"', 1],
  ['"text-amber-700 dark:text-amber-300"', 0],
  ['"bg-sky-50 text-sky-700"', 0], // 자체 대비 배지
  ['"rounded bg-sky-50 px-1.5 py-0.5 text-sky-700"', 0], // 알약 배지
  ['"rounded-md bg-amber-50 p-3 text-amber-900"', 2], // 안내 상자 — 배지 아님
  ['"bg-amber-50 dark:bg-amber-900/20 text-amber-700"', 1], // 배경만 뒤집힘 — 배지 아님
  ['"bg-sky-50/40 text-sky-700"', 2],
  ['"bg-rose-100 p-2"', 1],
  ['"text-slate-700"', 1], // 무채색도 짝 필요
  ['"text-slate-700 dark:text-slate-300"', 0],
  ['"bg-slate-50/50 p-3"', 1],
  ['"bg-white p-3 text-black text-slate-700"', 0], // 흰 바탕 고정 상자
  ['"rounded bg-gray-100 px-1.5 py-0.5 text-gray-600"', 0], // 무채색 알약
  ["`p-2 ${on ? \"text-violet-600\" : \"\"}`", 1],
  ['"참고 text-amber-700"', 0],
  ['"text-xs text-muted-foreground/50"', 1], // 투명도 준 회색 글자
  ['"text-xs text-muted-foreground"', 0],
  ['"rounded-full bg-sky-600 text-white"', 1], // 흰 글자 4.02
  ['"rounded-full bg-sky-700 text-white"', 0],
  ['"rounded-full bg-rose-600 text-white"', 0], // 4.51 — 통과
  ['"bg-emerald-700 text-white dark:bg-emerald-500"', 1], // 다크 변형도 본다
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
    if (WHITE_FORM.some((w) => file.includes(w))) continue;
    const opts = { neutral: true };
    for (const m of src.matchAll(LIT)) {
      const hits = scan(m[0], opts);
      if (hits.length) violations.push(`${file}:${src.slice(0, m.index).split("\n").length}  ${hits.join(" ")}`);
    }
  }
}

if (violations.length) {
  console.error(`✗ 다크 짝 없는 톤 클래스·낮은 대비 조합 ${violations.length}곳 — 같은 클래스 목록에 dark:text-·dark:bg- 짝을 넣거나, 투명도 회색 글자는 불투명으로·흰 글자 배경은 같은 톤 700으로:`);
  console.error(violations.join("\n"));
  process.exitCode = 1; // exit()는 파이프로 넘긴 긴 출력을 자른다
} else {
  console.log("✓ 다크 짝 없는 톤 클래스·낮은 대비 조합 0곳");
}
