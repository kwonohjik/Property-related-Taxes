/**
 * anchor: 화면에 **리터럴 `÷`가 남지 않는다** — 분수 표준의 «세 번째 축».
 *
 * ## 왜 축이 하나 더 필요한가
 *
 * 분수 표준([[feedback_formula_frac_fline_standard]])의 기존 가드는 둘이었다:
 *
 * | 축 | 묻는 것 | 가드 |
 * |---|---|---|
 * | A 표현 | 피연산자가 숫자·괄호인가 | `formula-fraction-render-path` C |
 * | B 렌더 경로 | 결과뷰가 `{formula}`를 평문으로 찍는가 | 동 A·B |
 * | **C 리터럴** | **JSX 텍스트·prop에 `÷`를 직접 썼는가** | **이 파일** |
 *
 * 축 A는 「변환기가 바꿀까?」를 **피연산자 모양으로만** 본다. 그래서 `renderFormula`를
 * **아예 타지 않는** JSX 텍스트(`가중평균 = (A × 3 + B × 2) ÷ 5`)를 「변환됨」으로 통과시켰다.
 * 2026-09-08 실측에서 `components/calc`에 **39곳**이 그렇게 새 나갔고(주식 13 · 양도 8 ·
 * 상속 6 …), 보수적 초집합으로 다시 재니 **30곳 이상**이 더 나왔다
 * ([[feedback_enumerate_forms_vs_conservative_superset]]).
 *
 * ## 이 가드의 규칙
 *
 * 주석이 아닌 줄에 `÷`가 있으면 **전부 잡는다**(보수적 초집합). 정당한 것은 아래
 * 목록에 **사유와 함께** 적는다 — 목록은 **줄이기만 한다**.
 *
 * 매체가 평문 전용이면(`CurrencyInput.hint`·`title=` HTML 속성) `<Frac>` 대신
 * **「A를 B로 나눈 값」으로 말로 푼다**. 예외로 남기지 않는다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "components/calc";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** 주석을 걷어낸 «화면에 나갈 수 있는» 줄. 줄 끝 `//`도 제거하되 `://`(URL)는 남긴다. */
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
      if (t.startsWith("//") || t.startsWith("*")) return;
      if (t.startsWith("/*") || t.startsWith("{/*")) {
        if (!raw.includes("*/")) depth = 1;
        return;
      }
      out.push({ line: i + 1, text: raw.replace(/(^|[^:])\/\/.*$/, "$1") });
    });
  return out;
}

/**
 * 정당한 예외 — 각 항목은 **왜 `÷`가 남아도 되는지**를 밝힌다.
 * 🔴 **늘리지 않는다.** 새 `÷`는 `<Frac>`이나 말로 푸는 것이 정본이다.
 */
/**
 * ⚠️ **줄 번호로 매칭하지 않는다.** 같은 파일의 무관한 편집이 줄을 밀면 예외가 통째로
 * 죽어 «가짜 실패»가 난다. 문자열 조각으로 고정한다 — 그 조각이 사라지면(=고쳐지면)
 * 「예외 목록이 죽지 않았다」가 알려 준다.
 */
