/**
 * 주택 부수토지 세율 보유기간 — **구주택 멸실·신축 통산** 순수 leaf (해석 (5)).
 *
 * 설계: docs/02-design/features/appurtenant-land-rebuild-rate-basis.engine.design.md
 * 계획서: docs/00-pm/appurtenant-land-rebuild-rate-basis.plan.md (§사용자 결정 Q-1~Q-9)
 *
 * ── 법적 근거 (국세청 상세 페이지 판독본 대조) ──────────────────────────────
 *  · 서면법규과-1222 (2014.11.19.) — 구주택 멸실 후 신축 주택을 양도하면 주택 부수토지의 보유기간은
 *    구주택과 신축주택의 부수토지 **기간을 합하여** 본다.
 *  · 사전-2023-법규재산-0097 (2023.6.15.) — 「구주택의 주택부수토지와 신축주택의 주택부수토지 기간을 통산하여
 *    2년 이상인 경우」 §104①1호 세율. 전제: 신축 취득일은 영 §162①4호, 구주택·신축주택의 **정착면적은 늘지 않았을 것**.
 *    ⚠️ 회신은 **2년 이상**인 경우만 직접 답했다 — 2년 미만(60%·70%) 구간은 §104①2·3호 괄호의 같은 기준
 *    (「주택부수토지로서의 보유기간」, 기재부 재산세제과-1354)에 따른 **확장 적용**이다(결과에 확인 필요 고지).
 *
 * ── 호스트 두 곳 (2026-10-19 사용자 결정) ───────────────────────────────────
 *  · 건물 신축(`newConstruction`) — 토지는 다른 원인(상속·증여)으로 취득.
 *  · 매매(`purchase`) + 토지·건물 취득일 분리 — 「매수한 토지 + 그 위에 신축한 주택」(서면법규과-1222의 사실관계)의 관례 입력 경로. 건물 취득일이 곧
 *    신축 건물의 취득일(자기가 건설한 건축물의 취득시기 — 영 §162①4호)이다. 토지 상속·증여 overlay가 있는 매매는 «건물을 산 것»이라 받지 않는다.
 *
 * ── 이번 범위가 아닌 것 ─────────────────────────────────────────────────────
 *  · 나대지·상가 철거 후 신축((7) 계열 — 구주택이 없다)은 입력이 없으므로 현행 `max(토지, 주택 취득일)` 그대로다.
 *  · 비과세 보유·거주기간 통산(영 §154⑧)·장기보유특별공제 보유기간 통산은 이 leaf가 다루지 않는다(고지만).
 *  · 함께 양도 컴패니언 토지 카드·겸용주택 경로는 이 입력을 받지 않는다(⑫가 400으로 거부).
 *
 * 이 파일은 `resolveAppurtenantLandRateBasisDate`(transfer-tax-appurtenant-land.ts)가 부르는 **순수 함수**와
 * 엔진·⑫·⑧이 공유하는 입력 검증 사실(`LandRebuildFacts`)만 담는다 — 토지 법정 기산일(`resolveLandRateBasis`)은 호출부가 넘긴다
 * (순환 import 방지 + 판정 단일 소스).
 */
import { calculateHoldingPeriod, coerceOptionalDate } from "./tax-utils";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import type { TransferTaxInput } from "./types/transfer.types";

/** 구주택이 토지 취득 때부터 있었는가(`since_land`) / 토지 취득 뒤에 생겼는가(`later` — 날짜 필수). */
export type LandRebuildStartMode = "since_land" | "later";

/** 엔진 입력 — 같은 토지 위 **본인 소유 구주택**을 멸실하고 신축한 주택을 양도하는 경우(split 주택 + 건물 신축 호스트, 또는 매매 + 토지·건물 취득일 분리 호스트 — 토지 상속·증여 overlay가 없는 매매). */
export interface LandRebuildPriorHouse {
  startMode: LandRebuildStartMode;
  /** `later`일 때만(필수) — 구주택 부수토지 기간의 시작일(본인 소유 개시일). `since_land`에서는 보낼 수 없다 */
  priorHouseStartDate?: Date;
  /** 구주택 멸실일(구주택 부수토지 기간의 끝). 신축 취득일(영 §162①4호)보다 앞서야 한다 */
  demolitionDate: Date;
  /** 신축주택의 정착면적이 구주택보다 늘지 않았음을 확인했는가 — `true`가 아니면 계산하지 않는다(사전-2023-법규재산-0097 전제) */
  footprintUnchanged: boolean;
}

