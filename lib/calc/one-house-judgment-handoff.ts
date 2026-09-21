/**
 * 판정 메뉴 → 양도세 계산기 **사실 전달** (P5-a)
 *
 * 계획서 `docs/00-pm/one-house-exemption-automation.plan.md` §5.3 · D-3.
 *
 * ## 이 파일이 있는 이유 — 선례가 두 번 갈라졌다
 *
 * 같은 「store 쓰기 + 이동」이 이력 카드와 드로어에 **복제**돼 두 번 결함을 냈다
 * (`transfer-resume-entry.ts` 머리 주석). 판정 → 계산기 진입도 결과 화면·이력·(P5-b의)
 * 불러오기 모달에서 각각 부를 것이므로, **처음부터 한 곳**에 둔다.
 *
 * ## 🔴 두 함수의 차이는 **이동 여부**다
 *
 * | | store | `router.push` |
 * |---|---|---|
 * | `applyOneHouseFactsToTransferForm` | 쓴다 | **안 한다** |
 * | `openTransferWithOneHouseFacts` | 쓴다 | 한다 |
 *
 * 이동하는 쪽을 다건 편집 화면(`MultiTransferSteps.tsx`의 `StepEdit`)에서 부르면 단건 마법사로
 * **튕겨 나간다** — 그 화면은 단건 `<TransferTaxCalculator />`를 그대로 마운트하고 있어서
 * 계산기 store를 공유한다(V-12 실측). 그래서 P5-b의 「판정 불러오기」는 쓰기 전용 쪽을 부른다.
 *
 * ## 🔑 재판정은 여기서 하지 않는다 (D-3)
 *
 * 판정 결과(`OneHouseExemptionResponse`)를 **복사하지 않는다**. 계산기는 사실만 받고
 * 자기 양도일·양도가로 엔진을 다시 돌린다 — `transfer-tax.ts:288`이 판정 메뉴와 **같은**
 * `judgeOneHouseExemptionFromInput`을 부르므로, 사실이 같으면 같은 답이 나오고 양도일을 바꾸면
 * 바뀐 답이 나온다(OH-18). 결과를 실어 나르면 그 순간 dual truth가 된다
 * (`feedback_aggregate_display_rederives_engine_value`).
 */
import type { useRouter } from "next/navigation";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import {
  deriveJudgmentHouseCount,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { oneHouseJudgmentExtraDefaults } from "@/lib/stores/one-house-extra-fields.types";
import type { OneHouseJudgmentExtraFields } from "@/lib/stores/one-house-extra-fields.types";

const TRANSFER_ROUTE = "/calc/transfer-tax";

type AppRouter = ReturnType<typeof useRouter>;

/**
 * 판정 메뉴 폼에서 **§155의2·§155의3 13필드만** 떼어낸다.
 *
 * 🔑 키 목록을 손으로 적지 않고 `oneHouseJudgmentExtraDefaults`에서 뽑는다 — 필드를 하나
 *    더했을 때 이 함수가 **조용히 그것을 빠뜨리는** 것을 막는다. 손 목록이었다면
 *    「판정 메뉴에서는 켰는데 계산기에서는 사라지는」 필드가 생기고, 세액이 달라지는데도
 *    TypeScript는 아무 말도 하지 않는다.
 */
export function pickOneHouseExtraFacts(
  form: OneHouseJudgmentFormData,
): OneHouseJudgmentExtraFields {
  /**
   * 🔑 **기본값 사본에서 출발한다.** 빈 객체에서 채우면 폼에 없는 키가 `undefined`로 남아
   *    「토글은 false여야 하는데 undefined」 같은 상태가 계산기로 넘어간다. 사본에서 시작하면
   *    최악의 경우에도 판정 메뉴의 초기값과 같은 값이 보장된다.
   */
  const out = { ...oneHouseJudgmentExtraDefaults };
  const sink = out as Record<string, unknown>;
  for (const k of Object.keys(out) as (keyof OneHouseJudgmentExtraFields)[]) {
    if (form[k] !== undefined) sink[k] = form[k];
  }
  return out;
}

/**
 * 판정 메뉴 폼 → 계산기 폼 patch.
 *
 * 🔴 **주택 수는 파생값을 확정해 넣는다.** 판정 메뉴는 `householdHousingCount`를 store에 쓰지
 *    않고 명부에서 파생하지만(G-1), 계산기는 그 스칼라를 **직접 읽는다**(⑤ 위젯·⑧ validate·
 *    ④ 변환 전부). 초기값 그대로 넘기면 명부가 2채인데 계산기는 1주택으로 계산한다.
 *
 * 🔑 슈퍼셋에서 추가 13필드는 **평평한 채로 남기지 않고** 운반 상자에 담는다. 그대로 두면
 *    계산기 폼에 사용자가 편집할 수 없는 필드가 13개 늘어나고, ④ 변환이 그것을 직접 읽게 되어
 *    「입력 위젯 없는 필드」와 「넘겨받은 사실」의 구분이 사라진다.
 */
export function toTransferFormPatch(
  form: OneHouseJudgmentFormData,
  judgmentId?: string,
): Partial<TransferFormData> {
  const extras = new Set(Object.keys(oneHouseJudgmentExtraDefaults));
  const base = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(form)) {
    if (!extras.has(k)) base[k] = v;
  }
  return {
    ...(base as Partial<TransferFormData>),
    householdHousingCount: String(deriveJudgmentHouseCount(form)),
    assets: withMirroredSalePrice(form),
    importedOneHouseFacts: pickOneHouseExtraFacts(form),
    ...(judgmentId ? { sourceJudgmentId: judgmentId } : {}),
  };
}

