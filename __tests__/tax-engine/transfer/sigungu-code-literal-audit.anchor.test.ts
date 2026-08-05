/**
 * 시·군·구 코드 리터럴 **전수 대조** anchor — 계획서 §6-G.3.
 *
 * ## 왜 이 anchor가 필요한가
 *
 * 지금까지 이 계열로 결함이 **9건** 나왔다(D-1~D-9). 원인은 전부 같다 —
 * 손으로 적은 5자리 코드가 행정구역 개편으로 낡았는데, 코드가 **문자열**이라
 * 불일치가 타입·예외로 드러나지 않고 「해당 없음」으로 **조용히 흡수**된다.
 *
 * 개별 결함을 하나씩 고치는 것으로는 재발을 막지 못한다(D-4를 고친 다음 날 D-5가,
 * 그 다음 D-6~D-9가 나왔다). 그래서 **코드 리터럴 자체를 검사 대상**으로 삼는다:
 * 프로젝트가 갖고 있는 모든 시·군·구 코드는 다음 셋 중 하나여야 한다.
 *
 *   1. 현행 테이블(`sigungu-codes.json` 256건)에 존재         ← 정상
 *   2. 별칭 테이블의 `legacy`                                  ← 개편 전 코드, 조회부가 흡수
 *   3. `INTENTIONAL_LEGACY` 예외                               ← 별칭으로 못 잇는 N:M 재편
 *
 * 어디에도 없으면 **오타이거나 미처리 개편**이다. D-6(연천군 `41810` — 실제 `41800`)이
 * 정확히 그 경우였고, 같은 저장소의 `population-decline-areas.ts`는 `41800`으로
 * 맞게 적혀 있었는데도 3년 가까이 아무도 몰랐다.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { SIGUNGU_CODES } from "@/lib/korean-law/sigungu-codes";
import { JEONNAM_GWANGJU_ALIASES, JEONBUK_ALIASES } from "@/lib/geo/sigungu-code-alias";
import ABOLISHED from "@/lib/geo/abolished-sigungu-codes.json";

/**
 * 시·군·구 코드 리터럴을 담고 있는 파일. **새 파일이 생기면 여기에 추가**한다.
 *
 * 목록이 낡는 것을 막기 위해 아래 `AUDIT-4`가 "5자리 리터럴이 밀집한 파일"을
 * 저장소에서 다시 훑어 이 목록에 빠진 것이 없는지 확인한다.
 */
const AUDITED_FILES = [
  "lib/tax-engine/data/regulated-areas-data.ts",
  "lib/tax-engine/data/population-decline-areas.ts",
  "lib/tax-engine/multi-house-surcharge-count.ts",
  "lib/tax-engine/legal-codes/surcharge-transition.ts",
] as const;

/**
 * 현행에 없지만 **의도적으로 유지**하는 구 코드.
 *
 * 별칭(`sigungu-code-alias.ts`)은 `legacy → current` **1:1**만 표현한다.
 * 아래는 재편이 1:N·N:M이라 5자리로는 이을 수 없어 데이터 파일에 구·신 엔트리를
 * **함께** 두는 경우다. 저장된 이력·수동 입력이 구 코드로 남아 있어 지울 수도 없다.
 */
const INTENTIONAL_LEGACY: Record<string, string> = {
  // 인천 자치구 재편 (2026-07-01 · N:M 분할·병합) — 계획서 §6-F
  "28110": "인천 중구(폐지) → 제물포구·영종구로 분할",
  "28140": "인천 동구(폐지) → 제물포구로 병합",
  "28260": "인천 서구 → 서해구 개칭 + 검단구 분리",
  // 경기 일반구 신설 (1:N) — 계획서 §6-G
  "41190": "부천시 → 원미·소사·오정구 신설",
  "41590": "화성시 → 만세·효행·병점·동탄구 신설",
};

/**
 * 주석 전용 줄인가.
 *
 * 감사 대상은 **데이터**이지 설명이 아니다. 실제로 D-6 수정 주석은
 * 「종전에 `"41810"`이라 적혀 있었다」를 인용하는데, 그걸 결함으로 잡으면
 * 결함의 내력을 기록할 수 없게 된다. 데이터 엔트리가 주석 전용 줄에 오는 일은 없다.
 */
const isCommentOnly = (text: string): boolean => /^\s*(\/\/|\/\*|\*)/.test(text);

/** 파일에서 5자리 시·군·구 코드를 뽑는다(10자리 법정동코드는 앞 5자리). */
function extractSigunguCodes(relPath: string): { code: string; line: number }[] {
  const src = fs.readFileSync(path.join(process.cwd(), relPath), "utf-8");
  const out: { code: string; line: number }[] = [];
  src.split("\n").forEach((text, i) => {
    if (isCommentOnly(text)) return;
    for (const m of text.matchAll(/"(\d{5})(?:\d{5})?"/g)) {
      out.push({ code: m[1], line: i + 1 });
    }
  });
  return out;
}

const CURRENT = new Set(SIGUNGU_CODES.map((s) => s.code));
const LEGACY = new Set([...JEONNAM_GWANGJU_ALIASES, ...JEONBUK_ALIASES].map((a) => a.legacy));

