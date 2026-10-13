/**
 * 증여받은 주택의 「증여자와 계속 같은 세대」 사실 — 판정 메뉴 ④ 전송 · ⑧ 검증 · ⑤ 노출이 **같은 술어**를 쓰는 leaf (결정 #38).
 *
 * 이월과세 폼(`CarryoverTaxationForm.donorSameHousehold`)과 **같은 사실·같은 엔진 leaf**
 * (`lib/tax-engine/one-house/gift-household-basis.ts`)를 쓴다 — 판정 메뉴와 계산기가 같은 사실로 같은 판정을 한다.
 * 계산기 단건 일반 증여(이월과세 밖, 부담부증여 양도 포함) 화면도 **주 자산**에서 같은 위젯으로 묻는다(결정 #38-1,
 * `calcGiftHouseholdFactAsked`). 함께 양도하는 자산·건물만 증여받은 주택(D2)·다건에는 칸이 없다 — 엔진이 확인 필요를 고지한다.
 * 겸용주택(주 자산)은 묻는다 — 겸용 엔진의 §154① 판정이 같은 leaf로 이 사실을 읽는다(결정 #38 후속).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { effectiveBuildingCauseMix } from "./transfer-land-part-cause";

type GiftFactFields = Pick<
  AssetForm,
  | "acquisitionCause"
  | "assetKind"
  | "donorAcquisitionDate"
  | "giftDonorRelation"
  | "giftSameHousehold"
  | "giftHouseholdHoldingStartDate"
  | "giftDonorDeceased"
>;

/** 증여받은 주택의 세대 사실을 **묻는가** — 증여로 취득한 주택(`housing`) 한정. 입주권·분양권·토지는 이 사실이 결론을 가르지 않는다. */
export function giftHouseholdFactVisible(asset: Pick<AssetForm, "acquisitionCause" | "assetKind"> | undefined): boolean {
  return !!asset && asset.acquisitionCause === "gift" && asset.assetKind === "housing";
}

/**
 * ④ 전송 조각. 묻는 경우에만, 답한 값만 싣는다 — 취득 원인을 바꾼 뒤 남은 값이 엔진에 닿지 않는다.
 * 증여자 취득일은 기존 최상위 `donorAcquisitionDate`로 간다(⑫는 이미 받는다).
 */
export function buildGiftHouseholdPayload(primary: GiftFactFields | undefined): {
  acquisitionCause?: "gift";
  donorAcquisitionDate?: string;
  giftSameHouseholdContinuous?: boolean;
  giftHouseholdHoldingStartDate?: string;
  giftDonorDeceased?: boolean;
  giftRejoinedAfterDivorce?: boolean;
} {
  if (!primary || !giftHouseholdFactVisible(primary)) return {};
  // 결정 #34 조건 · #38-6 — 증여자 사망은 「계속 같은 세대」 질문을 띄우지 않으므로 그 답(남아 있는 stale 값 포함)을 싣지 않는다.
  //   엔진은 통산 없이 계산하고 확인 필요를 고지한다(`GiftHouseholdBasis.donorDeceased`).
  if (primary.giftDonorDeceased) {
    return {
      acquisitionCause: "gift",
      donorAcquisitionDate: primary.donorAcquisitionDate || undefined,
      giftDonorDeceased: true,
    };
  }
  return {
    acquisitionCause: "gift",
    donorAcquisitionDate: primary.donorAcquisitionDate || undefined,
    ...(primary.giftSameHousehold === "no" ? { giftSameHouseholdContinuous: false } : {}),
    // 재결합은 배우자 증여의 사실이다 — 관계가 배우자가 아니면(⑧이 막는다) 싣지 않는다. 「아니오」로 계산한다.
    ...(primary.giftSameHousehold === "rejoined" && primary.giftDonorRelation === "spouse"
      ? { giftSameHouseholdContinuous: false, giftRejoinedAfterDivorce: true }
      : {}),
    ...(primary.giftSameHousehold === "yes"
      ? {
          giftSameHouseholdContinuous: true,
          ...(primary.giftHouseholdHoldingStartDate
            ? { giftHouseholdHoldingStartDate: primary.giftHouseholdHoldingStartDate }
            : {}),
        }
      : {}),
  };
}

