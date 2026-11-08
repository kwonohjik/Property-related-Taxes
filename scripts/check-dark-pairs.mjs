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
//   · 라이트 옅은 글자 금지(접두 없는 라이트 기본색 — docs/00-pm/ui-light-contrast-and-dark-print.plan.md §2-3):
//     ③ `text-{톤}-400~600` — 옅은 톤 바탕 위에서 4.5 미만(✓ `emerald-600` 3.77 등) → 같은 톤 700
//     ④ `text-{무채색}-300~500` — 3 미만 글자의 대부분 → 같은 계열 600
//     ⑤ `text-{톤}-N/NN` — 톤 글자를 반투명하게 깔면 바탕과 섞인다 → 불투명(400~600이면 700)
//     `dark:`·`hover:`·`disabled:`·`placeholder:` 등 접두 토큰은 ①~⑤가 보지 않는다(글자색은 아래 ⑥⑦⑧이 본다).
//   · 글자색 대비 4.5 미만 금지 — 글자가 놓인 바탕 위에서 계산한다(⑥⑦⑧; 색표는 Tailwind v4 theme.css의 oklch를 크로미엄 캔버스로
//     변환한 값). 바탕은 같은 클래스 목록의 `dark:bg-*`(⑧은 `hover:bg-*`) → 접두 없는 `bg-*` 순이고, 없으면 그 테마의 가장 불리한
//     바탕이다: 다크 `--muted`/`--secondary`/`--accent` rgb 38(`--background` 10 · `--card` 23보다 밝다 — 밝은 글자는 바탕이 밝을수록
//     대비가 낮으므로 10을 기준으로 삼으면 통과로 잘못 본다), 라이트 `--muted` rgb 245(`--background` 255보다 어둡다). 반투명 바탕·글자는 그
//     바탕과 섞어 계산한다. `bg-primary`·임의값·그라데이션처럼 색을 알 수 없는 바탕이 있으면 판정하지 않는다.
//     ⑥ `dark:hover:text-*`(`group-`·`peer-` 포함) — #3005 사고: 라이트 대비 codemod가 `dark:hover:text-red-300`을 `-800`으로 바꿔
//        다크 바탕 위 hover 글자가 2.37:1이 됐는데 ①~⑤가 접두 토큰을 안 봐서 통과했다.
//     ⑦ 접두 없는 `dark:text-*` — 38 위에서 400 이하는 전 톤 통과, 500은 red·rose·violet·purple·blue·indigo·pink·fuchsia·무채색이 미달,
//        600 이상은 대부분 미달 → 300~400. 같은 색을 라이트에도 적은 것(`text-gray-600 dark:text-gray-600`)은 다크에서도 흰 바탕을 유지하는
//        서식 안 글자라 건너뛴다. 알약(`bg-rose-100` 등 `dark:bg-` 없는 밝은 바탕)의 `dark:text-*`는 그 밝은 바탕 위에서 본다.
//     ⑧ 라이트 `hover:`·`group-hover:`·`peer-hover:` `text-*` — 245 위에서 700 이상은 전 톤 통과, 600은 amber·orange·red·rose·sky·emerald·
//        green·teal·cyan·yellow·lime·pink·fuchsia가 미달, 500 이하는 전부 미달 → 700 이상. 이 저장소의 hover 77곳은 도입 시점에 전부 통과였다.
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
const LIGHT_LOW = new RegExp(`^text-((${TONES})-(400|500|600)(/\\d+)?|(${NEU})-(300|400|500)(/\\d+)?|(${TONES})-\\d+/\\d+)$`);

