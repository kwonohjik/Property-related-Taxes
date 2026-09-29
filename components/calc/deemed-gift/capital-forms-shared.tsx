"use client";

/**
 * 자본거래 폼 공용 조각 — `capital-forms.tsx`와 `convertible-stock-form.tsx`가 함께 쓴다.
 * (두 파일이 서로를 import하면 순환이 되므로 공용분만 여기로 분리 — 800줄 정책 분할의 부산물)
 */

import { KiwoomValuationAutoFetchButton } from "@/components/calc/KiwoomValuationAutoFetchButton";
import { DateInput } from "@/components/ui/date-input";
import { resolveOverridePeriod } from "@/lib/calc/listed-stock-besshi";
import type { DeemedFormState } from "./shared";

export type SetFn = (patch: Partial<DeemedFormState>) => void;
export type Props = { form: DeemedFormState; set: SetFn };

/**
 * ⑤ 「이익 귀속 주식수」 칸의 라벨 — **direction × subType**으로 갈린다.
 *
 * 저가(§39①1호)에서는 이익을 얻는 자 = 수증자가 곧 「배정받은 자」라 배정 수량이 곱셈 인자다.
 * 고가(§39①2호)에서는 이익을 얻는 자가 **인수를 포기·미달한 주주**이고, 인수자 측 수량은
 * 시행령에서 **분수의 분자·분모로만** 등장한다(엔진이 `relatedAcquiredShares`·
 * `ratioDenomShares`로 따로 받는다).
 *
 *   「상증령」§29②5호 — 「… × [신주를 배정받지 아니하거나 균등한 조건에 의하여 배정받을
 *     신주수에 미달되게 신주를 배정받은 **주주의** 배정받지 아니하거나 그 미달되게 배정받은
 *     **부분의 신주수**] × (…)」
 *
 * ⚠️ **고가 가목은 바꾸지 않는다.** §29②3호 다목은 「포기자의 실권주수 F × (특수관계인이 인수한
 *    실권주수 R ÷ 실권주 총수 T)」인데 포기자 1인이면 F = T라 F × (R ÷ T) = R이 되어
 *    「배정받은 실권주수」와 **대수적으로 동일**하다. 여기를 「정정」하면 과다과세가 된다.
 * ⚠️ 저가는 네 목 전부 종전 그대로다.
 */
export const CI_SHARES_LABEL: Record<"low" | "high", Record<DeemedFormState["ciSubType"], string>> = {
  low: {
    forfeited_realloc: "배정받은 실권주수",
    third_party: "직접배정 신주수",
    excess: "초과배정 신주수",
    no_realloc: "실권주수",
  },
  high: {
    forfeited_realloc: "배정받은 실권주수", // §29②3호 다목 — 대수적 동일(위 주석)
    third_party: "배정받지 못한 부분의 신주수", // §29②5호 — 손해자 주주 기준
    excess: "미달 배정된 부분의 신주수", // §29②5호 — 손해자 주주 기준
    no_realloc: "실권주수",
  },
};

/**
 * 「상증법」§39①1호 다목 괄호 — 「직접 배정」에 인수인 경유 인수·취득을 포함한다(「이하 이 항에서 같다」라 2호 다목도 같다).
 * 산식은 다목 그대로라 엔진은 경로를 묻지 않는다. 달라지는 것은 **포함 시기**뿐이다:
 *   · 자본시장법 §9⑫ 인수인 — 법률 제14388호 부칙 §5① 「이 법 시행(2017.1.1.) 이후 신주를 인수ㆍ취득하는 경우부터」
 *   · 「상증령」§29④ 〈신설 2017.2.7〉 — 대통령령 제27835호 부칙 §2 「이 영 시행 이후 … 증여받는 분부터」
 * ⚠️ 법령명을 「」로 감싸지 말 것 — `extractInlineLawRefs`가 § 바로 앞 토큰만 법령명으로 읽어, 「자본시장법」§9⑫는
 *    상증법 §9⑫ 배지가 된다. 부칙 조항 번호도 같은 이유로 적지 않는다(anchor U294-2).
 */
export const THIRD_PARTY_UNDERWRITER_NOTE =
  "해당 법인으로부터 직접 배정받은 경우입니다. 자본시장법 §9⑫ 인수인으로부터 인수·취득한 경우는 2017.1.1. 이후 인수·취득분부터(법률 제14388호 부칙), 제3자에게 취득시킬 목적으로 신주를 취득한 자로부터 인수·취득한 경우는 2017.2.7. 이후 증여분부터(상증령 §29④) 여기에 포함됩니다. 그 전의 인수인 경유 취득은 다목 문언에 들지 않으니 이 계산을 그대로 쓰지 말고 직접 검토하십시오.";

