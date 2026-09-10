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

import { ToneCard } from "@/components/calc/shared/ToneCard";
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
import { KiwoomPostListingAutoFetchButton } from "./KiwoomPostListingAutoFetchButton";
import { PostListingNetIncomeStatement } from "./PostListingNetIncomeStatement";
import { PostListingNetAssetStatement } from "./PostListingNetAssetStatement";
import { PostListingFormulaPreview } from "./PostListingFormulaPreview";
import { MonthlyAccrual81Section } from "./MonthlyAccrual81Section";
import { PostListingAmountInputSection } from "./PostListingAmountInputSection";
import { Frac } from "@/components/calc/results/shared/FormulaParts";

interface PostListingValuationCardProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function PostListingValuationCard({ form, onChange }: PostListingValuationCardProps) {
  const mode = form.unlistedDetailMode || "simple";
  // 간이 모드 «안»의 하위 축 — 3중 패턴 default "direct"(기존 결과값 직접 입력 보존)
  const valueMode = form.simpleValueInputMode || "direct";
  /*
    ① 상장일 이후 1개월 종가의 입력 축.
    「재무제표로 계산」·「상장연도만 재무제표」는 **자료 자체가 결산서와 종가표**라
    종가도 항상 일자별이다 — 그 두 모드에서는 이 축이 의미를 갖지 않으므로 라디오를
    노출하지 않고 표로 고정한다(선택지를 6조합으로 늘리지 않는다).
  */
  const listingStdMode = form.listingStdInputMode || "direct";
  const listingDaily = mode !== "simple" || listingStdMode === "daily";

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

  /*
    🔄 **S3 — ToggleCard 껍데기를 걷었다.**

    종전에는 이 카드 자체가 `acquiredBeforeListing` 토글이었고, «끌 때»
    `transferStdInputMode`·`listingStdInputMode`를 `direct`로 되돌리는 F-10 정규화를
    `onCheckedChange`가 맡았다. 축이 라디오 하나로 합쳐지면서 그 책임은
    `Step2`의 `onChange`(방식 전환 지점)로 옮겼다 — 한 번의 patch로 보낸다.

    ⚠️ 이 컴포넌트는 이제 **`acquisitionStdMode === "post_listing"`일 때만** 렌더된다.
       자기 자신은 그 조건을 검사하지 않는다(호출부가 분기한다).
  */
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      <p className="text-sm font-semibold text-amber-800">
        취득 후 상장 — 환산취득가 (소령 §165⑤)
      </p>
      <p className="text-caption text-amber-700 mt-1">
        취득 당시 비상장이었으나 양도 시점에 상장된 주식 — 상장일 이후 1개월 종가평균 기반 환산
      </p>
      <div className="mt-4 space-y-4" onKeyDown={handleEnterNext} data-enter-nav="off">
        {/* 환산 산식 안내 (violet) — §165⑤ + §176의2②1호 합성.
            ★ 산식의 각 항에 ①②③을 달아 **아래 섹션 번호와 1:1로 잇는다**.
            제보(2026-09-02): 「환산 입력 방식 이후로는 그 옵션 버튼이 뭐하는 것인지 헷갈린다」 —
            사용자가 넣어야 할 값은 셋뿐인데 화면이 평평해서 «이 칸이 산식의 어디에 들어가는가»가
            보이지 않았다. 번호가 그 답이다.
            ★ 번호 순서 = **계산이 소비하는 순서**다(제보 2026-09-10 재배치). ①②로 1주당
            취득기준시가를 만든 뒤 ③으로 나눈다 — 시간순(상장 → 평가 → 양도)과도 일치하고,
            전역 스위치가 지배하는 ①②가 스위치 바로 아래에 연달아 온다. */}
        <div className="rounded-lg border border-violet-200 bg-violet-50/70 px-4 py-3 text-sm">
          <p className="font-semibold text-violet-800 mb-2">환산 산식 (소령 §165⑤ + §176의2②1호 합성)</p>
          <div className="text-violet-700 space-y-1 text-xs font-mono">
            <p>
              [§165⑤] 1주당 취득기준시가 = ①상장일 이후 1개월 종가평균 ×{" "}
              <Frac top="②취득연도 평가" bottom="②상장연도 평가" />
            </p>
            <p>
              ②1주당 평가 = 순손익가치 × <Frac top="3" bottom="5" /> + 순자산가치 ×{" "}
              <Frac top="2" bottom="5" />{" "}
              {form.isHeavyRealEstateForValuation && "(부동산과다 시 2:3 반전)"}
            </p>
            <p>
              [§176의2②1호] 환산취득가 = 양도가 ×{" "}
              <Frac top="1주당 취득기준시가" bottom="양도 당시 기준시가" />
            </p>
          </div>
        </div>

