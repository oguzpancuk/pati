import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Animal, fetchAnimals } from '../api/animals';
import { Coordinates, getCurrentLocation } from '../location';
import { Button, Card, Chip, EmptyState, Screen, Text } from '../components/ui';
import AnimalAvatar from '../components/AnimalAvatar';
import { Icon } from '../components/brand';
import { makeStyles, spacing, useTheme } from '../theme';

// 1 km: yürüyerek gidilip bakılabilecek mesafe. 5 km'de liste onlarca alakasız
// kayıtla doluyordu; sokak hayvanı zaten kendi mahallesinden çıkmıyor.
const NEARBY_RADIUS_METERS = 1000;
const PAGE_SIZE = 20;

type SpeciesFilter = 'all' | 'cat' | 'dog';

const FILTERS: { key: SpeciesFilter; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'cat', label: 'Kedi' },
  { key: 'dog', label: 'Köpek' },
];

function formatDistance(meters?: number) {
  if (meters === undefined) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export default function AnimalsScreen({ navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [filter, setFilter] = useState<SpeciesFilter>('all');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Sayfa dolu geldiyse devamı olabilir; kısa geldiyse liste bitmiştir.
  const [hasMore, setHasMore] = useState(true);
  // Konum ilk sayfada alınıp saklanıyor: sonraki sayfalar aynı merkezden
  // istenmeli, yoksa kullanıcı yürürken sayfalar birbirine karışır.
  const locationRef = useRef<Coordinates | null>(null);

  const load = useCallback(async (species: SpeciesFilter, offset: number) => {
    const isFirstPage = offset === 0;
    if (isFirstPage) setLoading(true);
    else setLoadingMore(true);
    try {
      if (isFirstPage || !locationRef.current) {
        locationRef.current = await getCurrentLocation();
      }
      const loc = locationRef.current;
      const data = await fetchAnimals({
        lat: loc.lat,
        lng: loc.lng,
        radiusMeters: NEARBY_RADIUS_METERS,
        species: species === 'all' ? undefined : species,
        limit: PAGE_SIZE,
        offset,
      });
      setAnimals((prev) => (isFirstPage ? data : [...prev, ...data]));
      setHasMore(data.length === PAGE_SIZE);
    } catch (err: any) {
      Alert.alert('Hayvanlar yüklenemedi', err?.message ?? 'Bilinmeyen hata');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(filter, 0);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter])
  );

  function handleEndReached() {
    if (!loading && !loadingMore && hasMore && animals.length > 0) {
      load(filter, animals.length);
    }
  }

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleCol}>
            <Text variant="title">Yakındakiler</Text>
            <Text variant="caption">1 km içindeki kayıtlı hayvanlar</Text>
          </View>
          <Button
            title="Ekle"
            size="sm"
            icon={<Icon name="plus" size={16} color={colors.textOnBrand} />}
            onPress={() => navigation.navigate('AddAnimal')}
          />
        </View>
        <View style={styles.filterRow}>
          {FILTERS.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              selected={filter === option.key}
              onPress={() => setFilter(option.key)}
            />
          ))}
        </View>
      </View>

      <FlatList
        data={animals}
        keyExtractor={(item) => String(item.id)}
        refreshing={loading}
        onRefresh={() => load(filter, 0)}
        onEndReachedThreshold={0.4}
        onEndReached={handleEndReached}
        contentContainerStyle={styles.list}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={colors.brand} />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Card
            variant="flat"
            padding="md"
            style={styles.row}
            onPress={() => navigation.navigate('AnimalProfile', { animalId: item.id })}
          >
            {/* Liste görseli de desen avatarı: fotoğraf kalitesinden bağımsız,
                tür/desen bir bakışta ayırt ediliyor. */}
            <AnimalAvatar species={item.species} breed={item.breed} size={52} />
            <View style={styles.rowText}>
              <Text variant="subheading" numberOfLines={1}>
                {item.name ?? (item.species === 'cat' ? 'Kedi' : 'Köpek')}
              </Text>
              <Text variant="caption" numberOfLines={1}>
                {item.breed ?? 'Türü belirtilmemiş'} · {formatDistance(item.distance_meters)}
              </Text>
            </View>
            <Icon name="chevronRight" size={20} color={colors.textSubtle} />
          </Card>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              emoji="🐾"
              title="Yakınında kayıt yok"
              description="1 km içinde kayıtlı hayvan bulunamadı. İlkini sen ekleyebilirsin."
              actionTitle="Yeni hayvan ekle"
              onAction={() => navigation.navigate('AddAnimal')}
            />
          ) : null
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleCol: { flex: 1, marginRight: spacing.md },
  filterRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  rowText: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  footer: { paddingVertical: spacing.lg, alignItems: 'center' },
}));
