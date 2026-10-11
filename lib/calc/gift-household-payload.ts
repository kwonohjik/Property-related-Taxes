/**
 * 증여받은 주택의 「증여자와 계속 같은 세대」 사실 — 판정 메뉴 ④ 전송 · ⑧ 검증 · ⑤ 노출이 **같은 술어**를 쓰는 leaf (결정 #38).
 *
 * 이월과세 폼(`CarryoverTaxationForm.donorSameHousehold`)과 **같은 사실·같은 엔진 leaf**
 * (`lib/tax-engine/one-house/gift-household-basis.ts`)를 쓴다 — 판정 메뉴와 계산기가 같은 사실로 같은 판정을 한다.
 * 계산기 일반 증여(이월과세 밖) 화면에는 이 칸이 없다 — 엔진이 같은 확인 필요를 고지한다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type GiftFactFields = Pick<
  AssetForm,
  | "acquisitionCause"
  | "assetKind"
  | "donorAcquisitionDate"
  | "giftDonorRelation"
  | "giftSameHousehold"
  | "giftHouseholdHoldingStartDate"
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
} {
  if (!primary || !giftHouseholdFactVisible(primary)) return {};
  return {
    acquisitionCause: "gift",
    donorAcquisitionDate: primary.donorAcquisitionDate || undefined,
    ...(primary.giftSameHousehold === "no" ? { giftSameHouseholdContinuous: false } : {}),
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

/**
 * 단건 계산기 ④ 전송 조각 — 판정 메뉴에서 **넘어온** 증여 사실을 일반 증여(`gift`) 계산에도 싣는다(결정 #38 조건: 판정 메뉴와 계산기
 * 단건이 같은 사실로 같은 판정을 한다).
 *
 * 계산기 일반 증여 화면에는 이 칸의 입력 위젯이 없다 — 값은 판정 메뉴가 넘긴 것(`toTransferFormPatch`)이다. 이월과세로 바뀌지 않는
 * 증여(그 밖의 친족 · 10년(5년) 밖 · 세대 사실이 이월과세 배제를 가르지 않는 경우)도 이 사실이 §154① 보유·「취득 당시」를 가르므로
 * 버리지 않는다. 다만 **불완전·불일치 사실은 보내지 않는다** — ⑫가 400으로 막는 모양(시작일 누락·순서 위반)을 보내면 고칠 칸이 이 화면에
 * 없는 막다른 오류가 된다. 그때는 미전송(엔진이 확인 필요를 고지)이다.
 */
export function buildCalcGiftHouseholdPayload(
  primary: (GiftFactFields & Pick<AssetForm, "acquisitionDate">) | undefined,
): ReturnType<typeof buildGiftHouseholdPayload> {
  if (!primary || !primary.giftSameHousehold) return {};
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
  if (!primary.giftSameHousehold) {
    out.push({ field: "giftSameHousehold", message: "증여일부터 양도일까지 증여자와 계속 같은 세대였는지 선택하세요." });
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