        {/* 환산 입력 방식 — ①②를 **동시에** 바꾸는 스위치다. 산식 바로 아래 최상단.
            ①(종가 표 ↔ 단일 숫자)와 ②(결산서 ↔ 평가액)가 지배 대상이고, ③은 무관하다.
            🔑 그래서 ③을 맨 아래로 내렸다 — 종전에는 무관한 ③(당시 ①)이 스위치와 지배
               대상 사이에 끼어 있어, 스위치를 고른 직후 나오는 칸이 그 선택과 상관없는
               칸이었다(제보 2026-09-10 「순서가 맞지 않는다」). 이제 스위치 아래는 전부
               지배 대상이므로 hint에 「무관합니다」라는 부정문을 둘 필요가 없다.
            라벨이 «가진 자료» 기준인 이유는 PR #1389 참조. */}
        <FieldCard
          label="환산 입력 방식"
          hint="아래 ②를 어떤 자료로 채울지 정합니다. 재무제표를 고르면 ①의 종가도 일자별 입력이 됩니다."
        >
          <RadioCardGroup
            name="unlistedDetailMode"
            value={mode}
            onChange={(v) => onChange({ unlistedDetailMode: v as "simple" | "listing_only" | "full" })}
            tone="amber"
            layout="inline"
            options={[
              { value: "full", label: "재무제표로 계산" },
              { value: "simple", label: "평가액 직접 입력" },
              { value: "listing_only", label: "상장연도만 재무제표" },
            ]}
          />
        </FieldCard>

        {/* ① 상장일 이후 1개월 종가 — 산식의 기초가액. **계산이 가장 먼저 소비**한다.
            · 상장일이 여기 속한다 — 「이후 1개월」의 **기산일**이자 종가 표 32셀 자동 채움 trigger다.
            · 자본조정(증자·합병)도 ①이다 — 평가기간을 절단해 **종가평균**을 바꾼다(②가 아니다).
              상증령 §52의2②2호 준용 해석(PostListingCapitalEventSection 주석 참조).

            🔑 제목은 조문 표현을 따른다(제보 2026-09-02의 「상장 당시 기준시가」는 채택하지 않았다).
               §165⑤이 「기준시가」라 부르는 것은 **계산식의 결과**(취득 당시의 기준시가)이고,
               상장 시점의 가액을 법이 부르는 이름은 「상장일 현재의 **제4항에 따른 평가액**」 —
               그것은 이 화면의 ②다. ①에 「상장 당시 기준시가」를 붙이면 ②와 이름이 겹친다.
               이 칸의 법문상 이름은 「상장일 이후 1개월간 … 최종시세가액의 평균액」이다. */}
        <ToneCard tone="amber" sectionNum={1} title="상장일 이후 1개월 종가" bodyClassName="space-y-3">
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

          {/* 입력 방식 — ③과 같은 축, 같은 선택지. 「재무제표」 모드에서는 노출하지 않는다.
              라벨에 대상을 박아 ②·③의 동명 라디오와 구별한다. */}
          {mode === "simple" ? (
            <FieldCard label="종가 입력 방식">
              <RadioCardGroup
                name="listingStdInputMode"
                value={listingStdMode}
                onChange={(v) => onChange({ listingStdInputMode: v as "direct" | "daily" })}
                tone="amber"
                layout="inline"
                options={[
                  { value: "direct", label: "직접 입력 (1개월 평균 단일 숫자)" },
                  { value: "daily", label: "일자별 입력 (자동 평균 산정)" },
                ]}
              />
            </FieldCard>
          ) : (
            <p className="text-caption text-amber-700/90 leading-relaxed">
              재무제표 모드에서는 종가도 일자별로 입력합니다 (위 「환산 입력 방식」 선택에 따름).
            </p>
          )}

