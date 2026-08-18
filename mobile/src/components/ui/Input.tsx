import React, { useState } from 'react';
import { StyleProp, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import Text from './Text';
import { fonts, makeStyles, radius, spacing, useTheme } from '../../theme';

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
  const styles = useStyles();
  const { colors } = useTheme();

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
        placeholderTextColor={colors.textSubtle}
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

const useStyles = makeStyles(({ colors: c }) => ({
  container: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.xs },
  input: {
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: c.text,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  focused: { borderColor: c.brand },
  errored: { borderColor: c.danger },
  helper: { marginTop: spacing.xs },
}));
