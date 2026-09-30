/**
 * 취득세 주택 수 — §28의4③ 동시 취득 순서 입력 게이트 leaf (계획서 I-7)
 *
 * 지방세법 시행령 §28의4③: 「주택, 조합원입주권, 주택분양권 또는 오피스텔을 동시에 2개 이상 취득하는
 * 경우에는 납세의무자가 정하는 바에 따라 순차적으로 취득하는 것으로 본다.」
 *
 * 보유 자산의 취득일이 주택 수 산정일과 같을 수 있을 때만 「취득하는 주택 뒤로 정함」 칸을 연다.
 * 산정일은 엔진이 확정한다(§20 취득일 — 잔금일·등기일 중 빠른 날, 연부면 마지막 지급일 · 소급이면
 * 권리취득일). 화면은 그 후보를 모두 넣은 **상위집합**으로 열고, 엔진이 같은 날인지 다시 본다
 * (같은 날이 아니면 적용하지 않고 고지). ⑤·④가 이 술어를 함께 쓴다.
 */

import type { FormState, OwnedHouseInfo } from "@/components/calc/acquisition/shared";

type ReferenceForm = Pick<
  FormState,
  "balancePaymentDate" | "registrationDate" | "acquiredViaRight" | "rightAcquisitionDate" | "isInstallmentAcquisition" | "installments"
>;

/** 주택 수 산정일이 될 수 있는 날짜 후보 */
export function houseCountReferenceDateCandidates(form: ReferenceForm): string[] {
  const out = [form.balancePaymentDate, form.registrationDate];
  if (form.isInstallmentAcquisition) {
    const rows = form.installments ?? [];
    if (rows.length > 0) out.push(rows[rows.length - 1].paymentDate);
  }
  if (form.acquiredViaRight) out.push(form.rightAcquisitionDate);
  return out.map((d) => (d ?? "").trim()).filter((d) => d !== "");
}

/** 이 행에 「같은 날 취득 — 취득하는 주택 뒤로 정함」 칸을 열지 */
export function isSameDayOrderCandidate(form: ReferenceForm, row: Pick<OwnedHouseInfo, "acquisitionDate">): boolean {
  const d = row.acquisitionDate.trim();
  return d !== "" && houseCountReferenceDateCandidates(form).includes(d);
}