// ⑦⑧ 대비 계산 — Tailwind v4 색표(theme.css의 oklch를 크로미엄 캔버스로 sRGB 변환한 값, 50~950 11단계)
const FAM = `${TONES}|${NEU}`;
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const HEX = {
  amber: "fffbeb fef3c6 fee685 ffd230 ffb900 fe9a00 e17100 bb4d00 973c00 7b3306 461901",
  orange: "fff7ed ffedd4 ffd6a8 ffb86a ff8904 ff6900 f54a00 ca3500 9f2d00 7e2a0c 441306",
  red: "fef2f2 ffe2e2 ffc9c9 ffa2a2 ff6467 fb2c36 e7000b c10007 9f0712 82181a 460809",
  rose: "fff1f2 ffe4e6 ffccd3 ffa1ad ff637e ff2056 ec003f c70036 a50036 8b0836 4d0218",
  violet: "f5f3ff ede9fe ddd6ff c4b4ff a684ff 8e51ff 7f22fe 7008e7 5d0ec0 4d179a 2f0d68",
  purple: "faf5ff f3e8ff e9d4ff dab2ff c27aff ad46ff 9810fa 8200db 6e11b0 59168b 3c0366",
  sky: "f0f9ff dff2fe b8e6fe 74d4ff 00bcff 00a6f4 0084d1 0069a8 00598a 024a70 052f4a",
  blue: "eff6ff dbeafe bedbff 8ec5ff 50a2ff 2b7fff 155dfc 1447e6 193cb8 1c398e 162556",
  emerald: "ecfdf5 d0fae5 a4f4cf 5ee9b5 00d492 00bc7d 009966 007a55 006045 004f3b 002c22",
  green: "f0fdf4 dbfce7 b9f8cf 7bf1a8 05df72 00c950 00a63e 008236 016630 0d542b 032e15",
  indigo: "eef2ff e0e7ff c6d2ff a3b3ff 7c86ff 615fff 4f39f6 432dd7 372aac 312c85 1e1a4d",
  teal: "f0fdfa cbfbf1 96f7e4 46edd5 00d5be 00bba7 009689 00786f 005f5a 0b4f4a 022f2e",
  cyan: "ecfeff cefafe a2f4fd 53eafd 00d3f3 00b8db 0092b8 007595 005f78 104e64 053345",
  yellow: "fefce8 fef9c2 fff085 ffdf20 fdc700 f0b100 d08700 a65f00 894b00 733e0a 432004",
  lime: "f7fee7 ecfcca d8f999 bbf451 9ae600 7ccf00 5ea500 497d00 3c6300 35530e 192e03",
  pink: "fdf2f8 fce7f3 fccee8 fda5d5 fb64b6 f6339a e60076 c6005c a3004c 861043 510424",
  fuchsia: "fdf4ff fae8ff f6cfff f4a8ff ed6aff e12afb c800de a800b7 8a0194 721378 4b004f",
  slate: "f8fafc f1f5f9 e2e8f0 cad5e2 90a1b9 62748e 45556c 314158 1d293d 0f172b 020618",
  gray: "f9fafb f3f4f6 e5e7eb d1d5dc 99a1af 6a7282 4a5565 364153 1e2939 101828 030712",
  zinc: "fafafa f4f4f5 e4e4e7 d4d4d8 9f9fa9 71717b 52525c 3f3f47 27272a 18181b 09090b",
  neutral: "fafafa f5f5f5 e5e5e5 d4d4d4 a1a1a1 737373 525252 404040 262626 171717 0a0a0a",
  stone: "fafaf9 f5f5f4 e7e5e4 d6d3d1 a6a09b 79716b 57534d 44403b 292524 1c1917 0c0a09",
};
const rgbOf = (fam, shade) => { const h = HEX[fam]?.split(" ")[SHADES.indexOf(+shade)]; return h ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) : null; };
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (fg, bg, a) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
// 테마별 바탕. `floor`는 글자가 놓일 수 있는 가장 불리한 바탕이다 — 밝은 글자는 바탕이 밝을수록, 어두운 글자는 어두울수록 대비가 낮다.
//   다크: --background 10 · --card/--popover 23 · --muted/--secondary/--accent 38 → 가장 밝은 38
//   라이트: --background/--card 255 · --muted/--secondary/--accent 245 → 가장 어두운 245
const SURFACE = {
  dark: { floor: [38, 38, 38], background: [10, 10, 10], card: [23, 23, 23], popover: [23, 23, 23], muted: [38, 38, 38], secondary: [38, 38, 38], accent: [38, 38, 38], white: [255, 255, 255], black: [0, 0, 0] },
  light: { floor: [245, 245, 245], background: [255, 255, 255], card: [255, 255, 255], popover: [255, 255, 255], muted: [245, 245, 245], secondary: [245, 245, 245], accent: [245, 245, 245], white: [255, 255, 255], black: [0, 0, 0] },
};
const BG_RE = new RegExp(`^bg-(?:(${FAM})-(\\d+)|(white|black|background|card|popover|muted|secondary|accent))(?:/(\\d+))?$`);
const BG_UNKNOWN = /^bg-(?:primary|destructive|foreground|sidebar|input|border|ring|chart|\[|gradient|linear|radial|conic)/;
/** 글자 바탕색 — 같은 클래스 목록의 `{prefix}bg-*`(없으면 접두 없는 `bg-*`), 둘 다 없으면 floor. 색을 알 수 없으면(primary·임의값·그라데이션) null → 판정하지 않는다. */
function bgUnder(toks, theme, prefix) {
  const S = SURFACE[theme];
  for (const p of [prefix, ""]) {
    for (const t of toks) {
      if (!t.startsWith(`${p}bg-`)) continue;
      const name = t.slice(p.length);
      if (BG_UNKNOWN.test(name)) return null;
      const m = name.match(BG_RE);
      if (!m) continue;
      const base = m[1] ? rgbOf(m[1], m[2]) : S[m[3]];
      if (!base) return null;
      return m[4] ? mix(base, S.floor, +m[4] / 100) : base;
    }
  }
  return S.floor;
}
const DARK_TEXT = new RegExp(`^dark:text-(${FAM})-(\\d+)(?:/(\\d+))?$`);
const HOVER_TEXT = new RegExp(`^(?:group-hover|peer-hover|hover)(?:/[\\w-]+)?:text-(${FAM})-(\\d+)(?:/(\\d+))?$`);
function weakOn(t, toks, re, theme, prefix) {
  const m = t.match(re);
  const fg = m && rgbOf(m[1], m[2]);
  const bg = fg && bgUnder(toks, theme, prefix);
  return !!bg && contrast(m[3] ? mix(fg, bg, +m[3] / 100) : fg, bg) < 4.5;
}
// ⑦ 접두 없는 `dark:text-*` — 같은 색을 라이트에도 적은 것(`text-gray-600 dark:text-gray-600`)은 다크에서도 흰 바탕을 유지하는 서식 안 글자라 건너뛴다
const darkPlainLow = (t, toks) => DARK_TEXT.test(t) && !toks.includes(`text-${t.slice(10).replace(/\/\d+$/, "")}`) && weakOn(t, toks, DARK_TEXT, "dark", "dark:");
// ⑧ 라이트 `hover:`·`group-hover:`·`peer-hover:` 글자색
const lightHoverLow = (t, toks) => weakOn(t, toks, HOVER_TEXT, "light", "hover:");
// ⑥ 다크 hover 글자색 — 같은 계산, 같은 다크 바탕
const DARK_HOVER_TEXT = new RegExp(`^dark:(?:group-|peer-)?hover:text-(${FAM})-(\\d+)(?:/(\\d+))?$`);
const darkHoverLow = (t, toks) => weakOn(t, toks, DARK_HOVER_TEXT, "dark", "dark:");
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
  const low = [...toks.filter((t) => MUTED_ALPHA.test(t) || LIGHT_LOW.test(t) || darkHoverLow(t, toks) || darkPlainLow(t, toks) || lightHoverLow(t, toks)), ...(toks.includes("text-white") ? toks.filter(whiteFails) : [])];
  if (texts.length && bgs.some((t) => !t.includes("/")) && isPill(toks)) return low;
  const out = [...low];
  if (!toks.some((t) => t.startsWith("dark:text-"))) out.push(...texts);
  if (!toks.some((t) => t.startsWith("dark:bg-"))) out.push(...bgs);
  return out;
}

