"use client";

/**
 * PostListingValuationCard — 취득 후 상장 환산취득가 (Step 2 — Phase G 재구성)
 *
 * 소령 §165⑤ 본문 (Phase A KoreanLaw 검증 2026-05-18):
 *   1주당 취득기준시가 = 상장일 이후 1개월 종가평균 × (취득연도 평가 / 상장연도 평가)
 *
 * unlistedDetailMode 3 분기 (Round 1):
 *   - "simple": 결과값 4개 직접 입력 (현행 호환)
 *   - "listing_only": 상장연도 결산서 + 종가 화면. 취득연도는 직접 입력
 *   - "full": PDF 3개 화면 모두 — 80필드 합성
 *
 * 환원율 10% 위임: 소령 §165④1 가목 → 시행규칙 §81② → 상증법 시행규칙 §17
 *
 * 사례 EXAMPLE 본칙 anchor:
 *   상장연도 39,082 / 취득연도 28,451 / 환산비율 0.728 → 1주당 5,824 → 총 29,120,000
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
// 엔진 단일 진실 — 평가액 동일 판정(토글 노출 조건) 재구현 금지 (dual-truth 회피)
import { calcUnlistedPerShareWeighted } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { PostListingClosingPriceTable, autoFillDates, dayOfWeek } from "./PostListingClosingPriceTable";
import { TransferDate1MonthClosingPriceTable } from "./TransferDate1MonthClosingPriceTable";
import { KiwoomAutoFetchButton } from "./KiwoomAutoFetchButton";
import { KiwoomPostListingAutoFetchButton } from "./KiwoomPostListingAutoFetchButton";
import { PostListingNetIncomeStatement } from "./PostListingNetIncomeStatement";
import { PostListingNetAssetStatement } from "./PostListingNetAssetStatement";
import { PostListingFormulaPreview } from "./PostListingFormulaPreview";

interface PostListingValuationCardProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function PostListingValuationCard({ form, onChange }: PostListingValuationCardProps) {
  const mode = form.unlistedDetailMode || "simple";

  // §81④ 토글 노출 조건 — simple 모드는 4필드 가중평균이 동일할 때만 노출(활성 우선),
  // full/listing_only는 합성 산출이라 무조건 노출(엔진 C-7이 평가 상이 시 무시 처리).
  // 동일 판정은 엔진 헬퍼 단일 진실 (PostListingFormulaPreview와 동일 패턴).
  const heavyRE = form.isHeavyRealEstateForValuation;
  const simpleListingEval = calcUnlistedPerShareWeighted(
    parseAmount(form.listingYearNetIncomePerShare),
    parseAmount(form.listingYearNetAssetPerShare),
    heavyRE,
  );
  const simpleAcqEval = calcUnlistedPerShareWeighted(
    parseAmount(form.acquisitionYearNetIncomePerShare),
    parseAmount(form.acquisitionYearNetAssetPerShare),
    heavyRE,
  );
  const showAccrualToggle =
    mode !== "simple" || (simpleListingEval > 0 && simpleListingEval === simpleAcqEval);

  // Enter 키 → 다음 입력 셀로 포커스 이동 (카드 내 순회).
  // 하위 컴포넌트(NetIncome/NetAsset/ClosingPriceTable)가 이미 자체 handler에서 preventDefault한 경우 패스.
  const handleEnterNext = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== "INPUT") return;
    const inputs = Array.from(
      e.currentTarget.querySelectorAll<HTMLInputElement>("input:not([disabled])")
    );
    const idx = inputs.indexOf(target as HTMLInputElement);
    if (idx === -1) return;
    e.preventDefault();
    const next = inputs[idx + 1];
    if (next) next.focus();
  };

  return (
    <ToggleCard
      checked={form.acquiredBeforeListing}
      onCheckedChange={(v) => onChange({ acquiredBeforeListing: v })}
      title="취득 후 상장 — 환산취득가 (소령 §165⑤)"
      description="취득 당시 비상장이었으나 양도 시점에 상장된 주식 — 상장일 이후 1개월 종가평균 기반 환산"
      tone="amber"
    >
      <div className="mt-4 space-y-4" onKeyDown={handleEnterNext} data-enter-nav="off">
        {/* 환산 산식 안내 (violet) — §165⑤ + §163⑨ 합성 */}
        <div className="rounded-lg border border-violet-200 bg-violet-50/70 px-4 py-3 text-sm">
          <p className="font-semibold text-violet-800 mb-2">환산 산식 (소령 §165⑤ + §163⑨ 합성)</p>
          <div className="text-violet-700 space-y-1 text-xs font-mono">
            <p>[§165⑤] 1주당 취득기준시가 = 상장일 이후 1개월 종가평균 × (취득연도 평가 ÷ 상장연도 평가)</p>
            <p>[§163⑨] 환산취득가 = 양도가 × (1주당 취득기준시가 ÷ 1주당 양도기준시가)</p>
            <p>1주당 평가 = 순손익가치×3/5 + 순자산가치×2/5 {form.isHeavyRealEstateForValuation && "(부동산과다 시 2:3 반전)"}</p>
          </div>
        </div>

        {/* ★ §163⑨ 분모 — 양도일 직전 1개월 종가 평균 (강조) */}
        {/* §163⑨ 분모 입력 — direct(단일 숫자) vs daily(일자별 평균) 모드 선택 */}
        <FieldCard
          label="입력 방식"
          hint="양도일 직전 1개월 종가 평균 (1주당, §163⑨ 분모) — direct(단일 숫자) vs daily(일자별 자동 평균)"
        >
          <RadioCardGroup
            name="transferStdInputMode"
            value={form.transferStdInputMode || "direct"}
            onChange={(v) => onChange({ transferStdInputMode: v as "direct" | "daily" })}
            tone="amber"
            layout="stack"
            options={[
              {
                value: "direct",
                label: "직접 입력 (1개월 평균 단일 숫자)",
                description: "외부에서 평균 산정 후 입력 (현행 방식 · 회귀 호환)",
              },
              {
                value: "daily",
                label: "일자별 입력 (자동 평균 산정)",
                description: "양도일 직전 1개월 거래일 종가 입력 → 자동 평균",
              },
            ]}
          />
        </FieldCard>

        {/* direct 모드 — 기존 단일 숫자 입력 */}
        {(form.transferStdInputMode || "direct") === "direct" && (
          <FieldCard
            label="1개월 종가 평균"
            required
            hint="양도일 직전 1개월 종가 평균 (1주당, §99①3 · 시행령 §165③ 준용) — 환산취득가 산식의 분모. 미입력 시 환산 미적용으로 1주당 취득기준시가가 그대로 취득가로 표시됩니다."
          >
            <CurrencyInput
              label=""
              hideUnit
              value={form.transferDatePriceAvg1Month}
              onChange={(v) => onChange({ transferDatePriceAvg1Month: v })}
              placeholder="양도일 직전 1개월 종가평균 (1주당)"
            />
          </FieldCard>
        )}

        {/* daily 모드 — 일자별 종가표 + 자동 평균 mirror */}
        {form.transferStdInputMode === "daily" && (
          <>
            {/* 키움 자동조회 버튼 — 종목코드 + 양도일 + 상장 종목 충족 시 활성화 */}
            <KiwoomAutoFetchButton
              securityCode={form.securityCode}
              transferDate={form.transferDate}
              marketType={form.marketType}
              tradingHalt={form.kiwoomTradingHalt}
              onFill={onChange}
            />
            <TransferDate1MonthClosingPriceTable form={form} onChange={onChange} />
            {form.transferDatePriceAvg1Month && parseAmount(form.transferDatePriceAvg1Month) > 0 && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 px-4 py-3 text-sm">
                <p className="text-emerald-800">
                  자동 산정 평균 = <strong>{parseAmount(form.transferDatePriceAvg1Month).toLocaleString()}</strong>
                  {" "}원 → transferDatePriceAvg1Month에 자동 mirror됨 (§99①3 · 시행령 §165③ 준용 환산 분모)
                </p>
              </div>
            )}
          </>
        )}

        {/* 상장일 (기존 — 종가 표 자동 채움 trigger) */}
        <FieldCard label="상장일" required hint="최초 상장 기준일. 입력 시 종가 표 32셀 일자가 자동 채워집니다.">
          <DateInput
            value={form.listingDate}
            onChange={(v) => {
              const dates = autoFillDates(v);
              const closes = (form.listingPriceClosing ?? []).slice(0, dates.length);
              while (closes.length < dates.length) closes.push("");
              // 주말 슬롯 잔재 제거 — 슬롯↔요일 재매핑 시 거래일 카운트 보호
              for (let i = 0; i < dates.length; i++) {
                const dow = dayOfWeek(dates[i]);
                if (dow === 0 || dow === 6) closes[i] = "";
              }
              onChange({ listingDate: v, listingPriceDates: dates, listingPriceClosing: closes });
            }}
          />
        </FieldCard>

        {/* unlistedDetailMode RadioCardGroup */}
        <FieldCard label="환산 입력 방식">
          <RadioCardGroup
            name="unlistedDetailMode"
            value={mode}
            onChange={(v) => onChange({ unlistedDetailMode: v as "simple" | "listing_only" | "full" })}
            tone="amber"
            layout="stack"
            options={[
              {
                value: "simple",
                label: "간이 (결과값 4개 직접 입력)",
                description: "외부에서 보충적 평가를 마친 사용자용 — 현행 방식 (회귀 호환)",
              },
              {
                value: "listing_only",
                label: "부분 재현 (상장연도만 상세)",
                description: "상장연도 결산서만 보유한 경우 — 취득연도는 결과값 직접 입력",
              },
              {
                value: "full",
                label: "완전 재현 (PDF 3개 화면)",
                description: "PDF 사례 그대로 — 종가 표 + 순손익 + 순자산 결산서 원천 입력",
              },
            ]}
          />
        </FieldCard>

        {/* simple 모드 — 기존 4 필드 그대로 */}
        {mode === "simple" && (
          <>
            <CurrencyInput
              label="상장일 이후 1개월 종가평균"
              required
              hint="상장일부터 1개월간 거래일 종가의 평균값 (원, 소령 §165⑤)"
              value={form.listingDatePriceAvg1Month}
              onChange={(v) => onChange({ listingDatePriceAvg1Month: v })}
              placeholder="상장일 이후 1개월 종가평균"
            />
            <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-3">
              <p className="text-sm font-medium text-amber-800 mb-3">상장연도 비상장 보충적 평가</p>
              <div className="space-y-3">
                <CurrencyInput label="상장연도 1주당 순손익가치" required
                  hint="상장일 직전 사업연도 1주당 순손익가치 (원, §165④1 가목)"
                  value={form.listingYearNetIncomePerShare}
                  onChange={(v) => onChange({ listingYearNetIncomePerShare: v })}
                  placeholder="상장연도 1주당 순손익가치" />
                <CurrencyInput label="상장연도 1주당 순자산가치" required
                  hint="상장일 직전 사업연도 1주당 순자산가치 (원, §165④1 나목)"
                  value={form.listingYearNetAssetPerShare}
                  onChange={(v) => onChange({ listingYearNetAssetPerShare: v })}
                  placeholder="상장연도 1주당 순자산가치" />
              </div>
            </div>
            <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-3">
              <p className="text-sm font-medium text-amber-800 mb-3">취득연도 비상장 보충적 평가</p>
              <div className="space-y-3">
                <CurrencyInput label="취득연도 1주당 순손익가치" required
                  hint="취득일 직전 사업연도 1주당 순손익가치 (원, §165④1 가목)"
                  value={form.acquisitionYearNetIncomePerShare}
                  onChange={(v) => onChange({ acquisitionYearNetIncomePerShare: v })}
                  placeholder="취득연도 1주당 순손익가치" />
                <CurrencyInput label="취득연도 1주당 순자산가치" required
                  hint="취득일 직전 사업연도 1주당 순자산가치 (원, §165④1 나목)"
                  value={form.acquisitionYearNetAssetPerShare}
                  onChange={(v) => onChange({ acquisitionYearNetAssetPerShare: v })}
                  placeholder="취득연도 1주당 순자산가치" />
              </div>
            </div>
          </>
        )}

        {/* listing_only / full — sub-components */}
        {mode !== "simple" && (
          <>
            {/* F-02 키움 자동조회 — 종목코드 + 상장일 + 상장 종목 충족 시 활성화 */}
            <KiwoomPostListingAutoFetchButton
              securityCode={form.securityCode}
              listingDate={form.listingDate}
              marketType={form.marketType}
              tradingHalt={form.kiwoomTradingHalt}
              onFill={onChange}
            />
            <PostListingClosingPriceTable form={form} onChange={onChange} />
            <PostListingNetIncomeStatement form={form} onChange={onChange} mode={mode} />
            <PostListingNetAssetStatement form={form} onChange={onChange} mode={mode} />

            {/* listing_only — 취득연도 4 필드 직접 입력 */}
            {mode === "listing_only" && (
              <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-3">
                <p className="text-sm font-medium text-amber-800 mb-3">취득연도 1주당 가치 (직접 입력)</p>
                <div className="space-y-3">
                  <CurrencyInput label="취득연도 1주당 순손익가치" required
                    value={form.acquisitionYearNetIncomePerShare}
                    onChange={(v) => onChange({ acquisitionYearNetIncomePerShare: v })}
                    placeholder="취득연도 1주당 순손익가치" />
                  <CurrencyInput label="취득연도 1주당 순자산가치" required
                    value={form.acquisitionYearNetAssetPerShare}
                    onChange={(v) => onChange({ acquisitionYearNetAssetPerShare: v })}
                    placeholder="취득연도 1주당 순자산가치" />
                </div>
              </div>
            )}
          </>
        )}

        {/* 환산 미리보기 — Preview 컴포넌트 (P2 G-02·G-05 분리) */}
        <PostListingFormulaPreview form={form} />

        {/* §81④ 1호 월할 가산 토글 — 평가액 동일 시 노출 (simple은 동일 판정, full/listing_only는 무조건) */}
        {showAccrualToggle && (
          <ToggleCard
            checked={form.monthlyAccrualToggle}
            onCheckedChange={(v) => onChange({ monthlyAccrualToggle: v })}
            title="같은 사업연도에 취득·상장 (소칙 §81④ 1호)"
            description="취득일·상장일 직전 사업연도 평가액이 동일합니다. 같은 사업연도에 취득·상장했다면 ON — 직전·전전 사업연도 평가 차액을 보유월수로 안분해 상장일 평가액을 보정합니다. 아니면 OFF(§81④ 2호, 보정 없음)."
            tone="rose"
          >
            <div className="space-y-3">
              <CurrencyInput
                label="전전사업연도 1주당 순손익가치"
                hint="취득일이 속하는 사업연도의 전전사업연도 1주당 순손익가치 (원, §81④ 1호)"
                value={form.prePriorYearNetIncomePerShare}
                onChange={(v) => onChange({ prePriorYearNetIncomePerShare: v })}
              />
              <CurrencyInput
                label="전전사업연도 1주당 순자산가치"
                hint="취득일이 속하는 사업연도의 전전사업연도 1주당 순자산가치 (원, §81④ 1호)"
                value={form.prePriorYearNetAssetPerShare}
                onChange={(v) => onChange({ prePriorYearNetAssetPerShare: v })}
              />
              <FieldCard
                label="직전사업연도의 월수"
                hint="사업연도 변경 법인만 수정 (1~12, 기본 12). 보유월수는 취득일~상장일에서 자동 계산되며 1개월 미만은 1개월로 봅니다."
              >
                <DecimalInput
                  value={form.priorBizYearMonths}
                  onChange={(v) => onChange({ priorBizYearMonths: v })}
                  unit="개월"
                />
              </FieldCard>
            </div>
          </ToggleCard>
        )}

        {/* 거래정지 토글 (Round 4 C-06 — 후속 PR 예정) */}
        <ToggleCard
          checked={form.tradingHaltAtTransfer}
          onCheckedChange={(v) => onChange({ tradingHaltAtTransfer: v })}
          title="양도일 거래정지·관리종목 지정"
          description="소령 §165③ — 거래정지 시 1개월 종가평균 대신 비상장 보충 평가 사용 (※ 후속 PR 예정)"
          tone="rose"
          disabled
        />
      </div>
    </ToggleCard>
  );
}
