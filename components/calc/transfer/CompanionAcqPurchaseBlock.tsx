"use client";

/**
 * 동반자산 매매 취득(purchase) 입력 블록
 *
 * 매매 산정방식 두 가지:
 *   - actual:    실거래가 (fixedAcquisitionPrice 직접 입력)
 *   - estimated: 환산취득가 (양도가 × 취득시기준시가/양도시기준시가, 라우트가 안분 후 환산)
 *
 * 취득일 규칙:
 *   - 1985.1.1. 미만 입력 시 1985.1.1.로 강제 클램핑 (소득세법 적용 하한)
 *   - 1990.8.30. 이전이면 공시지가 연도 자동 1990년, Pre1990 섹션 자동 활성화
 */

import { useState, useEffect } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { SelfBuiltSection } from "./SelfBuiltSection";
import { LandBuildingSplitSection } from "./LandBuildingSplitSection";
import type { AcqPriceMode } from "./LandBuildingSplitSection";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { PreHousingDisclosureSection } from "./PreHousingDisclosureSection";
import { SalesCaseSection } from "./SalesCaseSection";
import { type BlockProps, toPropertyKind } from "./CompanionAcqPurchaseBlock.types";

const MIN_ACQ_DATE = "1985-01-01";

// ─── 메인 블록 ────────────────────────────────────────────────────

