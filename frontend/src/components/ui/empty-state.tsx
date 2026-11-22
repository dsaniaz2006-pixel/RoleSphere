import { FileText, Files, Image as ImageIcon, Upload, X, type LucideIcon } from 'lucide-react';
import { InteractiveHoverButton } from './interactive-hover-button';

/** Serafim's Empty State: fan of outlined icons, compact card and a real action. */
export function EmptyState({ title, description, icons = [FileText, ImageIcon, Files], action }: {
  title: string; description: string; icons?: LucideIcon[]; action?: { label: string; onClick: () => void };
}) {
  return <div className="rs-empty-state">
    <div className="rs-empty-icons" aria-hidden="true">{icons.map((Icon, index) => <span key={index}><Icon size={22} strokeWidth={1.4} /></span>)}</div>
    <p className="rs-empty-title">{title}</p><p className="rs-empty-description">{description}</p>
    {action && <InteractiveHoverButton onClick={action.onClick}>{action.label}</InteractiveHoverButton>}
  </div>;
}

export function SelectedFiles({ files, onChoose, onClear }: { files: File[]; onChoose: () => void; onClear: () => void }) {
  return <div className="rs-selected-files"><Upload size={24} aria-hidden="true" />
    <div className="rs-file-details" role="status">{files.map((file, i) => <p key={i}><strong>{file.name}</strong><span>{file.size < 1024 ? file.size + ' B' : file.size < 1048576 ? (file.size / 1024).toFixed(1) + ' KB' : (file.size / 1048576).toFixed(1) + ' MB'}</span></p>)}<small>Selected · Ready to submit</small></div>
    <button type="button" onClick={onChoose} className="rs-file-change">Change</button>
    <button type="button" onClick={onClear} className="rs-file-clear" aria-label="Remove selected files"><X size={18}/></button>
  </div>;
}
