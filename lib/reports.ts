/**
 * Shared helpers: build report React elements, render to buffer.
 * Used by both on-demand API endpoints and cron endpoints.
 */
import React from 'react';
import { getAllLoansWithPayments } from '@/lib/firestore/loans';
import { adminDb } from '@/lib/firebase-admin';
import {
  TodaysCollectionSheet, DailyReport, WeeklyReport,
  buildTodayRows, buildDailyReportData, buildWeeklyReportData,
  renderPdfToBuffer,
} from '@/lib/pdf-reports';
import { localDateStr } from '@/lib/calculations';

export async function renderTodayCollectionPdf(targetDate?: string): Promise<{ buffer: Buffer; dateStr: string; rowCount: number }> {
  const dateStr = targetDate || localDateStr(new Date());
  const lps = await getAllLoansWithPayments();
  const rows = buildTodayRows(lps, dateStr);
  const element = React.createElement(TodaysCollectionSheet, { rows, today: new Date(dateStr + 'T00:00:00') });
  const buffer = await renderPdfToBuffer(element);
  return { buffer, dateStr, rowCount: rows.length };
}

export async function renderDailyReportPdf(targetDate?: string): Promise<{ buffer: Buffer; dateStr: string; data: ReturnType<typeof buildDailyReportData> }> {
  const dateStr = targetDate || localDateStr(new Date());
  const lps = await getAllLoansWithPayments();
  const data = buildDailyReportData(lps, dateStr);
  const element = React.createElement(DailyReport, { data });
  const buffer = await renderPdfToBuffer(element);
  return { buffer, dateStr, data };
}

export async function renderWeeklyReportPdf(
  opts?: { weekStart?: string; weekEnd?: string },
): Promise<{ buffer: Buffer; weekStartStr: string; weekEndStr: string; data: ReturnType<typeof buildWeeklyReportData> }> {
  let weekStartStr = opts?.weekStart;
  let weekEndStr = opts?.weekEnd;

  // Default: last 7 days ending today (inclusive)
  if (!weekStartStr || !weekEndStr) {
    const today = new Date();
    const end = new Date(today);
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    weekStartStr = localDateStr(start);
    weekEndStr = localDateStr(end);
  }

  const [lps, customersSnap] = await Promise.all([
    getAllLoansWithPayments(),
    adminDb.collection('customers').get(),
  ]);
  const data = buildWeeklyReportData(lps, weekStartStr, weekEndStr, customersSnap.size);
  const element = React.createElement(WeeklyReport, { data });
  const buffer = await renderPdfToBuffer(element);
  return { buffer, weekStartStr, weekEndStr, data };
}
