/**
 * 조특법 §71의2① 인구감소지역주택 — 양도세 1주택 판정에서 **소유주택이 아닌 것으로 보는** 주택을 명부에서 도출한다 (결정 #42 · S14a-4).
 *
 * ## 무엇이 문제였나
 *
 * 자동화 계획서는 §71의2를 「종부세 축」이라며 뺐다. 그러나 ①은 소득세법 §89①3호·4호를 적용하는 **양도세 규정**이다.
 * 노원 1주택 세대가 평창 인구감소지역주택(2024.3.1. 취득, 기준시가 2억)을 산 뒤 노원 주택(8억)을 양도하면, 일시적 2주택(§155①)이
 * 받쳐 주지 않는 구간에서는 고지 없이 과세로 나왔다. 명부 ④ 카드(세컨드홈 `isPopulationDeclineArea`)는 **중과 주택 수 전용**이라 켜도
 * 비과세 판정을 바꾸지 못했다.
 *
 * ## 설계 (결정 #42 A + 하위 결정 가)
 *
 * - **선언·토글이 없다** — 「…소유주택이 아닌 것으로 보아 … 적용한다」는 강행 의제라 명부에서 도출한다(적용 여부를 사용자에게 고르게 하지 않는다).
 * - 신고서(조특령 §68의2②③)는 **요건으로 묻지 않고 제출 안내만** 한다 — 법률 ①에 신청 조건이 없고, 신청 의무(③)는 종부세 ②에만 있다.
 *   취득 확인은 세무서장이 행정정보로 하므로 §98의9와 달리 확인 게이트도 없다.
 * - 명부에 없는 **과거 사실**만 3상태로 묻는다: ① 취득 당시 1채(1개)만 보유했는가 ② 증여로 받았는가 ③ (종전 주택이 더 늦게 기록된 경우만)
 *   종전 주택을 권리로 받았는가. 「목록 미입력 = 없음」 결정과 충돌하지 않는다 — 지금의 목록이 아니라 지나간 사실이다.
 * - **모르면 불성립 + 확인 필요** — 결론을 가를 때만 알린다(`unconfirmed: true` → 판정 보류 고지 · 계산기 경고).
 * - 같은 행을 §99의4·§98의9·보유 감면주택·§155②③이 이미 뺐으면 한 번만 뺀다(houseId 기준).
 * - 중과 13·15호는 같은 문형인 §98의9와 같이 「확인된 조특 제외」에 넣는다(`SPECIAL_ACT_15HO_VERIFIED_ARTICLES`).
 *
 * ## 요건 (조특법 §71의2① · 조특령 §68의2① 현행 MST 288915 실독)
 *
 * | 요건 | 처리 |
 * |---|---|
 * | 취득기간 2024.1.4.~2026.12.31. | 밖이면 후보가 아니다(침묵) |
 * | 취득 당시 인구감소지역 소재(수도권 접경 제외 수도권·광역시 군 제외 광역시 불가) | `population-decline-areas.ts` 판정 재사용 — 중과 ④와 같은 인자(`isPopulationDeclineArea ?? 자동판정`) |
 * | 관심지역(2호): 수도권 밖 · 광역시 제외 | 법률 부칙 제21223호 제14조 — 2025.11.28. 이후 취득분만. 시행령 2호 신설(제36127호 2026.2.27.)의 적용례를 확인하지 못해 **2025.11.28.~2026.2.26. 취득분은 미적용 + 확인 필요** |
 * | 가액(취득일 현재 기준시가): 수도권 밖 인구감소 9억 / 수도권 접경 4억 / 관심 4억 | 2025.8.14. 전 취득분은 4억 단일(시행령 제35877호 부칙 제3조) — 가액은 `acquisitionOfficialPrice` 재사용, 미입력이면 불성립 + 확인 필요 |
 * | 취득 전 보유 주택(권리는 공급 주택)과 동일 시·군·구 제외 | `normalizeSigunguCode`로 비교(전남·광주·전북 코드 개편 별칭). 비교할 수 없으면 불성립 + 확인 필요 |
 * | 취득 전 1채(1개)만 보유 | 명부에 이미 둘 이상이면 불성립(침묵) · 아니면 3상태 질문 — 그래서 후보는 사실상 1채로 좁혀진다 |
 * | 인구감소지역주택을 취득한 **후** 종전 주택 양도 | 양도일 ≤ 취득일이면 불성립(침묵). 같은 날 취득은 양도 후 취득으로 본다(확정 결정) |
 * | 종전 주택이 인구감소지역주택보다 먼저 | 늦게 기록됐으면 권리 유래인지 묻고, 권리를 가진 날로 선후를 본다. 모르면 불성립 + 확인 필요 |
 * | 상속·증여로 받은 인구감소지역주택 | 국세청 해석 2건(서면-2025-법규재산-1621 · 2010)은 **별도세대**로부터 취득한 경우에 적용한다고 회신했다 — 피상속인·증여자의 세대(`popDeclDonorHousehold` — 상속 행은 ④가 「상속 정보」의 피상속인 세대 한 칸에서 옮긴다·#42-2)가 별도세대면 적용, 같은 세대면 미적용 + 확인 필요, 모름·미답은 불성립 + 확인 필요 |
 * | 다른 특례와 겹쳐야만 비과세 | 2026.6.11. 해석(분양권 특례 중첩)의 본문 미확인 — 이 의제 하나로 종전 주택 한 채만 남을 때만 적용, 겹치면 미적용 + 확인 필요 |
 *
 * 범위 밖(결정 #42 조건): 부담부증여 양도 경로(조특 주택 수 제외가 원래 전부 빠진 별개 공백) · 종부세 §71의2② · 명부 세컨드홈 카드(④)의 「등록」 토글.
 */
