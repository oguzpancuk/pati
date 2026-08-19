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

/**
 * A text field with the label **inside** the box (handoff 3a): a 10.5pt
 * spaced lowercase label above the value, one hairline border around both,
 * turning brand-colored on focus. The label is not a separate row any more,
 * so forms read as a stack of quiet boxes rather than label/field pairs.
 */
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
      <View style={[styles.box, focused && styles.focused, !!error && styles.errored]}>
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
          style={[styles.input, multiline && styles.multiline, style]}
        />
      </View>
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
  container: { marginBottom: spacing.md },
  box: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: radius.input,
    paddingHorizontal: spacing.lg - 2,
    paddingTop: spacing.md - 2,
    paddingBottom: spacing.sm,
  },
  label: { marginBottom: spacing.xs - 2 },
  input: {
    fontFamily: fonts.semibold,
    fontSize: 15.5,
    lineHeight: 21,
    color: c.text,
    padding: 0,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  focused: { borderColor: c.brand },
  errored: { borderColor: c.danger },
  helper: { marginTop: spacing.xs, marginLeft: spacing.xs },
}));