const hasTone = (s) => s.split(/\s+/).some((t) => TEXT.test(t) || BG.test(t) || NTEXT.test(t) || NBG.test(t) || MUTED_ALPHA.test(t) || LIGHT_LOW.test(t) || WHITE_BG.test(t) || DARK_HOVER_TEXT.test(t) || DARK_TEXT.test(t) || HOVER_TEXT.test(t));

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
  ["`p-2 ${on ? \"text-violet-700\" : \"\"}`", 1],
  ['"참고 text-amber-700"', 0],
  ['"text-xs text-muted-foreground/50"', 1], // 투명도 준 회색 글자
  ['"text-xs text-muted-foreground"', 0],
  ['"rounded-full bg-sky-600 text-white"', 1], // 흰 글자 4.02
  ['"rounded-full bg-sky-700 text-white"', 0],
  ['"rounded-full bg-rose-600 text-white"', 0], // 4.51 — 통과
  ['"bg-emerald-700 text-white dark:bg-emerald-500"', 1], // 다크 변형도 본다
  ['"text-emerald-600 dark:text-emerald-400"', 1], // 라이트 옅은 톤 글자
  ['"text-emerald-700 dark:text-emerald-400"', 0],
  ['"rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-600"', 1], // 알약이어도 라이트 규칙은 본다
  ['"text-gray-500 dark:text-gray-400"', 1], // 연한 무채색 글자
  ['"text-gray-600 dark:text-gray-400"', 0],
  ['"text-amber-800/80 dark:text-amber-200"', 1], // 톤 글자 투명도
  ['"text-sky-700 hover:text-sky-800 disabled:text-gray-400 dark:text-sky-300"', 0], // 접두 토큰은 보지 않는다(⑥⑦⑧ 제외)
  ['"text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-800"', 1], // ⑥ #3005 사고 — 다크 hover 2.37
  ['"text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"', 0],
  ['"text-gray-600 dark:text-gray-400 dark:hover:text-gray-700"', 1], // 무채색 700
  ['"text-gray-600 dark:text-gray-400 dark:hover:text-gray-200"', 0],
  ['"text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-500"', 1], // 500은 indigo만 미달
  ['"text-red-700 dark:text-red-400 dark:hover:text-red-500"', 1], // red 500은 muted 바탕(38)에서 3.97 — 종전 표(rgb10 기준)는 통과로 봤다
  ['"text-red-700 dark:text-red-400 dark:hover:text-red-400"', 0],
  ['"text-blue-700 dark:text-blue-400 dark:hover:text-blue-600"', 1], // 600은 블루 미달
  ['"text-amber-700 dark:text-amber-400 dark:hover:text-amber-600"', 0], // amber 600은 38 위에서도 통과
  ['"text-slate-700 dark:text-slate-300 dark:group-hover:text-slate-800"', 1], // group-hover도 본다
  ['"text-slate-700 dark:text-slate-300 dark:group-hover:text-slate-300"', 0],
  ['"dark:hover:text-rose-800/80"', 1], // 투명도 붙어도 본다
  ['"hover:text-red-800"', 0], // 라이트 hover 8.36 — 통과
  // ⑦ 접두 없는 dark:text — 글자가 놓인 바탕(같은 목록의 dark:bg → bg → 가장 밝은 다크 바탕 38) 위 대비 4.5
  ['"text-gray-600 dark:text-gray-500"', 1], // 다크 바탕 38 위 3.0 — 가계표 머리글·흐림 행 사고
  ['"text-gray-600 dark:text-gray-400"', 0],
  ['"text-blue-700 dark:text-blue-500"', 1], // 500은 muted 바탕(38)에서 4.02
  ['"text-blue-700 dark:text-blue-400"', 0],
  ['"bg-gray-50/60 dark:bg-gray-800/60 text-gray-600 dark:text-gray-500"', 1], // 반투명 다크 바탕은 38 위에 섞는다
  ['"bg-gray-50/60 dark:bg-gray-800/60 text-gray-600 dark:text-gray-400"', 0],
  ['"bg-gray-900 dark:bg-white text-white dark:text-gray-900"', 0], // 반전 버튼 — 다크 바탕이 흰색
  ['"text-gray-600 dark:text-gray-600"', 0], // 다크에서도 흰 바탕인 서식 안 글자(같은 색 짝)
  ['"rounded bg-rose-100 px-1.5 py-0.5 text-rose-700 dark:text-rose-600"', 1], // 알약은 다크에서도 rose-100 — 3.77
  ['"rounded bg-rose-100 px-1.5 py-0.5 text-rose-700"', 0],
  ['"text-amber-700 dark:text-amber-300/80"', 0], // 투명도는 바탕과 섞어 계산한다
  ['"text-amber-700 dark:text-amber-400/30"', 1],
  ['"bg-primary text-primary-foreground dark:text-gray-500"', 0], // 바탕색을 알 수 없으면 판정하지 않는다
  // ⑧ 라이트 hover 글자색 — 바탕(hover:bg → bg → 가장 어두운 라이트 바탕 245) 위 대비 4.5
  ['"text-gray-700 hover:text-gray-500 dark:text-gray-300"', 1], // 245 위 4.4
  ['"text-gray-700 hover:text-gray-900 dark:text-gray-300"', 0],
  ['"text-sky-700 hover:text-sky-600 dark:text-sky-300"', 1], // 4.0
  ['"text-sky-700 hover:text-sky-700 dark:text-sky-300"', 0],
  ['"text-rose-700 group-hover:text-rose-500 dark:text-rose-300"', 1], // group-hover도 본다
  ['"text-rose-700 group-hover/card:text-rose-800 dark:text-rose-300"', 0], // 이름 붙은 그룹도 본다
  ['"bg-gray-900 text-white hover:text-gray-300 dark:bg-gray-900"', 0], // 어두운 바탕 위 밝은 hover 글자
  ['"bg-gray-50 text-gray-800 hover:bg-gray-800 hover:text-gray-200 dark:bg-gray-900 dark:text-gray-100"', 0], // hover 바탕이 따로 있으면 그 바탕 기준(gray-200은 gray-50 위에선 미달)
  ['"bg-gray-800 text-gray-100 hover:bg-gray-50 hover:text-gray-200 dark:bg-gray-900 dark:text-gray-100"', 1], // 반대로 hover에서 바탕이 밝아지면 미달
  ['"text-rose-700 hover:text-rose-800/50 dark:text-rose-300"', 1], // 투명도 — 바탕과 섞여 낮아진다
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
  console.error(`✗ 다크 짝 없는 톤 클래스·낮은 대비 조합 ${violations.length}곳 — 같은 클래스 목록에 dark:text-·dark:bg- 짝을 넣거나, 투명도 회색 글자는 불투명으로·흰 글자 배경은 같은 톤 700으로·다크 글자색(hover 포함)은 300~400으로·라이트 hover 글자색은 700 이상으로:`);
  console.error(violations.join("\n"));
  process.exitCode = 1; // exit()는 파이프로 넘긴 긴 출력을 자른다
} else {
  console.log("✓ 다크 짝 없는 톤 클래스·낮은 대비 조합 0곳");
}