export interface LandRebuildPeriod {
  from: Date;
  to: Date;
  /** `calculateHoldingPeriod`(초일 산입) 규약의 `years*12+months` — 남는 일수는 버린다 */
  months: number;
}

export interface LandRebuildAggregation {
  /** 구주택 부수토지 기간 [시작일, 멸실일] */
  priorHouse: LandRebuildPeriod;
  /** 신축주택 부수토지 기간 [신축 취득일, 양도일] — 멸실~신축 취득일(나대지) 공백은 산입하지 않는다 */
  newHouse: LandRebuildPeriod;
  totalMonths: number;
  /** `calculateHoldingPeriod(E, 양도일)`의 `years*12+months`가 정확히 `totalMonths`가 되는 **등가 기산일** — 하류 `calcTax`가 날짜를 받으므로 배관 변경이 없다 */
  equivalentBasisDate: Date;
  /** 구주택 시작일을 정한 근거 — `land_basis` 토지 §104② 법정 기산일(상속·이월과세 반영) / `input_date` 입력한 구주택 시작일 */
  startRule: "land_basis" | "input_date";
}

const DAY_MS = 86_400_000;

function monthsOf(from: Date, to: Date): number {
  const h = calculateHoldingPeriod(from, to);
  return h.years * 12 + h.months;
}

/**
 * 등가 기산일 E = 「양도일 다음날」에서 `months`개월을 뺀 날(UTC 달력, 해당일 없으면 말일).
 * 격자 실측(양도일 2010-01-01~2026-05, 개월 0~150, 906,000건)에서 UTC·Asia/Seoul 모두 불일치 0이다.
 * 그래도 TZ에 따라 `calculateHoldingPeriod`가 하루 어긋나는 환경이 있어 ±3일 안에서 정확히 `months`가 되는 날을 확인하고, 없으면 던진다(침묵 오차 금지).
 */
export function equivalentRateBasisDate(transferDate: Date, months: number): Date {
  const next = new Date(transferDate.getTime() + DAY_MS);
  const idx = next.getUTCFullYear() * 12 + next.getUTCMonth() - months;
  const y = Math.floor(idx / 12);
  const m = ((idx % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const base = new Date(Date.UTC(y, m, Math.min(next.getUTCDate(), lastDay)));
  for (const offset of [0, -1, 1, -2, 2, -3, 3]) {
    // 양도일보다 늦은 기산일은 만들지 않는다(개월 0 — 두 구간 합이 1개월 미만).
    const e = new Date(Math.min(base.getTime() + offset * DAY_MS, transferDate.getTime()));
    if (monthsOf(e, transferDate) === months) return e;
  }
  throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "구주택·신축주택 부수토지 기간의 통산 기산일을 확정하지 못했습니다", {
    field: "landRebuildPriorHouse",
  });
}

/**
 * 두 구간을 합산해 등가 기산일을 만든다. 입력 순서가 어긋나면(시작 > 멸실 ≥ 신축 취득일) 던진다 — ⑫·⑧·엔진 진입 leaf가 먼저 막으므로 직접 호출 방어다.
 * `landBasisDate`는 토지 파트의 §104② **법정 기산일**(`resolveLandRateBasis().date` — 상속 피상속인·이월과세 증여자 취득일 반영).
 */
export function aggregateLandRebuildPeriods(args: {
  landBasisDate: Date;
  rebuild: LandRebuildPriorHouse;
  newHouseAcquisitionDate: Date;
  transferDate: Date;
}): LandRebuildAggregation {
  const { landBasisDate, rebuild, newHouseAcquisitionDate, transferDate } = args;
  const demolition = coerceOptionalDate(rebuild.demolitionDate);
  const later = coerceOptionalDate(rebuild.priorHouseStartDate);
  if (!demolition) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, LAND_REBUILD_DEMOLITION_REQUIRED_MESSAGE, { field: "landRebuildPriorHouse.demolitionDate" });
  // 구주택 부수토지 기간은 토지 보유기간을 넘을 수 없다 — `later`가 토지 법정 기산일보다 앞서도 토지 법정 기산일부터다.
  const useInput = rebuild.startMode === "later" && !!later && later.getTime() > landBasisDate.getTime();
  const start = useInput ? later! : landBasisDate;
  if (start.getTime() > demolition.getTime() || demolition.getTime() >= newHouseAcquisitionDate.getTime()) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, LAND_REBUILD_ORDER_MESSAGE, { field: "landRebuildPriorHouse.demolitionDate" });
  }
  const priorHouse = { from: start, to: demolition, months: monthsOf(start, demolition) };
  const newHouse = { from: newHouseAcquisitionDate, to: transferDate, months: monthsOf(newHouseAcquisitionDate, transferDate) };
  const totalMonths = priorHouse.months + newHouse.months;
  return {
    priorHouse,
    newHouse,
    totalMonths,
    equivalentBasisDate: equivalentRateBasisDate(transferDate, totalMonths),
    startRule: useInput ? "input_date" : "land_basis",
  };
}

