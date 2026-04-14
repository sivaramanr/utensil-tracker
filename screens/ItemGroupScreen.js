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
import { loadItemGroupsWithInitialSync, refreshItemGroupsFromApi } from '../utils/itemGroups';

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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={openOptionsMenu} style={styles.menuButton} hitSlop={10}>
          <Ionicons name="ellipsis-vertical" size={22} color="#1f2937" />
        </Pressable>
      ),
    });
  }, [navigation, openOptionsMenu]);

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
        <Text style={styles.rowText}>{item.name}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Item Groups</Text>

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
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
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