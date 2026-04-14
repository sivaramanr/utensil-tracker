import { Ionicons } from '@expo/vector-icons';
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
import {
    loadUtensilTypesByItemGroupWithInitialSync,
    loadUtensilTypesWithInitialSync,
    refreshUtensilTypesByItemGroupFromApi,
    refreshUtensilTypesFromApi,
} from '../utils/utensilTypes';

export default function UtensilTypesScreen({ navigation, route }) {
  const [utensilTypes, setUtensilTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimerRef = useRef(null);
  const selectedItemGroupId = route?.params?.itemGroupId;
  const selectedItemGroupName = route?.params?.itemGroupName;

  const showFetchErrorToast = useCallback(() => {
    const message = 'Unable to fetch utensil types. Please check your internet connection and try again.';

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

  const loadUtensilTypes = useCallback(async () => {
    setLoading(true);

    try {
      const localUtensilTypes = selectedItemGroupId
        ? await loadUtensilTypesByItemGroupWithInitialSync(selectedItemGroupId)
        : await loadUtensilTypesWithInitialSync();
      setUtensilTypes(localUtensilTypes);
    } catch (error) {
      console.log('Load utensil types error:', error);
      showFetchErrorToast();
      setUtensilTypes([]);
    } finally {
      setLoading(false);
    }
  }, [selectedItemGroupId, showFetchErrorToast]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      const updatedUtensilTypes = selectedItemGroupId
        ? await refreshUtensilTypesByItemGroupFromApi(selectedItemGroupId)
        : await refreshUtensilTypesFromApi();
      setUtensilTypes(updatedUtensilTypes);
    } catch (error) {
      console.log('Refresh utensil types error:', error);
      showFetchErrorToast();
    } finally {
      setRefreshing(false);
    }
  }, [selectedItemGroupId, showFetchErrorToast]);

  const handleClearFilter = useCallback(() => {
    navigation.setParams({
      itemGroupId: undefined,
      itemGroupName: undefined,
    });
  }, [navigation]);

  const openOptionsMenu = useCallback(() => {
    const options = [
      {
        text: 'Refresh',
        onPress: () => {
          handleRefresh();
        },
      },
    ];

    if (selectedItemGroupId) {
      options.push({
        text: 'Clear Filter',
        onPress: () => {
          handleClearFilter();
        },
      });
    }

    options.push({
      text: 'Cancel',
      style: 'cancel',
    });

    Alert.alert('Utensil Type Options', 'Choose an action', options);
  }, [handleClearFilter, handleRefresh, selectedItemGroupId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: selectedItemGroupName ? 'Utensil Types' : 'Utensil Types',
      headerRight: () => (
        <Pressable onPress={openOptionsMenu} style={styles.menuButton} hitSlop={10}>
          <Ionicons name="ellipsis-vertical" size={22} color="#1f2937" />
        </Pressable>
      ),
    });
  }, [navigation, openOptionsMenu, selectedItemGroupName]);

  useEffect(() => {
    loadUtensilTypes();
  }, [loadUtensilTypes]);

  const renderUtensilTypeItem = ({ item }) => (
    <Pressable
      style={{ width: '100%' }}
      onPress={() => navigation.navigate('UtensilTypeDetail', { typeId: item.id, typeName: item.name })}
    >
      <View style={styles.rowItem}>
        <Text style={styles.rowText}>{item.name}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Utensil Types</Text>
      {!!selectedItemGroupName && (
        <View style={styles.filterRow}>
          <Text style={styles.subtitle}>{selectedItemGroupName}</Text>
          <Pressable onPress={handleClearFilter} hitSlop={8}>
            <Text style={styles.clearFilterText}>Clear filter</Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={utensilTypes}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderUtensilTypeItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No utensil types available.</Text>}
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
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  clearFilterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0b6bcb',
  },
  menuButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
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
