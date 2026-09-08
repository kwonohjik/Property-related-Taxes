/**
 * anchor: 결과뷰 산식의 나눗셈은 **분수로 렌더된다** — 렌더 경로 축.
 *
 * ## 지시
 *
 * 2026-07-22 사용자 지시(PR #746): 「`× (A ÷ B)` 인라인 금지 → `<Frac>` 분수 표기」.
 * 공용 소스는 `components/calc/results/shared/FormulaParts.tsx`이고, 문자열 산식은
 * `FormulaText`가 `renderFormula`로 `분자 / 분모`를 `<Frac>`으로 치환한다.
 * [[feedback_formula_frac_fline_standard]]
 *
 * ## 계기 — 변환기가 있어도 «거치지 않으면» 소용없다
 *
 * 2026-09-08 감사에서 결과뷰 **9곳**이 `{formula}`를 평문으로 찍고 있었다. 같은 엔진
 * 문자열이 카드에 따라 다르게 그려졌다:
 *
 * | 카드 | 종전 | 결과 |
 * |---|---|---|
 * | `Pre1990LandValuationDetailCard:26` | `<FormulaText value={…formula} />` | 분수 ✅ |
 * | `InheritedHouseValuationDetailCard:205` | `<p>{…formula}</p>` | 인라인 `/` ❌ |
 *
 * **하나의 문자열, 두 갈래 렌더**였다. 형제 카드가 이미 정답을 갖고 있었다.
 * [[feedback_sibling_path_already_implements_rule]]
 *
 * ## 이 앵커의 구조
 *
 * 정적 스캔(A)만으로는 「컴포넌트가 실제로 분수를 그린다」가 증명되지 않는다
 * ([[feedback_library_anchor_does_not_prove_component_uses_it]]) — 그래서 **실제 엔진
 * 산출물을 넣고 컴포넌트를 렌더**해 DOM으로 확인하는 짝(B)을 둔다.
 * 픽스처를 손으로 짜면 결함을 가릴 수 있으므로 산식은 엔진에서 받는다
 * ([[feedback_fixture_default_masks_gate_defect]]).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { calculatePre1990LandValuation } from "@/lib/tax-engine/pre-1990-land-valuation";
import { renderFormula } from "@/components/calc/results/shared/FormulaParts";
import { InheritedHouseValuationDetailCard } from "@/components/calc/results/transfer/InheritedHouseValuationDetailCard";
import type { InheritanceHouseValuationResult } from "@/lib/tax-engine/types/inheritance-house-valuation.types";

afterEach(cleanup);

// ── A. 정적 — 결과뷰에 «평문 formula 렌더»가 없다 ─────────────────────
const ROOT = "components/calc/results";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("A. 결과뷰 산식 렌더 경로 — FormulaText를 거친다", () => {
  const files = walk(ROOT);

  it("스캐너가 실제로 결과뷰를 본다 (구별력 확보)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("🔑 `{formula}`를 평문으로 찍는 지점이 없다", () => {
    const bad: string[] = [];
    for (const file of files) {
      readFileSync(file, "utf-8")
        .split("\n")
        .forEach((line, i) => {
          const t = line.trim();
          if (t.startsWith("//") || t.startsWith("*") || t.startsWith("{/*")) return;
          // `{formula}` · `{x.formula}` 를 그대로 렌더하는 줄만 잡는다.
          // 제외 ① `formula={…}` prop 전달 ② `<FormulaText value={formula} />` — 정본 경로다.
          //   (②를 빼먹어 정본까지 결함으로 잡혔다 — 이 규칙을 처음 돌렸을 때 실제로 그랬다.)
          if (/FormulaText/.test(line)) return;
          if (/\{\s*[A-Za-z0-9_.]*\bformula\s*\}/.test(line) && !/formula=\{/.test(line)) {
            bad.push(`${file}:${i + 1}  ${t.slice(0, 100)}`);
          }
        });
    }
    expect(bad).toEqual([]);
  });
});

// ── B. 렌더 — 실제 엔진 산식이 분수로 그려진다 ────────────────────────
/**
 * 분모 cap(Case ③)이 걸리는 실측 입력 — 산식에 `취득등급가액 / 분모` 나눗셈이 들어간다.
 * 등급가액을 직접 주입해 등급표 의존을 없앤다.
 */
