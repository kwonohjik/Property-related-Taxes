/**
 * 양도세 이력 **재계산(편집) 진입** — 카드·드로어 공유 단일 소스.
 *
 * 계획서: `docs/00-pm/history-resume-multi-record-misroute.plan.md`
 *
 * ## 왜 헬퍼로 뺐는가
 *
 * 같은 기능이 목록 카드(`app/history/HistoryClient.tsx`)와 상세 드로어
 * (`components/history/HistoryDetailDrawer.tsx`)에 **복제**돼 있었고, 이미 두 번 갈라져
 * 결함을 냈다:
 *   - 2026-09-07 — 목록의 「편집」만 `migrateAsset`을 빠뜨렸다.
 *   - 2026-09-16 — **양쪽 다** 다건 record를 단건 마법사로 보냈다(아래).
 * 부수효과(의뢰인 자동선택·건물 기준시가 스냅샷 복원·`editingCalculationId` 정리)도
 * 카드에만 있었다. ⇒ 양도세 분기를 한 곳으로 모은다. **다른 세목 분기는 그대로 둔다**
 * (계획서 §5 안 C — 폭발 반경을 양도세로 한정).
 *
 * ## 종전 결함 (Playwright probe 실측)
 *
 * 다건 record를 편집하면 단건 마법사로 갔다. `updateFormData`는 단순 merge인데 다건
 * `inputData`에는 `assets`가 없어 **아무것도 덮이지 않고** 직전 단건 세션이 그대로 남았고,
 * 그 위에 다건 record의 **정정 플래그가 주입**됐다(`amendmentMode`·`correctionKind`…).
 * 경정청구 모드는 당초 결정세액을 차감하므로 **세액이 바뀐다**.
 *
 * ⚠️ 정정 필드명이 단건과 같은 것은 **의도된 설계**다 — `AmendmentBlock`을 폼 캐스팅으로
 *    재사용하기 위한 전제(`multi-transfer-tax-store.ts`). 그 일치를 되돌리는 방향으로
 *    고치면 안 된다. 결함은 「그 폼을 단건 store에 부어도 되는가」 쪽에 있었다.
 */
import type { useRouter } from "next/navigation";
import type { CalculationRecord } from "@/lib/storage/types";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { useBuildingStdSnapshotStore } from "@/lib/stores/building-std-snapshot-store";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";

const TRANSFER_ROUTE = "/calc/transfer-tax";
const MULTI_TRANSFER_ROUTE = "/calc/transfer-tax/multi";

type AppRouter = ReturnType<typeof useRouter>;

/** 구 stub(자산 폼 미저장) 다건 record 차단 사유 — 화면에 그대로 쓴다 */
const STUB_REASON =
  "저장된 자산 입력값이 없어 편집할 수 없습니다. 구 버전에서 저장된 다건 계산이라 " +
  "각 자산의 입력 내용이 남아 있지 않습니다. 결과는 상세 보기에서 확인할 수 있습니다.";

/**
 * 이 `inputData`는 **다건(연간 합산) 폼**인가.
 *
 * ⚠️ `classifyAmendableTransfer`를 재사용하지 말 것 — 그쪽은 **`resultData`** 기준이다.
 *    재계산 진입이 물어야 하는 것은 「무엇을 hydrate할 것인가」, 즉 **`inputData`의 모양**이다.
 *    목적이 다른 두 축이라, 재사용하면 구 버전 record에서 조용히 갈라진다.
 *
 * 다건 자동저장은 `{ __multiTransfer: true, ...form }`으로 저장한다
 * (`MultiTransferTaxCalculator`의 `autoSaveInput`). 그 플래그 이전 저장분을 위해
 * `properties` 배열 존재도 함께 본다 — **안전측 superset**(단건 폼에는 `properties`가 없다).
 */
export function isMultiTransferInput(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const o = input as Record<string, unknown>;
  return o.__multiTransfer === true || Array.isArray(o.properties);
}

