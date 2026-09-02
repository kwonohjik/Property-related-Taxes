/**
 * 감면 조문 인벤토리 개수 anchor (D9-08)
 *
 * 주석·UI 문구가 「23개」로 고정돼 실측(24개)과 어긋나 있었다. 「23」은 Phase 1 최초
 * 커밋 시점(엔트리 22개)에도 실측과 일치한 적이 없는 **프로젝트 명칭성 라벨**이 복사된
 * 것이고, 이후 §77의2(replacement_land_comp)·§77의3(gb_designated_land) 동시 추가로
 * 22 → 24가 됐다.
 *
 * 개수를 쓰는 로직·테스트가 저장소에 하나도 없어(리뷰 grep 실측) 드리프트를 잡을
 * 안전망이 0이었다. 이 anchor가 그 안전망이다 — 조문을 늘리면 여기서 먼저 깨지고,
 * 그때 아래 「동기화 지점」의 서술 개수도 함께 갱신해야 한다.
 *
 * 동기화 지점(개수를 서술하는 곳 — 이 테스트가 깨지면 함께 고칠 것):
 *   - lib/tax-engine/CLAUDE.md (디렉터리 트리)
 *   - lib/tax-engine/transfer-reductions/{types,metadata,period-check,index}.ts 헤더
 *   - lib/api/transfer-tax-schema-{sub,reductions,rental}.ts 헤더
 *   - components/calc/transfer/UnifiedReductionPanel.tsx 헤더 · components/calc/CLAUDE.md
 *   - app/calc/transfer-tax/steps/Step5.tsx 안내 배너 (사용자 노출)
 *
 * ⚠ 날짜가 박힌 이력 표현(「Phase 1 (2026-05-06): 23개 조문 인벤토리」 등)은 그 시점의
 *   기록이므로 갱신 대상이 아니다.
 */
import { describe, it, expect } from "vitest";
import {
  ALL_REDUCTION_IDS,
  REDUCTION_METADATA,
} from "@/lib/tax-engine/transfer-reductions/metadata";

describe("D9-08 감면 조문 인벤토리 개수", () => {
  it("D9-08-1: ALL_REDUCTION_IDS는 24개다 (주석·UI 문구의 정본)", () => {
    expect(ALL_REDUCTION_IDS.length).toBe(24);
  });

  it("D9-08-2: 카테고리 내역은 rental 6 + new_housing 4 + unsold_housing 10 + standalone 4", () => {
    const byCategory: Record<string, number> = {};
    for (const id of ALL_REDUCTION_IDS) {
      const category = REDUCTION_METADATA[id].category;
      byCategory[category] = (byCategory[category] ?? 0) + 1;
    }
    expect(byCategory).toEqual({
      rental: 6,
      new_housing: 4,
      unsold_housing: 10,
      standalone: 4,
    });
  });

  it("D9-08-3: §77의2·§77의3은 standalone에 실재한다 (22 → 24로 늘어난 두 건)", () => {
    expect(ALL_REDUCTION_IDS).toContain("replacement_land_comp");
    expect(ALL_REDUCTION_IDS).toContain("gb_designated_land");
    expect(REDUCTION_METADATA.replacement_land_comp.category).toBe("standalone");
    expect(REDUCTION_METADATA.gb_designated_land.category).toBe("standalone");
  });

  it("D9-08-4: ID 중복이 없다 (개수 단언이 중복으로 부풀지 않음을 보장)", () => {
    expect(new Set(ALL_REDUCTION_IDS).size).toBe(ALL_REDUCTION_IDS.length);
  });

  it("D9-08-5: 전건 isFullyImplemented — 「Phase 2 구현 예정」 서술은 사실이 아니다", () => {
    const notImplemented = ALL_REDUCTION_IDS.filter(
      (id) => !REDUCTION_METADATA[id].isFullyImplemented,
    );
    expect(notImplemented).toEqual([]);
  });
});
