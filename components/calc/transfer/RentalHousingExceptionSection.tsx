"use client";

/**
 * 장기임대주택 보유자 거주주택 비과세 특례 입력 섹션 (소령 §155⑳)
 *
 * 마법사 Step1 자산 카드 내부에 배치 (주택 자산에만 표시).
 * 시나리오 A: 거주주택 양도 (임대주택 주택수 제외)
 * 시나리오 B: 임대주택→거주주택 전환 후 양도 (PHRP, §161① 안분)
 */

import Link from "next/link";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { PeriodRangeEditor } from "./PeriodRangeEditor";
import { deriveResidencePeriodMonths } from "@/lib/stores/calc-wizard-asset-residence";
import { HousingStdPriceLookupField } from "@/components/calc/inputs/HousingStdPriceLookupField";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { isPhrpStdPriceLinked } from "@/lib/calc/transfer-phrp-stdprice-link";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { RentalUnitCard } from "./RentalUnitCard";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { TONE } from "@/components/calc/shared/tones";
import { cn } from "@/lib/utils";
import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { isLifetimeLimitEra155_20 } from "@/lib/tax-engine/data/rental-155-20-era";

// ── 메인 섹션 ─────────────────────────────────────────────────────

/**
 * 표시 모드 (P4-3a 계획서 Q-7 · P6-c-2에서 `"calc"` 추가).
 *
 * - `"full"` — 판정 사실 + §161 안분 산식 입력을 **모두**. 이제 **아무도 쓰지 않는다**(기본값
 *   으로만 남는다 — 기존 테스트 다수가 인자 없이 마운트한다).
 * - `"facts"` — 판정 메뉴. 판정 사실만.
 * - `"calc"` — 계산기. **세액 축만**. 아래 분할선 표를 보라.
 *
 * ## 🔴 분할선 — 계획서(§5.0)와 달랐다. 세 번째다 (P6-c-2 실측)
 *
 * 계획서는 「§161① 안분 입력만 계산기에 남기고 판정 사실은 전부 감춘다」였다. ③ 거주기간을
 * 감출 수 없어 **틀렸다**.
 *
 * | 블록 | 축 | 행선지 | 근거 |
 * |---|---|---|---|
 * | 토글 `applyException` | 판정 | 판정 메뉴 | 특례 적용 선언 그 자체 |
 * | 시나리오 A/B | 판정 | 판정 메뉴 | `checkEligibility` 입력 |
 * | ① 임대주택 정보(9유형 18필드) | 판정 | 판정 메뉴 | 〃 — 이관의 **본체** |
 * | ② §161① 안분 4필드 | **세액** | **계산기** | 실측: 직전양도 기준시가 4.5억→4억 하나로 과세분 **172,605,000 → 115,070,000**(−57,535,000) |
 * | ③ 거주기간 편집기 | 판정 **∩ 세액** | **계산기** | 🔴 아래 |
 * | ③ 실시간 충족 표시 | 판정 표시 | **계산기** | ③ 입력 바로 아래 피드백 — 떼면 왜 채우는지 맥락이 사라진다 |
 *
 * ## 🔴 ③ 거주기간을 감출 수 없는 이유 — 유일 입력 경로
 *
 * ⑧(`transfer-tax-validate-rental-exception.ts:190`)은 `deriveResidencePeriodMonths(asset, …)`
 * 을 **자산별로** 불러 24개월 미만이면 계산을 **차단**한다. 그런데 대체 입력 경로인 Step4
 * `ResidencePeriodSection`은 게이트가 `form.isOneHousehold && isOneHouseExemptionAsset(…)`이고
 * 패치도 `i === 0`만 한다(`Step4.tsx:498`). 반면 이 카드의 게이트는 자산종류뿐이다
 * (`AssetSectionExtras.tsx:42`).
 *
 * ⇒ **컴패니언 주택 자산**(i>0)이나 **`isOneHousehold` OFF**에서는 이 ③이 거주기간의 유일한
 *   입력 경로다. 감추면 「24개월 이상 입력하세요」라 막으면서 채울 칸이 없다 — 이 파일 ⑧의
 *   `:26` 주석이 이미 한 번 겪었다고 기록한 dead-end와 **같은 종류**다.
 *
 * 거주기간이 세액 축이기도 하다는 점이 이 배치를 뒷받침한다 — §95② 표2는 거주 2년 이상일 때
 * 거주분 4%/년을 얹는다(Step4가 계산기에서 그것을 안내하는 이유).
 *
 * ## 🔑 중과 축 없음 — 단, 헷갈리는 이웃이 있다
 *
 * `asset.rentalHousingException`은 `multi-house-surcharge*`에 **도달하지 않는다**. 소비처는
 * ④ 변환 2곳·⑧ 1곳·엔진 §155⑳ 스텝뿐이다.
 *
 * 🔴 **`houses[].isLongTermRental`은 완전히 다른 필드다.** 그쪽은 명부(`HouseEntryEditor.tsx:361`,
 *    계산기 Step4 `HousesListSection.tsx:36`)에 있고 `multi-house-surcharge-count.ts:214`가
 *    소비하는 **중과 축**이다. 이름이 비슷하다고 같이 옮기지 말 것 — 계산기에 남는다.
 */
