import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Camera, MapView, MarkerView } from '@maplibre/maplibre-react-native';
import { deleteCareAction, MyCareAction } from '../../api/care';
import { mapStyles } from '../../map/styles';
import { Icon } from '../brand';
import { Button, Card, Text } from '../ui';
import { makeStyles, radius, spacing, useTheme } from '../../theme';
import Sheet from './Sheet';

// Drop-history rows show the time too: whether a record is still deletable
// depends on how fresh it is, and a date alone hides that.
function formatCareDate(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type CareHistorySheetProps = {
  visible: boolean;
  onClose: () => void;
  actions: MyCareAction[];
  /** The deleted record leaves the caller's list. */
  onDeleted: (id: number) => void;
  /** The delete window may have expired since the list was fetched. */
  onReload: () => void;
};

/**
 * "Mama & su geçmişim" behind one row-button (owner, 2026-09-11). The sheet
 * holds exactly what the profile used to show inline: the history map, the
 * chooser for a marker with several records, and a record's detail with the
 * delete action while the server's window allows it.
 */
export default function CareHistorySheet({
  visible,
  onClose,
  actions,
  onDeleted,
  onReload,
}: CareHistorySheetProps) {
  const styles = useStyles();
  const { name: themeName, colors } = useTheme();
  const [careDetail, setCareDetail] = useState<MyCareAction | null>(null);
  const [careGroup, setCareGroup] = useState<MyCareAction[] | null>(null);
  // Chooser → detail must not present the second modal while the first is
  // still dismissing (the iOS RN-modal race silently drops the second one).
  // The picked record parks here and the chooser's onDismiss opens it.
  const pendingCareDetail = useRef<MyCareAction | null>(null);

  // A popup must never outlive the sheet it sits on: both are siblings of
  // the sheet's modal, so nothing dismisses them with it.
  useEffect(() => {
    if (!visible) {
      pendingCareDetail.current = null;
      setCareGroup(null);
      setCareDetail(null);
    }
  }, [visible]);

  const openCareDetailFromGroup = (action: MyCareAction) => {
    if (Platform.OS === 'ios') {
      pendingCareDetail.current = action;
      setCareGroup(null);
    } else {
      // Android modals swap synchronously and never fire onDismiss.
      setCareGroup(null);
      setCareDetail(action);
    }
  };

  // Nearby drops collapse into ONE marker with a count badge — at the fitted
  // zoom even fanned-out markers overlap, and a water drop under a food drop
  // was simply invisible (owner report: "su geçmişi gözükmüyor"). Tapping a
  // multi-record marker opens a chooser first.
  const careGroups = useMemo(() => {
    const groups = new Map<string, MyCareAction[]>();
    for (const action of actions) {
      // ~110 m buckets: GPS scatter lands repeat drops metres apart. Known
      // limit: two drops straddling a bucket boundary still overlap; a
      // distance-based merge would fix that if it ever bites.
      const key = `${action.location.coordinates[0].toFixed(
        3
      )},${action.location.coordinates[1].toFixed(3)}`;
      groups.set(key, [...(groups.get(key) ?? []), action]);
    }
    return [...groups.values()].map((group) => ({
      actions: group,
      lng: group[0].location.coordinates[0],
      lat: group[0].location.coordinates[1],
    }));
  }, [actions]);

  // Fit the map to every marker; a single spot gets a street-scale center
  // instead (a zero-size bounds box over-zooms).
  const camera = useMemo(() => {
    if (actions.length === 0) return { zoomLevel: 5 };
    const lngs = actions.map((a) => a.location.coordinates[0]);
    const lats = actions.map((a) => a.location.coordinates[1]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    if (maxLng - minLng < 1e-4 && maxLat - minLat < 1e-4) {
      return { centerCoordinate: [lngs[0], lats[0]], zoomLevel: 15 };
    }
    return {
      bounds: {
        ne: [maxLng, maxLat] as [number, number],
        sw: [minLng, minLat] as [number, number],
        paddingLeft: 28,
        paddingRight: 28,
        paddingTop: 28,
        paddingBottom: 28,
      },
    };
  }, [actions]);

  function handleDelete(action: MyCareAction) {
    const label = action.action_type === 'food' ? 'mama' : 'su';
    Alert.alert('Kaydı sil', `Bu ${label} kaydı haritadan da kalkacak. Emin misin?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCareAction(action.id);
            onDeleted(action.id);
            setCareDetail(null);
          } catch (err: any) {
            Alert.alert(
              'Silinemedi',
              err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu'
            );
            // The window may have expired since the list was fetched;
            // refresh so stale "sil" buttons disappear.
            setCareDetail(null);
            onReload();
          }
        },
      },
    ]);
  }

  return (
    <>
      <Sheet visible={visible} onClose={onClose} title="Mama & su geçmişim" fill scroll={false}>
        {actions.length === 0 ? (
          <Card variant="flat">
            <Text variant="caption">Henüz mama veya su bırakmadın.</Text>
          </Card>
        ) : (
          <>
            {/* The history is a MAP, not a list (owner decision,
                2026-08-31): every drop is a marker; tapping one opens the
                detail popup with the date (and delete, while allowed). */}
            <View style={styles.mapWrapper}>
              <MapView
                style={styles.mapInner}
                mapStyle={mapStyles[themeName]}
                pitchEnabled={false}
                rotateEnabled={false}
                // The full map screen carries the required attribution.
                attributionEnabled={false}
              >
                {/* Controlled (not defaultSettings): a new drop outside the
                    old bounds must re-fit the camera on refresh. */}
                <Camera {...camera} animationDuration={0} />
                {careGroups.map((group) => (
                  <MarkerView
                    key={`care-${group.actions[0].id}`}
                    coordinate={[group.lng, group.lat]}
                    anchor={{ x: 0.5, y: 0.5 }}
                  >
                    <Pressable
                      style={styles.marker}
                      onPress={() =>
                        group.actions.length === 1
                          ? setCareDetail(group.actions[0])
                          : setCareGroup(group.actions)
                      }
                    >
                      <Icon
                        name={group.actions[0].action_type === 'food' ? 'food' : 'water'}
                        size={16}
                        color={colors.brand}
                      />
                      {group.actions.length > 1 && (
                        <View style={styles.markerBadge}>
                          <Text variant="micro" style={styles.markerBadgeText}>
                            {group.actions.length}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  </MarkerView>
                ))}
              </MapView>
            </View>
            {/* The map draws at most 100 records (the API's page cap); a full
                page means older drops exist but aren't shown — say so. */}
            {actions.length === 100 && (
              <Text variant="caption" color="textSubtle" center style={styles.capNote}>
                Son 100 kayıt gösteriliyor.
              </Text>
            )}
          </>
        )}
      </Sheet>

      {/* Siblings of the sheet, not children: a modal presented over the
          sheet's own modal is the flow the iOS dance below was written for. */}
      <Modal
        visible={!!careGroup}
        transparent
        animationType="fade"
        onRequestClose={() => setCareGroup(null)}
        onDismiss={() => {
          if (pendingCareDetail.current) {
            setCareDetail(pendingCareDetail.current);
            pendingCareDetail.current = null;
          }
        }}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCareGroup(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text variant="heading" center>
              Bu noktadaki kayıtlar
            </Text>
            {/* A busy spot can hold dozens of records; the list scrolls
                inside a capped card so "Kapat" stays reachable. */}
            <ScrollView style={styles.groupList}>
              {(careGroup ?? []).map((action) => (
                <Card
                  key={action.id}
                  variant="flat"
                  padding="md"
                  style={styles.groupRow}
                  onPress={() => openCareDetailFromGroup(action)}
                >
                  <Icon
                    name={action.action_type === 'food' ? 'food' : 'water'}
                    size={18}
                    color={colors.brand}
                  />
                  <Text variant="bodyStrong" style={styles.groupLabel}>
                    {action.action_type === 'food' ? 'Mama' : 'Su'}
                  </Text>
                  <Text variant="caption" color="textSubtle">
                    {formatCareDate(action.created_at)}
                  </Text>
                </Card>
              ))}
            </ScrollView>
            <Button title="Kapat" variant="ghost" onPress={() => setCareGroup(null)} fullWidth />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Drop-detail popup: where this record landed, as a static map. */}
      <Modal
        visible={!!careDetail}
        transparent
        animationType="fade"
        onRequestClose={() => setCareDetail(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCareDetail(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {careDetail && (
              <>
                <Text variant="heading" center>
                  {careDetail.action_type === 'food' ? 'Mama kaydı' : 'Su kaydı'}
                </Text>
                <Text variant="caption" color="textSubtle" center style={styles.modalDate}>
                  {formatCareDate(careDetail.created_at)}
                </Text>
                <View style={styles.modalMap}>
                  <MapView
                    style={styles.modalMapInner}
                    mapStyle={mapStyles[themeName]}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    pitchEnabled={false}
                    rotateEnabled={false}
                    // A static thumbnail; the full map screen carries the
                    // required OpenMapTiles/OSM attribution.
                    attributionEnabled={false}
                  >
                    <Camera
                      defaultSettings={{
                        centerCoordinate: [
                          careDetail.location.coordinates[0],
                          careDetail.location.coordinates[1],
                        ],
                        zoomLevel: 16,
                      }}
                    />
                    <MarkerView
                      coordinate={[
                        careDetail.location.coordinates[0],
                        careDetail.location.coordinates[1],
                      ]}
                      anchor={{ x: 0.5, y: 0.5 }}
                    >
                      <View style={styles.modalMarker}>
                        <Icon
                          name={careDetail.action_type === 'food' ? 'food' : 'water'}
                          size={18}
                          color={colors.brand}
                        />
                      </View>
                    </MarkerView>
                  </MapView>
                </View>
                {/* Still only inside the server-computed 15-minute window. */}
                {careDetail.deletable && (
                  <Button
                    title="Sil"
                    variant="danger"
                    onPress={() => handleDelete(careDetail)}
                    fullWidth
                  />
                )}
                <Button
                  title="Kapat"
                  variant="ghost"
                  onPress={() => setCareDetail(null)}
                  fullWidth
                  style={styles.modalClose}
                />
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  mapWrapper: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  mapInner: { flex: 1 },
  capNote: { marginBottom: spacing.lg },
  marker: {
    padding: 5,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    ...shadow.float,
  },
  markerBadge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: c.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  // micro's letter spacing adds trailing space after a lone digit and shoves
  // it off-centre; zeroed so the count sits in the middle.
  markerBadgeText: { color: c.textOnBrand, lineHeight: 12, letterSpacing: 0 },
  groupList: { marginVertical: spacing.md, maxHeight: 340 },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  groupLabel: { flex: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.xl,
  },
  modalDate: { marginTop: 2 },
  modalClose: { marginTop: spacing.xs },
  modalMap: {
    height: 180,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginVertical: spacing.lg,
  },
  modalMapInner: { flex: 1 },
  modalMarker: {
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    ...shadow.float,
  },
}));
