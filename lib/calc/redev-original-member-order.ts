import { REDEVELOPMENT } from "@/lib/tax-engine/legal-codes/transfer-house";

/**
 * 재개발·재건축 **원조합원** 입력의 날짜 순서 — 종전 부동산 취득일이 관리처분계획 인가일보다 늦으면 원조합원이 아니다 (⑧·⑫ 공용 술어).
 *
 * 「소득세법」 제88조제9호는 조합원입주권을 «관리처분계획의 인가 … 로 인하여 취득한 입주자로 선정된 지위»로 정하고, 그중 정비사업조합의 조합원으로서
 * 취득한 것에 **«그 조합원으로부터 취득한 것»을 포함**한다. 인가일 뒤에 종전 부동산(주택·토지)을 취득한 사람은 조합원으로부터 취득한 승계조합원이고
 * (출자 자산이 주택이든 토지뿐이든 같다), 원조합원은 인가일 현재 종전 부동산을 소유한 조합원이다. 조특법 §99의3은 조특령 §99의3③2호·⑤가
 * «관리처분계획의 인가일 … 현재의 조합원»만 인정해 같은 구분을 명문으로 둔다(2002.1.1. 이후 최초로 조합원 지위를 취득하는 분 —
 * 대통령령 제17458호 부칙 제11조). 현행 §88 9호 신설 전 시기의 정의 조문은 확인 필요.
 *
 * 승계조합원은 «승계조합원 모드»(`redevIsSuccessorMember`)로 고른다 — 이 술어는 그 토글이 꺼져 있는데 날짜가 인가일 뒤인 모순만 가린다.
 * 같은 날(취득일 = 인가일)은 모순이 아니다. ISO(YYYY-MM-DD) 문자열 비교 — Date 변환 없음.
 */
export function redevOriginalMemberAcquiredAfterApproval(a: {
  isSuccessorMember?: boolean;
  acquisitionDate?: string;
  approvalDate?: string;
}): boolean {
  if (a.isSuccessorMember === true) return false;
  if (!a.acquisitionDate || !a.approvalDate) return false;
  return a.approvalDate.slice(0, 10) < a.acquisitionDate.slice(0, 10);
}

/** ⑧ 안내 문구 — 입주권 자산은 «조합원 유형»(`typeToggleSection` = 그 질문이 있는 섹션), 완공 APT는 ②-a 「승계조합원 모드」가 승계를 받는다 */
export function redevOriginalMemberAfterApprovalMessage(label: string, assetKind: string | undefined, typeToggleSection: string): string {
  const remedy =
    assetKind === "right_to_move_in"
      ? `${typeToggleSection}의 「조합원 유형」을 "승계조합원"으로 바꾸세요.`
      : `②-a "승계조합원 모드"를 ON 하세요.`;
  return `${label}: 인가일은 취득일 이후여야 합니다. 관리처분 인가 후 입주권을 승계 취득한 경우 ${remedy} (${REDEVELOPMENT.RIGHT_DEFINITION} · 사전-2019-법령해석재산-0649)`;
}
