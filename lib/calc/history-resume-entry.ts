/**
 * 이력 **재계산(편집) 진입** — 목록 카드·상세 드로어 공유 단일 소스 (P4-2b-3)
 *
 * ## 왜 양도세를 넘어 전 세목으로 넓혔는가
 *
 * `transfer-resume-entry.ts`는 2026-09-16에 **양도세만** 한 곳으로 모으고 「다른 세목 분기는
 * 그대로 둔다(폭발 반경 한정)」고 적어 두었다. 그 유보가 남긴 결과가 실측으로 드러났다:
 *
 *   - 드로어의 라우트 맵이 **6/8**이라 주식 2세목은 「편집」 버튼이 아예 없었다.
 *   - 드로어의 `stock_valuation` 재개 분기는 `if (!route) return`에 막혀 **도달 불가**였다.
 *   - 드로어에는 카드에 있는 **부수효과가 통째로 없었다** — 의뢰인 자동선택도,
 *     건물 기준시가 스냅샷 복원도, `editingCalculationId` 정리도.
 *
 * 즉 「한정」은 결함을 막은 게 아니라 **한쪽에 몰아두었다**. 라우트 맵을 정본화하면서
 * 드로어에 주식·판정 경로가 열리므로, 하이드레이션 없이 버튼만 생기는 것을 막으려면
 * 분기도 함께 와야 한다. ⇒ 진입점은 이 함수 하나다.
 *
 * 양도세 분기는 여전히 `resumeTransferRecord`가 전담한다 — 이 파일은 그 위의 얇은 오케스트레이터다.
 *
 * @returns 진입이 차단된 사유(화면에 그대로 띄운다). 정상 진입이면 `null`.
 */
import type { useRouter } from "next/navigation";
import type { CalculationRecord } from "@/lib/storage/types";
import { TAX_TYPE_ROUTES } from "@/lib/storage/tax-type-routes";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { useBuildingStdSnapshotStore } from "@/lib/stores/building-std-snapshot-store";
import { resumeTransferRecord } from "./transfer-resume-entry";

type AppRouter = ReturnType<typeof useRouter>;

export async function resumeCalculationRecord(
  record: CalculationRecord,
  router: AppRouter,
): Promise<string | null> {
  const route = TAX_TYPE_ROUTES[record.taxType];
  // 맵이 전수(`Record<LocalTaxType, …>`)라 원칙상 빈 값이 없다. 구 record의 미지 세목 방어.
  if (!route) return null;

  /**
   * 양도세는 **공유 진입점**이 맡는다 — 단건/다건 라우팅과 공통 부수효과를 그쪽이 함께 처리한다.
   * 여기서 부수효과를 먼저 걸면 두 벌이 된다.
   */
  if (record.taxType === "transfer") {
    return resumeTransferRecord(record, router);
  }

  // v2(contentHash dedup): `editingCalculationId` 플래그 폐기 — 남은 값이 있으면 정리한다.
  sessionStorage.removeItem("editingCalculationId");

  // 세무사 모드 — 이력에 기록된 의뢰인을 자동 활성화해 `ProfessionalClientGate`를 통과시킨다.
  // `clientId`가 null(미지정)이면 건드리지 않는다 — 게이트가 다시 선택을 요구하는 것이 맞다.
  if (record.clientId) {
    useProfessionalStore.getState().setActiveClientId(record.clientId);
  }

  // 건물 기준시가 모달 입력 스냅샷 복원 — 결과탭 「건물 기준시가 계산서」 재유도용(세목 무관).
  const bspSnaps = (record.inputData as { buildingStdSnapshots?: Record<string, unknown> })
    ?.buildingStdSnapshots;
  if (bspSnaps && typeof bspSnaps === "object") {
    const prev = useBuildingStdSnapshotStore.getState().snapshots;
    useBuildingStdSnapshotStore.setState({
      snapshots: { ...prev, ...(bspSnaps as typeof prev) },
    });
  }

  if (record.taxType === "gift") {
    // 증여세 — GiftTaxForm은 자체 useState 기반이라 sessionStorage 경유로 hydrate
    sessionStorage.setItem("giftTaxResumeInput", JSON.stringify(record.inputData));
    router.push(route);
    return null;
  }

  if (record.taxType === "inheritance") {
    // 상속세 — InheritanceTaxForm은 자체 useState 기반이라 sessionStorage 경유로 hydrate
    sessionStorage.setItem("inheritanceTaxResumeInput", JSON.stringify(record.inputData));
    router.push(route);
    return null;
  }

  if (record.taxType === "stock_transfer") {
    const [{ useStockTransferStore }, { buildStockResumeState }] = await Promise.all([
      import("@/lib/stores/calc-wizard-stock-store"),
      import("@/lib/calc/stock-resume-entry"),
    ]);
    /**
     * 🔴 `savedItems`를 **반드시 함께** 쓴다 — 그 목록은 sessionStorage에 영속되므로
     * (`calc-wizard-stock-store.ts:232`) 비우지 않으면 직전 다종목 작업의 종목들이 이
     * 편집에 섞여 합산된다. 다종목 record면 `items`가 목록+편집기로 되돌아온다.
     */
    const { formData, savedItems } = buildStockResumeState(
      record.inputData as Record<string, unknown> | null,
    );
    useStockTransferStore.setState({
      currentStep: 0,
      formData,
      savedItems,
      result: null,
      aggregateResult: null,
      error: null,
    });
    router.push(route);
    return null;
  }

  if (record.taxType === "stock_valuation") {
    const { useStockValuationStore, normalizeStockValuationFormData } = await import(
      "@/lib/stores/calc-stock-valuation-store"
    );
    useStockValuationStore.setState({
      formData: normalizeStockValuationFormData(record.inputData),
    });
    router.push(route);
    return null;
  }

  if (record.taxType === "one_house_exemption") {
    /**
     * 1세대1주택 판정 — 폼만 복원한다.
     *
     * 🔴 `result`는 **되살리지 않는다**. 판정은 법령·세율 기준일에 의존하는데 저장된 결과를
     *    그대로 띄우면 사용자는 그것을 **지금 다시 판정한 값**으로 읽는다. ④에서 재판정한다
     *    (store의 `updateFormData`가 결과를 무효화하는 것과 같은 취지).
     */
    const [{ useOneHouseJudgmentStore }, { normalizeOneHouseJudgmentForm }] = await Promise.all([
      import("@/lib/stores/one-house-judgment-store"),
      import("@/lib/stores/one-house-judgment-form.types"),
    ]);
    useOneHouseJudgmentStore.setState({
      currentStep: 0,
      formData: normalizeOneHouseJudgmentForm(record.inputData),
      result: null,
      error: null,
      isLoading: false,
    });
    router.push(route);
    return null;
  }

  // 취득세·재산세·종부세 — 종전부터 **hydrate 없이 이동만** 한다. 이 PR은 그 동작을 옮겨만 놓는다.
  router.push(route);
  return null;
}
