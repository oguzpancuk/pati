import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Circle, LatLng, Marker, Polygon, Region as MapRegion } from 'react-native-maps';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import {
  addCareAction,
  CareAction,
  CareStatus,
  fetchCareActionsInBounds,
  fetchCareStatus,
} from '../api/care';
import { Animal, fetchAnimals } from '../api/animals';
import AdBanner from '../components/AdBanner';
import AnimalAvatar from '../components/AnimalAvatar';
import UserLocationMarker from '../components/UserLocationMarker';
import { Coordinates, getCurrentLocation } from '../location';
import { useBadgeAwards } from '../context/BadgeAwardContext';
import { Banner, Button, Text } from '../components/ui';
import { Icon } from '../components/brand';
import { caredFill, makeStyles, mapColors, radius, spacing, useTheme } from '../theme';

// Türkiye'nin yaklaşık coğrafi sınır kutusu (kesin idari sınır değil).
// Harita bu alana odaklanır ve kullanıcı bu kutunun dışına fazla kayamaz.
const TURKEY_BOUNDS = {
  minLat: 35.8,
  maxLat: 42.1,
  minLng: 25.6,
  maxLng: 44.8,
};
const TURKEY_REGION: MapRegion = {
  latitude: (TURKEY_BOUNDS.minLat + TURKEY_BOUNDS.maxLat) / 2,
  longitude: (TURKEY_BOUNDS.minLng + TURKEY_BOUNDS.maxLng) / 2,
  latitudeDelta: TURKEY_BOUNDS.maxLat - TURKEY_BOUNDS.minLat,
  longitudeDelta: TURKEY_BOUNDS.maxLng - TURKEY_BOUNDS.minLng,
};
const TURKEY_POLYGON: LatLng[] = [
  { latitude: TURKEY_BOUNDS.minLat, longitude: TURKEY_BOUNDS.minLng },
  { latitude: TURKEY_BOUNDS.minLat, longitude: TURKEY_BOUNDS.maxLng },
  { latitude: TURKEY_BOUNDS.maxLat, longitude: TURKEY_BOUNDS.maxLng },
  { latitude: TURKEY_BOUNDS.maxLat, longitude: TURKEY_BOUNDS.minLng },
];

const ACTION_CIRCLE_RADIUS_METERS = 100;
const ANIMAL_RADIUS_METERS = 10000;
const USER_ZOOM_DELTA = 0.03;
const MIN_DELTA = 0.001;
const MAX_DELTA = 40;

// Hayvan avatarları yalnızca sokak ölçeğine yakınlaşınca çizilir; şehir/ülke
// ölçeğinde onlarca avatar üst üste binip haritayı tamamen kapatıyordu.
const ANIMAL_VISIBLE_MAX_DELTA = 0.02;

// react-native-maps'in Heatmap bileşeni yalnızca Google Maps sağlayıcısında çalışıyor
// (iOS'ta Apple Maps kullandığımız için desteklenmiyor, Google'a geçmek iOS'ta da API
// key zorunluluğu getirirdi). Bunun yerine kırmızı bir taban katmanının üstüne, ağırlığa
// göre saydamlaşan yeşil daireler çiziyoruz: hiç bakım yoksa kırmızı görünür, taze/çok
// sayıda aksiyon olan yerlerde daireler üst üste binip belirgin yeşile döner.
// Opaklıklar bilinçli olarak düşük tutuldu; altındaki sokak/işletme isimleri okunabilir
// kalmalı, katmanlar haritayı gizlememeli.
const BASE_RED_FILL = mapColors.needsCareFill;
const MAX_GREEN_ALPHA = 0.3;

function weightToGreenAlpha(weight: number) {
  return Math.min(Math.max(weight, 0), 1) * MAX_GREEN_ALPHA;
}

