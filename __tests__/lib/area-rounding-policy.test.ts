/**
 * 정적 가드 — **면적 반올림은 `round2()`다**. 인라인 `parseFloat(x.toFixed(2))` 금지 (RU-2).
 *
 * `components/calc/CLAUDE.md:177`이 이미 「인라인 `parseFloat(x.toFixed(2))` 신규 작성 금지」로
 * 못박았지만 **강제하는 것이 없었다**. 실측하니 4곳이 남아 있었고, 그중 하나는
 * `transfer-tax-expropriation-valuation.ts`의 **환산 분모**였다.
 *
 * ## 두 형태는 결과가 다르다
 *
 * `round2(a) = Math.round(a * 100) / 100`은 십진 스케일 값을, `parseFloat(a.toFixed(2))`는
 * 이진 배정도 실제값을 반올림한다. `8.045`는 double이 `8.04499…`라 전자는 `8.05`,
 * 후자는 `8.04`다. `x.xx5` 10만 개 전수에서 **43,412건(43.4%)** 갈린다.
 * 면적은 단가와 곱해지므로 그대로 세액에 닿는다.
 *
 * 「소수 셋째 자리에서 반올림」의 실무적 뜻은 `8.045 → 8.05`이므로 `round2`가 정본이다.
 *
 * ## ⛔ 대상 밖 — 백분율 표시 포매터
 *
 * `parseFloat((r * 100).toFixed(2))` 형태는 **면적 안분이 아니라 % 문자열 조립**이다
 * (별지 제9호 부표2의 안분비율 칸). 단가와 곱해지지 않고 표시로만 끝나므로 이 규칙의
 * 대상이 아니다. 규칙을 여기까지 넓히면 「면적」이라는 규칙의 뜻이 흐려진다.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { round2 } from "@/lib/tax-engine/area-utils";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "lib"];

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
 * 인라인 반올림 호출을 «형태 열거» 없이 잡는다 — 종전 스캔이 `parseFloat(x.toFixed(2))`만
 * 보는 좁은 문자군을 써서 `parseFloat((a + b).toFixed(2))`를 놓쳤다
 * (memory `feedback_enumerate_forms_vs_conservative_superset`).
 * 여기서는 괄호 안 내용을 묻지 않고 `parseFloat(` … `.toFixed(2))` 를 통째로 잡는다.
 */
export function inlineRound2Calls(line: string): string[] {
  return [...line.matchAll(/parseFloat\((.*?)\.toFixed\(2\)\)/g)].map((m) => m[1]);
}

/** 백분율 포매터인가 — 인자에 `* 100`이 있거나 대상이 pct/ratio 계열 이름이다. */
export function isPercentFormatter(arg: string, line: string): boolean {
  return /\*\s*100/.test(arg) || /\bpct\b|\bpercent\b|\bratio\b/i.test(arg) || /%`/.test(line);
}

interface Site {
  file: string;
  line: number;
  text: string;
}

const violations: Site[] = [];
const exempt: Site[] = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    if (/__tests__|\.test\.|\.spec\./.test(file)) continue;
    readFileSync(join(ROOT, file), "utf8")
      .split("\n")
      .forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*")) return; // 주석이 규칙을 «인용»한다
        for (const arg of inlineRound2Calls(line)) {
          const site = { file, line: i + 1, text: t.slice(0, 120) };
          if (isPercentFormatter(arg, line)) exempt.push(site);
          else violations.push(site);
        }
      });
  }
}

describe("면적 반올림 정책 — round2()만 쓴다", () => {
  it("🔴 인라인 parseFloat(x.toFixed(2))가 0건이다 (components/calc/CLAUDE.md:177)", () => {
    const msg = violations.map((v) => `  ${v.file}:${v.line}\n    ${v.text}`).join("\n");
    expect(violations, `인라인 면적 반올림 ${violations.length}건:\n${msg}`).toHaveLength(0);
  });

  it("🔒 백분율 포매터 예외는 3건 이하 (줄이기만 한다)", () => {
    expect(exempt.length).toBeLessThanOrEqual(3);
  });
});

describe("가드 자체의 구별력 — 규칙이 실제로 무언가를 잡는가", () => {
  it("🔑 단순 형태를 잡는다", () => {
    expect(inlineRound2Calls("const a2 = parseFloat(area.toFixed(2));")).toEqual(["area"]);
  });

  it("🔑 «괄호 안 식» 형태도 잡는다 — 종전 스캔이 놓친 형태", () => {
    expect(inlineRound2Calls("return parseFloat((excl + shared).toFixed(2));")).toEqual([
      "(excl + shared)",
    ]);
    expect(inlineRound2Calls("String(parseFloat((a / b).toFixed(2)))")).toEqual(["(a / b)"]);
  });

  it("🔑 백분율 포매터는 면제한다", () => {
    const line = "const pct = (r: number) => `${parseFloat((r * 100).toFixed(2))}%`;";
    const [arg] = inlineRound2Calls(line);
    expect(isPercentFormatter(arg, line)).toBe(true);
  });

  it("🔑 round2()는 잡지 않는다", () => {
    expect(inlineRound2Calls("const a2 = round2(area);")).toHaveLength(0);
  });

  it("🔑 [근거] 두 형태가 실제로 다르다 — 규칙이 스타일이 아니다", () => {
    expect(round2(8.045)).toBe(8.05);
    expect(parseFloat((8.045).toFixed(2))).toBe(8.04);
  });
});
