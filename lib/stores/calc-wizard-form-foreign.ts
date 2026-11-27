/**
 * 국외자산 부동산 양도소득세(소득세법 §118의2~§118의8) 폼 슬라이스 — ①타입 · ②initial · ③normalize
 *
 * 계획서: `docs/02-design/features/transfer-foreign-realestate.ui.plan.md` §6.1 · U1 확정(§13).
 *
 * - **폼 전역**이다. 국내 `assets[]`는 건드리지 않는다 — 「국내 ↔ 국외」를 오가도 국내 입력이 사라지지 않는다(D-2·D-4).
 *   숨은 쪽 값은 지우지 않고, 전송(④)·검증(⑧)이 `isForeignRealEstateForm`(`lib/calc/transfer-foreign-scope.ts`)으로 게이트한다.
 * - 국외 자산은 **여러 건**(사용자 결정 C-1 · 최대 `FOREIGN_RE_MAX_ASSETS`)이고 거주 연수는 **폼 전역 정수 1칸**(C-2)이다.
 * - 미등기 칸은 만들지 않는다(C-3 — 안내 카드만).
 * - 화면 기본값(`kind`·`foreignTaxMethod`)은 initial·normalize·④ 빌더·⑧이 **같은 값**(`land`·`credit`)을 쓴다(3중 패턴).
 */

/** 일자·외화 금액·기준환율 한 행 — 자본적지출·양도비·외국납부세액 공용(`ForeignDatedAmountRows`의 행과 같은 모양) */
export interface ForeignMoneyRowForm {
  date: string;
  amountForeign: string;
  exchangeRate: string;
}

/** 국외자산 종류 — 법 §118의2 1호(토지·건물) · 2호(부동산에 관한 권리). 2호는 계산하지 않는다(⑧ 차단). */
export type ForeignAssetKindForm = "land" | "building" | "right";

export interface ForeignAssetForm {
  /** 화면 키(React key) — 엔진으로는 「국외자산 N」 라벨을 id로 보낸다(④ 빌더) */
  id: string;
  kind: ForeignAssetKindForm;
  /** 소재 국가 코드(`COUNTRY_OPTIONS`) — 표시·이력용, 계산 무관. 빈 값 = 미선택 */
  countryCode: string;
  /** 소재지(자유 텍스트) — 이력 식별용 */
  address: string;
  /** 양도일(YYYY-MM-DD) — 이 자산의 양도가액 수령일로도 쓴다 */
  transferDate: string;
  /** 통화 코드(3자리 영문 대문자) — 이 자산의 모든 외화 항목에 같은 통화(UQ-6) */
  currency: string;
  transferAmount: string;
  transferRate: string;
  /** 취득일(YYYY-MM-DD) — 취득가액 지출일로도 쓴다 */
  acquisitionDate: string;
  acquisitionAmount: string;
  acquisitionRate: string;
  capitalRows: ForeignMoneyRowForm[];
  costRows: ForeignMoneyRowForm[];
  /** 외국납부세액 납부 내역 — `foreignTaxEnabled` ON일 때만 전송·검증된다 */
  taxRows: ForeignMoneyRowForm[];
}

export interface ForeignRealEstateFormSlice {
  /** 자산 소재 — 폼 전역 라디오. 기본 `"domestic"` */
  assetLocation: "domestic" | "foreign";
  /** 양도일까지 계속 국내에 주소·거소를 둔 연수 — 폼 전역 정수 1칸(C-2). 빈 값 = 미입력 */
  foreignResidenceYears: string;
  foreignAssets: ForeignAssetForm[];
  foreignTaxEnabled: boolean;
  /** 법 §118의6① — 신고(과세기간) 단위 택일 */
  foreignTaxMethod: "credit" | "expense";
}

export const FOREIGN_ASSET_KIND_DEFAULT: ForeignAssetKindForm = "land";
export const FOREIGN_TAX_METHOD_DEFAULT: ForeignRealEstateFormSlice["foreignTaxMethod"] = "credit";

