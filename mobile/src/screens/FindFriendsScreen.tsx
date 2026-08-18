import React, { useState } from 'react';
import { FlatList } from 'react-native';
import { searchUsers, UserSummary } from '../api/users';
import { Avatar, Card, EmptyState, Input, Screen, Text } from '../components/ui';
import { Icon } from '../components/brand';
import { makeStyles, spacing, useTheme } from '../theme';

export default function FindFriendsScreen({ navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(text: string) {
    setQuery(text);
    if (!text.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await searchUsers(text.trim());
      setResults(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen padded={false}>
      <Input
        placeholder="İsimle ara…"
        value={query}
        onChangeText={handleSearch}
        autoFocus
        autoCorrect={false}
        containerStyle={styles.search}
      />
      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Card
            variant="flat"
            padding="md"
            style={styles.row}
            onPress={() => navigation.navigate('PublicProfile', { userId: item.id })}
          >
            <Avatar uri={item.avatar_url} name={item.name} size={40} />
            <Text variant="bodyStrong" style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Icon name="chevronRight" size={18} color={colors.textSubtle} />
          </Card>
        )}
        ListEmptyComponent={
          !loading && query.trim() ? (
            <EmptyState
              emoji="🔍"
              title="Kimseyi bulamadık"
              description={`"${query.trim()}" ile eşleşen bir kullanıcı yok.`}
            />
          ) : !query.trim() ? (
            <EmptyState
              emoji="👋"
              title="Arkadaşlarını bul"
              description="Mahallendeki gönüllüleri adıyla arayabilirsin."
            />
          ) : null
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  search: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  name: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
}));
