/**
 * 비거주자 비과세 배제 연혁 — 소득세법 §121② 단서 (상세 표는 `one-house/non-resident.ts` 머리 주석).
 *
 * 2010-01-01: §89①3호 배제 단서가 들어간 시행본(MST 98343)의 시행일. 2009-12-31 시행본(MST 131405)에는 단서가 없다.
 * 2020-01-01: §89①4호를 더한 법률 제16834호 시행일 — 부칙 제2조② 「양도소득세에 관한 개정규정은 이 법 시행 이후
 * 양도하는 분부터 적용한다」.
 *
 * ⚠️ `transfer-tax-redevelopment-transforms.ts`(입주권 판정 공용 술어)가 import한다 — 이 파일은 엔진 모듈을 import하지 않는다.
 */
import { TRANSFER } from "../legal-codes/transfer";
import type { TransferTaxInput } from "../types/transfer.types";

export const NON_RESIDENT_HOUSE_EXCLUSION_TRANSFER_START = new Date("2010-01-01");
export const NON_RESIDENT_RIGHT_EXCLUSION_TRANSFER_START = new Date("2020-01-01");

/** §89①4호 배제 — 양도일 현재 비거주자 + 2020-01-01 이후 양도. 계산기·판정 메뉴 공용 술어가 읽는다. */
export function nonResidentExcludesOneRight(
  input: Pick<TransferTaxInput, "transferorNonResidentAtTransfer" | "transferDate">,
): boolean {
  return (
    input.transferorNonResidentAtTransfer === true &&
    input.transferDate >= NON_RESIDENT_RIGHT_EXCLUSION_TRANSFER_START
  );
}

export const NON_RESIDENT_ONE_RIGHT_REASON = `양도일 현재 비거주자입니다 — 2020.1.1. 이후 양도분은 1세대1입주권 비과세를 적용하지 않습니다(${TRANSFER.NON_RESIDENT_EXEMPTION_EXCLUSION} 단서).`;
