import type { TransferFormData, AssetForm, AssetReductionForm, PriorReductionUsageItem } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { SelfFarmingIncorporationInput } from "@/components/calc/inputs/SelfFarmingIncorporationInput";
import { UnifiedReductionPanel } from "@/components/calc/transfer/UnifiedReductionPanel";
import { ALL_LIMIT_GROUP_TYPES } from "@/lib/tax-engine/aggregate-reduction-limits";
import { REDUCTION_TYPE_LABELS } from "@/lib/tax-engine/transfer-reduction-type-labels";
import { isGbClaimRouteAllowedForAssetKind } from "@/lib/tax-engine/transfer-reductions";

// ============================================================
// Step 5 (→ Step 4): 감면·공제 (자산별 체크박스 복수 선택)
// ============================================================

// REDUCTION_LABELS — Phase 1·2 (2026-05-06):
// - 기존 5개 항목 유지 (legacy long_term_rental/new_housing/unsold_housing은 마이그레이션 후 deprecated)
// - Phase 2: §99의3 신축주택 과세특례 (new_99_3) 추가 — UI 펼침 패널은 묶음 B에서 본격 통합
// 매핑 감사: docs/02-design/features/transfer-reduction-mapping-audit.md
const REDUCTION_LABELS = {
  self_farming: { label: "자경농지 감면", desc: "8년 이상 자경 (§69, 한도 1억)" },
  long_term_rental: { label: "장기임대주택 감면", desc: "공공지원/장기일반민간임대 10년+ → 장특공제율 70% (§97의3)" },
  new_housing: { label: "신축주택 감면", desc: "신축주택 취득자 양도세 감면 (§99, 1998~1999 IMF 1차)" },
  unsold_housing: { label: "미분양주택 감면", desc: "서울 외 미분양 5년 100% (수도권과밀 60%) — §98의3, 2009.2.12~2010.2.11" },
  public_expropriation: { label: "공익사업 수용 감면", desc: "현금 15%/채권 20~45% (§77, 2025+ · 연간 2억)" },
  // new_99_3은 별도 펼침 패널(ReductionExpansion)에서 처리 — 옵션 Y 결정
} as const;

type ReductionUiType = keyof typeof REDUCTION_LABELS;

function getDefaultReduction(type: ReductionUiType): AssetReductionForm {
  switch (type) {
    case "self_farming":
      return { type: "self_farming", farmingYears: "0" };
    case "long_term_rental":
      return { type: "long_term_rental", rentalYears: "0", rentIncreaseRate: "5" };
    case "new_housing":
      return { type: "new_housing", reductionRegion: "metropolitan" };
    case "unsold_housing":
      return { type: "unsold_housing", reductionRegion: "metropolitan" };
    case "public_expropriation":
      return {
        type: "public_expropriation",
        expropriationCash: "0",
        expropriationBond: "0",
        expropriationBondHoldingYears: "none",
        expropriationApprovalDate: "",
      };
  }
}

