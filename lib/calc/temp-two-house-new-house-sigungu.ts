/**
 * §155⑯ 「신규 주택」 소재 시·군 코드 — **보유 주택 목록에서 도출한 신규 주택 행의 주소가 정본**이다.
 *
 * 신규 주택은 같은 화면의 명부 행(`resolveTemporaryTwoHouse` → `newHouseRegionCode`)으로 이미 특정된다. ⑯ 위젯의 별도
 * 「신규 주택 소재지」 칸은 같은 사실을 두 번째로 받는 칸이라, 비우면 엔진이 자기선언을 그대로 믿어 비연접에도 5년이 적용됐고
 * (서초 신규 주택 · 세종 이전 → 비과세), 명부를 고쳐도 그 칸은 그대로 남았다(2026-11-12 리뷰 C-1).
 * 증여세 부담부증여 경로는 이미 소재지 코드에서 파생한다(`gift-burdened-temp-two-house.ts`) — 같은 규칙으로 맞춘다.
 *
 * 행에 주소가 없을 때만(직접 선언 경로·주소 미입력 행) ⑯ 칸 값을 쓴다.
 * ④(`buildHouseholdSpecialPayload`) · ⑤ 판정 카드(`judgmentTempTwoHouseVerdict`) · ⑤ 연접 안내(`Step2.tsx`)가 이 함수 하나를 쓴다.
 */
import { extractSigunguCodeFromPnu } from "@/lib/geo/pnu-sigungu";

export function resolveTempTwoHouseNewHouseSigunguCode(
  formNewHouseSigunguCode: string | undefined,
  derivedNewHouseRegionCode: string | undefined,
): string | undefined {
  return extractSigunguCodeFromPnu(derivedNewHouseRegionCode || undefined) ?? (formNewHouseSigunguCode || undefined);
}
