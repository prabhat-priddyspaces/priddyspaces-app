"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Camera,
  CheckCircle2,
  DoorOpen,
  IdCard,
  Loader2,
  QrCode,
  RefreshCw,
  Search,
  UserRoundCheck,
  Users,
  XCircle,
} from "lucide-react";

import { AdminShell } from "@/components/admin-shell";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useApiToken } from "@/hooks/useApiToken";
import {
  checkInAccessPass,
  checkOutAccessPass,
  extractAccessPassToken,
  listAccessPasses,
  listAttendance,
  listAttendanceLocations,
  listCurrentAttendance,
  listMemberDirectory,
  resolveAccessPass,
  resolveGuestAccessPass,
  type AccessPass,
  type AccessPassResolve,
  type AttendanceFilters,
  type AttendanceLocation,
  type AttendanceRecord,
  type MemberDirectoryItem,
} from "@/lib/access-passes";
import { cn } from "@/lib/utils";

type ShellKind = "owner" | "admin";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function titleize(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function passBadgeVariant(status: string): "success" | "warning" | "danger" | "info" | "default" {
  if (status === "valid" || status === "already_checked_in") return "success";
  if (status === "not_yet_valid") return "warning";
  if (["expired", "cancelled", "invalid", "checked_out"].includes(status)) return "danger";
  return "default";
}

function attendanceBadgeVariant(status: string): "success" | "warning" | "danger" | "default" {
  if (status === "checked_in") return "success";
  if (status === "checked_out") return "default";
  if (status === "not_checked_in") return "warning";
  return "default";
}

function Shell({
  kind,
  title,
  breadcrumb,
  children,
}: {
  kind: ShellKind;
  title: string;
  breadcrumb?: string[];
  children: React.ReactNode;
}) {
  if (kind === "admin") {
    return (
      <AdminShell title={title} breadcrumb={breadcrumb}>
        {children}
      </AdminShell>
    );
  }
  return (
    <AppShell title={title} breadcrumb={breadcrumb}>
      {children}
    </AppShell>
  );
}

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">{message}</div>;
}

function LoadingState({ label = "Loading access-pass data..." }: { label?: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center gap-2 text-sm text-text-3">
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof QrCode;
  title: string;
  body: string;
}) {
  return (
    <Card className="flex min-h-[220px] flex-col items-center justify-center text-center">
      <Icon size={34} className="text-text-4" />
      <div className="mt-3 text-[15px] font-semibold text-text">{title}</div>
      <p className="mt-1 max-w-md text-sm text-text-3">{body}</p>
    </Card>
  );
}

function PassQr({ value, className }: { value: string; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-lg border border-line bg-white p-3", className)} data-testid="access-pass-qr">
      <QRCodeSVG value={value} size={176} includeMargin />
    </div>
  );
}

function PassDetails({ pass }: { pass: AccessPass }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[17px] font-semibold text-text">{pass.space_name || titleize(pass.space_type)}</h3>
        <Badge variant={passBadgeVariant(pass.pass_status)}>{titleize(pass.pass_status)}</Badge>
      </div>
      <div className="mt-1 text-sm text-text-3">{pass.location_name}</div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-text-4">Space type</dt>
          <dd className="font-medium text-text">{titleize(pass.space_type)}</dd>
        </div>
        <div>
          <dt className="text-text-4">Booking ID</dt>
          <dd className="font-medium text-text">{pass.booking_public_id}</dd>
        </div>
        <div>
          <dt className="text-text-4">Starts</dt>
          <dd className="font-medium text-text">{formatDateTime(pass.start_datetime)}</dd>
        </div>
        <div>
          <dt className="text-text-4">Ends</dt>
          <dd className="font-medium text-text">{formatDateTime(pass.end_datetime)}</dd>
        </div>
      </dl>
    </div>
  );
}

function AccessPassCard({ pass, focused = false }: { pass: AccessPass; focused?: boolean }) {
  return (
    <Card className={cn("flex flex-col gap-5 md:flex-row md:items-center", focused && "border-brand/30 bg-brand-soft/30")}>
      <PassQr value={pass.qr_payload} />
      <PassDetails pass={pass} />
    </Card>
  );
}

