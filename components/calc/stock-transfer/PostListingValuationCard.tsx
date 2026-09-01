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
import { DateInput } from "@/components/ui/date-input";
// 엔진 단일 진실 — 평가액 동일 판정(토글 노출 조건) 재구현 금지 (dual-truth 회피)
// ⚠️ 본칙 가중평균(`calcUnlistedPerShareWeighted`)이 아니라 「제4항에 따른 평가액」으로 비교해야
//    엔진의 §165⑤ 후단 트리거 판정과 일치한다(80% 하한 단서 + 연혁 게이팅 포함).
import { calcSection165_4Value } from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { PostListingClosingPriceTable, autoFillDates, dayOfWeek } from "./PostListingClosingPriceTable";
import { PostListingCapitalEventSection } from "./PostListingCapitalEventSection";
import { TransferDate1MonthClosingPriceTable } from "./TransferDate1MonthClosingPriceTable";
import { KiwoomAutoFetchButton } from "./KiwoomAutoFetchButton";
import { KiwoomPostListingAutoFetchButton } from "./KiwoomPostListingAutoFetchButton";
import { PostListingNetIncomeStatement } from "./PostListingNetIncomeStatement";
import { PostListingNetAssetStatement } from "./PostListingNetAssetStatement";
import { PostListingFormulaPreview } from "./PostListingFormulaPreview";
import { MonthlyAccrual81Section } from "./MonthlyAccrual81Section";
import { PostListingAmountInputSection } from "./PostListingAmountInputSection";

interface PostListingValuationCardProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function PostListingValuationCard({ form, onChange }: PostListingValuationCardProps) {
  const mode = form.unlistedDetailMode || "simple";
  // 간이 모드 «안»의 하위 축 — 3중 패턴 default "direct"(기존 결과값 직접 입력 보존)
  const valueMode = form.simpleValueInputMode || "direct";

  // §81④ 토글 노출 조건 — simple 모드는 4필드 가중평균이 동일할 때만 노출(활성 우선),
  // full/listing_only는 합성 산출이라 무조건 노출(엔진 C-7이 평가 상이 시 무시 처리).
  // 동일 판정은 엔진 헬퍼 단일 진실 (PostListingFormulaPreview와 동일 패턴).
  const heavyRE = form.isHeavyRealEstateForValuation;
  // 양도일 미입력·형식오류면 연혁 게이팅 기준이 없다 → 판정 불가로 보고 토글을 노출한다
  // (임의 기준일 fallback 금지. 엔진 C-7이 평가 상이 시 warning으로 정리한다).
  const transferDateForEval = form.transferDate ? new Date(form.transferDate) : undefined;
  const evalDate =
    transferDateForEval && !isNaN(transferDateForEval.getTime()) ? transferDateForEval : undefined;
  const simpleListingEval = evalDate
    ? calcSection165_4Value(
        parseAmount(form.listingYearNetIncomePerShare),
        parseAmount(form.listingYearNetAssetPerShare),
        heavyRE,
        evalDate,
      ).value
    : 0;
  const simpleAcqEval = evalDate
    ? calcSection165_4Value(
        parseAmount(form.acquisitionYearNetIncomePerShare),
        parseAmount(form.acquisitionYearNetAssetPerShare),
        heavyRE,
        evalDate,
      ).value
    : 0;
  // 🔑 **소령 §165⑤ 후단은 「평가액이 «같은 경우»」라고만 한다 — 양수 요건이 없다.**
  //    종전의 `simpleListingEval > 0`은 「4필드 미입력이면 0 == 0이 되어 헛노출」을 막으려던
  //    **대용품**이었고, 그 탓에 결손·자본잠식으로 **음수가 같은 경우**를 함께 막았다.
  //    ⇒ 술어를 의도대로 바꾼다: 「값이 양수인가」 → 「**4필드가 입력되었는가**」. anchor AT-1·AT-2
  const simpleFourFieldsEntered =
    !!form.listingYearNetIncomePerShare &&
    !!form.listingYearNetAssetPerShare &&
    !!form.acquisitionYearNetIncomePerShare &&
    !!form.acquisitionYearNetAssetPerShare;
  const showAccrualToggle =
    mode !== "simple" ||
    !evalDate ||
    (simpleFourFieldsEntered && simpleListingEval === simpleAcqEval);

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
      /*
        F-10: 끄면 아래 입력 방식 라디오가 통째로 사라진다(ToggleCard.tsx:303 `{checked && children}`).
        모드가 `daily`로 남으면 일반 §163⑨ 경로에서 되돌릴 수단이 없으므로 «끌 때» 함께 정규화한다.
        ⚠️ 반드시 한 번의 patch로 — 나눠 부르면 뒤 호출이 앞의 spread를 덮어쓴다.
        anchor: __tests__/components/post-listing-toggle-off-normalizes-mode.anchor.test.tsx
      */
      onCheckedChange={(v) =>
        onChange(
          v
            ? { acquiredBeforeListing: true }
            : { acquiredBeforeListing: false, transferStdInputMode: "direct" },
        )
      }
      title="취득 후 상장 — 환산취득가 (소령 §165⑤)"
      description="취득 당시 비상장이었으나 양도 시점에 상장된 주식 — 상장일 이후 1개월 종가평균 기반 환산"
      tone="amber"
    >
      <div className="mt-4 space-y-4" onKeyDown={handleEnterNext} data-enter-nav="off">
        {/* 환산 산식 안내 (violet) — §165⑤ + §176의2②1호 합성 */}
        <div className="rounded-lg border border-violet-200 bg-violet-50/70 px-4 py-3 text-sm">
          <p className="font-semibold text-violet-800 mb-2">환산 산식 (소령 §165⑤ + §176의2②1호 합성)</p>
          <div className="text-violet-700 space-y-1 text-xs font-mono">
            <p>[§165⑤] 1주당 취득기준시가 = 상장일 이후 1개월 종가평균 × (취득연도 평가 ÷ 상장연도 평가)</p>
            <p>[§176의2②1호] 환산취득가 = 양도가 × (1주당 취득기준시가 ÷ 1주당 양도기준시가)</p>
            <p>1주당 평가 = 순손익가치×3/5 + 순자산가치×2/5 {form.isHeavyRealEstateForValuation && "(부동산과다 시 2:3 반전)"}</p>
          </div>
        </div>

