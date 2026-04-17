/**
 * Generates a compliance PDF report by creating a printable HTML document
 * and triggering the browser's print dialog.
 *
 * This approach avoids adding heavy PDF libraries (jsPDF, pdfmake)
 * while still providing a professional compliance report output.
 */

export interface ComplianceReportData {
  workspaceName: string;
  generatedAt: string;
  totalFindings: number;
  criticalHighCount: number;
  complianceScore: string;
  tenantCount: number;
  findings: Array<{
    checkSlug: string;
    severity: string;
    status: string;
    firstSeenAt: string;
    lastSeenAt: string;
  }>;
  recentScans: Array<{
    tenantId: string;
    status: string;
    checksRun: number;
    checksFailed: number;
    createdAt: string;
  }>;
}

export function generateCompliancePdf(data: ComplianceReportData): void {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Watchtower Compliance Report — ${escapeHtml(data.workspaceName)}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; padding: 40px; font-size: 12px; }
        .header { border-bottom: 2px solid #1a1a2e; padding-bottom: 16px; margin-bottom: 24px; }
        .header h1 { font-size: 24px; font-weight: 700; }
        .header p { color: #6b7280; margin-top: 4px; }
        .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
        .metric { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
        .metric .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
        .metric .value { font-size: 28px; font-weight: 700; margin-top: 4px; font-family: 'SF Mono', 'Fira Code', monospace; }
        h2 { font-size: 16px; margin-bottom: 12px; color: #1a1a2e; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
        th { text-align: left; padding: 8px 12px; background: #f3f4f6; border-bottom: 1px solid #e5e7eb; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
        td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
        .mono { font-family: 'SF Mono', 'Fira Code', monospace; }
        .severity-critical { color: #ef4444; font-weight: 600; }
        .severity-high { color: #f59e0b; font-weight: 600; }
        .severity-medium { color: #eab308; }
        .severity-low { color: #06b6d4; }
        .severity-info { color: #94a3b8; }
        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Watchtower Compliance Report</h1>
        <p>${escapeHtml(data.workspaceName)} — Generated ${escapeHtml(data.generatedAt)}</p>
      </div>

      <div class="metrics">
        <div class="metric">
          <div class="label">Total Findings</div>
          <div class="value">${data.totalFindings}</div>
        </div>
        <div class="metric">
          <div class="label">Critical / High</div>
          <div class="value">${data.criticalHighCount}</div>
        </div>
        <div class="metric">
          <div class="label">Tenants</div>
          <div class="value">${data.tenantCount}</div>
        </div>
        <div class="metric">
          <div class="label">Compliance Score</div>
          <div class="value">${escapeHtml(data.complianceScore)}</div>
        </div>
      </div>

      <h2>Findings Summary</h2>
      <table>
        <thead>
          <tr>
            <th>Check Slug</th>
            <th>Severity</th>
            <th>Status</th>
            <th>First Seen</th>
            <th>Last Seen</th>
          </tr>
        </thead>
        <tbody>
          ${data.findings.map(f => `
            <tr>
              <td class="mono">${escapeHtml(f.checkSlug)}</td>
              <td class="severity-${f.severity.toLowerCase()}">${escapeHtml(f.severity)}</td>
              <td>${escapeHtml(f.status)}</td>
              <td class="mono">${new Date(f.firstSeenAt).toLocaleDateString()}</td>
              <td class="mono">${new Date(f.lastSeenAt).toLocaleDateString()}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <h2>Recent Scans</h2>
      <table>
        <thead>
          <tr>
            <th>Tenant ID</th>
            <th>Status</th>
            <th>Checks Run</th>
            <th>Checks Failed</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${data.recentScans.map(s => `
            <tr>
              <td class="mono">${escapeHtml(s.tenantId.slice(0, 12))}…</td>
              <td>${escapeHtml(s.status)}</td>
              <td class="mono">${s.checksRun}</td>
              <td class="mono">${s.checksFailed}</td>
              <td class="mono">${new Date(s.createdAt).toLocaleDateString()}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <div class="footer">
        <p>Watchtower Compliance Platform — Confidential. Generated on ${escapeHtml(data.generatedAt)}.</p>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Your browser blocked the report window. Please enable popups in your browser settings for this site and try again.");
    return;
  }
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  printWindow.onafterprint = () => printWindow.close();
  printWindow.focus();
  printWindow.print();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