/** D2 판정에 필요한 키 — 건물만 증여받고 토지는 매수한 주택인가(`effectiveBuildingCauseMix`). */
type BuildingCauseMixFields = Partial<
  Pick<AssetForm, "isMixedUseHouse" | "landAcquisitionCause" | "hasSeperateLandAcquisitionDate" | "landCauseHost" | "transferType">
>;

/**
 * 계산기 단건 **주 자산**에서 세대 사실을 묻는가 — ⑤(`CompanionAcquisitionCauseSection`)·⑧(`validateAssetEntry`)·④가 같은 술어를 쓴다.
 *
 * 증여 주택(`giftHouseholdFactVisible`)이면서 건물만 증여받고 토지는 매수한 주택(D2)이 **아닌** 경우다 — D2는 증여 블록 대신 매매 블록이
 * 마운트되어 이 칸이 없고, 건물만 증여받은 주택의 통산 범위는 이 묶음에서 정하지 않았다(범위 밖 — 엔진이 확인 필요를 고지한다).
 * 겸용주택(`isMixedUseHouse`)도 묻는다 — 겸용 엔진의 §154① 판정(`transfer-tax-mixed-use-exemption.ts` `exemptionReqInput`)이 단건과 같은
 * leaf로 `giftHouseholdBasis`를 읽는다(결정 #38 후속 — anchor GC-5).
 * 첫 자산인지·다건 임베드인지는 호출부가 가른다(`calcGiftHouseholdFactAsked` — ⑤·⑧. ④는 단건 `form.assets[0]`만 싣는다).
 */
export function calcGiftHouseholdFactVisible(
  asset: (Pick<AssetForm, "acquisitionCause" | "assetKind"> & BuildingCauseMixFields) | undefined,
): boolean {
  return !!asset && giftHouseholdFactVisible(asset) && !effectiveBuildingCauseMix(asset);
}

/**
 * ⑤ 위젯 노출 · ⑧ 필수 검증의 게이트 — 단건 계산기의 **첫 자산**이고 다건 편집 화면에 임베드되지 **않았을** 때만 묻는다.
 *
 * 다건 편집은 같은 단건 마법사를 임베드하지만 다건 ④(`buildPropertyPayload`)는 이 사실을 싣지 않고 다건 ⑫도 받지 않는다(#38-3 범위 밖).
 * 다건에서 물으면 답이 조용히 버려지고 엔진은 「입력되지 않아」 고지를 낸다 — 같은 입력이 단건 0 · 다건 229,075,000(anchor GC-6).
 */
export function calcGiftHouseholdFactAsked(
  asset: Parameters<typeof calcGiftHouseholdFactVisible>[0],
  where: { isPrimary: boolean; embeddedInMulti: boolean },
): boolean {
  return where.isPrimary && !where.embeddedInMulti && calcGiftHouseholdFactVisible(asset);
}

/**
 * 단건 계산기 ④ 전송 조각 — 주 자산 증여 주택의 세대 사실을 일반 증여(`gift`) 계산에 싣는다(결정 #38 조건: 판정 메뉴와 계산기
 * 단건이 같은 사실로 같은 판정을 한다).
 *
 * 값은 계산기 화면의 위젯(⑤) 입력이거나 판정 메뉴가 넘긴 것(`toTransferFormPatch`)이다 — 같은 키다. 이월과세로 바뀌지 않는
 * 증여(그 밖의 친족 · 10년(5년) 밖 · 세대 사실이 이월과세 배제를 가르지 않는 경우)도 이 사실이 §154① 보유·「취득 당시」를 가르므로
 * 버리지 않는다. 칸이 없는 D2는 싣지 않는다(⑤·⑧과 같은 술어 `calcGiftHouseholdFactVisible`). **불완전·불일치 사실은 보내지 않는다** —
 * ⑧이 같은 규칙으로 막으므로 계산 경로에서는 닿지 않지만, ⑧을 거치지 않고 ④만 부르는 호출이 ⑫ 400을 받지 않게 남겨 둔다.
 */
