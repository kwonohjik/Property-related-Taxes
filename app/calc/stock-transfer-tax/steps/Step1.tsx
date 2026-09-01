"use client";

/**
 * Step 1 — 자산·시장·대주주 (v2.2 동적 번호 + 분할 매수·분할 양도)
 *
 * 입력 순서 = 엔진 계산 로직 순서 (feedback_ui_order_follows_logic):
 *   시장 분류 → 회사 분류 → 양도·취득 lot (또는 일자/주식수) → 취득원인(single only) → 대주주 → 기타자산(조건부)
 *
 * 동적 번호 재할당 (Plan v2.2 §8):
 *   - visible sections useMemo로 산출 + idx + 1로 연속 번호
 *   - split 모드 시 cause 섹션 자동 숨김 (lot별 cause 입력)
 *   - 기타자산 조건부 표시
 */

import { useMemo, type ReactNode } from "react";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { nanoid } from "nanoid";
import { MarketTypeBlock } from "@/components/calc/stock-transfer/MarketTypeBlock";
import { MajorShareholderBlock } from "@/components/calc/stock-transfer/MajorShareholderBlock";
import { suggestPriorYearEndDate } from "@/lib/tax-engine/stock-transfer/major-shareholder-judgment-date";
import { CompanyTypeBlock } from "@/components/calc/stock-transfer/CompanyTypeBlock";
import { OtherAssetBlock } from "@/components/calc/stock-transfer/OtherAssetBlock";
import { AcquisitionInfoBlock } from "@/components/calc/stock-transfer/AcquisitionInfoBlock";
import { SplitLotsBlock } from "@/components/calc/stock-transfer/SplitLotsBlock";
import { SecurityMetadataBlock } from "@/components/calc/stock-transfer/SecurityMetadataBlock";
import { ForeignStockBlock } from "@/components/calc/stock-transfer/ForeignStockBlock";
import { ExitTaxBlock } from "@/components/calc/stock-transfer/ExitTaxBlock";
import { withAutoSyncMajor } from "@/components/calc/stock-transfer/major-sync";
import type {
  StockTransferFormData,
  AcquisitionLotForm,
  TransferLotForm,
} from "@/lib/stores/calc-wizard-stock-store";

interface Step1Props {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-4">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-bold">
        {n}
      </span>
      {title}
    </h2>
  );
}

