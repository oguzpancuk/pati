import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Animal, fetchAnimals } from '../api/animals';
import { Coordinates, getCurrentLocationIfPermitted } from '../location';
import { openAddAnimal } from '../addAnimalGate';
import { mergeById } from '../paging';
import { Button, Card, Chip, EmptyState, Screen, Text } from '../components/ui';
import AnimalAvatar from '../components/AnimalAvatar';
import { BadgeSymbol } from '../components/badges';
import DemoChip from '../components/DemoChip';
import { Icon } from '../components/brand';
import { makeStyles, spacing, useTheme } from '../theme';

// No radius (owner decision, 2026-09-07): the list is every animal, nearest
// first, so the first page is your street and the last is the far end of
// the country; you scroll as far as you care to. A page is about a
// screenful — the rest loads as the end comes into view.
const PAGE_SIZE = 10;

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
  // A full page may have more behind it; a short page means the list ended.
  const [hasMore, setHasMore] = useState(true);
  // The location is taken on page one and kept: later pages must use the
  // same center, or pages blur together while the user walks.
  const locationRef = useRef<Coordinates | null>(null);
  // Without location permission the list still shows — newest first — and
  // says so, instead of the old dead end (an alert and an empty screen).
  const [noLocation, setNoLocation] = useState(false);
  // The loading flag in state stays stale until the next render; with
  // onEndReached firing twice in one frame the same page could be requested
  // twice. The ref updates instantly, cutting off the second request.
  const inFlightRef = useRef(false);

  const load = useCallback(async (species: SpeciesFilter, offset: number) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const isFirstPage = offset === 0;
    if (isFirstPage) setLoading(true);
    else setLoadingMore(true);
    try {
      if (isFirstPage) {
        // Never the system prompt from a list (owner decision, 2026-09-07):
        // no permission, GPS off, a timeout — all the same here: newest
        // first, and the caption says so (web parity).
        locationRef.current = await getCurrentLocationIfPermitted();
        setNoLocation(locationRef.current === null);
      }
      const loc = locationRef.current;
      const data = await fetchAnimals({
        lat: loc?.lat,
        lng: loc?.lng,
        species: species === 'all' ? undefined : species,
        limit: PAGE_SIZE,
        offset,
      });
      setAnimals((prev) => (isFirstPage ? data : mergeById(prev, data)));
      setHasMore(data.length === PAGE_SIZE);
    } catch (err: any) {
      Alert.alert('Hayvanlar yüklenemedi', err?.message ?? 'Bilinmeyen hata');
    } finally {
      inFlightRef.current = false;
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
            <Text variant="title">Hayvanlar</Text>
            <Text variant="caption">
              {noLocation ? 'Konum izni yok — en yeni kayıtlar' : 'Sana en yakından uzağa'}
            </Text>
          </View>
          <Button
            title="Ekle"
            size="sm"
            icon={<Icon name="plus" size={16} color={colors.textOnBrand} />}
            onPress={() => openAddAnimal(navigation)}
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
            {/* The face cut-out when the animal has one, the pattern avatar
                otherwise (P3). */}
            <AnimalAvatar
              species={item.species}
              breed={item.breed}
              photoUrl={item.cover_thumb_url}
              size={52}
            />
            <View style={styles.rowText}>
              <View style={styles.nameRow}>
                <Text variant="subheading" numberOfLines={1} style={styles.name}>
                  {item.name ?? (item.species === 'cat' ? 'Kedi' : 'Köpek')}
                </Text>
                <DemoChip visible={item.is_demo === true} />
              </View>
              <Text variant="caption" numberOfLines={1}>
                {item.breed ?? 'Türü belirtilmemiş'} · {formatDistance(item.distance_meters)}
              </Text>
              {/* The animal's badges (P6 item 5): medallions only, the
                  names live on the profile. */}
              {item.badges && item.badges.length > 0 && (
                <View style={styles.badgeRow}>
                  {item.badges.map((badge) => (
                    <BadgeSymbol
                      key={badge.key}
                      symbol={badge.symbol}
                      tier={badge.tier}
                      size={16}
                    />
                  ))}
                </View>
              )}
            </View>
            <Icon name="chevronRight" size={20} color={colors.textSubtle} />
          </Card>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              emoji="🐾"
              title="Henüz kayıt yok"
              description="Kayıtlı hayvan bulunamadı. İlkini sen ekleyebilirsin."
              actionTitle="Yeni hayvan ekle"
              onAction={() => openAddAnimal(navigation)}
            />
          ) : null
        }
      />
    </Screen>
  );
}

// No colors in this sheet — spacing and radii only.
const useStyles = makeStyles(() => ({
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1 },
  badgeRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  footer: { paddingVertical: spacing.lg, alignItems: 'center' },
}));
