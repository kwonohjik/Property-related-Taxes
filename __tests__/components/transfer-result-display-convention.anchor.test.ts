/**
 * anchor: 양도세 결과탭 **표시 규약 감사**(결과탭 코드리뷰 Lane 0).
 *
 * 리뷰가 확정한 표기 결함 17건은 전부 「한 번 새면 조용히 남는」 종류였다 —
 * 타입도 테스트도 잡지 못하고, 사용자만 본다:
 *   · #041 #042 #065 #075  금액 뒤 「원」 접미사 (규약: 콤마 숫자만)
 *   · #035 #036 #050 #074  여는 괄호만 있고 닫히지 않은 산식 8+2+8줄
 *   · #007 #039 #047 #092  감면 라벨맵이 3벌로 갈려 미등록 유형은 내부 enum id 노출
 *   · #040 #076            엔진 step formula에 내부 enum(`self_farming`·`MAX_BENEFIT`) 노출
 *   · #064                 산식에 `floor(...)`·변수 약어 `P_A`·`D` 노출
 *
 * 그래서 **리터럴 자체를 검사 대상으로 삼는다**. 값 anchor는 이런 결함을 잡지 못한다 —
 * 「원」이 붙어도 숫자는 맞고, 괄호가 없어도 세액은 옳다.
 *
 * ⚠️ 검사 범위는 **양도세 결과탭이 실제로 인쇄하는 경로**로 한정한다. 다른 세목의 경고
 *   산문(`warnings.push("… 한도 100,000,000원을 초과 …")`)도 같은 규약 위반이지만
 *   이 리뷰의 범위 밖이라 손대지 않았다 — 범위를 넓히려면 그 세목의 anchor와 함께 옮길 것.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  REDUCTION_TYPE_LABELS,
  reductionTypeLabelOf,
  UNKNOWN_REDUCTION_LABEL,
} from "@/lib/tax-engine/transfer-reduction-type-labels";

const ROOT = process.cwd();

/** 양도세 결과탭 표시 경로 — 화면·PDF에 나가는 문자열을 만드는 파일들. */
const DISPLAY_DIRS = [
  "components/calc/results/transfer",
  "components/calc/results/mixed-use",
];
const DISPLAY_FILES = [
  "components/calc/results/MultiTransferTaxResultView.tsx",
  "components/calc/results/MultiTransferTaxSummaryCard.tsx",
  "components/calc/results/MultiTransferPropertyBreakdown.tsx",
  "components/calc/results/BundledAllocationCard.tsx",
  "components/calc/results/TransferTaxResultView.tsx",
  // 결과탭이 그대로 인쇄하는 엔진 formula 생산지
  "lib/tax-engine/transfer-tax-taxable-gain.ts",
  "lib/tax-engine/transfer-tax-lthd-steps.ts",
  "lib/tax-engine/transfer-tax-aggregate.ts",
  "lib/tax-engine/transfer-tax-aggregate-reduction-step.ts",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

const TARGETS = [...DISPLAY_DIRS.flatMap(walk), ...DISPLAY_FILES];

/**
 * 주석 줄을 걷어낸다 — 이력 기록·설명 주석이 종전 문자열을 **인용**하고 있고
 * (예: 「종전에는 `floor(총양도가액 × 청산금 / 분양가)`로 인쇄했는데」) 그것은 지워선 안 된다.
 * 검사 대상은 실제로 화면에 나가는 리터럴뿐이다.
 */
function codeLines(rel: string): { line: number; text: string }[] {
  const raw = readFileSync(join(ROOT, rel), "utf8").split("\n");
  const out: { line: number; text: string }[] = [];
  let inBlock = false;
  raw.forEach((text, i) => {
    const t = text.trim();
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      return;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlock = true;
      return;
    }
    if (t.startsWith("//") || t.startsWith("*")) return;
    out.push({ line: i + 1, text });
  });
  return out;
}

/**
 * 한 줄에서 표시용 템플릿 리터럴을 걷는다.
 *
 * ⚠️ 중첩 템플릿(삼항·`.map(() => `…`)`)은 단순 정규식으로 온전히 못 자른다 — 잘린 조각은
 *   여는 괄호만 남아 **가짜 결함**으로 보인다(실측 2건: CarryoverScenarioBFilingCard:53 ·
 *   DetailedStatementHelpers:222). `${`와 `}`의 개수가 어긋나면 그 조각은 잘린 것이므로 버린다.
 */
function displayLiterals(text: string): string[] {
  return (text.match(/`[^`]*`/g) ?? []).filter(
    (lit) => (lit.match(/\$\{/g) ?? []).length === (lit.match(/\}/g) ?? []).length,
  );
}

/** `${...}` 안은 코드다 — 화면에 나가는 것은 그 **결과값**이다. */
function shownText(lit: string): string {
  return lit.replace(/\$\{[^}]*\}/g, "◇");
}

function scan(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const rel of TARGETS) {
    for (const { line, text } of codeLines(rel)) {
      if (pattern.test(text)) hits.push(`${rel}:${line}  ${text.trim().slice(0, 120)}`);
    }
  }
  return hits;
}

// ── D-0 감사가 실제로 무언가를 보고 있는가 ────────────────────────────
describe("D-0 감사 격자", () => {
  it("검사 대상 파일이 충분히 잡힌다", () => {
    expect(TARGETS.length, "대상이 비면 아래 단언은 전부 공허하게 통과한다").toBeGreaterThan(30);
    expect(TARGETS).toContain("lib/tax-engine/transfer-tax-taxable-gain.ts");
    expect(TARGETS).toContain("components/calc/results/transfer/DetailedStatementLthdItems.ts");
  });

  it("주석 제거가 실제로 동작한다 (이력 주석의 `floor(` 인용을 걸러야 한다)", () => {
    const rel = "components/calc/results/transfer/DetailedStatementRedevelopmentBuilders.ts";
    const raw = readFileSync(join(ROOT, rel), "utf8");
    expect(raw, "이 파일에는 종전 산식을 인용한 이력 주석이 있어야 한다").toContain("floor(");
    expect(codeLines(rel).some((l) => l.text.includes("floor(총양도가액"))).toBe(false);
  });
});

// ── D-1 「원」 접미사 (#041 #042 #065 #075) ────────────────────────────
describe("D-1 금액 뒤 「원」 접미사가 없다", () => {
  it("`}원` 형태가 0건이다", () => {
    expect(scan(/\}원/)).toEqual([]);
  });

  it("하드코딩 `0원` 리터럴이 0건이다", () => {
    expect(scan(/["'`]0원/)).toEqual([]);
  });
});

