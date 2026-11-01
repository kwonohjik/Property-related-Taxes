/**
 * 의제취득일(1985.1.1.) 전 «매수» 영 §176조의2④ — 신고서 양식·상세명세서 주석 문구 단일 소스(V-6)
 * 계획서: docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md §14
 *
 * 별지 서식에 의제취득일 자산의 기재 지시가 없다. 취득일 칸은 취득시기(법률 제4803호 부칙 제8조)인 의제취득일을 그대로 두고
 * 실제 취득일을 주석으로 밝힌다(사용자 결정 2026-11-01). 값은 엔진 echo만 읽는다(재산출 금지).
 */
import type { PreDeemedPurchaseDetail } from "@/lib/tax-engine/types/transfer-pre-deemed-purchase.types";
import type { AggregateTransferResult } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseCardId, SHARE_ID_SEPARATOR } from "@/lib/tax-engine/general-building-share-id";
import { TRANSFER } from "@/lib/tax-engine/legal-codes/transfer";

export function preDeemedAcqDateNote(d: PreDeemedPurchaseDetail): string {
  return `실제 취득일 ${d.originalAcquisitionDate} — 취득시기는 의제취득일(1985.1.1.)입니다 (법률 제4803호 부칙 제8조)`;
}

export function preDeemedAcqPriceNote(d: PreDeemedPurchaseDetail): string {
  const clause2 = `실지거래가액 ${d.actualBase.toLocaleString()} + 생산자물가상승분 ${(d.clause2Amount - d.actualBase).toLocaleString()} = ${d.clause2Amount.toLocaleString()}`;
  const part = d.part === "land" ? "토지 " : d.part === "building" ? "건물 " : "";
  if (d.selected === "clause1") return `${part}${TRANSFER.PRE_DEEMED_PURCHASE_MAX} ① 채택: 의제취득일 현재 ${(d.clause1Amount ?? 0).toLocaleString()} (② ${clause2})`;
  const c1 = d.clause1Amount === undefined ? "① 미산정" : `① ${d.clause1Amount.toLocaleString()}`;
  return `${part}${TRANSFER.PRE_DEEMED_PURCHASE_MAX} ② 채택: ${clause2} (${c1})`;
}

/**
 * 합산 열(카드) 하나의 비교 내역 — 일반 자산은 카드 echo · 일반건물 토지·건물 카드는 물건 상세(지분이면 그 지분).
 * 파트 비교면 그 파트 열에만 붙인다.
 */
export function preDeemedDetailOfCard(
  propertyId: string,
  own: PreDeemedPurchaseDetail | undefined,
  aggregated: Pick<AggregateTransferResult, "generalBuildingValuationDetail" | "generalBuildingDetailsByAsset">,
): PreDeemedPurchaseDetail | undefined {
  if (own) return own;
  const base = baseCardId(propertyId);
  const kind = base.startsWith("land") ? "land" : base.startsWith("building") ? "building" : undefined;
  if (!kind) return undefined;
  const detail = aggregated.generalBuildingValuationDetail;
  // 접미사 = 지분 인덱스(지분 분할) 또는 자산 id(함께 양도 일반건물)
  const suffix = propertyId.slice(base.length + SHARE_ID_SEPARATOR.length);
  const d = (detail?.shareBlockEcho?.[suffix] ?? aggregated.generalBuildingDetailsByAsset?.[suffix] ?? detail)?.preDeemedPurchase;
  return d && (!d.part || d.part === kind) ? d : undefined;
}