        {/* ★ 양도시 기준시가 분모 — 양도일 이전 1개월 종가 평균 §99①3 (강조) */}
        {/* §99①3 분모 입력 — direct(단일 숫자) vs daily(일자별 평균) 모드 선택 */}
        <FieldCard
          label="입력 방식"
          hint="양도일 이전 1개월 종가 평균 (1주당, §99①3 분모) — direct(단일 숫자) vs daily(일자별 자동 평균)"
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
                description: "양도일 이전 1개월 거래일 종가 입력 → 자동 평균",
              },
            ]}
          />
        </FieldCard>

        {/* direct 모드 — 기존 단일 숫자 입력 */}
        {(form.transferStdInputMode || "direct") === "direct" && (
          <FieldCard
            label="1개월 종가 평균"
            required
            hint="양도일 이전 1개월 종가 평균 (1주당, §99①3 · 시행령 §165③ 준용) — 환산취득가 산식의 분모. 미입력 시 환산 미적용으로 1주당 취득기준시가가 그대로 취득가로 표시됩니다."
          >
            <CurrencyInput
              label=""
              hideUnit
              value={form.transferDatePriceAvg1Month}
              onChange={(v) => onChange({ transferDatePriceAvg1Month: v })}
              placeholder="양도일 이전 1개월 종가평균 (1주당)"
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
            {/*
              요약줄은 표(`TransferDate1MonthClosingPriceTable`) 안의 것 **하나만** 둔다.

              종전에는 여기에 같은 값을 한 줄 더 그렸는데, 그 줄은 **저장 필드**를 읽고
              표의 줄은 **매 렌더 재계산**한 값을 읽어서 둘이 갈렸다(제보 2026-09-01 —
              16,560 vs 16,559). 값이 갈리는 원인 자체는 Step1의 양도일 리셋으로 막았고,
              표시는 실시간 재계산 쪽 한 곳으로 모은다 — stale이 구조적으로 불가능한 쪽이다.
            */}
            <TransferDate1MonthClosingPriceTable form={form} onChange={onChange} />
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
            {/* 값 입력 방식 — 결과값 직접 ↔ 순액에서 계산 (계획서 Q-1: 간이 모드 «안»의 하위 토글) */}
            <FieldCard label="값 입력 방식">
              <RadioCardGroup
                name="simpleValueInputMode"
                value={valueMode}
                onChange={(v) => onChange({ simpleValueInputMode: v as "direct" | "amounts" })}
                tone="amber"
                layout="inline"
                options={[
                  {
                    value: "direct",
                    label: "결과값 직접 입력",
                    description: "외부에서 보충적 평가를 마친 경우",
                  },
                  {
                    value: "amounts",
                    label: "순손익액·순자산가액에서 계산",
                    description: "결산 수치에서 1주당 가치를 자동 산정",
                  },
                ]}
              />
            </FieldCard>

            {valueMode === "direct" ? (
              <>
                <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-3">
                  <p className="text-sm font-medium text-amber-800 mb-3">상장연도 비상장 보충적 평가</p>
                  <div className="space-y-3">
                    <CurrencyInput label="상장일 직전 사업연도 1주당 순손익가치" required allowNegative
                      value={form.listingYearNetIncomePerShare}
                      onChange={(v) => onChange({ listingYearNetIncomePerShare: v })}
                      placeholder="상장일 직전 사업연도 1주당 순손익가치" />
                    <CurrencyInput label="상장일 직전 사업연도 1주당 순자산가치" required allowNegative
                      value={form.listingYearNetAssetPerShare}
                      onChange={(v) => onChange({ listingYearNetAssetPerShare: v })}
                      placeholder="상장일 직전 사업연도 1주당 순자산가치" />
                  </div>
                </div>
                <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-3">
                  <p className="text-sm font-medium text-amber-800 mb-3">취득연도 비상장 보충적 평가</p>
                  <div className="space-y-3">
                    <CurrencyInput label="취득일 직전 사업연도 1주당 순손익가치" required allowNegative
                      value={form.acquisitionYearNetIncomePerShare}
                      onChange={(v) => onChange({ acquisitionYearNetIncomePerShare: v })}
                      placeholder="취득일 직전 사업연도 1주당 순손익가치" />
                    <CurrencyInput label="취득일 직전 사업연도 1주당 순자산가치" required allowNegative
                      value={form.acquisitionYearNetAssetPerShare}
                      onChange={(v) => onChange({ acquisitionYearNetAssetPerShare: v })}
                      placeholder="취득일 직전 사업연도 1주당 순자산가치" />
                  </div>
                </div>
              </>
            ) : (
              <>
                <PostListingAmountInputSection
                  title="상장연도 비상장 보충적 평가"
                  axisLabel="상장일"
                  form={form}
                  onChange={onChange}
                  keys={{
                    netIncomeAmount: "listingYearNetIncomeAmount",
                    shareCount: "listingYearShareCount",
                    netAssetAmount: "listingYearNetAssetAmount",
                    goodwill: "listingYearGoodwill",
                    netIncomePerShare: "listingYearNetIncomePerShare",
                    netAssetPerShare: "listingYearNetAssetPerShare",
                  }}
                />
                <PostListingAmountInputSection
                  title="취득연도 비상장 보충적 평가"
                  axisLabel="취득일"
                  form={form}
                  onChange={onChange}
                  keys={{
                    netIncomeAmount: "acquisitionYearNetIncomeAmount",
                    shareCount: "acquisitionYearShareCount",
                    netAssetAmount: "acquisitionYearNetAssetAmount",
                    goodwill: "acquisitionYearGoodwill",
                    netIncomePerShare: "acquisitionYearNetIncomePerShare",
                    netAssetPerShare: "acquisitionYearNetAssetPerShare",
                  }}
                />
              </>
            )}
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
            <PostListingCapitalEventSection form={form} onChange={onChange} />
            <PostListingNetIncomeStatement form={form} onChange={onChange} mode={mode} />
            <PostListingNetAssetStatement form={form} onChange={onChange} mode={mode} />

            {/* listing_only — 취득연도 4 필드 직접 입력 */}
            {mode === "listing_only" && (
              <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-3">
                <p className="text-sm font-medium text-amber-800 mb-3">취득일 직전 사업연도 1주당 가치 (직접 입력)</p>
                <div className="space-y-3">
                  <CurrencyInput label="취득일 직전 사업연도 1주당 순손익가치" required allowNegative
                    value={form.acquisitionYearNetIncomePerShare}
                    onChange={(v) => onChange({ acquisitionYearNetIncomePerShare: v })}
                    placeholder="취득일 직전 사업연도 1주당 순손익가치" />
                  <CurrencyInput label="취득일 직전 사업연도 1주당 순자산가치" required allowNegative
                    value={form.acquisitionYearNetAssetPerShare}
                    onChange={(v) => onChange({ acquisitionYearNetAssetPerShare: v })}
                    placeholder="취득일 직전 사업연도 1주당 순자산가치" />
                </div>
              </div>
            )}
          </>
        )}

        {/* 환산 미리보기 — Preview 컴포넌트 (P2 G-02·G-05 분리) */}
        <PostListingFormulaPreview form={form} />

        {/* §81④ 1호 월할 가산 토글 — 평가액 동일 시 노출 (simple은 동일 판정, full/listing_only는 무조건) */}
        <MonthlyAccrual81Section
          visible={showAccrualToggle}
          checked={form.monthlyAccrualToggle}
          onToggle={(v) => onChange({ monthlyAccrualToggle: v })}
          prePriorNI={form.prePriorYearNetIncomePerShare}
          prePriorNA={form.prePriorYearNetAssetPerShare}
          priorBizYearMonths={form.priorBizYearMonths}
          onChangePrePriorNI={(v) => onChange({ prePriorYearNetIncomePerShare: v })}
          onChangePrePriorNA={(v) => onChange({ prePriorYearNetAssetPerShare: v })}
          onChangePriorBizYearMonths={(v) => onChange({ priorBizYearMonths: v })}
          title="같은 사업연도에 취득·상장 (소칙 §81④ 1호)"
          description="취득일·상장일 직전 사업연도 평가액이 동일합니다. 같은 사업연도에 취득·상장했다면 ON — 직전·전전 사업연도 평가 차액을 보유월수로 안분해 상장일 평가액을 보정합니다. 아니면 OFF(§81④ 2호, 보정 없음)."
          monthsHint="사업연도 변경 법인만 수정 (1~12, 기본 12). 보유월수는 취득일~상장일에서 자동 계산되며 1개월 미만은 1개월로 봅니다."
        />

        {/* 거래정지 §165③ 토글은 Step2 상장 환산 분기 레벨로 이동·활성화 (엔진 분기 순서 일치) */}
      </div>
    </ToggleCard>
  );
}