describe("시·군·구 코드 리터럴 전수 대조 (계획서 §6-G.3)", () => {
  it("AUDIT-1: 모든 코드 리터럴이 현행·별칭·의도적 예외 중 하나에 속한다", () => {
    const orphans: string[] = [];
    for (const file of AUDITED_FILES) {
      for (const { code, line } of extractSigunguCodes(file)) {
        if (CURRENT.has(code)) continue;
        if (LEGACY.has(code)) continue;
        if (code in INTENTIONAL_LEGACY) continue;
        // 🔴 폐지 코드는 **허용하지 않는다** — 진단만 붙인다. D-6의 `41810`은 실재했던
        //    코드(폐지된 「경기도 포천군」)라 허용하면 그대로 통과해, 연천군(`41800`)
        //    자리에 포천군 코드가 적힌 결함을 놓친다(계획서 Y-5).
        const wasReal = (ABOLISHED as Record<string, string>)[code];
        orphans.push(
          `${file}:${line} — "${code}" ` +
            (wasReal ? `(한때 「${wasReal}」 — 폐지됨)` : "(어느 시점에도 없던 코드)"),
        );
      }
    }
    // 실패 시 메시지가 곧 조치 목록이 되도록 전건을 나열한다.
    expect(orphans, `현행 테이블·별칭·예외 어디에도 없는 코드:\n${orphans.join("\n")}`).toEqual([]);
  });

  it("AUDIT-5: 폐지 코드 진단 자료가 살아 있다 (D-6 사례로 자가 확인)", () => {
    // `abolished-sigungu-codes.json`이 비거나 낡으면 AUDIT-1의 실패 메시지가 조용히
    // 「어느 시점에도 없던 코드」로 뭉개진다 — 실제 결함 사례로 자료 자체를 고정한다.
    const map = ABOLISHED as Record<string, string>;
    expect(Object.keys(map).length).toBeGreaterThan(200);
    expect(map["41810"]).toBe("경기도 포천군"); // D-6이 연천군(41800) 자리에 잘못 적었던 코드
    expect(map["28110"]).toBe("인천광역시 중구"); // D-5 인천 재편으로 폐지
    // 현행 코드는 폐지 목록에 들어 있으면 안 된다 — 코드 재사용 오탐 방지
    expect(map["41800"]).toBeUndefined(); // 연천군(현행)
    expect(map["11680"]).toBeUndefined(); // 강남구(현행)
  });

  it("AUDIT-2: 별칭의 current는 전부 현행 테이블에 있다", () => {
    const bad = [...JEONNAM_GWANGJU_ALIASES, ...JEONBUK_ALIASES]
      .filter((a) => !CURRENT.has(a.current))
      .map((a) => `${a.legacy} → ${a.current} (${a.name})`);
    expect(bad, `별칭이 가리키는 현행 코드가 테이블에 없다:\n${bad.join("\n")}`).toEqual([]);
  });

  it("AUDIT-3: 의도적 예외는 현행 테이블에 **없어야** 한다 (되살아나면 예외를 지워야 함)", () => {
    // 개편이 번복되거나 코드가 재사용되면 예외를 남겨둘 이유가 사라진다.
    const revived = Object.keys(INTENTIONAL_LEGACY).filter((c) => CURRENT.has(c));
    expect(revived, `현행에 되살아난 코드 — INTENTIONAL_LEGACY에서 제거할 것: ${revived}`).toEqual([]);
  });

  it("AUDIT-4: 감사 대상 목록에 빠진 파일이 없다", () => {
    // `AUDITED_FILES`가 낡으면 이 anchor가 조용히 무력해진다 —
    // 코드 리터럴이 밀집한 파일을 다시 훑어 목록 누락을 잡는다.
    const roots = ["lib/tax-engine", "lib/geo", "lib/korean-law"];
    const DENSITY_THRESHOLD = 3; // 5자리 리터럴 3건 이상이면 코드 테이블로 본다
    const found: string[] = [];

    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) {
          const code = fs
            .readFileSync(path.join(process.cwd(), rel), "utf-8")
            .split("\n")
            .filter((l) => !isCommentOnly(l))
            .join("\n");
          if ([...code.matchAll(/"\d{5}(?:\d{5})?"/g)].length >= DENSITY_THRESHOLD) found.push(rel);
        }
      }
    };
    roots.forEach(walk);

    const known = new Set<string>([
      ...AUDITED_FILES,
      // 코드 테이블 자체 · 별칭 정의부는 감사 주체이지 대상이 아니다.
      "lib/geo/sigungu-code-alias.ts",
      "lib/korean-law/sigungu-codes.ts",
      "lib/geo/sigungu-code-list.ts",
      // 5자리이지만 시·군·구 코드가 아닌 것들
      "lib/tax-engine/data/building-standard-price/building-register-map.ts", // 건물 용도 코드
      "lib/tax-engine/data/factory-area-rates.generated.ts", // KSIC 세세분류 코드(「공장입지 기준고시」 별표1)
    ]);
    const missing = found.filter((f) => !known.has(f));
    expect(missing, `감사 대상에 넣거나 예외로 명시할 것:\n${missing.join("\n")}`).toEqual([]);
  });
});
