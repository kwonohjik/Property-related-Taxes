"use client";

/**
 * Step 3 — 필요경비·공제·신고
 */

import { useMemo } from "react";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import {
  isForeignOnlyFiling,
  resolveStockFilingType,
  resolvePreliminaryClause,
  calcPreliminaryDeadline,
} from "@/lib/calc/stock-filing-type";
import {
  calcSecuritiesTransactionTax,
} from "@/lib/tax-engine/stock-transfer/securities-transaction-tax";
import {
  calcTransferPriceSimple,
} from "@/lib/tax-engine/stock-transfer/stock-transfer-exempt-result";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { SecuritiesTransactionTaxCard } from "@/components/calc/stock-transfer/SecuritiesTransactionTaxCard";
import {
  PenaltyDetailBlock,
  LatePaymentPenaltyBlock,
} from "@/components/calc/stock-transfer/PenaltyDetailBlock";

interface Step3Props {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
  /**
   * 확정한 다른 종목들 — **신고 단위** 판정에 필요하다.
   * 예정신고 가능 여부는 「이 종목」이 아니라 「이 신고에 국내 종목이 하나라도 있는가」로 갈린다.
   */
  savedItems?: StockTransferFormData[];
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-4">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-white text-xs font-bold">
        {n}
      </span>
      {title}
    </h2>
  );
}

// 취득가액 방식 → 필요경비 방식 자동 결정 (소령 §163⑥4)
//   actual → expenseMode "actual" 허용 (사용자 자유 선택)
//   estimated/sale_case/face_value → expenseMode "estimated" 강제 (개산공제 1% 자동)
function isEstimatedAcquisition(mode: StockTransferFormData["acquisitionMode"] | undefined): boolean {
  return mode === "estimated" || mode === "sale_case" || mode === "face_value";
}

const ACQUISITION_MODE_LABEL: Record<string, string> = {
  actual: "실가",
  estimated: "환산취득가",
  sale_case: "매매사례가액",
  face_value: "액면가 (장부분실)",
};

