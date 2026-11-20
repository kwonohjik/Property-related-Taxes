/**
 * ⑫ NBL 정밀판정 raw 페이로드 교차 검증 (NBL2611-B1 · R05) — ⑧ `validateNblDetailedJudgment`의 거울.
 *
 * 여기 있는 규칙은 모두 «200 + 다른 세액»이던 것이다(엔진이 빈·역순 행을 버리고, 직전 쌍의 한쪽 없이 비율②를 빼고,
 * 지목이 비면 「지목 분류 불가 — 비사업용 간주」로 접는다). 조건은 ⑧과 **같은 술어·같은 helper·같은 문구**를 쓴다 —
 * 어긋나면 「⑧ 통과 ↔ ⑫ 400」 모순이다(14지점 ⑧·⑫).
 *
 * 게이트(⑧과 동일):
 *  · `nblUseDetailedJudgment`가 꺼져 있으면 아무것도 보지 않는다 — ④는 켜짐일 때만 raw를 싣지만 직접 호출자는 stale 값을 실을 수 있다.
 *  · 무조건 사업용 의제가 성립하면 지목·기간 행 검증을 건너뛴다(⑧이 같은 이유로 건너뛴다 — 그 칸은 화면에서 비활성이다).
 *    성립 여부는 엔진 판정을 raw에서 다시 돌려 얻는다(`isNblRawUnconditionallyExempt`).
 *  · 행 검증은 그 행을 **실제로 쓰는 지목**에만 건다(`nbl-period-rows-scope` — 지목을 바꿔 남은 stale 행 거부 방지).
 */
import { z } from "zod";
import { isNblRawUnconditionallyExempt } from "@/lib/calc/non-business-land-request";
import { nblBusinessUsePeriodsApply, nblResidenceHistoryApplies } from "@/lib/calc/nbl-period-rows-scope";
import { parseAmount, parseDecimal } from "@/lib/calc/number-parse";
import { getZoneAreaMultiplier } from "@/lib/tax-engine/local-tax-zone-multiplier";
import { resortAreaIssue } from "@/lib/tax-engine/non-business-land/resort-area-issue";
import { demolishedBasisIssue, type PropertyTaxBasis } from "@/lib/tax-engine/non-business-land/property-tax-basis";
import { graceRowIssue, type GraceRowLike } from "@/lib/tax-engine/non-business-land/grace-row-issue";
import { deemedTransferDateIssue, deemedTransferDateIssueMessage } from "@/lib/tax-engine/non-business-land/deemed-transfer-date-range";
import { consumesPeriodJudgmentDate } from "@/lib/tax-engine/non-business-land/land-category";
import {
  LAND_TYPE_REQUIRED_MESSAGE,
  PRIOR_REVENUE_LAND_VALUE_REQUIRED_MESSAGE,
  VILLA_NO_USE_REQUIRED_MESSAGE,
} from "@/lib/tax-engine/non-business-land/nbl-validation-messages";
import { periodRowIssue, periodRowIssueField, periodRowIssueMessage } from "@/lib/tax-engine/non-business-land/period-row-issue";
import { priorRevenueWithoutLandValue } from "@/lib/tax-engine/non-business-land/revenue-test";
import { hoRequiredInputIssue } from "@/lib/tax-engine/non-business-land/other-land-ho-meta";
import { wholesaleItemIssue } from "@/lib/tax-engine/non-business-land/revenue-wholesale-item";

interface DatedRow {
  startDate?: string;
  endDate?: string;
}

/** raw 페이로드 중 이 refine이 읽는 키만 — `nonBusinessLandRawSchema`의 부분집합. */
export interface NblRawRefineInput {
  nblUseDetailedJudgment: boolean;
  nblLandType: string;
  acquisitionDate?: string;
  transferDate?: string;
  nblDeemedTransferReason?: string;
  nblDeemedTransferDate?: string;
  nblBusinessUsePeriods?: DatedRow[];
  nblPastureLivestockPeriods?: DatedRow[];
  nblVillaUsePeriods?: DatedRow[];
  nblResidenceHistories?: DatedRow[];
  nblVillaNoUseConfirmed?: boolean;
  nblGracePeriods?: GraceRowLike[];
  nblRevenueBusinessType?: string;
  nblRevenuePriorRevenue?: string;
  nblRevenuePriorDeposit?: string;
  nblRevenuePriorRentDays?: string;
  nblRevenueCommonApportion?: boolean;
  nblRevenuePriorCommonRevenue?: string;
  nblRevenuePriorLandValue?: string;
  nblZoneType?: string;
  nblOtherPropertyTaxType?: string;
  nblOtherPropertyTaxBasis?: string;
  nblOtherDemolishedFloorArea?: string;
  nblOtherHasBuilding?: boolean;
  nblOtherRelatedBusinessType?: string;
  nblOtherResortParkingStdArea?: string;
  nblOtherResortParkingActualArea?: string;
  nblOtherResortBuildingFloorArea?: string;
  nblOtherResortBuildingArea?: string;
  nblOtherStandardAreaLimit?: string;
  nblOtherMaxAnnualArea?: string;
  nblOtherYouthCapacity?: string;
  nblOtherMinGarageArea?: string;
  nblOtherPrivateInvestCompletionDate?: string;
  nblRevenueWholesaleItem?: string;
  nblRevenueWholesaleInMarket?: boolean;
}

