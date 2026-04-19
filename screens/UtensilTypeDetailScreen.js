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
import { loadItemGroupsByIdsWithInitialSync, refreshItemGroupsFromApi } from '../utils/itemGroups';
import { loadUtensilsWithInitialSync, refreshUtensilsFromApi } from '../utils/utensils';
import {
  loadUtensilTypeItemGroupsWithInitialSync,
  refreshUtensilTypesFromApi,
} from '../utils/utensilTypes';

const TABS = ['Utensils', 'Item Groups'];

export default function UtensilTypeDetailScreen({ route, navigation }) {
  const typeName = route?.params?.typeName ?? 'Utensil';
  const typeId = route?.params?.typeId;
  const [activeTab, setActiveTab] = useState(0);

  const [utensils, setUtensils] = useState([]);
  const [itemGroups, setItemGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimerRef = useRef(null);

  const showFetchErrorToast = useCallback(() => {
    const message = 'Unable to fetch utensil details. Please check your internet connection and try again.';

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

  const loadUtensils = useCallback(async () => {
    setLoading(true);

    try {
      const [localUtensils, localItemGroupMappings] = await Promise.all([
        loadUtensilsWithInitialSync(typeId),
        loadUtensilTypeItemGroupsWithInitialSync(typeId),
      ]);

      const localItemGroups = await loadItemGroupsByIdsWithInitialSync(
        localItemGroupMappings.map((mapping) => mapping.itemGroupId).filter(Boolean)
      );

      setUtensils(localUtensils);
      setItemGroups(localItemGroups);
    } catch (error) {
      console.log('Load utensils error:', error);
      showFetchErrorToast();
      setUtensils([]);
      setItemGroups([]);
    } finally {
      setLoading(false);
    }
  }, [typeId, showFetchErrorToast]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      const [updatedUtensils] = await Promise.all([
        refreshUtensilsFromApi(typeId),
        refreshUtensilTypesFromApi(),
        refreshItemGroupsFromApi(),
      ]);

      const refreshedItemGroupMappings = await loadUtensilTypeItemGroupsWithInitialSync(typeId);
      const refreshedItemGroups = await loadItemGroupsByIdsWithInitialSync(
        refreshedItemGroupMappings.map((mapping) => mapping.itemGroupId).filter(Boolean)
      );

      setUtensils(updatedUtensils);
      setItemGroups(refreshedItemGroups);
    } catch (error) {
      console.log('Refresh utensils error:', error);
      showFetchErrorToast();
    } finally {
      setRefreshing(false);
    }
  }, [typeId, showFetchErrorToast]);

  const openOptionsMenu = useCallback(() => {
    Alert.alert('Options', 'Choose an action', [
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
    loadUtensils();
  }, [loadUtensils]);

  const renderUtensilItem = ({ item }) => (
    <View style={styles.rowItem}>
      <Text style={styles.rowText}>{item.name}</Text>
    </View>
  );

  const renderItemGroupItem = ({ item }) => (
    <View style={styles.rowItem}>
      <Text style={styles.rowText}>{item.name}</Text>
    </View>
  );

  const renderUtensilsTab = () => {
    if (loading) {
      return (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" />
        </View>
      );
    }

    return (
      <FlatList
        data={utensils}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={renderUtensilItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.emptyText}>No utensils available.</Text>}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />
    );
  };

  const renderItemGroupsTab = () => {
    if (loading) {
      return (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" />
        </View>
      );
    }

    return (
      <FlatList
        data={itemGroups}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={renderItemGroupItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.emptyText}>No item groups available.</Text>}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />
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
              <Image source={require('../assets/images/cookerp-small.png')} style={styles.heroLogo} resizeMode="contain" />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroEyebrow}>Utensil Type</Text>
              <Text style={styles.heroTitle} numberOfLines={1}>{typeName}</Text>
            </View>
          </View>
          <Pressable style={styles.actionButton} onPress={openOptionsMenu} hitSlop={10}>
            <Ionicons name="ellipsis-horizontal" size={18} color="#374151" />
          </Pressable>
        </View>
      </View>
      <View style={styles.tabBar}>
        {TABS.map((tab, index) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === index && styles.tabActive]}
            onPress={() => setActiveTab(index)}
          >
            <Text style={[styles.tabText, activeTab === index && styles.tabTextActive]}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.tabContent}>
        {activeTab === 0 && renderUtensilsTab()}
        {activeTab === 1 && renderItemGroupsTab()}
      </View>

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
    backgroundColor: '#f4ecde',
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
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fffaf2',
    borderRadius: 28,
    padding: 18,
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
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
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
  tabBar: {
    marginHorizontal: 16,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 18,
    padding: 4,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 14,
  },
  tabActive: {
    backgroundColor: '#ffffff',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#0b6bcb',
    fontWeight: '600',
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  rowItem: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8,
    backgroundColor: '#fffaf2',
  },
  rowText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
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
