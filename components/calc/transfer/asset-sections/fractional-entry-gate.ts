/**
 * 지분 분할(축 B) 진입 차단 사유 — `AssetSectionAcquisition`에서 분리 (2026-09-07 UI 리뷰).
 *
 * ## 왜 목록이 여기 없는가
 *
 * 자산 종류 차단의 **정본은 ⑧**(`lib/calc/transfer-tax-validate.ts:79~131`)이고,
 * 그 목록은 **비어 있다**(`void primaryAsset;`) — 지분 분할을 막던 자산 종류가 전건 열렸다:
 *
 * | 자산 | 열린 날 | 실측 |
 * |---|---|---|
 * | `general_building` | 2026-08-10 | 전용 경로 신설 |
 * | `commercial_building` | 2026-09-03 | ⑩ enum 3종이 진짜 원인이었다 |
 * | 겸용주택 | 2026-09-04 | 축 B 60/40 합계 **152,203,211 = 단건 100%** |
 * | `redevelopment_apt` | 2026-09-04 | 축 B 60/40 합계 **453,700,500 = 단건 100%** |
 *
 * 그런데 UI 토글 B는 그 목록의 **낡은 복제본**을 들고 겸용·상가·재개발을 계속 막았다.
 * 토글 B는 지분 분할 모드의 **유일한 진입점**이라 세 조합이 화면에서 도달 불가였다.
 *
 * 🔴 더 나쁜 것은 Gate-A와의 조합이다 — 겸용·상가 60% 지분 1건을 넣으면
 *   `transfer-tax-validate-asset.ts:183`이 「지분 모드 자산은 단독으로 계산할 수 없습니다.
 *   나머지 지분도 내 것이면 그 지분을 **별도 자산으로 추가**하고…」로 차단하는데,
 *   그 「별도 자산 추가」가 바로 여기서 disabled된 토글 B다. **완전한 dead-end**였다.
 *
 * ⚠️ `right_to_move_in`(입주권)은 종전 목록에 **없어서** 이미 통과했다 — 같은 §166 축에서
 *    재개발APT만 막히는 비대칭이었다. 그 비대칭도 함께 사라진다.
 *
 * ⇒ **UI는 목록을 복제하지 않는다.** 새 종류를 막아야 하면 ⑧에 한 줄 넣고 UI는 그 결과만
 *   반영한다(memory `feedback_ui_engine_dual_truth_avoidance`).
 */

/**
 * 토글 B를 누를 수 없는 사유. `undefined`면 진입 가능.
 *
 * 이미 지분 모드면 차단하지 않는다(끄기는 언제나 허용).
 */
export function fractionalEntryBlockedReason(
  splitMode: string | undefined,
): string | undefined {
  if (splitMode === "fractional") return undefined;
  // 함께양도와는 여전히 동시 사용 불가 — 이것은 자산 종류가 아니라 **모드 간 배타**다.
  if (splitMode === "companion") return "‘함께 양도’ 모드와 동시에 사용할 수 없습니다.";
  return undefined;
}
