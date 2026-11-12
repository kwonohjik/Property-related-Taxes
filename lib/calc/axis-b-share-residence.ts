/**
 * 축 B(같은 주택 지분 분할) 거주 — 첫 지분보다 늦게 보유를 시작한 지분은 그 지분을 보유한 동안의 거주만 센다
 * (계획서 `docs/02-design/features/axis-b-share-residence-overcount.plan.md` Q-2).
 *
 * 거주 칸은 주 자산에 하나뿐이다. 구간 입력이면 지분별 겹침을 ④가 계산해 싣고, 개월 직접 입력은 시점을 알 수 없어 ⑧이 구간 입력을 요구한다.
 * 취득일이 같거나 빠른 지분은 묻지 않는다 — 서버가 주 자산 값을 승계한다(`inheritedShareResidenceMonths`).
 * ⑤(거주 칸)·④·⑧이 같은 술어를 쓴다.
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { deriveResidencePeriodMonths, sumResidenceMonthsFrom } from "@/lib/stores/calc-wizard-asset-residence";
import { isFullFractionalBundle } from "./transfer-tax-api-asset-basics";
import { isOneHouseExemptionAsset } from "./housing-like-asset";
import { redevAptHoldingStartDate, redevSplitResidenceSupersedesStep4 } from "./redev-field-scope";
import { landContributedOriginalApt } from "./redev-field-scope";
import { resolveRedevSubject } from "./redev-field-scope";
import { redevOneHouseAxisCandidate } from "./redev-one-house-axis";

/** 이 지분의 거주를 세기 시작하는 날 — 이월과세는 증여자 취득일(법규과-1660), 그 밖은 취득일(증여·상속은 증여일·상속개시일, 사전-2025-법규재산-0506 질의2). */
function shareResidenceStartDate(a: AssetForm): string {
  const donor = a.acquisitionCause === "carryover_gift" ? a.carryover?.donorAcquisitionDate : undefined;
  return donor || redevAptHoldingStartDate(a);
}

function startsLaterThanPrimary(a: AssetForm, primary: AssetForm): boolean {
  const start = shareResidenceStartDate(a);
  const primaryStart = shareResidenceStartDate(primary);
  return !!start && !!primaryStart && start > primaryStart;
}

type ShareResidenceForm = Pick<TransferFormData, "assets" | "assetSplitMode" | "isOneHousehold" | "transferDate" | "residencePeriodMonths">;

/** 거주 칸이 열리는 축 B인가 — Step4 렌더 게이트와 같은 조건이다. */
function residenceAskedOnShares(form: ShareResidenceForm): boolean {
  const primary = form.assets[0];
  return (
    !!primary &&
    form.isOneHousehold === true &&
    isOneHouseExemptionAsset(primary.assetKind) &&
    !redevSplitResidenceSupersedesStep4(primary) &&
    isFullFractionalBundle(form.assets, form.assetSplitMode)
  );
}

/** ⑧ — 개월 직접 입력인데 늦게 취득한 지분이 있어 거주 시점이 필요한가. 거주 0개월이면 물을 것이 없다. */
export function shareResidenceNeedsIntervals(form: ShareResidenceForm): boolean {
  const primary = form.assets[0];
  if (!primary || !residenceAskedOnShares(form) || primary.residenceInputMode !== "direct") return false;
  if (deriveResidencePeriodMonths(primary, form.transferDate, form.residencePeriodMonths) <= 0) return false;
  return form.assets.slice(1).some((a) => startsLaterThanPrimary(a, primary));
}

/** ④ — 구간 입력에서 늦게 취득한 지분의 거주 개월. 그 밖은 undefined(서버 승계). */
export function laterShareResidenceMonths(a: AssetForm, form: ShareResidenceForm): number | undefined {
  const primary = form.assets[0];
  if (!primary || !residenceAskedOnShares(form) || primary.residenceInputMode !== "interval") return undefined;
  if (!startsLaterThanPrimary(a, primary)) return undefined;
  return sumResidenceMonthsFrom(primary.residencePeriods ?? [], shareResidenceStartDate(a));
}

/**
 * ⑧ OH-48 — 재개발 완공APT 축 B 지분 카드의 분리 거주(종전·신축주택 거주개월)가 비었는가.
 *
 * 주 자산 카드의 분리 입력은 Step4 거주를 **대신한다**(`redevSplitResidenceSupersedesStep4` — ⑤가 Step4 칸을 숨긴다).
 * 그런데 지분 카드 칸이 비면 서버는 그 지분에 숨은 Step4 값을 승계해(`bundled-route.ts` `inheritedShareResidenceMonths`)
 * 같은 주택의 거주가 지분마다 갈렸다 — 실측 50/50 · 종전 60 + 신축 24: 장특공제 181,236,362 vs 79,418,181(Step4 빈칸).
 * 완공APT 분리 거주는 지분 카드마다 편집하는 칸이라(`sole-split-right-judgment-facts.ts` — 복사하지 않음) 자동 승계하지 않고
 * 입력을 요구한다(사용자 결정 a · 2026-11-12).
 *
 * 묻는 범위:
 *  - 칸이 화면에 있을 때만 — 지분 카드의 `RedevelopmentBlock`이 분리 섹션을 그리는 조건(입주권 아님 · 승계조합원 아님)과
 *    섹션 자체 게이트(`redevOneHouseAxisCandidate`).
 *  - 첫 카드보다 **늦게 취득하지 않은** 지분만 — 같은 세대가 같은 주택에 산 기간이라 첫 카드와 같은 구간이 있다.
 *    칸이 입주일·퇴거일뿐이라 «0개월»을 넣을 길이 없어, 늦게 취득해 그 보유 중 거주가 없는 지분을 막으면 영구 차단이 된다.
 *    늦게 취득한 지분은 종전처럼 서버 승계로 남는다(남은 한계).
 * 반환은 비어 있을 때 커서를 둘 칸(화면 `data-field`), 아니면 null.
 */
export function shareSplitResidenceMissingField(
  share: AssetForm,
  primary: AssetForm,
  form: Pick<TransferFormData, "isOneHousehold" | "householdHousingCount">,
): "redevPriorResidenceStartDate" | "redevNewResidenceStartDate" | null {
  if (!redevOneHouseAxisCandidate(form) || !redevSplitResidenceSupersedesStep4(primary)) return null;
  // 지분 카드는 자산종류를 첫 카드 값으로 그린다(`CompanionAssetCard` acquisitionAsset) — 같은 값으로 판정한다.
  const s = { ...share, assetKind: primary.assetKind };
  if (s.redevIsSuccessorMember === "yes" || resolveRedevSubject(s) !== "apt") return null;
  if (redevSplitResidenceSupersedesStep4(s) || startsLaterThanPrimary(share, primary)) return null;
  return landContributedOriginalApt(s) ? "redevNewResidenceStartDate" : "redevPriorResidenceStartDate";
}

export const SHARE_SPLIT_RESIDENCE_MISSING_MESSAGE =
  "첫 지분 카드에 종전·신축주택 거주기간을 나눠 입력했습니다. 같은 주택이므로 이 지분 카드의 거주기간도 입력하세요.";
