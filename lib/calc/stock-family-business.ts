/**
 * 주식 양도 — 가업상속공제 자산 의제 취득가액(소득세법 §97의2④) **폼 술어·헬퍼** (④·⑤·⑥·⑧ 공유 단일 소스)
 *
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7.3·§7.4
 *
 * 노출(⑤)·전송(④)·검증(⑧)·사이드바 미리보기(⑥)가 **같은 술어**를 쓴다 — 한 곳이라도 다른 조건이면
 * 「화면은 ON인데 body는 미전송」 또는 「안 보이는 값이 ⑧을 막는」 어긋남이 생긴다(3중 패턴).
 *
 * 술어 통과 조건 = 국내 시장 ∧ 단건 취득원인 상속 ∧ 취득가액 실가 ∧ 단건 취득(분할·다건 lot 아님).
 * 통과하지 못하면 폼에 남은 값은 inert다(④ 미전송 · ⑧ 미검증 — 계획서 Q-10).
 *
 * 적용률은 % 직접 입력이 없고 **양도일**에서 법정량 쌍이 갈린다(계획서 Q-7·§2.2):
 *   양도일 ≤ 2026-02-26 → 구 ③ 「가업상속공제금액 / 가업상속 재산가액」
 *   양도일 ≥ 2026-02-27 → ③2호 「법인 총자산가액 / 사업무관자산가액」
 * 양도일을 경계 건너로 바꾸면 새 쌍이 빈칸이라 ⑧이 막는다 — 조용한 전환(자동 채움·자동 0)은 없다.
 *
 * 순수 함수 — 스토어·DOM·네트워크 없음.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockFamilyBusinessInput } from "@/lib/tax-engine/stock-transfer/types/stock-family-business.types";
import type { FamilyBusinessRateBasis } from "@/lib/tax-engine/family-business-applied-rate";
import { basisToFraction } from "@/lib/tax-engine/family-business-applied-rate";
import { calcFamilyBusinessImputedAcquisitionPrice } from "@/lib/tax-engine/family-business-imputed-acquisition";
import { isFamilyBusinessAssetScopeDecreeEra, isFamilyBusinessCgtEra } from "@/lib/tax-engine/data/family-business-cgt-era";
import { stockFamilyBusinessInputError } from "@/lib/tax-engine/stock-transfer/stock-family-business-input-check";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { effectiveSingleAcquisitionCause } from "./stock-acquisition-cause";
import { isLotsModeForm } from "./stock-transfer-section94-4-form";
import { parseIntOrUndef, parseIntOrZero } from "./stock-transfer-tax-api-parse";

type StockFbForm = StockTransferFormData;

/** 가업상속 특례의 대상 시장 — 국내 주식·기타자산. 국외주식·국외전출세는 다른 도메인이다. */
export function isStockFbDomesticMarket(marketType: StockFbForm["marketType"]): boolean {
  return (
    marketType === "kospi" ||
    marketType === "kosdaq" ||
    marketType === "konex" ||
    marketType === "unlisted" ||
    marketType === "other_asset"
  );
}

/** 카드를 보이는 조건 — 국내 시장 ∧ 단건 취득원인이 상속(분할 모드는 lot 원인이 정본이라 「매매」로 파생 → 안 보임) */
export function isStockFbCardVisible(form: StockFbForm): boolean {
  return isStockFbDomesticMarket(form.marketType) && effectiveSingleAcquisitionCause(form) === "inheritance";
}

/** 취득가액 입력 방식이 단건(1주당·합계)인가 — 분할·일자별 다건 lot이 아니다 */
function isSingleAcquisition(form: StockFbForm): boolean {
  return !isLotsModeForm(form);
}

/** ④·⑤·⑧ 공유 술어 — 이 폼에서 §97의2④ 입력을 받고 보내고 검증하는가 */
export function allowsStockFamilyBusiness(form: StockFbForm): boolean {
  return (
    isStockFbCardVisible(form) &&
    (form.acquisitionMode || "actual") === "actual" && // 3중 패턴 default
    isSingleAcquisition(form)
  );
}

/** 카드는 보이지만 입력을 받을 수 없을 때의 사유 — 받을 수 있거나 카드가 안 보이면 null */
export function stockFbBlockedReason(form: StockFbForm): string | null {
  if (!isStockFbCardVisible(form) || allowsStockFamilyBusiness(form)) return null;
  if ((form.acquisitionMode || "actual") !== "actual") {
    return "취득가액을 실지거래가액(상속개시일 현재 평가액)으로 입력한 경우에만 적용합니다 — 환산취득가·매매사례가액에서는 쓸 수 없습니다";
  }
  return "취득 lot 단위(일자별 다건) 입력의 가업상속 칸은 이 화면에서 아직 지원하지 않습니다";
}