let foreignAssetSeq = 0;

/** 새 국외 자산 카드 — 통화 기본 USD(교재·다수 사례), 국가는 미선택 */
export function makeDefaultForeignAsset(): ForeignAssetForm {
  foreignAssetSeq += 1;
  return {
    id: `fre-${Date.now().toString(36)}-${foreignAssetSeq}`,
    kind: FOREIGN_ASSET_KIND_DEFAULT,
    countryCode: "",
    address: "",
    transferDate: "",
    currency: "USD",
    transferAmount: "",
    transferRate: "",
    acquisitionDate: "",
    acquisitionAmount: "",
    acquisitionRate: "",
    capitalRows: [],
    costRows: [],
    taxRows: [],
  };
}

/** `defaultFormData`에 펼치는 초기값 — 배열은 사용처가 새 카드로 갈아 끼운다(`createDefaultTransferFormData`) */
export const FOREIGN_RE_INITIAL: ForeignRealEstateFormSlice = {
  assetLocation: "domestic",
  foreignResidenceYears: "",
  foreignAssets: [makeDefaultForeignAsset()],
  foreignTaxEnabled: false,
  foreignTaxMethod: FOREIGN_TAX_METHOD_DEFAULT,
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function normalizeRows(v: unknown): ForeignMoneyRowForm[] {
  if (!Array.isArray(v)) return [];
  return v.map((r) => {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    return { date: str(o.date), amountForeign: str(o.amountForeign), exchangeRate: str(o.exchangeRate) };
  });
}

function normalizeForeignAsset(v: unknown): ForeignAssetForm {
  const base = makeDefaultForeignAsset();
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const kind = o.kind === "land" || o.kind === "building" || o.kind === "right" ? o.kind : FOREIGN_ASSET_KIND_DEFAULT;
  return {
    id: str(o.id) || base.id,
    kind,
    countryCode: str(o.countryCode),
    address: str(o.address),
    transferDate: str(o.transferDate),
    currency: typeof o.currency === "string" ? o.currency : base.currency,
    transferAmount: str(o.transferAmount),
    transferRate: str(o.transferRate),
    acquisitionDate: str(o.acquisitionDate),
    acquisitionAmount: str(o.acquisitionAmount),
    acquisitionRate: str(o.acquisitionRate),
    capitalRows: normalizeRows(o.capitalRows),
    costRows: normalizeRows(o.costRows),
    taxRows: normalizeRows(o.taxRows),
  };
}

/**
 * ③ sessionStorage·이력·다건 자산 폼 복원 보정 — 필드가 없는 구 세션은 기본값, 모양이 깨진 값(비배열·잘못된 enum)은 기본값으로.
 * `...defaultFormData, ...raw` 병합이 스칼라 신규 필드는 채워 주지만 배열·enum의 깨진 값은 거르지 못한다.
 * 국외 카드가 0건이면(복원 후) 빈 카드 1건을 둔다 — 「국외」를 고른 화면이 빈 목록으로 열리지 않게.
 */
export function normalizeForeignRealEstate<T extends ForeignRealEstateFormSlice>(form: T): T {
  const rawAssets = (form as { foreignAssets?: unknown }).foreignAssets;
  const assets = Array.isArray(rawAssets) ? rawAssets.map(normalizeForeignAsset) : [];
  const method = (form as { foreignTaxMethod?: unknown }).foreignTaxMethod;
  const location = (form as { assetLocation?: unknown }).assetLocation;
  return {
    ...form,
    assetLocation: location === "foreign" ? "foreign" : "domestic",
    foreignResidenceYears: str(form.foreignResidenceYears),
    foreignAssets: assets.length > 0 ? assets : [makeDefaultForeignAsset()],
    foreignTaxEnabled: form.foreignTaxEnabled === true,
    foreignTaxMethod: method === "expense" ? "expense" : FOREIGN_TAX_METHOD_DEFAULT,
  };
}