export type RentalHousingSectionMode = "full" | "facts" | "calc";

interface RentalHousingExceptionSectionProps {
  rh: AssetForm["rentalHousingException"];
  /** 자산 전체 — B 시나리오 환산 기준시가 연동 판정(isPhrpStdPriceLinked) + 값 echo용 */
  asset: AssetForm;
  /** 자산 취득일 (B 시나리오 lookupYear 계산용 + 보유기간 검증) */
  acquisitionDate: string;
  /** 양도일 (B 시나리오 lookupYear 계산용 + 보유기간 검증) */
  transferDate: string;
  /** 거주 정보(입력모드·구간·개월) patch 콜백 — 자산-수준 residence 필드 갱신(보유 상황과 자동 동기화) */
  onChangeResidence?: (patch: Partial<AssetForm>) => void;
  onChange: (rh: AssetForm["rentalHousingException"]) => void;
  /** 기본값 `"full"` — 넘기지 않으면 현행(계산기) 동작 그대로다. */
  mode?: RentalHousingSectionMode;
  /**
   * 판정 메뉴에서 사실을 **넘겨받은 적이 있는가**(`hasJudgmentProvenance`) — P6-c-5.
   * `calc` 모드 안내 문구만 가른다. 자세한 것은 안내 블록 주석.
   */
  judgmentLoaded?: boolean;
}

