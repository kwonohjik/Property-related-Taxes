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

// §105①2호 — 반기 말일 + 2개월
function calcFilingDeadline(transferDate: string): string {
  if (!transferDate || !/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) return "";
  const d = new Date(transferDate);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const endMonth = month <= 6 ? 6 : 12;
  let deadlineMonth = endMonth + 2;
  let endYear = year;
  if (deadlineMonth > 12) {
    deadlineMonth -= 12;
    endYear += 1;
  }
  const lastDay = new Date(endYear, deadlineMonth, 0).getDate();
  return `${endYear}-${String(deadlineMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
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

export function Step3({ form, onChange }: Step3Props) {
  const acquisitionMode = form.acquisitionMode || "actual";
  // 필요경비 방식은 acquisitionMode에서 자동 도출 (소령 §163⑥4) — 사용자 선택 없음.
  // 실가 → 실제 경비 입력 / 비실가(환산·매매사례·액면가) → 개산공제 1% 자동.
  const expenseLocked = isEstimatedAcquisition(acquisitionMode);
  // [B-2] §97②2호 단서 — 환산·액면가 모드는 실비를 비교용으로 선택 입력 (sale_case 제외 — 구조적 배제)
  const swapEligibleMode = acquisitionMode === "estimated" || acquisitionMode === "face_value";
  const filingType = form.filingType || "preliminary";

  const filingDeadline = useMemo(
    () => calcFilingDeadline(form.transferDate),
    [form.transferDate]
  );

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

      {/* ④ 신고 유형 + 기한 helper */}
      <section>
        <SectionTitle n={4} title="신고 유형 (§105①2호)" />
        <div className="space-y-4">
          <RadioCardGroup
            name="filingType"
            value={filingType}
            onChange={(v) =>
              onChange({ filingType: v as "preliminary" | "final" | "revised" })
            }
            tone="violet"
            layout="inline"
            options={[
              {
                value: "preliminary",
                label: "예정신고",
                description: "양도일 속하는 반기 말일 + 2개월 (§105①2호)",
              },
              {
                value: "final",
                label: "확정신고",
                description: "다음 해 5월 1~31일 (§110)",
              },
              {
                value: "revised",
                label: "수정신고",
                description: "오류 정정 재신고",
              },
            ]}
          />

          {filingType === "preliminary" && filingDeadline && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                isDeadlineNear
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-violet-200 bg-violet-50/60 text-violet-700"
              }`}
            >
              <p className="font-medium">예정신고 기한 자동 계산 (§105①2호)</p>
              <p className="text-xs mt-1">
                양도일 {form.transferDate} →{" "}
                {new Date(form.transferDate).getMonth() + 1 <= 6
                  ? "상반기(1~6월)"
                  : "하반기(7~12월)"}{" "}
                → 반기 말일 +2개월 = <strong>{filingDeadline}</strong>
              </p>
              {isDeadlineNear && (
                <p className="text-xs mt-1 font-medium">신고 기한이 10일 이내입니다!</p>
              )}
            </div>
          )}

          <FieldCard label="신고일" required>
            <DateInput
              value={form.filingDate}
              onChange={(v) => onChange({ filingDate: v })}
            />
          </FieldCard>
        </div>
      </section>

      {/* ⑤ 가산세 분기 */}
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

    </div>
  );
}