export default function MapScreen({ navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { celebrate } = useBadgeAwards();
  const mapRef = useRef<MapView>(null);
  const currentRegionRef = useRef<MapRegion>(TURKEY_REGION);
  const mapReadyRef = useRef(false);
  const pendingCenterRef = useRef<Coordinates | null>(null);
  const hasCenteredOnUser = useRef(false);
  const [actions, setActions] = useState<CareAction[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [status, setStatus] = useState<CareStatus | null>(null);
  const [myLocation, setMyLocation] = useState<Coordinates | null>(null);
  const [viewType, setViewType] = useState<'food' | 'water'>('food');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [animalsVisible, setAnimalsVisible] = useState(false);

  const typeLabel = viewType === 'food' ? 'mama' : 'su';

  function centerOnUser(loc: Coordinates) {
    if (hasCenteredOnUser.current) return;
    if (!mapReadyRef.current) {
      // Harita native tarafta henüz hazır değilse animateToRegion sessizce yok
      // sayılabiliyor; hazır olduğunda tekrar denemek için konumu saklıyoruz.
      pendingCenterRef.current = loc;
      return;
    }
    hasCenteredOnUser.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: loc.lat,
        longitude: loc.lng,
        latitudeDelta: USER_ZOOM_DELTA,
        longitudeDelta: USER_ZOOM_DELTA,
      },
      500
    );
  }

  function handleMapReady() {
    mapReadyRef.current = true;
    if (pendingCenterRef.current) {
      const loc = pendingCenterRef.current;
      pendingCenterRef.current = null;
      centerOnUser(loc);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [actionData, loc] = await Promise.all([
        fetchCareActionsInBounds(TURKEY_BOUNDS, viewType),
        getCurrentLocation().catch(() => null),
      ]);
      setActions(actionData);
      if (loc) {
        setMyLocation(loc);
        const [statusData, animalData] = await Promise.all([
          fetchCareStatus(loc.lat, loc.lng, viewType),
          fetchAnimals(loc.lat, loc.lng, ANIMAL_RADIUS_METERS),
        ]);
        setStatus(statusData);
        setAnimals(animalData);
        centerOnUser(loc);
      }
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.message ?? 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewType]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function handleRegionChangeComplete(region: MapRegion) {
    currentRegionRef.current = region;
    setAnimalsVisible(region.latitudeDelta <= ANIMAL_VISIBLE_MAX_DELTA);

    const { latitude, longitude } = region;
    if (
      latitude < TURKEY_BOUNDS.minLat ||
      latitude > TURKEY_BOUNDS.maxLat ||
      longitude < TURKEY_BOUNDS.minLng ||
      longitude > TURKEY_BOUNDS.maxLng
    ) {
      mapRef.current?.animateToRegion(TURKEY_REGION, 300);
    }
  }

  function handleAnimalPress(animalId: number) {
    navigation.navigate('AnimalProfile', { animalId });
  }

  /**
   * Kayıt her zaman kullanıcının bulunduğu noktaya düşüyor. Konum, fotoğraf
   * çekildikten **sonra** okunuyor: kamera açıkken geçen sürede kullanıcı
   * yürümüş olabilir, kaydın doğru yere düşmesi için en güncel konum lazım.
   */
  async function handleChooseAction(actionType: 'food' | 'water') {
    try {
      let photoResult = await launchCamera({
        mediaType: 'photo',
        saveToPhotos: false,
      });

      // Simülatörlerde gerçek kamera donanımı yok. Geliştirme sırasında akışın
      // geri kalanını test edebilmek için galeriden seçmeye izin veriyoruz;
      // gerçek cihazda bu dal hiç tetiklenmez.
      if (__DEV__ && photoResult.errorCode === 'camera_unavailable') {
        photoResult = await launchImageLibrary({ mediaType: 'photo' });
      }

      if (photoResult.didCancel) {
        return;
      }
      const asset = photoResult.assets?.[0];
      if (!asset?.uri) {
        Alert.alert(
          'Fotoğraf alınamadı',
          photoResult.errorMessage ?? photoResult.errorCode ?? 'Bilinmeyen hata'
        );
        return;
      }

      setSubmitting(true);

      const device = await getCurrentLocation();
      const created = await addCareAction(device.lat, device.lng, actionType, {
        uri: asset.uri,
        type: asset.type,
        fileName: asset.fileName,
      });
      setConfirmOpen(false);
      await load();
      celebrate(created);
    } catch (err: any) {
      Alert.alert('Eklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  }

  function zoomBy(factor: number) {
    const current = currentRegionRef.current;
    const nextRegion: MapRegion = {
      ...current,
      latitudeDelta: Math.min(MAX_DELTA, Math.max(MIN_DELTA, current.latitudeDelta * factor)),
      longitudeDelta: Math.min(MAX_DELTA, Math.max(MIN_DELTA, current.longitudeDelta * factor)),
    };
    currentRegionRef.current = nextRegion;
    mapRef.current?.animateToRegion(nextRegion, 200);
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapType="standard"
        initialRegion={TURKEY_REGION}
        onMapReady={handleMapReady}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        <Polygon coordinates={TURKEY_POLYGON} fillColor={BASE_RED_FILL} strokeColor="transparent" />

        {actions.map((action) => (
          <Circle
            key={action.id}
            center={{
              latitude: action.location.coordinates[1],
              longitude: action.location.coordinates[0],
            }}
            radius={ACTION_CIRCLE_RADIUS_METERS}
            fillColor={caredFill(weightToGreenAlpha(Number(action.weight)))}
            strokeColor="transparent"
          />
        ))}

        {myLocation && (
          <Marker
            coordinate={{ latitude: myLocation.lat, longitude: myLocation.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <UserLocationMarker />
          </Marker>
        )}

        {animalsVisible &&
          animals.map((animal) => (
            <Marker
              key={`animal-${animal.id}`}
              coordinate={{
                latitude: animal.location.coordinates[1],
                longitude: animal.location.coordinates[0],
              }}
              onPress={() => handleAnimalPress(animal.id)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <AnimalAvatar species={animal.species} breed={animal.breed} size={36} />
            </Marker>
          ))}
      </MapView>

      {/* Üst katman: harita tam ekran, kontroller üstünde yüzüyor. */}
      <SafeAreaView style={styles.topLayer} edges={['top']} pointerEvents="box-none">
        <View style={styles.segment}>
          {(['food', 'water'] as const).map((option) => {
            const selected = viewType === option;
            return (
              <Pressable
                key={option}
                onPress={() => setViewType(option)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.segmentItem, selected && styles.segmentItemSelected]}
              >
                <Icon
                  name={option === 'food' ? 'food' : 'water'}
                  size={18}
                  color={selected ? colors.textOnBrand : colors.textMuted}
                />
                <Text
                  variant="bodyStrong"
                  style={[
                    styles.segmentLabel,
                    { color: selected ? colors.textOnBrand : colors.textMuted },
                  ]}
                >
                  {option === 'food' ? 'Mama' : 'Su'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {status?.needsAttention && (
          <Banner
            tone="danger"
            emoji="⚠️"
            title={`Buralarda ${typeLabel} yok`}
            description={`${status.radiusMeters} m çevrede son ${status.windowHours} saatte ${typeLabel} bırakılmamış.`}
            style={styles.banner}
          />
        )}
      </SafeAreaView>

      <View style={styles.zoomControls}>
        <Pressable
          style={styles.zoomButton}
          onPress={() => zoomBy(0.5)}
          accessibilityLabel="Yakınlaştır"
        >
          <Text style={styles.zoomButtonText}>+</Text>
        </Pressable>
        <Pressable
          style={styles.zoomButton}
          onPress={() => zoomBy(2)}
          accessibilityLabel="Uzaklaştır"
        >
          <Text style={styles.zoomButtonText}>−</Text>
        </Pressable>
      </View>

      {/* Alt katman: kayıt butonu. Konum haritadan seçilmiyor, kullanıcının
          bulunduğu noktaya bırakılıyor — bu yüzden butonun etiketi "buraya". */}
      <SafeAreaView style={styles.bottomLayer} edges={['bottom']} pointerEvents="box-none">
        {!animalsVisible && animals.length > 0 && (
          <View style={styles.hint} pointerEvents="none">
            <Text variant="caption" center>
              Hayvanları görmek için yakınlaştır
            </Text>
          </View>
        )}
        <View style={styles.ctaWrap}>
          <Button
            title={viewType === 'food' ? 'Buraya mama bıraktım' : 'Buraya su bıraktım'}
            onPress={() => setConfirmOpen(true)}
            icon={
              <Icon
                name={viewType === 'food' ? 'food' : 'water'}
                size={20}
                color={colors.textOnBrand}
              />
            }
            fullWidth
            size="lg"
          />
        </View>
      </SafeAreaView>

      {/* Hangi harita açıksa yalnızca ona ait aksiyon sunuluyor: mama haritasındayken
          su eklemek (ya da tersi) kafa karıştırıcı ve görüntülenen katmanla tutarsız. */}
      <Modal visible={confirmOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Icon name={viewType === 'food' ? 'food' : 'water'} size={28} color={colors.brand} />
            </View>
            <Text variant="heading" center>
              Bulunduğun yere {typeLabel} bıraktın mı?
            </Text>
            <Text variant="caption" center style={styles.modalDesc}>
              Fotoğrafını çek, haritada herkes görsün. Kayıt şu anki konumuna düşecek.
            </Text>

            <Button
              title={viewType === 'food' ? 'Mama bıraktım' : 'Su bıraktım'}
              onPress={() => handleChooseAction(viewType)}
              loading={submitting}
              icon={<Icon name="camera" size={18} color={colors.textOnBrand} />}
              fullWidth
              size="lg"
            />
            <Button
              title="Vazgeç"
              variant="ghost"
              onPress={() => setConfirmOpen(false)}
              fullWidth
              style={styles.modalCancel}
            />

            {/* Mama haritasında mama markası, su haritasında su markası. */}
            <AdBanner
              slot={viewType === 'food' ? 'food_popup' : 'water_popup'}
              visible={confirmOpen}
            />
          </View>
        </View>
      </Modal>

      {(loading || submitting) && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <View style={styles.loadingPill}>
            <ActivityIndicator size="small" color={colors.brand} />
          </View>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  container: { flex: 1, backgroundColor: c.background },
  topLayer: { position: 'absolute', top: 0, left: 0, right: 0 },
  segment: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginTop: spacing.md,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    ...shadow.raised,
  },
  segmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  segmentItemSelected: { backgroundColor: c.brand },
  segmentLabel: { marginLeft: spacing.sm },
  banner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    ...shadow.card,
  },
  // Yakınlaştırma tuşları kayıt butonunun üstünde kalmalı; aksi halde büyük
  // butonun altında kalıp dokunulamaz oluyorlar.
  zoomControls: { position: 'absolute', right: spacing.md, bottom: 140 },
  zoomButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  zoomButtonText: { fontSize: 22, lineHeight: 26, color: c.textMuted },
  bottomLayer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  hint: {
    alignSelf: 'center',
    marginBottom: spacing.sm,
    backgroundColor: c.surface,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    ...shadow.card,
  },
  ctaWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radius.pill,
    ...shadow.raised,
  },
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
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.modal,
  },
  modalIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: c.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  modalDesc: { marginTop: spacing.xs, marginBottom: spacing.xl },
  modalCancel: { marginTop: spacing.xs },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingPill: {
    padding: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    ...shadow.raised,
  },
}));