import { TRANSFER } from "../legal-codes";
import { classifyPopulationDeclineArea, toSigunguCode } from "../data/population-decline-areas";
import type { HouseInfo } from "../types/multi-house-surcharge.types";
import type { TransferTaxInput } from "../types/transfer.types";
import { resolveInheritedSellingHouseId } from "../transfer-inheritance-exclusion";
import type { SpecialHouseExclusionEntryResult } from "./unsold-hybrid-p5";
import { isCapitalAreaByRegionCode } from "@/lib/geo/rural-house-location";
import { normalizeSigunguCode } from "@/lib/geo/sigungu-code-alias";

export const POP_DECLINE_71_2_ARTICLE = "pop_decline_71_2" as const;
/** 판정 보류 고지 id — 판정 메뉴 「판정하지 않은 부분」과 계산기 경고가 같은 문장을 쓴다(`era-undetermined.ts`). */
export const POP_DECLINE_71_2_UNCONFIRMED_ID = "71-2-pop-decline-unconfirmed";
const LABEL = "인구감소지역주택(조특법 §71의2①)";

/** 조특법 §71의2① 「2024년 1월 4일부터 2026년 12월 31일까지의 기간 중」 취득 */
export const POP_DECLINE_WINDOW_START = new Date("2024-01-04");
export const POP_DECLINE_WINDOW_END = new Date("2026-12-31");
/** 시행령 제35877호 부칙 제3조 — 이 날 이후 취득분부터 수도권 밖 인구감소지역 9억 / 수도권 4억(그 전 취득분은 4억 단일) */
export const POP_DECLINE_CAP_SPLIT_FROM = new Date("2025-08-14");
/** 법률 제21223호 부칙 제14조 — 인구감소관심지역은 2025.11.28. 이후 취득분부터 */
export const POP_DECLINE_INTEREST_ACQ_FROM = new Date("2025-11-28");
/** 시행령 제36127호(2026.2.27.)가 관심지역 호를 신설 — 그 전 시행본(MST 282999)에는 호가 없다. 적용례는 확인하지 못했다. */
export const POP_DECLINE_INTEREST_DECREE_FROM = new Date("2026-02-27");
const CAP_4 = 400_000_000;
const CAP_9 = 900_000_000;

