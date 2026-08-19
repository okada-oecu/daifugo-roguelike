import { GameSettings, DaifugoRules } from '../types';
import { cn } from '../lib/utils';

interface GameSettingsPanelProps {
  settings: GameSettings;
  onChange?: (settings: GameSettings) => void;
  readOnly?: boolean;
}

const RULE_LABELS: { key: keyof DaifugoRules; label: string }[] = [
  { key: 'eightGiri', label: '8切り' },
  { key: 'sevenPass', label: '7渡し' },
  { key: 'tenDiscard', label: '10捨て' },
  { key: 'elevenBack', label: '11バック' },
  { key: 'revolution', label: '革命' },
];

export function GameSettingsPanel({ settings, onChange, readOnly = false }: GameSettingsPanelProps) {
  const canEdit = !readOnly && !!onChange;

  const update = (partial: Partial<GameSettings>) => {
    if (!canEdit) return;
    onChange!({ ...settings, ...partial });
  };

  const toggleRule = (key: keyof DaifugoRules) => {
    if (!canEdit) return;
    onChange!({ ...settings, rules: { ...settings.rules, [key]: !settings.rules[key] } });
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] text-zinc-400 mb-1 font-bold">目標スコア</div>
        <div className="flex gap-1.5">
          {[6, 12, 24].map(v => (
            <button
              key={v}
              type="button"
              disabled={!canEdit}
              onClick={() => update({ scoreLimit: v })}
              className={cn(
                "flex-1 py-1.5 text-[11px] font-bold border-2 transition-colors",
                settings.scoreLimit === v ? "bg-amber-500 text-black border-amber-300" : "bg-zinc-900 text-zinc-400 border-zinc-700",
                canEdit ? "cursor-pointer hover:border-zinc-500" : "cursor-default"
              )}
            >
              {v}pt
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-zinc-400 mb-1 font-bold">ターン制限</div>
        <div className="flex gap-1.5">
          {[30, 60, 120].map(v => (
            <button
              key={v}
              type="button"
              disabled={!canEdit}
              onClick={() => update({ turnTimeLimit: v })}
              className={cn(
                "flex-1 py-1.5 text-[11px] font-bold border-2 transition-colors",
                settings.turnTimeLimit === v ? "bg-amber-500 text-black border-amber-300" : "bg-zinc-900 text-zinc-400 border-zinc-700",
                canEdit ? "cursor-pointer hover:border-zinc-500" : "cursor-default"
              )}
            >
              {v}秒
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-zinc-400 mb-1 font-bold">特殊ルール</div>
        <div className="flex flex-wrap gap-1.5">
          {RULE_LABELS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              disabled={!canEdit}
              onClick={() => toggleRule(key)}
              className={cn(
                "px-2.5 py-1 text-[10px] font-bold border-2 transition-colors",
                settings.rules[key]
                  ? "bg-sky-600 text-white border-sky-400"
                  : "bg-zinc-900 text-zinc-500 border-zinc-700 line-through",
                canEdit ? "cursor-pointer hover:border-zinc-500" : "cursor-default"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
