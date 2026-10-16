/**
 * 첫 자산이 바뀔 때 알릴 «양도하는 주택에 대한 선언» 묶음 — 순수 헬퍼 (Q-5).
 * 계획서 `docs/00-pm/first-asset-change-step4-facts-notice.plan.md` §3 · §4.
 *
 * 보유 상황 단계(Step4)의 일부 입력은 **자산이 아니라 폼 전역**에 저장되고 ④가 그 값을 주 자산(첫 자산)에만 싣는다.
 * 첫 자산을 지우면 지운 자산 기준으로 입력된 선언이 새 첫 자산의 사실로 읽힌다(실측: 12개 묶음 중 11개).
 * 값은 건드리지 않는다 — 삭제 시점에 «값이 있던 묶음»을 마커에 스냅샷하고, 카드가 그 묶음 중 지금도 값이 있는 것만 알린다.
 *
 * ⚠️ 제외한 것(계획서 §2·§3): 거주기간(자산 객체에 있어 자산과 함께 사라진다) · 미등기(#2223 처리) · 세대·개인·거래 값.
 *    폼 전역 키 전수가 «이 묶음 / 제외 목록» 중 정확히 한 곳에 있음을 `first-asset-facts.anchor.test.ts`가 고정한다.
 */
import type {
  FirstAssetChangeNote,
  FirstAssetFactGroupId,
  TransferFormData,
} from "@/lib/stores/calc-wizard-form.types";
import { calcFinalHouseRestartInScope } from "./final-house-restart";
import { isHousingLike, isOneHouseExemptionAsset } from "./housing-like-asset";
import type { AssetRemovalPatch } from "./asset-removal";

export interface FirstAssetFactGroup {
  id: FirstAssetFactGroupId;
  label: string;
  /** 어디서 확인하는가 — 카드의 안내 문구 */
  where: string;
  /** 이 묶음이 ④ 본문으로 보내는 폼 전역 키 전부(커버리지 가드용) */
  keys: readonly (keyof TransferFormData)[];
  /** 값이 있으면 «선언했다»로 보는 키(나머지는 세부 값이라 사유가 비면 ④가 보내지 않는다) */
  declaredBy: readonly (keyof TransferFormData)[];
}