// ── 입력 검증 사실 · 위반 항목 (엔진 `calcSplitGain` 진입 · ⑫ · ⑧ 공유) ──────────────

export interface LandRebuildFacts {
  isHousing: boolean;
  /** 겸용주택 — 이 입력을 받지 않는다 */
  isMixedUse?: boolean;
  /** 이 입력을 받는 자리인가(컴패니언은 명시 `false`) — 생략·true = 받는다 */
  hostSupported?: boolean;
  /** 자산 단위 취득원인 = 주택 split 컨벤션상 **건물** 파트 원인 */
  buildingAcquisitionCause?: string;
  /**
   * 「토지는 다른 원인으로 취득」(토지 상속·증여) overlay — **건물 원인이 매매(`purchase`)일 때** 이 입력을 막는 사실이다.
   * 「건물은 매수, 토지는 상속·증여」는 건물을 산 것이지 같은 토지 위에 신축한 것이 아니다. 신축 호스트는 이 overlay가 오히려 호스트의 전제라 보지 않는다.
   * 생략·`""`·`"purchase"`(D2 호스트 잔재) = overlay 없음.
   */
  landAcquisitionCause?: string;
  /** 건물(신축) 취득일 YYYY-MM-DD */
  buildingAcquisitionDate?: string;
  hasLandAcquisitionDate: boolean;
  /** 토지 취득일 YYYY-MM-DD */
  landAcquisitionDate?: string;
  selfOwns?: string;
  isBurdenedGift?: boolean;
  /** 입력이 없으면 `undefined` — 검증은 전부 건너뛴다 */
  rebuild?: {
    startMode?: string;
    priorHouseStartDate?: string;
    demolitionDate?: string;
    footprintUnchanged?: boolean;
  };
}

export type LandRebuildField =
  | "landRebuildPriorHouse"
  | "landRebuildPriorHouse.startMode"
  | "landRebuildPriorHouse.priorHouseStartDate"
  | "landRebuildPriorHouse.demolitionDate"
  | "landRebuildPriorHouse.footprintUnchanged"
  | "landAcquisitionDate";

export interface LandRebuildIssue {
  field: LandRebuildField;
  message: string;
}

export const LAND_REBUILD_HOST_MESSAGE =
  "구주택 멸실·신축 통산은 주택(토지·건물 취득일이 다른 분리 계산)을 양도할 때만 입력할 수 있습니다 — 조용히 버려지지 않도록 막습니다 (서면법규과-1222, 2014.11.19.)";

export const LAND_REBUILD_COMPANION_MESSAGE =
  "함께 양도(일괄양도) 자산과 겸용주택에서는 구주택 멸실·신축 통산을 지원하지 않습니다 — 토지·건물 분리 입력의 단건·다건 주택 자산에서만 입력할 수 있습니다";

