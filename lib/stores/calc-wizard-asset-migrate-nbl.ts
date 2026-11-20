/**
 * NBL2611-B1 복원 정규화 — `migrateAsset`(800줄 정책)에서 분리. 이력·sessionStorage 복원 자산에 호출한다. `a`를 직접 변형한다.
 *
 * · V1-A `nblOtherPropertyTaxBasis`·`nblOtherDemolishedFloorArea` — 구 이력에는 칸이 없다 → 미선택·빈 값(근거 미선택 = 종합합산 + 확인 필요, 종전 세액과 같다).
 * · Q-12 `nblVillaNoUseConfirmed` — 구 이력에는 칸이 없다 → 미확인(false). 별장 사용기간 0행이면 ⑧이 확인을 요구한다.
 * · Q-10 (나) 레거시 「거주·사업 직접 관련」(`nblOtherIsRelatedToResidence`) — 현재 화면에서는 켤 수 없는 칸인데 구 이력에
 *   남아 «호 미설정 시 사업용» fallback(엔진 OR)으로 판정을 덮었고, 호 「해당 없음」 명시까지 이겼다. 「모름 = 혜택 불성립 +
 *   확인 필요」(2026-10-04) 원칙에 따라 false로 정규화하고, 호가 비어 있던 이력에는 「호 재선택」 고지 표지를 세운다.
 *   표지는 사용자가 호를 고르면 화면이 끈다(`OtherLandDetailSection` onChange — useEffect 미러링 아님).
 *   호가 이미 실제 호(해당 없음 제외)면 boolean은 결과에 영향이 없던 값이라 조용히 false로만 접는다.
 */
export function migrateNblB1Fields(a: Record<string, unknown>): void {
  // NBL2611-V1-A (Q-1) — 구 이력에는 «재산세 분류 근거» 칸이 없다 → 미선택. 건축물 없는 토지의 비종합합산 선언은 종전에도 종합합산이었고(PR#291 override)
  // 이제 «근거 미선택 → 종합합산 + 확인 필요»로 읽혀 세액은 그대로다. 사용자가 근거를 고르면 그 근거로 판정한다.
  if (a.nblOtherPropertyTaxBasis === undefined) a.nblOtherPropertyTaxBasis = "";
  if (a.nblOtherDemolishedFloorArea === undefined) a.nblOtherDemolishedFloorArea = "";
  if (a.nblVillaNoUseConfirmed === undefined) a.nblVillaNoUseConfirmed = false;
  if (a.nblOtherLegacyRelatedReselect === undefined) a.nblOtherLegacyRelatedReselect = false;
  if (a.nblOtherIsRelatedToResidence === true) {
    const ho = a.nblOtherRelatedBusinessType;
    if (ho === undefined || ho === "" || ho === "none") a.nblOtherLegacyRelatedReselect = true;
    a.nblOtherIsRelatedToResidence = false;
  }
}
