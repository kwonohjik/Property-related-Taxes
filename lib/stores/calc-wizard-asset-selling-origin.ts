/**
 * SellingHouseOriginFormSlice — 양도 주택이 **기존주택의 연장**(보유 주택을 헐고 다시 지은 주택·원조합원 기존주택의 완공 주택)인가
 * (「소득세법 시행령」 §155① 종전주택 취득일 · 결정 #43 하위 2 가).
 *
 * 신규 주택 쪽은 명부 행의 `acquisitionOrigin`이 같은 사실을 받는다(`HouseEntry.acquisitionOrigin`). 이 슬라이스는 그 짝으로
 * 양도 주택(`assets[0]`)에 받는다. 모두 선택 입력이라 비우면 「일반 취득」(취득일 그대로)이다 —
 * 노출·적용 게이트는 `lib/calc/selling-house-origin-scope.ts` 한 곳이다.
 */
export interface SellingHouseOriginFormSlice {
  /** 양도 주택이 기존주택의 연장이면 그 갈래. 비어 있으면 일반 취득. */
  sellingHouseRebuildKind?: "self_rebuild" | "original_member_house";
  /** 헐기 전(기존) 주택 취득일 `yyyy-MM-dd` — §155① 종전주택 취득일로 쓴다. */
  sellingHouseExistingAcquisitionDate?: string;
}