export function refineNonBusinessLandRaw(raw: NblRawRefineInput, ctx: z.RefinementCtx): void {
  if (!raw.nblUseDetailedJudgment) return;
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

  const exempt = isNblRawUnconditionallyExempt(raw as unknown as Record<string, unknown>);
  if (exempt) return;

  // NBL2611-V6-PU11 — 지목이 비었고 의제도 성립하지 않으면 엔진이 「지목 분류 불가 — 비사업용 간주」로 접는다(⑧ 지목 필수와 같다).
  if (!raw.nblLandType) {
    issue(["nblLandType"], LAND_TYPE_REQUIRED_MESSAGE);
    return;
  }
  const landType = raw.nblLandType as Parameters<typeof nblBusinessUsePeriodsApply>[0];

  // NBL2611-V8-VL02 — 기간 행: 빈·해석 불가·역순·같은 날 (⑧ rowArrays와 같은 4종·같은 적용 지목)
  const rowArrays: ReadonlyArray<{ key: string; rows: DatedRow[] | undefined; what: string; applies: boolean }> = [
    { key: "nblBusinessUsePeriods", rows: raw.nblBusinessUsePeriods, what: "사업용 사용기간(자경 등)", applies: nblBusinessUsePeriodsApply(landType) },
    { key: "nblPastureLivestockPeriods", rows: raw.nblPastureLivestockPeriods, what: "목장 축산기간", applies: raw.nblLandType === "pasture" },
    { key: "nblVillaUsePeriods", rows: raw.nblVillaUsePeriods, what: "별장 사용기간", applies: raw.nblLandType === "villa_land" },
    { key: "nblResidenceHistories", rows: raw.nblResidenceHistories, what: "거주 이력", applies: nblResidenceHistoryApplies(landType) },
  ];
  for (const { key, rows, what, applies } of rowArrays) {
    if (!applies) continue;
    (rows ?? []).forEach((r, i) => {
      const kind = periodRowIssue(r.startDate, r.endDate);
      if (kind) issue([key, i, periodRowIssueField(kind)], periodRowIssueMessage(what, i, kind, r.startDate, r.endDate));
    });
  }

  // NBL2611-V8-VL02 — 유예 행(⑧ `nblGracePeriods` 검증과 같은 helper) — 칸은 지목과 무관하게 화면에 있다
  (raw.nblGracePeriods ?? []).forEach((g, gi) => {
    const gIssue = graceRowIssue(g, gi);
    if (gIssue) issue(["nblGracePeriods", gi, gIssue.part], gIssue.message);
  });

  // NBL2611-Q-12 (a) — 별장 사용기간 0행은 «사용 없음» 명시 확인이 있어야 한다
  if (raw.nblLandType === "villa_land" && (raw.nblVillaUsePeriods ?? []).length === 0 && !raw.nblVillaNoUseConfirmed)
    issue(["nblVillaNoUseConfirmed"], VILLA_NO_USE_REQUIRED_MESSAGE);

  // NBL2611-V2-PR04 — 양도일 의제일은 취득 이후·양도 이전 (의제 적용 지목 + 사유 선택 + 의제일 입력 시)
  const reason = raw.nblDeemedTransferReason;
  if (consumesPeriodJudgmentDate(landType) && reason && reason !== "none" && raw.nblDeemedTransferDate) {
    const kind = deemedTransferDateIssue(raw.nblDeemedTransferDate, raw.acquisitionDate, raw.transferDate);
    if (kind)
      issue(
        ["nblDeemedTransferDate"],
        deemedTransferDateIssueMessage(kind, raw.nblDeemedTransferDate, raw.acquisitionDate ?? "", raw.transferDate ?? ""),
      );
  }

  // NBL2611-V9-DM06 — 직전 수입 쪽만 있고 직전 토지가액이 없으면 비율②가 조용히 빠진다 (업종 선택 시)
  const bt = raw.nblRevenueBusinessType;
  if (
    raw.nblLandType === "other_land" &&
    bt &&
    bt !== "none" &&
    priorRevenueWithoutLandValue({
      priorRevenue: parseAmount(raw.nblRevenuePriorRevenue || "0"),
      priorDeposit: parseAmount(raw.nblRevenuePriorDeposit || "0"),
      priorRentDays: parseAmount(raw.nblRevenuePriorRentDays || "0"),
      commonApportion: !!raw.nblRevenueCommonApportion,
      priorCommonRevenue: parseAmount(raw.nblRevenuePriorCommonRevenue || "0"),
      priorLandValue: parseAmount(raw.nblRevenuePriorLandValue || "0"),
    })
  )
    issue(["nblRevenuePriorLandValue"], PRIOR_REVENUE_LAND_VALUE_REQUIRED_MESSAGE);

  // NBL2611-V9-DM09 — 6호 휴양시설 2·3호는 «상한 이내 실제 면적» — 상한만 있고 실제 면적이 없으면 400 (⑧ 휴양시설 블록과 같은 술어·같은 문구)
  if (raw.nblLandType === "other_land" && raw.nblOtherRelatedBusinessType === "resort") {
    const resort = resortAreaIssue({
      parkingStd: parseDecimal(raw.nblOtherResortParkingStdArea),
      parkingActual: parseDecimal(raw.nblOtherResortParkingActualArea),
      buildingFloor: parseDecimal(raw.nblOtherResortBuildingFloorArea),
      buildingActual: parseDecimal(raw.nblOtherResortBuildingArea),
      zoneMapped: !!getZoneAreaMultiplier(raw.nblZoneType ?? ""),
    });
    if (resort) {
      const key = { parkingActual: "nblOtherResortParkingActualArea", parkingStd: "nblOtherResortParkingStdArea", buildingActual: "nblOtherResortBuildingArea" } as const;
      issue([key[resort.part]], resort.message);
    }
  }

  // NBL2611-V7-S — 선택한 호의 단순 필수 입력(호 메타 표 `requiredInput`: 기준면적·최대면적·수용정원·최저차고기준면적·3호 조성 완료일). ⑧ `validateNblOtherLand`와 같은 표·같은 문구.
  if (raw.nblLandType === "other_land") {
    const ho = hoRequiredInputIssue(raw.nblOtherRelatedBusinessType, (f) => (raw as unknown as Record<string, string | undefined>)[f], parseDecimal);
    if (ho) issue([ho.field], ho.message);
  }

  // NBL2611-V7-S · Q-6 (다) — 12호 도소매업은 품목 필수(규칙 §83조의4⑭). 시장 요건 불충족은 400이 아니라 12호 불인정이다(엔진).
  if (raw.nblLandType === "other_land") {
    const wh = wholesaleItemIssue({ businessType: raw.nblRevenueBusinessType, wholesaleItem: raw.nblRevenueWholesaleItem, wholesaleInMarket: raw.nblRevenueWholesaleInMarket });
    if (wh?.kind === "missing") issue(["nblRevenueWholesaleItem"], wh.message);
  }

  // NBL2611-V1-A (Q-1) — 철거ㆍ멸실 근거는 면적 범위를 계산할 사실(철거 전 바닥면적 · 배율표에 있는 용도지역)이 있어야 한다 (⑧ `validateNblOtherLand`와 같은 술어·같은 문구).
  // 근거 미선택은 막지 않는다 — 엔진이 종합합산 + 확인 필요로 접는다.
  if (raw.nblLandType === "other_land") {
    const demolished = demolishedBasisIssue({
      declared: (raw.nblOtherPropertyTaxType || "comprehensive") as Parameters<typeof demolishedBasisIssue>[0]["declared"],
      hasBuilding: !!raw.nblOtherHasBuilding,
      basis: (raw.nblOtherPropertyTaxBasis || undefined) as PropertyTaxBasis | undefined,
      floorArea: parseDecimal(raw.nblOtherDemolishedFloorArea),
      zoneType: raw.nblZoneType ?? "",
      zoneMapped: !!getZoneAreaMultiplier(raw.nblZoneType ?? ""),
    });
    if (demolished) issue([demolished.part === "floorArea" ? "nblOtherDemolishedFloorArea" : "nblZoneType"], demolished.message);
  }
}
