/**
 * 감면 패널 — **분류(그룹) 섹션** 컴포넌트.
 *
 * `UnifiedReductionPanel.tsx`에서 분리했다(800줄 정책). 그 파일은 패널 전체의 조립·상태를 맡고,
 * 여기는 한 분류(펼침 헤더 + 라디오 + 조문별 입력 폼)의 렌더링만 맡는다.
 * 방향은 한쪽뿐이다(패널 → 여기).
 */
"use client";

import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-store";
import type { RentalReductionFormVariant } from "@/lib/stores/calc-wizard-asset-reduction";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";
import type { ReductionPhdValue } from "@/components/calc/transfer/ReductionPhdInput";
import { New993InputForm } from "@/components/calc/transfer/New993InputForm";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { Rental975InputForm } from "@/components/calc/transfer/rental/Rental975InputForm";
import { Rental97MainInputForm } from "@/components/calc/transfer/rental/Rental97MainInputForm";
import { Rental972InputForm } from "@/components/calc/transfer/rental/Rental972InputForm";
import { Rental974InputForm } from "@/components/calc/transfer/rental/Rental974InputForm";
import { New994InputForm } from "@/components/calc/transfer/New994InputForm";
import { Unsold989InputForm } from "@/components/calc/transfer/Unsold989InputForm";
import { New99InputForm } from "@/components/calc/transfer/New99InputForm";
import { Unsold988InputForm } from "@/components/calc/transfer/Unsold988InputForm";
import { Unsold987InputForm } from "@/components/calc/transfer/Unsold987InputForm";
import { Unsold992InputForm } from "@/components/calc/transfer/Unsold992InputForm";
import { Unsold983InputForm } from "@/components/calc/transfer/Unsold983InputForm";
import { Unsold985InputForm } from "@/components/calc/transfer/Unsold985InputForm";
import { Unsold986InputForm } from "@/components/calc/transfer/Unsold986InputForm";
import { Unsold982InputForm } from "@/components/calc/transfer/Unsold982InputForm";
import { Unsold984InputForm } from "@/components/calc/transfer/Unsold984InputForm";
import { Unsold98InputForm } from "@/components/calc/transfer/Unsold98InputForm";
import {
  REDUCTION_METADATA,
  ALL_REDUCTION_IDS,
  CATEGORY_UI_SCHEMA,
  isReductionAllowedForAssetKind,
  type TransferReductionId,
  type ReductionCategory,
  type ReductionAssetKind,
  type PeriodCheckContext,
} from "@/lib/tax-engine/transfer-reductions";

// ============================================================================
// 서브 컴포넌트: 그룹 카테고리 (펼침 헤더 + 라디오)
// ============================================================================

const CATEGORY_LAW_BADGES: Record<
  ReductionCategory,
  { legalBasis: string; label: string }[]
> = {
  rental: [
    { legalBasis: "조세특례제한법 §97", label: "§97 장기임대주택" },
    { legalBasis: "조세특례제한법 §97의3", label: "§97의3" },
    { legalBasis: "조세특례제한법 §97의4", label: "§97의4" },
    { legalBasis: "조세특례제한법 §97의5", label: "§97의5" },
  ],
  new_housing: [{ legalBasis: "조세특례제한법 §99", label: "§99 시리즈 신축주택" }],
  unsold_housing: [{ legalBasis: "조세특례제한법 §98", label: "§98 시리즈 미분양주택" }],
  standalone: [],
};