/** 술어 통과 + 토글 ON — 「가업상속 입력이 실제로 쓰이는 상태」 */
export function isStockFbOn(form: StockFbForm): boolean {
  return form.familyBusinessInheritance === true && allowsStockFamilyBusiness(form);
}

/** 양도일 기준 적용률 법정량 종류 — 양도일이 비었거나 형식 오류면 null(1단계 검증이 사유를 알린다) */
export function stockFbRateEra(transferDate: string): FamilyBusinessRateBasis["kind"] | null {
  const d = toOptionalDate(transferDate);
  if (!d) return null;
  return isFamilyBusinessAssetScopeDecreeEra(d) ? "corporate_business_assets" : "deduction_ratio";
}

/**
 * 폼 → 엔진 입력(`StockFamilyBusinessInput`). ④ body·⑥ 미리보기가 같은 함수를 쓴다.
 *
 * - 양도일 era의 쌍만 `fbRateBasis`로 싣는다(반대편 쌍의 잔존값은 버린다).
 * - **빈 칸은 0으로 둔다** — 엔진·⑩이 같은 술어로 거부하는 값이라(피상속인 1주당 0 · 분모 0) 조용히 통과하지 않는다.
 *   빈칸/0을 구분해 필수로 막는 것은 `stockFbInputGaps`(⑧)이다.
 * - 양도일을 모르면 null.
 */
export function buildStockFamilyBusinessInput(form: StockFbForm): StockFamilyBusinessInput | null {
  const era = stockFbRateEra(form.transferDate);
  if (!era) return null;
  const fbRateBasis: FamilyBusinessRateBasis =
    era === "corporate_business_assets"
      ? {
          kind: "corporate_business_assets",
          totalAssets: parseIntOrZero(form.fbCorpTotalAssets),
          nonBusinessAssets: parseIntOrZero(form.fbCorpNonBusinessAssets),
        }
      : {
          kind: "deduction_ratio",
          deductionAmount: parseIntOrZero(form.fbDeductionAmount),
          businessEstateValue: parseIntOrZero(form.fbBusinessEstateValue),
        };
  const capex = parseIntOrUndef(form.fbDecedentCapitalExpenditure);
  return {
    decedentAcquisitionPricePerShare: parseIntOrZero(form.fbDecedentPerSharePrice),
    // 0은 보내지 않는다 — 자본적지출 없음과 같다(형제 필드와 같은 규약)
    ...(capex !== undefined && capex > 0 ? { decedentCapitalExpenditure: capex } : {}),
    fbRateBasis,
  };
}

/** ⑧ 필드 수준 누락 — 빈칸(미입력)과 0을 구분한다. 자동 채움·자동 0 금지. */
export interface StockFbGap {
  field: string;
  message: string;
}

const isBlank = (s: string | undefined): boolean => !s || s.trim() === "";
const intOf = (s: string): number => parseIntOrZero(s);

/**
 * 폼 수준 필수 입력 누락 — 술어를 통과한 폼에서만 의미가 있다(호출부가 거른다).
 * 분자 > 분모 같은 값 관계 오류는 여기 두지 않는다 — 엔진·⑩과 **같은 공용 술어**(`stockFamilyBusinessInputError`)가 맡는다.
 */
