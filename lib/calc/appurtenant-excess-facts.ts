/**
 * ④ 배율 초과분의 «비사업용 토지로 보지 않는» 사유 판정 사실 — 엔진 `appurtenantExcessFacts`로 가는 와이어 값 (NBL2611-C4 · R16).
 *
 * 입력은 새로 받지 않는다 — 두 사실 모두 이미 화면에 있는 칸이다:
 *   · 사업인정 고시일 = 자산-수준 `expropriationNoticeDate`(「공익수용」 카드 · `ExpropriationBlock`) — 양도원인이 수용일 때만 보낸다.
 *   · 유예기간 = NBL 섹션과 같은 `nblGracePeriods` 행 + 같은 해석 leaf(`resolveGraceIntervals`) — 주택 카드의 배율 초과분 영역에서 입력한다.
 * 보내는 자산: 주택(수용 의제 + 유예) · 상가·일반건물(수용 의제만 — 영 §168의12는 주택 배율이라 비주택 부속토지는 유예 대상이 아니다).
 * 겸용주택(NBL2611-C5)은 주택분 부수토지 배율 초과분에 같은 두 사실(수용 의제 + 유예)을 읽는다 — 상가분 부수토지는 읽지 않는다(Q-8 (가)).
 * 겸용은 초과분이 «주택분 한도»와 «건물 전체 한도(OH-17)» 두 기준으로 갈려 노출·검증 술어가 둘 중 하나라도 초과면 참인 상위집합이다(`mixedExcessAreaCandidate`).
 *
 * ⑤(`AssetAreaSection`)·⑧(`validateHousingExcessGrace`)이 같은 게이트(`housingExcessAreaOfAsset > 0`)를 쓴다 — 칸이 보이지 않는데 남은 값이
 * 세액에 닿는 일(stale)을 막는다.
 */
import { parseISO } from "@/lib/tax-engine/utc-date";
import { resolveGraceIntervals } from "@/lib/tax-engine/non-business-land/grace-reason-period";
import type { GraceReasonCode } from "@/lib/tax-engine/non-business-land/types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { AppurtenantExcessFactsWire } from "@/lib/api/appurtenant-excess-coerce";
import { mixedExcessAreaCandidate } from "@/lib/tax-engine/mixed-use-excess-area";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { nblAcquisitionDateOf } from "./nbl-unconditional-exemption-status";
import { housingExcessAreaOfAsset } from "./housing-excess-split";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** 주택 배율 초과분 유예기간 입력(`nblGracePeriods`)이 세액에 닿는 자산인가 — ⑤ 노출·④ 전송·⑧ 검증이 같은 술어. */
export function housingExcessGraceApplies(asset: AssetForm, transferDate: string | undefined): boolean {
  if (asset.assetKind !== "housing") return false;
  return asset.isMixedUseHouse ? mixedExcessAreaOfAsset(asset, transferDate) > 0 : housingExcessAreaOfAsset(asset, transferDate) > 0;
}

/** 겸용 폼 → 엔진 면적 판정 입력 — ④ `buildMixedUsePayload`가 보내는 값과 같은 three-state(빈 칸 = 자동 안분, "0" = 적법한 0). */
function mixedExcessAreaOfAsset(asset: AssetForm, transferDate: string | undefined): number {
  const num = (v: string | undefined) => parseFloat(v ?? "") || 0;
  const override = (v: string | undefined) => ((v ?? "").trim() !== "" ? parseFloat(v!) || 0 : undefined);
  const land = override(asset.mixedResidentialLandAreaOverride);
  const commercialLand = override(asset.mixedCommercialLandAreaOverride);
  const footprint = override(asset.mixedResidentialFootprintOverride);
  return mixedExcessAreaCandidate(
    {
      residentialFloorArea: num(asset.residentialFloorArea),
      nonResidentialFloorArea: num(asset.nonResidentialFloorArea),
      buildingFootprintArea: num(asset.buildingFootprintArea),
      totalLandArea: num(asset.mixedUseTotalLandArea),
      ...(land !== undefined ? { residentialLandAreaOverride: land } : {}),
      ...(commercialLand !== undefined ? { commercialLandAreaOverride: commercialLand } : {}),
      ...(footprint !== undefined ? { residentialFootprintOverride: footprint } : {}),
      ...((asset.mixedZoneType ?? "").trim() ? { zoneType: asset.mixedZoneType } : {}),
      isMetropolitanArea: asset.mixedIsMetropolitanArea,
    },
    toOptionalDate(transferDate),
  );
}

