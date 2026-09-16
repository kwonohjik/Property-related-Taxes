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

/**
 * 집합건물 세대(동·호)를 주소에 접미한다 — **같은 지번의 두 세대를 가르는 유일한 축**이다.
 *
 * 이것이 없으면 `101동 501호`와 `102동 1201호`가 같은 `businessKey`를 갖고 서로를 덮어썼다
 * (계획서 §1-2 실측). 동·호가 없으면(토지·단독건물) 주소를 그대로 돌려준다.
 *
 * 필드명이 세목별로 다르다 — 양도 `addressDong/addressHo` · 취득·재산 `dong/ho`.
 * 기존 `road ?? addressRoad` 패턴과 같은 방식으로 흡수한다.
 */
function withUnit(addr: string, src: Record<string, unknown>): string {
  const dong = ((src.addressDong ?? src.dong) as string | undefined)?.trim();
  const rawHo = ((src.addressHo ?? src.ho) as string | undefined)?.trim();
  // AddressSearch의 동은 "201동"처럼 접미가 붙어 오고 호는 "3204"로 온다 — 제목 가독성만 맞춘다
  const ho = rawHo ? (rawHo.endsWith("호") ? rawHo : `${rawHo}호`) : "";
  return [addr, dong, ho].filter(Boolean).join(" ");
}

/** 한 소스(자산 또는 top-level 폼)에서 주소 + 세대를 뽑는다. 주소가 없으면 null. */
function pickAddress(src: Record<string, unknown>): string | null {
  const road = (src.road ?? src.addressRoad) as string | undefined;
  const jibun = (src.jibun ?? src.addressJibun) as string | undefined;
  const addr = road?.trim() || jibun?.trim();
  return addr ? withUnit(addr, src) : null;
}

export function extractAddress(input: Record<string, unknown>): string | null {
  // 양도세: input.assets[0].addressRoad or addressJibun
  const assets = input.assets as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(assets) && assets.length > 0) {
    const addr = pickAddress(assets[0]);
    if (addr) return addr;
  }
  // [S3] 다건 직접입력(MultiTransferFormData): properties[0].form.assets[0]
  const properties = input.properties as
    | Array<{ form?: { assets?: Array<Record<string, unknown>> } }>
    | undefined;
  if (Array.isArray(properties) && properties.length > 0) {
    const firstAsset = properties[0]?.form?.assets?.[0];
    if (firstAsset) {
      const addr = pickAddress(firstAsset);
      if (addr) return addr;
    }
  }
  // 취득세·재산세 등 단일 구조 — road/jibun 또는 addressRoad/addressJibun 모두 인식
  return pickAddress(input);
}

export function extractTransferDate(input: Record<string, unknown>): string | null {
  // transferDate는 TransferFormData top-level 필드
  const direct = formatDate(input.transferDate as string | undefined);
  if (direct) return direct;
  // [S3] 다건 직접입력: properties[0].form.transferDate (top-level transferDate 부재)
  const properties = input.properties as Array<{ form?: { transferDate?: string } }> | undefined;
  if (Array.isArray(properties) && properties.length > 0) {
    return formatDate(properties[0]?.form?.transferDate);
  }
  return null;
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
    // 다건(multi)은 저장 taxType이 "transfer"라 라벨만으로는 단건과 구분 불가 → "(다건)" 병기
    const baseLabel = inputData.__multiTransfer === true ? `${label} (다건)` : label;
    const label2 =
      inputData.amendmentMode === true
        ? inputData.correctionKind === "refund_claim"
          ? `${baseLabel} 경정청구`
          : `${baseLabel} 수정신고`
        : baseLabel;
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