const ALLOWLIST: { file: string; snippet: string; 사유: string }[] = [
  // ── ① 변환기 자신 (코드) ──
  { file: "results/shared/FormulaParts.tsx", snippet: "const FRACTION_RE", 사유: "FRACTION_RE 정의 — 변환기 코드" },
  { file: "results/shared/FormulaParts.tsx", snippet: "if (/[+\\-−×÷/]/.test(inner))", 사유: "unwrap 연산자 판정 — 변환기 코드" },

  // ── ② 서식·집행기준 원문 재현 (표기를 바꾸면 인용이 아니게 된다) ──
  {
    file: "building-std-price/nts-report/ReportSection5Apportion.tsx",
    snippet: "At = ΣAi",
    사유: "NTS 계산서 서식 산식 범례 원문 재현",
  },
  { file: "inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts", snippet: "1주당 순자산가액 (③ ÷ ①)", 사유: "별지 서식 셀 라벨 원문" },
  { file: "inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts", snippet: "weightedAvgNormal", 사유: "별지 서식 셀 라벨 원문" },
  { file: "inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts", snippet: "weightedAvgRealEstateNote", 사유: "별지 서식 셀 라벨 원문" },
  { file: "inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts", snippet: "주당순손익액 (마 ÷ 바)", 사유: "별지 서식 셀 라벨 원문" },
  { file: "inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts", snippet: "1주당 가액 (아÷자)", 사유: "별지 서식 셀 라벨 원문" },
  {
    file: "transfer/GeneralBuildingBlock.tsx",
    snippet: "취득 시 기준시가는 환산주택가격을",
    사유: "양도소득세 집행기준 99-164-10 원문 재현 (<pre> 평문)",
  },

  // ── ③ 세로 원장 행 (`× 재산가액` / `÷ 상속재산가액`이 각각 값을 가진 행) ──
  { file: "results/inheritance/CulturalHeritageDeferralCard.tsx", snippet: "÷ 상속재산가액", 사유: "세로 원장 행 — 표준 예외" },

  // ── ④ `FormulaText`를 거쳐 **실제로 분수로 렌더**되는 문자열 ──
  //    소비 지점을 함께 적는다 — 소비가 바뀌면 이 사유가 거짓이 되므로 확인 가능해야 한다.
  {
    file: "results/transfer/DetailedStatementLthdFormulas.ts",
    snippet: "총 장특공제",
    사유: "DetailedCalculationStatementCard:237·347·397이 FormulaText로 렌더",
  },
  {
    file: "results/transfer/DetailedStatementRedevOverrides.ts",
    snippet: "환산취득가 = ${fmt(pre.apportionedTransfer)}",
    사유: "DetailedCalculationStatementCard가 FormulaText로 렌더",
  },
  {
    file: "results/transfer/DetailedStatementRedevelopmentBuilders.ts",
    snippet: "${fmt(rights)} ÷ ${fmt(sale)}",
    사유: "DetailedCalculationStatementCard가 FormulaText로 렌더",
  },
  {
    file: "results/transfer/DetailedStatementRedevelopmentBuilders.ts",
    snippet: "안분 취득가액",
    사유: "DetailedCalculationStatementCard가 FormulaText로 렌더",
  },
  {
    file: "results/transfer/DetailedStatementRedevelopmentBuilders.ts",
    snippet: "${fmt(meta.numerator)} ÷ ${fmt(meta.denominator)}",
    사유: "DetailedCalculationStatementCard가 FormulaText로 렌더",
  },
  {
    file: "transfer/RedevelopmentValuationSection.tsx",
    snippet: "step1Formula = ",
    사유: "같은 파일 :378이 FormulaText로 렌더 (step1Formula)",
  },
  {
    file: "transfer/RedevelopmentValuationSection.tsx",
    snippet: "step2Formula:",
    사유: "같은 파일 :385가 FormulaText로 렌더 (step2Formula)",
  },
  {
    file: "transfer/RedevelopmentValuationSection.tsx",
    snippet: "formula: `${rights.toLocaleString()} × ${acq.toLocaleString()}",
    사유: "같은 파일 :528이 FormulaText로 렌더 (preview.formula)",
  },
];

function scan(): { file: string; line: number; text: string }[] {
  const hits: { file: string; line: number; text: string }[] = [];
  for (const file of walk(ROOT)) {
    for (const { line, text } of displayLines(file)) {
      if (!text.includes("÷")) continue;
      if (/\bFrac\b/.test(text)) continue; // 이미 분수 정본
      hits.push({ file, line, text: text.trim() });
    }
  }
  return hits;
}

const HITS = scan();

describe("리터럴 ÷ 금지 — 분수 표준 축 C", () => {
  it("스캐너가 실제로 계산 UI를 본다 (구별력 확보)", () => {
    const files = walk(ROOT);
    expect(files.length).toBeGreaterThan(400);
    expect(files.some((f) => f.includes("/stock-transfer/"))).toBe(true);
    expect(files.some((f) => f.includes("/inheritance/"))).toBe(true);
  });

  it("주석은 보지 않는다 (이력 주석이 종전 표기를 인용한다)", () => {
    // 블록 주석 안의 `÷`가 잡히면 정정 이력을 적을 수 없게 된다.
    expect(HITS.some((h) => h.text.startsWith("*") || h.text.startsWith("//"))).toBe(false);
  });

  it("🔑 화면에 리터럴 `÷`가 남는 지점은 «정당한 예외»뿐이다", () => {
    const unexplained = HITS.filter(
      (h) => !ALLOWLIST.some((a) => h.file.endsWith(a.file) && h.text.includes(a.snippet)),
    );
    expect(unexplained.map((h) => `${h.file}:${h.line}  ${h.text.slice(0, 110)}`)).toEqual([]);
  });

  it("예외 목록이 죽지 않았다 — 각 항목이 실제로 하나 이상 잡힌다", () => {
    const dead = ALLOWLIST.filter(
      (a) => !HITS.some((h) => h.file.endsWith(a.file) && h.text.includes(a.snippet)),
    );
    expect(dead.map((a) => `${a.file}  «${a.snippet}»  (${a.사유})`)).toEqual([]);
  });
});