export function CompanionAcqPurchaseBlock(props: BlockProps) {
  const [dateClampMsg, setDateClampMsg] = useState(false);
  const [landDateClampMsg, setLandDateClampMsg] = useState(false);

  // 내부 fallback state (외부 props 없을 때 사용)
  const [internalPricePerSqmAtAcq, setInternalPricePerSqmAtAcq] = useState("");
  const [internalPricePerSqmAtTransfer, setInternalPricePerSqmAtTransfer] = useState("");

  /**
   * "쌍방+일방 (증축 있음)" 4번째 라디오 파생 상태.
   * 원건물 실가(useEstimatedAcquisition=false) + isAppraisalAcquisition≠true
   * + gbHasExtension=true + gbExtensionAcquisitionMode="estimated"
   * + assetKind="general_building" 일 때 활성화.
   */
  const isMixedExtension =
    props.assetKind === "general_building" &&
    props.useEstimatedAcquisition === false &&  // ★ 원건물 실가
    props.isAppraisalAcquisition !== true &&
    props.gbHasExtension === true &&
    props.gbExtensionAcquisitionMode === "estimated";

  const acqPricePerSqm = props.standardPricePerSqmAtAcq ?? internalPricePerSqmAtAcq;
  const onAcqPricePerSqmChange = props.onStandardPricePerSqmAtAcqChange ?? setInternalPricePerSqmAtAcq;
  const transferPricePerSqm = props.standardPricePerSqmAtTransfer ?? internalPricePerSqmAtTransfer;
  const onTransferPricePerSqmChange = props.onStandardPricePerSqmAtTransferChange ?? setInternalPricePerSqmAtTransfer;

  const isLand = props.assetKind === "land";
  // acqDatePre1990에서 파생된 derived value — useEffect + setState 불필요
  const acqDatePre1990 = !!(props.acquisitionDate && props.acquisitionDate < "1990-08-30");
  const pre1990ForceYear = acqDatePre1990 ? "1990" : undefined;
  const showPre1990 =
    isLand &&
    !!props.pre1990Form &&
    !!props.onPre1990Change &&
    acqDatePre1990;

  const propertyKind = toPropertyKind(props.assetKind);

  // 취득일 1985.1.1. 미만 클램핑 — 입력 완료(포커스 이탈) 시에만 적용
  function handleAcquisitionDateChange(v: string) {
    props.onAcquisitionDateChange(v);
    setDateClampMsg(false);
  }

  function handleAcquisitionDateBlur() {
    const v = props.acquisitionDate;
    if (v && v < MIN_ACQ_DATE) {
      props.onAcquisitionDateChange(MIN_ACQ_DATE);
      setDateClampMsg(true);
    }
  }

  // 환산취득가 + 1990.8.30. 이전 취득 토지 → pre1990Enabled 자동 체크
  // [의도적 예외] "useEffect → store 미러링 금지" 정책의 예외로 유지 — MixedUsePreHousingDisclosureSection
  // effect ①과 동일한 "수렴하는 boolean 래치"(가드 !pre1990Enabled로 재발동 차단, 무한 루프 없음).
  // 깔끔한 제거는 hasPre1990 의미를 API 7곳·validate 3곳에서 재파생해야 해 tax-correctness 회귀 위험이
  // 커 보류한다. 상세 근거: MixedUsePreHousingDisclosureSection.tsx 주석.
  useEffect(() => {
    if (
      props.useEstimatedAcquisition &&
      isLand &&
      acqDatePre1990 &&
      props.onPre1990Change &&
      !props.pre1990Form?.pre1990Enabled
    ) {
      props.onPre1990Change({ pre1990Enabled: true });
    }
  }, [props.useEstimatedAcquisition, isLand, acqDatePre1990]);

  // 건물 취득일 < 2005.4.29. (개별주택공시가격 최초 고시 이전) → usePreHousingDisclosure 자동 체크
  // §164⑤ 3-시점 환산이 필요한 시점이므로 디폴트 ON.
  const acqDatePrePHD = !!(props.acquisitionDate && props.acquisitionDate < "2005-04-29");
  useEffect(() => {
    if (
      acqDatePrePHD &&
      props.asset &&
      props.onAssetChange &&
      !props.asset.usePreHousingDisclosure &&
      (props.asset.assetKind === "housing" || isMixedUse)
    ) {
      props.onAssetChange({ usePreHousingDisclosure: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acqDatePrePHD]);

  // 취득시 기준시가 조회 단가 → pre1990PricePerSqm_1990 자동 입력
  function handleAcqPricePerSqmChange(v: string) {
    onAcqPricePerSqmChange(v);
    if (showPre1990) {
      props.onPre1990Change?.({ pre1990PricePerSqm_1990: v.replace(/,/g, "") });
    }
  }

  const isSplitable =
    props.assetKind === "housing" || props.assetKind === "building";
  const isSplit = isSplitable && !!props.hasSeperateLandAcquisitionDate;
  // 취득가액 산정 방식 — boolean 3개를 단일 유니온으로 파생(무효 조합 차단).
  // ⚠️ 우선순위는 API 변환(transfer-tax-api.ts:82-84)과 **동일**하게 유지한다:
  //    isSalesCase > isAppraisal > isEstimated. 어긋나면 UI 게이팅과 엔진 분기가 갈린다.
  const acqPriceMode: AcqPriceMode = props.isSalesCaseAcquisition
    ? "salesCase"
    : props.isAppraisalAcquisition
      ? "appraisal"
      : props.useEstimatedAcquisition
        ? "estimated"
        : "actual";
  const acqDateLabel = isSplit ? "건물 취득일 (사용승인일·매매 등기접수일)" : "취득일";

  // 겸용주택 모드: 기준시가 입력은 MixedUseStandardPriceInputs에서 받으므로
  // 일반 자산용 환산 입력(취득시/양도시 기준시가, PHD 토글)을 숨긴다.
  const isMixedUse = !!props.asset?.isMixedUseHouse;

  // 상업용건물·오피스텔 모드: 환산은 CommercialBuildingBlock(시행령 §164⑧)에서 처리하므로
  // 일반 자산용 환산 입력(취득시/양도시 기준시가)을 숨긴다.
  const isCommercialBuilding = props.assetKind === "commercial_building";
  const isGeneralBuilding = props.assetKind === "general_building";

  // 8-B-4: 의제취득 (1985.1.1) 판정 — 1985.1.1 정확히 일치 또는 그 이전 입력
  const isDeemedAcquisitionDate = !!(
    props.acquisitionDate && props.acquisitionDate <= "1985-01-01"
  );
  const isLandDeemedAcquisitionDate = !!(
    props.landAcquisitionDate && props.landAcquisitionDate <= "1985-01-01"
  );

  function handleLandAcquisitionDateChange(v: string) {
    props.onLandAcquisitionDateChange?.(v);
    setLandDateClampMsg(false);
  }

  function handleLandAcquisitionDateBlur() {
    const v = props.landAcquisitionDate;
    if (v && v < MIN_ACQ_DATE) {
      props.onLandAcquisitionDateChange?.(MIN_ACQ_DATE);
      setLandDateClampMsg(true);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">{acqDateLabel}</span>
          {isDeemedAcquisitionDate && (
            <span className="inline-flex items-center rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-micro font-semibold text-amber-900">
              의제취득(§98)
            </span>
          )}
          {isSplitable && props.onHasSeperateLandAcquisitionDateChange && (
            <ToggleCard
              variant="chip"
              tone="amber"
              title="토지·건물 취득일 다름"
              description={
                isMixedUse
                  ? undefined
                  : isDeemedAcquisitionDate
                    ? "의제취득은 동일일 권장"
                    : "원시취득·신축 등"
              }
              checked={!!props.hasSeperateLandAcquisitionDate}
              onCheckedChange={(v) =>
                props.onHasSeperateLandAcquisitionDateChange!(v)
              }
            />
          )}
        </div>
        <DateInput
          value={props.acquisitionDate}
          onChange={handleAcquisitionDateChange}
          onBlur={handleAcquisitionDateBlur}
        />
        {/* 안내 hint 제거(2026-07-16) — onBlur 자동 클램프 + dateClampMsg + 「의제취득(§98)」 배지가
            이미 §98을 알려주므로 상시 노출 문구는 중복이었다. */}
        {dateClampMsg && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            1985.1.1. 의제 취득일로 취득일 변경했습니다.
          </p>
        )}
        {/* 8-B-5: 의제취득 + 분리 토글 ON 시 안내 (토지·건물 동일일 권장) */}
        {isDeemedAcquisitionDate && props.hasSeperateLandAcquisitionDate && !isMixedUse && (
          <p className="text-caption text-amber-700 leading-relaxed">
            ⚠ 의제취득(1985.1.1)은 토지·건물이 동일 취득일로 의제됩니다. 분리 토글 비활성화 권장.
          </p>
        )}
      </div>

      {/* 매매계약일 입력은 Step4 감면·공제(UnifiedReductionPanel)의 펼침 영역 상단으로 이동 (Round 9 정정 2026-05-06)
          이유: 입력 일관성 + 감면 사용 안 할 때 불필요한 입력 방지 */}

      {/* 토지/건물 소유자 분리 (housing·building 전용) */}
      {isSplitable && props.onSelfOwnsChange && (
        <div className="space-y-1.5">
          <ToggleCard
            variant="chip"
            tone="amber"
            title="토지·건물 소유자 다름"
            description="배우자·공유자 등"
            checked={(props.selfOwns ?? "both") !== "both"}
            onCheckedChange={(checked) => {
              if (checked) {
                props.onSelfOwnsChange!("building_only");
                props.onHasSeperateLandAcquisitionDateChange?.(true);
              } else {
                props.onSelfOwnsChange!("both");
              }
            }}
          />
          {(props.selfOwns ?? "both") !== "both" && (
            <div className="ml-5 flex gap-2 flex-wrap">
              {(["building_only", "land_only"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => props.onSelfOwnsChange!(v)}
                  className={cn(
                    "rounded-md border-2 px-3 py-1 text-sm transition-all",
                    props.selfOwns === v
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-muted-foreground/50",
                  )}
                >
                  {v === "building_only" ? "건물만 본인 소유 (토지는 타인)" : "토지만 본인 소유 (건물은 타인)"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 토지/건물 취득일 분리 상세 (housing·building 전용) */}

      {/* 부담부증여 모드 — 취득가액 산정 방식·실거래가 입력 숨김 (§159 자동 산정).
          폼 상태(useEstimatedAcquisition·fixedAcquisitionPrice 등)는 보존하여
          양도 형태를 "일반 양도"로 되돌리면 입력값 복원 가능. */}
      {props.asset?.transferType === "burdened_gift" && (
        <div className="rounded-lg border border-fuchsia-300 bg-fuchsia-50/60 p-3 space-y-1.5">
          <p className="text-sm font-semibold text-fuchsia-900">
            취득가액 — 부담부증여 §159 자동 산정
          </p>
          <p className="text-xs text-fuchsia-800">
            부담부증여(소득세법 시행령 §159)는 취득가액을 <b>증여재산 평가방식</b>에 따라 엔진이 자동 산정합니다
            — 기준시가 평가 시 취득기준시가 × 채무비율, 시가 평가 시 실지취득가액 또는 환산취득가액(위
            &lsquo;부담부증여&rsquo; 카드의 <b>취득가액 산정방식</b>에서 선택). 따라서 일반 취득가액 산정 방식·실거래가
            입력은 여기서 표시하지 않습니다.
          </p>
          <p className="text-caption text-fuchsia-700">
            ※ 산식에 필요한 <b>취득시 기준시가</b>는 위 &lsquo;양도 정보 — 인수 채무&rsquo; 카드 및 토지 면적·공시지가
            입력에서 자동 도출됩니다. 보유기간·기산점 산정에 필요한 <b>취득일·취득원인</b>은 위 라디오에서 그대로 입력하세요.
          </p>
        </div>
      )}
      {/* 재개발/재건축 APT 모드 — 상단의 일반 "취득가액 산정 방식"·"취득가액" 입력 영역 숨김.
          §166②1호 인가후 분의 분양가(= 권리가액 ± 청산금)는 결정론적으로 도출되므로
          사용자 직접 입력이 불필요. 인가전 분의 환산취득가/감정가액은 아래 §166 섹션 내부에서 처리. */}
      {props.asset?.assetKind === "redevelopment_apt" && (
        <div className="rounded-lg border border-violet-300 bg-violet-50/60 p-3 space-y-1.5">
          <p className="text-sm font-semibold text-violet-900">
            취득가액 — 재개발 §166②1호 자동 산정
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <LawArticleModal legalBasis="소득세법 시행령 §166 ② 1호" label="시행령 §166②1호" />
            <LawArticleModal legalBasis="소득세법 시행령 §166 ③" label="시행령 §166③" />
          </div>
          <p className="text-xs text-violet-800">
            재개발/재건축 양도에서 인가후 분의 분양가(= 권리가액 + 청산금 납부액 또는 권리가액 − 청산금 수령액)는
            아래 <b>§166②1호 재개발 일정·금액</b> 섹션의 입력값에서 엔진이 자동 산정합니다.
            따라서 상단 일반 &ldquo;취득가액 산정 방식·취득가액&rdquo; 입력은 표시하지 않습니다.
          </p>
          <p className="text-caption text-violet-700">
            ※ 인가전 분의 <b>환산취득가</b>(시행령 §166③ + §164⑦ 본문)는 아래 §166 섹션 내 환산취득가 토글에서 입력합니다.
          </p>
        </div>
      )}
      {props.asset?.transferType !== "burdened_gift" && props.asset?.assetKind !== "redevelopment_apt" && (
      <>
      <div className="space-y-2">
        <label className="block text-sm font-medium">취득가액 산정 방식</label>
        <div className={cn(
          "grid gap-2",
          props.assetKind === "general_building" ? "grid-cols-2" : "grid-cols-4",
        )}>
          <button
            type="button"
            onClick={() => {
              props.onUseEstimatedChange(false);
              props.onIsAppraisalAcquisitionChange?.(false);
              props.onIsSalesCaseAcquisitionChange?.(false);
              // 일반건물: 다른 옵션 선택 시 gbHasExtension reset (정합성 유지)
              if (props.assetKind === "general_building") {
                props.onGbHasExtensionChange?.(false);
              }
            }}
            className={cn(
              "rounded-md border-2 p-2 text-left transition-all",
              !props.useEstimatedAcquisition && !props.isAppraisalAcquisition && !props.isSalesCaseAcquisition && !isMixedExtension
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
              isMixedExtension && "opacity-60",
            )}
          >
            <div className="text-sm font-semibold">실거래가</div>
            <div className="text-caption text-muted-foreground leading-tight">
              계약서상 실거래가
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              props.onUseEstimatedChange(true);
              props.onIsAppraisalAcquisitionChange?.(false);
              props.onIsSalesCaseAcquisitionChange?.(false);
              // 일반건물: 다른 옵션 선택 시 gbHasExtension reset (정합성 유지)
              if (props.assetKind === "general_building") {
                props.onGbHasExtensionChange?.(false);
              }
            }}
            className={cn(
              "rounded-md border-2 p-2 text-left transition-all",
              props.useEstimatedAcquisition && !isMixedExtension
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
              isMixedExtension && "opacity-60",
            )}
          >
            <div className="text-sm font-semibold">환산취득가</div>
            <div className="text-caption text-muted-foreground leading-tight">
              양도가 × 기준시가 비율
            </div>
          </button>
          {/* 감정가액 — 일반건물에서는 미표시 (§176의2②는 환산취득가만 규정) */}
          {props.assetKind !== "general_building" && (
            <button
              type="button"
              onClick={() => {
                props.onUseEstimatedChange(false);
                props.onIsAppraisalAcquisitionChange?.(true);
                props.onIsSalesCaseAcquisitionChange?.(false);
              }}
              className={cn(
                "rounded-md border-2 p-2 text-left transition-all",
                props.isAppraisalAcquisition
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
              )}
            >
              <div className="text-sm font-semibold">감정가액</div>
              <div className="text-caption text-muted-foreground leading-tight">
                개산공제 자동 적용
              </div>
            </button>
          )}
          {/* 매매사례가액(추계) — §176의2③1호. 일반건물에서는 미표시 */}
          {props.assetKind !== "general_building" && props.onIsSalesCaseAcquisitionChange && (
            <button
              type="button"
              onClick={() => {
                props.onUseEstimatedChange(false);
                props.onIsAppraisalAcquisitionChange?.(false);
                props.onIsSalesCaseAcquisitionChange!(true);
              }}
              className={cn(
                "rounded-md border-2 p-2 text-left transition-all",
                props.isSalesCaseAcquisition
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
              )}
            >
              <div className="text-sm font-semibold">매매사례가액</div>
              <div className="text-caption text-muted-foreground leading-tight">
                §176의2③1호 추계
              </div>
            </button>
          )}
          {/* 일반건물 전용: 4번째 옵션 "쌍방+일방 (증축 있음)" */}
          {props.assetKind === "general_building" && (
            <button
              type="button"
              onClick={() => {
                props.onUseEstimatedChange(false);                        // ★ 원건물 실가
                props.onIsAppraisalAcquisitionChange?.(false);
                props.onGbHasExtensionChange?.(true);
                props.onGbExtensionAcquisitionModeChange?.("estimated");  // 증축 환산
              }}
              aria-pressed={isMixedExtension}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-all",
                isMixedExtension
                  ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300 shadow-sm"
                  : "border-amber-200 bg-amber-50/40 hover:border-amber-300",
              )}
            >
              <div className="text-sm font-semibold text-amber-900">토지·건물 일괄 (증축분 별도)</div>
              <div className="text-caption text-amber-700 leading-tight">
                토지·원건물 실거래가 + 증축분 환산취득가
              </div>
            </button>
          )}
        </div>
      </div>

      {/* 개별주택가격 미공시 취득 토글 — 환산취득가 + housing 자산(또는 토지·건물 분리 모드)
         자동 트리거 조건(housing || isMixedUse)과 일치시켜 모순 방지.
         겸용주택 모드에서는 MixedUseStandardPriceInputs 내부의 PHD 토글을 사용하므로 여기서는 숨긴다. */}
      {!isMixedUse && (props.assetKind === "housing" || isSplit) && props.useEstimatedAcquisition && props.asset && props.onAssetChange && (
        <ToggleCard
          tone="amber"
          size="sm"
          title="취득 당시 개별주택가격 미공시 (§164⑤ 3-시점 계산)"
          checked={!!props.asset.usePreHousingDisclosure}
          onCheckedChange={(v) =>
            props.onAssetChange!({ usePreHousingDisclosure: v })
          }
        >
          <PreHousingDisclosureSection
            asset={props.asset}
            transferDate={props.transferDate ?? ""}
            onChange={props.onAssetChange}
          />
        </ToggleCard>
      )}

      {!props.useEstimatedAcquisition ? (
        <>
          {/* 매매사례가액 추계(§176의2③1호) 모드 */}
          {props.isSalesCaseAcquisition ? (
            <SalesCaseSection
              similarSalesValue={props.similarSalesValue ?? ""}
              onSimilarSalesValueChange={props.onSimilarSalesValueChange ?? (() => {})}
              similarSalesSource={props.similarSalesSource}
              onSimilarSalesSourceChange={props.onSimilarSalesSourceChange}
              acquisitionSigunguCode={props.acquisitionSigunguCode}
              acquisitionAddress={props.asset?.addressJibun || props.asset?.addressRoad}
              acquisitionArea={props.acquisitionArea}
              acquisitionDate={props.acquisitionDate}
              buildingName={props.asset?.buildingName}
              standardPriceAtAcq={props.standardPriceAtAcq}
              onStandardPriceAtAcqChange={props.onStandardPriceAtAcqChange}
            />
          ) : (
            <>
              <CurrencyInput
                label={
                  isMixedExtension
                    ? "토지·건물 일괄 취득가액 (원)"
                    : props.isAppraisalAcquisition
                      ? "감정가액 (원)"
                      : "취득가액 (원)"
                }
                value={props.fixedAcquisitionPrice}
                onChange={props.onFixedAcquisitionPriceChange}
                required
                hint={
                  isMixedExtension
                    ? "엔진이 양도시 기준시가 비율로 토지·건물1에 자동 안분합니다. 일괄 금액 그대로 입력하세요."
                    : props.isAppraisalAcquisition
                      ? "공인감정기관의 감정가액. 소득세법 시행령 §163⑥에 따라 필요경비 개산공제(취득시 기준시가 × 3%)가 자동 적용됩니다."
                      : undefined
                }
              />
              {/* 사례 33 일괄 모드: 토지+건물1 일괄 취득 시 필요경비 (중개수수료·취득세·인지대 등 §97① 가목)
                  엔진은 취득시 기준시가 비율로 토지·건물1에 자동 안분. */}
              {isMixedExtension && props.asset && props.onAssetChange && (
                <CurrencyInput
                  label="토지·건물 일괄 취득 시 필요경비 (원)"
                  value={props.asset.gbBundledAcquisitionExpenses ?? ""}
                  onChange={(v) => props.onAssetChange!({ gbBundledAcquisitionExpenses: v })}
                  hint="일괄 취득 당시 발생한 중개수수료·취득세·인지대 등 부대비용. 엔진이 취득시 기준시가 비율로 토지·건물1에 자동 안분합니다. 없으면 비워두세요."
                />
              )}
              {props.isAppraisalAcquisition && (
                <CurrencyInput
                  label="취득시 기준시가 (원) — 개산공제 base"
                  value={props.standardPriceAtAcq}
                  onChange={props.onStandardPriceAtAcqChange}
                  hint="필요경비 개산공제 = 이 금액의 3%. 미입력 시 0% 적용."
                />
              )}
            </>
          )}
        </>
      ) : isMixedUse ? (
        // 겸용주택 모드: 양도시·취득시 기준시가는 위 "겸용주택 분리계산" 영역에서 입력.
        <p className="text-xs text-muted-foreground italic">
          취득시/양도시 기준시가는 위 겸용주택 분리계산 영역에서 입력합니다 (개별주택가격·상가건물·공시지가).
        </p>
      ) : isCommercialBuilding ? (
        // 상업용건물·오피스텔: 환산은 시행령 §164⑧·§176조의2②2호에 따라
        // 호별 ㎡당 고시가 + 건물 ㎡당 기준시가 + 개별공시지가로 산정 (CommercialBuildingBlock).
        <p className="text-xs text-muted-foreground italic">
          취득시/양도시 기준시가는 아래 상업용건물·오피스텔 환산 영역에서 입력합니다 (호별 고시가·건물 기준시가·개별공시지가).
        </p>
      ) : isGeneralBuilding ? (
        // 일반건물(토지+건물 일괄): 환산은 시행령 §176의2②·§163⑥에 따라
        // 토지(㎡당 공시지가 × 토지면적) + 건물(기준시가 총액)로 자산별 분리 산정 (GeneralBuildingBlock).
        <p className="text-xs text-muted-foreground italic">
          취득시/양도시 기준시가는 아래 일반건물 환산 영역에서 입력합니다 (토지·건물 분리 — 토지 ㎡당 공시지가·건물 기준시가 총액).
        </p>
      ) : props.asset?.usePreHousingDisclosure ? (
        // §164⑤ PHD 모드: 위쪽 PreHousingDisclosureSection의 3-시점 입력으로 자동 도출.
        // 기존 "취득시/양도시 기준시가" 입력은 중복되므로 표시하지 않음.
        <p className="text-xs text-muted-foreground italic">
          취득시/양도시 기준시가는 위 §164⑤ 3-시점 입력으로부터 자동 도출됩니다.
        </p>
      ) : (
        <>
          {/* 취득시 기준시가 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              취득시 기준시가 (원) <span className="text-destructive">*</span>
            </label>
            {isLand && acqDatePre1990 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                1990년 이전 취득은 개별공시지가가 없어 아래 토지등급 환산 기능으로 자동 산정됩니다.
              </p>
            )}
            <StandardPriceInput
              propertyKind={propertyKind}
              totalPrice={props.standardPriceAtAcq}
              onTotalPriceChange={props.onStandardPriceAtAcqChange}
              pricePerSqm={acqPricePerSqm}
              onPricePerSqmChange={handleAcqPricePerSqmChange}
              area={props.acquisitionArea}
              onAreaChange={props.onAcquisitionAreaChange}
              areaLabel={props.acqAreaLabel}
              jibun={props.jibun}
              dong={props.dong}
              ho={props.ho}
              referenceDate={props.acquisitionDate}
              hint="환산 분자 — 안분 후 양도가액에 (취득시/양도시) 비율 적용"
              forceYear={pre1990ForceYear}
              enableLookup={!(isLand && acqDatePre1990)}
              pricePerSqmDisabled={isLand && acqDatePre1990}
            />
          </div>

          {/* 1990.8.30. 이전 취득 토지 환산 */}
          {showPre1990 && (
            <Pre1990LandValuationInput
              form={props.pre1990Form!}
              onChange={props.onPre1990Change!}
              acquisitionArea={props.acquisitionArea}
              jibun={props.jibun}
              acquisitionDate={props.acquisitionDate}
              transferDate={props.transferDate}
              onCalculatedPrice={(price) => props.onStandardPriceAtAcqChange(String(price))}
            />
          )}

          {/* 양도시 기준시가 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              양도시 기준시가 (원) <span className="text-destructive">*</span>
            </label>
            <StandardPriceInput
              propertyKind={propertyKind}
              totalPrice={props.standardPriceAtTransfer}
              onTotalPriceChange={props.onStandardPriceAtTransferChange}
              pricePerSqm={transferPricePerSqm}
              onPricePerSqmChange={onTransferPricePerSqmChange}
              area={props.transferArea}
              onAreaChange={props.onTransferAreaChange}
              areaLabel={props.transferAreaLabel}
              jibun={props.jibun}
              dong={props.dong}
              ho={props.ho}
              referenceDate={props.transferDate}
              hint="환산 분모 — 취득시/양도시 기준시가 비율의 분모"
            />
          </div>
        </>
      )}
      </>
      )}

      {/* 취득·양도가액 분리 방식 — 「취득가액 산정 방식」 **뒤**에 둔다(2026-07-16).
          산정 방식(실거래가/환산/감정/매매사례)이 이 블록의 취득가액 칸 노출을 결정하므로
          UI 순서 = 엔진 계산 로직 순서(CLAUDE.md: 모드 토글은 영향 필드 직전).
          종전에는 이 블록이 위에 있어, 아직 정하지 않은 모드에 따라 위쪽 화면이 달라지는 역순이었다.
          ⚠️ 산정방식 게이트(transferType !== burdened_gift && assetKind !== redevelopment_apt) **밖**에
             둔다 — 안에 넣으면 부담부증여·재개발에서 분리 방식이 통째로 사라진다(기능 제거). */}
      {isSplitable && props.onHasSeperateLandAcquisitionDateChange && (
        <div className="space-y-2">

          {isSplit && (
            <div className="space-y-2 pl-1">
              <FieldCard
                label="토지 취득일"
                trailing={
                  isLandDeemedAcquisitionDate ? (
                    <span className="inline-flex items-center rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-micro font-semibold text-amber-900">
                      의제취득(§98)
                    </span>
                  ) : undefined
                }
              >
                <DateInput
                  value={props.landAcquisitionDate ?? ""}
                  onChange={handleLandAcquisitionDateChange}
                  onBlur={handleLandAcquisitionDateBlur}
                />
                {landDateClampMsg && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    1985.1.1. 의제 취득일로 취득일 변경했습니다.
                  </p>
                )}
              </FieldCard>

              <FieldCard label="취득·양도가액 분리 방식">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => props.onLandSplitModeChange?.("apportioned")}
                    className={cn(
                      "flex-1 rounded-md border-2 px-3 py-1.5 text-sm transition-all",
                      (props.landSplitMode ?? "apportioned") === "apportioned"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-muted-foreground/50",
                    )}
                  >
                    기준시가 비율 안분
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onLandSplitModeChange?.("actual")}
                    className={cn(
                      "flex-1 rounded-md border-2 px-3 py-1.5 text-sm transition-all",
                      props.landSplitMode === "actual"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-muted-foreground/50",
                    )}
                  >
                    직접 입력
                  </button>
                </div>
              </FieldCard>


              {props.landSplitMode === "actual" && (
                <LandBuildingSplitSection
                  acqPriceMode={acqPriceMode}
                  isBurdenedGift={props.asset?.transferType === "burdened_gift"}
                  landTransferPrice={props.landTransferPrice ?? ""}
                  onLandTransferPriceChange={props.onLandTransferPriceChange ?? (() => {})}
                  buildingTransferPrice={props.buildingTransferPrice ?? ""}
                  onBuildingTransferPriceChange={props.onBuildingTransferPriceChange ?? (() => {})}
                  landAcquisitionPrice={props.landAcquisitionPrice ?? ""}
                  onLandAcquisitionPriceChange={props.onLandAcquisitionPriceChange ?? (() => {})}
                  buildingAcquisitionPrice={props.buildingAcquisitionPrice ?? ""}
                  onBuildingAcquisitionPriceChange={props.onBuildingAcquisitionPriceChange ?? (() => {})}
                  landStandardPriceAtTransfer={props.landStandardPriceAtTransfer ?? ""}
                  onLandStandardPriceAtTransferChange={props.onLandStandardPriceAtTransferChange ?? (() => {})}
                  buildingStandardPriceAtTransfer={props.buildingStandardPriceAtTransfer ?? ""}
                  onBuildingStandardPriceAtTransferChange={props.onBuildingStandardPriceAtTransferChange ?? (() => {})}
                  landDirectExpenses={props.landDirectExpenses ?? ""}
                  onLandDirectExpensesChange={props.onLandDirectExpensesChange ?? (() => {})}
                  buildingDirectExpenses={props.buildingDirectExpenses ?? ""}
                  onBuildingDirectExpensesChange={props.onBuildingDirectExpensesChange ?? (() => {})}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* 신축·증축 특례 (자산 카드 마지막 부분, 매매 + housing/building 자산만) */}
      {(props.assetKind === "housing" || props.assetKind === "building") &&
        props.onIsSelfBuiltChange &&
        props.onBuildingTypeChange &&
        props.onConstructionDateChange &&
        props.onExtensionFloorAreaChange && (
          <SelfBuiltSection
            isSelfBuilt={props.isSelfBuilt ?? false}
            onIsSelfBuiltChange={props.onIsSelfBuiltChange}
            buildingType={props.buildingType ?? ""}
            onBuildingTypeChange={props.onBuildingTypeChange}
            constructionDate={props.constructionDate ?? ""}
            onConstructionDateChange={props.onConstructionDateChange}
            extensionFloorArea={props.extensionFloorArea ?? ""}
            onExtensionFloorAreaChange={props.onExtensionFloorAreaChange}
            extensionStdPriceAtAcquisition={props.extensionStdPriceAtAcquisition ?? ""}
            onExtensionStdPriceAtAcquisitionChange={props.onExtensionStdPriceAtAcquisitionChange ?? (() => {})}
          />
        )}
    </div>
  );
}
