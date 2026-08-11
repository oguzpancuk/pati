import React, { useEffect, useState } from 'react';
import { Button, FlatList, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import type { Animal } from '../api/animals';

export default function UserProfileScreen() {
  const { user, logout } = useAuth();
  const [myAnimals, setMyAnimals] = useState<Animal[]>([]);

  useEffect(() => {
    apiClient.get<Animal[]>('/users/me/animals').then((res) => setMyAnimals(res.data));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{user?.name}</Text>
      <Text style={styles.meta}>{user?.email}</Text>

      <Text style={styles.sectionTitle}>Bakım Verdiğim Hayvanlar</Text>
      <FlatList
        data={myAnimals}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.animalRow}>
            <Text>{item.name ?? (item.species === 'cat' ? 'Kedi' : 'Köpek')}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.meta}>Henüz bir hayvana bakım vermiyorsunuz.</Text>}
      />

      <Button title="Çıkış Yap" onPress={logout} color="#c62828" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { color: '#555', marginTop: 4, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  animalRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
});
