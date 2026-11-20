/**
 * ④ 배율 초과분의 «비사업용 토지로 보지 않는» 사유 판정 사실 — 엔진 `appurtenantExcessFacts`로 가는 와이어 값 (NBL2611-C4 · R16).
 *
 * 입력은 새로 받지 않는다 — 두 사실 모두 이미 화면에 있는 칸이다:
 *   · 사업인정 고시일 = 자산-수준 `expropriationNoticeDate`(「공익수용」 카드 · `ExpropriationBlock`) — 양도원인이 수용일 때만 보낸다.
 *   · 유예기간 = NBL 섹션과 같은 `nblGracePeriods` 행 + 같은 해석 leaf(`resolveGraceIntervals`) — 주택 카드의 배율 초과분 영역에서 입력한다.
 * 보내는 자산: 주택(수용 의제 + 유예) · 상가·일반건물(수용 의제만 — 영 §168의12는 주택 배율이라 비주택 부속토지는 유예 대상이 아니다).
 * 겸용주택은 아직 이 사실을 읽지 않아 보내지 않는다(리뷰 §7.2 P6의 겸용 단계).
 *
 * ⑤(`AssetAreaSection`)·⑧(`validateHousingExcessGrace`)이 같은 게이트(`housingExcessAreaOfAsset > 0`)를 쓴다 — 칸이 보이지 않는데 남은 값이
 * 세액에 닿는 일(stale)을 막는다.
 */
import { parseISO } from "@/lib/tax-engine/utc-date";
import { resolveGraceIntervals } from "@/lib/tax-engine/non-business-land/grace-reason-period";
import type { GraceReasonCode } from "@/lib/tax-engine/non-business-land/types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { AppurtenantExcessFactsWire } from "@/lib/api/appurtenant-excess-coerce";
import { nblAcquisitionDateOf } from "./nbl-unconditional-exemption-status";
import { housingExcessAreaOfAsset } from "./housing-excess-split";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** 주택 배율 초과분 유예기간 입력(`nblGracePeriods`)이 세액에 닿는 자산인가 — ⑤ 노출·④ 전송·⑧ 검증이 같은 술어. */
export function housingExcessGraceApplies(asset: AssetForm, transferDate: string | undefined): boolean {
  return asset.assetKind === "housing" && !asset.isMixedUseHouse && housingExcessAreaOfAsset(asset, transferDate) > 0;
}

/** 유예 행 → 구간. 소유기간 기산은 NBL 엔진과 같다(토지 취득일 — 이월과세는 증여자 취득일). 풀리지 않는 행은 빈 배열이다(⑧이 먼저 막는다). */
export function housingExcessGraceIntervals(asset: AssetForm, transferDate: string): { startDate: string; endDate: string }[] {
  const acquisition = parseISO((asset.hasSeperateLandAcquisitionDate && asset.landAcquisitionDate) || nblAcquisitionDateOf(asset));
  const transfer = parseISO(transferDate);
  if (Number.isNaN(acquisition.getTime()) || Number.isNaN(transfer.getTime())) return [];
  const parse = (v: string | undefined) => (v ? parseISO(v) : undefined);
  return (asset.nblGracePeriods ?? []).flatMap((g) =>
    resolveGraceIntervals(g.reasonCode as GraceReasonCode, parse(g.anchorDate), parse(g.endDate), parse(g.secondaryDate), {
      transferDate: transfer,
      acquisitionDate: acquisition,
      isRealEstateDealerMatter: asset.nblBusinessIsRealEstateDealer === true,
    }).map((iv) => ({ startDate: iso(iv.start), endDate: iso(iv.end) })),
  );
}

export function buildAppurtenantExcessFacts(asset: AssetForm, transferDate: string | undefined): AppurtenantExcessFactsWire | undefined {
  if (asset.assetKind !== "housing" && asset.assetKind !== "commercial_building" && asset.assetKind !== "general_building") return undefined;
  if (asset.assetKind === "housing" && asset.isMixedUseHouse) return undefined;
  const expropriationNoticeDate =
    asset.transferCause === "public_expropriation" && asset.expropriationNoticeDate ? asset.expropriationNoticeDate.slice(0, 10) : undefined;
  const graceIntervals = transferDate && housingExcessGraceApplies(asset, transferDate) ? housingExcessGraceIntervals(asset, transferDate) : [];
  if (!expropriationNoticeDate && graceIntervals.length === 0) return undefined;
  return {
    ...(expropriationNoticeDate ? { expropriationNoticeDate } : {}),
    ...(graceIntervals.length > 0 ? { graceIntervals } : {}),
  };
}
