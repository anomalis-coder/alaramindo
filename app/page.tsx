"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Beberapa kota utama Indonesia dengan timezone dan contoh jadwal kasar.
// Di produksi, sebaiknya dihubungkan ke API resmi jadwal sholat/imsak.
const CITIES = [
  {
    id: "jakarta",
    name: "Jakarta & Sekitarnya",
    timezone: "Asia/Jakarta",
  },
  {
    id: "bandung",
    name: "Bandung",
    timezone: "Asia/Jakarta",
  },
  {
    id: "surabaya",
    name: "Surabaya",
    timezone: "Asia/Jakarta",
  },
  {
    id: "makassar",
    name: "Makassar",
    timezone: "Asia/Makassar",
  },
  {
    id: "jayapura",
    name: "Jayapura",
    timezone: "Asia/Jayapura",
  },
] as const;

// Jadwal sangat kasar hanya untuk demo (jam lokal):
// - Sahur/Imsak sekitar 04:30
// - Maghrib/Buka sekitar 18:00
// Anda bisa modifikasi sesuai kebutuhan.
const BASE_SCHEDULE = {
  sahur: { hour: 4, minute: 30 },
  buka: { hour: 18, minute: 0 },
};

type Mode = "sahur" | "buka";

type AlarmState = {
  enabled: boolean;
  mode: Mode;
};

function getNowInTimezone(timezone: string) {
  const now = new Date();
  // Gunakan Intl untuk mendapatkan string waktu di timezone lalu parse kembali.
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now).reduce<Record<string, string>>(
    (acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    },
    {}
  );

  const dateStr = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  return new Date(dateStr);
}