/** 평가에 쓰는 행 — 엔진 명부(`HouseInfo`)의 부분집합. */
export type PopDeclineHouse = Pick<
  HouseInfo,
  | "id"
  | "acquisitionDate"
  | "regionCode"
  | "acquisitionOfficialPrice"
  | "isInherited"
  | "isPopulationDeclineArea"
  | "populationAreaType"
  | "popDeclSoleAtAcquisition"
  | "popDeclAcquiredByGift"
  | "popDeclDonorHousehold"
  | "popDeclPriorRight"
  | "popDeclPriorRightDate"
>;

export interface PopDeclineInput {
  /** 양도 주택 행을 포함한 명부(양도일 현재 보유 행) */
  houses: readonly PopDeclineHouse[];
  sellingHouseId: string;
  transferDate: Date;
  /** 분양권·조합원입주권 목록 — 인구감소지역주택 취득 전에 보유한 권리도 「1개」 보유로 센다 */
  presaleRights: readonly { acquisitionDate: Date; regionCode?: string }[];
  /** 이미 다른 주택 수 제외(조특법 선언·§99의4·§98의9·§155②③)로 빠진 행 id — 같은 행을 두 번 빼지 않는다 */
  alreadyExcludedIds: ReadonlySet<string>;
  /** 이 평가 전에 다른 제외로 빠진 주택 수 — 겹침 판정 */
  otherExcludedCount: number;
  /** 세대 보유 주택 수(제외 전). 양도 대상이 주택이면 양도 주택 포함 */
  householdHousingCount: number;
  /** 양도 대상이 §89①3호의 「주택」인가 — 입주권 양도(§89①4호)는 다른 주택이 0채가 남아야 한다 */
  sellingIsHousing: boolean;
}

export interface PopDeclineResult {
  entries: SpecialHouseExclusionEntryResult[];
  excludedCount: number;
}

const day = (d: Date) => Math.floor(d.getTime() / 86_400_000);
const fmt = (d: Date) => `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}.`;

/**
 * 판정 보류 고지 문장 — 주택 양도(`era-undetermined.ts`)·입주권 양도(`right-sale-special-act-exclusion.ts`) 판정 메뉴와
 * 계산기 경고가 같은 문장을 쓴다.
 */
export function popDeclineUnconfirmedNotice(reasons: readonly string[]): string {
  return (
    `${TRANSFER.POP_DECLINE_HOUSE_71_2}(인구감소지역주택을 소유주택이 아닌 것으로 봄) 후보가 있으나 적용하지 않았습니다 — ${reasons.join(" ")} ` +
    "확인 필요 — 사실을 확인해 답을 고르면 다시 판정합니다."
  );
}

/** 신고서 제출 안내 — 요건이 아니라 안내다(법률 ①에 신청 조건이 없다). */
export const POP_DECLINE_FILING_NOTICE =
  `양도소득과세표준신고와 함께 과세특례신고서를 제출해야 하며(${TRANSFER.POP_DECLINE_HOUSE_DECREE_68_2}②), ` +
  "인구감소지역주택 취득 전에 조합원입주권·분양권을 보유했다면 그 보유를 증명하는 서류를 함께 냅니다(③).";

function entry(
  h: PopDeclineHouse,
  eligible: boolean,
  extra: { reason?: string; unconfirmed?: boolean } = {},
): SpecialHouseExclusionEntryResult {
  return {
    article: POP_DECLINE_71_2_ARTICLE,
    houseId: h.id,
    articleLabel: LABEL,
    eligible,
    legalBasis: TRANSFER.POP_DECLINE_HOUSE_71_2,
    ...(eligible ? { notice: POP_DECLINE_FILING_NOTICE } : {}),
    ...(extra.reason ? { reason: extra.reason } : {}),
    ...(extra.unconfirmed ? { unconfirmed: true } : {}),
  };
}