export function GroupCategorySection({
  category,
  isOpen,
  onToggleOpen,
  counter,
  housingAllowed,
  assetKind,
  assetKindLabel,
  periodResults,
  reductions,
  onSelectId,
  new993,
  onUpdate993,
  onUpdate993Many,
  onUpdateRentalVariant,
  onUpdate994,
  onUpdate989,
  onUpdate99,
  onUpdate988,
  onUpdate987,
  onUpdate992,
  onUpdate983,
  onUpdate985,
  onUpdate986,
  onUpdate982,
  onUpdate984Hybrid,
  onUpdate98,
  assetContractDate,
  onAssetContractDateChange,
  assetId,
  acquisitionDate,
  transferDate,
  assetJibun,
  assetDong,
  assetHo,
  assetPhdSnapshot,
}: {
  category: ReductionCategory;
  isOpen: boolean;
  onToggleOpen: () => void;
  counter: { active: number; total: number };
  /** 자산 종류 게이트 — 주택 감면이 이 자산에 적용 가능한지 (false면 카테고리 전체 비활성) */
  housingAllowed: boolean;
  /**
   * 조문 단위 게이트용 자산 종류. 카테고리 게이트(`housingAllowed`)만으로는 부족하다 —
   * 같은 카테고리 안에서도 조문마다 대상이 다를 수 있다(예: §98의2는 조합원 취득 자산 제외).
   * ⑧ validate가 쓰는 `isReductionAllowedForAssetKind`와 **같은 술어**를 여기서도 쓴다.
   */
  assetKind: ReductionAssetKind;
  /** 비활성 사유 표시용 현재 자산 종류 한글 라벨 */
  assetKindLabel: string;
  periodResults: Record<TransferReductionId, { inPeriod: boolean; failReason?: string; periodLabel?: string }>;
  reductions: AssetReductionForm[];
  onSelectId: (id: TransferReductionId) => void;
  new993: Extract<AssetReductionForm, { type: "new_99_3" }> | undefined;
  onUpdate993: <K extends keyof Extract<AssetReductionForm, { type: "new_99_3" }>>(
    key: K,
    value: Extract<AssetReductionForm, { type: "new_99_3" }>[K],
  ) => void;
  onUpdate993Many: (patch: Partial<Extract<AssetReductionForm, { type: "new_99_3" }>>) => void;
  onUpdateRentalVariant: (
    id: RentalReductionFormVariant["type"],
    patch: Partial<RentalReductionFormVariant>,
  ) => void;
  onUpdate994: (
    id: "new_99_4_rural" | "new_99_4_hometown",
    patch: Partial<Extract<AssetReductionForm, { type: "new_99_4_hometown" }>>,
  ) => void;
  onUpdate989: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_9" }>>) => void;
  onUpdate99: (patch: Partial<Extract<AssetReductionForm, { type: "new_99" }>>) => void;
  onUpdate988: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_8" }>>) => void;
  onUpdate987: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_7" }>>) => void;
  onUpdate992: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_99_2" }>>) => void;
  onUpdate983: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_3" }>>) => void;
  onUpdate985: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_5" }>>) => void;
  onUpdate986: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_6" }>>) => void;
  onUpdate982: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_2" }>>) => void;
  onUpdate984Hybrid: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98_4" }>>) => void;
  onUpdate98: (patch: Partial<Extract<AssetReductionForm, { type: "unsold_98" }>>) => void;
  /** Round 9 (2026-05-06): 매매계약일 (자산-수준, 펼침 시 활성화) */
  assetContractDate: string;
  onAssetContractDateChange: (v: string) => void;
  /** 자산 식별자 — 감면 PHD 건물 기준시가 계산서 스냅샷 키(bsp-${assetId}-red-phd) 소속 판정용 */
  assetId?: string;
  /** Round 10 (2026-05-06): 자산 취득일 — PHD 자동 활성화 권장 판정 */
  acquisitionDate?: string;
  /** 양도일 — 임대 기간 미리보기용 + §99의3 양도시 기준시가 조회 referenceDate */
  transferDate?: string;
  /** 양도물건(asset) 지번 주소 — §99의3 기준시가 Vworld 자동조회 소스 */
  assetJibun?: string;
  /** 양도물건 공동주택 동 — 세대 식별 */
  assetDong?: string;
  /** 양도물건 공동주택 호 — 세대 식별 */
  assetHo?: string;
  /** Round 10 (2026-05-06): 자산-수준 PHD 데이터 스냅샷 — "자산 카드 PHD 가져오기" 버튼 */
  assetPhdSnapshot?: ReductionPhdValue;
}) {
  const schema = CATEGORY_UI_SCHEMA[category];
  const items = ALL_REDUCTION_IDS.filter((id) => REDUCTION_METADATA[id].category === category);
  // 감면 조문 입력 폼 공통 자산 props — 기준시가 조회형 위젯 + PHD 환산용(§99·§99의2·§98의3/5/6/7/8·§99의3).
  const reductionAssetProps = {
    assetId,
    acquisitionDate,
    transferDate,
    jibun: assetJibun,
    dong: assetDong,
    ho: assetHo,
    assetPhdSnapshot,
  };

  return (
    <div className="rounded-lg border border-border bg-muted/5">
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/20"
      >
        <div>
          <span className="text-sm font-semibold">{schema.title}</span>
          <span className="ml-2 text-xs text-muted-foreground">{schema.subtitle}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs">
            <span className={housingAllowed && counter.active > 0 ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>
              활성 {housingAllowed ? counter.active : 0}
            </span>
            <span className="mx-1 text-muted-foreground">/</span>
            <span className="text-muted-foreground">전체 {counter.total}</span>
          </span>
          <span className={expandToggleClass("slate")}>{expandToggleLabel(isOpen)}</span>
        </div>
      </button>
      {isOpen && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {CATEGORY_LAW_BADGES[category].length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORY_LAW_BADGES[category].map((b) => (
                <LawArticleModal key={b.legalBasis} legalBasis={b.legalBasis} label={b.label} />
              ))}
            </div>
          )}
          {/* Round 9 (2026-05-06): 매매계약일 입력 — 펼침 활성화 시에만 노출.
              3개 그룹(장기임대·신축·미분양) 펼침 영역 상단에 표시되며, 자산-수준 단일 필드를 공유.
              어느 그룹에서 입력하든 즉시 동기화. */}
          <div className="rounded-md border border-border bg-muted/30 dark:bg-muted/10 px-3 py-2 mb-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold whitespace-nowrap">매매계약일 (분양/매매)</span>
              <div className="flex-1 min-w-[180px]">
                <DateInput value={assetContractDate} onChange={onAssetContractDateChange} />
              </div>
            </div>
            <p className="mt-1.5 text-micro text-muted-foreground leading-relaxed">
              ※ 분양·매매계약 + 계약금 납부 시점. <strong>신축·미분양·임대 감면 시한 판정의 1차 기준</strong>.
              미입력 시 자산의 취득일을 사용합니다 (조문 단서 &ldquo;매매계약 + 계약금 = 취득&rdquo;).
            </p>
          </div>

          {items.map((id) => {
            const itemMeta = REDUCTION_METADATA[id];
            const period = periodResults[id];
            const isFullyImplemented = itemMeta.isFullyImplemented === true;
            const isSelected = reductions.some((r) => r.type === id);
            /**
             * ⚠ **이미 선택된 것은 항상 해제할 수 있어야 한다** (D9-03).
             *
             * 같은 파일 `:467`(standalone 카드)에 이미 확립된 패턴인데 이 그룹에만 빠져 있었다.
             *
             * 증상: §97의4를 고르는 순간 `toggleGroupRadio`가 기존 항목을 제거하고
             * `registrationDate: ""`인 기본값을 넣는다. 그러면 period ctx의 등록일이
             * 취득일로 되돌아가고(`:139` fallback), 취득일이 2014-01-01 이전이면 시한 밖이
             * 되어 **선택된 채로 disabled**가 된다. children은 계속 렌더되므로 등록일을
             * 다시 넣으면 복구되지만, 그 전까지는 `onCheckedChange`가 막혀 **해제도 불가능한
             * stuck 상태**이고 ⑧이 등록일 미입력을 차단해 계산도 막힌다.
             *
             * ⚠️ 근본 원인은 별개다 — §97의4의 「등록일 2014.1.1 이후」 시한은 법·령 어디에도
             *    없다(CB-01). 그 규칙이 살아 있는 동안의 UI 증상을 여기서 막는다.
             */
            /**
             * 🔴 조문 단위 게이트 — 카테고리 게이트만 보면 ⑧이 막는 것을 ⑤가 못 막는다.
             *   §98의2는 미분양주택 정의상 조합원 취득 자산(재개발APT·입주권)에 적용될 수
             *   없는데, 카테고리(`unsold_housing`)는 그 자산종류를 허용한다.
             *   ⑧ `transfer-tax-validate-reductions.ts:95`와 **같은 술어**를 쓴다.
             */
            const articleAllowed = isReductionAllowedForAssetKind(id, assetKind);
            const isDisabled =
              !isSelected &&
              (!housingAllowed || !articleAllowed || !period.inPeriod || !isFullyImplemented);

            // 비활성 사유 (주택 게이트 > 조문 게이트 > 시한 외 > 미구현 — 가장 근본 차단 사유 우선)
            const disabledReason = !housingAllowed
              ? `🏠 주택 양도에만 적용되는 감면입니다 (현재 자산: ${assetKindLabel})`
              : !articleAllowed
              ? `🏠 이 조문은 현재 자산 종류(${assetKindLabel})에 적용되지 않습니다`
              : !period.inPeriod
                ? `⚠ ${period.failReason ?? "시한 외"}`
                : !isFullyImplemented
                  ? "📋 시한 통과 — Phase 2~ 본격 구현 예정"
                  : undefined;

            // §97 시리즈 현재 선택된 variant 찾기
            const rentalVariantTypes = [
              "rental_97_3", "rental_97_4", "rental_97_5",
              "rental_97_main", "rental_97_proviso", "rental_97_2",
            ] as const;
            const isRentalId = (rentalVariantTypes as readonly string[]).includes(id);
            const rentalForm = isRentalId
              ? reductions.find((r) => r.type === id) as RentalReductionFormVariant | undefined
              : undefined;

            return (
              <div key={id}>
                {/* ToggleCard 그룹 — 카테고리 내 1개 강제는 parent의 toggleGroupRadio가 처리 */}
                {/* 같은 항목 재클릭 시 해제: ToggleCard onCheckedChange가 false→true, true→false 자연 동작 */}
                <ToggleCard
                  checked={isSelected}
                  onCheckedChange={() => {
                    if (!isDisabled) onSelectId(id);
                  }}
                  title={itemMeta.uiLabel}
                  description={itemMeta.effectLabel}
                  tone={schema.tone}
                  size="sm"
                  disabled={isDisabled}
                  disabledReason={disabledReason}
                >
                  {/* §99의3 본격 입력 폼 — ToggleCard children 펼침 영역 */}
                  {id === "new_99_3" && new993 && (
                    <New993InputForm
                      value={new993}
                      onUpdate={onUpdate993}
                      onUpdateMany={onUpdate993Many}
                      {...reductionAssetProps}
                    />
                  )}
                  {/* §97의3 입력 폼 */}
                  {id === "rental_97_3" && rentalForm && rentalForm.type === "rental_97_3" && (
                    <Rental973InputForm
                      value={rentalForm}
                      onChange={(patch) => onUpdateRentalVariant("rental_97_3", patch as Partial<RentalReductionFormVariant>)}
                      transferDate={transferDate}
                    />
                  )}
                  {/* §97의5 입력 폼 */}
                  {id === "rental_97_5" && rentalForm && rentalForm.type === "rental_97_5" && (
                    <Rental975InputForm
                      value={rentalForm}
                      onChange={(patch) => onUpdateRentalVariant("rental_97_5", patch as Partial<RentalReductionFormVariant>)}
                      acquisitionDate={acquisitionDate}
                      transferDate={transferDate}
                    />
                  )}
                  {/* §97 본문 입력 폼 */}
                  {id === "rental_97_main" && rentalForm && rentalForm.type === "rental_97_main" && (
                    <Rental97MainInputForm
                      value={rentalForm}
                      onChange={(patch) => onUpdateRentalVariant("rental_97_main", patch as Partial<RentalReductionFormVariant>)}
                    />
                  )}
                  {/* §97 단서 입력 폼 */}
                  {id === "rental_97_proviso" && rentalForm && rentalForm.type === "rental_97_proviso" && (
                    <Rental97MainInputForm
                      value={rentalForm}
                      onChange={(patch) => onUpdateRentalVariant("rental_97_proviso", patch as Partial<RentalReductionFormVariant>)}
                    />
                  )}
                  {/* §97의2 입력 폼 */}
                  {id === "rental_97_2" && rentalForm && rentalForm.type === "rental_97_2" && (
                    <Rental972InputForm
                      value={rentalForm}
                      onChange={(patch) => onUpdateRentalVariant("rental_97_2", patch as Partial<RentalReductionFormVariant>)}
                    />
                  )}
                  {/* §97의4 입력 폼 */}
                  {id === "rental_97_4" && rentalForm && rentalForm.type === "rental_97_4" && (
                    <Rental974InputForm
                      value={rentalForm}
                      onChange={(patch) => onUpdateRentalVariant("rental_97_4", patch as Partial<RentalReductionFormVariant>)}
                      transferDate={transferDate}
                    />
                  )}
                  {/* §99의4 농어촌·고향주택 입력 폼 (2026-06-11) */}
                  {(id === "new_99_4_rural" || id === "new_99_4_hometown") &&
                    (() => {
                      const form994 = reductions.find((r) => r.type === id);
                      return form994 && (form994.type === "new_99_4_rural" || form994.type === "new_99_4_hometown") ? (
                        <New994InputForm
                          value={form994}
                          onChange={(patch) => onUpdate994(id as "new_99_4_rural" | "new_99_4_hometown", patch)}
                          transferDate={transferDate}
                        />
                      ) : null;
                    })()}
                  {/* §98의9 준공후미분양 입력 폼 (2026-06-11) */}
                  {id === "unsold_98_9" &&
                    (() => {
                      const form989 = reductions.find((r) => r.type === "unsold_98_9");
                      return form989 && form989.type === "unsold_98_9" ? (
                        <Unsold989InputForm value={form989} onChange={onUpdate989} />
                      ) : null;
                    })()}
                  {/* P1 (2026-06-11): §99 신축주택 IMF 1차 입력 폼 */}
                  {id === "new_99" &&
                    (() => {
                      const form99 = reductions.find((r) => r.type === "new_99");
                      return form99 && form99.type === "new_99" ? (
                        <New99InputForm value={form99} onChange={onUpdate99} {...reductionAssetProps} />
                      ) : null;
                    })()}
                  {/* P1 (2026-06-11): §98의8 준공후미분양 50% 입력 폼 */}
                  {id === "unsold_98_8" &&
                    (() => {
                      const form988 = reductions.find((r) => r.type === "unsold_98_8");
                      return form988 && form988.type === "unsold_98_8" ? (
                        <Unsold988InputForm value={form988} onChange={onUpdate988} {...reductionAssetProps} />
                      ) : null;
                    })()}
                  {/* P2 (2026-06-11): §98의7 9억↓ 미분양 입력 폼 */}
                  {id === "unsold_98_7" &&
                    (() => {
                      const form987 = reductions.find((r) => r.type === "unsold_98_7");
                      return form987 && form987.type === "unsold_98_7" ? (
                        <Unsold987InputForm value={form987} onChange={onUpdate987} {...reductionAssetProps} />
                      ) : null;
                    })()}
                  {/* P2 (2026-06-11): §99의2 신축·미분양·1세대1주택 입력 폼 */}
                  {id === "unsold_99_2" &&
                    (() => {
                      const form992 = reductions.find((r) => r.type === "unsold_99_2");
                      return form992 && form992.type === "unsold_99_2" ? (
                        <Unsold992InputForm value={form992} onChange={onUpdate992} {...reductionAssetProps} />
                      ) : null;
                    })()}
                  {/* P3 (2026-06-12): §98의3 / §98의5 / §98의6 입력 폼 */}
                  {id === "unsold_98_3" &&
                    (() => {
                      const form983 = reductions.find((r) => r.type === "unsold_98_3");
                      return form983 && form983.type === "unsold_98_3" ? (
                        <Unsold983InputForm value={form983} onChange={onUpdate983} {...reductionAssetProps} />
                      ) : null;
                    })()}
                  {id === "unsold_98_5" &&
                    (() => {
                      const form985 = reductions.find((r) => r.type === "unsold_98_5");
                      return form985 && form985.type === "unsold_98_5" ? (
                        <Unsold985InputForm value={form985} onChange={onUpdate985} {...reductionAssetProps} />
                      ) : null;
                    })()}
                  {id === "unsold_98_6" &&
                    (() => {
                      const form986 = reductions.find((r) => r.type === "unsold_98_6");
                      return form986 && form986.type === "unsold_98_6" ? (
                        <Unsold986InputForm value={form986} onChange={onUpdate986} {...reductionAssetProps} />
                      ) : null;
                    })()}
                  {/* P5 (2026-06-12): §98 입력 폼 */}
                  {id === "unsold_98" &&
                    (() => {
                      const form98 = reductions.find((r) => r.type === "unsold_98");
                      return form98 && form98.type === "unsold_98" ? (
                        <Unsold98InputForm value={form98} onChange={onUpdate98} />
                      ) : null;
                    })()}
                  {/* P4 (2026-06-12): §98의2 / §98의4 입력 폼 */}
                  {id === "unsold_98_2" &&
                    (() => {
                      const form982 = reductions.find((r) => r.type === "unsold_98_2");
                      return form982 && form982.type === "unsold_98_2" ? (
                        <Unsold982InputForm value={form982} onChange={onUpdate982} />
                      ) : null;
                    })()}
                  {id === "unsold_98_4" &&
                    (() => {
                      const form984 = reductions.find((r) => r.type === "unsold_98_4");
                      return form984 && form984.type === "unsold_98_4" ? (
                        <Unsold984InputForm value={form984} onChange={onUpdate984Hybrid} />
                      ) : null;
                    })()}
                </ToggleCard>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