export const FIRST_ASSET_FACT_GROUPS = [
  {
    id: "regulated",
    label: "조정대상지역 여부(취득 당시·양도 당시)",
    where: "② 1세대1주택 비과세 판정에서 확인",
    keys: ["isRegulatedArea", "wasRegulatedAtAcquisition"],
    declaredBy: ["isRegulatedArea", "wasRegulatedAtAcquisition"],
  },
  {
    id: "proviso",
    label: "§154① 단서 사유",
    where: "② 1세대1주택 비과세 판정에서 확인",
    keys: [
      "provisoReason", "provisoDepartureDate", "provisoDepartureOnlyHouse", "provisoExpropriationDate",
      "provisoBusinessApprovalDate", "provisoRentalLeaseResidenceMonths", "provisoPreContractNoHouse",
      "proviso4hoBusinessRegDate", "proviso4hoRentalRegDate", "proviso4hoRegulatedOneHouse", "proviso4hoStatus",
      "proviso4hoDuringMandatory", "proviso4hoRentOver5", "proviso4hoRentOver5ContractDate", "proviso4hoGiftSeparated",
    ],
    declaredBy: ["provisoReason"],
  },
  {
    id: "finalRestart",
    label: "최종 1주택 재기산 처분 이력(§154⑤ 단서)",
    where: "② 1세대1주택 비과세 판정에서 확인",
    keys: ["finalHouseRestartHistory", "finalHouseRestartDisposals"],
    declaredBy: ["finalHouseRestartHistory", "finalHouseRestartDisposals"],
  },
  {
    id: "merge",
    label: "합가 특례(혼인·동거봉양)",
    where: "③ 합가 특례에서 확인",
    keys: ["marriageDate", "parentalCareMergeDate", "parentalCareParentAge"],
    declaredBy: ["marriageDate", "parentalCareMergeDate"],
  },
  {
    id: "inheritGeneral",
    label: "상속주택 특례의 일반주택 사실",
    where: "④ 주택수 판정에서 확인",
    keys: [
      "generalHouseGiftedFromDecedentWithin2yr", "generalHouseGiftDate", "generalHouseRightAtInheritance",
      "inheritedRightChoiceWhenBothHeld",
    ],
    declaredBy: ["generalHouseGiftedFromDecedentWithin2yr", "inheritedRightChoiceWhenBothHeld"],
  },
  {
    id: "declared",
    label: "판정 메뉴에서 넘겨받았거나 옛 기록에 남은 특례 선언(일시적 2주택·대체주택·농어촌주택·문화유산주택·입주권 예외 등)",
    where: "이 화면에는 입력칸이 없습니다 — 판정 메뉴 값입니다",
    keys: [
      "temporaryTwoHouseSpecial", "newHouseAcquisitionDate", "newHouseOriginKind", "newHouseRightAcquisitionDate",
      "newHouseRightApprovalDate", "publicInstitutionRelocation", "relocatedInstitutionJibun", "relocatedSigunguCode",
      "newHouseJibun", "newHouseSigunguCode", "newHouseRegulatedAtAcquisition", "prevHouseRegulatedAtNewAcquisition",
      "newHouseContractDate", "newHouseMoveInDate", "newHouseExistingTenant", "newHouseTenantLeaseEndDate",
      "disposalDelayReason", "disposalDelayDisposedByThatMethod",
      "unavoidableOutsideCapitalSpecial", "unavoidableOutsideCapitalReason", "unavoidableOutsideCapitalResolvedDate",
      "ruralHouseSpecial", "ruralHouseKind", "ruralHouseOutsideCapitalEupMyeon", "ruralHouseJibun", "ruralHouseRegionCode",
      "ruralHouseDecedentResidenceYears", "ruralHouseOwnerResidenceYears", "ruralHouseAcquisitionDate",
      "ruralHouseHighPriceAtAcquisition", "ruralHouseLandAreaSqm", "ruralHouseWholeHouseholdMoved",
      "replacementHouseSpecial", "replBusinessApprovalDate", "replCompletionDate", "replSoldBeforeCompletion",
      "replResidenceMonths", "replWillResideNewHouse",
      "rightThreeYearExceptionKind", "rightNewHouseCompletionDate", "rightMovedInWithin3Years",
      "rightResidedOneYearOrMore", "rightDisposalDelayReason", "rightDisposedByThatMethod",
      "mergedHouseholdFirstHouseKind", "mergedHouseholdAcquiredAfterApproval", "mergedHouseholdResidedOneYear",
      "mergedHouseholdOwnedBeforeRight", "culturalHeritageHouseSpecial", "isFirstTransferredInMerge",
    ],
    declaredBy: [
      "temporaryTwoHouseSpecial", "newHouseAcquisitionDate", "publicInstitutionRelocation", "disposalDelayReason",
      "unavoidableOutsideCapitalSpecial", "ruralHouseSpecial", "replacementHouseSpecial",
      "rightThreeYearExceptionKind", "mergedHouseholdFirstHouseKind", "culturalHeritageHouseSpecial",
      "isFirstTransferredInMerge",
    ],
  },
] as const satisfies readonly FirstAssetFactGroup[];

/** 묶음 id → 정의. `find`로 찾고 없으면 던진다 — id 유니온과 목록이 어긋나면 `anchor` 가드가 먼저 잡는다. */
export function firstAssetFactGroupOf(id: FirstAssetFactGroupId): FirstAssetFactGroup {
  const g = FIRST_ASSET_FACT_GROUPS.find((x) => x.id === id);
  if (!g) throw new Error(`알 수 없는 묶음: ${id}`);
  return g;
}

/** 값이 «선언됨»인가 — 빈 문자열·false·빈 배열·«해당 없음»(`none`)은 선언이 아니다. */
function isDeclared(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "string") return v.trim() !== "" && v !== "none";
  if (Array.isArray(v)) return v.length > 0;
  return false;
}

