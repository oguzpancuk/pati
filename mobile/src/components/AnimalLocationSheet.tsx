import React, { useState } from 'react';
import { Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, MapView, MarkerView } from '@maplibre/maplibre-react-native';
import AnimalAvatar from './AnimalAvatar';
import { Button, Text } from './ui';
import { mapStyles } from '../map/styles';
import { makeStyles, radius, spacing, useTheme } from '../theme';

// Everything in the sheet that is not the map: the handle, the title, the
// lead line (two lines on a narrow phone), the Kapat button and the paddings
// around them. The map is sized against what this leaves, never against the
// screen alone.
const SHEET_CHROME = 170;
// The sheet may take 88% of the screen (see the stylesheet's maxHeight).
const SHEET_MAX_RATIO = 0.88;

/**
 * "En son görüldüğü yer" as a real map (demo item 8): the profile keeps the
 * static thumbnail as the affordance, and a tap brings the same spot up in a
 * sheet you can pan and zoom. Tapping the marker reveals when the location
 * was last updated — the same date the profile prints under the thumbnail,
 * formatted by the caller so the two can never drift.
 *
 * A sheet is not a page (DESIGN §8): the backdrop and Android's hardware
 * back close it and leave the profile where it was.
 */
export default function AnimalLocationSheet({
  visible,
  onClose,
  species,
  breed,
  photoUrl,
  latitude,
  longitude,
  updatedAtLabel,
}: {
  visible: boolean;
  onClose: () => void;
  species: 'cat' | 'dog';
  breed: string | null;
  photoUrl?: string | null;
  latitude: number;
  longitude: number;
  /** Already formatted by the page, e.g. "5 Eyl 14:30". */
  updatedAtLabel: string;
}) {
  const styles = useStyles();
  const { name: themeName } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // The sheet does not scroll (a ScrollView would fight the map's pan), so
  // the map takes what the chrome leaves rather than a share of the screen.
  // Neither client is orientation-locked: rotated, a 45% map plus the title
  // and the button came to more than the sheet's 88% cap, and the overflow
  // fell on the Kapat button — the sheet's own way out, clipped on Android
  // by the rounded top corners (review finding).
  const mapHeight = Math.max(
    140,
    Math.min(340, Math.round(windowHeight * SHEET_MAX_RATIO) - SHEET_CHROME - insets.bottom)
  );
  const [dateShown, setDateShown] = useState(false);

  function close() {
    setDateShown(false);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Kapat">
        {/* An empty onPress keeps a tap inside the sheet from closing it. */}
        <Pressable
          style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}
          onPress={() => {}}
        >
          <View style={styles.handle} />
          <Text variant="heading" style={styles.title}>
            En son görüldüğü yer
          </Text>
          <Text variant="caption" style={styles.lead}>
            Haritayı kaydırıp yakınlaştırabilirsin. Tarihi görmek için işarete dokun.
          </Text>

          <View style={[styles.mapWrapper, { height: mapHeight }]}>
            {/* A Modal renders nothing while hidden, so the MapView and its
                GL surface exist only while the sheet is up. */}
            {visible && (
              <MapView
                style={styles.map}
                mapStyle={mapStyles[themeName]}
                scrollEnabled
                zoomEnabled
                pitchEnabled={false}
                rotateEnabled={false}
                // The attribution stays off the map here exactly as it is on
                // the profile thumbnail this sheet grew out of; the map
                // screen carries the OpenMapTiles/OSM credit.
                attributionEnabled={false}
              >
                <Camera
                  defaultSettings={{ centerCoordinate: [longitude, latitude], zoomLevel: 16 }}
                />
                <MarkerView coordinate={[longitude, latitude]} anchor={{ x: 0.5, y: 0.5 }}>
                  {/* The callout is absolutely positioned so the marker's own
                      box stays the avatar's size — otherwise showing the date
                      would grow the view and slide the avatar off the spot. */}
                  <Pressable
                    onPress={() => setDateShown((shown) => !shown)}
                    accessibilityRole="button"
                    accessibilityLabel="Son güncelleme tarihini göster"
                    style={styles.marker}
                  >
                    {dateShown && (
                      <View style={styles.callout}>
                        <Text variant="micro" style={styles.calloutText} numberOfLines={1}>
                          {updatedAtLabel}
                        </Text>
                      </View>
                    )}
                    <AnimalAvatar species={species} breed={breed} photoUrl={photoUrl} size={44} />
                  </Pressable>
                </MarkerView>
              </MapView>
            )}
          </View>

          <Button title="Kapat" onPress={close} fullWidth style={styles.close} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  backdrop: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: c.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    ...shadow.modal,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: c.borderStrong,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: { marginBottom: 2 },
  lead: { marginBottom: spacing.md },
  // Height comes from the space the chrome leaves (see mapHeight); the rest
  // is the frame. flexShrink is the backstop on a screen too short even for
  // the 140 floor: the map gives way, the Kapat button never does.
  mapWrapper: {
    flexShrink: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceAlt,
  },
  map: { flex: 1 },
  marker: { alignItems: 'center', justifyContent: 'center' },
  callout: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: c.overlay,
  },
  calloutText: { color: c.textOnBrand },
  close: { marginTop: spacing.lg },
}));
