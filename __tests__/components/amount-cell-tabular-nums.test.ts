/**
 * 정적 가드 — **금액 셀에는 `tabular-nums`가 있어야 한다** (RU-1).
 *
 * `components/calc/CLAUDE.md:176`이 정한 규칙은 「모든 표·신고서·보고서 **공통**」이다:
 * 금액(원) 셀은 `text-right font-mono tabular-nums whitespace-nowrap`.
 * `font-mono`만으로는 부족하다 — 비례폭 숫자는 자릿수가 세로로 어긋나 천·백만·십억
 * 콤마가 어긋난 채 쌓인다.
 *
 * 🔴 신설 이유 (critic:rules, 2026-09-10):
 *   규칙은 전 세목 공통인데 **자동 가드는 양도세 신고서 한 곳**(`ui-review-batch3.anchor`
 *   R08)뿐이었다. 실측하니 금액 셀 **170행**이 `font-mono`만 달고 있었다 — 상속 채무안분·
 *   비상장주식 평가표·비사업용 토지 판정 카드·별지서식 재현까지 전 세목에 걸쳐 있었다.
 *   규칙이 있는데 관문이 좁으면 「실질 관문이 없는」 것과 같다(lint가 상시 실패 CI에만
 *   있던 것과 같은 실패 — 루트 CLAUDE.md).
 *
 * ## 무엇을 「금액 셀」로 보는가
 *
 * `font-mono`가 붙은 전 구역(775행)이 대상이 아니다. 아래 둘 중 하나만 대상이다:
 *   (a) 같은 줄 또는 바로 다음 줄이 **수치를 렌더**한다
 *       (`toLocaleString(`·`formatKRW(`·`toFixed(`·`fmt(` 등)
 *   (b) 같은 줄에 `text-right`가 있다 — 규약이 정한 금액 칸 형태다
 *
 * 단, 같은 줄에서 JSX 자식이 **완결**되는데 그 자식이 비수치면 제외한다
 * (`>{label}</span>` — 라벨은 금액 칸이 아니다). 이 예외가 없으면 라벨 span까지 끌려온다.
 *
 * ⛔ 대상 밖: 법령 조문 문자열(`{reasoning.legalBasis}`)·주민번호 입력칸·`/law` 검색 결과
 *    헤더·가이드 페이지의 산식 코드블록. `font-mono`를 «코드체»로 쓰는 자리이지 금액 칸이
 *    아니다. 이들에까지 규약 4클래스를 강제하면 규칙의 의미가 흐려진다.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) {
      if (name !== "node_modules") walk(rel, out);
    } else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

/** 수치 렌더 호출 — 금액·비율·면적·일수 모두 자릿수 정렬 대상이다. */
const RENDERS_NUMBER = /toLocaleString\(|formatKRW\(|formatKrw\(|toFixed\(|\bfmt\(|\bnum\(|\bwon\(|\bcomma\(/;

/** 같은 줄에서 완결된 JSX 자식 `>{...}<` 을 뽑는다. 없으면 null. */
export function closedChild(line: string): string | null {
  const m = line.match(/>\{([^}]*)\}</);
  return m ? m[1] : null;
}

/** 그 줄이 규약상 「금액 셀」인가 — 위 (a)·(b) 판정. */
export function isAmountCell(line: string, nextLine: string): boolean {
  if (!/font-mono/.test(line)) return false;
  const child = closedChild(line);
  if (child !== null) {
    // 자식이 같은 줄에서 끝났다 — 그 자식이 수치일 때만 금액 칸이다.
    return RENDERS_NUMBER.test(child) || /\d/.test(child);
  }
  return RENDERS_NUMBER.test(line + "\n" + nextLine) || /text-right/.test(line);
}

interface Site {
  file: string;
  line: number;
  text: string;
}

const violations: Site[] = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    if (/__tests__|\.test\.|\.spec\./.test(file)) continue;
    const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/tabular-nums/.test(line)) return;
      if (!isAmountCell(line, lines[i + 1] ?? "")) return;
      violations.push({ file, line: i + 1, text: line.trim().slice(0, 120) });
    });
  }
}

describe("금액 셀 자릿수 정렬 — font-mono에는 tabular-nums가 따라온다", () => {
  it("🔴 tabular-nums 없는 금액 셀이 0건이다 (components/calc/CLAUDE.md:176)", () => {
    const msg = violations.map((v) => `  ${v.file}:${v.line}\n    ${v.text}`).join("\n");
    expect(
      violations,
      `tabular-nums 누락 ${violations.length}건:\n${msg}`,
    ).toHaveLength(0);
  });
});

describe("가드 자체의 구별력 — 규칙이 실제로 무언가를 잡는가", () => {
  it("🔑 수치를 렌더하는 font-mono 셀을 잡는다", () => {
    expect(isAmountCell('<dd className="font-mono">{formatKRW(x)}</dd>', "")).toBe(true);
    expect(isAmountCell('<td className="text-right font-mono">', "  {v}")).toBe(true);
  });

  it("🔑 라벨은 잡지 않는다 — 같은 줄에서 끝난 비수치 자식", () => {
    expect(isAmountCell('<span className="font-mono text-micro w-16">{label}</span>', "")).toBe(
      false,
    );
    expect(isAmountCell('<dd className="font-mono">{reasoning.legalBasis}</dd>', "")).toBe(false);
  });

  it("🔑 font-mono를 «코드체»로 쓰는 자리는 잡지 않는다", () => {
    // /law 가이드의 산식 코드블록 — 자식이 다음 줄에도 수치가 아니다.
    expect(
      isAmountCell('<div className="rounded-lg border bg-muted/30 p-5 font-mono text-sm">', "  양도가액 − 취득가액"),
    ).toBe(false);
  });

  it("🔑 font-mono가 아예 없으면 대상이 아니다", () => {
    expect(isAmountCell('<dd className="text-right">{formatKRW(x)}</dd>', "")).toBe(false);
  });

  it("🔑 이미 tabular-nums가 있는 줄은 위반 집계에서 빠진다", () => {
    const line = '<dd className="font-mono tabular-nums">{formatKRW(x)}</dd>';
    expect(isAmountCell(line, "")).toBe(true); // 셀이긴 하다
    expect(/tabular-nums/.test(line)).toBe(true); // 그래서 위반은 아니다
  });
});
