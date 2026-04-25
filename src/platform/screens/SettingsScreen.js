import { Ionicons } from '@expo/vector-icons';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { clearAppCache } from '../cache';

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
      <View style={styles.backgroundBlobTop} />
      <View style={styles.backgroundBlobBottom} />

      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color="#374151" />
          </Pressable>
          <View style={styles.heroBrandWrap}>
            <View style={styles.heroLogoCard}>
              <Image
                source={require('../../../assets/images/cookerp-small.png')}
                style={styles.heroLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroEyebrow}>Workspace</Text>
              <Text style={styles.heroTitle}>Settings</Text>
            </View>
          </View>
        </View>
      </View>

      <Pressable style={styles.card} onPress={() => navigation.navigate('UtensilTypes')}>
        <View style={styles.cardGlow} />
        <View style={[styles.iconWrap, styles.iconWrapBlue]}>
          <Ionicons name="restaurant-outline" size={24} color="#fff" />
        </View>

        <View style={styles.contentWrap}>
          <Text style={styles.title}>Utensil Types</Text>
          <Text style={styles.subtitle}>Drum, Can & Hundi</Text>
        </View>
        <View style={styles.chevronWrap}>
          <Ionicons name="chevron-forward" size={18} color="#475569" />
        </View>
      </Pressable>

      <Pressable style={styles.card} onPress={() => navigation.navigate('ItemGroups')}>
        <View style={styles.cardGlow} />
        <View style={[styles.iconWrap, styles.iconWrapAmber]}>
          <Ionicons name="fast-food-outline" size={24} color="#fff" />
        </View>

        <View style={styles.contentWrap}>
          <Text style={styles.title}>Item Group</Text>
          <Text style={styles.subtitle}>Tiffin, Chutney & Indian Bread</Text>
        </View>
        <View style={styles.chevronWrap}>
          <Ionicons name="chevron-forward" size={18} color="#475569" />
        </View>
      </Pressable>

      <Pressable style={[styles.card, styles.cardDanger]} onPress={handleClearCache}>
        <View style={styles.cardGlow} />
        <View style={[styles.iconWrap, styles.iconWrapDanger]}>
          <Ionicons name="trash-outline" size={24} color="#fff" />
        </View>

        <View style={styles.contentWrap}>
          <Text style={[styles.title, styles.titleDanger]}>Clear Cache</Text>
          <Text style={styles.subtitle}>Remove movements, items & sessions</Text>
        </View>
        <View style={styles.chevronWrap}>
          <Ionicons name="chevron-forward" size={18} color="#475569" />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4ecde',
    padding: 16,
    paddingTop: 34,
  },
  backgroundBlobTop: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#f59e0b',
    opacity: 0.12,
  },
  backgroundBlobBottom: {
    position: 'absolute',
    bottom: 120,
    left: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#0f766e',
    opacity: 0.08,
  },
  heroCard: {
    backgroundColor: '#fffaf2',
    borderRadius: 28,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(180, 83, 9, 0.10)',
    shadowColor: '#7c2d12',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.7)',
  },
  heroBrandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  heroLogoCard: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLogo: {
    width: 32,
    height: 32,
  },
  heroTextWrap: {
    flex: 1,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#b45309',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffaf2',
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  cardDanger: {
    backgroundColor: '#fff1f2',
    marginTop: 8,
  },
  cardGlow: {
    position: 'absolute',
    top: -18,
    right: -18,
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconWrapBlue: {
    backgroundColor: '#3b82f6',
  },
  iconWrapAmber: {
    backgroundColor: '#f59e0b',
  },
  iconWrapDanger: {
    backgroundColor: '#dc2626',
  },
  contentWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  titleDanger: {
    color: '#dc2626',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6b7280',
  },
  chevronWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
});