/**
 * 🔴 **양도가액을 자산-수준으로 내려 쓴다** — 계산기의 불변식이 그것을 요구한다.
 *
 * 판정 메뉴는 예상 양도가액을 **폼-전역 `contractTotalPrice`** 에만 쓴다
 * (`one-house-exemption/steps/Step3.tsx`). 그런데 계산기는 단일 자산 모드에서
 * `assets[0].actualSalePrice`를 **원본**으로 보고 거기서 `contractTotalPrice`를 **다시 쓴다**
 * (`app/calc/transfer-tax/steps/Step1.tsx:134` `updateAssets`).
 *
 * ⇒ 전역 값만 넘기면, 계산기에서 자산 카드를 **한 번이라도 건드리는 순간**(소재지 선택 등)
 *   그 미러가 빈 `actualSalePrice`로 덮어써 **양도가액이 조용히 사라진다**. E2E HO-2가
 *   실제로 그렇게 깨졌다 — 스토어에는 9억이 들어갔는데 다음 단계에서 「총 양도가액을
 *   입력하세요」가 떴다.
 *
 * 🔑 판정 메뉴 쪽을 고치지 않는다. `buildOneHouseExemptionApiBody`가 `contractTotalPrice`를
 *    읽는 것은 계산기 ④와 **같은 필드를 읽기 위한** 의도된 선택이다(그 파일 주석). 두 폼을
 *    잇는 자리인 **여기서** 계산기 규약에 맞춰 준다.
 *
 * 🔑 자산이 여럿이면 손대지 않는다 — 그때는 계산기도 미러를 돌리지 않고(`splitMode` 분기),
 *    자산별 금액이 각자의 원본이다.
 */
function withMirroredSalePrice(form: OneHouseJudgmentFormData): TransferFormData["assets"] {
  const assets = form.assets ?? [];
  if (assets.length !== 1 || !form.contractTotalPrice) return assets;
  const [a] = assets;
  return [{ ...a, actualSalePrice: a.actualSalePrice || form.contractTotalPrice }];
}

/**
 * 계산기 폼에 판정 사실을 **쓰기만** 한다 (이동 없음).
 *
 * P5-b의 「판정 불러오기」가 이것을 부른다. 다건 편집 화면에서도 안전하다.
 */
export async function applyOneHouseFactsToTransferForm(
  form: OneHouseJudgmentFormData,
  judgmentId?: string,
): Promise<void> {
  const { useCalcWizardStore } = await import("@/lib/stores/calc-wizard-store");
  useCalcWizardStore.getState().updateFormData(toTransferFormPatch(form, judgmentId));
}

/**
 * 계산기 폼에 판정 사실을 쓰고 **양도세 계산기로 이동**한다.
 *
 * 🔑 `setStep(0)`으로 1단계부터 열어 준다 — 판정 메뉴가 묻지 않은 취득가액·필요경비를
 *    계산기가 받아야 세액이 나온다. 결과 단계로 바로 보내면 0원 취득가액으로 계산된 세액을
 *    사용자가 완성된 답으로 오해한다.
 */
export async function openTransferWithOneHouseFacts(
  form: OneHouseJudgmentFormData,
  router: AppRouter,
  judgmentId?: string,
): Promise<void> {
  const { useCalcWizardStore } = await import("@/lib/stores/calc-wizard-store");
  const { updateFormData, setStep } = useCalcWizardStore.getState();
  updateFormData(toTransferFormPatch(form, judgmentId));
  setStep(0);
  router.push(TRANSFER_ROUTE);
}
