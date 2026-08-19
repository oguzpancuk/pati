import React, { useState } from 'react';
import { View } from 'react-native';
import Chip from './Chip';
import Input from './Input';
import Text from './Text';
import { OTHER } from '../../taxonomy';
import { makeStyles, spacing } from '../../theme';

type Props = {
  label: string;
  /** Fixed options; "Diğer" (other) must not be in this list, it appends itself. */
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** Placeholder for the free-text field. */
  otherPlaceholder?: string;
  maxLength?: number;
};

/**
 * Pick from the list, or pick "Diğer" (other) and type.
 *
 * The free text is written into the value itself, not a separate field: the
 * `breed`/`color` column holds either a listed value or the user's text.
 * No second "other_description" column and no COALESCE in every query.
 *
 * This component also handles pre-selecting the right chip on open by
 * checking whether the stored value is on the list.
 */
export default function ChoiceField({
  label,
  options,
  value,
  onChange,
  otherPlaceholder = 'Kendin yaz',
  maxLength = 120,
}: Props) {
  const styles = useStyles();
  // On open: a value that is set but not on the list means the user picked
  // "Diğer" before.
  const [otherMode, setOtherMode] = useState(!!value && !options.includes(value));
  const [otherText, setOtherText] = useState(otherMode && value ? value : '');

  function selectPreset(option: string) {
    setOtherMode(false);
    onChange(option);
  }

  function selectOther() {
    setOtherMode(true);
    // Previously typed text is preserved; otherwise the selection still
    // counts as "empty" and required-field validation can kick in.
    onChange(otherText.trim() || null);
  }

  function changeOther(text: string) {
    setOtherText(text);
    onChange(text.trim() || null);
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
            selected={!otherMode && value === option}
            onPress={() => selectPreset(option)}
          />
        ))}
        <Chip label={`${OTHER} (belirtiniz)`} selected={otherMode} onPress={selectOther} />
      </View>
      {otherMode && (
        <Input
          value={otherText}
          onChangeText={changeOther}
          placeholder={otherPlaceholder}
          maxLength={maxLength}
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
  // Input has its own bottom margin; zeroed because ChoiceField already
  // spaces itself, otherwise the field gap doubles.
  otherInput: { marginTop: spacing.md, marginBottom: 0 },
}));
