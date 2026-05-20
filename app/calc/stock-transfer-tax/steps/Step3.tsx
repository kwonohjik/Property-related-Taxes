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

interface Step3Props {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800 mb-4">
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

const SECURITIES_TAX_RATE: Record<string, number> = {
  kospi: 0.0015,
  kosdaq: 0.0015,
  konex: 0.001,
  unlisted: 0.0035,
  other_asset: 0,
};

const MARKET_LABEL: Record<string, string> = {
  kospi: "코스피",
  kosdaq: "코스닥",
  konex: "코넥스",
  unlisted: "비상장",
  other_asset: "기타",
};

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
  const filingType = form.filingType || "preliminary";

  const filingDeadline = useMemo(
    () => calcFilingDeadline(form.transferDate),
    [form.transferDate]
  );

  const securitiesTaxPreview = useMemo(() => {
    const perShare = parseAmount(form.perShareTransferPrice);
    const count = parseInt(form.shareCount || "0", 10);
    if (perShare <= 0 || count <= 0) return null;
    const total = perShare * count;
    const rate = SECURITIES_TAX_RATE[form.marketType] ?? 0;
    if (rate === 0) return null;
    return { total, rate, tax: Math.floor(total * rate) };
  }, [form.perShareTransferPrice, form.shareCount, form.marketType]);

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
                <strong> 취득기준시가 × 1%</strong>의 개산공제로 자동 적용됩니다. 실가 모드로 변경 시
                실제 경비 입력이 가능해집니다 (Step 2 취득가액 방식 변경).
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
              placeholder="291,200"
            />
          )}

          {securitiesTaxPreview && (
            <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm">
              <p className="font-medium text-sky-800 mb-1">증권거래세 참고 (정보성)</p>
              <div className="text-sky-700 space-y-1 text-xs">
                <p>
                  시장: {MARKET_LABEL[form.marketType] ?? form.marketType} / 세율:{" "}
                  {(securitiesTaxPreview.rate * 100).toFixed(2)}%
                </p>
                <p>
                  양도가액 {securitiesTaxPreview.total.toLocaleString()} ×{" "}
                  {(securitiesTaxPreview.rate * 100).toFixed(2)}% ={" "}
                  <strong>{securitiesTaxPreview.tax.toLocaleString()}</strong>
                </p>
                <p className="text-sky-500">
                  ※ 이 금액을 필요경비에 포함하여 직접 입력하세요 (자동 합산 안 됨).
                </p>
              </div>
            </div>
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
        <SectionTitle n={5} title="가산세 (국세기본법 §47조의2·§47조의3)" />
        <div className="space-y-3">
          {/* PR-3-c 신규 — 신고-단위 안내 카드 */}
          <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-4 py-3 text-xs text-sky-800">
            <p className="font-semibold mb-1">ⓘ 신고-단위 적용</p>
            <p className="leading-relaxed text-sky-700">
              가산세(국세기본법 §47조의2 무신고 / §47조의3 과소신고)는 <strong>신고서 1매 단위</strong>로 적용됩니다.
              다종목 신고 시 한 종목이라도 부정행위에 해당하면 합산 산출세액에 동일 가산세율이 적용됩니다.
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
                })
              }
              tone="rose"
              layout="stack"
              options={[
                {
                  value: "none",
                  label: "해당 없음 (정상 신고)",
                  description: "법정 신고기한 내 신고 + 산출세액 정확 — 가산세 0",
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
            </>
          )}
        </div>
      </section>

    </div>
  );
}
