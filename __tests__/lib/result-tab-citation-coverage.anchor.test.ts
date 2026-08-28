/**
 * anchor: **결과탭이 화면에 인쇄하는 법령 인용이 개정 감시 모수 안에 있다**
 * (결과탭 코드리뷰 Lane 1 · L2 — #088).
 *
 * ## 무엇이 비어 있었나
 *
 * `npm run verify:legal`의 커버리지 게이트(`legal-verification-coverage-complete.test.ts`)는
 * `collectCitedCitations()` — 즉 **`lib/tax-engine/legal-codes/*` 모듈만** 본다.
 * 결과탭 컴포넌트가 직접 쓴 인용 문자열은 그 모수에 없어서, 그 조문이 개정돼도
 * 아무도 알려주지 않는다. 그 문자열은 `parseCitations`가 읽어 **조문 모달 링크**를 만들므로
 * 틀리면 사용자가 관련 없는 조문을 열게 된다.
 *
 * ## ⚠️ 리뷰의 처방(「43곳을 상수화」)은 채택하지 않았다 — 실측이 전제를 뒤집었다
 *
 * 착수 전 실측(`components/calc/results/**`):
 *
 * | 항목 | 실측 |
 * |---|---|
 * | 인용 리터럴(고유) | 115 |
 * | 조문 키(고유) | **99** |
 * | 그중 엔진 legal-codes 모수에 **이미 있는 것** | **90 (91%)** |
 * | 진짜 모수 밖 | **9** |
 *
 * 리터럴 출현은 166~299회지만 **조문 단위로는 9개만 새고 있었다** — 나머지는 엔진 상수가
 * 같은 조문을 이미 인용해 감시 중이다. 그래서 166곳을 `${TRANSFER.X}`로 바꾸는 리팩터는
 * 회귀 위험(한국어 산문·산식 템플릿 안에 박힌 문자열)에 비해 얻는 것이 없다.
 * **모수를 넓히는 이 게이트가 목적을 100% 달성한다.**
 *
 * ## 그 9개를 파헤치니 결함 2건이 나왔다 (리뷰에 없던 것)
 *
 * 1. **중복배제 조항을 「의2」가 붙은 조문으로 인용**했다 — 조특법에 그런 조문은 존재하지
 *    않는다(KoreanLaw NOT_FOUND). 정본은 §127⑦: 「거주자가 토지등을 양도하여 둘 이상의
 *    양도소득세의 감면규정을 동시에 적용받는 경우에는 그 거주자가 선택하는 하나의 감면규정만을
 *    적용한다」. 이 인용은 다건 결과뷰의 **카드 제목**에 인쇄됐다.
 * 2. **지방세 감면·결정세액의 근거로 개인지방소득세 장 전체를 범위 인용**했다 — 그 시작
 *    조문은 「세율」로 **종합소득·퇴직소득**의 표준세율표라 양도소득분과 무관하고, 결정세액
 *    행이 인용한 조문은 「과세표준」이었다. 정본은 §103의3(세율)·§103의4(세액공제 및 세액감면).
 *
 * 두 리터럴의 금지 규칙은 저장소 전역 감사 anchor
 * (`__tests__/tax-engine/transfer/redev-citation-literal-audit.anchor.test.ts` L1-15·L1-16)에
 * 둔다 — **금지 리터럴 보관처는 한 곳이어야 한다.** 여기에 복제했더니 이 파일 자신이
 * 그 규칙을 위반해 빨개졌다(실측).
 *
 * ## ⚠️ 세 번째 후보는 **내 오판이었다** — 실측이 뒤집었다
 *
 * 「「조」가 겹친 표기(`§NNN조의M`)는 파서가 상위 조문으로 읽는다」고 판정했다가 파서를 직접
 * 재서 철회했다. `parseCitations`는 두 표기를 **동일하게** 옳게 읽는다. 가짜 갭은
 * **이 파일의 초안 정규식**이 「조」를 못 넘어 앞부분만 잘라낸 탓이었다. 저장소의 지배적
 * 표기는 오히려 「조 겹침」쪽이다(`§114조의2` 142곳 · `§176조의2` 102곳).
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { computeCoverageGap } from "@/lib/legal-verification/coverage";

const ROOT = process.cwd();
const SCAN_DIR = "components/calc/results";

/** 이 파일 자신은 정정 이력 표에 옛 인용을 담고 있으므로 스캔 대상이 아니다. */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (rel.endsWith(".ts") || rel.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

/**
 * 「법령명 §조」 꼴 인용을 뽑는다.
 *
 * ⚠️ 약칭(조특법·상증법)까지 포함해야 한다 — 결과탭은 두 표기를 섞어 쓴다.
 *    `LAW_ALIAS`에 없는 이름은 `articleKeys`가 알아서 버린다.
 *
 * ⚠️ **`§114조의2`처럼 「조」가 들어간 표기를 반드시 함께 받아야 한다.** 초안은 `§\d+(의\d+)?`
 *    라 `§103조의3`에서 **`§103`만** 잘라내 「지방세법 제103조 미등록」이라는 **가짜 갭**을
 *    만들었다. 실측으로 확인했다 — `parseCitations`는 `§103조의3`·`§103의3`을 **둘 다**
 *    「제103조의3」으로 옳게 읽는다. 결함은 코드가 아니라 이 스캐너에 있었다.
 */
const CITE =
  /(?:소득세법|조세특례제한법|조특법|국세기본법|국세징수법|지방세법|지방세특례제한법|농어촌특별세법|상속세 및 증여세법|상증법)(?:\s*시행령|\s*시행규칙)?\s*§\s*\d+(?:조)?(?:의\d+)?/g;

const FILES = walk(SCAN_DIR);
const LITERALS = (() => {
  const found = new Set<string>();
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const m of src.matchAll(CITE)) found.add(m[0].replace(/\s+/g, " ").trim());
  }
  return [...found];
})();

describe("결과탭 인용 조문이 개정 감시 모수 안에 있다 (#088)", () => {
  it("AUDIT-0: 스캔이 실제로 파일을 읽었다 (모수가 0이면 게이트가 조용히 통과한다)", () => {
    expect(FILES.length).toBeGreaterThan(40);
    expect(LITERALS.length).toBeGreaterThan(80);
  });

  it("🔴 결과탭이 인용하는 조문이 전부 VERIFICATION_MANIFEST에 등록돼 있다", () => {
    const gap = computeCoverageGap(LITERALS);
    expect(
      gap.uncovered,
      `\n미등록 조문 ${gap.uncovered.length}건 — 「lib/legal-verification/manifest/」에 등록하거나,\n` +
        `현행에 부재하는 조문이면 「coverage.ts」의 KNOWN_ABSENT_ARTICLES에 이유와 함께 넣을 것.\n` +
        gap.uncovered.map((k) => `  ${k}`).join("\n"),
    ).toEqual([]);
  });

});