export function MemberAccessPassesPage({ focused = false }: { focused?: boolean }) {
  const { getApiToken, isAuthReady } = useApiToken();
  const [passes, setPasses] = useState<AccessPass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthReady) return;
    setLoading(true);
    setError(null);
    try {
      const token = (await getApiToken()) ?? undefined;
      const data = await listAccessPasses(token);
      setPasses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load access passes");
    } finally {
      setLoading(false);
    }
  }, [getApiToken, isAuthReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const visiblePasses = focused ? passes.slice(0, 1) : passes;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-text">
            {focused ? "My Space QR" : "Access Passes"}
          </h1>
          <p className="text-sm text-text-3">
            {focused ? "Use this QR for your next confirmed booking." : "Confirmed bookings show secure QR passes here."}
          </p>
        </div>
        <Button type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} />
          Refresh
        </Button>
      </div>
      <ErrorText message={error} />
      {loading ? <LoadingState label="Loading passes..." /> : null}
      {!loading && visiblePasses.length === 0 ? (
        <EmptyState
          icon={QrCode}
          title="No valid access passes"
          body="When a booking is confirmed, your secure QR access pass will appear here until the booking window expires."
        />
      ) : null}
      <div className="grid gap-4">
        {visiblePasses.map((pass) => (
          <AccessPassCard key={pass.public_id} pass={pass} focused={focused} />
        ))}
      </div>
    </div>
  );
}

