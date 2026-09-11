import React, { useState } from 'react';
import { Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, MapView, MarkerView } from '@maplibre/maplibre-react-native';
import AnimalAvatar from './AnimalAvatar';
import { Button, Text } from './ui';
import { mapStyles } from '../map/styles';
import { makeStyles, radius, spacing, useTheme } from '../theme';

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
  // the map sizes itself against the screen: a landscape phone must still
  // show the title and the close button.
  const mapHeight = Math.max(180, Math.min(340, Math.round(windowHeight * 0.45)));
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
            {/* Mounted only while open: a MapView left alive behind a closed
                sheet keeps its GL surface and its tile requests. */}
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
  // Height comes from the screen (see mapHeight); the rest is the frame.
  mapWrapper: {
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
