/**
 * 「소득세법 시행령」 §155⑯ 지역 요건 화면 판정 — 「해당 공공기관 또는 법인이 이전한 시ㆍ군 또는 이와 연접한
 * 시ㆍ군의 지역에 소재하는 경우」(MST 286211 실독).
 *
 * 2026-09-29 E-1 한계(e1z) G3: 판정 메뉴 `Step2.tsx`의 `useMemo` 본문을 그대로 옮겼다(문구·분기 불변). 증여세
 * 부담부증여 양도 경로도 같은 카드(`TempTwoHouseDeadlineExceptionInputs`)를 쓰므로 판정이 한 곳이어야 한다.
 * 엔진은 같은 두 코드로 따로 판정한다(`meetsPublicInstitutionRelocationRegion`) — 이 함수는 화면 안내용이다.
 */
import { getAdjacentSigunguCodes } from "@/lib/geo/administrative-district-adjacency";

/** §155⑯ 연접 판정 결과 — 두 소재지 코드가 모두 있을 때만 결론을 낸다(없으면 null). */
export interface RelocationRegionVerdict {
  ok: boolean;
  reason: string;
}

export function judgeRelocationRegion(p: {
  publicInstitutionRelocation: boolean | undefined;
  relocatedSigunguCode: string | undefined;
  newHouseSigunguCode: string | undefined;
}): RelocationRegionVerdict | null {
  if (!p.publicInstitutionRelocation) return null;
  const from = p.relocatedSigunguCode;
  const to = p.newHouseSigunguCode;
  if (!from || !to) return null;
  if (from === to) {
    return { ok: true, reason: "이전한 시·군에 신규 주택이 소재합니다 — 지역 요건 충족." };
  }
  const adjacent = getAdjacentSigunguCodes(from);
  if (adjacent.length === 0) {
    return {
      ok: true,
      reason:
        "이전지의 연접 시·군 정보가 없어 자동 판정할 수 없습니다 — 입력하신 선택을 유지합니다.",
    };
  }
  return adjacent.includes(to)
    ? { ok: true, reason: "이전한 시·군과 연접한 시·군에 소재합니다 — 지역 요건 충족." }
    : {
        ok: false,
        reason:
          "이전한 시·군과 연접하지 않습니다 — §155⑯ 지역 요건 미충족으로 처분기한 5년이 적용되지 않습니다.",
      };
}
