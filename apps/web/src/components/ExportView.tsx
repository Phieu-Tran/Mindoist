import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileJson, FileText } from 'lucide-react';
import { Button } from './ui/button';

export function ExportView() {
  const { t } = useTranslation('tasks');
  const [downloading, setDownloading] = useState(false);

  const handleExport = async (format: 'json' | 'csv') => {
    setDownloading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/export/${format}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'json'
        ? `mindoist-export-${new Date().toISOString().slice(0, 10)}.json`
        : `mindoist-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // silent — user sees download fail naturally
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="max-w-lg">
      <p className="text-sm text-muted-foreground mb-6">{t('export.description')}</p>
      <div className="flex flex-col gap-3">
        <Button
          variant="outline"
          className="justify-start gap-3 h-14"
          onClick={() => handleExport('json')}
          disabled={downloading}
        >
          <FileJson className="h-5 w-5 text-muted-foreground" />
          <div className="text-left">
            <div className="font-medium">JSON</div>
            <div className="text-xs text-muted-foreground">{t('export.jsonHint')}</div>
          </div>
          <Download className="ml-auto h-4 w-4 text-muted-foreground" />
        </Button>
        <Button
          variant="outline"
          className="justify-start gap-3 h-14"
          onClick={() => handleExport('csv')}
          disabled={downloading}
        >
          <FileText className="h-5 w-5 text-muted-foreground" />
          <div className="text-left">
            <div className="font-medium">CSV</div>
            <div className="text-xs text-muted-foreground">{t('export.csvHint')}</div>
          </div>
          <Download className="ml-auto h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}
