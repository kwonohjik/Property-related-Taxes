"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { userRepository } from "@/lib/storage/user-repository";
import { DateInput } from "@/components/ui/date-input";
import { ClientsSection } from "./ClientsSection";
import type { UserProfile, UserMode } from "@/lib/storage/types";

export function ProfileClient() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [mode, setMode] = useState<UserMode>("taxpayer");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    userRepository.getProfile().then((p) => {
      if (p) {
        setProfile(p);
        setDisplayName(p.displayName);
        setBirthDate(p.birthDate ?? "");
        setMode(p.mode ?? "taxpayer");
      }
      setIsLoading(false);
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) { setError("이름을 입력해 주세요."); return; }
    setError(null);
    setIsSaving(true);
    try {
      const updated = await userRepository.upsertProfile({
        displayName: name,
        birthDate: birthDate || null,
        mode,
      });
      setProfile(updated);
      setSavedAt(new Date().toLocaleTimeString("ko-KR"));
      router.push("/");
    } catch (e) {
      setError("저장에 실패했습니다.");
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSave} className="space-y-6">
        {/* 이름 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">이름</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="계산 이력에 표시될 이름"
            maxLength={50}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* 생년월일 */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">생년월일</label>
          <p className="text-xs text-muted-foreground">
            고령자 세액공제(양도세·종부세) 자동 판정에 활용될 수 있습니다.
          </p>
          <DateInput value={birthDate} onChange={setBirthDate} />
        </div>

        {/* 프로필 모드 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">사용 목적</label>
          <div className="grid grid-cols-2 gap-3">
            {(["taxpayer", "professional"] as const).map((m) => {
              const isSelected = mode === m;
              const label = m === "taxpayer" ? "일반 납세자" : "세무사·대리인";
              const desc =
                m === "taxpayer"
                  ? "본인 세금을 직접 계산·관리"
                  : "의뢰인별 세액 계산·관리";
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={[
                    "rounded-xl border-2 p-4 text-left transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-muted/40",
                  ].join(" ")}
                >
                  <p className={`text-sm font-semibold ${isSelected ? "text-primary" : ""}`}>
                    {label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 에러 */}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* 저장 성공 */}
        {savedAt && !error && (
          <p className="text-sm text-muted-foreground">{savedAt}에 저장되었습니다.</p>
        )}

        {/* 버튼 */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? "저장 중..." : "저장"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors"
          >
            뒤로
          </button>
        </div>

        {/* 저장된 프로필 메타 */}
        {profile && (
          <p className="text-xs text-muted-foreground text-right">
            최초 등록: {new Date(profile.createdAt).toLocaleDateString("ko-KR")}
          </p>
        )}
      </form>

      {/* 세무사 모드: 의뢰인 관리 */}
      {mode === "professional" && <ClientsSection />}
    </div>
  );
}