/** §39① 공모 모집 배정 제외 3택 — 증자·전환주식·cap-table 공용 옵션 */
export const ALLOCATION_METHOD_OPTIONS = [
  { value: "normal", label: "일반 배정" },
  { value: "public_offering", label: "공모 배정 (§9⑦ 모집방법)" },
  { value: "deemed_public_offering", label: "간주모집 (자시령 §11③)" },
] as const;

/**
 * 3택 선택 시 화면에 붙는 효과 안내 — 「왜 0인가/왜 과세인가」를 입력 시점에 알려준다.
 *
 * ⚠️ **「주권상장법인이」는 AND 조건이다.** 「상증법」§39①1호 가목 괄호가 「**주권상장법인이**
 *    … 유가증권의 모집방법 … 으로 배정하는 경우는 제외한다」로 쓰고, 엔진도
 *    `allocationMethod === "public_offering" && isListed === true`로 둘을 함께 본다.
 *    상장 토글을 보지 않고 「0이 됩니다」라고 말하면 **비상장에서 사실과 정반대**가 된다.
 * ⚠️ **전환주식 「발행 시점」은 배정방법이 결과에 닿지 않는다.** 「상증령」§29②6호 나목의
 *    차감항은 「제1호부터 제5호까지의 규정에 따라 **계산한 이익**」 — 계산방법 규정이고 기준선이라,
 *    엔진이 `allocationMethod: "normal"`로 고정해 호출한다(`convertible-stock.ts` · 리뷰 2-D).
 */
export function allocationMethodHint(
  v: DeemedFormState["ciAllocationMethod"],
  opts?: { isListed?: boolean; leg?: "conversion" | "issuance" },
): string {
  const listed = opts?.isListed === true;
  if (opts?.leg === "issuance" && v !== "normal")
    return "전환주식 「발행 당시 이익」은 「상증령」 §29②6호 나목의 차감 기준선이라 배정방법 요건을 타지 않습니다 — 이 선택은 결과에 영향이 없습니다.";
  if (v === "public_offering")
    return listed
      ? "주권상장법인이 50인 이상에게 청약을 권유하는 모집방법으로 배정한 경우 — 「상증법」 §39①이 적용되지 않아 증여재산가액이 0이 됩니다."
      : "「상증법」 §39① 괄호는 **주권상장법인이** 모집방법으로 배정한 경우만 제외합니다. 아래 「주권상장법인」이 꺼져 있어 제외가 적용되지 않고 그대로 과세됩니다.";
  if (v === "deemed_public_offering")
    return listed
      ? "청약권유 인원이 50인 미만이지만 전매기준에 해당해 모집으로 의제된 경우 — 「상증령」 §29③으로 위 제외가 취소되어 일반 배정과 같이 과세됩니다."
      : "비상장법인이라 §39① 제외가 애초에 발동하지 않습니다 — 모집 의제 여부와 무관하게 그대로 과세됩니다.";
  return "실권주 일부만 공모로 배정했다면 공모분을 뺀 주식수를 「이익 귀속 주식수」에 입력하세요.";
}

const ISO_YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 「상증령」§52의2② 평가기간 단축 — **사용자가 입력한** 증자·합병 등 사유발생일로만 계산한다.
 *
 * 단축은 「상증법」§63①1가 괄호의 **2단 요건**(① 사유 발생 + ② 그 평균액이 부적당한 경우)이라
 * 사유가 있다고 항상 단축되는 것이 아니다(서울고법 2023누64487). 그래서 자동 판정하지 않고,
 * 비워 두면 종전대로 전후 2개월 전 구간으로 조회한다 — 적용된 구간은 조회 결과 카드가 보여준다.
 * 판정기(`resolveOverridePeriod`)는 상속 상장주식 편집기와 같은 것을 쓴다(단일 소스).
 */
export function valuationWindowOverride(valuationDate: string, eventDate: string) {
  if (!ISO_YMD.test(valuationDate) || !ISO_YMD.test(eventDate)) return {};
  return resolveOverridePeriod({ capitalIncreaseDate: eventDate }, valuationDate);
}

/** §52의2② 사유발생일 입력칸 — 종가평균 자동조회 블록 안에 둔다(선택 입력). */
export function ValuationEventDateField({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">
        증자·합병 등 사유발생일 (상증령 §52의2② — 선택)
      </label>
      <DateInput value={value} onChange={onChange} data-testid={testId} />
      <p className="mt-1 text-xs text-muted-foreground">
        평가기준일 전후 2개월 안의 사유로 그 평균이 부적당하면 입력하세요 — 기준일 전 사유는 다음날부터,
        뒤 사유는 전일까지로 조회 기간을 줄입니다. 비우면 전후 2개월 전체로 조회합니다.
      </p>
    </div>
  );
}