export function Step3({ form, onChange, savedItems = [] }: Step3Props) {
  const acquisitionMode = form.acquisitionMode || "actual";
  // 필요경비 방식은 acquisitionMode에서 자동 도출 (소령 §163⑥4) — 사용자 선택 없음.
  // 실가 → 실제 경비 입력 / 비실가(환산·매매사례·액면가) → 개산공제 1% 자동.
  const expenseLocked = isEstimatedAcquisition(acquisitionMode);
  // [B-2] §97②2호 단서 — 환산·액면가 모드는 실비를 비교용으로 선택 입력 (sale_case 제외 — 구조적 배제)
  const swapEligibleMode = acquisitionMode === "estimated" || acquisitionMode === "face_value";
  /**
   * §105① 본문 괄호가 **§94①3호다목(국외주식)을 예정신고 대상에서 제외**한다.
   * 신고 1건에 국내 종목이 하나라도 있으면 그 종목은 대상이므로 예정신고가 성립한다.
   */
  const foreignOnlyFiling = useMemo(
    () => isForeignOnlyFiling([...savedItems.map((i) => i.marketType), form.marketType]),
    [savedItems, form.marketType],
  );
  const filingType = resolveStockFilingType(form.filingType, foreignOnlyFiling, "preliminary");

  /** 이 종목의 예정신고 기한 — 국외주식이면 `undefined`(대상 아님) */
  const filingDeadline = useMemo(
    () => calcPreliminaryDeadline(form.transferDate, form.marketType),
    [form.transferDate, form.marketType],
  );
  const preliminaryClause = resolvePreliminaryClause(form.marketType);
  /**
   * 🔴 G-24: 국외전출세(§118의9~§118의15)는 **신고·가산세 축이 다르다**.
   *
   * ④⑤ 섹션은 종전에 `marketType` 분기 없이 항상 렌더됐는데, 그 입력은 ④ 변환
   * (`buildExitTaxApiBody`)·⑫ Zod(`exitTaxInputSchema`)·⑭ Route(`handleExitTax`) 어디에도
   * 없어 **조용히 버려졌다**. 사용자는 미납세액·법정납부기한을 넣고도 결과 가산세가 0원인
   * 이유를 알 수 없었다. ⑧ validate 도 국외전출세 분기에는 차단이 없어 걸리지 않는다.
   *
   * 또 ④ 제목이 「§105① · §110①」인데, 국외전출자의 신고기한은 **§118의15②**로
   * 「출국일이 속하는 달의 말일부터 3개월 이내(납세관리인을 신고한 경우 §110① 확정신고
   * 기간 내)」다 — §105①은 국외전출세를 규율하지 않는다.
   *
   * ⇒ 배선 대신 **게이트**를 택한다(리뷰 수정 방향 (a)). 침묵 stripping 이 사라지고,
   *   전용 안내가 정확한 조문을 가리킨다. 가산세 축 배선은 별건이다.
   */
  const isExitTax = form.marketType === "exit_tax";

  // 증권거래세 미리보기 — 엔진 단일 진실 (dual-truth 해소 — feedback_ui_engine_dual_truth_avoidance)
  // total/per_share/exchange 모드 모두 지원 (폼 default "total"에서 미리보기 안 뜨던 기존 갭 해소)
  const stxPreview = useMemo(() => {
    // 폼 문자열 → 엔진 입력 부분 객체 (calcTransferPriceSimple에 필요한 필드만)
    const priceMode = form.transferPriceMode || "actual";
    const actualMode = form.transferActualInputMode || "total";
    const partial: Pick<
      StockTransferInput,
      | "transferPriceMode"
      | "transferActualInputMode"
      | "transferTotalPrice"
      | "perShareTransferPrice"
      | "shareCount"
      | "exchangePropertyValue"
      | "exchangeDebtRelief"
      | "exchangeCash"
    > = {
      transferPriceMode: priceMode,
      transferActualInputMode: actualMode,
      transferTotalPrice: parseAmount(form.transferTotalPrice),
      perShareTransferPrice: parseAmount(form.perShareTransferPrice),
      shareCount: parseInt(form.shareCount || "0", 10),
      exchangePropertyValue: parseAmount(form.exchangePropertyValue),
      exchangeDebtRelief: parseAmount(form.exchangeDebtRelief),
      exchangeCash: parseAmount(form.exchangeCash),
    };
    const transferPrice = calcTransferPriceSimple(partial as StockTransferInput);
    if (transferPrice <= 0) return null;

    const marketType = (form.marketType || "other_asset") as StockTransferInput["marketType"];
    const stx = calcSecuritiesTransactionTax(
      {
        marketType,
        isKOTCTrading: form.isKOTCTrading,
        // 증권시장 안/밖은 탄력세율의 전제다(증권거래세법 §8② 괄호) — 미리보기도 같은 축을 탄다.
        isOnMarketTransaction: form.isOnMarketTransaction ?? true,
        transferDate: form.transferDate
          ? new Date(form.transferDate)
          : undefined,
      },
      transferPrice,
    );
    // 표시 게이트: totalTax > 0 || warning (기타자산 C-06 경고 포함)
    if (stx.totalTax <= 0 && !stx.warning) return null;
    return { stx, transferPrice };
  }, [
    form.transferPriceMode,
    form.transferActualInputMode,
    form.transferTotalPrice,
    form.perShareTransferPrice,
    form.shareCount,
    form.exchangePropertyValue,
    form.exchangeDebtRelief,
    form.exchangeCash,
    form.marketType,
    form.isKOTCTrading,
    form.isOnMarketTransaction,
    form.transferDate,
  ]);

  const isDeadlineNear = useMemo(() => {
    if (!filingDeadline) return false;
    // eslint-disable-next-line react-hooks/purity
    const diff = new Date(filingDeadline).getTime() - Date.now();
    return diff > 0 && diff < 10 * 24 * 60 * 60 * 1000;
  }, [filingDeadline]);

  return (
    <div className="space-y-8">
      {/* ① 필요경비 — 취득가액 방식에 따라 자동 결정 (소령 §163⑥4) */}
      <section>
        <SectionTitle n={1} title="필요경비" />
        <div className="space-y-4">
          {expenseLocked ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-800">
              <p className="font-semibold mb-0.5">
                개산공제 자동 적용 — 취득가액 방식 &quot;{ACQUISITION_MODE_LABEL[acquisitionMode]}&quot;
              </p>
              <p className="text-xs text-emerald-700">
                소령 §163⑥4 — 취득가액을 추계(환산·매매사례·액면가)로 산정한 경우 필요경비는
                <strong> 취득기준시가 × 1%</strong>의 개산공제로 자동 적용됩니다.
                {swapEligibleMode
                  ? " 다만 실제 경비(자본적지출·양도비)가 (환산취득가+개산공제)를 초과하면 §97②2호 단서에 따라 실제 경비를 필요경비로 합니다 — 아래에 선택 입력하세요."
                  : " 실가 모드로 변경 시 실제 경비 입력이 가능해집니다 (Step 2 취득가액 방식 변경)."}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm text-sky-800">
              <p className="font-semibold mb-0.5">
                실제 필요경비 입력 — 취득가액 방식 &quot;실가&quot;
              </p>
              <p className="text-xs text-sky-700">
                실가 취득에서는 개산공제(§163⑥4)가 적용되지 않으며, 증권거래세·매매수수료 등
                실제 발생한 경비를 직접 입력해야 합니다.
              </p>
            </div>
          )}

          {!expenseLocked && (
            <CurrencyInput
              label="필요경비 합계"
              hint="증권거래세 + 매매수수료 + 계약서 작성비 + 기타 (원)"
              value={form.actualExpenses}
              onChange={(v) => onChange({ actualExpenses: v })}
            />
          )}

          {/* [B-2] 환산·액면가 모드 — §97②2호 단서 비교용 선택 입력 (sale_case 제외) */}
          {expenseLocked && swapEligibleMode && (
            <CurrencyInput
              label="실제 필요경비 합계 (선택 — §97②2호 단서 비교)"
              hint="증권거래세·매매수수료 등 양도비(§163⑤)와 자본적지출(§163③). (환산취득가+개산공제)보다 크면 이 금액이 필요경비로 적용됩니다."
              value={form.actualExpenses}
              onChange={(v) => onChange({ actualExpenses: v })}
            />
          )}

          {/* 증권거래세 미리보기 — 엔진 단일 진실 (§2-3 설계 적용) */}
          {stxPreview && (
            <SecuritiesTransactionTaxCard
              variant="inline"
              stx={stxPreview.stx}
              transferPrice={stxPreview.transferPrice}
              showExpenseInclusionHint={!expenseLocked}
            />
          )}
        </div>
      </section>

      {/* ② 기본공제 그룹 */}
      <section>
        <SectionTitle n={2} title="기본공제 (§103②)" />
        <div className="space-y-3">
          <div className="rounded-lg border border-sky-200/60 bg-sky-50/60 px-4 py-3 text-sm text-sky-700">
            <p className="font-medium mb-1">주식 등 그룹 기본공제 250만원</p>
            <p className="text-xs">
              §94② 발동(기타자산 우선) 시에는 부동산 그룹과 합산.
              같은 연도 부동산 양도에서 이미 사용한 금액을 입력하면 잔여 한도를 자동 반영합니다.
            </p>
          </div>
          <CurrencyInput
            label="같은 해 부동산 그룹에서 이미 사용한 기본공제"
            hint="§94② 발동 시 부동산 그룹 합산 — 없으면 0 (원)"
            value={form.realEstateGroupBasicDeductionUsed}
            onChange={(v) => onChange({ realEstateGroupBasicDeductionUsed: v })}
            placeholder="0"
          />

          {/*
            §104⑤ 본문 후단 — 8호·9호 동일 자산 의제.
            부동산 엔진과 주식 엔진이 분리돼 자동 연동이 불가능하므로 위 기본공제와 **같은 층위**로
            사용자가 옮겨 적는다. 세액에는 반영하지 않고 결과에서 조정액을 **안내**한다.
          */}
          <CurrencyInput
            label="같은 해 양도한 부동산 중 비사업용 토지 과세표준"
            hint="비사업용 토지(소득세법 §104①8호)와 비사업용 토지 과다소유법인 주식(§104①9호)은 §104⑤ 본문 후단이 「동일한 자산으로 보아」 합산하도록 정합니다. 부동산 계산 결과의 §104①8호 과세표준을 입력하면 합산 시 늘어나는 세액을 안내합니다 — 모르면 비워두세요."
            value={form.crossClause8TaxBase}
            onChange={(v) => onChange({ crossClause8TaxBase: v })}
            placeholder="비사업용 토지 과세표준"
          />
        </div>
      </section>

      {/* ③ 이월결손금 placeholder */}
      <section>
        <SectionTitle n={3} title="이월결손금 통산 (PR-3 예정)" />
        <div className="rounded-lg border border-sky-200/60 bg-sky-50/60 px-4 py-3 text-sm text-sky-600">
          다른 주식 자산 양도손실 통산은 PR-3 다자산 합산신고에서 지원 예정입니다.
        </div>
      </section>

      {/* 🔴 G-24: 국외전출세 전용 신고 안내 — §105①/§110① 축이 아니다 */}
      {isExitTax && (
        <section>
          <SectionTitle n={4} title="신고·납부 (소득세법 §118의15)" />
          <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm text-violet-700 space-y-2">
            <p className="font-medium">국외전출세는 신고 축이 다릅니다</p>
            <ul className="list-disc pl-4 space-y-1 text-xs leading-relaxed">
              <li>
                <strong>과세표준 신고기한</strong>: 출국일이 속하는 달의 말일부터 <strong>3개월</strong> 이내.
                납세관리인을 신고한 경우에는 §110① 확정신고 기간 내입니다 (§118의15②).
              </li>
              <li>
                <strong>출국일 전날까지</strong> 납세관리인과 주식등 보유현황을 신고해야 합니다 (§118의15①).
              </li>
              <li>
                보유현황을 신고하지 않거나 누락하면 액면금액·출자가액의 <strong>2%</strong>를
                산출세액에 더합니다 (§118의15④). 이 계산기는 이 금액을 반영합니다.
              </li>
              <li>
                국세기본법 §47의2~§47의4 신고불성실·납부지연 가산세는 이 화면에서 입력받지 않습니다.
              </li>
            </ul>
          </div>
        </section>
      )}

      {/* ④ 신고 유형 + 기한 helper */}
      {!isExitTax && (
      <section>
        <SectionTitle n={4} title="신고 유형 (§105① · §110①)" />
        <div className="space-y-4">
          {/*
            §105① 본문 괄호가 §94①3호다목(국외주식)을 예정신고 대상에서 **제외**한다.
            그래서 국외주식만인 신고에는 예정신고 선택지를 **만들지 않는다**.
          */}
          <RadioCardGroup
            name="filingType"
            value={filingType}
            onChange={(v) =>
              onChange({ filingType: v as "preliminary" | "final" | "revised" })
            }
            tone="violet"
            layout="inline"
            options={[
              ...(foreignOnlyFiling
                ? []
                : [
                    {
                      value: "preliminary",
                      label: "예정신고",
                      description:
                        preliminaryClause === "105-1-1"
                          ? "양도일 속하는 달의 말일 + 2개월 (§105①1호)"
                          : "양도일 속하는 반기 말일 + 2개월 (§105①2호)",
                    },
                  ]),
              {
                value: "final",
                label: "확정신고",
                description: "다음 해 5월 1~31일 (§110①)",
              },
              {
                value: "revised",
                label: "수정신고",
                description: "오류 정정 재신고",
              },
            ]}
          />

          {foreignOnlyFiling && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-3 text-xs text-violet-700">
              <p className="font-medium">국외주식은 예정신고 대상이 아닙니다 (소득세법 §105①)</p>
              <p className="mt-1 leading-relaxed">
                §105① 본문이 예정신고 대상에서 <strong>제94조제1항제3호다목</strong>(국외주식)을
                괄호로 제외합니다. 확정신고(§110①, 다음 해 5월 1~31일)만 하면 됩니다.
                국내 종목을 함께 신고하면 그 종목은 예정신고 대상이므로 선택지가 다시 나타납니다.
              </p>
            </div>
          )}

          {!foreignOnlyFiling && filingType === "preliminary" && filingDeadline && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                isDeadlineNear
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-violet-200 bg-violet-50/60 text-violet-700"
              }`}
            >
              <p className="font-medium">
                예정신고 기한 자동 계산 (
                {preliminaryClause === "105-1-1" ? "§105①1호" : "§105①2호"})
              </p>
              <p className="text-xs mt-1">
                양도일 {form.transferDate} →{" "}
                {preliminaryClause === "105-1-1"
                  ? "그 달의 말일 +2개월"
                  : `${
                      new Date(form.transferDate).getMonth() + 1 <= 6
                        ? "상반기(1~6월)"
                        : "하반기(7~12월)"
                    } 말일 +2개월`}{" "}
                = <strong>{filingDeadline}</strong>
              </p>
              {isDeadlineNear && (
                <p className="text-xs mt-1 font-medium">신고 기한이 10일 이내입니다!</p>
              )}
            </div>
          )}

          {/* 혼합 신고에서 지금 편집 중인 종목이 국외일 때 — 기한 상자가 사라지는 이유를 말한다 */}
          {!foreignOnlyFiling && filingType === "preliminary" && !filingDeadline && (
            <p className="text-caption text-muted-foreground">
              지금 편집 중인 종목은 국외주식이라 예정신고 기한이 없습니다(§105① 본문 괄호).
              예정신고 기한은 국내 종목에만 적용됩니다.
            </p>
          )}

          <FieldCard label="신고일" required>
            <DateInput
              value={form.filingDate}
              onChange={(v) => onChange({ filingDate: v })}
            />
          </FieldCard>

          {/**
           * 🔴 G-45: 전자신고 세액공제 입력 위젯.
           *
           * `isElectronicFiling`은 폼·normalize·④·⑨⑫·⑭·결과카드·신고서 28번 행까지 배선돼
           * 있었는데 **⑤ 위젯만 저장소 전체에 0건**이라 UI에서는 영영 false였다. 결과 화면의
           * 「전자신고 시 △20,000원」 안내와 신고서 28번 행이 도달 불가능한 표시로 남아 있었다.
           *
           * 공제는 「전자신고의 방법으로 … 신고를 하는 경우」이므로 **신고 단위 1회**다
           * (조특법 §104의8①) — 종목마다 켜도 합산에서 1회만 반영된다.
           */}
          <ToggleCard
            checked={form.isElectronicFiling}
            onCheckedChange={(v) => onChange({ isElectronicFiling: v })}
            title="전자신고 (홈택스 직접 신고)"
            description="납세자가 직접 전자신고하면 20,000원을 세액공제합니다 (조세특례제한법 §104의8①). 신고 1건에 1회 적용됩니다."
            tone="emerald"
          />
        </div>
      </section>
      )}

      {/* ⑤ 가산세 분기 — 🔴 G-24: 국외전출세는 배선이 없으므로 렌더하지 않는다 */}
      {!isExitTax && (
      <section>
        <SectionTitle n={5} title="가산세 (국세기본법 §47조의2·§47조의3·§47조의4)" />
        <div className="space-y-3">
          {/* PR-3-c 신규 — 신고-단위 안내 카드 */}
          <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-4 py-3 text-xs text-sky-800">
            <p className="font-semibold mb-1">ⓘ 신고-단위 적용</p>
            <p className="leading-relaxed text-sky-700">
              가산세(국세기본법 §47조의2 무신고 / §47조의3 과소신고 / §47조의4 납부지연)는{" "}
              <strong>신고서 1매 단위</strong>로 적용됩니다.
              다종목 신고에서는 종목마다 매기지 않고 <strong>합산 결정세액에 한 번</strong> 산정하며,
              국내·국외 종목이 섞여 있어도 같은 신고이므로 함께 계산됩니다(소득세법 §110① 확정신고).
              신고축은 <strong>위반을 선언한 종목</strong>이 대표가 되므로 어느 종목에서 선언해도 같습니다.
            </p>
          </div>

          <FieldCard
            label="신고 위반 여부"
            hint="가산세는 법정 신고기한 도과·과소신고가 있을 때만 적용됩니다. 정상 신고면 '해당 없음'을 선택하세요."
          >
            <RadioCardGroup
              name="filingViolation"
              value={form.filingViolation || "none"}
              onChange={(v) =>
                onChange({
                  filingViolation: v as "none" | "under_report" | "non_report",
                  // 신고 위반 해제 시 부정행위·국제거래 플래그도 함께 해제 (3중 패턴 일관성)
                  ...(v === "none"
                    ? { isFraudulent: false, isInternationalTransaction: false }
                    : {}),
                  // 무신고·정상신고에는 「당초 신고세액」이 없다 — 남겨 두면 가산세 기준금액을
                  // 줄여 **과소산정**된다(§47조의3① base). 축이 바뀔 때 값을 지운다.
                  ...(v !== "under_report" ? { originalFiledTax: "0" } : {}),
                })
              }
              tone="rose"
              layout="stack"
              options={[
                {
                  value: "none",
                  label: "해당 없음 (정상 신고)",
                  // 「가산세 0」은 부정확하다 — 납부지연(§47조의4)은 정상 신고에도 걸린다.
                  description: "법정 신고기한 내 신고 + 산출세액 정확 — 신고불성실가산세 0 (납부지연은 아래에서 별도 입력)",
                },
                {
                  value: "under_report",
                  label: "과소신고 (국세기본법 §47조의3 ①2호)",
                  description: "신고는 했으나 산출세액 누락·과소 — 10% (부정행위 동반 시 40%/60%)",
                },
                {
                  value: "non_report",
                  label: "무신고 (국세기본법 §47조의2 ①2호)",
                  description: "법정 신고기한까지 신고서 미제출 — 20% (부정행위 동반 시 40%/60%)",
                },
              ]}
            />
          </FieldCard>

          {(form.filingViolation || "none") !== "none" && (
            <>
              <ToggleCard
                checked={form.isFraudulent}
                onCheckedChange={(v) =>
                  onChange({
                    isFraudulent: v,
                    // 부정행위 해제 시 국제거래도 함께 해제 (단서 조건 종속)
                    ...(!v ? { isInternationalTransaction: false } : {}),
                  })
                }
                title="부정행위 동반"
                description="허위 장부·증빙 등 부정행위 동반 — 40% (과소: 국세기본법 §47조의3 ①1호 가목 / 무신고: 국세기본법 §47조의2 ①1호)"
                tone="rose"
              />
              <ToggleCard
                checked={form.isInternationalTransaction}
                onCheckedChange={(v) => onChange({ isInternationalTransaction: v })}
                title="역외거래 + 부정행위"
                description="역외거래에서 발생한 부정행위 — 60% (과소: 국세기본법 §47조의3 ①1호 가목 괄호 / 무신고: 국세기본법 §47조의2 ①1호 괄호)"
                tone="rose"
                disabled={!form.isFraudulent}
                disabledReason="역외거래 부정 60%는 부정행위 동반(위 항목 ON)이 전제됩니다"
              />

              <div className="pt-2">
                <PenaltyDetailBlock form={form} onChange={onChange} />
              </div>
            </>
          )}

          {/*
            납부지연(§47조의4)은 **게이트 밖**이다 — 「법정납부기한까지 납부하지 아니하거나
            적게 납부한 경우」라 §47조의2·§47조의3을 요건으로 하지 않는다.
            정상 신고 + 납부 지연이 가장 흔한 사안인데 종전에는 입력 경로가 아예 없었다.
            부동산 정본(`transfer-tax/steps/Step6.tsx`)도 같은 배치다.
          */}
          <div className="pt-2 border-t border-border/50">
            <LatePaymentPenaltyBlock form={form} onChange={onChange} />
          </div>
        </div>
      </section>
      )}

    </div>
  );
}
