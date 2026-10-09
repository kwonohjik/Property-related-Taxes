"use client";

/**
 * PresaleRightsSection — 세대 보유 분양권·입주권 입력 (다주택 중과 주택 수 산입)
 *
 * 소령 §167의11·§167의3①: 2021.1.1 이후 취득한 분양권·조합원입주권은 주택 수에 포함.
 * 항목별 3필드(종류·취득일·지역)뿐이므로 모달 없이 인라인 편집.
 *
 * 정책: RadioCardGroup/DateInput 전용 · useEffect→store 미러링 금지(onChange 직접 set).
 */

import { RIGHT_TO_MOVE_IN_SCOPE_HINT } from "@/lib/calc/right-to-move-in-scope-hint";
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { AddressSearch } from "@/components/ui/address-search";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { DesignatedDistrictQuestion } from "@/components/calc/transfer/DesignatedDistrictQuestion";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-store";
import { requiresPresaleRightsConfirmation } from "@/lib/calc/housing-like-asset";
import { isOneHouseExemptionAsset } from "@/lib/calc/housing-like-asset";
import { OriginalMemberTempTwoHouseInputs } from "@/components/calc/transfer/OriginalMemberTempTwoHouseInputs";

interface Props {
  rights: PresaleRightEntry[];
  onChange: (rights: PresaleRightEntry[]) => void;
  /** #2b 혼인합가일 입력 시 "배우자 단독 보유" chip 노출 (§167의4⑤) */
  showSpouseOwned?: boolean;
  /**
   * 「세대가 보유한 분양권·입주권이 없습니다」 확인 토글 — PR-D(2026-10-05,
   * 계획서 `docs/00-pm/roster-required-other-assets.plan.md` §4-5·§4-6).
   *
   * `requiresPresaleRightsConfirmation(primaryKind)`가 true인 자산(housing·redevelopment_apt·
   * right_to_move_in)에서만 렌더한다 — 분양권 자신의 양도(`presale_right`)는 대상 아님(Q-11).
   * 호출부가 `confirmed`·`onConfirmedChange`를 넘기지 않으면(= 이 확인이 필요 없는 맥락) 종전처럼
   * 「없음」 평문을 그대로 보여준다.
   */
  primaryKind?: string;
  confirmed?: boolean;
  onConfirmedChange?: (confirmed: boolean) => void;
  /** 양도일 — 기존주택 원조합원 행의 §155①2호 가목(2019-12-17 체제) 칸을 열지 정한다(`originalMemberMoveInRelevant`) */
  transferDate?: string;
}

