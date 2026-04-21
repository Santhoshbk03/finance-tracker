import { formatWhatsAppNumber } from '@/lib/calculations';

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const API_URL = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

interface TemplateParam {
  type: 'text';
  text: string;
}

async function sendTemplate(to: string, templateName: string, params: string[]) {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.warn('WhatsApp not configured — skipping message to', to);
    return;
  }

  const formatted = formatWhatsAppNumber(to);
  if (formatted.length < 10) {
    console.warn('Invalid phone number:', to);
    return;
  }

  const body = {
    messaging_product: 'whatsapp',
    to: formatted,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: params.map((text): TemplateParam => ({ type: 'text', text })),
        },
      ],
    },
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error('WhatsApp API error:', err);
  }
}

export async function sendWhatsAppLoanCreated(loan: {
  planType: string;
  principal: number;
  periodAmount: number;
  totalPeriods: number;
  interestAmount: number;
  startDate: string;
  customerPhone?: string;
}, customer: { phone: string }) {
  const template = loan.planType === 'daily' ? 'loan_created_daily' : 'loan_created_weekly';
  const unit = loan.planType === 'daily' ? 'days' : 'weeks';

  // Compute first due date (start + 1 period)
  const start = new Date(loan.startDate + 'T00:00:00');
  const firstDue = new Date(start);
  if (loan.planType === 'daily') {
    firstDue.setDate(start.getDate() + 1);
  } else {
    firstDue.setDate(start.getDate() + 7);
  }
  const firstDueStr = firstDue.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  await sendTemplate(customer.phone, template, [
    `₹${loan.principal.toLocaleString('en-IN')}`,
    `₹${loan.periodAmount.toLocaleString('en-IN')}`,
    `${loan.totalPeriods} ${unit}`,
    `₹${loan.interestAmount.toLocaleString('en-IN')}`,
    firstDueStr,
  ]);
}

export async function sendWhatsAppPaymentReceived(
  loan: { planType: string; customerPhone: string; principal: number },
  paidAmount: number,
  outstanding: number,
  remainingPeriods: number
) {
  const unit = loan.planType === 'daily' ? 'day' : 'week';
  await sendTemplate(loan.customerPhone, 'payment_received', [
    `₹${paidAmount.toLocaleString('en-IN')}`,
    new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    `₹${outstanding.toLocaleString('en-IN')}`,
    `${remainingPeriods}`,
    unit,
  ]);
}

/**
 * Send a PDF document to an admin/user via WhatsApp Cloud API.
 * Uses the document message type (no template needed) — allowed within
 * the 24-hour conversation window once the user has messaged the number,
 * or always if the recipient is the admin who owns the number.
 */
export async function sendWhatsAppDocument(
  to: string,
  documentUrl: string,
  filename: string,
  caption: string,
) {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.warn('WhatsApp not configured — skipping document to', to);
    return { ok: false, reason: 'not-configured' };
  }

  const formatted = formatWhatsAppNumber(to);
  if (formatted.length < 10) {
    console.warn('Invalid phone number:', to);
    return { ok: false, reason: 'invalid-phone' };
  }

  const body = {
    messaging_product: 'whatsapp',
    to: formatted,
    type: 'document',
    document: {
      link: documentUrl,
      filename,
      caption,
    },
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error('WhatsApp document send failed:', err);
    return { ok: false, reason: 'api-error', err };
  }
  return { ok: true };
}

export async function sendWhatsAppReminder(
  customerPhone: string,
  expectedAmount: number,
  dueDate: string,
  periodNumber: number,
  planType: string,
  outstanding: number
) {
  const unit = planType === 'daily' ? 'Day' : 'Week';
  const dueDateStr = new Date(dueDate + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  await sendTemplate(customerPhone, 'payment_reminder', [
    `₹${expectedAmount.toLocaleString('en-IN')}`,
    dueDateStr,
    unit,
    `${periodNumber}`,
    `₹${outstanding.toLocaleString('en-IN')}`,
  ]);
}
