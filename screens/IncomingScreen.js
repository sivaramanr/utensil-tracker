import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { getSessionCustomerItems } from '../utils/customers';
import { formatIsoDateForDisplay } from '../utils/date';

export default function IncomingScreen({ route }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const customerName = route?.params?.customerName;
  const customerId = route?.params?.customerId;
  const selectedDate = route?.params?.selectedDate;
  const sessionId = route?.params?.sessionId;
  const sessionName = route?.params?.sessionName;
  const title = customerName || 'Customer';
  const subtitle = [formatIsoDateForDisplay(selectedDate), sessionName].filter(Boolean).join(' | ');

  const formatQuantity = useCallback((value) => {
    const numericValue = Number(value ?? 0);

    if (!Number.isFinite(numericValue)) {
      return '0';
    }

    const roundedValue = Math.round(numericValue * 100) / 100;

    if (Number.isInteger(roundedValue)) {
      return String(roundedValue);
    }

    return roundedValue.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);

    try {
      const storedItems = await getSessionCustomerItems({
        orderDate: selectedDate,
        sessionId,
        customerId,
      });
      setItems(storedItems);
    } catch (error) {
      console.log('Load incoming items error:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [customerId, selectedDate, sessionId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const renderItem = ({ item }) => (
    <View style={styles.itemCard}>
      <Text style={styles.itemName}>{item.name}</Text>
      <Text style={styles.itemMeta}>{`Qty: ${formatQuantity(item.quantity)}${item.uomName ? ` ${item.uomName}` : ''}`}</Text>
      {!!item.comboNamesLabel && <Text style={styles.itemMeta}>{item.comboNamesLabel}</Text>}
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="small" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No items available.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    backgroundColor: '#fff',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    marginBottom: 12,
  },
  loaderWrap: {
    paddingTop: 8,
  },
  listContent: {
    width: '100%',
    paddingBottom: 16,
  },
  itemCard: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  itemMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
  },
});