// 자산 1건의 감면 섹션
function AssetReductionBlock({
  asset,
  assetIndex,
  transferDate,
  onChange,
}: {
  asset: AssetForm;
  assetIndex: number;
  transferDate: string;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  const reductions = asset.reductions ?? [];

  function toggleReduction(type: ReductionUiType) {
    const has = reductions.some((r) => r.type === type);
    if (has) {
      onChange({ reductions: reductions.filter((r) => r.type !== type) });
    } else {
      onChange({ reductions: [...reductions, getDefaultReduction(type)] });
    }
  }

  function updateReduction(type: AssetReductionForm["type"], patch: object) {
    onChange({
      reductions: reductions.map((r) =>
        r.type === type ? ({ ...r, ...patch } as AssetReductionForm) : r,
      ),
    });
  }

  const selfFarming = reductions.find((r) => r.type === "self_farming");
  const longTermRental = reductions.find((r) => r.type === "long_term_rental");
  const newHousing = reductions.find((r) => r.type === "new_housing");
  const unsoldHousing = reductions.find((r) => r.type === "unsold_housing");
  const expropriation = reductions.find((r) => r.type === "public_expropriation");
  const gbDesignated = reductions.find((r) => r.type === "gb_designated_land");
  const replacementLand = reductions.find((r) => r.type === "replacement_land_comp");
  // §77 감면율 2025.3.14 개정 — 2025.1.1 이후 양도분 상향(현금 15·채권 20/35/45%, 연간 2억).
  // 문자열 ISO(YYYY-MM-DD) 사전순 비교. 미입력("") → 개정 전 표기.
  const expropriationAmended2025 = (transferDate ?? "") >= "2025-01-01";

  const label =
    asset.assetLabel ||
    `자산 ${assetIndex + 1} (${asset.assetKind === "housing" ? "주택" : asset.assetKind === "land" ? "토지" : asset.assetKind === "building" ? "건물" : asset.assetKind})`;

  return (
    <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
      <p className="text-sm font-semibold">{label}</p>

      {/* Round 8 (2026-05-06): 5개 카테고리 통합 패널 (5개 평면 체크박스 → 카테고리 라디오/체크박스) */}
      <UnifiedReductionPanel asset={asset} transferDate={transferDate} onChange={onChange} />

      {/* 자경 + 수용 동시 선택 시 경고 */}
      {selfFarming && expropriation && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <p className="font-semibold">⚠️ 자경농지 감면 + 공익수용 감면 동시 선택</p>
          <p>
            조특법 §127⑦ 단서에 따라 <strong>같은 토지의 같은 부분</strong>에는 두 감면을 중복 적용할 수
            없습니다. 수용된 부분과 자경 부분이 <strong>서로 다른 필지(또는 면적)</strong>인 경우에만
            각각 적용 가능합니다.
          </p>
          <p className="text-amber-700 dark:text-amber-400">
            중복되는 부분이 있다면 유리한 감면 1건만 선택하세요.
          </p>
        </div>
      )}

      {/* 자경농지 서브패널 */}
      {selfFarming && selfFarming.type === "self_farming" && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-3">
          <p className="text-xs font-medium text-primary">자경 기간 입력</p>
          <div className="flex items-center gap-2">
            <DecimalInput
              className="w-20"
              value={selfFarming.farmingYears}
              onChange={(v) => updateReduction("self_farming", { farmingYears: v } as Partial<AssetReductionForm>)}
            />
            <span className="text-sm text-muted-foreground">년 (8년 이상이어야 감면 적용)</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">
              결격 과세기간 (조특령 §66⑭):
            </label>
            <DecimalInput
              className="w-20"
              value={selfFarming.disqualifiedTaxPeriodsSelf ?? "0"}
              onChange={(v) =>
                updateReduction("self_farming", {
                  disqualifiedTaxPeriodsSelf: v,
                } as Partial<AssetReductionForm>)
              }
            />
            <span className="text-sm text-muted-foreground">년</span>
          </div>
          <p className="text-micro text-muted-foreground">
            사업소득금액(농업·임업·부동산임대·농가부업소득 제외) + 총급여액이 <b>3,700만원 이상</b>인
            과세기간, 또는 사업소득 총수입금액이 소득세법 시행령 §208⑤2호 각 목 금액 이상인 과세기간은
            자경기간에서 <b>제외</b>합니다 (조특령 §66⑭1호·2호). 해당 과세기간 수를 입력하세요.
          </p>

          {/* 피상속인 자경기간 합산 */}
          {asset.acquisitionCause === "inheritance" && (
            <div className="space-y-2 pt-1 border-t border-primary/20">
              {parseInt(selfFarming.farmingYears) >= 8 ? (
                <p className="text-xs text-muted-foreground">
                  ✓ 본인 자경기간 {selfFarming.farmingYears}년 ≥ 8년 — 피상속인 합산 불필요
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    본인 자경기간 {selfFarming.farmingYears}년 {"<"} 8년 → 피상속인 자경기간을 합산할 수 있습니다 (조특령 §66⑪)
                  </p>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground whitespace-nowrap">피상속인 자경기간:</label>
                    <DecimalInput
                      className="w-20"
                      value={selfFarming.decedentFarmingYears ?? "0"}
                      onChange={(v) =>
                        updateReduction("self_farming", { decedentFarmingYears: v } as Partial<AssetReductionForm>)
                      }
                    />
                    <span className="text-sm text-muted-foreground">년</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground whitespace-nowrap">
                      피상속인 결격 과세기간 (§66⑭):
                    </label>
                    <DecimalInput
                      className="w-20"
                      value={selfFarming.disqualifiedTaxPeriodsDecedent ?? "0"}
                      onChange={(v) =>
                        updateReduction("self_farming", {
                          disqualifiedTaxPeriodsDecedent: v,
                        } as Partial<AssetReductionForm>)
                      }
                    />
                    <span className="text-sm text-muted-foreground">년</span>
                  </div>
                  <ToggleCard
                    tone="emerald"
                    title="상속받은 농지를 1년 이상 계속 경작 (조특령 §66⑪ 본문)"
                    description="제1항 각 호의 지역에 거주하면서 경작한 경우에 한정합니다. 이 요건 또는 아래 §66⑫ 대체요건 중 하나가 충족되어야 피상속인 경작기간을 합산할 수 있습니다."
                    checked={selfFarming.heirContinuedFarming1Year ?? false}
                    onCheckedChange={(v) =>
                      updateReduction("self_farming", {
                        heirContinuedFarming1Year: v,
                      } as Partial<AssetReductionForm>)
                    }
                  />
                  <ToggleCard
                    tone="emerald"
                    title="§66⑫ 대체요건 — 상속일부터 3년 내 양도·수용 + 지구 지정"
                    description="1년 이상 계속 경작하지 않았더라도, 상속받은 날부터 3년이 되는 날까지 양도하거나 협의매수·수용되면서 그 기간 내에 택지개발지구·산업단지 등으로 지정(상속받은 날 전 지정 포함)된 경우 합산할 수 있습니다."
                    checked={selfFarming.meetsDecedentAggregationAlt ?? false}
                    onCheckedChange={(v) =>
                      updateReduction("self_farming", {
                        meetsDecedentAggregationAlt: v,
                      } as Partial<AssetReductionForm>)
                    }
                  />
                  {(selfFarming.heirContinuedFarming1Year || selfFarming.meetsDecedentAggregationAlt) &&
                    parseInt(selfFarming.farmingYears) + parseInt(selfFarming.decedentFarmingYears ?? "0") >= 8 && (
                      <p className="text-xs text-green-700">
                        ✓ 합산 자경기간{" "}
                        {parseInt(selfFarming.farmingYears) + parseInt(selfFarming.decedentFarmingYears ?? "0")}년 — 감면 요건 충족
                      </p>
                    )}
                </>
              )}
            </div>
          )}

          {/* 편입일 부분감면 */}
          <SelfFarmingIncorporationInput
            useSelfFarmingIncorporation={selfFarming.useSelfFarmingIncorporation ?? false}
            selfFarmingIncorporationDate={selfFarming.selfFarmingIncorporationDate ?? ""}
            selfFarmingIncorporationZone={selfFarming.selfFarmingIncorporationZone ?? ""}
            selfFarmingIncorporationLocation={selfFarming.selfFarmingIncorporationLocation ?? ""}
            selfFarmingIncorporationProvisoException={
              selfFarming.selfFarmingIncorporationProvisoException ?? false
            }
            selfFarmingStandardPriceAtIncorporation={selfFarming.selfFarmingStandardPriceAtIncorporation ?? ""}
            selfFarmingStandardPriceAtAcquisition={selfFarming.selfFarmingStandardPriceAtAcquisition ?? ""}
            selfFarmingStandardPriceAtTransfer={selfFarming.selfFarmingStandardPriceAtTransfer ?? ""}
            onChange={(patch) =>
              updateReduction("self_farming", patch as Partial<AssetReductionForm>)
            }
            jibun={asset.addressJibun || undefined}
            landAreaM2={asset.assetKind === "land" ? asset.acquisitionArea : undefined}
            acquisitionDate={asset.acquisitionDate || undefined}
            transferDate={transferDate || undefined}
            assetStandardPriceAtAcq={asset.standardPriceAtAcq || undefined}
          />
        </div>
      )}

      {/* 장기임대주택 서브패널 — deprecated 안내 + 기존 입력 보존 */}
      {longTermRental && longTermRental.type === "long_term_rental" && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-3">
          {/* C: deprecated 배너 */}
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              ⚠ 구 방식 입력입니다
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              §97의3 정밀 계산은 <strong>감면 그룹 패널의 「§97의3」 항목</strong>을 이용하세요.
              기존 입력 값은 하위 호환을 위해 유지되지만 이후 계산에서는 정밀 입력 방식이 우선됩니다.
            </p>
          </div>
          <p className="text-xs font-medium text-primary">임대 조건 입력 (구 방식 — 보존)</p>
          <div className="flex items-center gap-2">
            <DecimalInput
              className="w-20"
              value={longTermRental.rentalYears}
              onChange={(v) =>
                updateReduction("long_term_rental", { rentalYears: v } as Partial<AssetReductionForm>)
              }
            />
            <span className="text-sm text-muted-foreground">년 임대</span>
          </div>
          <div className="flex items-center gap-2">
            <DecimalInput
              className="w-20"
              value={longTermRental.rentIncreaseRate}
              onChange={(v) =>
                updateReduction("long_term_rental", { rentIncreaseRate: v } as Partial<AssetReductionForm>)
              }
            />
            <span className="text-sm text-muted-foreground">% 임대료 인상률 (5% 이하여야 감면)</span>
          </div>
        </div>
      )}

      {/* 공익사업 수용 서브패널 */}
      {expropriation && expropriation.type === "public_expropriation" && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-primary">공익사업 수용·협의매수 (조특법 §77)</p>
            <p className="text-xs text-muted-foreground mt-1">
              {expropriationAmended2025
                ? "현금 15%, 채권 20% (3년 35%, 5년 45%). 연간 한도 2억원. (2025.1.1 이후 양도분 개정율)"
                : "현금 10%, 채권 15% (3년 30%, 5년 40%). 연간 한도 1억원. (2024.12.31 이전 양도분)"}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">현금 보상액</label>
              <CurrencyInput
                label=""
                value={expropriation.expropriationCash}
                onChange={(v) =>
                  updateReduction("public_expropriation", { expropriationCash: v } as Partial<AssetReductionForm>)
                }
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">채권 보상액</label>
              <CurrencyInput
                label=""
                value={expropriation.expropriationBond}
                onChange={(v) =>
                  updateReduction("public_expropriation", { expropriationBond: v } as Partial<AssetReductionForm>)
                }
              />
            </div>
          </div>
          <div>
            <p className="block text-xs font-medium mb-1">채권 만기보유 특약</p>
            <RadioCardGroup
              name={`expropriationBondHoldingYears-${assetIndex}`}
              layout="inline"
              tone="amber"
              value={expropriation.expropriationBondHoldingYears}
              onChange={(v) =>
                updateReduction("public_expropriation", {
                  expropriationBondHoldingYears: v,
                } as Partial<AssetReductionForm>)
              }
              options={[
                { value: "none", label: expropriationAmended2025 ? "없음 (20%)" : "없음 (15%)" },
                { value: "3", label: expropriationAmended2025 ? "3년 (35%)" : "3년 (30%)" },
                { value: "5", label: expropriationAmended2025 ? "5년 (45%)" : "5년 (40%)" },
              ]}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">사업인정고시일</label>
            <DateInput
              value={expropriation.expropriationApprovalDate || asset.expropriationNoticeDate}
              onChange={(v) =>
                updateReduction("public_expropriation", {
                  expropriationApprovalDate: v,
                } as Partial<AssetReductionForm>)
              }
              data-testid="expr-77-notice-date"
            />
            <p className="text-xs text-muted-foreground mt-1">
              ①양도정보(공익수용)에서 자동 반영 · 부칙 §53 적용 판정용 (2015-12-31 이전 고시 + 2017-12-31 이전 양도 시 종전 감면율).
            </p>
          </div>
        </div>
      )}

      {/* 개발제한구역 매수 토지 §77의3 서브패널 */}
      {gbDesignated && gbDesignated.type === "gb_designated_land" && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-primary">개발제한구역 매수 토지 감면 (조특법 §77의3)</p>
            <p className="text-xs text-muted-foreground mt-1">
              40%(지정일 이전 취득+거주) / 25%(매수·고시일 20년 이전 취득+거주). 2028.12.31까지 양도. 연간 한도 2억원. 취득일은 자산 취득일 사용(상속 시 피상속인 취득일).
            </p>
          </div>
          <div>
            <p className="block text-xs font-medium mb-1">구역 상태</p>
            <RadioCardGroup
              name={`gbBranch-${assetIndex}`}
              layout="inline"
              tone="rose"
              value={gbDesignated.gbBranch}
              onChange={(v) => updateReduction("gb_designated_land", { gbBranch: v })}
              options={[
                { value: "in_zone", label: "구역 내 매수·협의매수" },
                { value: "released", label: "해제 후 협의매수·수용" },
              ]}
            />
          </div>
          {gbDesignated.gbBranch === "in_zone" && (
            <div>
              <p className="block text-xs font-medium mb-1">매수 경로</p>
              {/* D9-06 — `layout="inline"`은 RadioCardGroup이 description을 **렌더하지 않는다**
                  (RadioCardGroup.tsx:203 — inline 분기는 label만 그린다). 이 두 옵션은 대상
                  범위 차이(§17 매수대상토지 ↔ §20 토지등)를 description으로 설명해야 하므로
                  stack 2열로 둔다. 종전에는 안내가 코드에만 있고 화면에는 없었다. */}
              <RadioCardGroup
                name={`gbPurchaseRoute-${assetIndex}`}
                layout="stack"
                columns={2}
                tone="sky"
                value={gbDesignated.gbPurchaseRoute ?? ""}
                onChange={(v) => updateReduction("gb_designated_land", { gbPurchaseRoute: v })}
                options={[
                  {
                    value: "claim",
                    label: "토지매수 청구 (§17)",
                    /**
                     * D9-06 — ⑧ validate와 **같은 술어**로 disabled를 건다.
                     * 개발제한구역법 §17①의 대상은 「매수대상토지」(토지만)이고 §20①은
                     * 「토지와 그 토지의 정착물」이라 대상 범위가 다르다. 토지 파트가 독립
                     * 계산되지 않는 자산(주택·건물·입주권·분양권·재개발APT)은 안분 없이
                     * 토지분을 뽑을 수 없어 차단 대상이다(자동 안분 fallback 금지).
                     * 종전에는 이 옵션이 무조건 선택 가능해 계산 실행 시점에야 막혔다.
                     */
                    disabled: !isGbClaimRouteAllowedForAssetKind(asset.assetKind),
                    description: isGbClaimRouteAllowedForAssetKind(asset.assetKind)
                      ? "매수대상토지 — 토지분만 감면 대상"
                      : "이 자산 종류는 토지분이 독립 계산되지 않아 선택할 수 없습니다 — 협의매수(§20)를 선택하거나 토지 자산으로 입력하세요",
                  },
                  { value: "negotiated", label: "협의매수 (§20)", description: "토지와 그 토지의 정착물" },
                ]}
              />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">개발제한구역 지정일</label>
              <DateInput
                value={gbDesignated.gbDesignationDate}
                onChange={(v) => updateReduction("gb_designated_land", { gbDesignationDate: v })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                {gbDesignated.gbBranch === "released" ? "사업인정고시일" : "매수청구·협의매수일"}
              </label>
              <DateInput
                value={gbDesignated.gbTriggerDate}
                onChange={(v) => updateReduction("gb_designated_land", { gbTriggerDate: v })}
              />
            </div>
          </div>
          {gbDesignated.gbBranch === "released" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">개발제한구역 해제일</label>
                <DateInput
                  value={gbDesignated.gbReleasedDate}
                  onChange={(v) => updateReduction("gb_designated_land", { gbReleasedDate: v })}
                />
              </div>
              <ToggleCard
                tone="amber"
                size="sm"
                checked={gbDesignated.gbFreeEconZone}
                onCheckedChange={(c) => updateReduction("gb_designated_land", { gbFreeEconZone: c })}
                title="경제자유구역 등 지정"
                description="해제~사업인정고시 허용기간 5년 (미지정 시 1년)"
              />
            </div>
          )}
          <ToggleCard
            tone="violet"
            size="sm"
            checked={gbDesignated.gbResided}
            onCheckedChange={(c) => updateReduction("gb_designated_land", { gbResided: c })}
            title="취득일~매수/고시일 소재지 거주"
            description="§77의3 거주요건 (소재지 거주 세부는 조특령)"
          />
        </div>
      )}

      {/* 대토보상 과세특례 §77의2 서브패널 */}
      {replacementLand && replacementLand.type === "replacement_land_comp" && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-primary">대토보상 과세특례 (조특법 §77의2)</p>
            <p className="text-xs text-muted-foreground mt-1">
              대토(토지)보상 받는 부분의 양도세 40% 세액감면. 2026.12.31까지 양도. 연간 한도 2억원. 과세이연 선택은 별도(추후 지원). 현금 전환·현물출자 시 이자상당가산액 추징(§77의2③).
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">현금 보상액</label>
              <CurrencyInput
                label=""
                value={replacementLand.rlCashComp}
                onChange={(v) => updateReduction("replacement_land_comp", { rlCashComp: v })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">대토(토지) 보상액</label>
              <CurrencyInput
                label=""
                value={replacementLand.rlLandComp}
                onChange={(v) => updateReduction("replacement_land_comp", { rlLandComp: v })}
              />
            </div>
          </div>
        </div>
      )}

      {/* 신축·미분양 서브패널 */}
      {(newHousing || unsoldHousing) && (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-3">
          <p className="text-xs font-medium text-primary">물건 소재지</p>
          {(() => {
            const activeType = newHousing ? "new_housing" : "unsold_housing";
            const activeReduction = newHousing ?? unsoldHousing!;
            return (
              <RadioCardGroup
                name={`reductionRegion-${assetIndex}`}
                tone="amber"
                value={(activeReduction as { reductionRegion: string }).reductionRegion}
                onChange={(v) =>
                  updateReduction(activeType, { reductionRegion: v } as Partial<AssetReductionForm>)
                }
                options={[
                  { value: "metropolitan", label: "수도권 (과밀억제권역)", description: "50% 감면" },
                  { value: "outside_overconcentration", label: "수도권 (과밀억제권역 외)", description: "조문별 상이" },
                  { value: "non_metropolitan", label: "비수도권 (지방)", description: "100% 감면" },
                ]}
              />
            );
          })()}
        </div>
      )}

      {/* Round 8 (2026-05-06): 별도 ReductionExpansion 패널 폐지 — UnifiedReductionPanel로 통합 */}
    </div>
  );
}