// ── D-2 괄호 균형 (#035 #036 #050 #074) ───────────────────────────────
describe("D-2 표시 산식의 괄호가 닫힌다", () => {
  /**
   * `(${...}` 로 열고 같은 리터럴 안에서 닫지 않는 형태를 찾는다.
   * 완전한 괄호 파서는 과하다 — 실제 결함 10건이 전부 「열고 그대로 끝난다」였다.
   */
  it("`(${…}` 로 연 뒤 닫히지 않은 채 리터럴이 끝나는 줄이 없다", () => {
    const hits: string[] = [];
    for (const rel of TARGETS) {
      for (const { line, text } of codeLines(rel)) {
        for (const lit of displayLiterals(text)) {
          const shown = shownText(lit);
          const so = (shown.match(/\(/g) ?? []).length;
          const sc = (shown.match(/\)/g) ?? []).length;
          if (so > sc) hits.push(`${rel}:${line}  ${lit.slice(0, 120)}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});

// ── D-3 내부 식별자 노출 (#007 #039 #040 #047 #076 #092) ───────────────
describe("D-3 내부 enum id가 화면 문자열로 새지 않는다", () => {
  it("감면 라벨맵이 한 곳뿐이다 — 로컬 복제가 없다", () => {
    expect(scan(/(REDUCTION_TYPE_LABELS|typeLabel)\s*:\s*Record<string, string>\s*=/)).toEqual([]);
  });

  it("`?? entry.type` 같은 raw id 폴백이 없다", () => {
    expect(scan(/\?\?\s*entry\.type/)).toEqual([]);
  });

  it("`MAX_BENEFIT` 리터럴이 표시 문자열에 없다", () => {
    // 코드상 전략 값으로는 남아 있어도 되지만, 백틱 리터럴 안에 있으면 화면에 나간다.
    const hits: string[] = [];
    for (const rel of TARGETS) {
      for (const { line, text } of codeLines(rel)) {
        for (const lit of displayLiterals(text)) {
          if (shownText(lit).includes("MAX_BENEFIT")) hits.push(`${rel}:${line}  ${lit.slice(0, 120)}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});

// ── D-4 산식 풀어쓰기 (#064) ──────────────────────────────────────────
describe("D-4 산식이 한국어 풀어쓰기다", () => {
  it("표시 리터럴에 `floor(`가 없다", () => {
    const hits: string[] = [];
    for (const rel of TARGETS) {
      for (const { line, text } of codeLines(rel)) {
        for (const lit of displayLiterals(text)) {
          if (shownText(lit).includes("floor(")) hits.push(`${rel}:${line}  ${lit.slice(0, 120)}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("표시 리터럴에 변수 약어 `P_A`·`/ D)`가 없다", () => {
    const hits: string[] = [];
    for (const rel of TARGETS) {
      for (const { line, text } of codeLines(rel)) {
        for (const lit of displayLiterals(text)) {
          if (/P_A|\/\s*D\)/.test(shownText(lit))) hits.push(`${rel}:${line}  ${lit.slice(0, 120)}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});

// ── D-5 라벨맵 자체의 완전성 ──────────────────────────────────────────
describe("D-5 감면 라벨맵", () => {
  it("통합 전 두 UI 맵에만 있던 유형이 살아 있다 (축산업·어업)", () => {
    // 🔴 엔진 맵에는 이 둘이 없었다 — 엔진 맵만 옮겼다면 「기타 감면」으로 퇴행했을 것이다.
    expect(REDUCTION_TYPE_LABELS.livestock).toBe("축산업 (§69의2)");
    expect(REDUCTION_TYPE_LABELS.fishing).toBe("어업 (§69의3)");
  });

  it("리뷰가 지목한 미매핑 유형이 전부 한국어 라벨을 갖는다", () => {
    for (const id of [
      "gb_designated_land",
      "replacement_land_comp",
      "rental_97_3",
      "unsold_98_2",
      "new_99_3",
    ]) {
      const label = reductionTypeLabelOf(id);
      expect(label, `${id}가 폴백으로 떨어진다`).not.toBe(UNKNOWN_REDUCTION_LABEL);
      expect(label).not.toBe(id);
    }
  });

  it("미등록 유형은 내부 id가 아니라 한국어 폴백으로 떨어진다", () => {
    expect(reductionTypeLabelOf("some_future_reduction")).toBe(UNKNOWN_REDUCTION_LABEL);
    expect(reductionTypeLabelOf(undefined)).toBe(UNKNOWN_REDUCTION_LABEL);
  });

  it("모든 라벨이 한국어를 담고 내부 id 형태(snake_case)가 아니다", () => {
    for (const [id, label] of Object.entries(REDUCTION_TYPE_LABELS)) {
      expect(label, `${id}의 라벨이 한국어가 아니다`).toMatch(/[가-힣]/);
      expect(label).not.toBe(id);
    }
  });
});