export function MemberDirectoryPage() {
  const { getApiToken, isAuthReady } = useApiToken();
  const [rows, setRows] = useState<MemberDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthReady) return;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = (await getApiToken()) ?? undefined;
        setRows(await listMemberDirectory(token));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load member directory");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [getApiToken, isAuthReady]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Member Directory</h1>
        <p className="text-sm text-text-3">Members recently or actively associated with your locations.</p>
      </div>
      <ErrorText message={error} />
      {loading ? <LoadingState label="Loading directory..." /> : null}
      {!loading && rows.length === 0 ? (
        <EmptyState icon={Users} title="No members found" body="Directory entries appear after other members have active memberships or recent confirmed bookings at your locations." />
      ) : null}
      <div className="grid gap-3">
        {rows.map((row) => (
          <Card key={`${row.member_public_id}-${row.location_public_id}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold text-text">{row.name || row.email}</div>
              <div className="text-sm text-text-3">{row.email}</div>
            </div>
            <div className="text-sm text-text-2 sm:text-right">
              <div>{row.location_name}</div>
              <div className="text-text-3">{row.space_name || titleize(row.space_type)} · {titleize(row.space_type)}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ResolvePanel({ result }: { result: AccessPassResolve | null }) {
  if (!result) {
    return (
      <Card className="min-h-[280px]">
        <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
          <IdCard size={34} className="text-text-4" />
          <div className="mt-3 text-[15px] font-semibold text-text">No pass selected</div>
          <p className="mt-1 max-w-sm text-sm text-text-3">Scan a member QR code or paste a token to see access status.</p>
        </div>
      </Card>
    );
  }
  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-text">{result.member_name || result.member_email || "Member"}</h2>
        <Badge variant={passBadgeVariant(result.pass_status)}>{titleize(result.pass_status)}</Badge>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-text-4">Email</dt>
          <dd className="font-medium text-text">{result.member_email || "Not available"}</dd>
        </div>
        <div>
          <dt className="text-text-4">Booking ID</dt>
          <dd className="font-medium text-text">{result.booking_public_id || "Not available"}</dd>
        </div>
        <div>
          <dt className="text-text-4">Location</dt>
          <dd className="font-medium text-text">{result.location_name || "Not available"}</dd>
        </div>
        <div>
          <dt className="text-text-4">Space</dt>
          <dd className="font-medium text-text">{result.space_name || titleize(result.space_type)}</dd>
        </div>
        <div>
          <dt className="text-text-4">Starts</dt>
          <dd className="font-medium text-text">{formatDateTime(result.start_datetime)}</dd>
        </div>
        <div>
          <dt className="text-text-4">Ends</dt>
          <dd className="font-medium text-text">{formatDateTime(result.end_datetime)}</dd>
        </div>
        <div>
          <dt className="text-text-4">Checked in</dt>
          <dd className="font-medium text-text">{formatDateTime(result.checked_in_at)}</dd>
        </div>
        <div>
          <dt className="text-text-4">Checked out</dt>
          <dd className="font-medium text-text">{formatDateTime(result.checked_out_at)}</dd>
        </div>
      </dl>
    </Card>
  );
}

export function AccessScannerPage({ shell }: { shell: ShellKind }) {
  const { getApiToken, isAuthReady } = useApiToken();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [rawToken, setRawToken] = useState("");
  const [activeToken, setActiveToken] = useState("");
  const [result, setResult] = useState<AccessPassResolve | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [scanPaused, setScanPaused] = useState(false);
  const [busy, setBusy] = useState(false);

  const resolveToken = useCallback(
    async (value: string) => {
      const tokenValue = extractAccessPassToken(value);
      if (!tokenValue || !isAuthReady) return;
      setBusy(true);
      setMessage(null);
      try {
        const token = (await getApiToken()) ?? undefined;
        const data = await resolveAccessPass(tokenValue, token);
        setActiveToken(tokenValue);
        setRawToken(tokenValue);
        setResult(data);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Unable to resolve access pass");
      } finally {
        setBusy(false);
      }
    },
    [getApiToken, isAuthReady],
  );

  useEffect(() => {
    if (!cameraActive || scanPaused || !videoRef.current) return;
    let stopped = false;
    let stopScanner: (() => void) | null = null;
    async function startScanner() {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (scanResult, _error, controlsRef) => {
          const text = scanResult?.getText();
          if (!text || stopped) return;
          setScanPaused(true);
          setCameraActive(false);
          controlsRef.stop();
          void resolveToken(text);
        });
        stopScanner = () => controls.stop();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Camera scanner unavailable");
        setCameraActive(false);
      }
    }
    void startScanner();
    return () => {
      stopped = true;
      stopScanner?.();
    };
  }, [cameraActive, resolveToken, scanPaused]);

  async function checkIn() {
    if (!activeToken) return;
    setBusy(true);
    setMessage(null);
    try {
      const token = (await getApiToken()) ?? undefined;
      setResult(await checkInAccessPass(activeToken, token));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to check in");
    } finally {
      setBusy(false);
    }
  }

  async function checkOut() {
    if (!activeToken) return;
    setBusy(true);
    setMessage(null);
    try {
      const token = (await getApiToken()) ?? undefined;
      setResult(await checkOutAccessPass(activeToken, token));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to check out");
    } finally {
      setBusy(false);
    }
  }

  const content = (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Access Scanner</h1>
        <p className="text-sm text-text-3">Scan or paste a secure access-pass token to validate a booking.</p>
      </div>
      <ErrorText message={message} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={cameraActive ? "outline-danger" : "primary"}
              onClick={() => {
                setMessage(null);
                setScanPaused(false);
                setCameraActive((current) => !current);
              }}
            >
              {cameraActive ? <XCircle size={15} /> : <Camera size={15} />}
              {cameraActive ? "Stop camera" : "Start camera"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setScanPaused(false);
                setResult(null);
                setActiveToken("");
                setRawToken("");
              }}
            >
              <RefreshCw size={15} />
              Reset
            </Button>
          </div>
          <div className="overflow-hidden rounded-lg border border-line bg-black">
            <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline data-testid="access-scanner-video" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-text-4" htmlFor="access-token-input">
              Manual token
            </label>
            <div className="flex gap-2">
              <Input
                id="access-token-input"
                value={rawToken}
                onChange={(event) => setRawToken(event.target.value)}
                placeholder="Paste QR URL or token"
              />
              <Button type="button" onClick={() => void resolveToken(rawToken)} disabled={busy || !rawToken.trim()}>
                <Search size={15} />
                Resolve
              </Button>
            </div>
          </div>
        </Card>
        <div className="space-y-4">
          <ResolvePanel result={result} />
          {result ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="primary" onClick={() => void checkIn()} disabled={busy || !result.can_check_in}>
                <UserRoundCheck size={15} />
                Check in
              </Button>
              <Button type="button" onClick={() => void checkOut()} disabled={busy || !result.can_check_out}>
                <DoorOpen size={15} />
                Check out
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return <Shell kind={shell} title="Access Scanner" breadcrumb={[shell === "admin" ? "Platform" : "Owner", "Operations"]}>{content}</Shell>;
}

function attendanceStatusOptions() {
  return [
    ["", "Any status"],
    ["checked_in", "Checked in"],
    ["checked_out", "Checked out"],
  ] as const;
}

function spaceTypeOptions() {
  return [
    ["", "Any space type"],
    ["conference_room", "Conference room"],
    ["private_office", "Private office"],
    ["shared_desk", "Shared desk"],
    ["suite", "Suite"],
    ["virtual_office", "Virtual office"],
  ] as const;
}

function AttendanceTable({ rows }: { rows: AttendanceRecord[] }) {
  if (rows.length === 0) {
    return <EmptyState icon={CheckCircle2} title="No attendance records" body="Adjust filters or check in a member to populate this view." />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="min-w-full divide-y divide-line text-sm">
        <thead className="bg-surface-2 text-left text-xs uppercase tracking-[0.08em] text-text-4">
          <tr>
            <th className="px-3 py-2">Member</th>
            <th className="px-3 py-2">Location</th>
            <th className="px-3 py-2">Space</th>
            <th className="px-3 py-2">Booking window</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Scanned by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={`${row.booking_public_id}-${row.status}`}>
              <td className="px-3 py-3">
                <div className="font-medium text-text">{row.member_name || row.member_email}</div>
                <div className="text-text-3">{row.member_email}</div>
              </td>
              <td className="px-3 py-3 text-text-2">{row.location_name}</td>
              <td className="px-3 py-3 text-text-2">{row.space_name || titleize(row.space_type)}</td>
              <td className="px-3 py-3 text-text-2">{formatDateTime(row.start_datetime)} to {formatDateTime(row.end_datetime)}</td>
              <td className="px-3 py-3">
                <Badge variant={attendanceBadgeVariant(row.status)}>{titleize(row.status)}</Badge>
              </td>
              <td className="px-3 py-3 text-text-2">{row.scanned_by_name || "Not scanned"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AttendancePage({ shell }: { shell: ShellKind }) {
  const { getApiToken, isAuthReady } = useApiToken();
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [currentRows, setCurrentRows] = useState<AttendanceRecord[]>([]);
  const [locations, setLocations] = useState<AttendanceLocation[]>([]);
  const [filters, setFilters] = useState<AttendanceFilters>({ page: 1, page_size: 100 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthReady) return;
    setLoading(true);
    setError(null);
    try {
      const token = (await getApiToken()) ?? undefined;
      const [attendance, current, locationOptions] = await Promise.all([
        listAttendance(filters, token),
        listCurrentAttendance(filters.location_public_id, token),
        listAttendanceLocations(token),
      ]);
      setRows(attendance.results);
      setTotal(attendance.total);
      setCurrentRows(current);
      setLocations(locationOptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [filters, getApiToken, isAuthReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const content = (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Attendance</h1>
          <p className="text-sm text-text-3">Track checked-in members and recent office activity.</p>
        </div>
        <Button type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} />
          Refresh
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-sm text-text-3">Currently in office</div>
          <div className="mt-1 text-2xl font-semibold text-text">{currentRows.length}</div>
          <div className="mt-3 space-y-1 text-xs text-text-3">
            {currentRows.length === 0 ? <div>No one is currently checked in.</div> : null}
            {currentRows.slice(0, 3).map((row) => (
              <div key={row.booking_public_id} className="truncate">
                {row.member_name || row.member_email} · {row.location_name}
              </div>
            ))}
            {currentRows.length > 3 ? <div>+{currentRows.length - 3} more</div> : null}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-text-3">Filtered records</div>
          <div className="mt-1 text-2xl font-semibold text-text">{total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-text-3">Checked out</div>
          <div className="mt-1 text-2xl font-semibold text-text">{rows.filter((row) => row.status === "checked_out").length}</div>
        </Card>
      </div>
      <Card className="grid gap-3 p-4 md:grid-cols-3 lg:grid-cols-6">
        <select
          value={filters.location_public_id || ""}
          onChange={(event) => setFilters((current) => ({ ...current, location_public_id: event.target.value }))}
          className="h-9 rounded-xl border border-line-strong bg-surface px-3 text-[13px] text-text outline-none"
        >
          <option value="">All locations</option>
          {locations.map((location) => (
            <option key={location.location_public_id} value={location.location_public_id}>
              {location.location_name}
            </option>
          ))}
        </select>
        <Input
          type="date"
          value={filters.date || ""}
          onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}
        />
        <select
          value={filters.space_type || ""}
          onChange={(event) => setFilters((current) => ({ ...current, space_type: event.target.value }))}
          className="h-9 rounded-xl border border-line-strong bg-surface px-3 text-[13px] text-text outline-none"
        >
          {spaceTypeOptions().map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select
          value={filters.status || ""}
          onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          className="h-9 rounded-xl border border-line-strong bg-surface px-3 text-[13px] text-text outline-none"
        >
          {attendanceStatusOptions().map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <Input
          value={filters.search || ""}
          onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          placeholder="Member search"
        />
        <label className="flex h-9 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 text-[13px] text-text">
          <input
            type="checkbox"
            checked={Boolean(filters.currently_in_office)}
            onChange={(event) => setFilters((current) => ({ ...current, currently_in_office: event.target.checked }))}
          />
          In office
        </label>
      </Card>
      <ErrorText message={error} />
      {loading ? <LoadingState label="Loading attendance..." /> : <AttendanceTable rows={rows} />}
    </div>
  );

  return <Shell kind={shell} title="Attendance" breadcrumb={[shell === "admin" ? "Platform" : "Owner", "Operations"]}>{content}</Shell>;
}

export function GuestAccessPassPage() {
  const [rawToken, setRawToken] = useState("");
  const [pass, setPass] = useState<AccessPass | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const tokenFromHash = useMemo(() => {
    if (typeof window === "undefined") return "";
    return extractAccessPassToken(window.location.href);
  }, []);

  useEffect(() => {
    const initial = tokenFromHash;
    if (!initial) return;
    setRawToken(initial);
    setLoading(true);
    resolveGuestAccessPass(initial)
      .then(setPass)
      .catch((err) => setError(err instanceof Error ? err.message : "Access pass not found"))
      .finally(() => setLoading(false));
  }, [tokenFromHash]);

  async function resolve() {
    setLoading(true);
    setError(null);
    try {
      setPass(await resolveGuestAccessPass(rawToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Access pass not found");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-bg px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text">Guest Access Pass</h1>
          <p className="text-sm text-text-3">Use the QR code from your confirmed booking email at reception.</p>
        </div>
        <Card className="space-y-3">
          <Input value={rawToken} onChange={(event) => setRawToken(event.target.value)} placeholder="Paste access pass link or token" />
          <Button type="button" onClick={() => void resolve()} disabled={loading || !rawToken.trim()}>
            Resolve pass
          </Button>
        </Card>
        <ErrorText message={error} />
        {loading ? <LoadingState label="Loading pass..." /> : null}
        {pass && ["not_yet_valid", "valid", "already_checked_in"].includes(pass.pass_status) ? (
          <AccessPassCard pass={pass} focused />
        ) : null}
        {pass && !["not_yet_valid", "valid", "already_checked_in"].includes(pass.pass_status) ? (
          <Card className="space-y-4">
            <div>
              <Badge variant={passBadgeVariant(pass.pass_status)}>{titleize(pass.pass_status)}</Badge>
              <p className="mt-2 text-sm text-text-3">This access pass can no longer be used at reception.</p>
            </div>
            <PassDetails pass={pass} />
          </Card>
        ) : null}
      </div>
    </main>
  );
}
