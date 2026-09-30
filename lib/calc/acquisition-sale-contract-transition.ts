/**
 * 취득세 — 법률 제17473호 부칙 제6조(2020.7.10. 이전 매매계약 경과조치) 입력 게이트 leaf (계획서 E-6)
 *
 * ⑤(화면 노출)·④(API 전송)가 같은 술어를 쓴다(손술어 사본 금지). 엔진 판정은
 * `lib/tax-engine/acquisition-surcharge/transitional-17473.ts`.
 *
 * 매매계약일: 연부취득이면 연부 매매계약일(`installmentContractDate`)이 곧 그 계약일이고, 아니면
 * `saleContractDate`를 받는다 — 같은 사실을 두 칸에 받지 않는다.
 */

import type { FormState } from "@/components/calc/acquisition/shared";
import { ACQUISITION_CONST } from "@/lib/tax-engine/legal-codes";

/** 매매계약일 칸이 의미가 있는 취득 — 주택 매매(부칙 문언 「매매계약(공동주택 분양계약 포함)」) */
export function isHousingSaleContractAcquisition(form: Pick<FormState, "propertyType" | "acquisitionCause">): boolean {
  return form.propertyType === "housing" && form.acquisitionCause === "purchase";
}

/** 매매계약일 — 연부취득이면 연부 매매계약일 */
export function effectiveSaleContractDate(
  form: Pick<FormState, "propertyType" | "acquisitionCause" | "saleContractDate" | "isInstallmentAcquisition" | "installmentContractDate">
): string {
  if (!isHousingSaleContractAcquisition(form)) return "";
  const d = form.isInstallmentAcquisition ? form.installmentContractDate ?? "" : form.saleContractDate;
  return d.trim();
}

/** 부칙 제6조 요건 입력(계약금 증빙·계약 당시 보유)을 열 계약일인지 — 2020.7.10. 이전(당일 포함) */
export function isPre17473ContractDate(
  form: Pick<FormState, "propertyType" | "acquisitionCause" | "saleContractDate" | "isInstallmentAcquisition" | "installmentContractDate">
): boolean {
  const d = effectiveSaleContractDate(form);
  return d !== "" && d <= ACQUISITION_CONST.SURCHARGE_17473_CONTRACT_CUTOFF;
}