export function stockFbInputGaps(form: StockFbForm): StockFbGap[] {
  const gaps: StockFbGap[] = [];
  if (isBlank(form.fbDecedentPerSharePrice) || intOf(form.fbDecedentPerSharePrice) <= 0) {
    gaps.push({
      field: "fbDecedentPerSharePrice",
      message: "피상속인의 1주당 취득가액을 입력하세요 (0보다 커야 합니다 — 소득세법 §97의2④1호)",
    });
  }
  if (!isBlank(form.fbDecedentCapitalExpenditure) && parseIntOrUndef(form.fbDecedentCapitalExpenditure) === undefined) {
    gaps.push({ field: "fbDecedentCapitalExpenditure", message: "피상속인 자본적지출은 원 단위 숫자로 입력하세요 (없으면 비워두세요)" });
  }
  const era = stockFbRateEra(form.transferDate);
  if (era === "deduction_ratio") {
    if (isBlank(form.fbDeductionAmount)) {
      gaps.push({
        field: "fbDeductionAmount",
        message: "가업상속공제금액을 입력하세요 (양도일이 2026.2.26. 이전이라 구 소득세법 시행령 §163의2③ — 공제받은 금액이 없으면 0)",
      });
    }
    if (isBlank(form.fbBusinessEstateValue) || intOf(form.fbBusinessEstateValue) <= 0) {
      gaps.push({
        field: "fbBusinessEstateValue",
        message: "가업상속 재산가액을 입력하세요 (0보다 커야 합니다 — 구 소득세법 시행령 §163의2③)",
      });
    }
  } else if (era === "corporate_business_assets") {
    if (isBlank(form.fbCorpTotalAssets) || intOf(form.fbCorpTotalAssets) <= 0) {
      gaps.push({
        field: "fbCorpTotalAssets",
        message: "법인 총자산가액을 입력하세요 (양도일이 2026.2.27. 이후라 소득세법 시행령 §163의2③2호 — 0보다 커야 합니다)",
      });
    }
    if (isBlank(form.fbCorpNonBusinessAssets)) {
      gaps.push({
        field: "fbCorpNonBusinessAssets",
        message: "사업무관자산가액을 입력하세요 (소득세법 시행령 §163의2③2호 — 없으면 0)",
      });
    }
  }
  return gaps;
}

/**
 * 공용 술어 입력 — 폼을 엔진 입력과 같은 모양(단건 축)으로 옮긴 것. ⑥ 미리보기가 쓴다.
 * (⑧은 ④ body → `buildEngineInput`을 거친 진짜 엔진 입력으로 같은 술어를 부른다.)
 */
function previewCheckInput(form: StockFbForm, fb: StockFamilyBusinessInput) {
  return {
    acquisitionCause: "inheritance",
    acquisitionMode: "actual",
    transferDate: toOptionalDate(form.transferDate),
    familyBusinessInheritance: fb,
  };
}

/**
 * 사이드바 취득가액 미리보기(⑥) — 결과 도착 전.
 *
 * 상속평가 × 주식수를 그대로 보이면 §97의2④가 강제 적용되는 이 양도에서 「그럴듯한 오답」이 된다.
 *   - 입력 완결 → 의제 취득가액(엔진 leaf `calcFamilyBusinessImputedAcquisitionPrice` 재사용 — 산식 복제 금지)
 *   - 상속개시일이 2014.1.1. 전이면 엔진이 특례를 적용하지 않는다(G-1) → 상속평가 총액 그대로
 *   - 입력 미완결·공용 술어 불통과 → null(행 생략)
 * 반환 null = 「미리보기 없음」, 호출부는 행을 생략한다(일반 경로로 떨어뜨리지 않는다).
 */
/** G-1 — 상속개시일(취득일)이 2014.1.1. 이후라 §97의2④가 실제로 걸리는가(사이드바 라벨용 · 엔진과 같은 술어) */
export function isStockFbImputationEra(form: Pick<StockFbForm, "acquisitionDate">): boolean {
  const d = toOptionalDate(form.acquisitionDate);
  return d !== undefined && isFamilyBusinessCgtEra(d);
}

export function previewStockFbAcquisitionPrice(form: StockFbForm): number | null {
  if (!isStockFbOn(form)) return null;
  const shares = parseIntOrUndef(form.shareCount) ?? 0;
  if (shares <= 0) return null;
  const mode = form.acquisitionActualInputMode || "per_share"; // 3중 패턴 default
  const valuation =
    mode === "total"
      ? (parseIntOrUndef(form.acquisitionTotalPrice) ?? 0)
      : (parseIntOrUndef(form.perShareAcquisitionPrice) ?? 0) * shares;
  if (valuation <= 0) return null;

  if (stockFbInputGaps(form).length > 0) return null;
  const fb = buildStockFamilyBusinessInput(form);
  if (!fb || stockFamilyBusinessInputError(previewCheckInput(form, fb))) return null;

  const acquisitionDate = toOptionalDate(form.acquisitionDate);
  if (!acquisitionDate) return null;
  if (!isFamilyBusinessCgtEra(acquisitionDate)) return valuation; // G-1 — 엔진이 특례를 적용하지 않는다

  const { numerator, denominator } = basisToFraction(fb.fbRateBasis);
  return calcFamilyBusinessImputedAcquisitionPrice(
    fb.decedentAcquisitionPricePerShare * shares,
    valuation,
    numerator / denominator,
    fb.decedentCapitalExpenditure ?? 0,
    fb.fbRateBasis,
  );
}
