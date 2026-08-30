import React, { useState } from 'react';
import { View } from 'react-native';
import Chip from './Chip';
import Input from './Input';
import Text from './Text';
import { MULTI_CHOICE_SEPARATOR, OTHER } from '../../taxonomy';
import { makeStyles, spacing } from '../../theme';

// Re-exported so screens using this field get the matching join convention
// from the same import; the value itself lives in the shared taxonomy.
export { MULTI_CHOICE_SEPARATOR };

type Props = {
  label: string;
  /** Fixed options; "Diğer" (other) must not be in this list, it appends itself. */
  options: string[];
  /**
   * Selected values. Listed options appear as-is; a value NOT on the list is
   * the free "Diğer" text (at most one such element, kept last).
   */
  value: string[];
  onChange: (value: string[]) => void;
  /** Placeholder for the free-text field. */
  otherPlaceholder?: string;
  /**
   * Cap for the whole selection once joined with MULTI_CHOICE_SEPARATOR —
   * the backend stores the join in one 120-char column, so the free-text
   * field shrinks as presets are added instead of failing on submit.
   */
  maxTotalLength?: number;
};

/**
 * Multi-select sibling of ChoiceField: pick any number of listed options,
 * plus an optional "Diğer" free text. The parent flattens the array with
 * MULTI_CHOICE_SEPARATOR into the same single column ChoiceField writes to —
 * no schema change, and single-select values stay readable as a selection
 * of one.
 */
export default function MultiChoiceField({
  label,
  options,
  value,
  onChange,
  otherPlaceholder = 'Kendin yaz',
  maxTotalLength = 120,
}: Props) {
  const styles = useStyles();
  const presets = value.filter((v) => options.includes(v));
  const storedOther = value.find((v) => !options.includes(v)) ?? '';
  // On open: a value not on the list means the user typed "Diğer" before.
  const [otherMode, setOtherMode] = useState(!!storedOther);
  const [otherText, setOtherText] = useState(storedOther);

  // How many characters the free text may still use once the presets (plus
  // one separator) are accounted for.
  const presetsJoined = presets.join(MULTI_CHOICE_SEPARATOR);
  const otherBudget = Math.max(
    0,
    maxTotalLength - presetsJoined.length - (presets.length > 0 ? MULTI_CHOICE_SEPARATOR.length : 0)
  );

  function emit(nextPresets: string[], nextOther: string) {
    const trimmed = nextOther.trim();
    onChange(trimmed ? [...nextPresets, trimmed] : nextPresets);
  }

  function togglePreset(option: string) {
    const next = presets.includes(option)
      ? presets.filter((p) => p !== option)
      : // Keep the options' own order so the flattened string is stable
        // regardless of tap order.
        options.filter((o) => presets.includes(o) || o === option);
    emit(next, otherMode ? otherText : '');
  }

  function toggleOther() {
    const next = !otherMode;
    setOtherMode(next);
    emit(presets, next ? otherText : '');
  }

  function changeOther(text: string) {
    setOtherText(text);
    emit(presets, text);
  }

  return (
    <View style={styles.container}>
      <Text variant="micro" style={styles.label}>
        {label.toLocaleLowerCase('tr-TR')}
      </Text>
      <View style={styles.chipRow}>
        {options.map((option) => (
          <Chip
            key={option}
            label={option}
            selected={presets.includes(option)}
            onPress={() => togglePreset(option)}
          />
        ))}
        <Chip label={`${OTHER} (belirtiniz)`} selected={otherMode} onPress={toggleOther} />
      </View>
      {otherMode && (
        <Input
          value={otherText}
          onChangeText={changeOther}
          placeholder={otherPlaceholder}
          maxLength={otherBudget}
          containerStyle={styles.otherInput}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  container: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Input has its own bottom margin; zeroed because the field already
  // spaces itself, otherwise the gap doubles (same as ChoiceField).
  otherInput: { marginTop: spacing.md, marginBottom: 0 },
}));
