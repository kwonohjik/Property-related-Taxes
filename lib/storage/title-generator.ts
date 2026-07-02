import type { LocalTaxType } from "./types";

const TAX_LABEL: Record<LocalTaxType, string> = {
  transfer: "양도소득세",
  acquisition: "취득세",
  inheritance: "상속세",
  gift: "증여세",
  property: "재산세",
  comprehensive_property: "종합부동산세",
  stock_transfer: "주식 양도세",
  stock_valuation: "주식 평가",
};

export function formatDate(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
  } catch {
    return null;
  }
}

export function extractAddress(input: Record<string, unknown>): string | null {
  // 양도세: input.assets[0].addressRoad or addressJibun
  const assets = input.assets as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(assets) && assets.length > 0) {
    const first = assets[0];
    const road = first.addressRoad as string | undefined;
    const jibun = first.addressJibun as string | undefined;
    const addr = road?.trim() || jibun?.trim();
    if (addr) return addr;
  }
  // 취득세 등 단일 구조 — road/jibun 또는 addressRoad/addressJibun 모두 인식
  const road = (input.road ?? input.addressRoad) as string | undefined;
  const jibun = (input.jibun ?? input.addressJibun) as string | undefined;
  return road?.trim() || jibun?.trim() || null;
}

export function extractTransferDate(input: Record<string, unknown>): string | null {
  // transferDate는 TransferFormData top-level 필드
  return formatDate(input.transferDate as string | undefined);
}

/**
 * 주식 양도세 — 종목명 추출.
 * securityName (StockTransferFormData 메타 필드) 사용.
 */
export function extractStockSecurityName(inputData: Record<string, unknown>): string | null {
  const name = inputData.securityName as string | undefined;
  return name?.trim() || null;
}

/**
 * 주식 양도세 — 대표 양도일 추출.
 * 규칙: transferLots 배열이 비어있지 않으면 마지막 요소의 transferDate,
 *       아니면 top-level transferDate.
 */
export function extractStockTransferDate(inputData: Record<string, unknown>): string | null {
  const lots = inputData.transferLots as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(lots) && lots.length > 0) {
    const last = lots[lots.length - 1];
    return formatDate(last.transferDate as string | undefined);
  }
  return formatDate(inputData.transferDate as string | undefined);
}

/**
 * 주식 평가 도구 — 대표 종목(평가대상회사)명 추출.
 * inputData.stockItems[0]에서 상장 companyName → 비상장 V2 corpName → name 순.
 */
export function extractStockValuationName(inputData: Record<string, unknown>): string | null {
  const items = inputData.stockItems as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(items) || items.length === 0) return null;
  const first = items[0];
  const companyName = (first.companyName as string | undefined)?.trim();
  const name = (first.name as string | undefined)?.trim();
  const v2 = first.unlistedStockValuationV2 as Record<string, unknown> | undefined;
  const corp = (v2?.corpName as string | undefined)?.trim();
  return companyName || corp || name || null;
}

/**
 * 세목·입력값 기반 계산 이력 title 자동 생성.
 * 주소·날짜가 입력된 경우 포함하여 식별력을 높임.
 * 미입력 필드는 기본 레이블만 사용.
 */
export function generateTitle(
  taxType: LocalTaxType,
  inputData: Record<string, unknown>,
  createdAt: string
): string {
  const label = TAX_LABEL[taxType];
  const address = extractAddress(inputData);

  if (taxType === "transfer") {
    const date = extractTransferDate(inputData);
    const label2 =
      inputData.amendmentMode === true
        ? inputData.correctionKind === "refund_claim"
          ? `${label} 경정청구`
          : `${label} 수정신고`
        : label;
    if (address && date) return `${label2} — ${address} (양도 ${date})`;
    if (address) return `${label2} — ${address}`;
    if (date) return `${label2} — 양도 ${date}`;
  }

  if (taxType === "acquisition") {
    if (address) return `${label} — ${address}`;
  }

  if (taxType === "stock_transfer") {
    const securityName = extractStockSecurityName(inputData);
    const date = extractStockTransferDate(inputData);
    if (securityName && date) return `${label} — ${securityName} (양도 ${date})`;
    if (securityName) return `${label} — ${securityName}`;
    if (date) return `${label} — 양도 ${date}`;
  }

  if (taxType === "stock_valuation") {
    const sec = extractStockValuationName(inputData);
    const date = formatDate(inputData.valuationDate as string | undefined);
    if (sec && date) return `${label} — ${sec} (평가 ${date})`;
    if (sec) return `${label} — ${sec}`;
    if (date) return `${label} — 평가 ${date}`;
  }

  // 기타 세목 + 주소·날짜 미입력: 저장 일시로 구분
  const saved = formatDate(createdAt);
  return saved ? `${label} — ${saved}` : label;
}