/**
 * §63①1가 종가평균 키움 자동조회 블록 — 증자 §39 · 전환주식 §39①3호 공용.
 * 평가기준일은 호출부가 결정한다(상증령 §29① — 상장 주주배정 권리락일 / 전환한 날 / 납입일,
 * 전환주식 발행 시점은 §29②6나의 「발행 당시」로 증여일과 다르다).
 * 「상증령」§52의2② 단축은 사용자가 입력한 사유발생일로만 한다(`valuationWindowOverride`).
 */
export function ListedAvgAutoFetch({
  stockCode,
  onStockCode,
  valuationDate,
  dateLabel,
  onFill,
  testId,
  eventDate,
  onEventDate,
}: {
  stockCode: string;
  onStockCode: (v: string) => void;
  valuationDate: string;
  dateLabel: string;
  onFill: (v: string) => void;
  testId: string;
  eventDate: string;
  onEventDate: (v: string) => void;
}) {
  const { startOverrideDate, endOverrideDate } = valuationWindowOverride(valuationDate, eventDate);
  return (
    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2">
      <p className="text-xs font-semibold text-emerald-700">§63①1가 종가평균 자동조회 (키움, 선택)</p>
      <input
        type="text"
        inputMode="text"
        maxLength={6}
        value={stockCode}
        onChange={(e) => onStockCode(e.target.value.toUpperCase())}
        placeholder="6자리 숫자"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        aria-label="종목코드"
        data-testid={testId}
      />
      {/* 기준일 입력칸은 호출부가 갖는다 — 전환주식 발행일은 종가평균 기준일이기 전에
          §39①3호 적용 요건(법률 제14388호 부칙 §5②)이라 상장 토글 밖에 있어야 한다 */}
      <p className="text-xs text-muted-foreground">
        평가기준일 — {dateLabel}
        {valuationDate ? ` (${valuationDate})` : " (미입력)"}
      </p>
      <ValuationEventDateField value={eventDate} onChange={onEventDate} testId={`${testId}-event-date`} />
      <KiwoomValuationAutoFetchButton
        variant="card"
        stockCode={stockCode}
        valuationDate={valuationDate}
        startOverrideDate={startOverrideDate}
        endOverrideDate={endOverrideDate}
        onFill={(patch) => onFill(String(patch.listedStockAvgPrice))}
      />
    </div>
  );
}

const PRE_2015_ERA_END = "2015-02-03";
const PRE_2016_ERA_END = "2016-02-05";

/**
 * #95 — §39 증여일(=이익 계산 기준일) 규정의 **시점 3구간**. 화면의 「권리락일」 안내는 현행 §29①
 * 기준이라 옛 증자에는 틀린 지시가 된다(과세 여부까지 뒤집힐 수 있다 — 기준일이 다르면 종가평균 창이 다르다).
 *   · ~2015-02-02 — 구 「상증령」§29④ 단항: 주식대금 납입일(교부일)뿐 (2014.11.19. 시행본 실독)
 *   · 2015-02-03~2016-02-04 — 대통령령 제26069호 §29④ 각 호: 권리락일 분기 신설, 위치만 ④
 *   · 2016-02-05~ — 현행 §29① 각 호 ⇒ 고지 없음
 * 입력값(ISO)을 문자열로 비교한다 — `YYYY-MM-DD`는 사전식 순서가 날짜 순서와 같다.
 */
export function CiGiftDateEraNotice({ giftDate }: { giftDate: string }) {
  if (!ISO_YMD.test(giftDate) || giftDate >= PRE_2016_ERA_END) return null;
  return (
    <p
      className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      data-testid="ci-gift-date-era-notice"
    >
      {giftDate < PRE_2015_ERA_END
        ? "이 증여일에는 구 상증령 §29④(2015.2.3. 개정 전)가 적용됩니다 — 이익 계산 기준일은 주식대금 납입일(그 전에 실권주를 배정받은 자가 신주인수권증서를 교부받았으면 그 교부일)입니다. 권리락일 기준은 이 날 뒤에 신설됐으니 그 날 기준으로 평가하세요."
        : "이 증여일의 기준일 규정은 상증령 §29④ 각 호에 있었습니다(2016.2.5. §29①로 이동) — 상장 주주배정은 권리락일, 그 밖에는 주식대금 납입일로 내용은 같습니다."}
    </p>
  );
}