/**
 * 상속·증여로 받은 행인가 — 「피상속인·증여자가 별도세대인가」를 읽는 범위(`popDeclDonorHousehold`). 질문은 증여 행에만 따로 있고
 * 상속 행은 「상속 정보」의 피상속인 세대 칸(§155②와 같은 답)을 ④가 옮긴다.
 * ⑤ 위젯의 노출 게이트와 API 변환(`transfer-tax-api-houses.ts`)이 같은 술어를 쓴다.
 */
export function popDeclineAcquiredFromOther(h: Pick<PopDeclineHouse, "isInherited" | "popDeclAcquiredByGift">): boolean {
  return h.isInherited === true || h.popDeclAcquiredByGift === "yes";
}

/** 후보 한 행 — `null`이면 후보가 아니다(침묵). */
function evaluate(h: PopDeclineHouse, p: PopDeclineInput): SpecialHouseExclusionEntryResult | null {
  const acq = h.acquisitionDate;
  if (acq.getTime() < POP_DECLINE_WINDOW_START.getTime() || acq.getTime() > POP_DECLINE_WINDOW_END.getTime()) return null;

  const code = h.regionCode;
  const auto = code ? classifyPopulationDeclineArea(code).kind : null;
  // 소재지는 중과 ④와 같은 인자로 읽는다 — `isPopulationDeclineArea ?? 자동판정`, `populationAreaType ?? 자동판정`(진실이 둘이 되지 않게).
  const isPop = h.isPopulationDeclineArea ?? auto !== null;
  if (!isPop) return null;
  const kind = h.populationAreaType ?? auto;
  const unconfirmed: string[] = [];

  if (!code) {
    unconfirmed.push("주소(법정동코드)를 입력하지 않아 수도권·광역시·동일 시·군·구 여부를 판단할 수 없습니다.");
  }
  if (!kind) {
    unconfirmed.push("인구감소지역인지 인구감소관심지역인지 판정할 수 없습니다.");
  }
  if (kind === "interest") {
    // 법률 부칙 제21223호 제14조 — 2025.11.28. 이후 취득분. 그 전은 침묵(적용 대상이 아니다).
    if (acq.getTime() < POP_DECLINE_INTEREST_ACQ_FROM.getTime()) return null;
    // 시행령 2호 신설(2026.2.27.)의 적용례를 확인하지 못했다 — 갭 구간은 미적용 + 확인 필요.
    if (acq.getTime() < POP_DECLINE_INTEREST_DECREE_FROM.getTime()) {
      unconfirmed.push(
        `인구감소관심지역 주택을 ${fmt(POP_DECLINE_INTEREST_ACQ_FROM)}~2026.2.26.에 취득한 경우는 시행령 개정(제36127호)의 부칙 적용례를 확인하지 못했습니다.`,
      );
    }
  }
  if (code && isCapitalAreaByRegionCode(code) === true && kind === "interest") return null; // 관심지역은 수도권 밖만

  // 양도일은 취득일 뒤여야 한다(같은 날 취득은 양도 후 취득으로 본다 — 확정 결정).
  if (day(p.transferDate) <= day(acq)) return null;

  const selling = p.houses.find((o) => o.id === p.sellingHouseId);
  // 종전 주택이 인구감소지역주택보다 먼저 있어야 한다 — 늦게 기록됐으면 권리로 받은 집인지 묻는다.
  if (!selling || day(selling.acquisitionDate) >= day(acq)) {
    const state = h.popDeclPriorRight;
    if (state === "no") return null;
    if (state === "yes" && h.popDeclPriorRightDate) {
      if (day(h.popDeclPriorRightDate) >= day(acq)) return null;
    } else if (state === "yes") {
      unconfirmed.push("종전 주택을 분양권·조합원입주권으로 받았다면 그 권리를 가진 날을 입력해야 선후를 알 수 있습니다.");
    } else {
      unconfirmed.push("종전 주택이 이 주택보다 늦게 취득된 것으로 기록돼 있습니다 — 종전 주택을 분양권·조합원입주권으로 받았는지 모르거나 답하지 않았습니다.");
    }
  }

  // 취득 전 보유 1채(1개) — 양도 주택 외에 먼저 가진 주택·권리가 명부에 있으면 이미 둘 이상이다.
  const priorOthers = p.houses.filter((o) => o.id !== h.id && o.id !== p.sellingHouseId && day(o.acquisitionDate) <= day(acq));
  const priorRights = p.presaleRights.filter((r) => day(r.acquisitionDate) <= day(acq));
  if (priorOthers.length + priorRights.length > 0) return null;
  const sole = h.popDeclSoleAtAcquisition;
  if (sole === "no") return null;
  if (sole !== "yes") unconfirmed.push("인구감소지역주택을 취득할 당시 1채(또는 1개)만 보유했는지 모르거나 답하지 않았습니다.");

  // 동일 시·군·구 — 코드 개편 별칭을 반영해 비교한다. 비교할 수 없으면 불성립 + 확인 필요.
  if (code) {
    const sellingCode = selling?.regionCode;
    if (!sellingCode) {
      unconfirmed.push("종전 주택의 주소(법정동코드)를 입력하지 않아 동일 시·군·구 여부를 비교할 수 없습니다.");
    } else if (normalizeSigunguCode(sellingCode) === normalizeSigunguCode(code) && toSigunguCode(sellingCode) !== null) {
      return null; // 취득 전 보유 주택과 같은 시·군·구
    }
  }

  // 가액 한도 — 취득일 현재 기준시가(명부의 「취득 당시 공시가격」 재사용). 2025.8.14. 전 취득분은 4억 단일이다.
  const price = h.acquisitionOfficialPrice;
  if (price === undefined || !(price > 0)) {
    unconfirmed.push("취득 당시 공시가격(기준시가)을 입력하지 않아 가액 한도를 판단할 수 없습니다.");
  } else if (kind) {
    const capital = code ? isCapitalAreaByRegionCode(code) : null;
    const cap =
      kind === "interest" || acq.getTime() < POP_DECLINE_CAP_SPLIT_FROM.getTime() || capital === true
        ? CAP_4
        : capital === false
          ? CAP_9
          : undefined; // 수도권 여부를 모른다(주소 미입력) — 4억과 9억 사이면 판단할 수 없다
    if (cap !== undefined) {
      if (price > cap) return null;
    } else if (price > CAP_4) {
      unconfirmed.push("수도권 여부를 알 수 없어(주소 미입력) 가액 한도(수도권 4억·수도권 밖 9억)를 판단할 수 없습니다.");
    }
  }

  // 상속·증여로 받은 인구감소지역주택 — 국세청 해석은 **별도세대**로부터 취득한 경우만 적용한다고 회신했다
  // (서면-2025-법규재산-1621 상속 · 서면-2025-법규재산-2010 증여). 같은 세대로부터 받은 경우는 해석이 없어 미적용 + 확인 필요,
  // 피상속인·증여자의 세대를 모르거나 답하지 않았으면 불성립 + 확인 필요다(원칙 1·4).
  // 상속으로 받은 행에는 「증여로 받았습니까」가 무의미하다(⑤ 위젯도 묻지 않는다) — 미답이어도 사유를 넣지 않는다.
  if (h.isInherited !== true && h.popDeclAcquiredByGift !== "yes" && h.popDeclAcquiredByGift !== "no") {
    unconfirmed.push("인구감소지역주택을 증여로 취득했는지 모르거나 답하지 않았습니다.");
  }
  if (popDeclineAcquiredFromOther(h)) {
    const kindLabel = h.isInherited === true ? "상속" : "증여";
    if (h.popDeclDonorHousehold === "same") {
      unconfirmed.push(
        `${kindLabel}으로 받은 인구감소지역주택에 이 특례를 적용한다고 밝힌 국세청 해석은 피상속인·증여자가 별도세대인 경우뿐이라(서면-2025-법규재산-1621·2010) 같은 세대로부터 받은 경우에는 적용하지 않았습니다.`,
      );
    } else if (h.popDeclDonorHousehold !== "separate") {
      unconfirmed.push(
        `${kindLabel}으로 받은 인구감소지역주택은 해석이 있는 피상속인·증여자 별도세대 경우만 이 특례를 적용합니다 — 취득 당시 별도세대였는지 모르거나 답하지 않아 적용하지 않았습니다.`,
      );
    }
  }

  // 다른 특례와 겹쳐야만 비과세가 되는 경우 — 해석 본문 미확인
  const remaining = p.householdHousingCount - 1;
  const targetRemaining = p.sellingIsHousing ? 1 : 0;
  if (p.otherExcludedCount > 0 || remaining !== targetRemaining) {
    unconfirmed.push(
      "다른 주택 수 제외·일시적 2주택 등 다른 특례와 겹쳐야만 1세대1주택이 되는 경우에 이 특례를 함께 적용할 수 있는지 밝힌 국세청 해석(2026.6.11.)의 본문을 확인하지 못했습니다.",
    );
  }

  if (unconfirmed.length === 0) return entry(h, true);
  return entry(h, false, { reason: unconfirmed.join(" "), unconfirmed: true });
}

