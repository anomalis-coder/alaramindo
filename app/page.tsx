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

type AlarmItem = {
  id: string;
  time: string; // "HH:MM"
  enabled: boolean;
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

function getNextTargetDateFromHM(timezone: string, hour: number, minute: number) {
  const now = getNowInTimezone(timezone);
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

function parseHMFromTimeInput(value: string): { hour: number; minute: number } {
  // Expecting format "HH:MM"
  const [h, m] = value.split(":").map((v) => parseInt(v, 10));
  const hour = isNaN(h) ? 0 : Math.max(0, Math.min(23, h));
  const minute = isNaN(m) ? 0 : Math.max(0, Math.min(59, m));
  return { hour, minute };
}

function getNextFromMultiple(timezone: string, alarms: AlarmItem[]): { target: Date | null; idx: number | null } {
  const now = getNowInTimezone(timezone);
  let best: { t: Date; idx: number } | null = null;
  alarms.forEach((a, idx) => {
    if (!a.enabled) return;
    const { hour, minute } = parseHMFromTimeInput(a.time);
    const t = getNextTargetDateFromHM(timezone, hour, minute);
    if (!best || t.getTime() - now.getTime() < best.t.getTime() - now.getTime()) {
      best = { t, idx };
    }
  });
  return best ? { target: best.t, idx: best.idx } : { target: null, idx: null };
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
  const [alarms, setAlarms] = useState<AlarmItem[]>([
    { id: crypto.randomUUID(), time: "04:30", enabled: true },
    { id: crypto.randomUUID(), time: "18:00", enabled: false },
  ]);
  const [newAlarmTime, setNewAlarmTime] = useState("06:00");

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

  // Hitung target setiap perubahan kota, mode, atau daftar alarms
  useEffect(() => {
    // Jika tidak ada alarm enabled, gunakan jadwal mode default agar countdown tetap informatif
    const enabledCount = alarms.filter((a) => a.enabled).length;
    if (enabledCount === 0) {
      const base = BASE_SCHEDULE[mode];
      setTarget(getNextTargetDateFromHM(city.timezone, base.hour, base.minute));
      return;
    }
    const { target: t } = getNextFromMultiple(city.timezone, alarms);
    setTarget(t);
  }, [city.timezone, mode, alarms]);

  // Jalankan alarm ketika waktu tercapai
  useEffect(() => {
    if (!alarm.enabled || !now || !target) return;

    const diff = target.getTime() - now.getTime();
    if (diff <= 0 && !isRinging) {
      setIsRinging(true);
      // Jadwalkan ulang target ke alarm terdekat berikutnya (hari berikutnya untuk jam yang sama)
      const { idx } = getNextFromMultiple(city.timezone, alarms);
      if (idx !== null) {
        const a = alarms[idx];
        const { hour, minute } = parseHMFromTimeInput(a.time);
        const next = getNextTargetDateFromHM(city.timezone, hour, minute);
        next.setDate(next.getDate() + 1);
        setTarget(next);
      }
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {
          // Beberapa browser butuh interaksi user dulu, abaikan error.
        });
      }
    }
  }, [alarm.enabled, now, target, isRinging, alarms, city.timezone]);

  const countdown = useMemo(() => {
    if (!now || !target) return "--:--:--";
    return formatCountdown(target.getTime() - now.getTime());
  }, [now, target]);

  const currentTimeStr = useMemo(() => {
    if (!now) return "--:--:--";
    return formatTime(now);
  }, [now]);

  
  const headline = "Alarm Harian";
  const subHeadline = "Tambahkan beberapa jam alarm harian. Countdown mengarah ke alarm terdekat.";

  const targetLabel = "Alarm berikutnya";

  
  
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

        {/* Konten Utama - Mobile first satu kolom, melebar di layar besar */}
        <section className="mt-6 grid gap-5 md:gap-6 lg:grid-cols-[1.2fr,1fr] items-stretch">
          {/* Kartu Jam Utama */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 sm:p-6 shadow-xl">
            <div className="pointer-events-none absolute -left-24 -top-24 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -right-16 bottom-4 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />

            <div className="relative flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.3em] text-emerald-300/80">
                  Waktu Sekarang
                </p>
                <p className="mt-2 text-[2.6rem] sm:text-[3.2rem] md:text-[3.6rem] leading-none font-semibold tracking-[0.12em] text-white tabular-nums">
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
            <div className="relative mt-6 rounded-2xl border border-white/10 bg-black/40 px-4 py-4 sm:px-5 sm:py-4">
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
          <aside className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/95 p-4 sm:p-5 shadow-xl">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Kontrol Alarm
              </p>

              {/* Form tambah alarm */}
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 p-3">
                <input
                  type="time"
                  step={60}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-50 outline-none focus:border-emerald-400/80"
                  value={newAlarmTime}
                  onChange={(e) => setNewAlarmTime(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newAlarmTime) return;
                    const exists = alarms.some((a) => a.time === newAlarmTime);
                    const id = crypto.randomUUID();
                    setAlarms((prev) =>
                      exists
                        ? prev.map((a) => (a.time === newAlarmTime ? { ...a, enabled: true } : a))
                        : [...prev, { id, time: newAlarmTime, enabled: true }]
                    );
                  }}
                  className="rounded-xl bg-emerald-500 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.6)]"
                >
                  Tambah
                </button>
              </div>

              {/* Daftar alarm */}
              <div className="space-y-2">
                {alarms.length === 0 && (
                  <p className="text-[11px] text-slate-500">Belum ada alarm. Tambahkan jam di atas.</p>
                )}
                {alarms
                  .slice()
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-emerald-500"
                          checked={a.enabled}
                          onChange={(e) =>
                            setAlarms((prev) => prev.map((x) => (x.id === a.id ? { ...x, enabled: e.target.checked } : x)))
                          }
                        />
                        <span className={`text-base font-semibold tabular-nums ${a.enabled ? "text-white" : "text-slate-400"}`}>
                          {a.time}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAlarms((prev) => prev.filter((x) => x.id !== a.id))}
                        className="rounded-lg px-3 py-2 text-[11px] text-slate-300 hover:bg-white/10"
                      >
                        Hapus
                      </button>
                    </div>
                  ))}
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
                    Zona: {city.timezone}
                  </span>
                </div>
              </div>

              {/* Peringatan Browser */}
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                Biarkan halaman ini terbuka dan pastikan volume tidak mute. Beberapa browser
                hanya mengizinkan audio setelah ada interaksi pengguna.
              </p>
            </div>

            {/* Tombol Aksi Besar - mobile friendly */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAlarm((p) => ({ ...p, enabled: !p.enabled }))}
                className={`rounded-2xl border border-white/10 px-3 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.32em] text-white ${
                  alarm.enabled
                    ? "bg-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.7)] text-slate-950"
                    : "bg-zinc-800 dark:bg-zinc-100 text-white"
                }`}
              >
                {alarm.enabled ? "Matikan Semua" : "Aktifkan Semua"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isRinging) {
                    setIsRinging(false);
                    if (audioRef.current) {
                      audioRef.current.pause();
                      audioRef.current.currentTime = 0;
                    }
                  } else {
                    // Nonaktifkan semua alarm terpilih (toggle)
                    setAlarms((prev) => prev.map((a) => ({ ...a, enabled: false })));
                  }
                }}
                className="rounded-2xl border border-white/10 px-3 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.32em] text-white bg-red-600/90 hover:bg-red-600"
              >
                {isRinging ? "Matikan Bunyi" : "Nonaktifkan Daftar"}
              </button>
            </div>
          </aside>
        </section>

        {/* Footer Info */}
        <footer className="mt-6 flex flex-col gap-2 border-t border-white/10 pt-4 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Anda dapat menambahkan beberapa jam alarm. Countdown mengarah ke alarm terdekat sesuai zona waktu.
          </p>
          <p className="text-[10px] text-slate-600">Desain mobile-first, tema gelap mengikuti sistem.</p>
        </footer>
      </main>
    </div>
  );
}
