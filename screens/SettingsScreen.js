import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { clearAppCache } from '../utils/cache';

export default function SettingsScreen({ navigation }) {
  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will delete all cached data (movements, items, sessions) but keep Utensil Types, Item Groups, and authentication details. This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAppCache();
              Alert.alert('Success', 'Cache cleared successfully.');
            } catch (error) {
              console.log('Clear cache error:', error);
              Alert.alert('Error', 'Failed to clear cache. Please try again.');
            }
          },
        },
      ]
    );
  };
  return (
    <View style={styles.container}>
      <Pressable style={styles.card} onPress={() => navigation.navigate('UtensilTypes')}>
        <View style={styles.iconWrap}>
          <Ionicons name="restaurant-outline" size={28} color="#374151" />
        </View>

        <View style={styles.contentWrap}>
          <Text style={styles.title}>Utensil Types</Text>
          <Text style={styles.subtitle}>Drum, Can & Hundi</Text>
        </View>
      </Pressable>

      <Pressable style={styles.card} onPress={() => navigation.navigate('ItemGroups')}>
        <View style={styles.iconWrap}>
          <Ionicons name="fast-food-outline" size={28} color="#374151" />
        </View>

        <View style={styles.contentWrap}>
          <Text style={styles.title}>Item Group</Text>
          <Text style={styles.subtitle}>Tiffin, Chutney & Indian Bread</Text>
        </View>
      </Pressable>

      <Pressable style={[styles.card, styles.cardDanger]} onPress={handleClearCache}>
        <View style={styles.iconWrap}>
          <Ionicons name="trash-outline" size={28} color="#dc2626" />
        </View>

        <View style={styles.contentWrap}>
          <Text style={[styles.title, styles.titleDanger]}>Clear Cache</Text>
          <Text style={styles.subtitle}>Remove movements, items & sessions</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  cardDanger: {
    backgroundColor: '#fef2f2',
    marginTop: 8,
  },
  iconWrap: {
    width: '20%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentWrap: {
    width: '80%',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  titleDanger: {
    color: '#dc2626',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#6b7280',
  },
});