export function resolvePopulationDecline71_2(p: PopDeclineInput): PopDeclineResult {
  const entries: SpecialHouseExclusionEntryResult[] = [];
  for (const h of p.houses) {
    if (h.id === p.sellingHouseId || p.alreadyExcludedIds.has(h.id)) continue;
    const e = evaluate(h, p);
    if (e) entries.push(e);
  }
  // 「인구감소지역주택 1채」 — 요건을 모두 갖춘 후보가 둘 이상이면(서로를 보유로 세지 않는 같은 날 취득 등) 어느 것도 뺄 수 없다.
  const eligible = entries.filter((e) => e.eligible);
  if (eligible.length > 1) {
    return {
      entries: entries.map((e) =>
        e.eligible
          ? { ...e, eligible: false, unconfirmed: true, notice: undefined, reason: "요건을 갖춘 인구감소지역주택이 둘 이상이라 어느 한 채를 소유주택으로 보지 않을지 정할 수 없습니다(법은 「1채」를 취득한 경우만 정한다)." }
          : e,
      ),
      excludedCount: 0,
    };
  }
  return { entries, excludedCount: eligible.length };
}

/**
 * 엔진 입력에서 평가한다 — 주택 양도(STEP 0.9 `resolveExemptionHouseCountExclusions`)와 입주권 양도(가·나목
 * `resolveRightSaleSpecialExclusion`)가 함께 쓴다. 두 경로는 「이미 다른 제외로 빠진 것」만 다르다 — 입주권 양도는
 * 해석례로 확인된 보유 감면주택 조문 선언만 「다른 주택」에서 빼고 §99의4·§98의9·§155②③은 빼지 않는다.
 */
export function resolvePopulationDecline71_2FromInput(
  input: Pick<
    TransferTaxInput,
    "isOneHousehold" | "houses" | "sellingHouseId" | "transferDate" | "presaleRights" | "householdHousingCount" | "propertyType"
  >,
  already: { ids: ReadonlySet<string>; count: number },
): PopDeclineResult {
  const sellingHouseId = resolveInheritedSellingHouseId(input);
  if (!input.isOneHousehold || !sellingHouseId || !input.houses || input.houses.length === 0) return { entries: [], excludedCount: 0 };
  return resolvePopulationDecline71_2({
    houses: input.houses,
    sellingHouseId,
    transferDate: input.transferDate,
    presaleRights: input.presaleRights ?? [],
    alreadyExcludedIds: already.ids,
    otherExcludedCount: already.count,
    householdHousingCount: input.householdHousingCount,
    sellingIsHousing: input.propertyType !== "right_to_move_in",
  });
}