const PRE1990 = calculatePre1990LandValuation({
  acquisitionDate: new Date("1985-06-01"),
  transferDate: new Date("2024-05-01"),
  areaSqm: 200,
  pricePerSqm_1990: 120_000,
  grade_1990_0830: { gradeValue: 78_900 },
  gradePrev_1990_0830: { gradeValue: 90_000 },
  gradeAtAcquisition: { gradeValue: 45_600 },
});

const DETAIL: InheritanceHouseValuationResult = {
  sumAtInheritance: 148_382_411,
  sumAtFirstDisclosure: 329_982_000,
  landStdAtInheritance: 110_246_831,
  landStdAtTransfer: 1_243_350_000,
  landStdAtFirstDisclosure: 287_352_000,
  buildingStdAtInheritance: 38_135_580,
  buildingStdAtFirstDisclosure: 42_630_000,
  housePriceAtFirstDisclosure: 341_000_000,
  housePriceAtInheritanceUsed: 153_336_855,
  housePriceAtTransfer: 1_287_000_000,
  estimationMethod: "estimated_phd",
  formula: "취득당시 개별주택가격 추정 (§164⑦ · ⑤ 준용)",
  legalBasis: "소득세법 시행령 §164⑦",
  warnings: [],
  pre1990Result: PRE1990,
};

