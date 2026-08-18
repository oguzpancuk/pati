import React, { useState } from 'react';
import { View } from 'react-native';
import Chip from './Chip';
import Input from './Input';
import Text from './Text';
import { OTHER } from '../../taxonomy';
import { makeStyles, spacing } from '../../theme';

type Props = {
  label: string;
  /** Sabit seçenekler; "Diğer" bu listede olmamalı, sonuna kendisi ekleniyor. */
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** Serbest metin alanının ipucu metni. */
  otherPlaceholder?: string;
  maxLength?: number;
};

/**
 * Listeden seç ya da "Diğer"i seçip yaz.
 *
 * Serbest metin ayrı bir alana değil, seçilen değerin kendisine yazılıyor:
 * veritabanında `breed`/`color` kolonunda ya listedeki bir değer ya da
 * kullanıcının yazdığı metin duruyor. Böylece "diğer_aciklama" gibi ikinci bir
 * kolon ve her sorguda COALESCE gerekmiyor.
 *
 * Kayıtlı bir değerin listede olup olmadığına bakarak açılışta doğru çipin
 * seçili gelmesini de bu bileşen hallediyor.
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
  // Açılışta: değer listede yoksa ama doluysa kullanıcı daha önce "Diğer"i
  // seçmiş demektir.
  const [otherMode, setOtherMode] = useState(!!value && !options.includes(value));
  const [otherText, setOtherText] = useState(otherMode && value ? value : '');

  function selectPreset(option: string) {
    setOtherMode(false);
    onChange(option);
  }

  function selectOther() {
    setOtherMode(true);
    // Daha önce yazılmış metin varsa korunuyor; yoksa seçim henüz "boş" sayılır
    // ve zorunlu alan kontrolü devreye girebilir.
    onChange(otherText.trim() || null);
  }

  function changeOther(text: string) {
    setOtherText(text);
    onChange(text.trim() || null);
  }

  return (
    <View style={styles.container}>
      <Text variant="label" style={styles.label}>
        {label}
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
  // Input'un kendi alt boşluğu var; ChoiceField zaten boşluk bıraktığı için
  // sıfırlanıyor, yoksa alanlar arası aralık iki katına çıkıyor.
  otherInput: { marginTop: spacing.md, marginBottom: 0 },
}));
