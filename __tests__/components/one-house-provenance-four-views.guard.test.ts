/**
 * P5-b-1 가드 — 출처 한 줄이 **결과뷰 4종 전부**에 배선돼 있는가
 *
 * ## 왜 정적 스캔인가
 *
 * 양도세 결과뷰는 4종이고 **공유 헤더가 없다**. 「같은 것을 4곳에 붙인다」를 잊는 것이
 * 이 파일들에 기록된 **실패 이력**이다(실측):
 *
 *   · `BuildingStdPriceReportSection` — 커밋 4건에 나눠 들어갔고, 일괄 뷰 누락이
 *     **사용자 제보로** 발견됐다(`BundledAllocationCard.tsx` 주석 — 2026-08-11).
 *   · `DisclaimerBanner` — 겸용·일괄이 2026-09-07에 **사후 결함 수정**으로 채워졌다.
 *
 * 렌더 테스트로는 이걸 못 지킨다 — 4종을 각각 마운트하려면 엔진 결과 픽스처 4벌이 필요하고,
 * 그중 하나를 빠뜨리면 **가드 자체가 그 뷰를 안 보게 된다**(`feedback_anchor_excluded_axis_is_unguarded`).
 * ⇒ 소스를 직접 읽어 **4종 전건**을 센다.
 *
 * 🔑 파일 목록을 **하드코딩**한다. 글롭으로 「결과뷰처럼 생긴 것」을 모으면 4번째가
 *    `BurdenedTransferTaxResultCard`(하위 카드)로 잘못 잡힌다 — 실제 4번째는
 *    `BundledAllocationCard`(일괄)다(계획서 §26.6 실측).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** 양도세 결과뷰 **4종** — 이 목록이 정본이다. */
const VIEWS = {
  단건: "components/calc/results/TransferTaxResultView.tsx",
  다건: "components/calc/results/MultiTransferTaxResultView.tsx",
  겸용: "components/calc/results/mixed-use/MixedUseResultCard.tsx",
  일괄: "components/calc/results/BundledAllocationCard.tsx",
} as const;

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

/**
 * 주석을 지운 소스.
 *
 * 🔴 이 저장소의 결과뷰 주석에는 `<PrintSection id="...">` 같은 **태그 문자열이 설명으로**
 *    들어 있다(단건 뷰의 「렌더 게이트」 주석). 원문 그대로 세면 열림 1 · 닫힘 0이 되어
 *    「열린 래퍼 안에 있다」는 오탐이 난다 — 실제로 이 가드가 그렇게 한 번 빨개졌다.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("출처 한 줄 — 결과뷰 4종 전건 배선", () => {
  it.each(Object.entries(VIEWS))(
    "[FV-1] %s 뷰가 OneHouseJudgmentProvenanceLine을 렌더한다",
    (_label, path) => {
      const src = read(path);
      expect(src).toContain("OneHouseJudgmentProvenanceLine");
      // import만 하고 안 쓰는 상태를 배제한다 — JSX 렌더 지점이 있어야 한다.
      expect(src).toMatch(/<OneHouseJudgmentProvenanceLine\b/);
    },
  );

  /**
   * 🔑 **`PrintSection` 밖이어야 한다.** 출처는 사용자가 끄고 켤 서식이 아니라 고지다.
   *    안에 넣으면 미선택 시 인쇄물에서 빠져, 종이에 남은 세액의 근거가 사라진다.
   */
  it.each(Object.entries(VIEWS))(
    "[FV-2] %s 뷰에서 출처는 PrintSection 안에 있지 않다",
    (_label, path) => {
      const src = stripComments(read(path));
      const idx = src.indexOf("<OneHouseJudgmentProvenanceLine");
      expect(idx).toBeGreaterThan(-1);
      // 렌더 지점 앞에서 **아직 닫히지 않은** PrintSection이 있으면 그 안이다.
      const before = src.slice(0, idx);
      const unclosed =
        (before.match(/<PrintSection\b/g) ?? []).length -
        (before.match(/<\/PrintSection>/g) ?? []).length;
      expect(unclosed, `${path}: 출처 한 줄이 열린 PrintSection 안에 있다`).toBe(0);
    },
  );

  /**
   * 🔴 **다건은 `properties[0]`에서 뽑지 않는다.** 건마다 출처가 다를 수 있고, 같은 자리에서
   *    `firstProperty` 하나만 본 것이 이미 #054·#093 결함이었다(그 뷰의 주석이 기록).
   */
  it("[FV-3] 다건은 건별로 렌더한다 (첫 건 단정 금지)", () => {
    const src = read(VIEWS.다건);
    const idx = src.indexOf("<OneHouseJudgmentProvenanceLine");
    const near = src.slice(Math.max(0, idx - 400), idx);
    expect(near).toContain("properties");
    expect(near).toContain(".map(");
    // 첫 건만 보는 변수를 출처에 쓰지 않는다.
    expect(src.slice(idx, idx + 300)).not.toContain("firstProperty");
  });

  /**
   * 🔑 **술어는 공용이다.** 뷰가 조건을 손으로 쓰면 「단건엔 뜨는데 겸용엔 안 뜨는」 상태가
   *    조용히 생긴다(§5.9 ②). 컴포넌트 내부가 술어를 부르고, 다건만 목록 필터에 추가로 쓴다.
   */
  it("[FV-4] 렌더 조건은 손으로 쓰지 않는다 — 공용 술어를 쓴다", () => {
    const shared = read("components/calc/results/transfer/OneHouseJudgmentProvenanceLine.tsx");
    expect(shared).toContain("hasJudgmentProvenance");
    for (const [label, path] of Object.entries(VIEWS)) {
      const src = read(path);
      // 뷰가 `sourceJudgmentId`를 직접 만지면 술어가 두 벌이 된 것이다.
      expect(src.includes("sourceJudgmentId"), `${label}(${path})`).toBe(false);
    }
  });
});