export function Step1({ form, onChange }: Step1Props) {
  const syncedChange = withAutoSyncMajor(form, onChange);

  // ── lotsMode 토글 마이그레이션 wrapper ──
  const handleLotsModeToggle = (newMode: "single" | "split") => {
    if (newMode === form.lotsMode) return;

    if (newMode === "split") {
      // single → split: 폼-전역 값을 첫 lot으로 마이그레이션 (데이터 보존)
      const newAcqLot: AcquisitionLotForm | null = form.acquisitionDate
        ? {
            id: nanoid(),
            acquisitionDate: form.acquisitionDate,
            shareCount: form.shareCount,
            perShareAcquisitionPrice: form.perShareAcquisitionPrice,
            acquisitionCause: form.acquisitionCause || "purchase",
            decedentAcquisitionDate: form.decedentAcquisitionDate || undefined,
            preMergerAcquisitionDate: form.preMergerAcquisitionDate || undefined,
          }
        : null;
      const newTrnLot: TransferLotForm | null = form.transferDate
        ? {
            id: nanoid(),
            transferDate: form.transferDate,
            shareCount: form.shareCount,
            perShareTransferPrice: form.perShareTransferPrice,
          }
        : null;
      onChange({
        lotsMode: "split",
        acquisitionLots: newAcqLot ? [newAcqLot] : [],
        transferLots: newTrnLot ? [newTrnLot] : [],
      });
    } else {
      // split → single: 사용자 확인 (UI 단순화 — confirm 사용)
      if (form.acquisitionLots.length > 0 || form.transferLots.length > 0) {
        const ok = confirm("분할 lot 데이터가 단일 모드로 전환됩니다. 첫 번째 lot만 유지됩니다. 계속하시겠습니까?");
        if (!ok) return;
      }
      const firstAcq = form.acquisitionLots[0];
      const firstTrn = form.transferLots[0];
      onChange({
        lotsMode: "single",
        acquisitionDate: firstAcq?.acquisitionDate ?? "",
        perShareAcquisitionPrice: firstAcq?.perShareAcquisitionPrice ?? "",
        transferDate: firstTrn?.transferDate ?? "",
        perShareTransferPrice: firstTrn?.perShareTransferPrice ?? "",
        shareCount: firstTrn?.shareCount ?? firstAcq?.shareCount ?? "",
        acquisitionCause: firstAcq?.acquisitionCause ?? "purchase",
        decedentAcquisitionDate: firstAcq?.decedentAcquisitionDate ?? "",
        preMergerAcquisitionDate: firstAcq?.preMergerAcquisitionDate ?? "",
        acquisitionLots: [],
        transferLots: [],
        specificMatchings: [],
      });
    }
  };

  // ── 동적 번호 재할당 — visible sections useMemo ──
  const sections = useMemo(() => {
    const items: Array<{ key: string; title: string; render: () => ReactNode }> = [];

    // 0(1번). 기본 사항 (양도인 인적사항 + 종목 식별)
    items.push({
      key: "security",
      title: "기본 사항",
      render: () => (
        <SecurityMetadataBlock
          securityName={form.securityName}
          securityCode={form.securityCode}
          brokerage={form.brokerage}
          accountNumberMasked={form.accountNumberMasked}
          marketType={form.marketType}
          securityMetaFetchedAt={form.securityMetaFetchedAt}
          onChange={onChange}
        />
      ),
    });

    // 1. 시장 유형
    items.push({
      key: "market",
      title: "시장 유형",
      render: () => (
        <MarketTypeBlock
          marketType={form.marketType}
          onChange={(marketType) => syncedChange({ marketType })}
        />
      ),
    });

    // PR-4A 해외주식 — 선택 시 별도 입력 블록, 나머지 섹션 스킵
    if (form.marketType === "foreign_stock") {
      items.push({
        key: "foreign",
        title: "해외주식 입력 (§94①3 다목)",
        render: () => <ForeignStockBlock form={form} onChange={onChange} />,
      });
      return items;  // 대주주·기타자산 섹션 스킵
    }

    // PR-4B 국외전출세 — 선택 시 별도 입력 블록, 나머지 섹션 스킵
    if (form.marketType === "exit_tax") {
      items.push({
        key: "exit_tax",
        title: "국외전출세 입력 (§118의9)",
        render: () => <ExitTaxBlock form={form} onChange={onChange} />,
      });
      return items;  // 대주주·기타자산 섹션 스킵
    }

    // 2. 회사 분류 (국내주식 전용)
    items.push({
      key: "company",
      title: "회사 규모 / K-OTC / 벤처기업",
      render: () => <CompanyTypeBlock form={form} onChange={onChange} />,
    });

    // 3. 양도·취득 일자·주식수 (single 또는 split)
    items.push({
      key: "dates",
      title:
        form.lotsMode === "split"
          ? "양도·취득 lot (분할 양도 모드)"
          : "양도·취득 일자 및 주식수",
      render: () => (
        <div className="space-y-4">
          {/* 모드 토글 */}
          <RadioCardGroup
            name="lotsMode"
            value={form.lotsMode}
            options={[
              {
                value: "single",
                label: "단일 양도",
                description: "양도는 한 번에 (취득은 단건/분할 모두 가능)",
              },
              {
                value: "split",
                label: "분할 양도",
                description: "여러 차례 나눠 매도. 산정방법 3종 선택",
              },
            ]}
            layout="inline"
            tone="violet"
            onChange={(v) => handleLotsModeToggle(v)}
          />

          {/* 분기 입력 */}
          {form.lotsMode === "single" ? (
            <div className="space-y-4">
              {/* ⓐ 취득 정보 (amber tone, 취득일·cause·보조일자 통합) */}
              <AcquisitionInfoBlock form={form} onChange={onChange} />

              {/* ⓑ 양도 정보 (emerald tone grid 2cell) */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-emerald-800 font-semibold text-sm">📤 양도 정보</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FieldCard label="양도일" required>
                    <DateInput
                      value={form.transferDate}
                      onChange={(v) => {
                        // 대주주 판정 기준일 제안 — 미입력일 때만. 사용자 입력은 덮어쓰지 않는다.
                        // useEffect → store 미러링 금지 정책에 따라 onChange patch에 동승시킨다.
                        const suggested = form.priorYearEndDate
                          ? undefined
                          : suggestPriorYearEndDate(v);
                        const judgmentDatePatch =
                          suggested ? { priorYearEndDate: suggested } : {};
                        // 양도일 변경 시 1개월 종가표 잔재 자동 리셋 (인덱스 misalign 차단 — R-7·E-8)
                        // 양도일은 §157 **임계표 행 선택** 인자다(부칙 「양도하는 분부터」).
                        // 바뀌면 대주주 자동 판정이 달라지므로 syncedChange로 echo를 함께 갱신한다.
                        //
                        // ⚠️ **모드 조건 제거 (2026-09-01)** — 종전에는 `transferStdInputMode === "daily"`
                        //    일 때만 지웠다. direct 모드에서 양도일을 바꾼 뒤 daily로 전환하면 배열이
                        //    낡은 채 살아남아, 표의 실시간 재계산과 저장된 평균이 갈렸다
                        //    (제보 2026-09-01 — 화면 두 줄이 16,560 vs 16,559).
                        //    저장 평균은 §99①3 환산 **분모로 엔진에 가므로** 표시만의 문제가 아니다.
                        //    잔재는 어느 모드에서 생겼든 양도일이 바뀌면 무효다.
                        //    anchor: `__tests__/components/calc/stock-transfer/one-month-avg-stale-mirror.anchor.test.tsx`
                        if (v !== form.transferDate) {
                          syncedChange({
                            transferDate: v,
                            transferPriceDates: [],
                            transferPriceClosing: [],
                            transferDatePriceAvg1Month: "",
                            ...judgmentDatePatch,
                          });
                        } else {
                          syncedChange({ transferDate: v, ...judgmentDatePatch });
                        }
                      }}
                    />
                  </FieldCard>
                  <FieldCard label="양도 주식수" required>
                    <DecimalInput
                      value={form.shareCount}
                      onChange={(v) => onChange({ shareCount: v })}
                      thousandSeparator
                    />
                  </FieldCard>
                </div>
              </div>

              {/* 발행주식 총수 (full-width) */}
              <FieldCard label="발행주식 총수" required>
                <DecimalInput
                  value={form.totalIssuedShares}
                  onChange={(v) => onChange({ totalIssuedShares: v })}
                  thousandSeparator
                />
              </FieldCard>
            </div>
          ) : (
            <>
              <SplitLotsBlock form={form} onChange={onChange} />
              <FieldCard label="발행주식 총수" required>
                <DecimalInput
                  value={form.totalIssuedShares}
                  onChange={(v) => onChange({ totalIssuedShares: v })}
                  thousandSeparator
                />
              </FieldCard>
            </>
          )}
        </div>
      ),
    });

    // (v1.2) "취득원인" 별도 섹션 폐기 — AcquisitionInfoBlock(취득 정보 카드)에 통합됨
    //   • single 모드: AcquisitionInfoBlock 내부에서 cause + 보조일자 모두 입력
    //   • split 모드: SplitLotsBlock의 lot별 입력 (변경 없음)

    // 4. 대주주 판정 — §94①3(상장·비상장)에서만 의미 있음.
    //    other_asset(§94①4) / foreign_stock(§118의2) / exit_tax(§118의9) 트랙은 대주주 무관 → 섹션 숨김.
    const majorShareholderApplicable =
      form.marketType === "kospi" ||
      form.marketType === "kosdaq" ||
      form.marketType === "konex" ||
      form.marketType === "unlisted";
    if (majorShareholderApplicable) {
      items.push({
        key: "major",
        title: "대주주 판정 (시행령 §157)",
        render: () => <MajorShareholderBlock form={form} onChange={onChange} />,
      });
    }

    // 6. 기타자산 §94①4 — 조건부
    if (
      form.marketType === "other_asset" ||
      form.isQualifyingBlockShareholder ||
      form.isHeavyRealEstateForRate
    ) {
      items.push({
        key: "other",
        title: "기타자산 해당 여부 (§94①4)",
        render: () => <OtherAssetBlock form={form} onChange={onChange} />,
      });
    }

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, onChange]);

  return (
    <div className="space-y-8">
      {sections.map((s, idx) => (
        <section key={s.key}>
          <SectionTitle n={idx + 1} title={s.title} />
          {s.render()}
        </section>
      ))}
    </div>
  );
}