          {/* ⚠️ 주석은 삼항 «밖»에 둔다 — 분기 안 첫 요소로 두면 JSX 주석이 객체 리터럴로
                 파싱돼 TS1005로 깨진다(2026-09-02 실측). 주석 본문에 중괄호도 쓰지 말 것 —
                 닫는 중괄호가 주석을 먼저 닫아 TS1381이 난다. */}
          {listingDaily ? (
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
            </>
          ) : (
            <FieldCard
              label="상장일 이후 1개월 종가평균"
              required
              hint="상장일부터 1개월간 거래일 종가의 평균값 (원, 소령 §165⑤)"
            >
              <CurrencyInput
                label=""
                hideUnit
                value={form.listingDatePriceAvg1Month}
                onChange={(v) => onChange({ listingDatePriceAvg1Month: v })}
                placeholder="상장일 이후 1개월 종가평균"
              />
            </FieldCard>
          )}
        </ToneCard>

        {/* ② 상장연도·취득연도 평가액 — 산식의 **비율**(취득연도 평가 ÷ 상장연도 평가).
            「값 입력 방식」은 ② 안의 하위 토글이다(simple 모드 전용) — 종전에는 카드
            최상위에 있어 ①의 종가평균까지 지배하는 것처럼 보였다.
            여기까지가 1주당 취득기준시가를 만드는 구간이다 — ③은 그것을 나누는 분모다. */}
        <ToneCard tone="amber" sectionNum={2} title="상장연도·취득연도 평가액" bodyClassName="space-y-3">
          {mode === "simple" ? (
            <>
              {/* 값 입력 방식 — 결과값 직접 ↔ 순액에서 계산 (계획서 Q-1: 간이 모드 «안»의 하위 토글) */}
              <FieldCard label="평가액 입력 방식">
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
                        onChange={(v) => onChange({ listingYearNetIncomePerShare: v })} />
                      <CurrencyInput label="상장일 직전 사업연도 1주당 순자산가치" required allowNegative
                        value={form.listingYearNetAssetPerShare}
                        onChange={(v) => onChange({ listingYearNetAssetPerShare: v })} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-3">
                    <p className="text-sm font-medium text-amber-800 mb-3">취득연도 비상장 보충적 평가</p>
                    <div className="space-y-3">
                      <CurrencyInput label="취득일 직전 사업연도 1주당 순손익가치" required allowNegative
                        value={form.acquisitionYearNetIncomePerShare}
                        onChange={(v) => onChange({ acquisitionYearNetIncomePerShare: v })} />
                      <CurrencyInput label="취득일 직전 사업연도 1주당 순자산가치" required allowNegative
                        value={form.acquisitionYearNetAssetPerShare}
                        onChange={(v) => onChange({ acquisitionYearNetAssetPerShare: v })} />
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
          ) : (
            <>
              <PostListingNetIncomeStatement form={form} onChange={onChange} mode={mode} />
              <PostListingNetAssetStatement form={form} onChange={onChange} mode={mode} />
              {/* listing_only — 취득연도 4 필드 직접 입력 */}
              {mode === "listing_only" && (
                <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-3">
                  <p className="text-sm font-medium text-amber-800 mb-3">취득일 직전 사업연도 1주당 가치 (직접 입력)</p>
                  <div className="space-y-3">
                    <CurrencyInput label="취득일 직전 사업연도 1주당 순손익가치" required allowNegative
                      value={form.acquisitionYearNetIncomePerShare}
                      onChange={(v) => onChange({ acquisitionYearNetIncomePerShare: v })} />
                    <CurrencyInput label="취득일 직전 사업연도 1주당 순자산가치" required allowNegative
                      value={form.acquisitionYearNetAssetPerShare}
                      onChange={(v) => onChange({ acquisitionYearNetAssetPerShare: v })} />
                  </div>
                </div>
              )}
            </>
          )}
        </ToneCard>


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
    </div>
  );
}