function getNextTargetDate(timezone: string, mode: Mode) {
  const now = getNowInTimezone(timezone);

  const base = BASE_SCHEDULE[mode];
  const target = new Date(now);
  target.setHours(base.hour, base.minute, 0, 0);

  // Jika waktu target sudah lewat hari ini, pindah ke besok
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  return target;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function Home() {
  const [cityId, setCityId] = useState<(typeof CITIES)[number]["id"]>("jakarta");
  const [mode, setMode] = useState<Mode>("sahur");
  const [alarm, setAlarm] = useState<AlarmState>({ enabled: false, mode: "sahur" });
  const [now, setNow] = useState<Date | null>(null);
  const [target, setTarget] = useState<Date | null>(null);
  const [isRinging, setIsRinging] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const city = useMemo(() => CITIES.find((c) => c.id === cityId) ?? CITIES[0], [
    cityId,
  ]);

  // Update waktu real-time
  useEffect(() => {
    const tick = () => {
      setNow(getNowInTimezone(city.timezone));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [city.timezone]);

  // Hitung target setiap pergantian kota atau mode
  useEffect(() => {
    setTarget(getNextTargetDate(city.timezone, mode));
  }, [city.timezone, mode]);

  // Jalankan alarm ketika waktu tercapai
  useEffect(() => {
    if (!alarm.enabled || !now || !target) return;

    const diff = target.getTime() - now.getTime();
    if (diff <= 0 && !isRinging) {
      setIsRinging(true);
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {
          // Beberapa browser butuh interaksi user dulu, abaikan error.
        });
      }
    }
  }, [alarm.enabled, now, target, isRinging]);

  const countdown = useMemo(() => {
    if (!now || !target) return "--:--:--";
    return formatCountdown(target.getTime() - now.getTime());
  }, [now, target]);

  const currentTimeStr = useMemo(() => {
    if (!now) return "--:--:--";
    return formatTime(now);
  }, [now]);

  const handleToggleAlarm = () => {
    if (isRinging) {
      // Matikan alarm ketika sedang berbunyi
      setIsRinging(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      return;
    }

    setAlarm((prev) => ({ enabled: !prev.enabled, mode }));
  };

  const headline = mode === "sahur" ? "Alarm Sahur" : "Alarm Buka Puasa";
  const subHeadline =
    mode === "sahur"
      ? "Bangun tepat waktu untuk sahur dengan alarm yang lantang dan jelas."
      : "Jangan kelewatan waktu berbuka, alarm siap mengingatkan dengan suara besar.";

  const targetLabel = mode === "sahur" ? "Imsak/Sahur berikutnya" : "Maghrib/Buka berikutnya";

  const alarmButtonLabel = isRinging
    ? "Matikan Alarm"
    : alarm.enabled
    ? "Alarm Aktif"
    : "Aktifkan Alarm";

  const alarmButtonStyle = isRinging
    ? "bg-red-600 shadow-[0_0_50px_rgba(248,113,113,0.9)] scale-105"
    : alarm.enabled
    ? "bg-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.8)]"
    : "bg-zinc-800 dark:bg-zinc-100";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center px-4 py-8">
      <audio
        ref={audioRef}
        src="https://cdn.pixabay.com/download/audio/2021/08/09/audio_4f06036f1e.mp3?filename=alarm-clock-short-6402.mp3"
        loop
      />

      <main className="w-full max-w-5xl rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 via-slate-900/70 to-slate-950/90 shadow-2xl shadow-black/60 backdrop-blur-2xl p-6 sm:p-10">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300/80">
              Ramadan Tools
            </p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-white">
              {headline}
            </h1>
            <p className="mt-2 max-w-xl text-sm sm:text-base text-slate-300/80">
              {subHeadline}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 text-right">
            <span className="text-xs font-medium text-slate-400">Zona Waktu</span>
            <select
              className="w-full sm:w-56 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-50 outline-none ring-0 backdrop-blur-md focus:border-emerald-400/80 focus:bg-white/10"
              value={cityId}
              onChange={(e) => setCityId(e.target.value as typeof cityId)}
            >
              {CITIES.map((c) => (
                <option key={c.id} value={c.id} className="bg-slate-900">
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">{city.timezone}</p>
          </div>
        </header>

        {/* Konten Utama */}
        <section className="mt-8 grid gap-6 lg:grid-cols-[1.4fr,1fr] items-stretch">
          {/* Kartu Jam Utama */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 sm:p-8 shadow-xl">
            <div className="pointer-events-none absolute -left-24 -top-24 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -right-16 bottom-4 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />

            <div className="relative flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.3em] text-emerald-300/80">
                  Waktu Sekarang
                </p>
                <p className="mt-2 text-[2.8rem] sm:text-[3.4rem] md:text-[3.8rem] leading-none font-semibold tracking-[0.12em] text-white tabular-nums">
                  {currentTimeStr}
                </p>
                <p className="mt-2 text-xs text-slate-400">{city.name}</p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="inline-flex rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.25em] text-emerald-300/90">
                  {mode === "sahur" ? "Sahur" : "Buka"} Mode
                </div>
                <div className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-[11px] text-slate-300/90">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Jam digital real-time
                </div>
              </div>
            </div>

            {/* Countdown */}
            <div className="relative mt-8 rounded-2xl border border-white/10 bg-black/40 px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400">
                    Hitung Mundur ke {targetLabel}
                  </p>
                  <p className="mt-1 text-sm text-slate-300 max-w-[18rem]">
                    Waktu perkiraan. Sesuaikan kembali dengan jadwal resmi di daerah Anda.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[0.7rem] uppercase tracking-[0.28em] text-emerald-400/90">
                    Sisa Waktu
                  </p>
                  <p className="mt-1 text-2xl sm:text-3xl font-semibold tabular-nums tracking-[0.24em] text-white">
                    {countdown}
                  </p>
                  {target && (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Target: {target.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Panel Kontrol Alarm */}
          <aside className="flex flex-col justify-between gap-6 rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/95 p-5 sm:p-6 shadow-xl">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Kontrol Alarm
              </p>

              {/* Switch Mode */}
              <div className="flex items-center justify-between rounded-2xl bg-white/5 p-2">
                <button
                  type="button"
                  onClick={() => setMode("sahur")}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold tracking-wide transition-all ${
                    mode === "sahur"
                      ? "bg-emerald-500 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.7)]"
                      : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  Sahur
                </button>
                <button
                  type="button"
                  onClick={() => setMode("buka")}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold tracking-wide transition-all ${
                    mode === "buka"
                      ? "bg-amber-400 text-slate-950 shadow-[0_0_20px_rgba(251,191,36,0.7)]"
                      : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  Buka Puasa
                </button>
              </div>

              {/* Info Alarm */}
              <div className="space-y-2 rounded-2xl border border-white/10 bg-black/40 p-3">
                <p className="text-[11px] font-semibold text-slate-200">Status Alarm</p>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        isRinging
                          ? "bg-red-400 animate-ping"
                          : alarm.enabled
                          ? "bg-emerald-400"
                          : "bg-slate-500"
                      }`}
                    />
                    <span>
                      {isRinging
                        ? "Sedang berbunyi"
                        : alarm.enabled
                        ? "Aktif - akan menyala saat waktu tiba"
                        : "Nonaktif"}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-[0.2em]">
                    {mode === "sahur" ? "Sahur" : "Buka"}
                  </span>
                </div>
              </div>

              {/* Peringatan Browser */}
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                Untuk memastikan alarm berbunyi, biarkan halaman ini terbuka dan pastikan volume
                perangkat tidak dimute. Beberapa browser hanya mengizinkan audio setelah ada
                interaksi dari pengguna.
              </p>
            </div>

            {/* Tombol Alarm Besar */}
            <button
              type="button"
              onClick={handleToggleAlarm}
              className={`relative mt-2 flex items-center justify-center overflow-hidden rounded-2xl border border-white/10 px-4 py-5 text-center text-sm font-semibold uppercase tracking-[0.35em] text-white transition-all duration-200 ease-out ${
                alarmButtonStyle
              }`}
            >
              <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(255,255,255,0.16)_0,transparent_55%),radial-gradient(circle_at_100%_100%,rgba(52,211,153,0.4)_0,transparent_55%)] opacity-70" />

              <span className="relative flex flex-col items-center gap-1">
                <span className="text-[0.65rem] tracking-[0.38em] text-white/80">
                  Super Bass Alarm
                </span>
                <span className="text-lg sm:text-xl font-bold tracking-[0.45em]">
                  {alarmButtonLabel}
                </span>
                <span className="mt-1 text-[10px] uppercase tracking-[0.3em] text-white/70">
                  {isRinging ? "Tekan untuk mematikan" : "Tekan untuk mengaktifkan"}
                </span>
              </span>
            </button>
          </aside>
        </section>

        {/* Footer Info */}
        <footer className="mt-8 flex flex-col gap-2 border-t border-white/10 pt-4 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Jadwal jam sahur & buka di sini bersifat perkiraan umum (sahur 04:30, buka 18:00 waktu setempat).
            Untuk ibadah yang lebih tepat, selalu rujuk ke jadwal resmi masjid/instansi berwenang.
          </p>
          <p className="text-[10px] text-slate-600">Mode gelap otomatis berbasis tema sistem.</p>
        </footer>
      </main>
    </div>
  );
}