describe("B. InheritedHouseValuationDetailCard — 엔진 산식이 분수로 렌더된다", () => {
  it("전제: 엔진 산식에 나눗셈이 들어 있다 (구별력 확보)", () => {
    // 이 전제가 깨지면 아래 두 단언은 공허하게 통과한다.
    expect(PRE1990.breakdown.formula).toMatch(/\d[\d,]*\s*\/\s*\d[\d,]*/);
  });

  it("🔑 분자·분모가 «분수 막대»를 사이에 두고 렌더된다", () => {
    const { container } = render(<InheritedHouseValuationDetailCard detail={DETAIL} />);
    // Frac의 분모 칸은 분수 막대(border-t)를 갖는다 — 인라인 텍스트에는 없다.
    const bars = container.querySelectorAll("span.border-t");
    expect(bars.length, "분수 막대가 하나도 없다 — FormulaText를 거치지 않았다").toBeGreaterThan(0);
  });

  it("🔑 인라인 `분자 / 분모` 문자열이 화면에 남지 않는다 (긍정 짝의 부정형)", () => {
    render(<InheritedHouseValuationDetailCard detail={DETAIL} />);
    const inline = PRE1990.breakdown.formula.match(/\d[\d,]*\s*\/\s*\d[\d,]*/)?.[0];
    expect(inline).toBeTruthy();
    expect(screen.queryByText(new RegExp(inline!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeNull();
  });
});

// ── C. 표현 축 — 나눗셈이 `renderFormula`의 변환 대상 안에 있다 ────────
/**
 * `renderFormula`의 `OPERAND`는 **숫자 또는 괄호쌍**이다. 피연산자가 한국어 낱말이면
 * (`권리가액 / 분양가`) 경로를 거쳐도 분수가 되지 않는다.
 *
 * 🔴 **정규식을 넓히지 않는다.** 넓히면 나눗셈이 아닌 슬래시까지 분수가 된다 —
 *    「적용 / 미적용」·「부호 음수/양수」·「5년 내 = … / 5년 후 = …」가 실제로 있다.
 *    대신 **산식 쪽에서 피연산자를 괄호로 감싼다**(변환 규칙 불변 · 폭발 반경 0).
 *
 * 이 검사는 「변환되지 않는 나눗셈-모양 문자열」이 **아래 정당한 예외뿐**임을 고정한다.
 */
const NON_DIVISION_ALLOWLIST: { file: string; snippet: string; 사유: string }[] = [
  // 참조 0건 — import·JSX 사용이 전부 없다(주석 언급만). 화면에 도달하지 않는다.
  { file: "GeneralBuildingValuationDetailCard.tsx", snippet: "토지 기준시가 / 합계 기준시가", 사유: "dead component" },
  { file: "GeneralBuildingValuationDetailCard.tsx", snippet: "취득시 토지 기준시가 / 양도시 토지 기준시가", 사유: "dead component" },
  { file: "GeneralBuildingValuationDetailCard.tsx", snippet: "취득시 건물기준시가 / 양도시 건물기준시가", 사유: "dead component" },
  { file: "GenerationSkipFormulaRows.tsx", snippet: "30% / 미성년", 사유: "선택지 병기 — 나눗셈 아님" },
  { file: "ComprehensiveFilingFormBuppyo5.tsx", snippet: "⑧×⑨/⑩", 사유: "별지 서식 replica — 원본 재현(표준 예외)" },
  { file: "public-interest-post-mgmt.ts", snippet: "/ 판정일", 사유: "구분자 — 나눗셈 아님" },
  { file: "metadata.ts", snippet: "5년 후 = 5년간 발생분 차감", 사유: "구분자 — 나눗셈 아님" },
  { file: "new-99-3.ts", snippet: "부호 음수/양수", 사유: "부호 병기 — 나눗셈 아님" },
  { file: "new-99-3.ts", snippet: "부호 양수/음수", 사유: "부호 병기 — 나눗셈 아님" },
  { file: "new-99-3.ts", snippet: "부호 음수/음수", 사유: "부호 병기 — 나눗셈 아님" },
  { file: "MixedUseResultCard.tsx", snippet: "토지/건물 별 보유연수", 사유: "대비 병기 — 나눗셈 아님" },
];

const OPERAND = String.raw`(?:\([^()]*\)|\d[\d,]*(?:\.\d+)?%?)`;
const FRACTION_RE = new RegExp(`(${OPERAND})\\s*[/÷]\\s*(${OPERAND})`);

function scanDivisionCandidates(roots: string[]) {
  const hits: { file: string; line: number; text: string }[] = [];
  for (const root of roots) {
    for (const file of walkAny(root)) {
      const src = readFileSync(file, "utf-8");
      let depth = 0;
      src.split("\n").forEach((line, i) => {
        const t = line.trim();
        if (depth > 0) { if (line.includes("*/")) depth = 0; return; }
        if (t.startsWith("//")) return;
        if (t.startsWith("{/*") || t.startsWith("/*")) { if (!line.includes("*/")) depth = 1; return; }
        if (t.startsWith("*")) return;

        // ⚠️ 문자열 리터럴만 보면 **JSX 텍스트를 통째로 놓친다** — 실제 위반의 상당수가
        //    `<p>토지 양도가액 = … / …</p>` 형태였다(감사 스크립트와 수집 범위를 맞춘다).
        const candidates: string[] = [];
        for (const m of line.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) {
          candidates.push(m[1] ?? m[2] ?? m[3] ?? "");
        }
        for (const m of line.matchAll(/>([^<>]*)</g)) candidates.push(m[1]);

        for (const raw of candidates) {
          if (!/[가-힣]/.test(raw)) continue;
          const shown = raw.replace(/\$\{[^}]*\}/g, "1,234");
          // 산식 문맥(곱셈·등호)이면서 나눗셈처럼 보이는 것만
          if (!/[×=]/.test(shown) || !/\S\s*[/÷]\s*\S/.test(shown)) continue;
          // 단위·법령 인용·날짜는 나눗셈이 아니다
          if (/\/㎡|\/평|\/년|\/월|\/일|§|https?:\/\//.test(shown)) continue;
          if (FRACTION_RE.test(shown)) continue; // 분수로 변환됨 — 정상
          hits.push({ file, line: i + 1, text: shown });
        }
      });
    }
  }
  return hits;
}

function walkAny(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkAny(p, out);
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("C. 산식 나눗셈은 분수 변환 대상이다 (표현 축)", () => {
  const hits = scanDivisionCandidates(["components/calc/results", "lib/tax-engine"]);

  it("스캐너가 실제로 «변환되는» 나눗셈을 본다 (구별력 확보)", () => {
    // 변환되는 쪽이 0이면 「변환 안 되는 것이 없다」는 공허하다.
    let converted = 0;
    for (const file of walkAny("lib/tax-engine")) {
      for (const m of readFileSync(file, "utf-8").matchAll(/`([^`]*)`/g)) {
        if (FRACTION_RE.test(m[1].replace(/\$\{[^}]*\}/g, "1,234"))) converted++;
      }
    }
    // 실측 45건(2026-09-08 · `lib/tax-engine`의 백틱 리터럴 한정). 여유를 두고 30으로 건다 —
    // 추측한 100으로 걸었다가 어긋났다. 임계값은 세어 보고 정한다.
    expect(converted).toBeGreaterThan(30);
  });

  it("🔑 변환되지 않는 나눗셈-모양 문자열은 «정당한 예외»뿐이다", () => {
    const unexplained = hits.filter(
      (h) => !NON_DIVISION_ALLOWLIST.some((a) => h.file.endsWith(a.file) && h.text.includes(a.snippet)),
    );
    expect(unexplained.map((h) => `${h.file}:${h.line}  ${h.text.slice(0, 110)}`)).toEqual([]);
  });

  /**
   * 🔴 **스캐너가 판정할 수 없는 형태가 있다.**
   *
   * `transfer-tax-taxable-gain.ts:74`의 분모는 `${denomLabel} ${denom}`이고 `denomLabel`은
   * 런타임에 「양도가」·「총양도가」·「증여가액 C」 — 즉 **한국어 낱말**이다. 그런데 스캐너는
   * `${...}`를 숫자(`1,234`)로 치환하므로 **분모가 숫자로 보여 「변환된다」고 오판**한다.
   * 실제로 괄호를 지우는 뮤테이션에서 위 규칙이 울리지 않았다(구별력 0).
   * ⇒ 이 한 곳은 **소스 리터럴로 직접 고정**한다.
   * [[feedback_mutation_zero_discrimination_is_not_proof]]
   */
  it("🔑 `${denomLabel}` 분모는 괄호로 감싸져 있다 (스캐너 사각지대 — 소스 고정)", () => {
    const src = readFileSync("lib/tax-engine/transfer-tax-taxable-gain.ts", "utf-8");
    expect(src).toContain("/ (${denomLabel} ${denom.toLocaleString()})");
  });

  /**
   * `unwrap`은 **표시**만 정리한다(무엇이 분수가 되는지는 불변). 그래서 위 규칙들은
   * `unwrap`을 지워도 울리지 않는다 — 계약을 직접 고정한다.
   */
  it("🔑 분수 칸에서 바깥 괄호 한 겹이 벗겨진다", () => {
    const { container } = render(<>{renderFormula("보험금 × (관련 보험료) ÷ (총 보험료)")}</>);
    const bar = container.querySelector("span.border-t");
    expect(bar?.textContent, "분모에서 괄호가 벗겨져야 한다").toBe("총 보험료");
    expect(container.textContent).not.toContain("(총 보험료)");
  });

  it("🔑 연산자가 든 묶음은 괄호를 유지한다 (기존 표시 보존)", () => {
    // `(A+B+C)` 의 괄호는 원래 의미를 갖고 있고 그 표시를 고정한 앵커가 이미 있다
    // (`DetailedCalculationStatementCard.test.tsx` T-09). 벗기면 그쪽이 깨진다 — 실제로 깨졌다.
    const { container } = render(<>{renderFormula("1 / (10+20+30)")}</>);
    expect(container.textContent).toContain("(10+20+30)");
  });

  it("🔑 안쪽에 괄호가 또 있으면 벗기지 않는다 (짝 깨짐 방지)", () => {
    const { container } = render(<>{renderFormula("(가 (나) 다) / (라)")}</>);
    expect(container.textContent).toContain("(가 (나) 다)");
  });

  it("예외 목록이 죽지 않았다 — 각 항목이 실제로 하나 이상 잡힌다", () => {
    // 예외를 적어 두고 그 문자열이 사라지면 목록만 남아 규칙이 헐거워진다.
    const dead = NON_DIVISION_ALLOWLIST.filter(
      (a) => !hits.some((h) => h.file.endsWith(a.file) && h.text.includes(a.snippet)),
    );
    expect(dead.map((a) => `${a.file}  «${a.snippet}»  (${a.사유})`)).toEqual([]);
  });
});
