/**
 * 국외자산 부동산 양도세 — 이력(제목·dedup 키·빈 폼 판정·세율 기준일)의 **대표 추출 단일 소스**.
 *
 * 국외 폼은 국내 `assets[]`를 읽지 않는다(숨은 국내 입력이 남아 있을 수 있다 — D-2·D-4).
 * 그래서 제목(`generateTitle`)·dedup 키(`extractBusinessKey`)·수동 저장의 빈 폼 판정(`isTransferFormEmpty`)이
 * 국내 자리(`assets[0]`·top-level `transferDate`)를 읽으면 안 되고, 모두 이 파일을 거친다.
 *
 * 대표 = **`foreignAssets[0]`**(계획서 UI §13.5) — 자산을 뒤에 추가해도 대표가 바뀌지 않아 같은 신고서가 같은 record를 갱신한다.
 * 이 파일은 `title-generator`를 import하지 않는다(순환 방지) — 날짜는 원문(`YYYY-MM-DD`)으로 돌려주고 포맷은 호출부가 한다.
 */
import { COUNTRY_OPTIONS } from "@/components/calc/foreign/foreign-options";
import { isForeignRealEstateForm } from "@/lib/calc/transfer-foreign-scope";

export interface ForeignRepresentative {
  /** 소재 국가 짧은 이름(「미국」) — `기타`·미선택은 null */
  country: string | null;
  /** `소재지` 자유 텍스트(앞뒤 공백 제거) — 비면 null. **dedup 키의 물건 식별자**다(⑧이 필수로 막는 이유) */
  address: string | null;
  /** 대표 자산의 양도일 원문 — 비면 null */
  transferDate: string | null;
  /** 국외 자산 카드 수 — 제목의 「외 N건」 */
  assetCount: number;
}

type Row = Record<string, unknown>;

const asRows = (v: unknown): Row[] =>
  Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r === "object") : [];

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** `미국 (USD)` → `미국`. `기타`·모르는 코드는 null — 국가가 정보가 아닌 값은 제목에 싣지 않는다. */
function countryName(code: string): string | null {
  if (!code || code === "OTHER") return null;
  const label = COUNTRY_OPTIONS.find((o) => o.value === code)?.label;
  return label ? label.replace(/\s*\(.*\)\s*$/, "") : null;
}

/** 국외 폼이면 대표(첫 국외 자산)를, 아니면 null. */
export function extractForeignRepresentative(input: Record<string, unknown>): ForeignRepresentative | null {
  if (!isForeignRealEstateForm(input as { assetLocation?: "domestic" | "foreign" })) return null;
  const assets = asRows(input.foreignAssets);
  const first = assets[0] ?? {};
  return {
    country: countryName(text(first.countryCode)),
    address: text(first.address) || null,
    transferDate: text(first.transferDate) || null,
    assetCount: assets.length,
  };
}

/** 소재 국가 + 소재지 — 제목·키 공용. 소재지가 비면 null(키를 만들지 않는다). */
export function foreignPlace(rep: ForeignRepresentative): string | null {
  if (!rep.address) return null;
  return [rep.country, rep.address].filter(Boolean).join(" ");
}

const MONEY_ROW_CELLS = ["date", "amountForeign", "exchangeRate"] as const;

function assetHasInput(a: Row): boolean {
  const cells = ["address", "transferDate", "transferAmount", "transferRate", "acquisitionDate", "acquisitionAmount", "acquisitionRate"];
  if (cells.some((k) => text(a[k]) !== "")) return true;
  // 국가 선택은 입력이다 — 단, 통화 기본값(USD)·종류 기본값(land)은 사용자가 만든 입력이 아니라서 보지 않는다
  if (text(a.countryCode) !== "") return true;
  return (["capitalRows", "costRows", "taxRows"] as const).some((k) =>
    asRows(a[k]).some((r) => MONEY_ROW_CELLS.some((c) => text(r[c]) !== "")),
  );
}

/**
 * 국외 폼에 사용자가 넣은 값이 하나라도 있는가 — `isTransferFormEmpty`의 국외 판정.
 * 국내 판정(`양도일 + assets[]`)은 국외 폼에서 항상 «비었다»로 읽혀 수동 저장이 막힌다(UI 계획 V-7).
 */
export function hasForeignInput(form: { foreignResidenceYears?: unknown; foreignAssets?: unknown }): boolean {
  if (text(form.foreignResidenceYears) !== "") return true;
  return asRows(form.foreignAssets).some(assetHasInput);
}

/**
 * 이력의 「세율 기준일」 — 국외는 결과의 `appliedLawDate`(가장 늦은 양도일)와 같은 날. 자산이 비면 "".
 * 문자열 비교로 충분하다(`YYYY-MM-DD`는 사전순 = 시간순).
 */
export function foreignTaxLawVersion(form: { foreignAssets?: unknown }): string {
  return asRows(form.foreignAssets)
    .map((a) => text(a.transferDate))
    .filter((d) => d !== "")
    .reduce((latest, d) => (d > latest ? d : latest), "");
}
