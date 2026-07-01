/**
 * extractBusinessKey — 세목별 업무 식별 키 도출 (계산 이력 dedup).
 *
 * content 해시 dedup은 입력이 한 글자만 달라도 새 record를 만든다(중간 저장 중복).
 * 업무 식별 키(피상속인·물건·종목)로 dedup하면 같은 대상을 1건으로 유지한다.
 *
 * title-generator의 식별 추출 헬퍼를 재사용 → title ↔ businessKey 단일 소스(드리프트 방지).
 *
 * 키 도출 불가(증여·종부세, 또는 식별 미입력)이면 null → 호출처가 content dedup으로 폴백.
 *
 * Design: docs/02-design/features/calc-history-business-key-dedup.engine.design.md
 */

import type { LocalTaxType } from "./types";
import {
  formatDate,
  extractAddress,
  extractTransferDate,
  extractStockSecurityName,
  extractStockTransferDate,
  extractStockValuationName,
} from "./title-generator";

export function extractBusinessKey(
  taxType: LocalTaxType,
  inputData: Record<string, unknown>,
): string | null {
  switch (taxType) {
    case "inheritance": {
      // 주민번호 13자리 완성 시에만 키 — 부분 입력은 churn 방지 위해 이름+상속개시일 폴백
      const rrn = String(inputData.decedentResidentNumber ?? "").replace(/\D/g, "");
      if (rrn.length === 13) return `rrn:${rrn}`;
      const name = String(inputData.decedentName ?? "").trim();
      const death = formatDate(inputData.deathDate as string | undefined) ?? "";
      return name || death ? `nd:${name}|${death}` : null;
    }
    case "transfer": {
      const addr = extractAddress(inputData);
      const date = extractTransferDate(inputData);
      if (!addr && !date) return null;
      // 수정신고·경정청구는 주소·양도일이 당초와 동일 → 접미로 당초 record 덮어쓰기 방지
      // (당초·수정신고|amend·경정청구|refund 3-record 공존)
      const suffix =
        inputData.amendmentMode === true
          ? inputData.correctionKind === "refund_claim"
            ? "|refund"
            : "|amend"
          : "";
      return `addr:${addr ?? ""}|${date ?? ""}${suffix}`;
    }
    case "acquisition": {
      // jibun/road는 acquisition FormState top-level → extractAddress 동작
      const addr = extractAddress(inputData);
      const date = formatDate(inputData.acquisitionDate as string | undefined);
      return addr || date ? `addr:${addr ?? ""}|${date ?? ""}` : null;
    }
    case "property": {
      // 과세연도 입력 필드 없음(과세기준일 6/1 고정) → 주소만으로 물건 식별
      const addr = extractAddress(inputData);
      return addr ? `addr:${addr}` : null;
    }
    case "stock_transfer": {
      const sec = extractStockSecurityName(inputData);
      const date = extractStockTransferDate(inputData);
      return sec || date ? `sec:${sec ?? ""}|${date ?? ""}` : null;
    }
    case "stock_valuation": {
      const sec = extractStockValuationName(inputData);
      const date = formatDate(inputData.valuationDate as string | undefined);
      return sec || date ? `sec-val:${sec ?? ""}|${date ?? ""}` : null;
    }
    default:
      // gift·comprehensive_property — 인적 식별 필드 부재(실측 확정) → content 폴백
      return null;
  }
}
