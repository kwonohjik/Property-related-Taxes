/**
 * 건물 기준시가 스냅샷이 **현재 폼 상태에서도 유효한가** — 계산서 노출 게이트 (단일 소스).
 *
 * ## 왜 필요한가
 *
 * 소속 판정은 `idOfSnapshotKey` + `JSON.stringify(inputData).includes(id)` 뿐이라
 * **자산이 존재하기만 하면** 계산서가 나온다. 그 스냅샷을 만든 **조건이 아직 성립하는지**는
 * 아무도 보지 않았다. 실측(2026-08-24): 재개발 취득일을 2003 → 2010으로 정정해 §164⑦
 * 트리거가 풀려도 「재개발 환산 §164⑦」 계산서 2장이 계속 찍혔다.
 *
 * ## 왜 store 삭제가 아니라 표시 게이트인가
 *
 * 스냅샷 스토어에는 `replaceSnapshotsByPrefix` 외에 삭제 API가 없고, 트리거는 **날짜 비교라는
 * 파생 조건**이라 변화를 감지하려면 `useEffect → store` 미러링이 필요하다 — 금지 정책이다.
 * 게다가 날짜를 되돌리면(오타 정정) 계산서가 그냥 돌아와야 하는데 삭제는 재계산을 강요한다.
 * 순수 술어로 거르면 입력이 조건을 다시 만족하는 순간 자동 복귀한다.
 *
 * ## 소비처 (드리프트 방지 — 둘이 같아야 한다)
 *
 *  · `BuildingStdPriceReportSection` — 결과탭 렌더
 *  · `use-auto-save-calculation`의 `extractRelevantBuildingStdSnapshots` — 이력 저장 동봉
 *    (서버 PDF는 여기서 추린 것만 받으므로 자동으로 따라온다)
 *
 * 계획서: `docs/00-pm/redev-phd-snapshot-staleness-gate.plan.md`
 */
import { isRedevPhdSectionActive } from "@/lib/calc/redev-phd-trigger";
import { idOfSnapshotKey } from "@/lib/calc/building-std-snapshot-keys";

function matchAsset(list: unknown, assetId: string): Record<string, unknown> | undefined {
  if (!Array.isArray(list)) return undefined;
  return list.find(
    (a): a is Record<string, unknown> =>
      !!a && typeof a === "object" && (a as { assetId?: unknown }).assetId === assetId,
  );
}

/**
 * inputData에서 assetId가 일치하는 자산을 찾는다. 구조가 다르면 undefined.
 *
 * 🔴 **두 가지 폼 모양을 모두 봐야 한다.**
 *  · 단건 양도 — `{ assets: [...] }` (`TransferTaxResultView` 등)
 *  · **다건 양도** — `{ __multiTransfer: true, ...MultiTransferFormData }`이고 자산은
 *    `properties[].form.assets`에 있다(`MultiTransferTaxCalculator.tsx:330`).
 *
 * 다건을 빠뜨리면 이 게이트가 **저장 경로에서 조용히 no-op**이 된다 — 화면
 * (`MultiTransferTaxResultView`는 `{ assets: allAssets }`를 넘긴다)에서는 계산서가 사라지는데
 * IndexedDB·서버 PDF에는 stale 스냅샷이 남아 **화면↔PDF가 어긋난다**(2026-08-24 리뷰 지적).
 */
function findAsset(
  inputData: Record<string, unknown>,
  assetId: string,
): Record<string, unknown> | undefined {
  const direct = matchAsset((inputData as { assets?: unknown }).assets, assetId);
  if (direct) return direct;
  const properties = (inputData as { properties?: unknown }).properties;
  if (!Array.isArray(properties)) return undefined;
  for (const p of properties) {
    if (!p || typeof p !== "object") continue;
    const form = (p as { form?: unknown }).form;
    if (!form || typeof form !== "object") continue;
    const hit = matchAsset((form as { assets?: unknown }).assets, assetId);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * 이 스냅샷을 계산서로 내보내도 되는가.
 *
 * ⚠️ **판정 대상이 아닌 키는 항상 `true`**(현행 동작 유지)다. 키마다 성립 조건이 다르므로
 *    (gb 증축 토글·cb 분리취득·phd 배치…) 한꺼번에 걸지 않는다. 필요해지면 아래에 케이스를
 *    **하나씩** 추가하고 그때마다 anchor를 붙일 것 — 과잉 차단은 「계산했는데 계산서가 없다」는
 *    반대 방향 결함이 된다.
 */
export function isBuildingStdSnapshotApplicable(
  key: string,
  inputData: Record<string, unknown>,
): boolean {
  // 재개발 §164⑦ PHD 환산 — 트리거가 꺼지면 그 계산은 적용되지 않는다.
  if (/-redev-phd$/.test(key)) {
    const asset = findAsset(inputData, idOfSnapshotKey(key));
    // 자산을 못 찾으면 판정 불능 — 소속 판정(`includes(id)`)이 이미 통과시킨 상태이므로
    // 여기서 새로 막지 않는다(구조가 다른 inputData·이력 복원분 방어).
    if (!asset) return true;
    /**
     * 판정 근거 필드가 아예 없으면 통과시킨다.
     *
     * ⚠️ **현재 앱 경로에서는 이 가드가 발화하지 않는다** — 마이그레이션
     * (`calc-wizard-asset-migrate.ts:622`)과 팩토리(`calc-wizard-asset-factory.ts:469`)가
     * 모든 자산에 `redevFirstDisclosureDate: ""`를 백필하고, 결과뷰의 `formData`는 전부
     * 그 스토어를 거친다. 즉 구버전 이력도 키가 `""`로 존재한 채 도착한다(2026-08-24 리뷰 실측).
     *
     * 그래도 남기는 이유는 이 함수가 **저장된 `input_data`를 직접 받는 경로**(서버 PDF·이력)도
     * 상대하기 때문이다. 그쪽은 스토어를 거치지 않으므로 스키마 보증이 없다.
     * 빈 문자열("")과 키 부재는 다르다 — 사용자가 최초공시일을 지우면 값은 ""로 남고 키는
     * 존재하므로 그건 정상 차단 대상이다(`in` 연산자여야 하는 이유).
     */
    if (!("redevFirstDisclosureDate" in asset)) return true;
    // 트리거(모드+날짜)만이 아니라 **섹션 가시성 5중 게이트** 전체를 본다 —
    // 승계조합원·자산종류 변경·§164⑤ 분기 전환도 이 계산을 무효로 만든다.
    return isRedevPhdSectionActive(asset);
  }
  return true;
}
