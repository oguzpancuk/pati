import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Icon from '../brand/Icon';
import { makeStyles, spacing, useTheme } from '../../theme';

/**
 * One-line horizontally scrollable chip row with a "there's more" hint: a
 * chevron bubble hugs the right edge while options overflow and hides once
 * the user scrolls to the end (owner feedback, 2026-08-31 — the bare
 * scroll gave no clue that options continue off-screen).
 */
export default function ChipScroller({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [viewWidth, setViewWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  // The 8px slack keeps the hint from flickering on bounce at the end.
  const more = contentWidth > viewWidth + 1 && scrollX + viewWidth < contentWidth - 8;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipRow}
        keyboardShouldPersistTaps="handled"
        onLayout={(e) => setViewWidth(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContentWidth(w)}
        onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={32}
      >
        {children}
      </ScrollView>
      {more && (
        <View pointerEvents="none" style={styles.moreHint}>
          <Icon name="chevronRight" size={14} color={colors.textMuted} />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  // The negative margin lets chips scroll to the field's true edge.
  chipScroll: { marginHorizontal: -2 },
  chipRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: 2 },
  moreHint: {
    position: 'absolute',
    right: -2,
    top: '50%',
    marginTop: -11,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.float,
  },
}));
