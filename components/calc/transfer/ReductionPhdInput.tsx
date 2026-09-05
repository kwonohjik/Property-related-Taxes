"use client";
/**
 * 감면 조문용 PHD 환산 입력 위젯 (Round 10, 2026-05-06)
 *
 * 신축주택은 준공 후 1~2년 후 공시가격이 공시되므로, 모든 신축주택 취득 당시에는
 * 공시가격이 없음. 5년간 발생분 차감 안분 산식을 적용하는 8개 조문에서 "취득시 기준시가"가
 * 필수이므로 소득세법 시행령 §164⑦ 환산 자동화.
 *
 * 사용자 결정사항 #4 (b): 각 감면 조문 입력 폼에 PHD 입력 별도 (자산-수준 PHD와 분리)
 *
 * 활성화는 **항상 수동 토글**(`phdMode`)이다. 취득일 < 최초공시일이면 토글 설명이
 * 「✓ 환산 권장」으로 바뀔 뿐 자동으로 켜지지 않는다(useEffect→store 미러링 금지 정책).
 *
 * 사용처:
 *   - §99의3 본격 입력 폼 (Round 10.3)
 *   - 향후 §99·§98의3·§98의5·§98의6·§98의7·§98의8·§99의2 본격 구현 시 재사용
 */

import { useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { prefillAcqLandPrice } from "@/lib/calc/phd-acq-land-price-track";
import { isPhdEligible } from "@/lib/calc/phd-eligibility";
import {
  calcReductionAcquisitionStdPrice,
  canCalcReductionPhd,
} from "@/lib/tax-engine/transfer-reductions";

// ============================================================================
// Props
// ============================================================================

export interface ReductionPhdValue {
  phdMode?: boolean;
  /**
   * 최초 고시일 — **§164⑦ 적격 판정 전용이고 엔진에 전송되지 않는다** (2026-09-05 · Q12).
   *
   * 환산 산식(`calcReductionAcquisitionStdPrice`)의 입력은 최초고시 **가격**·면적·단가·건물
   * 기준시가뿐이고 이 날짜는 쓰이지 않는다. 여기서 하는 일은 「취득 당시 고시분이 있었는가」를
   * 가려 권장·경고를 띄우는 것이다 — 「죽은 입력」이 아니라 **판정 전용**이다.
   * 엔진까지 배선하려면 ④⑫⑭를 함께 열어야 한다(별건).
   */
  firstDisclosureDate?: string;
  firstDisclosurePrice?: string;
  landAreaSqm?: string;
  landPricePerSqmAtAcq?: string;
  landPricePerSqmAtFirst?: string;
  buildingStdAtAcq?: string;
  buildingStdAtFirst?: string;
}

export interface ReductionPhdInputProps {
  /** 자산의 취득일 (YYYY-MM-DD) — 자동 활성화 판정용 */
  acquisitionDate?: string;
  /** PHD 입력값 (위 ReductionPhdValue 형태) */
  value: ReductionPhdValue;
  /** 부분 갱신 콜백 */
  onChange: (patch: Partial<ReductionPhdValue>) => void;
  /** 환산 결과를 "취득시 기준시가" 필드에 자동 적용하는 콜백 (선택) */
  onApplyResult?: (estimatedAcqStdPrice: number) => void;
  /** "자산 카드 PHD 데이터 가져오기" — Round 10 사용자 친화 보조 (선택) */
  onCopyFromAsset?: () => void;
  /** 자산 카드에 PHD 데이터가 있는지 (버튼 활성 조건) */
  assetHasPhdData?: boolean;
  /** 양도물건 지번 주소 — 건물 기준시가 계산 모달 소재지 prefill(Vworld 공시지가 조회) */
  jibun?: string;
  /** 건물 기준시가 모달 입력 스냅샷 복원 키 prefix(정정 지원) — legacy fallback */
  snapshotKeyPrefix?: string;
  /**
   * 자산 식별자 — 건물 기준시가 계산서 스냅샷 키를 `bsp-${assetId}-red-phd` 규약으로 생성.
   * 규약 편입 시 idOfSnapshotKey가 assetId를 환원 → 결과탭 「건물 기준시가 계산서」에 노출된다
   * (미전달 시 legacy `${snapshotKeyPrefix}-bsp` fallback — 결과탭 소속 판정 탈락 상태 유지).
   */
  assetId?: string;
}

// ============================================================================
// 컴포넌트
// ============================================================================

export function ReductionPhdInput({
  acquisitionDate,
  value,
  onChange,
  onApplyResult,
  onCopyFromAsset,
  assetHasPhdData,
  jibun,
  snapshotKeyPrefix,
  assetId,
}: ReductionPhdInputProps) {
  /**
   * 건물 기준시가 계산서 스냅샷 키 — 취득시·최초공시시 두 모달 버튼이 공유
   * (단일 스냅샷 idempotent 갱신).
   *
   * 🔑 **조문 세그먼트(`snapshotKeyPrefix`)가 키에 들어간다** (2026-08-24 B-4).
   * 종전에는 `assetId`가 있으면 `bsp-${assetId}-red-phd` 하나를 써서 **조문을 구분하지 않았고**,
   * 조문별 폼이 넘기는 prefix(`red993`·`red99`·`red988`…)가 무시됐다.
   * 감면 그룹 라디오는 **같은 category 안에서만** 배타이고(`toggleGroupRadio`), PHD를 가진
   * 8개 조문은 `new_housing`(2) · `unsold_housing`(6) **두 category에 걸쳐** 있다 ⇒ 두 조문의
   * PHD를 동시에 입력할 수 있고, 그때 나중 계산이 앞 계산의 스냅샷을 **덮어썼다**
   * (재오픈 시 다른 조문의 입력이 복원되고, 계산서도 2장이어야 할 것이 1장만 나왔다).
   *
   * ⚠️ 키 규약은 `lib/calc/building-std-snapshot-keys.ts`가 단일 소스다 — 세그먼트 형태를
   *    바꾸면 `idOfSnapshotKey`·`redPhdArticleLabel`도 함께 고쳐야 한다(미등재 시 결과탭
   *    계산서가 **조용히 미출력**된다).
   */
  const buildingStdSnapshotKey =
    assetId && snapshotKeyPrefix
      ? `bsp-${assetId}-${snapshotKeyPrefix}-phd`
      : assetId
        ? `bsp-${assetId}-red-phd`
        : snapshotKeyPrefix
          ? `${snapshotKeyPrefix}-bsp`
          : undefined;
  /**
   * §164⑦ 적격 판정 — **자산 축과 같은 leaf**를 쓴다 (2026-09-05 · 코드리뷰 Q12).
   *
   * 🔴 종전에는 이 자리에서 `new Date(a) < new Date(f)`로 판정을 **복제**했다. 그 식은
   *   `isPhdEligible`이 접어 주는 **의제취득일(1985-01-01)** 을 보지 않아, 1985년 이전 취득에서
   *   자산 축과 답이 갈렸다. 게다가 **부적격일 때 아무 말도 하지 않아** 취득일이 최초공시일
   *   이후여도 토글을 켤 수 있었고, 그 환산값이 그대로 감면 대상소득 산정에 쓰였다 —
   *   자산 축(⑤ 경고·⑧ 차단·⑫ refine 3중)과 **같은 규정, 반대 취급**이었다.
   *
   * ⚠️ 여기서는 **차단하지 않고 경고만** 한다(1단계). 차단을 바로 넣으면 이미 저장된 감면
   *   입력이 갑자기 계산 불가가 된다 — 새로 저장되는 것부터 차단으로 승격하는 2단계가 남는다.
   */
  const phdEligible = isPhdEligible(acquisitionDate ?? "", value.firstDisclosureDate ?? "");
  const bothDatesKnown = !!acquisitionDate && !!value.firstDisclosureDate;
  /** 취득일 < 최초공시일 — 환산 권장 */
  const autoRecommended = bothDatesKnown && phdEligible;
  /** 취득 당시 이미 고시분이 있다 — §164⑦ 대상이 아니다 */
  const notEligible = bothDatesKnown && !phdEligible;

  const isOn = value.phdMode === true;

  // 환산 결과 계산 (메모이즈)
  const result = useMemo(() => {
    if (!isOn) return null;
    const phdInput = {
      firstDisclosurePrice: parseAmount(value.firstDisclosurePrice ?? "0"),
      landAreaSqm: parseDecimal(value.landAreaSqm ?? "0"),
      landPricePerSqmAtAcquisition: parseAmount(value.landPricePerSqmAtAcq ?? "0"),
      landPricePerSqmAtFirstDisclosure: parseAmount(value.landPricePerSqmAtFirst ?? "0"),
      buildingStdPriceAtAcquisition: parseAmount(value.buildingStdAtAcq ?? "0"),
      buildingStdPriceAtFirstDisclosure: parseAmount(value.buildingStdAtFirst ?? "0"),
    };
    if (!canCalcReductionPhd(phdInput)) return null;
    return calcReductionAcquisitionStdPrice(phdInput);
  }, [isOn, value]);

  return (
    <div className="space-y-2">
      <ToggleCard
        checked={isOn}
        onCheckedChange={(v) => onChange({ phdMode: v })}
        title="최초공시 전 환산 (취득시 환산공시가격 자동 계산)"
        description={
          autoRecommended
            ? "✓ 자산의 취득일이 최초공시일 이전 — 환산 권장"
            : notEligible
              ? "⚠ 취득 당시 이미 공시가격이 고시돼 있습니다 — §164⑦ 환산 대상이 아닙니다"
              : "신축주택 취득 당시 공시가격이 없는 경우 소득세법 시행령 §164⑦ 환산 적용"
        }
        tone="amber"
        size="sm"
      >
        <div className="space-y-3 mt-2">
          {/*
            §164⑦ 부적격 경고 (Q12) — **차단하지 않는다**. 자산 축은 같은 상황을 ⑧에서 막지만
            (`transfer-tax-validate-acquisition.ts:511`), 감면 축에 차단을 바로 넣으면 이미
            저장된 입력이 갑자기 계산 불가가 된다. 우선 경고로 알리고, 새로 저장되는 것부터
            차단으로 승격하는 2단계를 남긴다.
          */}
          {notEligible && isOn && (
            <div
              className="rounded-md border border-rose-300 bg-rose-50/70 px-3 py-2 text-xs text-rose-900"
              data-testid="reduction-phd-not-eligible"
            >
              <p className="font-semibold">§164⑦ 환산 대상이 아닙니다</p>
              <p className="mt-0.5">
                취득일(의제취득일 1985-01-01 반영)이 최초 고시일 이후입니다 — 취득 당시
                주택공시가격이 고시되어 있으므로 환산이 아니라 <strong>실제 고시된 취득시
                기준시가</strong>를 입력해야 합니다. 이 환산값은 감면 대상소득 산정에 그대로
                쓰이므로 확인하세요.
              </p>
            </div>
          )}
          {/* 자산 카드 데이터 가져오기 버튼 (Q4 b 선택의 사용자 친화 보조) */}
          {onCopyFromAsset && assetHasPhdData && (
            <button
              type="button"
              onClick={onCopyFromAsset}
              className="w-full rounded-md border border-amber-300 bg-amber-100/60 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
            >
              📋 자산 카드의 최초공시 전 환산 데이터 가져오기
            </button>
          )}

          {/* 입력 그리드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">최초공시일자</label>
              <DateInput
                value={value.firstDisclosureDate ?? ""}
                onChange={(v) => onChange({ firstDisclosureDate: v })}
              />
              <p className="mt-1 text-micro text-muted-foreground">공동주택가격/개별주택가격 최초 고시일</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">최초공시 공동주택가격 (원)</label>
              <CurrencyInput
                label=""
                value={value.firstDisclosurePrice ?? ""}
                onChange={(v) => onChange({ firstDisclosurePrice: v })}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">토지면적 (㎡)</label>
              <DecimalInput
                value={value.landAreaSqm ?? ""}
                onChange={(v) => onChange({ landAreaSqm: v })}
              />
            </div>

            <div></div> {/* 그리드 정렬용 빈 칸 */}

            <div className="sm:col-span-2">
              <LandPriceLookupField
                label="취득시 토지 공시지가 (원/㎡)"
                hint="취득연도 개별공시지가"
                hideLandStdPrice
                pricePerSqm={value.landPricePerSqmAtAcq ?? ""}
                onPricePerSqmChange={(v) => onChange({ landPricePerSqmAtAcq: v })}
                jibun={jibun}
                referenceDate={acquisitionDate}
              />
            </div>

            <div className="sm:col-span-2">
              <LandPriceLookupField
                label="최초공시시 토지 공시지가 (원/㎡)"
                hint="최초공시연도 개별공시지가"
                hideLandStdPrice
                pricePerSqm={value.landPricePerSqmAtFirst ?? ""}
                onPricePerSqmChange={(v) => onChange({ landPricePerSqmAtFirst: v })}
                jibun={jibun}
                referenceDate={value.firstDisclosureDate}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">취득시 건물 기준시가 (원, 선택)</label>
              <CurrencyInput
                label=""
                value={value.buildingStdAtAcq ?? ""}
                onChange={(v) => onChange({ buildingStdAtAcq: v })}
              />
              <div className="mt-1">
                <BuildingStdPriceModalButton
                  buttonLabel="건물 기준시가 계산"
                  transferSectionLabel="최초고시 시점"
                  /**
                   * 🔴 세목 고정 — 없으면 모달에 세목 라디오가 뜨고, 사용자가
                   * 「상속·증여(1시점)」로 바꾸면 결과 카드가 `onApply`(여기선 **미배선**)를
                   * 부르는 「이 금액 적용」 버튼을 낸다. 두 필드 중 아무것도 안 채워지는
                   * **침묵 no-op**인데 스냅샷은 저장돼, 결과탭에 「감면 PHD 환산 §164⑦」
                   * 라벨을 단 상증 계산서가 남는다. 이 호출부는 양도 2시점 전용이다.
                   */
                  lockedTaxType="transfer"
                  initialAddress={jibun ? { road: "", jibun, building: "", detail: "", lng: "", lat: "" } : undefined}
                  snapshotKey={buildingStdSnapshotKey}
                  prefill={{
                    landAreaM2: value.landAreaSqm || undefined,
                    acquisitionDate,
                    transferDate: value.firstDisclosureDate,
                    acqLandPricePerSqm: prefillAcqLandPrice(acquisitionDate, value.landPricePerSqmAtAcq),
                    transferLandPricePerSqm: value.landPricePerSqmAtFirst || undefined,
                  }}
                  onApplyBoth={(acq, first) =>
                    onChange({ buildingStdAtAcq: String(acq), buildingStdAtFirst: String(first) })
                  }
                />
              </div>
              <p className="mt-1 text-micro text-muted-foreground">국세청 건물기준시가 — 미입력 시 토지만 환산</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">최초공시시 건물 기준시가 (원)</label>
              <CurrencyInput
                label=""
                value={value.buildingStdAtFirst ?? ""}
                onChange={(v) => onChange({ buildingStdAtFirst: v })}
              />
              <div className="mt-1">
                <BuildingStdPriceModalButton
                  buttonLabel="건물 기준시가 계산"
                  transferSectionLabel="최초고시 시점"
                  /**
                   * 🔴 세목 고정 — 없으면 모달에 세목 라디오가 뜨고, 사용자가
                   * 「상속·증여(1시점)」로 바꾸면 결과 카드가 `onApply`(여기선 **미배선**)를
                   * 부르는 「이 금액 적용」 버튼을 낸다. 두 필드 중 아무것도 안 채워지는
                   * **침묵 no-op**인데 스냅샷은 저장돼, 결과탭에 「감면 PHD 환산 §164⑦」
                   * 라벨을 단 상증 계산서가 남는다. 이 호출부는 양도 2시점 전용이다.
                   */
                  lockedTaxType="transfer"
                  initialAddress={jibun ? { road: "", jibun, building: "", detail: "", lng: "", lat: "" } : undefined}
                  snapshotKey={buildingStdSnapshotKey}
                  prefill={{
                    landAreaM2: value.landAreaSqm || undefined,
                    // 두 버튼 동일 — 취득시 + 최초고시시 2시점을 함께 계산·적용.
                    acquisitionDate,
                    transferDate: value.firstDisclosureDate,
                    acqLandPricePerSqm: prefillAcqLandPrice(acquisitionDate, value.landPricePerSqmAtAcq),
                    transferLandPricePerSqm: value.landPricePerSqmAtFirst || undefined,
                  }}
                  onApplyBoth={(acq, first) =>
                    onChange({ buildingStdAtAcq: String(acq), buildingStdAtFirst: String(first) })
                  }
                />
              </div>
              <p className="mt-1 text-micro text-muted-foreground">취득시 건물 기준시가를 입력했다면 필수입니다 — 취득시 값을 대신 쓰면 §164⑦ 산식이 아닙니다.</p>
            </div>
          </div>

          {/* 환산 결과 박스 */}
          {result && (
            <div className="rounded-md border border-amber-300 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 space-y-1">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                환산 결과 (소득세법 시행령 §164⑦)
              </p>
              <div className="space-y-0.5 text-caption text-amber-800 dark:text-amber-300">
                {result.formulaSteps.map((s, i) => (
                  <p key={i}>
                    <span className="opacity-70">{s.label}: </span>
                    {s.formula ?? s.value.toLocaleString()}
                  </p>
                ))}
              </div>
              <p className="mt-1.5 text-sm font-bold text-amber-900 dark:text-amber-100">
                → 취득시 추정 공동주택가격 = {result.estimatedAcquisitionStdPrice.toLocaleString()}원
              </p>
              {onApplyResult && (
                <button
                  type="button"
                  onClick={() => onApplyResult(result.estimatedAcquisitionStdPrice)}
                  className="mt-2 w-full rounded-md border border-amber-400 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-100 dark:hover:bg-amber-900/70"
                >
                  ↓ 위 값을 &ldquo;취득시 기준시가&rdquo; 필드에 적용
                </button>
              )}
            </div>
          )}

          {!result && isOn && (
            <p className="text-caption text-amber-700 dark:text-amber-400">
              ⚠ 환산을 위해 최초공시일·최초공시가격·토지면적·취득시·최초공시시 토지 공시지가를 모두 입력하세요.
            </p>
          )}
        </div>
      </ToggleCard>
    </div>
  );
}