export const LAND_REBUILD_BUILDING_CAUSE_MESSAGE =
  "구주택 멸실·신축 통산은 건물을 신축(자가건축)한 주택, 또는 토지를 따로 취득(매매)한 뒤 그 위에 신축한 건물을 취득일을 달리해 입력한 매매 주택에서만 입력할 수 있습니다 — " +
  "상속·증여·이월과세로 받은 건물은 받지 않습니다. 신축 건물의 취득일은 자기가 건설한 건축물의 취득시기(사용승인서 교부일 등, 소득세법 시행령 §162①4호)입니다 " +
  "(서면법규과-1222, 2014.11.19. · 사전-2023-법규재산-0097, 2023.6.15.)";

export const LAND_REBUILD_PURCHASE_LAND_CAUSE_MESSAGE =
  "건물을 매매로 취득하고 토지는 상속·증여로 받은 주택은 구주택 멸실·신축 통산을 받지 않습니다 — 건물을 산 것이지 같은 토지 위에 신축한 것이 아닙니다";

export const LAND_REBUILD_OWNER_BURDENED_MESSAGE =
  "토지·건물 소유자가 갈리는 자산과 부담부증여 양도에서는 구주택 멸실·신축 통산을 지원하지 않습니다";

export const LAND_REBUILD_LAND_DATE_REQUIRED_MESSAGE =
  "구주택 멸실·신축 통산에는 토지 취득일이 필요합니다 — 토지와 건물(신축)의 취득일이 달라야 토지 파트의 세율 보유기간을 따로 판정합니다 (소득세법 §104②)";

export const LAND_REBUILD_FOOTPRINT_MESSAGE =
  "신축주택의 정착면적이 구주택보다 늘어난 경우는 계산하지 않습니다 — 구주택·신축주택의 주택이 정착된 면적이 늘지 않았음을 전제로 한 해석입니다 " +
  "(사전-2023-법규재산-0097, 2023.6.15.). 면적을 자동으로 나누지 않으므로 정착면적이 늘지 않았음을 확인한 경우에만 입력하세요";

export const LAND_REBUILD_START_MODE_MESSAGE =
  "구주택이 토지 취득 때부터 있었는지(since_land) 토지 취득 뒤에 생겼는지(later)를 선택하세요 — 선택하지 않으면 구주택 부수토지 기간의 시작일을 정할 수 없습니다";

export const LAND_REBUILD_START_DATE_REQUIRED_MESSAGE =
  "구주택이 토지 취득 뒤에 생겼다면 구주택 취득일(본인 소유 개시일)이 필요합니다 — 날짜를 자동으로 채우지 않습니다 (서면법규과-944, 2014.8.28. — 본인 소유가 아니던 기간은 통산하지 않음)";

export const LAND_REBUILD_START_DATE_STRAY_MESSAGE =
  "구주택이 토지 취득 때부터 있었다고 선택했으면 구주택 취득일을 함께 보낼 수 없습니다 — 시작일은 토지 취득 기준(상속·이월과세는 법정 기산일)으로 정해집니다";

export const LAND_REBUILD_DEMOLITION_REQUIRED_MESSAGE = "구주택 멸실일이 필요합니다 — 구주택 부수토지 기간의 끝이며 멸실~신축 취득일 기간은 통산하지 않습니다";

export const LAND_REBUILD_ORDER_MESSAGE =
  "날짜 순서가 맞지 않습니다 — 구주택 시작일 ≤ 멸실일 < 신축 취득일(사용승인일) ≤ 양도일이어야 하고 멸실일은 토지 취득일 이후여야 합니다";

/** 통산 입력은 유효하나 파트별 세율 판정을 거치지 않아 세율에 반영되지 않은 경우의 대체 고지 — 숫자 구간을 주장하지 않는다(세액 불변). */
export const LAND_REBUILD_NOT_APPLIED_NOTICE =
  "구주택 멸실·신축 통산 입력은 유효하지만, 건물 파트 양도차손 등으로 파트별 세율 판정을 하지 않고 자산 단위 세율을 적용해 통산이 세율에 반영되지 않았습니다 — 확인 필요";

const key = (d: string | undefined) => d?.slice(0, 10);