export function buildCalcGiftHouseholdPayload(
  primary: (GiftFactFields & Pick<AssetForm, "acquisitionDate"> & BuildingCauseMixFields) | undefined,
): ReturnType<typeof buildGiftHouseholdPayload> {
  if (!primary || (!primary.giftSameHousehold && !primary.giftDonorDeceased) || !calcGiftHouseholdFactVisible(primary)) return {};
  if (giftHouseholdFactErrors(primary).length > 0) return {};
  return buildGiftHouseholdPayload(primary);
}

/** 배우자는 혼인 유지, 그 밖의 친족은 같은 주소·생계 계속 — 질문 문구가 관계별로 다르다(결정 #38 조건). */
export function giftHouseholdQuestionText(relation: AssetForm["giftDonorRelation"]): string {
  return relation === "spouse"
    ? "증여일부터 양도일까지 혼인이 유지되었습니까? (법률상 이혼했어도 생계를 같이 하는 등 사실상 이혼으로 보기 어려우면 「예」)"
    : "증여일부터 양도일까지 증여자와 같은 주소에서 생계를 같이 하는 같은 세대였습니까?";
}

/**
 * ⑧ 판정 메뉴 검증 — 결론이 아니라 **사실**을 필수로 묻는다(같은 세대면 통산, 아니면 증여일 기준이라 한쪽 기본값으로는
 * 원칙 1을 지킬 수 없다). ⑫ refine(`giftSameHouseholdContinuous === true`이면 시작일 필수 · 순서)의 거울이다.
 * 게이트(`judgmentSaleIsHousing`)는 호출부가 건다.
 */
export function giftHouseholdFactErrors(primary: GiftFactFields & Pick<AssetForm, "acquisitionDate">): { field: string; message: string }[] {
  if (!giftHouseholdFactVisible(primary)) return [];
  const out: { field: string; message: string }[] = [];
  if (!primary.donorAcquisitionDate) {
    out.push({ field: "donorAcquisitionDate", message: "증여받은 주택이면 증여자 취득일을 입력하세요." });
  } else if (primary.acquisitionDate && primary.donorAcquisitionDate >= primary.acquisitionDate) {
    out.push({ field: "donorAcquisitionDate", message: "증여자 취득일은 증여일보다 이전이어야 합니다." });
  }
  if (!primary.giftDonorRelation) out.push({ field: "giftDonorRelation", message: "증여자와의 관계를 선택하세요." });
  // 증여자 사망이면 질문을 띄우지 않는다 — 화면에 없는 질문을 요구하면 막다른 오류다(⑤·④와 같은 술어).
  if (primary.giftDonorDeceased) return out;
  if (!primary.giftSameHousehold) {
    out.push({ field: "giftSameHousehold", message: "증여일부터 양도일까지 증여자와 계속 같은 세대였는지 선택하세요." });
  } else if (primary.giftSameHousehold === "rejoined" && primary.giftDonorRelation !== "spouse") {
    out.push({
      field: "giftSameHousehold",
      message: "「이혼 후 같은 사람과 재결합」은 배우자에게서 증여받은 경우에만 선택할 수 있습니다. 계속 같은 세대였는지 다시 선택하세요.",
    });
  } else if (primary.giftSameHousehold === "yes") {
    const start = primary.giftHouseholdHoldingStartDate;
    if (!start) {
      out.push({ field: "giftHouseholdHoldingStartDate", message: "세대가 이 주택 보유를 시작한 날을 입력하세요. (§154① 통산)" });
    } else if (
      (primary.acquisitionDate && start >= primary.acquisitionDate) ||
      (primary.donorAcquisitionDate && start < primary.donorAcquisitionDate)
    ) {
      out.push({ field: "giftHouseholdHoldingStartDate", message: "세대 보유 시작일은 증여자 취득일 이후, 증여일 이전이어야 합니다." });
    }
  }
  return out;
}
