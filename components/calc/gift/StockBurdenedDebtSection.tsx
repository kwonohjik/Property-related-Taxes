"use client";

/**
 * StockBurdenedDebtSection — 주식 부담부증여 §47① 채무 인수 입력 (증여 모드 전용, ⑤)
 *
 * 상장·비상장 주식 카드 공용. EstateBodyRealEstate.tsx의 §47① 섹션(520~557행)을
 * 주식용으로 경량화한 버전.
 *
 * 법령:
 *   §47①  — 증여세 과세가액 = 증여재산가액 − 수증자가 인수한 담보 채무
 *   §47③  — 배우자·직계존비속 간 채무 인수는 증여 추정(객관적 입증 시 예외)
 *   §88   — 부담부증여 채무 인수분은 증여자의 유상양도로 과세
 *   §159  — 부담부증여 양도가액 안분
 *
 * 정책:
 *   - mode !== "gift"이면 null (상속 모드 미노출)
 *   - 채무>평가액은 차단 아님(경고만, validateStep ⑧)
 *   - 양도소득세 토글은 hasDebt=false 시 disabled (채무 미입력 시 비활성)
 *   - 자동 안분 fallback 금지 — acquisitionMode, marketType 미선택 시 validation이 차단
 *
 * 설계: docs/02-design/features/gift-stock-burdened-transfer-tax.ui.design.md §5
 */

import { useState } from "react";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftStockTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { computeAutoIsMajor } from "@/components/calc/stock-transfer/major-sync";
import { getMajorShareholderThreshold } from "@/lib/tax-engine/stock-transfer/stock-rate-tables";
import { resolveBurdenedGiftJudgmentDate } from "@/lib/calc/gift-burdened-transfer-api";

interface StockBurdenedDebtSectionProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
  mode: "inheritance" | "gift";
  /** 증여일 = 부담부증여의 양도일. §157① 대주주 판정 기준일 파생에 쓴다. */
  transferDate?: string;
}

