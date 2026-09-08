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
