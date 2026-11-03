"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Entry = {
  id: string;
  employee: string;
  site: string | null;
  clockIn: string;
  clockOut: string | null;
  hours: number | null;
  status: string;
  clockOutSite?: string | null;
};

type Site = { id: number; name: string; active: boolean };

type CrewMember = {
  name: string;
  is_active: boolean;
  created_at: string;
};

type CrewResponse = { crew: CrewMember[] };

type Activity = {
  key: string;
  kind: "in" | "out";
  employee: string;
  site: string;
  at: number;
};

const HOUR_MS = 3.6e6;

function toTime(value: string): number {
  return new Date(value).getTime();
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date): Date {
  const next = startOfDay(date);
  const offset = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - offset);
  return next;
}

function completedHours(entry: Entry): number {
  if (typeof entry.hours === "number" && Number.isFinite(entry.hours)) {
    return entry.hours;
  }
  if (!entry.clockOut) return 0;
  const start = toTime(entry.clockIn);
  const end = toTime(entry.clockOut);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, (end - start) / HOUR_MS);
}

function elapsedHours(entry: Entry, now: number): number {
  const start = toTime(entry.clockIn);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, (now - start) / HOUR_MS);
}

function isWithin(value: string, start: number, end: number): boolean {
  const time = toTime(value);
  return Number.isFinite(time) && time >= start && time < end;
}

function formatHours(value: number): string {
  return value.toFixed(1);
}

function formatClockTime(value: string): string {
  const time = toTime(value);
  if (!Number.isFinite(time)) return "--";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(time));
}

function formatElapsed(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatRelative(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(at));
}

function dayLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export default function AdminDashboard({
  activeClocks,
  history,
  sites,
}: {
  activeClocks: Entry[];
  history: Entry[];
  sites: Site[];
}) {
  const [now, setNow] = useState(() => Date.now());
  const [crew, setCrew] = useState<CrewMember[] | null>(null);
  const [crewError, setCrewError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api<CrewResponse>("/api/crew").then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setCrew(result.data.crew ?? []);
      } else {
        setCrewError(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const crewNames = useMemo(() => {
    if (!crew) return null;
    const active: string[] = [];
    const inactive: string[] = [];
    for (const member of crew) {
      if (member.is_active) active.push(member.name);
      else inactive.push(member.name);
    }
    return { active, inactive };
  }, [crew]);

  const metrics = useMemo(() => {
    const nowDate = new Date(now);
    const todayStartDate = startOfDay(nowDate);
    const todayStart = todayStartDate.getTime();
    const todayEnd = addDays(todayStartDate, 1).getTime();
    const weekStartDate = startOfWeek(nowDate);
    const weekStart = weekStartDate.getTime();
    const weekEnd = addDays(weekStartDate, 7).getTime();

    let todayHours = 0;
    let weekHours = 0;
    let pendingApprovals = 0;
    const byEmployee = new Map<string, number>();
    const bySite = new Map<string, { hours: number; shifts: number }>();

    for (const entry of history) {
      if (entry.status === "rejected") continue;
      if (entry.status === "pending") pendingApprovals += 1;

      const hours = completedHours(entry);
      const time = toTime(entry.clockIn);
      if (!Number.isFinite(time)) continue;

      if (time >= todayStart && time < todayEnd) todayHours += hours;

      if (time >= weekStart && time < weekEnd) {
        weekHours += hours;

        byEmployee.set(
          entry.employee,
          (byEmployee.get(entry.employee) ?? 0) + hours
        );

        const site = entry.site || "Unassigned";
        const current = bySite.get(site) ?? { hours: 0, shifts: 0 };
        current.hours += hours;
        current.shifts += 1;
        bySite.set(site, current);
      }
    }

    for (const entry of activeClocks) {
      const time = toTime(entry.clockIn);
      if (!Number.isFinite(time)) continue;

      const hours = elapsedHours(entry, now);
      if (time >= todayStart && time < todayEnd) todayHours += hours;

      if (time >= weekStart && time < weekEnd) {
        weekHours += hours;

        byEmployee.set(
          entry.employee,
          (byEmployee.get(entry.employee) ?? 0) + hours
        );

        const site = entry.site || "Unassigned";
        const current = bySite.get(site) ?? { hours: 0, shifts: 0 };
        current.hours += hours;
        current.shifts += 1;
        bySite.set(site, current);
      }
    }

    const weeklyByEmployee = Array.from(byEmployee, ([name, hours]) => ({
      name,
      hours,
    }))
      .filter((row) => row.hours > 0)
      .sort((a, b) => b.hours - a.hours);

    const onSite = new Map<string, number>();
    for (const entry of activeClocks) {
      const site = entry.site || "Unassigned";
      onSite.set(site, (onSite.get(site) ?? 0) + 1);
    }

    const siteBreakdown = Array.from(bySite, ([site, value]) => ({
      site,
      hours: value.hours,
      shifts: value.shifts,
      onSite: onSite.get(site) ?? 0,
    })).sort((a, b) => b.hours - a.hours);

    const last7 = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(todayStartDate, index - 6);
      const start = date.getTime();
      const end = addDays(date, 1).getTime();
      let hours = 0;

      for (const entry of history) {
        if (entry.status === "rejected") continue;
        if (isWithin(entry.clockIn, start, end)) {
          hours += completedHours(entry);
        }
      }

      for (const entry of activeClocks) {
        if (isWithin(entry.clockIn, start, end)) {
          hours += elapsedHours(entry, now);
        }
      }

      return { key: dayKey(date), label: dayLabel(date), hours };
    });

    const activity: Activity[] = [];
    const seenClockIns = new Set<string>();

    for (const entry of activeClocks) {
      if (seenClockIns.has(entry.id)) continue;
      seenClockIns.add(entry.id);
      const at = toTime(entry.clockIn);
      if (!Number.isFinite(at)) continue;
      activity.push({
        key: `in-${entry.id}`,
        kind: "in",
        employee: entry.employee,
        site: entry.site || "Unassigned",
        at,
      });
    }

    for (const entry of history) {
      const at = toTime(entry.clockIn);
      if (!seenClockIns.has(entry.id) && Number.isFinite(at)) {
        seenClockIns.add(entry.id);
        activity.push({
          key: `in-${entry.id}`,
          kind: "in",
          employee: entry.employee,
          site: entry.site || "Unassigned",
          at,
        });
      }

      if (entry.clockOut) {
        const end = toTime(entry.clockOut);
        if (Number.isFinite(end)) {
          activity.push({
            key: `out-${entry.id}`,
            kind: "out",
            employee: entry.employee,
            site: entry.clockOutSite || entry.site || "Unassigned",
            at: end,
          });
        }
      }
    }

    activity.sort((a, b) => b.at - a.at);

    return {
      todayHours,
      weekHours,
      pendingApprovals,
      weeklyByEmployee,
      siteBreakdown,
      last7,
      activity: activity.slice(0, 12),
    };
  }, [activeClocks, history, now]);

  const weeklyMax = useMemo(
    () =>
      metrics.weeklyByEmployee.reduce(
        (max, row) => Math.max(max, row.hours),
        0
      ),
    [metrics.weeklyByEmployee]
  );

  const last7Max = useMemo(
    () => metrics.last7.reduce((max, day) => Math.max(max, day.hours), 0),
    [metrics.last7]
  );

  const activeSiteCount = useMemo(
    () => sites.filter((site) => site.active).length,
    [sites]
  );
  const inactiveSiteCount = sites.length - activeSiteCount;

  const crewValue = crewError
    ? "n/a"
    : crewNames
      ? `${crewNames.active.length} active / ${crewNames.inactive.length} inactive`
      : "...";

  return (
    <div className="space-y-4 text-sm text-zinc-900">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Signed in now</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {activeClocks.length}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Hours today</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatHours(metrics.todayHours)}h
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Hours this week</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatHours(metrics.weekHours)}h
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Pending approvals</CardDescription>
            <CardTitle
              className={`text-2xl tabular-nums ${
                metrics.pendingApprovals > 0 ? "text-red-600" : ""
              }`}
            >
              {metrics.pendingApprovals}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Active crew</CardDescription>
            <CardTitle className="text-lg tabular-nums">{crewValue}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Currently signed in</CardTitle>
            <CardDescription>
              {activeClocks.length === 0
                ? "Nobody is signed in right now."
                : `${activeClocks.length} on the clock`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeClocks.length === 0 ? (
              <p className="py-4 text-zinc-500">
                Nobody is signed in right now.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {activeClocks.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-500"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-zinc-900">
                        {entry.employee}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {entry.site || "Unassigned"} since{" "}
                        {formatClockTime(entry.clockIn)}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums text-zinc-600">
                      {formatElapsed(now - toTime(entry.clockIn))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly hours by employee</CardTitle>
            <CardDescription>Monday through today, active time included</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.weeklyByEmployee.length === 0 ? (
              <p className="py-4 text-zinc-500">No hours logged this week.</p>
            ) : (
              <div className="space-y-3">
                {metrics.weeklyByEmployee.map((row) => {
                  const width =
                    weeklyMax > 0 ? (row.hours / weeklyMax) * 100 : 0;
                  const over = row.hours > 40;
                  return (
                    <div key={row.name}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-zinc-700">
                          {row.name}
                        </span>
                        <span
                          className={`shrink-0 tabular-nums ${
                            over ? "font-medium text-amber-600" : "text-zinc-500"
                          }`}
                        >
                          {formatHours(row.hours)}h
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className={`h-full rounded-full ${
                            over ? "bg-amber-500" : "bg-zinc-800"
                          }`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Last 7 days</CardTitle>
            <CardDescription>Total hours per day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-2">
              {metrics.last7.map((day) => {
                const height =
                  last7Max > 0 ? (day.hours / last7Max) * 100 : 0;
                return (
                  <div
                    key={day.key}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                  >
                    <span className="text-[10px] tabular-nums text-zinc-500">
                      {formatHours(day.hours)}
                    </span>
                    <div className="flex h-28 w-full items-end">
                      <div
                        className="w-full rounded-t bg-zinc-800"
                        style={{
                          height: `${height}%`,
                          minHeight: day.hours > 0 ? 2 : 0,
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-zinc-500">
                      {day.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Job site breakdown</CardTitle>
            <CardDescription>
              {activeSiteCount} active / {inactiveSiteCount} inactive sites
            </CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.siteBreakdown.length === 0 ? (
              <p className="py-4 text-zinc-500">No site hours logged this week.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Shifts</TableHead>
                    <TableHead className="text-right">On site</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.siteBreakdown.map((row) => (
                    <TableRow key={row.site}>
                      <TableCell className="max-w-[12rem] truncate font-medium">
                        {row.site}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatHours(row.hours)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.shifts}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.onSite > 0 ? (
                          <Badge className="bg-emerald-50 text-emerald-700">
                            {row.onSite}
                          </Badge>
                        ) : (
                          <span className="text-zinc-400">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Clock in and clock out events</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.activity.length === 0 ? (
              <p className="py-4 text-zinc-500">No recent activity.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead className="text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.activity.map((event) => (
                    <TableRow key={event.key}>
                      <TableCell>
                        <Badge
                          className={
                            event.kind === "in"
                              ? "bg-zinc-900 text-white"
                              : "border-zinc-200 bg-white text-zinc-600"
                          }
                        >
                          {event.kind === "in" ? "Signed in" : "Signed out"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[9rem] truncate font-medium">
                        {event.employee}
                      </TableCell>
                      <TableCell className="max-w-[9rem] truncate text-zinc-500">
                        {event.site}
                      </TableCell>
                      <TableCell className="text-right text-zinc-500">
                        {formatRelative(event.at, now)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Crew</CardTitle>
            <CardDescription>
              {crewError
                ? "Crew list unavailable."
                : crewNames
                  ? `${crewNames.active.length} active, ${crewNames.inactive.length} inactive`
                  : "Loading crew."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {crewNames ? (
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex-1">
                  <p className="mb-2 text-xs font-medium text-zinc-500">
                    Active
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {crewNames.active.length === 0 ? (
                      <span className="text-zinc-400">None</span>
                    ) : (
                      crewNames.active.map((name) => (
                        <Badge
                          key={name}
                          className="bg-zinc-100 text-zinc-700"
                        >
                          {name}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                <Separator
                  orientation="vertical"
                  className="hidden sm:block"
                />
                <div className="flex-1">
                  <p className="mb-2 text-xs font-medium text-zinc-500">
                    Inactive
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {crewNames.inactive.length === 0 ? (
                      <span className="text-zinc-400">None</span>
                    ) : (
                      crewNames.inactive.map((name) => (
                        <Badge
                          key={name}
                          className="border-zinc-200 bg-white text-zinc-500"
                        >
                          {name}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-4 text-zinc-500">
                {crewError ? "Crew list unavailable." : "Loading crew."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
