"use client";

/**
 * PresaleRightsSection — 세대 보유 분양권·입주권 입력 (다주택 중과 주택 수 산입)
 *
 * 소령 §167의11·§167의3①: 2021.1.1 이후 취득한 분양권·조합원입주권은 주택 수에 포함.
 * 항목별 3필드(종류·취득일·지역)뿐이므로 모달 없이 인라인 편집.
 *
 * 정책: RadioCardGroup/DateInput 전용 · useEffect→store 미러링 금지(onChange 직접 set).
 */

import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { AddressSearch } from "@/components/ui/address-search";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-store";

interface Props {
  rights: PresaleRightEntry[];
  onChange: (rights: PresaleRightEntry[]) => void;
  /** #2b 혼인합가일 입력 시 "배우자 단독 보유" chip 노출 (§167의4⑤) */
  showSpouseOwned?: boolean;
}

export function PresaleRightsSection({ rights, onChange, showSpouseOwned }: Props) {
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
        2021.1.1 이후 취득한 분양권·조합원입주권은 주택 수 산정에 포함됩니다 (소령 §167의11).
      </p>

      {rights.length === 0 ? (
        <p className="text-caption text-muted-foreground/70">없음</p>
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
                  onChange={(v) => update(r.id, { type: v as PresaleRightEntry["type"] })}
                  options={[
                    { value: "presale_right", label: "분양권" },
                    { value: "redevelopment_right", label: "조합원입주권" },
                  ]}
                />
              </div>
              <div className="space-y-1">
                <span className="block text-caption text-muted-foreground font-medium">취득일</span>
                <DateInput
                  value={r.acquisitionDate}
                  onChange={(v) => update(r.id, { acquisitionDate: v })}
                />
              </div>
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
                  onChange={(v) =>
                    update(r.id, {
                      regionCode: v.pnu && v.pnu.length >= 10 ? v.pnu.slice(0, 10) : r.regionCode,
                      regionName: v.jibun || v.road || r.regionName,
                    })
                  }
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </ToneCard>
  );
}