export function StockBurdenedDebtSection({
  item,
  onUpdate,
  mode,
  transferDate,
}: StockBurdenedDebtSectionProps) {
  const set = (patch: Partial<EstateItem>) => onUpdate({ ...item, ...patch });
  const setBgt = (patch: Partial<BurdenedGiftStockTransferTaxInput>) =>
    set({
      burdenedGiftStockTransferTax: item.burdenedGiftStockTransferTax
        ? { ...item.burdenedGiftStockTransferTax, ...patch }
        : undefined,
    });

  const hasDebt = (item.assumedDebtForGift ?? 0) > 0;
  // R-1 lazy init: 채무/입증 설정이 있으면 펼친 상태로 시작 (접혀 숨겨지는 사고 방지)
  const [open, setOpen] = useState(
    hasDebt || item.burdenedGiftDebtConfirmed === true,
  );

  const bgt = item.burdenedGiftStockTransferTax;
  const isTransferTaxOn = bgt !== undefined;
  const isListed =
    bgt?.marketType === "kospi" ||
    bgt?.marketType === "kosdaq" ||
    bgt?.marketType === "konex";
  const isActualMode = bgt?.acquisitionMode === "actual";
  /** §157①(상장 3시장)·§167의8①2호(비상장) — 둘 다 지분율·시총 자동 판정 대상이다. */
  const isJudgeable = isListed || bgt?.marketType === "unlisted";

  /** ④와 **같은 단일 소스**로 판정 기준일을 파생한다 (미리보기 ↔ 실제 계산 불일치 차단). */
  const derivedJudgmentDate = resolveBurdenedGiftJudgmentDate(
    { majorJudgmentDate: bgt?.majorJudgmentDate },
    transferDate ?? "",
  );

  // 임계 조회는 7행 테이블 탐색이라 memo 이득이 없다 (React Compiler가 알아서 처리한다).
  /**
   * 🔑 **임계표 행 선택은 양도일**이다 — 부칙이 한결같이 「양도하는 분부터」이기 때문이다
   *    (제34061호 §2·제30395호 §2②·제24356호 §22②). 판정기준일은 지분율·시총을 **어느
   *    시점의 값으로 볼지**만 정한다(측정 축). 두 축을 섞으면 화면이 자기모순에 빠진다 —
   *    실제로 머지 직후 임계는 2%(판정기준일 행)로 표시하면서 판정은 1%(양도일 행)로 내
   *    「지분율 2% … → 대주주」를 출력했다.
   *    인자 집합도 `computeAutoIsMajor`와 동일해야 한다([[feedback_shared_predicate_argument_parity]]).
   */
  const threshold =
    isJudgeable && derivedJudgmentDate && transferDate && bgt?.marketType
      ? getMajorShareholderThreshold(bgt.marketType, new Date(transferDate), {
          isVentureCompany: false,
          isKOTCTrading: false,
        })
      : null;

  /**
   * 자동 판정 미리보기 — 주식 마법사와 **같은 술어**(`computeAutoIsMajor`)를 쓴다.
   * 세액을 실제로 가르는 것은 엔진의 §157 판정이고, 이 값은 표시와 `isMajorShareholder`
   * echo에만 쓴다. 폼 필드가 % 문자열 기반이라 숫자 입력을 문자열로 넘긴다.
   */
  const autoIsMajorOf = (next: BurdenedGiftStockTransferTaxInput | undefined) => {
    if (!next?.marketType) return undefined;
    return computeAutoIsMajor(
      {
        marketType: next.marketType,
        priorYearEndDate: resolveBurdenedGiftJudgmentDate(next, transferDate ?? ""),
        // 임계표 **행 선택은 양도일**(부칙 「양도하는 분부터」) — 측정 시점과 축이 다르다.
        // 미입력이면 `computeAutoIsMajor`가 undefined를 반환해 미리보기를 띄우지 않는다.
        transferDate: transferDate ?? "",
        selfShareRatio: String(next.selfShareRatioPercent ?? ""),
        selfMarketCap: String(next.selfMarketCap ?? ""),
        isLargestShareholderGroup: next.isLargestShareholderGroup ?? false,
        combinedShareRatio: String(next.combinedShareRatioPercent ?? ""),
        combinedMarketCap: String(next.combinedMarketCap ?? ""),
        // 40억 임계(§167의8①2호 단서) 축 — 부담부증여 경로에는 입력 UI가 없어
        // ④가 엔진에 `false`를 보낸다(`gift-burdened-transfer-api.ts:507-508`).
        // 미리보기도 **같은 인자**를 써야 저장값과 화면이 갈리지 않는다
        // ([[feedback_shared_predicate_argument_parity]] — 리뷰 #14가 고친 결함).
        isVentureCompany: false,
        isKOTCTrading: false,
      },
      {},
    );
  };
  const autoIsMajor = autoIsMajorOf(bgt) ?? false;

  /**
   * 판정 근거를 바꿀 때 `isMajorShareholder` echo를 같은 patch에 실어 보낸다.
   * useEffect → store 미러링 금지 규칙에 따라 onChange 시점에만 동기화한다
   * (주식 마법사 `withAutoSyncMajor`와 같은 패턴).
   */
  const setBgtWithMajorSync = (patch: Partial<BurdenedGiftStockTransferTaxInput>) => {
    if (!bgt) return;
    const next = { ...bgt, ...patch };
    const auto = autoIsMajorOf(next);
    setBgt(auto === undefined ? patch : { ...patch, isMajorShareholder: auto });
  };

  if (mode !== "gift") return null;

  return (
    <ToggleCard
      lawLinks="상증법"
      tone="amber"
      title="§47① 부담부증여 채무인수"
      description="수증자가 증여재산(주식)에 담보된 채무를 인수한 경우, 그 채무액을 증여세 과세가액에서 차감합니다 (상증법 §47①)."
      checked={open}
      onCheckedChange={(v) => {
        setOpen(v);
        // OFF 시 입력값 초기화
        if (!v) {
          set({
            assumedDebtForGift: undefined,
            burdenedGiftDebtConfirmed: undefined,
            burdenedGiftStockTransferTax: undefined,
          });
        }
      }}
    >
      <div className="space-y-3">
        <FieldCard
          label="수증자 인수 채무액 (§47①)"
          unit="원"
          badge={<LawArticleModal legalBasis="상증법 §47" label="§47①" />}
          hint="수증자가 실제로 인수한 채무액 (주식 질권부 채무 등). 증여세 과세가액에서 차감됩니다. 가업승계 특례 자산이면 특례 과세가액에서 차감됩니다."
        >
          <CurrencyInput
            label="수증자 인수 채무액 (§47①)"
            value={
              item.assumedDebtForGift != null
                ? String(item.assumedDebtForGift)
                : ""
            }
            onChange={(v) =>
              set({ assumedDebtForGift: parseAmount(v) || undefined })
            }
            hideLabel
            hideUnit
          />
        </FieldCard>

        {hasDebt && (
          <ToggleCard
            lawLinks="상증법"
            tone="amber"
            size="sm"
            title="채무 인수 사실 객관적 입증 가능 (§47③)"
            description="배우자·직계존비속 간 부담부증여는 채무 인수를 원칙적으로 증여로 추정하지 않습니다. 금융기관 확인서 등 객관적 증빙이 있는 경우 ON으로 표시하세요."
            checked={item.burdenedGiftDebtConfirmed ?? false}
            onCheckedChange={(v) =>
              set({ burdenedGiftDebtConfirmed: v || undefined })
            }
          />
        )}

        {hasDebt && (
          <div className="rounded-md border border-amber-200 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <strong>§47③ 주의</strong> — 배우자·직계존비속 간 부담부증여의 채무
            인수는 원칙적으로 증여로 추정하지 않습니다. 채무 이전이 객관적으로
            입증된 경우에만 과세가액에서 차감됩니다. 또한 채무 인수분은 증여자의
            유상양도에 해당하여 주식 양도소득세가 별도로 발생할 수 있습니다.
            (상증법 §47③, 소득세법 §88)
          </div>
        )}

        {/* ─── 양도소득세 함께 계산 토글 (hasDebt 시만 활성) ─── */}
        <div className={!hasDebt ? "opacity-50 pointer-events-none" : ""}>
          <ToggleCard
            tone="amber"
            title="양도소득세 함께 계산"
            description={
              hasDebt
                ? "채무 인수분은 증여자의 유상양도로 과세됩니다 (소득세법 §88·소령 §159). 증여자에게 발생하는 주식 양도소득세를 함께 계산합니다."
                : "채무인수액을 먼저 입력하면 양도소득세를 함께 계산할 수 있습니다."
            }
            checked={isTransferTaxOn}
            onCheckedChange={(v) => {
              if (v) {
                set({
                  burdenedGiftStockTransferTax: {
                    marketType: "unlisted" as const,
                    acquisitionDate: "",
                    acquisitionMode: "estimated" as const,
                    actualAcquisitionPrice: undefined,
                    isMajorShareholder: undefined,
                    isSmallMediumEnterprise: undefined,
                  },
                });
              } else {
                set({ burdenedGiftStockTransferTax: undefined });
              }
            }}
          >
            <div className="space-y-4">
              {/* ① 시장 구분 */}
              <div>
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-2">
                  시장 구분 <span className="text-rose-500">*</span>
                </p>
                <RadioCardGroup<"kospi" | "kosdaq" | "konex" | "unlisted">
                  name={`stock-bg-market-${item.id}`}
                  tone="amber"
                  columns={2}
                  value={bgt?.marketType ?? ""}
                  onChange={(v) => setBgtWithMajorSync({ marketType: v })}
                  options={[
                    {
                      value: "kospi",
                      label: "KOSPI",
                      description: "유가증권시장",
                      testId: `stock-bg-market-kospi-${item.id}`,
                    },
                    {
                      value: "kosdaq",
                      label: "KOSDAQ",
                      description: "코스닥",
                      testId: `stock-bg-market-kosdaq-${item.id}`,
                    },
                    {
                      value: "konex",
                      label: "KONEX",
                      description: "코넥스",
                      testId: `stock-bg-market-konex-${item.id}`,
                    },
                    {
                      value: "unlisted",
                      label: "비상장",
                      description: "K-OTC 포함",
                      testId: `stock-bg-market-unlisted-${item.id}`,
                    },
                  ]}
                />
              </div>

              {/* ② 증여자 취득일 */}
              <FieldCard
                label="증여자 취득일"
                badge={<LawArticleModal legalBasis="소득세법 §95" label="§95" />}
                hint="증여자가 주식을 취득한 날짜. 보유기간(§95) 및 대주주 판정(§157) 기준으로 사용됩니다."
              >
                <DateInput
                  data-testid={`stock-bg-acq-date-${item.id}`}
                  value={
                    bgt?.acquisitionDate instanceof Date
                      ? bgt.acquisitionDate.toISOString().slice(0, 10)
                      : (bgt?.acquisitionDate as string | undefined) ?? ""
                  }
                  onChange={(v) => setBgt({ acquisitionDate: v })}
                />
              </FieldCard>

              {/* ③ 취득가액 산정 방식 */}
              <div>
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-2">
                  취득가액 산정 방식 <span className="text-rose-500">*</span>
                </p>
                <RadioCardGroup<"actual" | "estimated">
                  name={`stock-bg-acq-mode-${item.id}`}
                  tone="amber"
                  columns={2}
                  value={bgt?.acquisitionMode ?? ""}
                  onChange={(v) =>
                    setBgt({ acquisitionMode: v, actualAcquisitionPrice: undefined })
                  }
                  options={[
                    {
                      value: "actual",
                      label: "실지취득가액",
                      description: "증여자 실제 취득가",
                      testId: `stock-bg-acq-mode-actual-${item.id}`,
                    },
                    {
                      value: "estimated",
                      label: "환산취득가액",
                      description: "§176의2·§165④ 환산",
                      testId: `stock-bg-acq-mode-estimated-${item.id}`,
                    },
                  ]}
                />
              </div>

              {/* ④ 실지 모드: 증여자 취득가 합계 */}
              {isActualMode && (
                <FieldCard
                  label="증여자 당초 취득가 합계 (안분 전)"
                  unit="원"
                  hint="증여자가 주식을 취득할 때 실제 지불한 전체 금액. 채무비율(채무액 ÷ 평가액)로 자동 안분하여 양도소득세 취득가액을 산출합니다."
                >
                  <CurrencyInput
                    label="증여자 당초 취득가 합계 (안분 전)"
                    value={
                      bgt?.actualAcquisitionPrice != null
                        ? String(bgt.actualAcquisitionPrice)
                        : ""
                    }
                    onChange={(v) =>
                      setBgt({ actualAcquisitionPrice: parseAmount(v) || undefined })
                    }
                    hideLabel
                    hideUnit
                    data-testid={`stock-bg-actual-price-${item.id}`}
                  />
                </FieldCard>
              )}

              {/* ⑤ 상장 환산 — 1개월 종가평균 (§176의2②1호 환산비율) */}
              {isListed && bgt?.acquisitionMode === "estimated" && (
                <ToneCard
                  tone="amber"
                  sectionNum="A"
                  bodyClassName="space-y-3"
                  title={<>환산취득가 산정용 1개월 종가평균 <span className="text-rose-500">*</span></>}
                >
                  <p className="text-caption text-amber-700 dark:text-amber-400">
                    환산취득가 = 양도가액(채무인수액) × (취득시 기준시가 ÷ 양도시 기준시가).
                    두 값이 없으면 취득가액과 개산공제가 모두 0으로 산출됩니다 (소령 §176의2②1호).
                  </p>
                  <FieldCard
                    label="양도일(증여일) 이전 1개월 종가평균"
                    unit="원"
                    hint="1주당 금액. 환산비율의 분모입니다."
                  >
                    <CurrencyInput
                      label="양도일(증여일) 이전 1개월 종가평균"
                      value={
                        bgt?.transferDatePriceAvg1Month != null
                          ? String(bgt.transferDatePriceAvg1Month)
                          : ""
                      }
                      onChange={(v) =>
                        setBgt({ transferDatePriceAvg1Month: parseAmount(v) || undefined })
                      }
                      hideLabel
                      hideUnit
                      data-testid={`stock-bg-transfer-avg-${item.id}`}
                    />
                  </FieldCard>
                  <FieldCard
                    label="증여자 취득일 이전 1개월 종가평균"
                    unit="원"
                    hint="1주당 금액. 환산비율의 분자입니다."
                  >
                    <CurrencyInput
                      label="증여자 취득일 이전 1개월 종가평균"
                      value={
                        bgt?.acquisitionDatePriceAvg1Month != null
                          ? String(bgt.acquisitionDatePriceAvg1Month)
                          : ""
                      }
                      onChange={(v) =>
                        setBgt({ acquisitionDatePriceAvg1Month: parseAmount(v) || undefined })
                      }
                      hideLabel
                      hideUnit
                      data-testid={`stock-bg-acq-avg-${item.id}`}
                    />
                  </FieldCard>
                </ToneCard>
              )}

              {/* ⑥ 대주주 판정 실입력 (§157①·§167의8①2호) */}
              {isJudgeable && (
                <ToneCard
                  tone="amber"
                  sectionNum="B"
                  bodyClassName="space-y-3"
                  title="대주주 판정"
                  titleExtra={
                    <LawArticleModal
                      legalBasis={isListed ? "소득세법 시행령 §157" : "소득세법 시행령 §167의8"}
                      label={isListed ? "§157" : "§167의8"}
                    />
                  }
                >
                  <p className="text-caption text-amber-700 dark:text-amber-400">
                    소유주식의 비율 또는 시가총액 중 <strong>하나라도</strong> 임계를 넘으면
                    대주주입니다. 판정 시점은 <strong>양도일(증여일)이 속하는 사업연도의 직전
                    사업연도 종료일</strong>입니다 (증여자 취득일이 아닙니다).
                  </p>

                  <FieldCard
                    label="판정 기준일 (직전 사업연도 종료일)"
                    hint={
                      derivedJudgmentDate
                        ? `미입력 시 증여일 기준 ${derivedJudgmentDate}이 적용됩니다. 법인의 사업연도가 역년이 아니면 직접 입력하세요.`
                        : "증여일을 먼저 입력하면 기본값이 채워집니다. 법인의 사업연도가 역년이 아니면 직접 입력하세요."
                    }
                  >
                    <DateInput
                      data-testid={`stock-bg-judgment-date-${item.id}`}
                      value={bgt?.majorJudgmentDate ?? ""}
                      onChange={(v) => setBgtWithMajorSync({ majorJudgmentDate: v || undefined })}
                    />
                  </FieldCard>

                  <FieldCard
                    label="본인 소유주식의 비율"
                    unit="%"
                    hint="판정 기준일 현재 본인 단독 지분율. 예: 1.5 (= 1.5%)"
                  >
                    <DecimalInput
                      data-testid={`stock-bg-self-ratio-${item.id}`}
                      value={
                        bgt?.selfShareRatioPercent != null
                          ? String(bgt.selfShareRatioPercent)
                          : ""
                      }
                      onChange={(v) =>
                        setBgtWithMajorSync({
                          selfShareRatioPercent: v === "" ? undefined : Number(v),
                        })
                      }
                      unit="%"
                    />
                  </FieldCard>

                  <FieldCard
                    label="본인 시가총액"
                    unit="원"
                    hint="판정 기준일 현재 최종시세가액 × 보유 주식수 (소령 §157④1호). 비상장은 §165④ 평가액."
                  >
                    <CurrencyInput
                      label="본인 시가총액"
                      value={bgt?.selfMarketCap != null ? String(bgt.selfMarketCap) : ""}
                      onChange={(v) =>
                        setBgtWithMajorSync({ selfMarketCap: parseAmount(v) || undefined })
                      }
                      hideLabel
                      hideUnit
                      data-testid={`stock-bg-self-cap-${item.id}`}
                    />
                  </FieldCard>

                  <ToggleCard
                    tone="amber"
                    size="sm"
                    title="본인+특수관계인 지분 합계가 최대주주 (§157①1호 단서)"
                    description="ON이면 합산 지분율·시가총액도 판정에 들어갑니다."
                    checked={bgt?.isLargestShareholderGroup ?? false}
                    onCheckedChange={(v) =>
                      setBgtWithMajorSync({ isLargestShareholderGroup: v || undefined })
                    }
                  >
                    <div className="space-y-3">
                      <FieldCard label="합산 소유주식의 비율" unit="%" hint="본인+기타주주 합계 지분율.">
                        <DecimalInput
                          data-testid={`stock-bg-combined-ratio-${item.id}`}
                          value={
                            bgt?.combinedShareRatioPercent != null
                              ? String(bgt.combinedShareRatioPercent)
                              : ""
                          }
                          onChange={(v) =>
                            setBgtWithMajorSync({
                              combinedShareRatioPercent: v === "" ? undefined : Number(v),
                            })
                          }
                          unit="%"
                        />
                      </FieldCard>
                      <FieldCard label="합산 시가총액" unit="원" hint="본인+기타주주 합계 시가총액.">
                        <CurrencyInput
                          label="합산 시가총액"
                          value={
                            bgt?.combinedMarketCap != null ? String(bgt.combinedMarketCap) : ""
                          }
                          onChange={(v) =>
                            setBgtWithMajorSync({ combinedMarketCap: parseAmount(v) || undefined })
                          }
                          hideLabel
                          hideUnit
                          data-testid={`stock-bg-combined-cap-${item.id}`}
                        />
                      </FieldCard>
                    </div>
                  </ToggleCard>

                  {threshold && (
                    <div
                      className="rounded border border-amber-300 bg-amber-100/60 dark:border-amber-600 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
                      data-testid={`stock-bg-major-preview-${item.id}`}
                    >
                      양도일 {transferDate} 기준 임계 (측정: {derivedJudgmentDate} 현재
                      보유현황) —{" "}
                      <strong>지분율 {(threshold.shareRatioThreshold * 100).toFixed(0)}%</strong> 또는{" "}
                      <strong>
                        시가총액{" "}
                        {threshold.marketCapThreshold === Infinity
                          ? "해당 없음"
                          : `${(threshold.marketCapThreshold / 100_000_000).toLocaleString()}억원`}
                      </strong>{" "}
                      ({threshold.ruleSource}) → 현재 입력은{" "}
                      <strong>{autoIsMajor ? "대주주" : "대주주 아님"}</strong>
                    </div>
                  )}
                </ToneCard>
              )}
            </div>
          </ToggleCard>
        </div>
      </div>
    </ToggleCard>
  );
}