/** 다건 폼이 자산별 입력(`properties[].form`)을 실제로 들고 있는가 */
function hasRestorableProperties(input: unknown): boolean {
  const props = (input as { properties?: Array<{ form?: unknown }> } | null)?.properties;
  return Array.isArray(props) && props.length > 0 && props.every((p) => !!p?.form);
}

/**
 * 이력 record로 양도세 마법사에 재진입한다.
 *
 * @returns 차단 사유. `null`이면 진입 성공(호출부는 사유를 화면에 그대로 띄운다).
 */
export async function resumeTransferRecord(
  record: CalculationRecord,
  router: AppRouter,
): Promise<string | null> {
  if (record.taxType !== "transfer") return null;
  const input = record.inputData ?? {};
  const isMulti = isMultiTransferInput(input);

  // 🔑 차단은 **부수효과보다 먼저** — 되돌아갈 화면의 store를 더럽히지 않는다.
  if (isMulti && !hasRestorableProperties(input)) return STUB_REASON;

  // ── 공통 부수효과 (종전에는 카드에만 있었다) ──
  if (typeof window !== "undefined") {
    // v2(contentHash dedup): 편집 플래그 폐기. 동일 입력+결과면 저장 시 원본을 update한다.
    sessionStorage.removeItem("editingCalculationId");
  }
  // 세무사 모드 — 이력에 기록된 의뢰인을 자동 활성화해 ProfessionalClientGate를 우회한다.
  if (record.clientId) {
    useProfessionalStore.getState().setActiveClientId(record.clientId);
  }
  // 건물 기준시가 모달 입력 스냅샷 복원 — 결과탭 「건물 기준시가 계산서」 재유도용.
  const bspSnaps = (input as { buildingStdSnapshots?: Record<string, unknown> })
    .buildingStdSnapshots;
  if (bspSnaps && typeof bspSnaps === "object") {
    const prev = useBuildingStdSnapshotStore.getState().snapshots;
    useBuildingStdSnapshotStore.setState({
      snapshots: { ...prev, ...(bspSnaps as typeof prev) },
    });
  }

  if (isMulti) {
    const { useMultiTransferStore } = await import("@/lib/stores/multi-transfer-tax-store");
    /**
     * 🔑 **정정 플래그는 저장된 그대로 복원한다.** 「편집」은 *그 신고서를 다시 여는 것*이라
     *    수정신고였으면 수정신고인 채로 열려야 한다.
     *    ⚠️ 합산 진입(`enterMultiAggregate`)은 **반대**다 — 그쪽은 새 확정신고라 기본값에서
     *       시작한다. 두 진입의 의미가 다르므로 규칙도 달라야 한다.
     * 단계만 자산 목록으로 돌려 편입 결과를 먼저 확인시킨다.
     */
    useMultiTransferStore.getState().setForm({
      ...(input as unknown as MultiTransferFormData),
      activeStep: "list",
      activePropertyIndex: 0,
    });
    router.push(MULTI_TRANSFER_ROUTE);
    return null;
  }

  const [{ useCalcWizardStore }, { migrateAsset }] = await Promise.all([
    import("@/lib/stores/calc-wizard-store"),
    import("@/lib/stores/calc-wizard-asset"),
  ]);
  const { updateFormData, setStep } = useCalcWizardStore.getState();
  /**
   * ⚠️ 이력 assets는 **migrate를 통과시켜야 한다** — `updateFormData`는 단순 merge라 assets
   *    배열이 통째로 교체된다. 이 경로만 우회하면 옛 이력의 신규 필드 디폴트 누락과 파생 면적의
   *    부동소수점 잔재가 그대로 엔진에 도달한다(잔재는 `floor(단가 × 면적)`을 1원 깎는다).
   *    2026-09-07에 목록 카드에서 한 번 빠졌던 축이다.
   */
  const form = input as Parameters<typeof updateFormData>[0];
  const migrated = Array.isArray(form?.assets)
    ? { ...form, assets: form.assets.map((a) => migrateAsset({ ...a })) }
    : form;
  updateFormData(migrated);
  setStep(0);
  router.push(TRANSFER_ROUTE);
  return null;
}
