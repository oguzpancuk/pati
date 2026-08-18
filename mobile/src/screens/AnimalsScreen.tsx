import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Image, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Animal, fetchAnimals } from '../api/animals';
import { getCurrentLocation } from '../location';
import { Button, Card, Chip, EmptyState, Screen, Text } from '../components/ui';
import { Icon } from '../components/brand';
import { makeStyles, radius, spacing, useTheme } from '../theme';

const NEARBY_RADIUS_METERS = 5000;

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

  const load = useCallback(async (species: SpeciesFilter) => {
    setLoading(true);
    try {
      const loc = await getCurrentLocation();
      const data = await fetchAnimals(
        loc.lat,
        loc.lng,
        NEARBY_RADIUS_METERS,
        species === 'all' ? undefined : species
      );
      setAnimals(data);
    } catch (err: any) {
      Alert.alert('Hayvanlar yüklenemedi', err?.message ?? 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(filter);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter])
  );

  return (
    <Screen edges={['top']} padded={false}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleCol}>
            <Text variant="title">Yakındakiler</Text>
            <Text variant="caption">5 km içindeki kayıtlı hayvanlar</Text>
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
        onRefresh={() => load(filter)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card
            variant="flat"
            padding="md"
            style={styles.row}
            onPress={() => navigation.navigate('AnimalProfile', { animalId: item.id })}
          >
            {item.cover_photo_url ? (
              <Image source={{ uri: item.cover_photo_url }} style={styles.thumbnail} />
            ) : (
              <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                <Icon name="paw" size={26} color={colors.brand} />
              </View>
            )}
            <View style={styles.rowText}>
              <Text variant="subheading" numberOfLines={1}>
                {item.name ?? (item.species === 'cat' ? 'Kedi' : 'Köpek')}
              </Text>
              <Text variant="caption" numberOfLines={1}>
                {item.breed ?? 'Cinsi belirtilmemiş'} · {formatDistance(item.distance_meters)}
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
              description="5 km içinde kayıtlı hayvan bulunamadı. İlkini sen ekleyebilirsin."
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
  thumbnail: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    marginRight: spacing.md,
    backgroundColor: c.skeleton,
  },
  thumbnailPlaceholder: {
    backgroundColor: c.brandTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowText: { flex: 1, marginRight: spacing.sm },
}));