export function RentalHousingExceptionSection({
  rh,
  asset,
  acquisitionDate,
  transferDate,
  onChangeResidence,
  onChange,
  mode = "full",
  judgmentLoaded = false,
}: RentalHousingExceptionSectionProps) {
  /** §161 안분은 **세액 산식**이다 — 판정 메뉴는 그 입력을 받지 않는다(Q-7). */
  const showAllocationInputs = mode !== "facts";
  /** 판정 사실(토글·시나리오·① 임대주택 정보) — 계산기는 받지 않는다(P6-c-2). */
  const showJudgmentFacts = mode !== "calc";
  /** OH-40 구간(경과조치 선언 전 기준) — 양도일·취득일이 모두 있어야 판정한다(표시 전용 파생). */
  const lifetimeEraBase =
    !!acquisitionDate &&
    !!transferDate &&
    !Number.isNaN(new Date(acquisitionDate).getTime()) &&
    !Number.isNaN(new Date(transferDate).getTime()) &&
    isLifetimeLimitEra155_20(new Date(acquisitionDate), new Date(transferDate), false);
  function set<K extends keyof AssetForm["rentalHousingException"]>(
    key: K,
    val: AssetForm["rentalHousingException"][K],
  ) {
    onChange({ ...rh, [key]: val });
  }

  /**
   * 섹션 번호는 **렌더된 블록만** 센다 — 감춘 블록을 세면 화면이 「1 · 3」이 된다.
   * 모드가 3종이 되면서 ①②가 각각 빠질 수 있어 하드코딩을 걷어냈다(P6-c-2).
   */
  const allocationVisible = rh.scenario === "B" && showAllocationInputs;
  const allocationNum = showJudgmentFacts ? 2 : 1;
  const residenceNum = (showJudgmentFacts ? 1 : 0) + (allocationVisible ? 1 : 0) + 1;

  function handleToggle(active: boolean) {
    if (active && rh.rentalUnits.length === 0) {
      // 토글 ON 시 빈 1호 자동 추가 (② 정책)
      onChange({ ...rh, applyException: true, rentalUnits: [makeDefaultRentalUnit()] });
    } else {
      onChange({ ...rh, applyException: active });
    }
  }

  function updateUnit(
    index: number,
    u: AssetForm["rentalHousingException"]["rentalUnits"][number],
  ) {
    const units = [...rh.rentalUnits];
    units[index] = u;
    set("rentalUnits", units);
  }

  function addUnit() {
    set("rentalUnits", [...rh.rentalUnits, makeDefaultRentalUnit()]);
  }

  function removeUnit(index: number) {
    const units = rh.rentalUnits.filter((_, i) => i !== index);
    set("rentalUnits", units);
  }

  const body = (
    <>
      {showJudgmentFacts && (
        <>
          {/* 시나리오 선택 */}
          <RadioCardGroup
            name={`rental-scenario-${asset.assetId ?? "primary"}`}
            tone="violet"
            layout="stack"
            options={[
              {
                value: "A",
                label: "거주주택 양도 (임대주택 주택수 제외)",
                description: "임대주택 보유 중 거주주택 양도 — 임대주택은 주택수에서 제외하여 1세대1주택 비과세 적용",
              },
              {
                value: "B",
                label: "임대주택을 거주주택으로 전환 후 양도 (시행령 제161조 제1항 안분 적용)",
                description: "직전거주주택 양도일 이후 양도소득금액만 비과세 — §161① 기준시가 안분 적용",
              },
            ]}
            value={rh.scenario}
            onChange={(v) => set("scenario", v as "A" | "B")}
          />

          {/* ① 임대주택 정보 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-micro font-bold text-emerald-800 select-none">
                1
              </span>
              <p className="text-xs font-semibold text-emerald-700">임대주택 정보</p>
              <LawArticleModal
                legalBasis="소득세법 시행령 §167조의3"
                label="§167조의3"
              />
            </div>

            <div className="space-y-3">
              {rh.rentalUnits.map((unit, i) => (
                <RentalUnitCard
                  /**
                   * 🔴 **인덱스 key 금지** (2026-09-07 UI 리뷰). 중간 호를 삭제하면 뒤 카드가 삭제된
                   *    호의 인덱스를 물려받아 자식의 **로컬 state**(주소 검색어·기준시가 조회 연도·
                   *    수동 입력 여부·오류 메시지)가 그대로 남았다 — 그 state들은 마운트 시 1회만
                   *    초기화되기 때문이다. `unitId`는 ②·③이 보장한다.
                   */
                  key={unit.unitId}
                  unit={unit}
                  index={i}
                  onChange={(u) => updateUnit(i, u)}
                  onRemove={() => removeUnit(i)}
                  canRemove={rh.rentalUnits.length > 1}
                  transferDate={transferDate}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={addUnit}
              className="w-full text-xs border border-dashed border-emerald-300 rounded-lg py-2 text-emerald-700 hover:bg-emerald-50 transition-colors"
            >
              + 임대주택 추가
            </button>
          </div>

          {/*
            OH-40 — 대통령령 제29523호(2019.2.12) 부칙 제7조①: 이후 취득한 거주주택은 ⑳ 두 괄호(생애 한 차례 ·
            직전거주주택보유주택 1주택 한정)가 적용되고, 제35349호 부칙 제14조로 2025.2.28 이후 양도분부터 삭제됐다.
            게이트는 엔진과 같은 leaf(`isLifetimeLimitEra155_20`) — 경과조치를 켜기 전 기준으로 연다.
          */}
          {lifetimeEraBase && (
            <div className="space-y-2" data-testid="rental-lifetime-limit-block">
              <ToneCard tone="amber" title="2019.2.12 이후 취득 · 2025.2.27 이전 양도 — 적용 범위 제한">
                <p className="text-caption">
                  이 구간의 양도는{" "}
                  {rh.scenario === "B"
                    ? "임대주택을 거주주택으로 전환한 경우 1주택 외의 주택을 모두 양도한 후 1주택을 보유하게 된 때에만"
                    : "장기임대주택을 보유한 채 생애 한 차례만 거주주택을 최초로 양도하는 경우에만"}{" "}
                  특례가 적용됩니다(소령 §155⑳ 괄호, 대통령령 제29523호 부칙 제7조①).
                </p>
              </ToneCard>
              <ToggleCard
                variant="card"
                size="sm"
                tone="emerald"
                data-testid="rental-residence-transition"
                title="2019.2.12 당시 이 주택에 거주하고 있었거나, 그 전에 매매계약을 체결하고 계약금을 지급했습니다."
                description="증빙서류로 확인되면 종전 규정을 따라 위 제한이 적용되지 않습니다(대통령령 제29523호 부칙 제7조②)."
                checked={rh.residenceTransitionUnderAddendum === true}
                onCheckedChange={(v) => set("residenceTransitionUnderAddendum", v)}
              />
              {rh.scenario === "A" && rh.residenceTransitionUnderAddendum !== true && (
                <FieldCard label="장기임대주택 보유 중 거주주택 양도 이력" required>
                  <RadioCardGroup
                    name={`rental-prior-history-${asset.assetId ?? "primary"}`}
                    data-testid="rental-prior-history"
                    tone="amber"
                    layout="stack"
                    options={[
                      {
                        value: "none",
                        label: "없음 — 이번이 최초의 거주주택 양도입니다",
                        testId: "rental-prior-history-none",
                      },
                      {
                        value: "used",
                        label: "있음 — 이미 거주주택을 양도해 이 특례를 적용받았습니다",
                        description: "생애 한 차례 제한으로 이번 양도에는 적용되지 않습니다.",
                        testId: "rental-prior-history-used",
                      },
                    ]}
                    value={rh.priorRentalExemptionHistory ?? ""}
                    onChange={(v) => set("priorRentalExemptionHistory", v)}
                  />
                </FieldCard>
              )}
            </div>
          )}
        </>
      )}

      {/*
        ② B 시나리오 전용: 직전거주주택 정보 + 3-시점 기준시가.
        🔑 **판정에는 쓰이지 않는다** — `checkEligibility`는 이 네 값을 보지 않는다.
           그래서 판정 메뉴(`mode="facts"`)에서는 통째로 접는다(Q-7 분할선).
      */}
      {rh.scenario === "B" && !showAllocationInputs && (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50/40 p-2.5 text-xs text-amber-800"
          data-testid="rental-allocation-deferred-notice"
        >
          <p className="font-semibold">§161① 안분 입력은 세액 계산에서 받습니다</p>
          <p className="mt-0.5">
            직전거주주택 양도일과 3-시점 기준시가는 <strong>과세 범위를 나누는 값</strong>이라
            비과세 판정에는 쓰이지 않습니다. 이 화면은 특례 <strong>요건 충족 여부</strong>까지 답합니다.
          </p>
        </div>
      )}
      {allocationVisible && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">
              {allocationNum}
            </span>
            <p className="text-xs font-semibold text-amber-700">직전거주주택 + 3-시점 기준시가</p>
            <LawArticleModal
              legalBasis="소득세법 시행령 §161"
              label="§161①"
            />
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-3">
            {/* 직전거주주택 양도일 */}
            <FieldCard
              label="직전거주주택 양도일"
              required
              hint="§161① 비과세 기산점"
            >
              <DateInput
                value={rh.priorResidenceTransferDate ?? ""}
                onChange={(v) => set("priorResidenceTransferDate", v || undefined)}
              />
            </FieldCard>

            {/* 취득·현양도 기준시가 — 환산취득가 모드 연동 시 자산-수준 값이 단일 소스 (입력 숨김 + echo) */}
            {isPhrpStdPriceLinked(asset) ? (
              (() => {
                const linkedAcq = parseAmount(asset.standardPriceAtAcq);
                const linkedTransfer = parseAmount(asset.standardPriceAtTransfer);
                return (
                  <div
                    className={cn("rounded border border-amber-200 p-2 text-xs", TONE.amber.chip)}
                    data-testid="phrp-stdprice-linked-echo"
                  >
                    <p className="font-semibold mb-1">취득·양도시 기준시가 — 취득 정보의 환산 입력과 자동 연동</p>
                    {linkedAcq > 0 || linkedTransfer > 0 ? (
                      <p>
                        취득시 {linkedAcq > 0 ? linkedAcq.toLocaleString() : "미입력"} · 양도시{" "}
                        {linkedTransfer > 0 ? linkedTransfer.toLocaleString() : "미입력"}
                      </p>
                    ) : null}
                    {linkedAcq <= 0 || linkedTransfer <= 0 ? (
                      <p className="mt-1">아직 미입력 항목이 있습니다 — 취득 정보에서 먼저 입력하세요.</p>
                    ) : null}
                  </div>
                );
              })()
            ) : (
              /* 취득 당시 기준시가 — 양도 물건(asset) 취득시점 공시가격 Vworld 조회 */
              <HousingStdPriceLookupField
                label="취득 당시 기준시가"
                required
                hint="임대주택(양도 물건)을 처음 취득한 시점의 공동주택가격(또는 개별주택가격)"
                value={rh.standardPriceAtAcquisitionForPhrp ?? ""}
                onChange={(v) => set("standardPriceAtAcquisitionForPhrp", v || undefined)}
                jibun={asset.addressJibun || undefined}
                dong={asset.addressDong || undefined}
                ho={asset.addressHo || undefined}
                referenceDate={acquisitionDate}
                testidPrefix="phrp-stdprice-acq"
              />
            )}

            {/* 직전거주주택 양도 당시 기준시가 — 양도 물건(asset) 자신의 D_prior 시점 공시가격(§161①). 항상 독립 입력 */}
            <HousingStdPriceLookupField
              label="직전거주주택 양도 당시 기준시가"
              required
              hint="직전 거주주택을 양도한 해의 임대주택(양도 물건) 공동주택가격(또는 개별주택가격)"
              value={rh.standardPriceAtPriorTransfer ?? ""}
              onChange={(v) => set("standardPriceAtPriorTransfer", v || undefined)}
              jibun={asset.addressJibun || undefined}
              dong={asset.addressDong || undefined}
              ho={asset.addressHo || undefined}
              referenceDate={rh.priorResidenceTransferDate ?? ""}
              testidPrefix="phrp-stdprice-prior"
            />

            {/* 현 양도 당시 기준시가 — 연동 시 위 echo 카드로 대체 */}
            {!isPhrpStdPriceLinked(asset) && (
              <HousingStdPriceLookupField
                label="현 양도 당시 기준시가"
                required
                value={rh.standardPriceAtTransferForPhrp ?? ""}
                onChange={(v) => set("standardPriceAtTransferForPhrp", v || undefined)}
                jibun={asset.addressJibun || undefined}
                dong={asset.addressDong || undefined}
                ho={asset.addressHo || undefined}
                referenceDate={transferDate}
                testidPrefix="phrp-stdprice-transfer"
              />
            )}

            {/* 안분 비율 미리보기 (§161①) — 소스는 API 변환(④)·validate(⑧)와 동일 ternary */}
            {(() => {
              const linked = isPhrpStdPriceLinked(asset);
              const pAcq = linked
                ? parseAmount(asset.standardPriceAtAcq)
                : parseInt((rh.standardPriceAtAcquisitionForPhrp ?? "").replace(/,/g, "") || "0", 10);
              const pPrior = parseInt((rh.standardPriceAtPriorTransfer ?? "").replace(/,/g, "") || "0", 10);
              const pTransfer = linked
                ? parseAmount(asset.standardPriceAtTransfer)
                : parseInt((rh.standardPriceAtTransferForPhrp ?? "").replace(/,/g, "") || "0", 10);
              if (pAcq > 0 && pPrior > 0 && pTransfer > 0 && pTransfer > pAcq) {
                const ratio161 = ((pPrior - pAcq) / (pTransfer - pAcq) * 100).toFixed(2);
                return (
                  <div className="rounded bg-amber-100/60 border border-amber-200 p-2 text-xs text-amber-800">
                    <p className="font-semibold mb-1">과세 안분 비율 미리보기 (소득세법 시행령 제161조 제1항)</p>
                    <p className="flex flex-wrap items-center gap-1">
                      <Frac
                        top={
                          <>
                            직전 양도 당시 기준시가 {pPrior.toLocaleString()} − 취득 당시 기준시가{" "}
                            {pAcq.toLocaleString()}
                          </>
                        }
                        bottom={
                          <>
                            현 양도 당시 기준시가 {pTransfer.toLocaleString()} − 취득 당시 기준시가{" "}
                            {pAcq.toLocaleString()}
                          </>
                        }
                      />
                      <span>
                        ={" "}
                        <strong>{ratio161}%</strong>
                      </span>
                    </p>
                    <p className="mt-1 text-amber-700">
                      이 비율만큼이 과세 대상이며, 나머지는 비과세입니다.
                    </p>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>
      )}

      {/* ③ 거주주택 요건 충족 상태 (실시간) + 적용 요건 안내 */}
      {(() => {
        // 거주기간(개월) — interval/direct 도출값(엔진·validation과 동일 소스)
        const totalLiveMonths = deriveResidencePeriodMonths(asset, transferDate, "");
        // OH-15 — B의 §155⑳1호 거주요건은 등록 이후 거주기간이다(엔진 `checkEligibility`와 같은 축).
        const isB = rh.scenario === "B";
        const postRegRaw = rh.postRegistrationResidenceMonths ?? "";
        const liveMonths = isB ? parseInt(postRegRaw, 10) || 0 : totalLiveMonths;
        // 보유기간(일) 계산 — 취득일 ~ 양도일
        let holdDays = 0;
        let holdYearsLabel = "-";
        if (acquisitionDate && transferDate) {
          const acqMs = new Date(acquisitionDate).getTime();
          const trnMs = new Date(transferDate).getTime();
          if (Number.isFinite(acqMs) && Number.isFinite(trnMs) && trnMs > acqMs) {
            holdDays = Math.floor((trnMs - acqMs) / (1000 * 60 * 60 * 24));
            const years = Math.floor(holdDays / 365);
            const remDays = holdDays % 365;
            const months = Math.floor(remDays / 30);
            holdYearsLabel = `${years}년 ${months}개월`;
          }
        }
        const livePass = liveMonths >= 24;
        const holdPass = holdDays >= 730;

        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-micro font-bold text-violet-800 select-none">
                {residenceNum}
              </span>
              <p className="text-xs font-semibold text-violet-700">거주주택 요건 충족 상태</p>
            </div>

            {/* 거주기간 입력 — 입주·퇴거일 다중 구간 (자산-수준 residence 필드 양방향 동기화).
                토글 없이 상시 표시는 `251df37b`의 의도된 설계다(최소 1건 필수 입력) — 되돌리지 말 것. */}
            {onChangeResidence && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-violet-800">
                  거주주택 거주기간 <span className="text-rose-500">*</span>
                </p>
                {/*
                  🔴 **direct 모드 echo** (R21). store 기본값이 `residenceInputMode: "direct"`
                     (`calc-wizard-asset-residence.ts:17`)라, 보유 상황 단계에서 개월 수로
                     입력한 사용자가 이 카드를 열면 구간이 비어 **「합계 거주기간 0개월」**이
                     보이는데 바로 아래 실시간 판정은 direct 개월을 읽어 **「✓ 충족」**을 찍었다
                     — 한 카드가 자기 자신과 모순됐다.
                     게다가 구간을 입력하면 `deriveResidencePeriodMonths`가 `interval &&
                     periods.length > 0`에서 구간 합산으로 갈아타므로 **그 개월 수는 버려진다**.
                     둘 다 말로 밝힌다 — 값을 몰래 옮기지 않는다(개월→날짜 역산 불가).
                */}
                {asset.residenceInputMode !== "interval" &&
                  (parseInt(asset.residencePeriodMonthsAsset) || 0) > 0 && (
                    <p
                      className="rounded-md border border-violet-200 bg-violet-100/60 px-3 py-2 text-caption text-violet-900"
                      data-testid="residence-direct-months-echo"
                    >
                      「보유 상황」 단계에서 <strong>{parseInt(asset.residencePeriodMonthsAsset)}개월</strong>로
                      입력돼 있습니다. 아래에 구간을 입력하면 <strong>그 개월 수를 대체</strong>합니다.
                    </p>
                  )}
                <PeriodRangeEditor
                  tone="violet"
                  startLabel="입주일"
                  endLabel="퇴거일"
                  endHint="양도일까지 거주한 경우 양도일을 퇴거일로 입력"
                  rowLabel="거주 구간"
                  totalLabel="합계 거주기간"
                  testidPrefix="residence-period"
                  periods={(asset.residencePeriods ?? []).map((p) => ({
                    start: p.moveInDate,
                    end: p.moveOutDate,
                  }))}
                  onChange={(patch) =>
                    onChangeResidence({
                      residenceInputMode: "interval",
                      residencePeriods: patch.periods.map((p) => ({
                        moveInDate: p.start,
                        moveOutDate: p.end,
                      })),
                    })
                  }
                />
                <p className="text-caption text-muted-foreground px-1">
                  ※ 보유 상황 단계의 거주기간과 동일한 값입니다. 어디서 입력해도 자동 동기화됩니다.
                </p>
              </div>
            )}

            {/*
              OH-15 — 직전거주주택보유주택(B)은 「법 제168조에 따른 사업자등록과 「민간임대주택에 관한 특별법」
              제5조에 따른 임대사업자 등록을 한 날 … 이후의 거주기간」만 센다(소령 §155⑳1호 괄호). 전체 거주기간은
              장기보유특별공제 표2 거주분에 쓰이므로 따로 받는다. 모든 모드에서 띄운다(⑧이 두 모드 모두 요구).
            */}
            {isB && (
              <FieldCard
                label="사업자등록·임대사업자 등록 이후 거주기간"
                required
                unit="개월"
                hint="이 주택의 세무서 사업자등록과 지자체 임대사업자 등록을 모두 마친 날 이후 이 주택에서 거주한 기간 (소령 §155⑳1호)"
              >
                <IntegerInput
                  ariaLabel="사업자등록·임대사업자 등록 이후 거주기간"
                  allowEmpty
                  value={postRegRaw === "" ? undefined : Number(postRegRaw)}
                  onChange={(v) => set("postRegistrationResidenceMonths", v === undefined ? "" : String(v))}
                />
              </FieldCard>
            )}

            {/* 실시간 충족 표시 (소령 §155⑳ 거주주택 요건) */}
            <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-violet-800">
                  {isB ? "거주주택 거주기간 — 등록 이후 (2년 이상 필요)" : "거주주택 거주기간 (2년 이상 필요)"}
                </span>
                <span
                  className={cn(
                    "font-semibold",
                    livePass ? "text-emerald-700" : "text-rose-700",
                  )}
                >
                  {livePass ? "✓ 충족" : "✗ 미충족"} —{" "}
                  현재 {liveMonths}개월
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-violet-800">거주주택 보유기간 (2년 이상 필요)</span>
                <span
                  className={cn(
                    "font-semibold",
                    holdPass ? "text-emerald-700" : "text-rose-700",
                  )}
                >
                  {holdPass ? "✓ 충족" : "✗ 미충족"} —{" "}
                  현재 {holdYearsLabel}
                </span>
              </div>

              {(!livePass || !holdPass) && (
                <div className="mt-1.5 rounded border border-rose-200 bg-rose-50/60 p-1.5 text-caption text-rose-800">
                  거주주택 요건이 충족되지 않으면 본 특례가 적용되지 않고 일반 양도소득세로 계산됩니다.
                </div>
              )}
            </div>

            {/* 추가 안내 */}
            <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2.5 text-xs text-violet-800 space-y-1">
              <p>• 임대주택: 기준시가 상한 준수 + 의무임대기간 충족(충족 전 양도도 적용 — 미충족 시 사후 추징, 소령 §155㉑·㉒)</p>
              <p>• 아파트는 2020.7.11 이전 등록분만 적용 가능</p>
              <p className="flex items-center gap-1">
                <span>• 세부 요건은</span>
                <LawArticleModal
                  legalBasis="소득세법 시행령 §155"
                  label="소령 §155⑳"
                />
                <span>참조</span>
              </p>
            </div>
          </div>
        );
      })()}
    </>
  );

  /**
   * 계산기 — 토글이 없다. 특례 선언은 판정 메뉴 몫이라 여기서 켤 수 없다(P6-c-2).
   *
   * 🔴 **선언이 없으면 안내를, 있으면 요약을 반드시 낸다.** 위젯만 없앴고 값은 살아서
   *    세액을 바꾸기 때문이다 — P6-c-2 **이전**에 저장한 이력을 다시 열었을 때가 정확히
   *    그 경우다. 화면이 말하지 않으면 그 상태를 알 수 없다(OH-20·OH-21과 같은 층위).
   */
  if (mode === "calc") {
    if (!rh.applyException) {
      return (
        <div
          className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 text-sm text-violet-900"
          data-testid="rental-housing-handoff-notice"
        >
          {/*
            🔴 **이미 판정을 다녀온 사용자에게 「가라」고 하지 않는다** (P6-c-5).

            종전에는 이 카드가 `asset`만 받아 폼-전역 provenance를 볼 수단이 없었다. 판정을
            불러왔는데 이 특례가 **해당 없어** 선언하지 않은 사용자(대부분)에게도 「판정한 뒤
            불러오세요」라고 말했다 — 다시 가도 할 것이 없다. `JudgmentHandoffNoticeCard`
            (Step4)는 같은 축에서 provenance를 보는데 이 카드와 §89①4호만 못 봤다.
          */}
          {judgmentLoaded ? (
            <>
              <p>
                넘겨받은 판정에 장기임대주택 거주주택 특례(
                <LawArticleModal legalBasis="소득세법 시행령 §155" label="소령 §155⑳" />
                ) 선언이 <strong>없습니다</strong> — 해당하지 않으면 그대로 두세요.
              </p>
              <p className="mt-1 text-caption text-muted-foreground">
                선언하려면{" "}
                <Link
                  href="/calc/one-house-exemption"
                  className="font-medium underline underline-offset-2"
                  data-testid="rental-housing-handoff-link"
                >
                  판정 메뉴
                </Link>
                로 돌아가 다시 판정하세요. 이 계산은 <strong>특례 없음</strong>으로 산출됩니다.
              </p>
            </>
          ) : (
            <>
              <p>
                장기임대주택 보유자 거주주택 비과세 특례(
                <LawArticleModal legalBasis="소득세법 시행령 §155" label="소령 §155⑳" />
                )는{" "}
                <Link
                  href="/calc/one-house-exemption"
                  className="font-medium underline underline-offset-2"
                  data-testid="rental-housing-handoff-link"
                >
                  1세대1주택 비과세 판정
                </Link>
                에서 판정한 뒤, 1단계의 「📋 판정 불러오기」로 가져오세요.
              </p>
              <p className="mt-1 text-caption text-muted-foreground">
                판정을 거치지 않으면 이 계산은 <strong>특례 없음</strong>으로 산출됩니다.
              </p>
            </>
          )}
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-violet-300 bg-violet-50/70 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-semibold text-violet-900">
            장기임대주택 보유자 거주주택 비과세 특례 — 적용
          </p>
          <LawArticleModal legalBasis="소득세법 시행령 §155" label="§155⑳" />
        </div>
        {/* 판정 메뉴에서 넘겨받은 사실 — 여기서는 고칠 수 없다. */}
        <div
          className="rounded-md border border-violet-200 bg-violet-100/50 p-2.5 space-y-1 text-xs text-violet-900"
          data-testid="imported-rental-housing-facts"
        >
          <p>
            <strong>
              {rh.scenario === "B"
                ? "임대주택을 거주주택으로 전환 후 양도 (§161① 안분)"
                : "거주주택 양도 (임대주택 주택수 제외)"}
            </strong>{" "}
            · 임대주택 {rh.rentalUnits.length}호
          </p>
          <p className="text-caption text-muted-foreground">
            시나리오와 임대주택 정보는 이 화면에서 수정할 수 없습니다 — 고치려면 판정 메뉴로
            돌아가 다시 판정하세요.
          </p>
        </div>
        {body}
      </div>
    );
  }

  return (
    <ToggleCard
      checked={rh.applyException}
      onCheckedChange={handleToggle}
      title="장기임대주택 보유자 거주주택 비과세 특례 적용"
      description="임대주택을 주택수에서 제외하고 1세대1주택으로 봄 (소령 §155⑳)"
      tone="violet"
      trailing={
        <LawArticleModal
          legalBasis="소득세법 시행령 §155"
          label="§155⑳"
        />
      }
    >
      {body}
    </ToggleCard>
  );
}
