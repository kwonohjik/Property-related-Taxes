import type { LocalTaxType } from "./types";

const TAX_LABEL: Record<LocalTaxType, string> = {
  transfer: "양도소득세",
  acquisition: "취득세",
  inheritance: "상속세",
  gift: "증여세",
  property: "재산세",
  comprehensive_property: "종합부동산세",
};

function formatDate(dateStr: string | undefined | null): string | null {
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

function extractAddress(input: Record<string, unknown>): string | null {
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

function extractTransferDate(input: Record<string, unknown>): string | null {
  // transferDate는 TransferFormData top-level 필드
  return formatDate(input.transferDate as string | undefined);
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
    if (address && date) return `${label} — ${address} (양도 ${date})`;
    if (address) return `${label} — ${address}`;
    if (date) return `${label} — 양도 ${date}`;
  }

  if (taxType === "acquisition") {
    if (address) return `${label} — ${address}`;
  }

  // 기타 세목 + 주소·날짜 미입력: 저장 일시로 구분
  const saved = formatDate(createdAt);
  return saved ? `${label} — ${saved}` : label;
}
