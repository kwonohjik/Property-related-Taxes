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
 * 🔑 **「식별 미입력」의 기준은 «물건·사람 식별자»다 — 날짜가 아니다.**
 *   종전에는 `주소 || 양도일`이면 키를 만들어 `addr:|2026.06.03`이 나왔고, 주소를 안 적은
 *   서로 다른 물건이 **같은 키로 서로를 덮어썼다**(계획서 §1-1 실측 — 이력 1건).
 *   양도일만으로는 물건이 식별되지 않으므로 **식별자가 없으면 키를 만들지 않는다.**
 *   (재산세가 처음부터 `addr ? … : null`이었던 것이 이 규약의 선례다.)
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
      // 피상속인이 식별자다 — 상속개시일만으로는 피상속인이 갈리지 않는다
      if (!name) return null;
      const death = formatDate(inputData.deathDate as string | undefined) ?? "";
      return `nd:${name}|${death}`;
    }
    case "transfer": {
      const addr = extractAddress(inputData);
      const date = extractTransferDate(inputData);
      // 주소가 물건 식별자다 — 양도일만으로는 물건이 갈리지 않는다
      if (!addr) return null;
      // 다건(multi)은 첫 자산 주소·양도일이 동일 물건 단건과 겹침 → |multi 접미로 단건 record 덮어쓰기 방지
      const multiSuffix = inputData.__multiTransfer === true ? "|multi" : "";
      // 수정신고·경정청구는 주소·양도일이 당초와 동일 → 접미로 당초 record 덮어쓰기 방지
      // (당초·수정신고|amend·경정청구|refund 3-record 공존)
      const amendSuffix =
        inputData.amendmentMode === true
          ? inputData.correctionKind === "refund_claim"
            ? "|refund"
            : "|amend"
          : "";
      return `addr:${addr}|${date ?? ""}${multiSuffix}${amendSuffix}`;
    }
    case "acquisition": {
      // jibun/road는 acquisition FormState top-level → extractAddress 동작
      const addr = extractAddress(inputData);
      if (!addr) return null;
      const date = formatDate(inputData.acquisitionDate as string | undefined);
      return `addr:${addr}|${date ?? ""}`;
    }
    case "property": {
      // 과세연도 입력 필드 없음(과세기준일 6/1 고정) → 주소만으로 물건 식별
      const addr = extractAddress(inputData);
      return addr ? `addr:${addr}` : null;
    }
    case "stock_transfer": {
      const sec = extractStockSecurityName(inputData);
      // 종목이 식별자다. ⑧이 종목명을 차단하지만 **[저장하기]는 validate를 우회**하므로
      // (계획서 §4-3) 여기서도 같은 규약을 건다.
      if (!sec) return null;
      const date = extractStockTransferDate(inputData);
      return `sec:${sec}|${date ?? ""}`;
    }
    case "stock_valuation": {
      const sec = extractStockValuationName(inputData);
      if (!sec) return null;
      const date = formatDate(inputData.valuationDate as string | undefined);
      return `sec-val:${sec}|${date ?? ""}`;
    }
    default:
      // gift·comprehensive_property — 인적 식별 필드 부재(실측 확정) → content 폴백
      return null;
  }
}
