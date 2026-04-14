import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
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

  useLayoutEffect(() => {
    navigation.setOptions({ title: typeName });
  }, [navigation, typeName]);

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

  useLayoutEffect(() => {
    navigation.setOptions({
      title: typeName,
      headerRight: () => (
        <Pressable onPress={openOptionsMenu} style={styles.menuButton} hitSlop={10}>
          <Text style={styles.menuDots}>⋯</Text>
        </Pressable>
      ),
    });
  }, [navigation, typeName, openOptionsMenu]);

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
    backgroundColor: '#fff',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#0b6bcb',
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
  },
  menuButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  menuDots: {
    fontSize: 22,
    color: '#1f2937',
    letterSpacing: 1,
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
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  rowText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
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
