import React from 'react';
import { Image, StyleProp, View, ViewStyle } from 'react-native';
import Text from './Text';
import CartoonAvatar from '../avatars/CartoonAvatar';
import { variantFromValue } from '../../avatars';
import { makeStyles, radius, useTheme } from '../../theme';

export type AvatarProps = {
  uri?: string | null;
  /** For deriving the initial letter when there is no photo. */
  name?: string | null;
  size?: number;
  /** Border color — e.g. green/red by care status. */
  ring?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The round profile image. Three states, all read from the `uri` field: an
 * uploaded photo, a selected built-in avatar (`pati-avatar:` prefixed), or
 * neither — then the initial letter. Why the prefix lives inside
 * `avatar_url` is explained in src/avatars.ts and
 * backend/src/utils/avatars.js.
 */
export default function Avatar({ uri, name, size = 44, ring, style }: AvatarProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const box: StyleProp<ViewStyle> = [
    {
      width: size,
      height: size,
      borderRadius: radius.pill,
      backgroundColor: colors.brandSoft,
      borderWidth: ring ? 2 : 0,
      borderColor: ring,
    },
    styles.center,
    style,
  ];

  const variant = variantFromValue(uri);
  if (variant) {
    return (
      <View style={box}>
        <CartoonAvatar variant={variant} size={size} />
      </View>
    );
  }

  if (uri) {
    return (
      <View style={box}>
        <Image source={{ uri }} style={styles.image} />
      </View>
    );
  }

  const initial = (name || '?').trim().charAt(0).toLocaleUpperCase('tr-TR');
  return (
    <View style={box}>
      <Text
        variant="bodyStrong"
        // lineHeight is set along with the size; overriding only fontSize
        // would let the variant's 22pt line clip the capital letter.
        style={{ fontSize: size * 0.4, lineHeight: size * 0.5, color: colors.brandDark }}
      >
        {initial}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
}));
