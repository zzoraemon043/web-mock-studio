import { Plus, X } from 'lucide-react';
import type { KeyValue } from '../core/types.ts';
import { Button, IconButton, Input } from './ui.tsx';

interface KeyValueEditorProps {
  items: KeyValue[];
  onChange: (items: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
}

export function KeyValueEditor({ items, onChange, keyPlaceholder = 'Header', valuePlaceholder = 'Value', addLabel = 'Add header' }: KeyValueEditorProps) {
  const update = (index: number, patch: Partial<KeyValue>) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={item.enabled}
            onChange={(e) => update(i, { enabled: e.target.checked })}
            aria-label={`Enable ${item.key || 'row'}`}
            className="h-3.5 w-3.5 shrink-0 accent-[var(--wms-accent)]"
          />
          <Input mono value={item.key} placeholder={keyPlaceholder} onChange={(e) => update(i, { key: e.target.value })} className="flex-[2]" aria-label="Key" />
          <Input mono value={item.value} placeholder={valuePlaceholder} onChange={(e) => update(i, { value: e.target.value })} className="flex-[3]" aria-label="Value" />
          <IconButton icon={X} label="Remove row" onClick={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div>
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...items, { key: '', value: '', enabled: true }])}>
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
