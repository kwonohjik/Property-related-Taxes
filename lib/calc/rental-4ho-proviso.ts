/**
 * §154① 단서 삭제 전 4호(임대사업자 등록) — ⑤ 노출 범위 · ④⑬ 본문 조립 · ⑧ 필수 입력 (OH-38)
 *
 * 세 층이 **같은 술어**(`rental4hoFieldScope`)를 쓴다(3중 패턴). 화면에 없는 칸의 stale 값은 보내지도
 * 검증하지도 않는다 — 보이지 않는 칸 때문에 막히거나(영구 차단), 보이지 않는 선언이 계산을 바꾸지 않게.
 *
 * 엔진 판정은 `lib/tax-engine/one-house/rental-registration-4ho.ts` 한 곳이다. 여기서는 **결론을 내지 않는다**
 * (신청일이 기한 뒤인 것은 오류가 아니라 「적용되지 않음」이다 — 엔진이 사유를 낸다).
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import type { Rental4hoApiPayload } from "@/lib/api/rental-4ho-coerce";
import { isRental4hoTransferredBeforeDeletion } from "@/lib/tax-engine/one-house/rental-registration-4ho";
import { fieldError } from "./transfer-tax-validate-field";

export type Rental4hoFormSlice = Pick<
  TransferFormData,
  | "transferDate"
  | "proviso4hoBusinessRegDate"
  | "proviso4hoRentalRegDate"
  | "proviso4hoRegulatedOneHouse"
  | "proviso4hoStatus"
  | "proviso4hoDuringMandatory"
  | "proviso4hoRentOver5"
  | "proviso4hoRentOver5ContractDate"
  | "proviso4hoGiftSeparated"
>;

/**
 * 어떤 칸을 묻는가.
 * - 신청 당시 1주택 선언·증여 포괄승계 별도세대: 부칙<제30395호> 제38조② 요건 → 2020-02-11 이후 양도만
 *   (양도일 미입력이면 묻는다 — 안전측).
 * - 임대의무기간·5%: 등록 「유지」일 때만(말소 후에는 단서를 따지지 않는다 — 법규과-1810·1427·824).
 */
export function rental4hoFieldScope(f: Pick<Rental4hoFormSlice, "transferDate" | "proviso4hoStatus" | "proviso4hoRentOver5">) {
  const t = f.transferDate ? new Date(f.transferDate) : undefined;
  const transitional = !t || Number.isNaN(t.getTime()) || !isRental4hoTransferredBeforeDeletion(t);
  const maintained = f.proviso4hoStatus === "maintained";
  return {
    regulatedOneHouse: transitional,
    giftSeparated: transitional,
    maintainedQuestions: maintained,
    rentIncreaseContractDate: maintained && f.proviso4hoRentOver5 === "yes",
  };
}

const yesNo = (v: string | undefined): boolean | undefined =>
  v === "yes" ? true : v === "no" ? false : undefined;

/** ④⑬ — `oneHouseExemptionProviso.rentalRegistration4ho` 본문(문자열 날짜). 미입력 키는 싣지 않는다. */
export function buildRental4hoPayload(form: Rental4hoFormSlice): Rental4hoApiPayload {
  const scope = rental4hoFieldScope(form);
  const regulated = scope.regulatedOneHouse ? yesNo(form.proviso4hoRegulatedOneHouse) : undefined;
  const during = scope.maintainedQuestions ? yesNo(form.proviso4hoDuringMandatory) : undefined;
  const over5 = scope.maintainedQuestions ? yesNo(form.proviso4hoRentOver5) : undefined;
  return {
    ...(form.proviso4hoBusinessRegDate
      ? { businessRegistrationApplicationDate: form.proviso4hoBusinessRegDate }
      : {}),
    ...(form.proviso4hoRentalRegDate ? { rentalRegistrationApplicationDate: form.proviso4hoRentalRegDate } : {}),
    ...(regulated !== undefined ? { regulatedOneHouseAtApplication: regulated } : {}),
    ...(form.proviso4hoStatus ? { statusAtTransfer: form.proviso4hoStatus } : {}),
    ...(during !== undefined ? { transferredDuringMandatoryPeriod: during } : {}),
    ...(over5 !== undefined ? { rentIncreaseOver5Percent: over5 } : {}),
    ...(scope.rentIncreaseContractDate && form.proviso4hoRentOver5ContractDate
      ? { rentIncreaseContractDate: form.proviso4hoRentOver5ContractDate }
      : {}),
    ...(scope.giftSeparated && form.proviso4hoGiftSeparated ? { giftSuccessionSeparatedHousehold: true } : {}),
  };
}

/** ⑧ — 4호를 골랐을 때 화면에 보이는 칸만 필수로 본다. */
export function collectRental4hoErrors(form: Partial<Rental4hoFormSlice>): string[] {
  const errors: string[] = [];
  const scope = rental4hoFieldScope({
    transferDate: form.transferDate ?? "",
    proviso4hoStatus: form.proviso4hoStatus ?? "",
    proviso4hoRentOver5: form.proviso4hoRentOver5 ?? "",
  });
  const P = "§154① 단서(4호 임대사업자 등록)";
  const afterTransfer = (d: string | undefined) =>
    !!d && !!form.transferDate && d > form.transferDate;
  if (!form.proviso4hoBusinessRegDate) errors.push(fieldError("proviso4hoBusinessRegDate", `${P}: 사업자등록 신청일을 입력하세요.`));
  if (!form.proviso4hoRentalRegDate) errors.push(fieldError("proviso4hoRentalRegDate", `${P}: 임대사업자 등록 신청일을 입력하세요.`));
  // 두 날짜 중 양도일 뒤인 쪽 칸으로 — 둘 다면 앞 칸부터(메시지는 하나)
  const lateMessage = `${P}: 등록 신청일은 양도일 이전이어야 합니다.`;
  if (afterTransfer(form.proviso4hoBusinessRegDate)) errors.push(fieldError("proviso4hoBusinessRegDate", lateMessage));
  else if (afterTransfer(form.proviso4hoRentalRegDate)) errors.push(fieldError("proviso4hoRentalRegDate", lateMessage));
  if (scope.regulatedOneHouse && !form.proviso4hoRegulatedOneHouse) {
    errors.push(fieldError("proviso4hoRegulatedOneHouse", `${P}: 신청 당시 세대가 조정대상지역 1주택만 보유했는지 선택하세요.`));
  }
  if (!form.proviso4hoStatus) errors.push(fieldError("proviso4hoStatus", `${P}: 양도일 현재 임대사업자 등록 상태를 선택하세요.`));
  if (scope.maintainedQuestions) {
    if (!form.proviso4hoDuringMandatory) errors.push(fieldError("proviso4hoDuringMandatory", `${P}: 임대의무기간 중 양도인지 선택하세요.`));
    if (!form.proviso4hoRentOver5) errors.push(fieldError("proviso4hoRentOver5", `${P}: 임대료 연 5% 초과 증액 여부를 선택하세요.`));
  }
  if (scope.rentIncreaseContractDate) {
    if (!form.proviso4hoRentOver5ContractDate) {
      errors.push(fieldError("proviso4hoRentOver5ContractDate", `${P}: 5% 초과 증액 계약의 체결·갱신일을 입력하세요.`));
    } else if (afterTransfer(form.proviso4hoRentOver5ContractDate)) {
      errors.push(fieldError("proviso4hoRentOver5ContractDate", `${P}: 증액 계약의 체결·갱신일은 양도일 이전이어야 합니다.`));
    }
  }
  return errors;
}
