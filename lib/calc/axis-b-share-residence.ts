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