/**
 * 지금 **첫 자산의 사실로 읽히는** 선언이 있는 묶음.
 *
 * 게이트는 ④가 같은 값을 본문에 싣는 조건과 맞춘다(3중 패턴):
 *  - `regulated` — ④는 소재지 코드(자산 → 폼 전역 폴백)가 있으면 저장된 토글이 아니라 주소 판정값을 싣는다 → 코드가 없을 때만.
 *    Step4가 §154① 판정 대상이 아닌 자산이면 이 토글을 지운다(`Step4.tsx:267-291`) → 판정 대상 자산일 때만.
 *  - `finalRestart` — `calcFinalHouseRestartInScope`(④·⑤·⑧ 공용).
 *  - 그 밖 — 주택류 자산(`isHousingLike`).
 *  - `proviso`는 노출 맥락(`provisoGate`)이 Step4 안에서만 계산돼 호출부가 `gates.proviso`로 넘긴다(삭제 시점 스냅샷은 생략 = 값만 본다).
 */
export function firstAssetFactGroups(
  form: TransferFormData,
  gates: Partial<Record<FirstAssetFactGroupId, boolean>> = {},
): FirstAssetFactGroupId[] {
  const primary = form.assets?.[0];
  if (!primary) return [];
  const housing = isHousingLike(primary.assetKind);
  const exemptionAsset = isOneHouseExemptionAsset(primary.assetKind);
  const hasRegionCode = !!(primary.regionCode || form.regionCode);
  const scope: Record<FirstAssetFactGroupId, boolean> = {
    regulated: exemptionAsset && !hasRegionCode,
    proviso: exemptionAsset,
    finalRestart: exemptionAsset && calcFinalHouseRestartInScope(form),
    merge: housing,
    inheritGeneral: housing,
    declared: housing,
  };
  return FIRST_ASSET_FACT_GROUPS.filter(
    (g) => scope[g.id] && gates[g.id] !== false && g.declaredBy.some((k) => isDeclared(form[k])),
  ).map((g) => g.id);
}

/**
 * 첫 자산 삭제(`idx === 0`)의 안내 마커 — 삭제 **후** 폼에서 값이 있는 묶음을 스냅샷한다. 없으면 `undefined`(= 이전 마커도 지운다).
 * `idx !== 0`이면 호출하지 않는다(가운데·끝 삭제는 첫 자산이 안 바뀐다).
 */
export function firstAssetChangeNoteOnRemoval(
  form: TransferFormData,
  idx: number,
  patch: AssetRemovalPatch,
): FirstAssetChangeNote | undefined {
  if (!form.assets[idx]) return undefined;
  const next = patch.assets[0];
  if (!next) return undefined;
  const groups = firstAssetFactGroups({ ...form, assets: patch.assets, isUnregistered: patch.isUnregistered });
  if (groups.length === 0) return undefined;
  return { newFirstAssetId: next.assetId, groups };
}

const GROUP_IDS = new Set<string>(FIRST_ASSET_FACT_GROUPS.map((g) => g.id));

/** 구 기록·깨진 모양 가드 — 알 수 없는 묶음 id는 버린다. 쓸 수 있는 것이 없으면 `undefined`. */
export function readFirstAssetChangeNote(raw: unknown): FirstAssetChangeNote | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.newFirstAssetId !== "string" || !Array.isArray(o.groups)) return undefined;
  const groups = o.groups.filter((g): g is FirstAssetFactGroupId => typeof g === "string" && GROUP_IDS.has(g));
  if (groups.length === 0) return undefined;
  return { newFirstAssetId: o.newFirstAssetId, groups };
}

/**
 * 카드가 지금 그릴 묶음 = 마커 스냅샷 ∩ 지금도 값이 있는 묶음. 마커가 새 첫 자산을 가리키지 않으면(그 뒤 다른 변경) 비어 있다.
 * 사용자가 칸을 비우면 그 줄이 사라지고, 삭제 뒤 새로 채운 묶음은 스냅샷에 없어 뜨지 않는다.
 */
export function visibleFirstAssetChangeGroups(
  form: TransferFormData,
  gates: Partial<Record<FirstAssetFactGroupId, boolean>> = {},
): { note: FirstAssetChangeNote; groups: FirstAssetFactGroupId[] } | null {
  const note = readFirstAssetChangeNote(form.firstAssetChangeNote);
  if (!note || form.assets[0]?.assetId !== note.newFirstAssetId) return null;
  const live = new Set(firstAssetFactGroups(form, gates));
  const groups = note.groups.filter((g) => live.has(g));
  return groups.length > 0 ? { note, groups } : null;
}
