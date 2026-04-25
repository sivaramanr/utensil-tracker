import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import { loadItemGroupsWithInitialSync, refreshItemGroupsFromApi } from '../services/itemGroups';

export default function ItemGroupScreen({ navigation }) {
  const [itemGroups, setItemGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimerRef = useRef(null);

  const showFetchErrorToast = useCallback(() => {
    const message = 'Unable to fetch item groups. Please check your internet connection and try again.';

    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.LONG);
      return;
    }

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage('');
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    },
    []
  );

  const loadItemGroups = useCallback(async () => {
    setLoading(true);

    try {
      const localItemGroups = await loadItemGroupsWithInitialSync();
      setItemGroups(localItemGroups);
    } catch (error) {
      console.log('Load item groups error:', error);
      showFetchErrorToast();
      setItemGroups([]);
    } finally {
      setLoading(false);
    }
  }, [showFetchErrorToast]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      const updatedItemGroups = await refreshItemGroupsFromApi();
      setItemGroups(updatedItemGroups);
    } catch (error) {
      console.log('Refresh item groups error:', error);
      showFetchErrorToast();
    } finally {
      setRefreshing(false);
    }
  }, [showFetchErrorToast]);

  const openOptionsMenu = useCallback(() => {
    Alert.alert('Item Group Options', 'Choose an action', [
      {
        text: 'Refresh',
        onPress: () => {
          handleRefresh();
        },
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  }, [handleRefresh]);

  useEffect(() => {
    loadItemGroups();
  }, [loadItemGroups]);

  const renderItemGroup = ({ item }) => (
    <Pressable
      style={{ width: '100%' }}
      onPress={() =>
        navigation.navigate('UtensilTypes', {
          itemGroupId: item.id,
          itemGroupName: item.name,
        })
      }
    >
      <View style={styles.rowItem}>
        <View style={styles.rowItemGlow} />
        <Text style={styles.rowText}>{item.name}</Text>
        <View style={styles.chevronWrap}>
          <Ionicons name="chevron-forward" size={18} color="#475569" />
        </View>
      </View>
    </Pressable>
  );

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
              <Image source={require('../../../../assets/images/cookerp-small.png')} style={styles.heroLogo} resizeMode="contain" />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroEyebrow}>Master Data</Text>
              <Text style={styles.title}>Items</Text>
            </View>
          </View>
          <Pressable style={styles.actionButton} onPress={openOptionsMenu} hitSlop={10}>
            <Ionicons name="ellipsis-horizontal" size={18} color="#374151" />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={itemGroups}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderItemGroup}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No item groups available.</Text>}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}

      {!!toastMessage && (
        <View style={styles.toastContainer}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 34,
    backgroundColor: '#f4ecde',
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
  actionButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.7)',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 24,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8,
    backgroundColor: '#fffaf2',
    overflow: 'hidden',
  },
  rowItemGlow: {
    position: 'absolute',
    top: -18,
    right: -18,
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  rowText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },
  chevronWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: 24,
    textAlign: 'center',
    color: '#6b7280',
  },
  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 13,
    textAlign: 'center',
  },
});
