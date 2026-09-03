"use client";

import { useEffect, useState } from "react";

type AuditLog = {
  id: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  previousValue: any;
  newValue: any;
  createdAt: string;
};

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/audit-logs")
      .then((r) => r.json())
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold mb-4">Audit Log</h1>
      {logs.length === 0 ? (
        <p className="text-gray-500">No audit entries yet.</p>
      ) : (
        <div className="card divide-y">
          {logs.map((log) => (
            <div key={log.id} className="p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">{log.action}</span>
                <span className="text-xs text-gray-400">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-xs text-gray-500">
                {log.entityType}
                {log.entityId && ` · ${log.entityId}`} · by {log.actorEmail ?? "system"}
              </p>
              {(log.previousValue || log.newValue) && (
                <pre className="text-xs bg-gray-50 rounded p-2 mt-1 overflow-x-auto">
                  {log.previousValue && `before: ${JSON.stringify(log.previousValue)}\n`}
                  {log.newValue && `after: ${JSON.stringify(log.newValue)}`}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
