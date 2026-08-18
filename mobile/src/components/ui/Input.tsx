import React, { useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import Text from './Text';
import { fonts, palette, radius, spacing } from '../../theme';

export type InputProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
};

/** Etiketli metin alanı. Odakta kenarlık marka rengine dönüyor. */
export default function Input({
  label,
  hint,
  error,
  containerStyle,
  style,
  onFocus,
  onBlur,
  multiline,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="label" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <TextInput
        {...rest}
        multiline={multiline}
        placeholderTextColor={palette.textSubtle}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          multiline && styles.multiline,
          focused && styles.focused,
          !!error && styles.errored,
          style,
        ]}
      />
      {error ? (
        <Text variant="caption" color="danger" style={styles.helper}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" style={styles.helper}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.xs },
  input: {
    backgroundColor: palette.surface,
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: palette.text,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  focused: { borderColor: palette.brand, backgroundColor: palette.surface },
  errored: { borderColor: palette.danger },
  helper: { marginTop: spacing.xs },
});