/** 유예 행 → 구간. 소유기간 기산은 NBL 엔진과 같다(토지 취득일 — 이월과세는 증여자 취득일). 풀리지 않는 행은 빈 배열이다(⑧이 먼저 막는다). */
export function housingExcessGraceIntervals(asset: AssetForm, transferDate: string): { startDate: string; endDate: string }[] {
  // 겸용은 ④ `buildMixedUsePayload`가 토지 취득일을 `landAcquisitionDate || acquisitionDate`로 싣는다(별개 취득 토글이 없다) — 같은 값이어야 엔진 기산일과 갈리지 않는다.
  const acquisition = parseISO(
    asset.isMixedUseHouse ? asset.landAcquisitionDate || asset.acquisitionDate : (asset.hasSeperateLandAcquisitionDate && asset.landAcquisitionDate) || nblAcquisitionDateOf(asset),
  );
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
  const expropriationNoticeDate =
    asset.transferCause === "public_expropriation" && asset.expropriationNoticeDate ? asset.expropriationNoticeDate.slice(0, 10) : undefined;
  const graceIntervals = transferDate && housingExcessGraceApplies(asset, transferDate) ? housingExcessGraceIntervals(asset, transferDate) : [];
  if (!expropriationNoticeDate && graceIntervals.length === 0) return undefined;
  return {
    ...(expropriationNoticeDate ? { expropriationNoticeDate } : {}),
    ...(graceIntervals.length > 0 ? { graceIntervals } : {}),
  };
}

/**
 * 축 B(같은 물건 지분 분할) 지분 카드가 배율 초과분 사실을 읽는 «뷰» (NBL2611-C6).
 *
 * 지분 카드는 ① 기본정보·② 양도정보를 숨겨 사업인정 고시일(② `ExpropriationBlock`)과 유예 행(① `AssetAreaSection`)을 받을 칸이 없다 — 두 사실은 첫 카드에만 있다.
 * 둘 다 **땅(물건) 단위 사실**이라 첫 카드 값을 읽는다(토지 지분이 `buildFractionalShareNblRecord`로 땅 사실은 첫 카드·취득 사실은 지분 값을 쓰는 것과 같은 규약).
 * 유예 구간의 기산(취득일)은 지분 카드 자신의 값 그대로다 — `housingExcessGraceIntervals`가 자산 취득일로 기산하므로 같은 행이 지분마다 따로 해석된다.
 *
 * 🔴 `mergePrimaryBasic`에 두 키를 **넣지 않는다**: 그 병합값은 ⑧·감면 변환·사이드바가 함께 읽는다. 실측(2026-11-21)으로 넣으면
 *   ⑧이 지분 카드에 «고칠 칸 없는» 유예 행 오류(자산 2: 종료일을 입력하세요)를 내고, 지분 카드의 공익수용 감면 행(고시일 공란)은 ⑧ 오류 대신 첫 카드 고시일로
 *   조용히 채워졌다(§77 `businessApprovalDate` "" → 첫 카드 값). 이 함수는 ④가 `appurtenantExcessFacts`를 만드는 한 지점에서만 쓴다.
 *
 * @param share `mergePrimaryBasic`을 거친 지분 카드(양도원인·초과분 면적이 첫 카드 값으로 병합된 자산)
 */
export function appurtenantExcessShareView(share: AssetForm, primary: AssetForm): AssetForm {
  return {
    ...share,
    expropriationNoticeDate: primary.expropriationNoticeDate,
    nblGracePeriods: primary.nblGracePeriods,
    // 유예 사유 «부동산매매업자 사정» 해석이 읽는 표지 — 첫 카드 NBL 섹션 값(땅·사업 단위)
    nblBusinessIsRealEstateDealer: primary.nblBusinessIsRealEstateDealer,
  };
}
