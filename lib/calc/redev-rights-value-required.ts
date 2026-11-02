/**
 * 권리가액(평가액) 필수 — 「소득세법 시행령」 제166조 제1항의 산식은 평가액이 있어야 성립하고, 같은 조 제4항이 평가액을 관리처분계획에 따라 정해진 가격으로 정한다.
 * 그 가격이 없을 때의 산정(같은 항 제2호)은 앱에 구현되어 있지 않으므로 0은 계산을 거절한다(주택 출자 ⑧과 같은 규칙).
 *
 * 토지 출자는 ⑧이 주택 출자 검사 전에 반환해 빈 권리가액이 통과했고, 완공 아파트는 세액 0까지 나왔다.
 * ④ payload 값을 읽어 ⑧·⑫가 같은 술어를 쓴다. 승계조합원은 §166 평가액 칸이 없어(`rightsValue`는 UI 미러) 보지 않는다.
 */
import { REDEVELOPMENT } from "@/lib/tax-engine/legal-codes/transfer-redevelopment";

export const REDEV_RIGHTS_VALUE_REQUIRED_MESSAGE = `권리가액을 입력하세요. 관리처분계획에서 정한 종전 부동산 평가액입니다. (${REDEVELOPMENT.EVALUATION} — 관리처분 가격이 없는 경우는 후속 PR)`;

export function redevRightsValueMissing(v: { rightsValue: number; isSuccessorMember?: boolean }): boolean {
  return v.isSuccessorMember !== true && v.rightsValue <= 0;
}
