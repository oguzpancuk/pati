import React, { useState } from 'react';
import { FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { searchUsers, UserSummary } from '../api/users';

export default function FindFriendsScreen({ navigation }: any) {
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
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="İsimle ara..."
        value={query}
        onChangeText={handleSearch}
        autoFocus
      />
      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('PublicProfile', { userId: item.id })}
          >
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarPlaceholderText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.name}>{item.name}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading && query.trim() ? <Text style={styles.empty}>Kullanıcı bulunamadı.</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  avatarPlaceholder: { backgroundColor: '#2e7d32', justifyContent: 'center', alignItems: 'center' },
  avatarPlaceholderText: { color: '#fff', fontWeight: '700' },
  name: { fontSize: 16 },
  empty: { textAlign: 'center', color: '#888', marginTop: 32 },
});