/**
 * 이 입력을 받는 **건물** 취득원인 — 신축(`newConstruction`)과 매매(`purchase` + 토지 취득일 분리).
 * 매매 호스트는 「토지·건물 취득일 다름」(원시취득·신축 등) 경로다 — 토지 취득일 분리 존재는 아래 `hasLandAcquisitionDate` 검사가 모든 호스트에 공통으로 요구한다.
 * 상속·증여·이월과세·부담부증여 건물 원인은 받지 않는다.
 */
function isRebuildBuildingCause(cause: string | undefined): boolean {
  return cause === "newConstruction" || cause === "purchase";
}

/** 토지 상속·증여 overlay가 있는가 — `purchase`는 D2(건물 상속·증여 + 토지 매매) 호스트의 잔재 표지라 overlay가 아니다. */
function hasLandCauseOverlay(cause: string | undefined): boolean {
  return !!cause && cause !== "purchase";
}

/** 위반 항목을 모두 돌려준다(엔진은 첫 항목으로 던지고, ⑫는 전부 기록하고, ⑧은 첫 항목을 칸에 붙인다). 입력이 없으면 빈 배열. */
export function collectLandRebuildIssues(f: LandRebuildFacts): LandRebuildIssue[] {
  const r = f.rebuild;
  if (!r) return [];
  const issues: LandRebuildIssue[] = [];
  const at = (field: LandRebuildField, message: string) => issues.push({ field, message });

  // 호스트 — 앞이 레버가 다른 항목을 가리지 않게 구조부터.
  if (f.hostSupported === false || f.isMixedUse) at("landRebuildPriorHouse", LAND_REBUILD_COMPANION_MESSAGE);
  if (!f.isHousing) at("landRebuildPriorHouse", LAND_REBUILD_HOST_MESSAGE);
  if (!isRebuildBuildingCause(f.buildingAcquisitionCause)) at("landRebuildPriorHouse", LAND_REBUILD_BUILDING_CAUSE_MESSAGE);
  else if (f.buildingAcquisitionCause === "purchase" && hasLandCauseOverlay(f.landAcquisitionCause)) at("landRebuildPriorHouse", LAND_REBUILD_PURCHASE_LAND_CAUSE_MESSAGE);
  if (f.isBurdenedGift || (f.selfOwns !== undefined && f.selfOwns !== "both")) at("landRebuildPriorHouse", LAND_REBUILD_OWNER_BURDENED_MESSAGE);
  if (!f.hasLandAcquisitionDate) at("landAcquisitionDate", LAND_REBUILD_LAND_DATE_REQUIRED_MESSAGE);

  if (r.footprintUnchanged !== true) at("landRebuildPriorHouse.footprintUnchanged", LAND_REBUILD_FOOTPRINT_MESSAGE);
  if (r.startMode !== "since_land" && r.startMode !== "later") at("landRebuildPriorHouse.startMode", LAND_REBUILD_START_MODE_MESSAGE);
  if (r.startMode === "later" && !r.priorHouseStartDate) at("landRebuildPriorHouse.priorHouseStartDate", LAND_REBUILD_START_DATE_REQUIRED_MESSAGE);
  if (r.startMode === "since_land" && r.priorHouseStartDate) at("landRebuildPriorHouse.priorHouseStartDate", LAND_REBUILD_START_DATE_STRAY_MESSAGE);
  if (!r.demolitionDate) at("landRebuildPriorHouse.demolitionDate", LAND_REBUILD_DEMOLITION_REQUIRED_MESSAGE);

  // 날짜 순서 — 비교 가능한 값만 본다(없는 값은 위에서 이미 짚었다).
  const demolition = key(r.demolitionDate);
  const start = key(r.priorHouseStartDate);
  const land = key(f.landAcquisitionDate);
  const built = key(f.buildingAcquisitionDate);
  if (demolition) {
    const bad =
      (start && start > demolition) ||
      (land && demolition < land) ||
      (built && demolition >= built);
    if (bad) at("landRebuildPriorHouse.demolitionDate", LAND_REBUILD_ORDER_MESSAGE);
  }
  return issues;
}

