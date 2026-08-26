"use client";

/**
 * RedevelopmentValuationSection — 재개발 환산취득가 입력 (§166③ + §164⑦ PHD 패턴)
 *
 * 분리 사유: RedevelopmentBlock 800줄 정책 (사례 46 추가 대비, 2026-05-14).
 * 부모 파일에서 직접 인라인 렌더되던 ⑥ rose 카드(env 환산 기준시가) 영역.
 *
 * 정책 준수:
 *  - useEffect → store 미러링 금지 → useMemo 순수 계산
 *  - placeholder 숫자 예시 금지 → hint prop 한국어 설명
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { stdPriceAddressOf } from "@/components/calc/transfer/asset-std-price-address";
import { prefillAcqLandPrice } from "@/lib/calc/phd-acq-land-price-track";
import { isRedevPhdTriggered } from "@/lib/calc/redev-phd-trigger";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { useMemo } from "react";
import { Frac, FormulaText } from "@/components/calc/results/shared/FormulaParts";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function RedevelopmentValuationSection({ asset, onChange }: Props) {
  // 환산취득가 미리보기 (useMemo) — PHD 패턴, 엔진 redevelopment-valuation.ts 와 동일 산식.
  const valuationPreview = useMemo(() => {
    if (!asset.useEstimatedAcquisition) return null;
    const rights = parseAmount(asset.redevRightsValue);
    const D = parseAmount(asset.redevManagementDisposalHousingPrice);
    if (rights <= 0 || D <= 0) return null;

    // 이 지점은 위 `useEstimatedAcquisition` 조기 반환 뒤라 환산 모드가 보장된다.
    const provisionTriggered = isRedevPhdTriggered(asset);

    const A = parseAmount(asset.redevFirstDisclosureHousingPrice);
    const area = parseDecimal(asset.redevLandArea);
    const landAcq = parseAmount(asset.redevLandPricePerSqmAtAcq);
    const bldAcq = parseAmount(asset.redevBuildingStdPriceAtAcq);
    const landFirst = parseAmount(asset.redevLandPricePerSqmAtFirst);
    const bldFirst = parseAmount(asset.redevBuildingStdPriceAtFirst);

    const canApplyMain =
      provisionTriggered && A > 0 && area > 0 && landAcq > 0 && landFirst > 0;

    let P_A: number;
    let sumAtAcq = 0;
    let sumAtFirst = 0;
    let step1Formula: string | null = null;

    if (canApplyMain) {
      sumAtAcq = Math.floor(landAcq * area) + bldAcq;
      sumAtFirst = Math.floor(landFirst * area) + bldFirst;
      if (sumAtFirst > 0) {
        P_A = Number((BigInt(A) * BigInt(sumAtAcq)) / BigInt(sumAtFirst));
        step1Formula = `floor(${A.toLocaleString()} × ${sumAtAcq.toLocaleString()} / ${sumAtFirst.toLocaleString()})`;
      } else {
        P_A = 0;
      }
    } else {
      P_A = parseAmount(asset.redevAcquisitionHousingPrice);
    }

    if (P_A <= 0) return null;

    const converted = Number((BigInt(rights) * BigInt(P_A)) / BigInt(D));
    const missingFields = provisionTriggered && !canApplyMain;

    return {
      converted,
      provisionTriggered,
      canApplyMain,
      missingFields,
      A, area, landAcq, bldAcq, landFirst, bldFirst,
      sumAtAcq, sumAtFirst,
      P_A, D, rights,
      step1Formula,
      step2Formula: `floor(${rights.toLocaleString()} × ${P_A.toLocaleString()} / ${D.toLocaleString()})`,
    };
  }, [
    asset.useEstimatedAcquisition,
    asset.redevRightsValue,
    asset.redevManagementDisposalHousingPrice,
    asset.redevAcquisitionHousingPrice,
    asset.redevFirstDisclosureHousingPrice,
    asset.redevLandArea,
    asset.redevLandPricePerSqmAtAcq,
    asset.redevBuildingStdPriceAtAcq,
    asset.redevLandPricePerSqmAtFirst,
    asset.redevBuildingStdPriceAtFirst,
    asset.acquisitionDate,
    asset.redevFirstDisclosureDate,
  ]);

  // ── 사례 37 — 토지 출자 §166③ 환산 미리보기 (land 분기) ──
  const isLand = asset.redevOriginalAssetType === "land";

  const landContribPreview = useMemo(() => {
    if (!isLand || !asset.useEstimatedAcquisition) return null;
    const rights = parseAmount(asset.redevRightsValue);
    const landArea = parseDecimal(asset.redevLandArea) || 0;
    const pricePerSqmAcq = parseAmount(asset.redevLandPricePerSqmAtAcq) || 0;
    const pricePerSqmApproval = parseAmount(asset.redevLandPricePerSqmAtApproval) || 0;
    // 단가×면적 계산 우선, fallback은 legacy 총액
    const acq = (pricePerSqmAcq > 0 && landArea > 0)
      ? Math.floor(pricePerSqmAcq * landArea)
      : parseAmount(asset.redevLandStdPriceAtAcq);
    const approval = (pricePerSqmApproval > 0 && landArea > 0)
      ? Math.floor(pricePerSqmApproval * landArea)
      : parseAmount(asset.redevLandStdPriceAtApproval);
    const settlement = parseAmount(asset.redevSettlementAmount);
    if (rights <= 0 || acq <= 0 || approval <= 0) return null;

    // §166③ 환산취득가 = floor(권리가액 × landStdPriceAtAcq / landStdPriceAtApproval)
    const convertedAcq = Number((BigInt(rights) * BigInt(acq)) / BigInt(approval));
    // §163⑥ 개산공제 = floor(취득당시 토지 기준시가 × 3%)
    const estDeduction = Math.floor(acq * 0.03);
    // 인가전 양도차익
    const preApprovalGain = rights - convertedAcq - estDeduction;
    // 인가후 양도차익 = 양도가액 − 권리가액 − 청산금
    const actualTransferPrice = parseAmount(asset.actualSalePrice);
    const postApprovalGain = actualTransferPrice > 0
      ? actualTransferPrice - rights - settlement
      : null;

    return {
      convertedAcq,
      estDeduction,
      preApprovalGain,
      postApprovalGain,
      rights,
      acq,
      approval,
      formula: `floor(${rights.toLocaleString()} × ${acq.toLocaleString()} / ${approval.toLocaleString()})`,
    };
  }, [
    isLand,
    asset.useEstimatedAcquisition,
    asset.redevRightsValue,
    asset.redevLandArea,
    asset.redevLandPricePerSqmAtAcq,
    asset.redevLandPricePerSqmAtApproval,
    asset.redevLandStdPriceAtAcq,
    asset.redevLandStdPriceAtApproval,
    asset.redevSettlementAmount,
    asset.actualSalePrice,
  ]);

  /**
   * §164⑦ 본문 발동 — 판정은 `lib/calc/redev-phd-trigger.ts` **단일 소스**.
   *
   * 종전에는 이 파일 안에서만 같은 식이 두 번 복제돼 있었고, 결과탭 계산서 게이트(L-1)가
   * 세 번째가 될 참이었다. 갈리면 「화면에는 블록이 없는데 계산서는 나오는」 어긋남이 된다.
   * (이 컴포넌트는 상위 `RedevelopmentBlock`이 환산 모드에서만 렌더하므로
   *  술어의 `useEstimatedAcquisition` 조건은 항상 충족된다 — 동작 동일.)
   */
  const isPreDisclosureTriggered = isRedevPhdTriggered(asset);

  const landAreaNumber = parseDecimal(asset.redevLandArea) || undefined;

  // 모드 선택은 상위 ⑤ 「종전 부동산 취득가액」 섹션의 라디오가 담당한다
  // (종전에는 이 컴포넌트가 「환산취득가 사용」 ToggleCard로 모드까지 겸했다 — 2026-08-13 통합).
  // 여기는 **환산을 고른 뒤의 입력 본문**만 렌더한다.
  return (
    <ToneCard tone="rose" noDark bodyClassName="space-y-2">
      <div className="space-y-2">

        {/* ── 사례 37: 토지 출자 분기 ── */}
        {isLand ? (
          <LandContribValuationContent
            asset={asset}
            onChange={onChange}
            preview={landContribPreview}
          />
        ) : (
          <>
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-micro font-bold text-rose-800 select-none">5</span>
          <p className="text-xs font-semibold text-rose-700">환산 기준시가</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 시행령 §166 ③" label="시행령 §166③" />
          <LawArticleModal legalBasis="소득세법 시행령 §176의2 ② 2호" label="시행령 §176의2②2호" />
        </div>

        <StandardPriceInput
          propertyKind="house_individual"
          totalPrice={asset.redevManagementDisposalHousingPrice}
          onTotalPriceChange={(v) => onChange({ redevManagementDisposalHousingPrice: v })}
          jibun={asset.addressJibun || undefined}
          referenceDate={asset.redevApprovalDate}
          label="D. 관리처분 인가일 개별주택공시가격"
          hint="§166③ 분모 — 양도 의제 시점의 §99①1호 라목 단일 라목값"
        />

        <FieldCard
          label="최초공시일"
          hint="개별주택가격/공동주택가격 최초 공시일 (단독 2005-04-30, 공동 2006-04-28). 취득일이 이보다 이전이면 §164⑦ 본문 산식 발동."
        >
          <DateInput
            value={asset.redevFirstDisclosureDate}
            onChange={(v) => onChange({ redevFirstDisclosureDate: v })}
          />
        </FieldCard>

        {!isPreDisclosureTriggered && (
          <StandardPriceInput
            propertyKind="house_individual"
            totalPrice={asset.redevAcquisitionHousingPrice}
            onTotalPriceChange={(v) => onChange({ redevAcquisitionHousingPrice: v })}
            jibun={asset.addressJibun || undefined}
            referenceDate={asset.acquisitionDate}
            label="취득당시 개별주택공시가격"
            hint="§166③ 분자 — 취득당시 §99①1호 라목 단일 라목값 (취득일 ≥ 최초공시일)"
          />
        )}

        {isPreDisclosureTriggered && (
          <div className="rounded-md border border-rose-200 bg-rose-50/60 p-3 space-y-3">
            <p className="text-caption font-semibold text-rose-700">
              §164⑦ 본문 발동 — PHD 패턴: 취득당시 라목값 P_A = floor(A × Sum_A / Sum_F)
            </p>

            <StandardPriceInput
              propertyKind="house_individual"
              totalPrice={asset.redevFirstDisclosureHousingPrice}
              onTotalPriceChange={(v) => onChange({ redevFirstDisclosureHousingPrice: v })}
              jibun={asset.addressJibun || undefined}
              referenceDate={asset.redevFirstDisclosureDate}
              label="A. 최초공시 주택가격"
              hint="국토교통부장관이 최초로 공시한 주택가격 (단일 라목값)"
            />

            {/* 토지 면적은 ① 기본정보로 이전했다 (2026-08-04) —
                `asset-sections/AssetAreaRedevelopment.tsx`. 여기에 다시 추가하지 말 것. */}

            {/* ── 토지 기준시가 — 2시점을 한 섹션에 (2026-08-24 항목축 재편) ──
                종전에는 「취득시(Sum_A)」·「최초공시 당시(Sum_F)」 **시점축** 2박스가
                각각 토지·건물을 담았다. 같은 종류의 값을 나란히 보게 항목축으로 바꿨다.
                Sum_A·Sum_F 합계는 아래 미리보기 박스가 값과 함께 그대로 보여준다. */}
            <div className="rounded-md border border-rose-100 bg-white/70 p-2 space-y-2">
              <p className="text-caption font-semibold text-rose-700">토지 기준시가</p>
              <LandPriceLookupField
                label="취득시 개별공시지가 (원/㎡)"
                hint="Vworld API 조회 — 기준연도 = 취득연도. Sum_A 구성"
                pricePerSqm={asset.redevLandPricePerSqmAtAcq}
                onPricePerSqmChange={(v) => onChange({ redevLandPricePerSqmAtAcq: v })}
                area={landAreaNumber}
                referenceDate={asset.acquisitionDate}
                jibun={asset.addressJibun || undefined}
              />
              <LandPriceLookupField
                label="최초공시 당시 개별공시지가 (원/㎡)"
                hint="Vworld API 조회 — 기준연도 = 최초공시연도 (단독 2005, 공동 2006). Sum_F 구성"
                pricePerSqm={asset.redevLandPricePerSqmAtFirst}
                onPricePerSqmChange={(v) => onChange({ redevLandPricePerSqmAtFirst: v })}
                area={landAreaNumber}
                referenceDate={asset.redevFirstDisclosureDate}
                jibun={asset.addressJibun || undefined}
              />
            </div>

            {/* ── 건물 기준시가 — 2시점 + 계산기 런처 1개 ──
                종전에는 두 칸 모두 "수동 입력"이라 이 자산에는 계산기 진입점이 아예 없었다.
                감면 PHD(`ReductionPhdInput`)와 **같은 2시점 구조**이므로 같은 모달을
                `onApplyBoth`로 배선한다 — 한 번 계산해 두 필드를 동시에 채운다. */}
            <div className="rounded-md border border-rose-100 bg-white/70 p-2 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-caption font-semibold text-rose-700">건물 기준시가</p>
                <BuildingStdPriceModalButton
                  buttonLabel="건물 기준시가 계산"
                  transferSectionLabel="최초공시 시점"
                  /**
                   * 🔴 반드시 고정한다 — 없으면 모달에 세목 라디오가 뜨고, 사용자가
                   * 「상속·증여(1시점)」로 바꾸면 결과 카드가 `onApply`(여기선 **미배선**)를
                   * 부르는 「이 금액 적용」 버튼을 낸다. 두 필드 중 아무것도 안 채워지는
                   * **침묵 no-op**인데 스냅샷은 저장돼, 결과탭에 「취득시 (재개발 환산 §164⑦)」
                   * 라벨을 단 상증 계산서가 한 장 뜬다. 이 호출부는 양도 2시점 전용이다.
                   */
                  lockedTaxType="transfer"
                  initialAddress={stdPriceAddressOf(asset)}
                  snapshotKey={`bsp-${asset.assetId}-redev-phd`}
                  prefill={{
                    landAreaM2: asset.redevLandArea || undefined,
                    acquisitionDate: asset.acquisitionDate,
                    transferDate: asset.redevFirstDisclosureDate,
                    /**
                     * ⚠️ 취득연도 ≤2000이면 `undefined`가 온다 — 그 구간의 위치지수는
                     * **2001.1.1 현재** 공시지가를 써야 하는데 재개발 폼에 그 필드가 없기 때문이다
                     * (트랙 규칙·근거 조문은 `lib/calc/phd-acq-land-price-track.ts` 단일 소스).
                     * §164⑦ 발동 조건이 「취득일 < 최초공시일(2005/2006)」이라 ≤2000 취득이 흔하다.
                     * 그때는 모달 안 `LandPriceLookupField`로 사용자가 직접 조회한다(dead-end 아님).
                     */
                    acqLandPricePerSqm: prefillAcqLandPrice(
                      asset.acquisitionDate,
                      asset.redevLandPricePerSqmAtAcq,
                    ),
                    transferLandPricePerSqm: asset.redevLandPricePerSqmAtFirst || undefined,
                  }}
                  /* 두 필드를 **단일 배치 patch**로 — 두 번 나눠 부르면 뒤 patch가 앞 값을
                     stale spread로 덮는다(memory `feedback_multikey_patch_stale_spread_overwrite`). */
                  onApplyBoth={(acq, first) =>
                    onChange({
                      redevBuildingStdPriceAtAcq: String(acq),
                      redevBuildingStdPriceAtFirst: String(first),
                    })
                  }
                />
              </div>
              <FieldCard label="취득시 건물 기준시가" hint="국세청 건물 기준시가 (총액, 원). Sum_A 구성 — 계산기 결과 수정 가능">
                <CurrencyInput label=""
                  value={asset.redevBuildingStdPriceAtAcq}
                  onChange={(v) => onChange({ redevBuildingStdPriceAtAcq: v })}
                  hideUnit
                />
              </FieldCard>
              <FieldCard label="최초공시 당시 건물 기준시가" hint="국세청 건물 기준시가 (총액, 원). Sum_F 구성 — 계산기 결과 수정 가능">
                <CurrencyInput label=""
                  value={asset.redevBuildingStdPriceAtFirst}
                  onChange={(v) => onChange({ redevBuildingStdPriceAtFirst: v })}
                  hideUnit
                />
              </FieldCard>
            </div>
          </div>
        )}

        {valuationPreview && (
          <div className="mt-2 rounded-md bg-rose-100/60 border border-rose-200 p-2 text-xs space-y-1">
            <p className="font-semibold text-rose-800">환산취득가 미리보기</p>
            {valuationPreview.canApplyMain && valuationPreview.step1Formula && (
              <>
                <p className="text-rose-700">
                  Sum_A (취득시 합계) = 단가×면적 + 건물 ={" "}
                  <span className="font-mono">{valuationPreview.sumAtAcq.toLocaleString()}</span>
                </p>
                <p className="text-rose-700">
                  Sum_F (최초공시 당시 합계) = 단가×면적 + 건물 ={" "}
                  <span className="font-mono">{valuationPreview.sumAtFirst.toLocaleString()}</span>
                </p>
                <p className="text-rose-700">Step 1 (§164⑦ 본문) — P_A = floor(A × Sum_A / Sum_F)</p>
                <p className="text-rose-700 font-mono">
                  = {valuationPreview.step1Formula} = {valuationPreview.P_A.toLocaleString()}
                </p>
              </>
            )}
            <p className="text-rose-700">
              Step 2 (§166③) — 환산취득가 = floor(권리가액 × {valuationPreview.canApplyMain ? "P_A" : "취득당시 라목값"} / D)
            </p>
            <p className="text-rose-700 font-mono">= {valuationPreview.step2Formula}</p>
            <p className="text-rose-700 font-mono">= {valuationPreview.converted.toLocaleString()}</p>
            <p className="text-rose-700">
              §164⑦ 본문:{" "}
              <span className={valuationPreview.canApplyMain ? "font-semibold text-rose-900" : "text-rose-600"}>
                {valuationPreview.canApplyMain
                  ? "발동 — PHD 패턴 2단계 산식 적용"
                  : valuationPreview.provisionTriggered
                    ? "트리거(취득일 < 최초공시일) 이나 PHD 필수입력 누락 → 본문 미적용"
                    : "미발동 — 취득당시 라목값 단일 입력"}
              </span>
            </p>
            {valuationPreview.missingFields && (
              <p className="text-rose-800 font-semibold">
                ⚠ §164⑦ 본문 트리거 발동이지만 PHD 필수입력(A·면적·단가·건물) 중 일부 누락 — 위 영역을 모두 채워주세요.
              </p>
            )}
          </div>
        )}
          </>
        )}
      </div>
    </ToneCard>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 사례 37 — 토지 출자 §166③ 환산취득가 입력 서브 컴포넌트
// ──────────────────────────────────────────────────────────────────────────────

interface LandContribPreview {
  convertedAcq: number;
  estDeduction: number;
  preApprovalGain: number;
  postApprovalGain: number | null;
  rights: number;
  acq: number;
  approval: number;
  formula: string;
}

interface LandContribProps {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  preview: LandContribPreview | null;
}

/**
 * 토지 출자 §166③ 환산취득가 입력 — 사례 37.
 *
 * 토지 기준시가 비율로 취득가액 환산:
 *   환산취득가 = floor(권리가액 × 취득당시 토지기준시가 / 관리처분 직전 토지기준시가)
 *
 * housing 분기의 PHD 패턴(라목값)과 달리, 토지만 있으므로 건물 기준시가 불필요.
 *
 * 입력 패턴: LandPriceLookupField (원/㎡) × 면적 = 총액 (feedback_land_price_lookup_field 준수).
 * housing 분기의 redevLandPricePerSqmAtAcq 필드를 §166③ 분자로 재사용.
 * §166③ 분모는 신규 redevLandPricePerSqmAtApproval 필드.
 * legacy 총액 필드(redevLandStdPriceAtAcq/redevLandStdPriceAtApproval)는 deprecated — sessionStorage 호환용 유지.
 *
 * 정책:
 *  - useEffect → store 미러링 금지 (props.preview는 useMemo 순수 계산으로 부모에서 전달)
 *  - §99①1호 시점 모호성 안내 카드 포함 (2007.1.1 vs 2006.1.1)
 *  - LandPriceLookupField 재사용 — Vworld API 조회 활성화 (jibun prop)
 */
function LandContribValuationContent({ asset, onChange, preview }: LandContribProps) {
  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const landAreaNumber = parseDecimal(asset.redevLandArea) || undefined;

  return (
    <div className="space-y-2">
      {/* 안내 헤더 */}
      <div className="rounded-md border border-amber-200 bg-amber-50/70 p-2 space-y-1">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">5</span>
          <p className="text-xs font-semibold text-amber-700">토지 출자 — §166③ 비율 환산 (사례 37)</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 시행령 §166 ③" label="시행령 §166③" />
          <LawArticleModal legalBasis="소득세법 시행령 §163 ⑥" label="시행령 §163⑥" />
        </div>
        <p className="text-caption text-amber-700">
          환산취득가 = floor(권리가액 × <strong>취득당시 토지기준시가</strong> / <strong>관리처분 직전 토지기준시가</strong>)
        </p>
        <p className="text-caption text-amber-600">
          기준시가 = 개별공시지가 (원/㎡) × 면적 (㎡) — Vworld 자동 조회 가능
        </p>
      </div>

      {/* 토지 면적은 ① 기본정보로 이전했다 (2026-08-04) —
          `asset-sections/AssetAreaRedevelopment.tsx`가 `isLand` 분기에 맞춰
          §166③ hint를 표시한다. 여기에 다시 추가하지 말 것. */}

      {/* 취득당시 토지 ㎡당 단가 — §166③ 분자 */}
      <LandPriceLookupField
        label="취득당시 토지 ㎡당 단가"
        hint="§166③ 분자 — 취득일 기준 개별공시지가 (원/㎡). Vworld 조회 또는 국세청 기준시가 확인."
        pricePerSqm={asset.redevLandPricePerSqmAtAcq}
        onPricePerSqmChange={(v) => onChange({ redevLandPricePerSqmAtAcq: v })}
        area={landAreaNumber}
        referenceDate={asset.acquisitionDate}
        jibun={asset.addressJibun || undefined}
      />

      {/* 관리처분 직전 토지 ㎡당 단가 — §166③ 분모 */}
      <LandPriceLookupField
        label="관리처분 직전 토지 ㎡당 단가"
        hint="§166③ 분모 — 관리처분 인가일 직전 개별공시지가 (원/㎡). §99①1호 공시기준일 적용."
        pricePerSqm={asset.redevLandPricePerSqmAtApproval}
        onPricePerSqmChange={(v) => onChange({ redevLandPricePerSqmAtApproval: v })}
        area={landAreaNumber}
        referenceDate={asset.redevApprovalDate}
        jibun={asset.addressJibun || undefined}
      />

      {/* §99①1호 시점 모호성 안내 */}
      <div className="rounded-md border border-violet-200 bg-violet-50/70 p-2 text-caption text-violet-700 space-y-0.5">
        <p className="font-semibold">§99①1호 시점 모호성 안내</p>
        <p>관리처분 인가일 직전 공시기준일 해석이 실무상 분분합니다.</p>
        <p>• 2007년 개정 전 취득 시 공시기준일 2006.1.1 기준값을 사용하는 견해가 있습니다.</p>
        <p>• 2007년 개정 후에는 인가일 당해 공시지가(전년도 1.1 기준)가 일반적입니다.</p>
        <p>담당 세무사 확인 후 해당 시점 연도의 Vworld 공시지가를 조회·입력하세요.</p>
      </div>

      {/* 환산취득가 미리보기 */}
      {preview && (
        <div className="mt-2 rounded-md bg-amber-100/60 border border-amber-200 p-2 text-xs space-y-1">
          <p className="font-semibold text-amber-800">환산취득가 미리보기 (§166③)</p>
          <p className="text-amber-700">
            취득당시 토지기준시가 = {landAreaNumber ? `${fmt(landAreaNumber)} ㎡ × ` : ""}{fmt(parseAmount(asset.redevLandPricePerSqmAtAcq) || 0)} 원/㎡ = {fmt(preview.acq)}
          </p>
          <p className="text-amber-700">
            관리처분 직전 토지기준시가 = {landAreaNumber ? `${fmt(landAreaNumber)} ㎡ × ` : ""}{fmt(parseAmount(asset.redevLandPricePerSqmAtApproval) || 0)} 원/㎡ = {fmt(preview.approval)}
          </p>
          <p className="text-amber-700">
            환산취득가 = floor({fmt(preview.rights)} × <Frac top={fmt(preview.acq)} bottom={fmt(preview.approval)} />)
          </p>
          <p className="text-amber-700 font-mono">= <FormulaText value={preview.formula} /> = {fmt(preview.convertedAcq)}</p>
          <p className="text-amber-700">
            개산공제 (§163⑥) = floor({fmt(preview.acq)} × 3%) = {fmt(preview.estDeduction)}
          </p>
          <p className="text-amber-700">
            인가전 양도차익 = 권리가액 {fmt(preview.rights)} − 환산취득가 {fmt(preview.convertedAcq)} − 개산공제 {fmt(preview.estDeduction)} ={" "}
            <strong>{fmt(preview.preApprovalGain)}</strong>
          </p>
          {preview.postApprovalGain !== null && (
            <p className="text-amber-700">
              인가후 양도차익 = 양도가액 − 권리가액 − 청산금 = <strong>{fmt(preview.postApprovalGain)}</strong>
            </p>
          )}
          <div className="mt-1 rounded border border-rose-200 bg-rose-50/70 p-1 text-micro text-rose-700">
            인가후 분 LTHD = 0 — 소득세법 §95② 본문 괄호
          </div>
        </div>
      )}
    </div>
  );
}