// 인별 5년 감면 이력 입력
function PriorReductionUsageInput({
  value,
  onChange,
  transferDate,
}: {
  value: PriorReductionUsageItem[];
  onChange: (v: PriorReductionUsageItem[]) => void;
  /** 폼 양도일 — 합산 대상 과세기간 창 [T-4, T-1]의 기준 (CA-03) */
  transferDate: string;
}) {
  /**
   * 🔴 연도 선택지는 **양도연도**에서 파생해야 한다 (코드리뷰 CA-03).
   *
   * 종전에는 「오늘」 기준 {C-1..C-4}였는데, 엔진 필터 창은
   * `aggregate-reduction-limits.ts`가 **양도연도** 기준 [T-4, T-1]로 잡는다.
   * T ≠ C인 순간부터 두 집합이 어긋난다 — 창의 하단 연도를 고를 수단이 없고,
   * 고를 수 있는 상단 연도를 넣으면 필터에서 **경고 없이 탈락**한다.
   * T ≤ C−4면 교집합이 공집합이라 5년 한도가 아예 발동하지 않는다.
   * 다건 경로는 `AggregateSettingsPanel`이 taxYear를 최근 10년까지 열어 두어 도달 가능하다.
   *
   * 양도일 미입력 시에는 목록을 비운다 — 오늘-fallback은 위 결함의 원인이므로 금지.
   */
  const transferYear = transferDate ? new Date(transferDate).getFullYear() : null;
  const yearOptions = transferYear
    ? [transferYear - 1, transferYear - 2, transferYear - 3, transferYear - 4]
    : [];

  function addRow() {
    if (!transferYear) return;
    onChange([...value, { year: transferYear - 1, type: "self_farming", amount: 0 }]);
  }

  function removeRow(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, patch: Partial<PriorReductionUsageItem>) {
    onChange(value.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  return (
    <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold">인별 5년 감면 이력 (조특법 §133)</p>
        <p className="text-xs text-muted-foreground mt-1">
          최근 5과세연도 감면세액 합계가 한도를 초과하면 당해 감면에서 자동 차감됩니다. 미입력 시 0으로 처리됩니다.
        </p>
      </div>
      {value.map((row, i) => (
        <div key={i} className="flex flex-wrap gap-2 items-center">
          <Select
            value={String(row.year)}
            onValueChange={(v) => v && updateRow(i, { year: parseInt(v) })}
          >
            <SelectTrigger className="w-28">
              <SelectValue>{row.year}년</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={row.type}
            onValueChange={(v) => v && updateRow(i, { type: v as PriorReductionUsageItem["type"] })}
          >
            <SelectTrigger className="w-44">
              <SelectValue>
                {REDUCTION_TYPE_LABELS[row.type] ?? row.type}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {/*
                🔴 종전에는 `REDUCTION_LABELS`(당해연도 감면 5종)를 재사용해
                §77의2·§77의3·축산·어업·§70·§69의4 이력을 **고를 수 없었다**
                (코드리뷰 D8-03·CA-04). 이력의 정본 집합은 §133 한도군이다.
              */}
              {ALL_LIMIT_GROUP_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{REDUCTION_TYPE_LABELS[t] ?? t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="w-36">
            <CurrencyInput
              label=""
              value={String(row.amount)}
              onChange={(v) => updateRow(i, { amount: parseAmount(v) })}
              placeholder="감면세액"
            />
          </div>
          <button
            type="button"
            onClick={() => removeRow(i)}
            className="text-xs text-destructive hover:underline"
          >
            삭제
          </button>
        </div>
      ))}
      {transferYear ? (
        <button
          type="button"
          onClick={addRow}
          className="text-xs text-primary hover:underline"
        >
          + 이력 추가
        </button>
      ) : (
        <p className="text-caption text-muted-foreground">
          양도일을 먼저 입력하세요 — 합산 대상 과세기간({"\u0054"}−4 ~ {"\u0054"}−1)이 양도연도에서 정해집니다.
        </p>
      )}
    </div>
  );
}

// ============================================================
// Step5 메인
// ============================================================
export function Step5({
  form,
  onChange,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
}) {
  function updateAsset(index: number, patch: Partial<AssetForm>) {
    const newAssets = [...form.assets];
    newAssets[index] = { ...newAssets[index], ...patch };
    onChange({ assets: newAssets });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        자산별로 해당 감면을 선택하세요. 조특법 §127⑦ 규정에 따라 유리한 감면이 자동 선택됩니다.
      </p>

      {/* 감면 조문 인벤토리 안내 — 개수는 ALL_REDUCTION_IDS(24)와 일치시킬 것 (D9-08) */}
      <div className="rounded-md border border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30 px-4 py-3 text-xs text-sky-900 dark:text-sky-200 space-y-1">
        <p className="font-semibold">📋 적용 가능한 감면·과세특례 조문</p>
        <p>
          자경농지 §69 · 공익수용 §77 시리즈 (4개), 장기임대 §97 시리즈 (6개), 신축 §99 시리즈 (4개),
          미분양 §98 시리즈 + §99의2 (10개) — <strong>총 24개 조문</strong>을 지원합니다.
        </p>
        <p className="text-sky-700 dark:text-sky-400">
          조문별 시한·요건이 충족되지 않으면 해당 항목은 사유와 함께 선택이 제한됩니다.
        </p>
      </div>

      {/* 자산별 감면 선택 */}
      <SectionHeader title="자산별 감면·공제" description="조특법 §127⑦ — 유리한 감면이 자동 선택됩니다" />
      {form.assets.map((asset, i) => (
        <AssetReductionBlock
          key={asset.assetId || i}
          asset={asset}
          assetIndex={i}
          transferDate={form.transferDate ?? ""}
          onChange={(patch) => updateAsset(i, patch)}
        />
      ))}

      {/* 인별 5년 감면 이력 */}
      <PriorReductionUsageInput
        value={form.priorReductionUsage ?? []}
        onChange={(v) => onChange({ priorReductionUsage: v })}
        transferDate={form.transferDate ?? ""}
      />

      {/* 연간 기사용 기본공제 */}
      <SectionHeader title="기본공제" description="연간 한도 250만원, 동일 연도 다른 양도에서 이미 사용한 금액을 입력하세요" />
      <FieldCard label="기사용 기본공제" unit="원" hint="동일 연도 다른 양도에서 이미 사용한 기본공제 금액 (연간 한도 2,500,000)">
        <CurrencyInput
          label=""
          hideUnit
          value={form.annualBasicDeductionUsed}
          onChange={(v) => onChange({ annualBasicDeductionUsed: v })}
        />
      </FieldCard>
    </div>
  );
}