/** 엔진 입력 → 검증 사실. ④ payload를 Route 변환 없이 엔진에 넣는 테스트 호출부도 있어 날짜 문자열도 받는다. */
export function landRebuildFactsOfInput(input: TransferTaxInput): LandRebuildFacts {
  const day = (d: Date | string | undefined) => {
    const c = coerceOptionalDate(d as Date | string | undefined);
    return c ? c.toISOString().slice(0, 10) : undefined;
  };
  const rb = input.landRebuildPriorHouse;
  return {
    isHousing: input.propertyType === "housing",
    buildingAcquisitionCause: input.acquisitionCause,
    landAcquisitionCause: input.landAcquisitionCause,
    buildingAcquisitionDate: day(input.acquisitionDate),
    hasLandAcquisitionDate: !!input.landAcquisitionDate,
    landAcquisitionDate: day(input.landAcquisitionDate),
    selfOwns: input.selfOwns,
    isBurdenedGift: input.transferType === "burdened_gift" || input.acquisitionCause === "burdened_gift",
    rebuild: rb
      ? {
          startMode: rb.startMode,
          priorHouseStartDate: day(rb.priorHouseStartDate),
          demolitionDate: day(rb.demolitionDate),
          footprintUnchanged: rb.footprintUnchanged,
        }
      : undefined,
  };
}

/**
 * 세율 통산이 **실제로 도는** 입력인가 — 입력 존재 ∧ 주택 ∧ 건물 신축·매매 ∧ 토지 취득일 (매매는 토지 overlay 없음).
 * 검증을 통과한 입력은 모두 참이다(엔진은 진입 게이트가 먼저 던진다).
 */
export function landRebuildApplies(input: TransferTaxInput): boolean {
  if (!input.landRebuildPriorHouse || input.propertyType !== "housing" || !input.landAcquisitionDate) return false;
  if (input.acquisitionCause === "newConstruction") return true;
  return input.acquisitionCause === "purchase" && !hasLandCauseOverlay(input.landAcquisitionCause);
}

/**
 * 결과 고지(세액 불변). 판정 근거 수준: 0097은 2년 이상만 직접 판단.
 *
 * `applied` = 엔진이 **파트별 세율 판정을 거쳤는가**(`splitDetail.partRateBasisApplied === true`). 아니면(건물 파트 양도차손·세율 특칙·§155⑳ 특례 등으로
 * 자산 단위 세율) 통산은 세율에 닿지 않았다 — 적용 고지를 내면 화면·고지가 실제 계산과 어긋난다. 이때는 숫자 구간을 주장하지 않는 대체 고지만 낸다.
 */
export function landRebuildRateNotice(agg: LandRebuildAggregation | undefined, applied: boolean): string | null {
  if (!agg) return null;
  if (!applied) return LAND_REBUILD_NOT_APPLIED_NOTICE;
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const head =
    `구주택을 멸실하고 신축한 주택의 부수토지는 세율 보유기간을 구주택 부수토지 기간 ${agg.priorHouse.months}개월(${d(agg.priorHouse.from)}~${d(agg.priorHouse.to)})과 ` +
    `신축주택 부수토지 기간 ${agg.newHouse.months}개월(${d(agg.newHouse.from)}~${d(agg.newHouse.to)})을 통산한 ${agg.totalMonths}개월로 판정했습니다` +
    "(멸실~신축 취득일의 나대지 기간은 제외, 각 구간의 일수는 버림 — 서면법규과-1222, 2014.11.19. · 사전-2023-법규재산-0097, 2023.6.15.). ";
  const extension =
    agg.totalMonths < 24
      ? "0097 회신은 통산 2년 이상인 경우만 직접 답했고, 2년 미만 구간(1~2년 60%·1년 미만 70%)은 같은 기준을 확장한 적용입니다. "
      : "";
  return (
    head +
    extension +
    "나대지 기간 제외와 일수 버림은 해석례가 직접 정하지 않은 처리입니다. 1세대1주택 비과세의 보유·거주기간(시행령 제154조 제8항)과 장기보유특별공제 보유기간의 통산은 " +
    "이번 계산에 반영하지 않았습니다 — 확인 필요"
  );
}