export function PresaleRightsSection({
  rights,
  onChange,
  showSpouseOwned,
  primaryKind,
  confirmed,
  onConfirmedChange,
  transferDate,
}: Props) {
  function add() {
    const entry: PresaleRightEntry = {
      id: `presale_${Date.now()}`,
      type: "presale_right",
      acquisitionDate: "",
      region: "capital",
    };
    onChange([...rights, entry]);
  }

  function update(id: string, patch: Partial<PresaleRightEntry>) {
    onChange(rights.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function remove(id: string) {
    onChange(rights.filter((r) => r.id !== id));
  }

  return (
    <ToneCard
      tone="sky"
      bodyClassName="space-y-2.5"
      title="분양권·입주권"
      titleExtra={
        <button type="button" onClick={add} className="ml-auto text-sm font-medium text-primary hover:underline">
          + 추가
        </button>
      }
      noDark
    >
      <p className="text-caption text-muted-foreground/80">
        세대가 보유한 분양권·조합원입주권을 취득일과 무관하게 모두 입력하세요. 주택 수 산정
        포함 여부(2021.1.1 이후 취득분, 소령 §167의11)는 입력한 취득일로 자동 판단됩니다.
      </p>

      {rights.length === 0 ? (
        requiresPresaleRightsConfirmation(primaryKind) && onConfirmedChange ? (
          <div data-field="householdNoPresaleRightsConfirmed">
            <ToggleCard
              checked={confirmed === true}
              onCheckedChange={onConfirmedChange}
              title="보유한 분양권·조합원입주권이 없습니다"
              description="세대가 보유한 분양권·조합원입주권이 없으면 켜세요. 있으면 위 「+ 추가」로 입력하세요."
              tone="sky"
            />
          </div>
        ) : (
          <p className="text-caption text-muted-foreground/70">없음</p>
        )
      ) : (
        <div className="space-y-2.5">
          {rights.map((r, idx) => (
            <div key={r.id} className="rounded-md border border-border bg-background/60 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-caption font-medium text-muted-foreground tabular-nums">
                  {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  className="text-caption text-destructive hover:underline"
                  aria-label={`분양권·입주권 ${idx + 1} 삭제`}
                >
                  삭제
                </button>
              </div>
              <div className="space-y-1">
                <span className="block text-caption text-muted-foreground font-medium">종류</span>
                <RadioCardGroup
                  name={`presale-type-${r.id}`}
                  layout="inline"
                  tone="sky"
                  value={r.type}
                  onChange={(v) =>
                    update(r.id, {
                      type: v as PresaleRightEntry["type"],
                      // 취득 경위는 조합원입주권 전용 — 분양권으로 바꾸면 남기지 않는다.
                      ...(v === "presale_right" ? { memberOrigin: undefined } : {}),
                    })
                  }
                  options={[
                    { value: "presale_right", label: "분양권" },
                    { value: "redevelopment_right", label: "조합원입주권" },
                  ]}
                />
                {r.type === "redevelopment_right" && (
                  <p className="text-micro text-muted-foreground" data-testid="presale-right-scope-hint">
                    {RIGHT_TO_MOVE_IN_SCOPE_HINT}
                  </p>
                )}
              </div>
              {/*
                취득 경위 — 「소득세법 시행령」 §156의2③·④는 「그 주택을 양도하기 전에 조합원입주권을 취득함으로써」라
                입주권을 새로 취득한 세대(승계취득 · 상가·토지 원조합원 — 재산세과-1708)의 규정이다. 기존주택 원조합원은
                §155① 일시적 2주택(사전-2018-법령해석재산-0620, 기존주택 취득일 기준)이다. 날짜 칸의 의미가 경위마다 다르다.
              */}
              {r.type === "redevelopment_right" && (
                <div className="space-y-1">
                  <span className="block text-caption text-muted-foreground font-medium">취득 경위</span>
                  <RadioCardGroup
                    name={`presale-member-origin-${r.id}`}
                    data-field={`presaleRights.${idx}.memberOrigin`}
                    layout="inline"
                    tone="sky"
                    value={r.memberOrigin ?? ""}
                    onChange={(v) => update(r.id, { memberOrigin: v as NonNullable<PresaleRightEntry["memberOrigin"]> })}
                    options={[
                      { value: "original_house", label: "원조합원(기존 주택)", testId: `presale-member-origin-original-house-${idx}` },
                      {
                        value: "original_non_house",
                        label: "원조합원(상가·토지 등)",
                        testId: `presale-member-origin-original-non-house-${idx}`,
                      },
                      { value: "successor", label: "승계취득", testId: `presale-member-origin-successor-${idx}` },
                    ]}
                  />
                  <span className="block text-caption text-muted-foreground">
                    원조합원은 보유하던 부동산이 관리처분계획 인가로 입주권이 된 경우, 승계취득은 입주권을 매매 등으로 산
                    경우입니다.
                  </span>
                </div>
              )}
              <div className="space-y-1">
                <span className="block text-caption text-muted-foreground font-medium">
                  {r.type !== "redevelopment_right"
                    ? r.isInherited
                      ? "취득일(상속개시일)"
                      : "취득일"
                    : r.memberOrigin === "original_house"
                      ? "기존주택 취득일"
                      : r.memberOrigin === "original_non_house"
                        ? "입주권 취득일(관리처분계획 인가일)"
                        : "취득일"}
                </span>
                <DateInput
                  data-field={`presaleRights.${idx}.acquisitionDate`}
                  value={r.acquisitionDate}
                  onChange={(v) => update(r.id, { acquisitionDate: v })}
                />
                {r.type === "redevelopment_right" && r.memberOrigin === "original_house" && (
                  <span className="block text-caption text-muted-foreground">
                    입주권으로 바뀐 기존주택을 취득한 날입니다. 일시적 2주택 기한(§155①)은 이 날부터 셉니다.
                  </span>
                )}
              </div>
              {/* 원조합원 §155① 판정은 주택 양도에서만 일어난다(⑧ `originalMemberFactErrors`와 같은 게이트) — 그 밖에서는 칸을 두지 않는다. */}
              {r.type === "redevelopment_right" && r.memberOrigin === "original_house" && isOneHouseExemptionAsset(primaryKind) && (
                <OriginalMemberTempTwoHouseInputs
                  row={r}
                  idx={idx}
                  transferDate={transferDate}
                  onChange={(patch) => update(r.id, patch)}
                />
              )}
              {/*
                §89②의 조합원입주권 축 시행일 게이트 — 법률 제7837호(2006-01-01 시행) 부칙 §12①이
                「2006년 1월 1일 이후 최초로 **관리처분계획이 인가된 분**부터」로 정했다.
                분양권은 취득일 축(§88 10호 정의 시행일)이라 이 칸을 두지 않는다.

                ⚠️ 미입력은 **원칙(적용)** 이다 — 2026년 현재 보유 중인 입주권의 인가일이
                   2006-01-01 이전인 경우는 사실상 예외라, 해당 세대만 선언으로 빠져나간다.
              */}
              {r.type === "redevelopment_right" && (
                <div className="space-y-1">
                  <span className="block text-caption text-muted-foreground font-medium">
                    관리처분계획 인가일 <span className="font-normal">(선택)</span>
                  </span>
                  <DateInput
                    value={r.managementDisposalApprovalDate ?? ""}
                    onChange={(v) => update(r.id, { managementDisposalApprovalDate: v })}
                  />
                  <span className="block text-caption text-muted-foreground">
                    2006-01-01 전에 인가된 입주권은 1세대1주택 비과세 배제(§89②) 대상이 아닙니다.
                    그 후 승계취득한 경우에는 대상입니다.
                  </span>
                </div>
              )}
              <div className="space-y-1">
                <span className="block text-caption text-muted-foreground font-medium">지역 구분</span>
                <RadioCardGroup
                  name={`presale-region-${r.id}`}
                  layout="inline"
                  tone="rose"
                  value={
                    r.region === "capital"
                      ? "capital"
                      : r.regionCriteria === "REGION"
                        ? "metro"
                        : "local"
                  }
                  onChange={(v) =>
                    update(
                      r.id,
                      v === "capital"
                        ? { region: "capital", regionCriteria: "REGION" }
                        : v === "metro"
                          ? { region: "non_capital", regionCriteria: "REGION" }
                          : { region: "non_capital", regionCriteria: "VALUE" },
                    )
                  }
                  options={[
                    { value: "capital", label: "수도권" },
                    { value: "metro", label: "광역시·세종" },
                    { value: "local", label: "그 외 지방" },
                  ]}
                />
              </div>
              <CurrencyInput
                label="가액(공급가격)"
                value={r.rightValue ?? ""}
                onChange={(v) => update(r.id, { rightValue: v })}
                hint="분양권 공급가격/입주권 종전주택가격 — 그 외 지방 3억 이하 시 주택 수 제외 (원)"
              />
              <div className="space-y-1">
                <span className="block text-caption text-muted-foreground font-medium">
                  소재지 (주소) <span className="text-muted-foreground/60">— 선택</span>
                </span>
                <AddressSearch
                  value={{ road: "", jibun: r.regionName ?? "", building: "", detail: "", lng: "", lat: "" }}
                  onChange={(v) => {
                    const regionCode = v.pnu && v.pnu.length >= 10 ? v.pnu.slice(0, 10) : r.regionCode;
                    update(r.id, {
                      regionCode,
                      regionName: v.jibun || v.road || r.regionName,
                      // 「지정 지구 안인가」 답은 그 소재지에 붙는다 — 법정동이 바뀌면 지운다.
                      ...(regionCode !== r.regionCode ? { inDesignatedDistrict: undefined } : {}),
                    });
                  }}
                />
                <DesignatedDistrictQuestion
                  regionCode={r.regionCode}
                  value={r.inDesignatedDistrict}
                  onChange={(inDesignatedDistrict) => update(r.id, { inDesignatedDistrict })}
                  idSuffix={`right-${idx}`}
                />
                <p className="text-caption text-muted-foreground/70">
                  인구감소지역 세컨드홈 특례의 &ldquo;취득 전 보유주택과 동일 시·군·구&rdquo; 비교에 사용 (소령 §167의3①12 다·라목 2호). 분양권은 공급주택, 입주권은 종전주택 소재지의 주소를 검색하세요.
                </p>
              </div>
              {/* #2b 혼인합가 — 배우자 단독 보유 (혼인합가일 입력 시) */}
              {showSpouseOwned && (
                <ToggleCard
                  variant="chip"
                  tone="violet"
                  checked={r.isSpouseOwned ?? false}
                  onCheckedChange={(v) => update(r.id, { isSpouseOwned: v })}
                  title="배우자 단독 보유"
                />
              )}
              {/*
                §89② 배제의 상속 예외 축 — 「소득세법 시행령」 §156의2⑥·⑦ · §156의3④·⑤.
                순위 규칙(피상속인 소유·거주기간)은 미구현이라, 체크 시 엔진은 배제를 **판정하지 않고**
                해당 조문을 직접 확인하라는 경고를 낸다(잘못된 배제 방지).
              */}
              <ToggleCard
                variant="chip"
                tone="violet"
                checked={r.isInherited ?? false}
                onCheckedChange={(v) => update(r.id, { isInherited: v })}
                title="상속받은 권리"
              />
              {/*
                §156의2⑥·⑦ · §156의3④·⑤ — 「상속받은 권리」로 인정되기 위한 요건.
                🔑 순위는 **계산하지 않고 자기선언**으로 받는다(주택 축 §155②③과 같은 규약).
                ⚠️ 순위 단계 수가 다르다 — 입주권 3단계 / 분양권 2단계.
              */}
              {r.isInherited && (
                <div className="space-y-1.5 rounded-md border border-violet-200 bg-violet-50/50 p-2">
                  <p className="text-caption font-semibold text-violet-700">
                    상속 권리 인정 요건 (시행령 §156의2⑥ · §156의3④)
                  </p>
                  <ToggleCard
                    variant="chip"
                    tone="violet"
                    checked={r.decedentOwnedHouseAtDeath ?? false}
                    onCheckedChange={(v) => update(r.id, { decedentOwnedHouseAtDeath: v })}
                    title="피상속인이 상속개시 당시 주택을 보유"
                  />
                  <ToggleCard
                    variant="chip"
                    tone="violet"
                    checked={r.decedentOwnedOtherRightTypeAtDeath ?? false}
                    onCheckedChange={(v) => update(r.id, { decedentOwnedOtherRightTypeAtDeath: v })}
                    title={
                      r.type === "redevelopment_right"
                        ? "피상속인이 상속개시 당시 분양권을 보유"
                        : "피상속인이 상속개시 당시 조합원입주권을 보유"
                    }
                  />
                  <ToggleCard
                    variant="chip"
                    tone="violet"
                    checked={r.isRankingDisqualifiedInheritedRight ?? false}
                    onCheckedChange={(v) =>
                      update(r.id, { isRankingDisqualifiedInheritedRight: v })
                    }
                    title={
                      r.type === "redevelopment_right"
                        ? "순위상 상속받은 1입주권이 아님 (소유기간→거주기간→선택)"
                        : "순위상 상속받은 1분양권이 아님 (소유기간→선택)"
                    }
                  />
                  <ToggleCard
                    variant="chip"
                    tone="violet"
                    checked={r.isCoInherited ?? false}
                    onCheckedChange={(v) => update(r.id, { isCoInherited: v })}
                    title="공동상속 권리"
                  />
                  {r.isCoInherited && (
                    <ToggleCard
                      variant="chip"
                      tone="violet"
                      checked={r.isLargestCoInheritedShareholder ?? false}
                      onCheckedChange={(v) =>
                        update(r.id, { isLargestCoInheritedShareholder: v })
                      }
                      title="상속지분이 가장 큰 상속인"
                    />
                  )}
                  <ToggleCard
                    variant="chip"
                    tone="violet"
                    checked={r.decedentSameHouseholdAtInheritance ?? false}
                    onCheckedChange={(v) =>
                      update(r.id, { decedentSameHouseholdAtInheritance: v })
                    }
                    title="상속개시 당시 피상속인과 동일세대"
                  />
                  {r.decedentSameHouseholdAtInheritance && (
                    <ToggleCard
                      variant="chip"
                      tone="violet"
                      checked={r.parentalCareMergeInheritedRight ?? false}
                      onCheckedChange={(v) =>
                        update(r.id, { parentalCareMergeInheritedRight: v })
                      }
                      title="동거봉양 합가 전부터 보유하던 주택이 전환된 것"
                    />
                  )}
                  {/*
                    상속 분양권 — §89②·§104⑦의 2021.1.1. 적용례(법률 제17477호 부칙 제4조). 동일세대 상속이면 이 날로
                    본다(재산세제과-1033). 별도세대는 상속개시일로 판정하고 확인 필요(엔진 `presale-right-definition-date.ts`).
                  */}
                  {r.type === "presale_right" && (
                    <div className="space-y-1">
                      <span className="block text-caption text-muted-foreground font-medium">
                        피상속인이 분양권을 취득한 날
                      </span>
                      <DateInput
                        data-testid={`presale-decedent-acquisition-date-${idx}`}
                        data-field={`presaleRights.${idx}.decedentAcquisitionDate`}
                        value={r.decedentAcquisitionDate ?? ""}
                        onChange={(v) => update(r.id, { decedentAcquisitionDate: v })}
                      />
                      <span className="block text-caption text-muted-foreground">
                        2020.12.31. 이전에 취득한 분양권을 상속개시 당시 동일세대원이 상속받았다면 주택 수에 넣지
                        않습니다(기획재정부 재산세제과-1033). 별도세대에서 상속받았다면 상속개시일로 판정하고 확인이
                        필요하다고 표시합니다.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </ToneCard>
  );
}
